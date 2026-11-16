import { describe, expect, it } from "vitest";
import { DEFAULT_CONFIG } from "../src/defaults.js";
import type { FeedItem, MemoryLookup, SeedSets, SieveConfig } from "../src/types.js";
import { evaluateLocalTiers, extractYouTubeIdsFromText } from "../src/core/sieve.js";

function makeSeeds(overrides: Partial<SeedSets> = {}): SeedSets {
  return {
    hnVideos: overrides.hnVideos ?? new Set(["hnVid000001"]),
    hnChannels: overrides.hnChannels ?? new Set(["3blue1brown", "uc_hn_trusted"]),
    slopChannels: overrides.slopChannels ?? new Set(["aislopfarm99", "uc_slop_1"]),
    personalAllow: overrides.personalAllow ?? new Set(),
  };
}

const emptyMemory: MemoryLookup = {
  getItemVerdict: () => undefined,
  getCreatorVerdict: () => undefined,
};

describe("evaluateLocalTiers", () => {
  it("drops sponsored items immediately even if followed", () => {
    const item: FeedItem = {
      platform: "x",
      id: "t1",
      creatorHandle: "@friend",
      isFollowed: true,
      isSponsored: true,
      surface: "timeline",
      titleOrText: "Buy our enterprise SaaS",
    };
    expect(evaluateLocalTiers(item, DEFAULT_CONFIG, makeSeeds(), emptyMemory).verdict).toBe("drop");
  });

  it("keeps followed creators when passFollowed is enabled", () => {
    const item: FeedItem = {
      platform: "instagram",
      id: "ig1",
      creatorHandle: "weird_ceramic_artist",
      isFollowed: true,
      surface: "reels",
      titleOrText: "glaze test #41",
    };
    expect(evaluateLocalTiers(item, DEFAULT_CONFIG, makeSeeds(), emptyMemory).verdict).toBe("keep");
  });

  it("keeps HackerTube canonical video IDs and HN-trusted channels", () => {
    const byVid: FeedItem = {
      platform: "youtube",
      id: "hnVid000001",
      creatorHandle: "unknown_uploader",
      surface: "home",
      titleOrText: "The Mother of All Demos",
    };
    const byChannel: FeedItem = {
      platform: "youtube",
      id: "brandNew2026",
      creatorHandle: "3Blue1Brown",
      surface: "home",
      titleOrText: "New visual proof",
    };
    expect(evaluateLocalTiers(byVid, DEFAULT_CONFIG, makeSeeds(), emptyMemory).verdict).toBe("keep");
    expect(evaluateLocalTiers(byChannel, DEFAULT_CONFIG, makeSeeds(), emptyMemory).verdict).toBe("keep");
  });

  it("drops known AiSList slop channels and explicit user blockHandles", () => {
    const slop: FeedItem = {
      platform: "youtube",
      id: "slopVid",
      creatorHandle: "@AiSlopFarm99",
      surface: "home",
      titleOrText: "Boring History For Sleep",
    };
    const config: SieveConfig = {
      ...DEFAULT_CONFIG,
      blockHandles: ["@annoying_grifter"],
    };
    const blocked: FeedItem = {
      platform: "x",
      id: "x99",
      creatorHandle: "annoying_grifter",
      surface: "timeline",
      titleOrText: "Here are 10 prompts to get rich",
    };
    expect(evaluateLocalTiers(slop, config, makeSeeds(), emptyMemory)).toEqual({
      verdict: "drop",
      reason: "slop-list",
    });
    expect(evaluateLocalTiers(blocked, config, makeSeeds(), emptyMemory)).toEqual({
      verdict: "drop",
      reason: "blocked",
    });
  });

  it("drops unfollowed X posts with extreme ragebait reply-to-like ratios", () => {
    const ragebait: FeedItem = {
      platform: "x",
      id: "rage1",
      creatorHandle: "hot_take_guy",
      isFollowed: false,
      surface: "timeline",
      titleOrText: "Anyone who cooks at home is wasting their life",
      metrics: { likes: 60, replies: 210, quotes: 95 },
    };
    expect(evaluateLocalTiers(ragebait, DEFAULT_CONFIG, makeSeeds(), emptyMemory).verdict).toBe("drop");
  });

  it("drops IG and TikTok comment-bait DM templates from unfollowed accounts", () => {
    const bait: FeedItem = {
      platform: "instagram",
      id: "reel_bait",
      creatorHandle: "growth_guru",
      isFollowed: false,
      surface: "reels",
      titleOrText: 'Comment "SYSTEM" and I\'ll DM you the Notion template!',
    };
    expect(evaluateLocalTiers(bait, DEFAULT_CONFIG, makeSeeds(), emptyMemory).verdict).toBe("drop");
  });

  it("uses cached item and promoted creator verdicts before marking uncertain", () => {
    const memory: MemoryLookup = {
      getItemVerdict: (_p, id) => (id === "cached_drop" ? "drop" : undefined),
      getCreatorVerdict: (_p, key) => (key === "niche_synth_maker" ? "keep" : undefined),
    };
    const cachedDrop: FeedItem = {
      platform: "youtube",
      id: "cached_drop",
      creatorHandle: "random",
      surface: "home",
      titleOrText: "Drama recap",
    };
    const learnedKeep: FeedItem = {
      platform: "instagram",
      id: "reel_77",
      creatorHandle: "@niche_synth_maker",
      surface: "reels",
      titleOrText: "hand-wired spring reverb tank",
    };
    const unseen: FeedItem = {
      platform: "instagram",
      id: "reel_88",
      creatorHandle: "@totally_new_person",
      surface: "reels",
      titleOrText: "kinetic brass sculpture test",
    };
    expect(evaluateLocalTiers(cachedDrop, DEFAULT_CONFIG, makeSeeds(), memory).verdict).toBe("drop");
    expect(evaluateLocalTiers(learnedKeep, DEFAULT_CONFIG, makeSeeds(), memory).verdict).toBe("keep");
    expect(evaluateLocalTiers(unseen, DEFAULT_CONFIG, makeSeeds(), memory).verdict).toBe("uncertain");
  });

  it("auto-passes non-YouTube posts that link to HackerTube videos or belong to HN-trusted handles", () => {
    expect(
      extractYouTubeIdsFromText("Must watch talk https://youtu.be/hnVid000001?t=42 and https://www.youtube.com/watch?v=abcDEF12345"),
    ).toEqual(["hnVid000001", "abcDEF12345"]);

    const tweetWithHnLink: FeedItem = {
      platform: "x",
      id: "tw_hn_1",
      creatorHandle: "random_reader",
      surface: "timeline",
      titleOrText: "Still the best talk ever https://youtu.be/hnVid000001",
      linkedYoutubeIds: ["hnVid000001"],
    };
    const igFromHnCreator: FeedItem = {
      platform: "instagram",
      id: "ig_3b1b",
      creatorHandle: "@3Blue1Brown",
      surface: "reels",
      titleOrText: "animation test",
    };

    expect(evaluateLocalTiers(tweetWithHnLink, DEFAULT_CONFIG, makeSeeds(), emptyMemory).verdict).toBe("keep");
    expect(evaluateLocalTiers(igFromHnCreator, DEFAULT_CONFIG, makeSeeds(), emptyMemory).verdict).toBe("keep");
  });

  it("drops siren-emoji fake breaking engagement bait, illegal-AI thread slop, and short-drama cliffhangers", () => {
    const sirenBait: FeedItem = {
      platform: "x",
      id: "siren_1",
      creatorHandle: "alpha_alerts",
      isFollowed: false,
      surface: "timeline",
      titleOrText: "🚨 BREAKING: INSANE NEW AI JUST KILLED SOFTWARE ENGINEERING FOREVER 🧵",
    };
    const illegalTools: FeedItem = {
      platform: "x",
      id: "thread_2",
      creatorHandle: "prompt_wizard",
      isFollowed: false,
      surface: "timeline",
      titleOrText: "10 AI websites that feel illegal to know (bookmark this before it gets deleted):",
    };
    const shortDrama: FeedItem = {
      platform: "tiktok",
      id: "drama_3",
      creatorHandle: "muffindrama_us",
      isFollowed: false,
      surface: "reels",
      titleOrText: "Part 12 | Billionaire CEO secretly marries cleaner #reelshort #shortdrama",
    };

    expect(evaluateLocalTiers(sirenBait, DEFAULT_CONFIG, makeSeeds(), emptyMemory).verdict).toBe("drop");
    expect(evaluateLocalTiers(illegalTools, DEFAULT_CONFIG, makeSeeds(), emptyMemory).verdict).toBe("drop");
    expect(evaluateLocalTiers(shortDrama, DEFAULT_CONFIG, makeSeeds(), emptyMemory).verdict).toBe("drop");
  });
});

