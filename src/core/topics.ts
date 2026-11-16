// Topic mutes. On X they are gentle: a post is muted when its own text (plus quoted
// context) is unambiguous, or when the author is clearly a topic account (bio,
// affiliation, or handle) AND the post gives at least a hint. A topic word in someone's
// bio alone never mutes them. YouTube uses the broad scope: extra terms (golf, late
// night, music videos, any politician) and a channel name alone is enough.

export type MutedTopic = "politics" | "sports" | "pop-culture";

interface TopicLexicon {
  /** One hit in the post mutes it. */
  strong: RegExp;
  /** This many distinct hits in the post mute it; one hit counts for topic accounts. */
  weak: RegExp;
  weakNeeded: number;
  /** Marks the author as a topic account when found in their bio/affiliation. */
  profile: RegExp;
  /** Marks the author as a topic account when found anywhere in their handle. */
  handle?: RegExp;
}

function terms(list: string[]): string {
  return list.map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/ /g, "\\s+")).join("|");
}

const wordRe = (list: string[], flags = "i") => new RegExp(`\\b(?:${terms(list)})\\b`, flags);

const SPORTS_LEAGUES = ["nfl", "nba", "mlb", "nhl", "mls", "wnba", "ncaa", "ufc", "pga tour", "liv golf", "espn"];

const LEXICONS: Record<MutedTopic, TopicLexicon> = {
  politics: {
    strong: wordRe([
      "trump", "biden", "kamala", "jd vance", "desantis", "newsom", "pelosi", "schumer", "mcconnell", "aoc",
      "mamdani", "rfk jr", "maga", "gop", "democrats", "republicans", "white house", "supreme court",
      "executive order", "impeach", "impeachment", "left-wing", "right-wing", "netanyahu", "zelensky", "putin",
      "hamas", "gaza", "tariffs", "senator", "congressman", "congresswoman", "midterms", "filibuster", "antifa",
      "leftists", "groyper", "groypers", "fascist", "fascism",
    ]),
    weak: wordRe(
      [
        "election", "elections", "voters", "voting", "ballot", "congress", "senate", "governor", "president",
        "administration", "partisan", "campaign", "protest", "protesters", "immigration", "deportation",
        "legislation", "regime", "democracy", "socialism", "communism", "liberals", "conservatives", "politician",
        "politicians", "political",
      ],
      "gi",
    ),
    weakNeeded: 2,
    profile: wordRe([
      "political commentator", "political analyst", "politics reporter", "conservative", "progressive", "maga",
      "patriot", "america first", "democrat", "republican", "senator", "congressman", "congresswoman",
    ]),
  },
  sports: {
    strong: wordRe([
      ...SPORTS_LEAGUES, "premier league", "champions league", "la liga", "serie a", "bundesliga", "fifa world cup",
      "super bowl", "stanley cup", "world series", "march madness", "final four", "grand prix", "formula 1",
      "touchdown", "home run", "hat-trick", "hat trick", "quarterback", "wide receiver", "point guard", "heisman",
      "free agency", "trade deadline", "box score", "first overall pick", "usmnt", "uswnt", "lebron", "kobe",
      "mahomes", "messi", "ronaldo", "ohtani", "wembanyama", "steph curry", "lakers", "celtics", "knicks",
      "sixers", "76ers", "nuggets", "timberwolves", "cavaliers", "blazers", "yankees", "dodgers", "red sox",
      "cubs", "cowboys", "49ers", "steelers", "packers", "ravens", "bengals", "broncos", "real madrid",
      "man city", "man united", "manchester united", "manchester city", "tottenham", "draftkings", "fanduel",
      "parlay", "sportscenter",
    ]),
    weak: wordRe(
      [
        "football", "basketball", "baseball", "hockey", "soccer", "game", "games", "season", "coach",
        "playoffs", "playoff", "roster", "draft", "league", "championship", "mvp", "stadium", "highlights",
        "scored", "goal", "goals", "assists", "rookie", "dunk", "pitcher", "inning", "matchday", "striker",
        "postgame", "pregame", "halftime", "overtime", "qb", "interception", "yard", "yards", "td",
        "locker room", "free agent", "national champion", "fans",
      ],
      "gi",
    ),
    weakNeeded: 3,
    profile: wordRe([
      ...SPORTS_LEAGUES, "sports", "football", "basketball", "baseball", "hockey", "soccer", "rugby", "hoops",
      "barstool", "pardon my take", "sportsbook", "fantasy football", "college football", "pxp", "play-by-play",
      "i record ball", "die hard", "49ers", "steelers", "seahawks", "falcons", "bears fan", "padres", "cyclones",
    ]),
    // Case-sensitive: leagues appear capitalised in handles (MikeKennedyNFL), while "nba" hides in "thorstenball".
    handle: /NFL|NBA|MLB|NHL|ESPN|[Bb]arstool|[Hh]oops|[Ss]ports|[Ff]ootball/,
  },
  "pop-culture": {
    strong: wordRe([
      "taylor swift", "kardashian", "kardashians", "kanye", "beyonce", "beyoncé", "rihanna", "drake",
      "bad bunny", "sabrina carpenter", "ariana grande", "selena gomez", "justin bieber", "travis kelce",
      "love island", "the bachelor", "real housewives", "met gala", "oscars", "grammys", "emmys",
      "golden globes", "red carpet", "box office", "celebrity", "celebrities", "celeb", "tmz", "k-pop", "kpop",
      "bts", "blackpink", "swifties", "stan twitter", "netflix series", "gta 6", "gta vi", "snl",
    ]),
    weak: wordRe(
      [
        "album", "tour", "concert", "dating", "breakup", "actor", "actress", "singer", "rapper", "movie",
        "trailer", "episode", "premiere", "finale", "award", "awards", "music video", "netflix", "hbo",
        "billboard", "chart", "paparazzi",
      ],
      "gi",
    ),
    weakNeeded: 2,
    profile: wordRe(["entertainment news", "celebrity news", "pop culture", "film news", "tv news", "saturday night live"]),
  },
};

