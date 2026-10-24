// Wording for "Suggested priority" reasons, shared by the report form and the
// incident page. Reasons are the keywords from lib/triage.js, shown as written.

const quoted = (words) => words.map((word) => `‘${word}’`);

function joinWords(words) {
  if (words.length <= 1) return words.join("");
  return `${words.slice(0, -1).join(", ")} and ${words[words.length - 1]}`;
}

// ["trapped", "child"] -> "mentions ‘trapped’ and ‘child’"
export function describeReasons(reasons) {
  if (!reasons || reasons.length === 0) return "has no priority keywords";
  return `mentions ${joinWords(quoted(reasons.slice(0, 3)))}`;
}
