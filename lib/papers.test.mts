/**
 * Paper store tests. Run with:  npx tsx lib/papers.test.mts
 *
 * Two properties carry this module.
 *
 * **Validation, because the store is permanent.** `lib/artifacts.ts` records why: /api/progress
 * once accepted any topic string, so a caller typo committed a file that matched no plan row and
 * was silently skipped. It looked recorded and counted toward nothing. A paper keyed on unchecked
 * rows fails identically and just as invisibly.
 *
 * **No score ever reaches the prompt.** The product refuses gamification everywhere else: the
 * recall backlog is a state and never a count, the streak "moves the rate and leaves the run
 * standing". A paper history is the easiest place to accidentally introduce a running average, so
 * the prompt text is asserted to name topics and never to compute one.
 */
import { GRADES, MAX_MINUTES, MAX_QUESTIONS, PLAN_ROWS, papersContext, paperPath, tally, validatePaper, type Paper } from "./papers.ts";

let fails = 0;
const ck = (n: string, c: boolean, x = "") => { if (!c) { fails++; console.log(`  FAIL ${n} ${x}`); } else console.log(`  ok   ${n} ${x}`); };
const NOW = new Date("2026-09-10T06:30:00Z");
const ans = (n: number, grade = "fluent") => Array.from({ length: n }, (_, i) => ({ k: `q${i}-0`, i, grade }));
const good = { scope: "weekly", label: "Up next", minutes: 28, answered: ans(6) };

console.log("a paper is validated before it becomes permanent");
{
  ck("a real paper validates", validatePaper(good, NOW).ok);
  ck("scope is required", !validatePaper({ ...good, scope: "" }, NOW).ok);
  ck("an empty paper is refused", !validatePaper({ ...good, answered: [] }, NOW).ok);
  ck("a non-array answered is refused", !validatePaper({ ...good, answered: "six" }, NOW).ok);
  ck("more than the cap is refused", !validatePaper({ ...good, answered: ans(MAX_QUESTIONS + 1) }, NOW).ok);
  ck("exactly the cap is allowed", validatePaper({ ...good, answered: ans(MAX_QUESTIONS) }, NOW).ok);
}

console.log("the row index is the join key, so it is checked against the plan");
{
  ck("row 0 is valid", validatePaper({ ...good, answered: [{ k: "a", i: 0, grade: "gone" }] }, NOW).ok);
  ck("the last row is valid", validatePaper({ ...good, answered: [{ k: "a", i: PLAN_ROWS - 1, grade: "gone" }] }, NOW).ok);
  ck("past the end is refused", !validatePaper({ ...good, answered: [{ k: "a", i: PLAN_ROWS, grade: "gone" }] }, NOW).ok);
  ck("a negative row is refused", !validatePaper({ ...good, answered: [{ k: "a", i: -1, grade: "gone" }] }, NOW).ok);
  ck("a float row is refused", !validatePaper({ ...good, answered: [{ k: "a", i: 1.5, grade: "gone" }] }, NOW).ok);
  ck("a missing row is refused, not read as 0", !validatePaper({ ...good, answered: [{ k: "a", grade: "gone" }] }, NOW).ok);
}

console.log("grades are the three states, and nothing else");
{
  for (const g of GRADES) ck(`${g} is accepted`, validatePaper({ ...good, answered: [{ k: "a", i: 0, grade: g }] }, NOW).ok);
  ck("a score is refused", !validatePaper({ ...good, answered: [{ k: "a", i: 0, grade: 7 }] }, NOW).ok);
  ck("a made-up grade is refused", !validatePaper({ ...good, answered: [{ k: "a", i: 0, grade: "excellent" }] }, NOW).ok);
  ck("a missing grade is refused", !validatePaper({ ...good, answered: [{ k: "a", i: 0 }] }, NOW).ok);
}

console.log("minutes cannot record an abandoned tab");
{
  ck("zero is fine", validatePaper({ ...good, minutes: 0 }, NOW).ok);
  ck("a three-hour capstone is fine", validatePaper({ ...good, minutes: 180 }, NOW).ok);
  ck("past the ceiling is refused", !validatePaper({ ...good, minutes: MAX_MINUTES + 1 }, NOW).ok);
  ck("a non-number is refused", !validatePaper({ ...good, minutes: "a while" }, NOW).ok);
  ck("a negative is refused", !validatePaper({ ...good, minutes: -5 }, NOW).ok);
}

