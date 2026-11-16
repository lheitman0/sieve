import { DEFAULT_CONFIG } from "../defaults.js";
import type {
  DropReason,
  FeedItem,
  MemoryLookup,
  MemoryStore,
  NoveltyLookup,
  ResolvedVerdict,
  SeedSets,
  SieveConfig,
  TierDecision,
} from "../types.js";
import { normalizeHandle } from "./dehype.js";
import { gradeItemsBatch } from "./llm.js";
import { isStructuralSlop } from "./slop-cadence.js";
import { isClickbaitTitle, isShortMediaOrQuote, isViralBait, matchMutedTopic, type MutedTopic } from "./topics.js";

const COMMENT_BAIT_RE =
  /\bcomment\s+["'“”]?[a-z0-9_-]{2,20}["'“”]?\s+(and\s+i'?ll|to\s+get|for\s+the|for\s+my)\s+(dm|send|link|free|guide|template)\b/i;

const CRYPTO_CASINO_SPAM_RE =
  /\b(use\s+code\s+\w+\s+on\s+stake|100x\s+memecoin|telegram\s+pump\s+group|free\s+airdrop\s+link\s+in\s+bio)\b/i;

const SHORT_DRAMA_RE =
  /(?:#(?:reelshort|dramabox|shortdrama|shortdramas|pinedrama|shortmax|minidrama)\b|\/shortdrama\/episode\/|\b(?:part|ep(?:isode)?)\s*\d+\s*[|:-].*\b(?:billionaire|ceo|heiress|secretly\s+marries|alpha\s+wolf|werewolf|mistress)\b)/i;

const ATTENTION_TRAP_RE =
  /(?:🚨+\s*(?:breaking|just\s+in|huge|urgent)\b.*(?:\bkilled\b|\bover\s+for\b|\binsane\b|\bforever\b|🧵)|\b\d+\s+(?:ai\s+)?(?:websites|tools|prompts|extensions|repos)\s+that\s+feel\s+illegal\s+to\s+know\b|\bbookmark\s+this\s+before\s+it(?:'s|\s+is|\s+gets)\s+deleted\b|\bwrong\s+answers\s+only\b|#(?:redditstories|aita)\b.*#(?:minecraft|subwaysurfers|satisfying)\b)/i;

const GOSSIP_DOMAIN_RE =
  /\b(?:celebrity|reality\s*tv|k-?pop\s*stan|tabloid|love\s*island|kardashian)\b/i;

const YT_URL_ID_RE =
  /(?:youtu\.be\/|youtube\.com\/(?:watch\?(?:[^\s#"'<>]*&)?v=|embed\/|v\/))([A-Za-z0-9_-]{11})/gi;

export function extractYouTubeIdsFromText(text: string): string[] {
  if (!text) return [];
  const found = new Set<string>();
  let match: RegExpExecArray | null;
  YT_URL_ID_RE.lastIndex = 0;
  while ((match = YT_URL_ID_RE.exec(text)) !== null) {
    if (match[1]) found.add(match[1]);
  }
  return [...found];
}

export function creatorKeysFor(item: FeedItem): string[] {
  const keys: string[] = [];
  const byId = normalizeHandle(item.creatorId);
  const byHandle = normalizeHandle(item.creatorHandle);
  if (byId) keys.push(byId);
  if (byHandle && byHandle !== byId) keys.push(byHandle);
  return keys;
}

const KEEP: TierDecision = { verdict: "keep" };
const UNCERTAIN: TierDecision = { verdict: "uncertain" };

function drop(reason: DropReason): TierDecision {
  return { verdict: "drop", reason };
}

const TEXT_PATTERNS: ReadonlyArray<readonly [RegExp, DropReason]> = [
  [COMMENT_BAIT_RE, "comment-bait"],
  [CRYPTO_CASINO_SPAM_RE, "crypto-spam"],
  [SHORT_DRAMA_RE, "short-drama"],
  [ATTENTION_TRAP_RE, "attention-trap"],
  [GOSSIP_DOMAIN_RE, "gossip"],
];

/**
 * Topic and bait mutes apply to algorithmic feeds only: X For You, YouTube home and up-next.
 * Pinned topic tabs, lists, Explore, search and channel pages are feeds you opened on purpose.
 */
function mutedTopicsFor(item: FeedItem, config: SieveConfig): Set<MutedTopic> | undefined {
  const settings =
    item.platform === "x" && item.surface === "home"
      ? config.x
      : item.platform === "youtube" && (item.surface === "home" || item.surface === "watch_next")
        ? config.youtube
        : undefined;
  if (!settings) return undefined;
  const muted = new Set<MutedTopic>();
  if (settings.mutePolitics) muted.add("politics");
  if (settings.muteSports) muted.add("sports");
  if (settings.mutePopCulture) muted.add("pop-culture");
  return muted;
}

export function evaluateLocalTiers(
  item: FeedItem,
  config: SieveConfig,
  seeds: SeedSets,
  memory: MemoryLookup,
  novelty?: NoveltyLookup,
): TierDecision {
  if (item.isSponsored) return drop("sponsored");

  const keys = creatorKeysFor(item);
  if (config.blockHandles.length > 0) {
    const blocked = new Set(config.blockHandles.map((h) => normalizeHandle(h)).filter(Boolean));
    if (keys.some((k) => blocked.has(k))) return drop("blocked");
  }

  if (config.allowHandles.length > 0) {
    const allowed = new Set(config.allowHandles.map((h) => normalizeHandle(h)).filter(Boolean));
    if (keys.some((k) => allowed.has(k))) return KEEP;
  }

  const followed = item.isFollowed === true || keys.some((k) => seeds.personalFollows.has(k));
  if (config.passFollowed && followed) return KEEP;

  const muted = followed ? undefined : mutedTopicsFor(item, config);
  if (muted) {
    const author = { handle: item.creatorHandle, profile: item.creatorProfile };
    const topic =
      muted.size === 0
        ? undefined
        : item.platform === "x"
          ? matchMutedTopic(`${item.titleOrText} ${item.secondaryText ?? ""}`, author, muted, {
              accountAlone: isShortMediaOrQuote(item.titleOrText, item.secondaryText),
              broad: false,
            })
          : matchMutedTopic(item.titleOrText, author, muted, { accountAlone: true, broad: true });
    if (topic) return drop(topic);
    // Creators you liked: their style is trusted, but topics you muted still apply.
    if (keys.some((k) => seeds.personalAllow.has(k))) return KEEP;
    if (item.platform === "x") {
      if (config.x.muteViralBait && isViralBait(item.titleOrText, item.secondaryText, item.metrics?.likes)) {
        return drop("viral-bait");
      }
    } else if (config.youtube.muteClickbait && isClickbaitTitle(item.titleOrText)) {
      return drop("clickbait");
    }
  }

  if (item.platform === "youtube" && seeds.hnVideos.has(item.id)) return KEEP;
  if (keys.some((k) => seeds.hnChannels.has(k))) return KEEP;

  const ytIds = item.linkedYoutubeIds ?? extractYouTubeIdsFromText(item.titleOrText);
  if (ytIds.some((vid) => seeds.hnVideos.has(vid))) return KEEP;

  if (keys.some((k) => seeds.slopChannels.has(k))) return drop("slop-list");

  const fullText = `${item.titleOrText} ${item.secondaryText ?? ""}`;
  for (const [pattern, reason] of TEXT_PATTERNS) {
    if (pattern.test(fullText)) return drop(reason);
  }

  if (!followed) {
    if (item.platform === "x" && config.x.slopCadenceFilter) {
      if (isStructuralSlop(item.titleOrText, {}, 65)) return drop("slop-cadence");
    } else if (item.platform !== "youtube") {
      if (isStructuralSlop(item.titleOrText, {}, 74)) return drop("slop-cadence");
    }

    if (config.noveltyFilter && novelty?.isRedundantRehash(item.titleOrText)) {
      return drop("rehash");
    }
  }

  const cachedVerdict = memory.getItemVerdict(item.platform, item.id);
  if (cachedVerdict) return cachedVerdict === "drop" ? drop("remembered") : KEEP;

  for (const key of keys) {
    const learned = memory.getCreatorVerdict(item.platform, key);
    if (learned) return learned === "drop" ? drop("learned-creator") : KEEP;
  }

  if (item.platform === "x" && !followed && item.metrics) {
    const likes = item.metrics.likes ?? 0;
    const replies = item.metrics.replies ?? 0;
    const quotes = item.metrics.quotes ?? 0;
    if (replies >= 40 && (replies > likes * 1.4 || quotes > likes * 1.1)) {
      return drop("ratio");
    }
  }

  return UNCERTAIN;
}

export async function runSieveOnBatch(
  items: FeedItem[],
  config: SieveConfig,
  seeds: SeedSets,
  memory: MemoryStore,
  fetchImpl: typeof fetch = fetch,
  novelty?: NoveltyLookup,
): Promise<Map<string, DropReason>> {
  const dropped = new Map<string, DropReason>();
  const uncertain: FeedItem[] = [];

  for (const item of items) {
    const decision = evaluateLocalTiers(item, config, seeds, memory, novelty);
    if (decision.verdict === "drop") {
      dropped.set(item.id, decision.reason);
    } else if (decision.verdict === "uncertain") {
      uncertain.push(item);
    }
  }

  if (uncertain.length === 0 || config.grader.mode === "off") {
    return dropped;
  }

  const holdMs = Math.max(50, config.grader.streamHoldMs || DEFAULT_CONFIG.grader.streamHoldMs);
  const gradingPromise = gradeItemsBatch(uncertain, config, fetchImpl)
    .then(async (llmDrops) => {
      for (const item of uncertain) {
        const verdict: ResolvedVerdict = llmDrops.has(item.id) ? "drop" : "keep";
        await memory.recordVerdict(item, verdict);
      }
      return llmDrops;
    })
    .catch(() => new Set<string>());

  let timer: ReturnType<typeof setTimeout> | undefined;
  const timedOut = Symbol("timeout");
  const outcome = await Promise.race([
    gradingPromise,
    new Promise<typeof timedOut>((resolve) => {
      timer = setTimeout(() => resolve(timedOut), holdMs);
    }),
  ]);
  if (timer) clearTimeout(timer);

  if (outcome !== timedOut) {
    for (const id of outcome) dropped.set(id, "llm");
  }

  return dropped;
}