/** Extra terms for the broad scope (YouTube). Text terms mute on one hit; profile terms mark the channel. */
const BROAD_EXTRAS: Record<MutedTopic, { strong: RegExp; profile: RegExp }> = {
  politics: {
    strong: wordRe([
      "the president", "white house correspondents", "russia-ukraine", "ukraine war", "prigozhin", "palestine",
      "israel", "obama", "clinton", "kennedy assassination", "rfk", "kushner", "sean duffy", "vivek",
    ]),
    profile: wordRe([
      "politics", "political", "news network", "fox news", "cnn", "msnbc", "the daily show", "last week tonight",
    ]),
  },
  sports: {
    strong: wordRe([
      "golf", "golfer", "golfers", "golfing", "pga", "the masters", "masters tournament", "the open",
      "dp world tour", "birdie", "under par", "tour pro", "stroke play", "match play", "short game", "pitch shot",
      "pitch shots", "tee shot", "hoopers", "college football", "college basketball", "full game highlights",
      "game highlights", "full game", "game-winners", "game winners", "postgame", "press conference", "nba cup",
      "rushing record", "every throw", "luka", "doncic", "jokic", "giannis", "stephen curry", "sports",
      "boxing", "hockey", "ronaldinho", "rucker park", "barstool",
    ]),
    profile: wordRe([
      ...SPORTS_LEAGUES, "golf", "sports", "sport", "hoops", "football", "basketball", "huskers", "the masters",
      "pga tour", "dp world tour", "the r&a", "golfer's journal", "fore play", "good good", "barstool",
      "cyclone fanatic", "nightcap", "throwback", "open ice", "march madness", "stephen curry", "jon gruden",
    ]),
  },
  "pop-culture": {
    strong: wordRe([
      "snl", "saturday night live", "weekend update", "tonight show", "late night", "last week tonight",
      "john oliver", "jimmy fallon", "jimmy kimmel", "colbert", "seth meyers", "conan", "official video",
      "official music video", "lyric video", "music video", "explicit video", "official audio", "visualizer",
      "official trailer", "tiny desk", "acoustic", "live at", "cover", "concert", "remastered",
    ]),
    profile: wordRe([
      "saturday night live", "snl", "tonight show", "late night", "last week tonight", "conan", "team coco",
      "npr music", "vevo", "records", "cinema supercuts", "hd videos", "brothers moving",
    ]),
  },
};

export interface TopicMatchOptions {
  /** The author's identity alone (bio/handle/channel name) is enough, without a hint in the text. */
  accountAlone: boolean;
  /** Also use BROAD_EXTRAS (YouTube). */
  broad: boolean;
}

const URL_OR_MENTION_RE = /https?:\/\/\S+|@\w+/g;
const MEDIA_TAG_RE = /\[(?:video|photo|gif)(?:\+\w+)*\]/;
const QUOTE_TAG_RE = /(?:^|\| )quoting @/;