console.log("the same question cannot appear twice in one paper");
{
  const dupe = { ...good, answered: [{ k: "q1", i: 0, grade: "gone" }, { k: "q1", i: 0, grade: "fluent" }] };
  ck("refused rather than averaged away", !validatePaper(dupe, NOW).ok);
}

console.log("the path is append-only friendly and safe to write");
{
  const paper = (validatePaper(good, NOW) as { ok: true; value: Paper }).value;
  const path = paperPath(paper);
  ck("it lands under reports/papers", path.startsWith("reports/papers/"), path);
  ck("no colons, which GitHub paths and local checkouts both dislike", !path.includes(":"), path);
  ck("the day is in the name, so a listing sorts by time", path.includes("2026-09-10"), path);
  const odd = paperPath({ ...paper, scope: "month/../../etc" });
  ck("a scope cannot escape the directory", !odd.includes(".."), odd);
  ck("and stays under reports/papers", odd.startsWith("reports/papers/"), odd);
}

console.log("the tally counts, and counts only");
{
  const paper = (validatePaper({ ...good, answered: [
    { k: "a", i: 0, grade: "fluent" }, { k: "b", i: 1, grade: "fluent" },
    { k: "c", i: 2, grade: "halting" }, { k: "d", i: 3, grade: "gone" },
  ] }, NOW) as { ok: true; value: Paper }).value;
  const t = tally(paper);
  ck("fluent", t.fluent === 2, `${t.fluent}`);
  ck("halting", t.halting === 1);
  ck("gone", t.gone === 1);
  ck("total", t.total === 4);
}

console.log("the prompt block names topics and never computes a score");
{
  const name = (row: number) => ["Shell mastery", "Linux internals", "Networking", "Kafka"][row] ?? `row ${row + 1}`;
  const paper = (validatePaper({ ...good, minutes: 31, answered: [
    { k: "a", i: 0, grade: "fluent" }, { k: "b", i: 3, grade: "gone" }, { k: "c", i: 2, grade: "halting" },
  ] }, NOW) as { ok: true; value: Paper }).value;
  const text = papersContext({ papers: [paper], synced: true }, name);

  ck("it names the weak topics", text.includes("Kafka (gone)") && text.includes("Networking (halting)"), text);
  ck("it reports the counts", /fluent 1, halting 1, gone 1/.test(text));
  ck("and the sitting's own length", text.includes("31 min"));
  // The line this product will not cross. Checked over the DATA lines only: the last line is the
  // instruction telling the model not to compute a score, and it necessarily contains the word.
  const data = text.split("\n").filter((l) => !l.includes("Never compute")).join("\n");
  ck("no percentage anywhere", !/%/.test(data), data);
  ck("no average, score or trend in the data", !/\b(average|score|trend|streak|improv)/i.test(data), data);
  ck("and it tells the model not to compute one", /Never compute a score, an average or a trend/.test(text));

  const many = papersContext({ papers: [paper, paper, paper, paper], synced: true }, name);
  ck("only the last two sittings are shown", (many.match(/questions in/g) ?? []).length === 2);
  ck("but the true total is stated", many.includes("4 recorded"), many.split("\n")[0]);
}

console.log("unknown is never rendered as none");
{
  const name = (r: number) => `row ${r + 1}`;
  const unreadable = papersContext({ papers: [], synced: false }, name);
  ck("an unreadable store says unknown", /unreadable/i.test(unreadable) && /NOT none/.test(unreadable), unreadable);
  ck("and never claims nothing was sat", !/none recorded/.test(unreadable));

  const empty = papersContext({ papers: [], synced: true }, name);
  ck("a readable empty store says none, which is different", /none recorded yet/.test(empty), empty);
  ck("the two are not the same sentence", unreadable !== empty);
}

console.log(fails ? `\n${fails} FAILED` : "\nall passed");
process.exit(fails ? 1 : 0);