describe("X topic mutes", () => {
  const post = (overrides: Partial<FeedItem>): FeedItem => ({
    platform: "x",
    id: "p1",
    creatorHandle: "someone",
    isFollowed: false,
    surface: "home",
    titleOrText: "",
    ...overrides,
  });
  const decide = (item: FeedItem, seeds = makeSeeds()) => evaluateLocalTiers(item, DEFAULT_CONFIG, seeds, emptyMemory);

  it("mutes short media posts from accounts whose bio or handle marks them as sports media", () => {
    const byBio = post({
      creatorHandle: "perf_clips",
      creatorProfile: "Daily football performances and content.",
      titleOrText: "JSN FALL DOWN ROUTE FOR A 71 YARD TD https://t.co/x",
      secondaryText: "[video]",
    });
    const byHandle = post({ creatorHandle: "MikeKennedyNFL", titleOrText: "What a way to lose it", secondaryText: "[video]" });
    expect(decide(byBio)).toEqual({ verdict: "drop", reason: "sports" });
    expect(decide(byHandle)).toEqual({ verdict: "drop", reason: "sports" });
  });

  it("does not mute on a topic word in the bio alone, on substrings inside handles, or on ambiguous words", () => {
    const nflInBio = post({
      creatorProfile: "multiplayer harness for work; prev computer vision for the NFL",
      titleOrText: "cloud agents are the way forward, but your laptop can't be always reachable",
    });
    const nbaInsideHandle = post({ creatorHandle: "thorstenball", titleOrText: "We have one meeting per week. Here's how we run it", secondaryText: "[photo]" });
    const wokeUp = post({ titleOrText: "Bad news for X, I woke up and found out about the 20 image limit. Stamps I created vol. 1", secondaryText: "[photo]" });
    expect(decide(nflInBio).verdict).toBe("uncertain");
    expect(decide(nbaInsideHandle).verdict).toBe("uncertain");
    expect(decide(wokeUp).verdict).toBe("uncertain");
  });

  it("never mutes followed accounts", () => {
    const followedTeam = post({ creatorHandle: "CycloneMBB", isFollowed: true, titleOrText: "Bully #Cyclones playoff dunk", secondaryText: "[video]" });
    expect(decide(followedTeam).verdict).toBe("keep");
  });

  it("lets liked authors skip the viral-bait filter but still applies topic mutes to them", () => {
    const seeds = makeSeeds({ personalAllow: new Set(["liked_author"]) });
    const bareVideo = post({ creatorHandle: "liked_author", titleOrText: "https://t.co/x", secondaryText: "[video]" });
    const politics = post({ creatorHandle: "liked_author", titleOrText: "Trump just signed another executive order" });
    expect(decide(bareVideo, seeds).verdict).toBe("keep");
    expect(decide(bareVideo).verdict).toBe("drop");
    expect(decide(politics, seeds)).toEqual({ verdict: "drop", reason: "politics" });
  });

  it("leaves pinned topic tabs and search alone", () => {
    const nbaClip = { creatorHandle: "LegionHoops", titleOrText: "MAXEY LOB TO LEBRON IN TRANSITION", secondaryText: "[video]" };
    expect(decide(post({ ...nbaClip, surface: "home" })).verdict).toBe("drop");
    expect(decide(post({ ...nbaClip, surface: "timeline" })).verdict).toBe("uncertain");
    expect(decide(post({ ...nbaClip, surface: "search" })).verdict).toBe("uncertain");
  });
});
