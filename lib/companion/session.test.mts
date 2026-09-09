/**
 * Session record tests. Run with:  npx tsx lib/companion/session.test.mts
 *
 * Validation is the point here, not a formality, and the reason is written into
 * `lib/artifacts.ts`: /api/progress once accepted any `topic` string, so a caller typo committed
 * a permanent file that matched no plan row and was silently skipped - it looked recorded and
 * counted toward nothing. A session keyed on free text fails identically and just as invisibly,
 * so the row is validated against the workbook and the topic is derived, never accepted.
 *
 * The round trip is asserted because render and parse are inverses that live in one file and
 * drift the moment one of them gains a field.
 */
import {
  MAX_MINUTES,
  PLAN_ROWS,
  parseSession,
  renderSession,
  sessionPath,
  validateSession,
} from "./session.ts";

let fails = 0;
const ck = (n: string, c: boolean, x = "") => { if (!c) { fails++; console.log(`  FAIL ${n} ${x}`); } else console.log(`  ok   ${n} ${x}`); };
const NOW = new Date("2026-09-09T18:30:00Z");

console.log("the row is the join key, and it is validated");
{
  ck("a real row validates", validateSession({ row: 1 }, NOW).ok);
  ck("row 0 is refused", !validateSession({ row: 0 }, NOW).ok);
  ck("past the end is refused", !validateSession({ row: PLAN_ROWS + 1 }, NOW).ok);
  ck("a missing row is refused, not read as 0", !validateSession({}, NOW).ok);
  // Number("") and Number(" ") are both 0. A non-digit parse is what stops a blank row
  // validating as row 0 and failing for the wrong reason - or passing, one refactor later.
  ck("an empty string is refused", !validateSession({ row: "" }, NOW).ok);
  ck("whitespace is refused", !validateSession({ row: "  " }, NOW).ok);
  ck("exponent notation is refused", !validateSession({ row: "1e2" }, NOW).ok);
  ck("a float is refused", !validateSession({ row: "1.5" }, NOW).ok);
}

console.log("the topic is derived, never accepted");
{
  const result = validateSession({ row: 1, topic: "TOTALLY MADE UP" } as Record<string, unknown>, NOW);
  ck("validates", result.ok);
  if (result.ok) {
    ck("the caller's topic is ignored", result.value.topic !== "TOTALLY MADE UP", result.value.topic);
    ck("the topic came from the workbook", result.value.topic.length > 0, result.value.topic);
  }
}

console.log("minutes");
{
  ck("zero is fine - a session that happened still counts", validateSession({ row: 1, minutes: 0 }, NOW).ok);
  ck("a normal sitting is fine", validateSession({ row: 1, minutes: 45 }, NOW).ok);
  // A tab left open overnight would otherwise record a nineteen-hour session and poison every
  // average built on top of it.
  ck("an abandoned tab is refused", !validateSession({ row: 1, minutes: MAX_MINUTES + 1 }, NOW).ok);
  ck("a non-number is refused", !validateSession({ row: 1, minutes: "a while" }, NOW).ok);
  ck("a negative is refused", !validateSession({ row: 1, minutes: -5 }, NOW).ok);
}

console.log("render and parse are inverses");
{
  const result = validateSession({ row: 2, intention: "Cover strict mode", learned: "traps run on EXIT and ERR", minutes: 45 }, NOW);
  ck("validates", result.ok);
  if (result.ok) {
    const back = parseSession(renderSession(result.value));
    ck("round trips", back !== null);
    if (back) {
      ck("row survives", back.row === result.value.row);
      ck("topic survives", back.topic === result.value.topic, back.topic);
      ck("minutes survive", back.minutes === 45, String(back.minutes));
      ck("intention survives", back.intention === "Cover strict mode", back.intention);
      ck("learned survives", back.learned === "traps run on EXIT and ERR", back.learned);
    }
  }
}

console.log("an empty session still round trips");
{
  const result = validateSession({ row: 3, minutes: 0 }, NOW);
  if (result.ok) {
    const back = parseSession(renderSession(result.value));
    ck("parses with no free text", back !== null && back.row === 3);
    ck("empty blocks read as empty, not as the next field", back?.intention === "" && back?.learned === "", JSON.stringify([back?.intention, back?.learned]));
  }
}

console.log("a file that joins to nothing is rejected rather than half-read");
{
  ck("no row line", parseSession("# Study session\n\nTopic: whatever\n") === null);
  ck("row out of range", parseSession(`# Study session\n\nRow: ${PLAN_ROWS + 99}\n`) === null);
}

console.log("the path is unique per instant and names the row");
{
  const result = validateSession({ row: 7 }, NOW);
  if (result.ok) {
    const path = sessionPath(result.value, NOW);
    ck("lands under the sessions directory", path.startsWith("reports/companion/sessions/"), path);
    ck("names the row, zero padded", path.includes("row-007"), path);
    ck("carries no colons - GitHub paths and local checkouts both dislike them", !path.includes(":"), path);
    ck("a later instant is a different path", sessionPath(result.value, new Date("2026-09-09T18:31:00Z")) !== path);
  }
}

console.log(fails ? `\n${fails} FAILED` : "\nall assertions passed");
process.exit(fails ? 1 : 0);
