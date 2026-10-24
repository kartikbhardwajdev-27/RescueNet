// "Suggested priority": a few plain keyword rules that read a description and
// suggest how serious it sounds. Nothing here learns, guesses or phones home:
// it is a list of words and a sum. It runs in the browser (so it works offline)
// and again on the server, which is the copy that gets stored.
//
// ---------------------------------------------------------------------------
// THE KEYWORDS. Review and edit this table; nothing else needs to change.
//
// Each group has a weight. When any word of a group appears in the description
// the group counts ONCE (its weight is added to the score and the word that
// matched is shown as the reason). Words are matched whole and in any case, so
// "fire" does not match "fireworks". A phrase must appear in that order.
// A word that comes right after "no", "not", "nobody", "without" (or just before
// "nahi") does not count: "no fire here" is not a fire. Words that already
// contain such a negation ("no water", "paani nahi") are matched as written.
//
// Scores add up (maximum 100):   70 or more  -> critical
//                                35 or more  -> high
//                                15 or more  -> medium
//                                1 or more   -> low
//                                0           -> no suggestion
// ---------------------------------------------------------------------------

export const KEYWORD_GROUPS = [
  // Life-threatening now (70 = critical on its own).
  { weight: 70, words: ["unconscious", "not breathing", "stopped breathing", "cant breathe", "can't breathe", "cannot breathe", "no pulse", "heart attack", "cardiac arrest", "behosh", "बेहोश"] },
  { weight: 70, words: ["drowning", "drowned", "doob raha", "doob rahi", "doob rahe"] },
  { weight: 70, words: ["heavy bleeding", "severe bleeding", "bleeding heavily", "bleeding a lot", "lot of blood", "bahut khoon"] },

  // Serious (35 to 45 = high on its own).
  { weight: 45, words: ["trapped", "buried", "under debris", "under rubble", "cant get out", "can't get out", "cannot get out"] },
  { weight: 45, words: ["collapse", "collapsed", "collapsing", "caved in", "gir gaya", "gir gayi", "gir gaye"] },
  { weight: 45, words: ["explosion", "exploded", "blast"] },
  { weight: 45, words: ["washed away", "swept away", "bah gaya", "bah gayi", "bah gaye"] },
  { weight: 45, words: ["chest pain"] },
  { weight: 40, words: ["bleeding", "bleed", "bleeds", "blood", "khoon", "खून"] },
  { weight: 40, words: ["bachao", "bachaao", "save us", "save me", "बचाओ"] },
  { weight: 35, words: ["stuck"] },
  { weight: 35, words: ["phans", "phas", "phansa", "phanse", "फंस", "फंसा", "फंसे", "फंसी", "फँस", "फँसा", "फँसे", "फँसी"] },
  { weight: 35, words: ["fire", "flames", "burning", "aag", "आग"] },
  { weight: 35, words: ["gas", "gas leak", "gas leaking", "lpg"] },
  { weight: 35, words: ["electrocuted", "electric shock", "live wire", "exposed wire"] },

  // Worth attention (20 to 30 = medium on its own).
  { weight: 30, words: ["injured", "injury", "wounded", "fracture", "broken leg", "broken bone", "ghayal", "zakhmi", "chot", "घायल"] },
  { weight: 25, words: ["oxygen", "insulin", "dialysis", "asthma", "seizure"] },
  { weight: 25, words: ["smoke", "dhuan", "dhuaan"] },
  { weight: 20, words: ["pregnant", "pregnancy", "labour pain", "labor pain", "garbhwati"] },
  { weight: 20, words: ["flooded", "flooding", "flood water", "water rising", "rising water", "baadh", "बाढ़"] },

  // People who are harder to move or less able to wait (15 each).
  { weight: 15, words: ["child", "children", "kid", "kids", "baby", "infant", "bachcha", "bachche", "bacche", "baccha"] },
  { weight: 15, words: ["elderly", "old man", "old woman", "senior citizen", "wheelchair", "bedridden", "disabled", "buzurg", "bujurg"] },
  { weight: 15, words: ["no water", "no drinking water", "without water", "paani nahi", "pani nahi", "no food", "without food", "khana nahi"] },

  // Disruption, no immediate danger (10 = low).
  { weight: 10, words: ["power cut", "power outage", "no electricity", "waterlogging", "waterlogged", "road blocked", "blocked road", "tree fell", "tree fallen"] },
];

export const SEVERITY_THRESHOLDS = [
  { min: 70, severity: "critical" },
  { min: 35, severity: "high" },
  { min: 15, severity: "medium" },
  { min: 1, severity: "low" },
];

export const MAX_SCORE = 100;
export const MAX_REASONS = 5;

// Used to order incidents when GET /api/incidents is asked for sort=priority
// (see priorityOf below). The reporter's own severity counts, the keyword score
// adds to it, and an SOS alert goes first.
export const PRIORITY_SEVERITY_WEIGHT = { low: 0, medium: 25, high: 50, critical: 75 };
export const SOS_PRIORITY_BONUS = 50;

