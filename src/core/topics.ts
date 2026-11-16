// Gentle topic mutes for X. A post is muted when its own text (plus quoted context)
// is unambiguous, or when the author is clearly a topic account (bio, affiliation,
// or handle) AND the post itself gives at least a hint: a weak term, or media with
// little text of its own. A topic word in someone's bio alone never mutes them.

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
      ...SPORTS_LEAGUES, "premier league", "champions league", "la liga", "serie a", "bundesliga", "world cup",
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

const URL_OR_MENTION_RE = /https?:\/\/\S+|@\w+/g;
const MEDIA_TAG_RE = /\[(?:video|photo|gif)(?:\+\w+)*\]/;
const QUOTE_TAG_RE = /(?:^|\| )quoting @/;

function ownWordCount(text: string): number {
  return (text.replace(URL_OR_MENTION_RE, " ").match(/[\p{L}\p{N}']+/gu) ?? []).length;
}

export function matchMutedTopic(
  ownText: string,
  secondaryText: string | undefined,
  author: { handle?: string; profile?: string },
  topics: ReadonlySet<MutedTopic>,
): MutedTopic | undefined {
  const text = secondaryText ? `${ownText} ${secondaryText}` : ownText;
  const shortMediaOrQuote =
    (MEDIA_TAG_RE.test(secondaryText ?? "") || QUOTE_TAG_RE.test(secondaryText ?? "")) && ownWordCount(ownText) <= 20;
  for (const topic of topics) {
    const lex = LEXICONS[topic];
    if (lex.strong.test(text)) return topic;
    const hits = new Set((text.match(lex.weak) ?? []).map((m) => m.toLowerCase().replace(/\s+/g, " "))).size;
    if (hits >= lex.weakNeeded) return topic;
    const topicAccount =
      (author.profile !== undefined && lex.profile.test(author.profile)) ||
      (author.handle !== undefined && lex.handle?.test(author.handle) === true);
    if (topicAccount && (hits >= 1 || shortMediaOrQuote)) return topic;
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