function ownWordCount(text: string): number {
  return (text.replace(URL_OR_MENTION_RE, " ").match(/[\p{L}\p{N}']+/gu) ?? []).length;
}

/** X: a media or quote post with little text of its own, so its author's identity carries the meaning. */
export function isShortMediaOrQuote(ownText: string, secondaryText: string | undefined): boolean {
  const context = secondaryText ?? "";
  return (MEDIA_TAG_RE.test(context) || QUOTE_TAG_RE.test(context)) && ownWordCount(ownText) <= 20;
}

/**
 * `text` is what the post says (X: own text plus quoted/media context; YouTube: the title).
 * A topic account needs one weak hint in the text, unless `accountAlone` says its identity suffices.
 */
export function matchMutedTopic(
  text: string,
  author: { handle?: string; profile?: string },
  topics: ReadonlySet<MutedTopic>,
  options: TopicMatchOptions,
): MutedTopic | undefined {
  for (const topic of topics) {
    const lex = LEXICONS[topic];
    const extra = options.broad ? BROAD_EXTRAS[topic] : undefined;
    if (lex.strong.test(text) || extra?.strong.test(text) === true) return topic;
    const hits = new Set((text.match(lex.weak) ?? []).map((m) => m.toLowerCase().replace(/\s+/g, " "))).size;
    // The broad scope (YouTube) needs fewer weak hints: titles are short and rarely ambiguous.
    if (hits >= (options.broad ? Math.min(lex.weakNeeded, 2) : lex.weakNeeded)) return topic;
    const profile = author.profile;
    const topicAccount =
      (profile !== undefined && (lex.profile.test(profile) || extra?.profile.test(profile) === true)) ||
      (author.handle !== undefined && lex.handle?.test(author.handle) === true);
    if (topicAccount && (hits >= 1 || options.accountAlone)) return topic;
  }
  return undefined;
}

// Viral clips and meme reposts: media or quote posts whose own text is a reaction, not content.
// Mild markers (lmao, 😭) are common in genuine commentary, so they only count on media posts;
// a text-only quote needs a crude marker.
const MILD_REACTION_RE =
  /(?:[😭💀🤣😂😳🥶🤯😱]|\b(?:pov|lmao|lmfao|l+o+l{2,}|wait for it|watch till the end|caught (?:in 4k|on camera)|how is this real|bruh)\b)/iu;
const CRUDE_REACTION_RE = /\b(?:nigga|fucking|dawg)\b/i;
const HYPE_BAIT_RE = /\b(?:(?:are|is) so cooked|save (?:this )?rn|wtf this is crazy)\b/i;

export function isViralBait(ownText: string, secondaryText: string | undefined, likes: number | undefined): boolean {
  if (HYPE_BAIT_RE.test(ownText)) return true;
  const hasMedia = MEDIA_TAG_RE.test(secondaryText ?? "");
  const isQuote = QUOTE_TAG_RE.test(secondaryText ?? "");
  if (!hasMedia && !isQuote) return false;
  const words = ownWordCount(ownText);
  if (hasMedia && words <= 1) return true;
  if (words > 14) return false;
  const own = ownText.replace(URL_OR_MENTION_RE, " ");
  if (CRUDE_REACTION_RE.test(own)) return true;
  return hasMedia && (MILD_REACTION_RE.test(own) || (words <= 3 && (likes ?? 0) >= 20000));
}

// YouTube clickbait: shouty titles, manufactured stakes, reaction bait, ALL-CAPS hype words.
const CLICKBAIT_RE =
  /\b(?:gone wrong|you won'?t believe|(?:i|we) (?:tried|survived|spent)|last to (?:leave|stop)|\$\d[\d,]*(?:k)? (?:vs|challenge)|reacts? to|reaction|exposed|destroyed|insanity|shocking)\b|[!?]{2,}/i;
const CAPS_HYPE_RE =
  /\b(?:INSANE|UNSTOPPABLE|ACED|BROKE|DESTROYS?|EXPOSED|SHOCKING|CRAZY|IMPOSSIBLE|GENIUS|ATROCIOUS|EMBARRASSING|HILARIOUS|DISGUSTINGLY|UNBELIEVABLE|LEGENDARY)\b/;

export function isClickbaitTitle(title: string): boolean {
  const letters = title.replace(/[^A-Za-z]/g, "");
  const shouting = letters.length >= 12 && letters.replace(/[^A-Z]/g, "").length / letters.length >= 0.7;
  return shouting || CLICKBAIT_RE.test(title) || CAPS_HYPE_RE.test(title);
}
