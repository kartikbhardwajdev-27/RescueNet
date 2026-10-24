// Unit-style checks for lib/triage.js (the keyword rules behind "Suggested
// priority"). No test framework needed:
//
//   npm run check:triage
//
// Exits with code 1 and prints every failure if any check fails.
import {
  KEYWORD_GROUPS,
  MAX_REASONS,
  MAX_SCORE,
  SEVERITY_THRESHOLDS,
  priorityOf,
  scoreDescription,
  severityFromScore,
} from "../lib/triage.js";

const failures = [];
let count = 0;

function check(name, actual, expected) {
  count += 1;
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a !== e) failures.push(`${name}\n    expected ${e}\n    got      ${a}`);
}

// ---- thresholds ----
check("score 0 -> null", severityFromScore(0), null);
check("score 1 -> low", severityFromScore(1), "low");
check("score 14 -> low", severityFromScore(14), "low");
check("score 15 -> medium", severityFromScore(15), "medium");
check("score 34 -> medium", severityFromScore(34), "medium");
check("score 35 -> high", severityFromScore(35), "high");
check("score 69 -> high", severityFromScore(69), "high");
check("score 70 -> critical", severityFromScore(70), "critical");
check("score 100 -> critical", severityFromScore(100), "critical");

// ---- nothing to suggest ----
check("empty string", scoreDescription(""), { score: 0, suggestedSeverity: null, reasons: [] });
check("blank string", scoreDescription("   \n "), { score: 0, suggestedSeverity: null, reasons: [] });
check("not a string (object)", scoreDescription({ $ne: null }), { score: 0, suggestedSeverity: null, reasons: [] });
check("not a string (undefined)", scoreDescription(undefined), { score: 0, suggestedSeverity: null, reasons: [] });
check("ordinary sentence", scoreDescription("Water level is normal near the bridge today"), {
  score: 0,
  suggestedSeverity: null,
  reasons: [],
});

// ---- the words from the build plan ----
const one = (text) => scoreDescription(text);
check("trapped", one("Two people are trapped in the basement"), { score: 45, suggestedSeverity: "high", reasons: ["trapped"] });
check("bleeding", one("He is bleeding from the arm").suggestedSeverity, "high");
check("unconscious", one("A man is unconscious on the road"), { score: 70, suggestedSeverity: "critical", reasons: ["unconscious"] });
check("collapse", one("The wall has collapsed").suggestedSeverity, "high");
check("drowning", one("Someone is drowning in the canal").suggestedSeverity, "critical");
check("fire", one("There is a fire on the second floor").suggestedSeverity, "high");
check("gas", one("Strong smell of gas in the lane").suggestedSeverity, "high");
check("child alone", one("There is a child here"), { score: 15, suggestedSeverity: "medium", reasons: ["child"] });
check("elderly alone", one("An elderly lady lives alone").suggestedSeverity, "medium");
check("pregnant", one("She is pregnant and needs help").suggestedSeverity, "medium");
check("no water", one("We have no water since morning"), { score: 15, suggestedSeverity: "medium", reasons: ["no water"] });
check("stuck", one("Our car is stuck in the floodwater").suggestedSeverity, "high");

// ---- Hindi and Hinglish ----
check("aag", one("Dukaan mein aag lagi hai"), { score: 35, suggestedSeverity: "high", reasons: ["aag"] });
check("bachao", one("Bachao! Please bachao"), { score: 40, suggestedSeverity: "high", reasons: ["bachao"] });
check("baadh", one("Gali mein baadh aa gayi hai").suggestedSeverity, "medium");
check("ghayal", one("Do log ghayal hain"), { score: 30, suggestedSeverity: "medium", reasons: ["ghayal"] });
check("phans", one("Gaadi mein phans gaya hun"), { score: 35, suggestedSeverity: "high", reasons: ["phans"] });
check("devanagari fire", one("दुकान में आग लगी है").reasons, ["आग"]);
check("devanagari help", one("बचाओ").suggestedSeverity, "high");
check("devanagari stuck", one("हम फंस गए हैं").reasons, ["फंस"]);
check("devanagari injured", one("दो लोग घायल हैं").reasons, ["घायल"]);
check("devanagari flood (as typed)", one("यहाँ बाढ़ आ गई है").reasons, ["बाढ़"]);
check("devanagari flood (decomposed ढ + nukta)", one("यहाँ बाढ़ आ गई है".normalize("NFD")).reasons, ["बाढ़"]);