// ---------------------------------------------------------------------------
// The rest is the machinery. You do not need to read it to review the keywords.
// ---------------------------------------------------------------------------

const NEGATORS = new Set(["no", "not", "nobody", "without", "never", "none", "nahi", "nahin", "nhi"]);
// In Hindi and Hinglish the "not" comes after: "aag nahi lagi".
const NEGATORS_AFTER = new Set(["nahi", "nahin", "nhi"]);
const NEGATION_WINDOW_BEFORE = 3; // words
const NEGATION_WINDOW_AFTER = 2;
const MAX_SCANNED_LENGTH = 2000; // characters; reports are capped well below this

const normalize = (text) => text.normalize("NFC").toLowerCase().replace(/[‘’]/g, "'");
const escapeRegExp = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const WORD = /[\p{L}\p{M}\p{N}']+/gu;
const wordsOf = (text) => text.match(WORD) ?? [];

// Whole-word match that also works for Hindi script (\b only knows ASCII).
const compile = (word) =>
  new RegExp(
    `(?<![\\p{L}\\p{M}\\p{N}_])${escapeRegExp(normalize(word)).replace(/\s+/g, "\\s+")}(?![\\p{L}\\p{M}\\p{N}_])`,
    "gu",
  );

// Longest first, so "heavy bleeding" is read before "bleeding" can claim half of it.
const KEYWORDS = KEYWORD_GROUPS.flatMap((group, groupIndex) =>
  group.words.map((word) => ({
    group: groupIndex,
    weight: group.weight,
    word,
    regex: compile(word),
    hasOwnNegation: wordsOf(normalize(word)).some((w) => NEGATORS.has(w)),
  })),
).sort((a, b) => b.word.length - a.word.length);

// "No" only reaches a few words, and never across a full stop, comma or line
// break: in "No water. A child is stuck" the child still counts.
const CLAUSE_BREAK = /[.!?,;:\n\u0964|]/u;

function isNegated(text, start, end) {
  const clauseBefore = text.slice(0, start).split(CLAUSE_BREAK).pop();
  if (wordsOf(clauseBefore).slice(-NEGATION_WINDOW_BEFORE).some((w) => NEGATORS.has(w))) return true;
  const clauseAfter = text.slice(end).split(CLAUSE_BREAK)[0];
  return wordsOf(clauseAfter).slice(0, NEGATION_WINDOW_AFTER).some((w) => NEGATORS_AFTER.has(w));
}

// The suggested severity for a score, or null when there is nothing to suggest.
export function severityFromScore(score) {
  const match = SEVERITY_THRESHOLDS.find(({ min }) => score >= min);
  return match ? match.severity : null;
}

// description -> { score, suggestedSeverity, reasons }
//   score              0 to 100
//   suggestedSeverity  "low" | "medium" | "high" | "critical", or null for 0
//   reasons            the keywords that counted, most weighty first (at most 5),
//                      written as they appear in the table above
export function scoreDescription(description) {
  if (typeof description !== "string" || description.trim() === "") {
    return { score: 0, suggestedSeverity: null, reasons: [] };
  }

  let text = normalize(description).slice(0, MAX_SCANNED_LENGTH);
  const found = new Map(); // group index -> { word, weight, at }

  for (const keyword of KEYWORDS) {
    keyword.regex.lastIndex = 0;
    let match;
    while ((match = keyword.regex.exec(text))) {
      const start = match.index;
      const end = start + match[0].length;
      if (!keyword.hasOwnNegation && isNegated(text, start, end)) continue;
      // A group counts once; the reason shown is the word that comes first in the text.
      const earlier = found.get(keyword.group);
      if (!earlier || start < earlier.at) {
        found.set(keyword.group, { word: keyword.word, weight: keyword.weight, at: start });
      }
      // Blank the words out so a shorter keyword cannot count the same text again.
      text = `${text.slice(0, start)}${" ".repeat(end - start)}${text.slice(end)}`;
      break;
    }
  }

  const hits = [...found.values()].sort((a, b) => b.weight - a.weight || a.at - b.at);
  const score = Math.min(
    MAX_SCORE,
    hits.reduce((sum, hit) => sum + hit.weight, 0),
  );
  return {
    score,
    suggestedSeverity: severityFromScore(score),
    reasons: hits.slice(0, MAX_REASONS).map((hit) => hit.word),
  };
}

// How much attention an incident needs, for sort=priority: the reporter's
// severity, plus the stored keyword score, plus a bonus for an SOS alert.
// (The route computes the same number inside MongoDB; this copy is what the
// checks compare it against.)
export function priorityOf({ severity, triage, isSos }) {
  return (PRIORITY_SEVERITY_WEIGHT[severity] ?? 0) + (triage?.score ?? 0) + (isSos === true ? SOS_PRIORITY_BONUS : 0);
}