// ---- combining ----
const combo = one("Child trapped and bleeding, there is a fire");
check("combo adds up (capped)", combo.score, MAX_SCORE);
check("combo severity", combo.suggestedSeverity, "critical");
check("combo reasons, most weighty first", combo.reasons, ["trapped", "bleeding", "fire", "child"]);
check("score is capped", one("unconscious, drowning, heavy bleeding, trapped, fire, gas, bachao").score, MAX_SCORE);
check("reasons are capped", one("unconscious drowning heavy bleeding trapped fire gas bachao child").reasons.length, MAX_REASONS);
check("a group counts once", one("fire fire fire, flames everywhere, burning"), { score: 35, suggestedSeverity: "high", reasons: ["fire"] });
check("longer phrase wins over its part", one("heavy bleeding from the leg"), { score: 70, suggestedSeverity: "critical", reasons: ["heavy bleeding"] });

// ---- whole words, any case, spacing ----
check("fireworks is not fire", one("Fireworks near the park").score, 0);
check("firefighter is not fire", one("Firefighters have arrived").score, 0);
check("childhood is not child", one("Remembering childhood").score, 0);
check("UPPER CASE", one("TRAPPED UNDER DEBRIS"), { score: 45, suggestedSeverity: "high", reasons: ["trapped"] });
check("phrase with extra spaces and a newline", one("he is not   \n breathing").suggestedSeverity, "critical");
check("curly apostrophe", one("I can’t breathe").suggestedSeverity, "critical");
check("punctuation around a word", one("(fire!)").suggestedSeverity, "high");

// ---- negation ----
check("no fire", one("There is no fire, only smoke from the kitchen").reasons, ["smoke"]);
check("not trapped", one("Nobody is trapped").score, 0);
check("no one is trapped", one("No one is trapped").score, 0);
check("without bleeding", one("injured but without bleeding").reasons, ["injured"]);
check("aag nahi", one("aag nahi lagi").score, 0);
check("negation stops at a full stop", one("No water. A child is stuck on the roof").reasons, ["stuck", "no water", "child"]);
check("negation stops at a comma", one("No power, fire in the building").reasons, ["fire"]);
check("'no water' still counts", one("no water").score, 15);
check("'paani nahi' still counts", one("paani nahi hai").score, 15);

// ---- harmless input ----
check("regex characters in the text", one("fire (urgent) [help] * + ? $ ^ \\").suggestedSeverity, "high");
check("emoji", one("🔥 fire 🔥").suggestedSeverity, "high");
check("very long text", one("water ".repeat(5000) + "fire").score >= 0, true);

// ---- the table itself ----
check("every weight is 1..100", KEYWORD_GROUPS.every((g) => Number.isInteger(g.weight) && g.weight >= 1 && g.weight <= 100), true);
check("no empty word lists", KEYWORD_GROUPS.every((g) => g.words.length > 0 && g.words.every((w) => w.trim() === w && w.length > 0)), true);
const seen = new Map();
for (const [i, g] of KEYWORD_GROUPS.entries()) for (const w of g.words) seen.set(w.toLowerCase(), [...(seen.get(w.toLowerCase()) ?? []), i]);
check("no word is listed in two groups", [...seen.values()].filter((v) => v.length > 1), []);
check("thresholds are in descending order", SEVERITY_THRESHOLDS.every((t, i, a) => i === 0 || a[i - 1].min > t.min), true);
// Every keyword must be found when it stands alone (catches a typo in a regex).
for (const g of KEYWORD_GROUPS) {
  for (const w of g.words) {
    const r = scoreDescription(`report: ${w} here`);
    check(`keyword "${w}" is found on its own`, r.score >= g.weight || r.reasons.length > 0, true);
  }
}

// ---- priority number used by sort=priority ----
check("priority: plain low report", priorityOf({ severity: "low" }), 0);
check("priority: medium + score", priorityOf({ severity: "medium", triage: { score: 45 } }), 70);
check("priority: SOS", priorityOf({ severity: "critical", isSos: true, triage: { score: 0 } }), 125);
check("priority: SOS flag must be a real boolean", priorityOf({ severity: "critical", isSos: "true" }), 75);
check("priority: old incident without triage", priorityOf({ severity: "high" }), 50);

if (failures.length > 0) {
  console.error(`FAILED: ${failures.length} of ${count} checks\n`);
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}
console.log(`OK: ${count} checks passed`);
