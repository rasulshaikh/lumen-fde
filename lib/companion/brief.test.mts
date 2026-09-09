/**
 * Daily brief tests. Run with:  npx tsx lib/companion/brief.test.mts
 *
 * Two cases carry this file, and they are the two the old home page handled worst:
 *
 *  1. **Nothing recorded.** Today's actual state, and the one where the page used to render four
 *     panels of zeros. The brief must still say something true and useful.
 *  2. **Back after a long gap.** Month 12, a fortnight away. The single most likely moment to
 *     close the tab for good.
 *
 * And one property with no natural failure signal, asserted directly because it renders
 * perfectly when wrong: the brief must never expose a recall backlog COUNT. `lib/review.ts` and
 * `app/recall.tsx` both state the rule — "'37 due', close it forever… the count is never
 * surfaced". A number there would look completely normal and would quietly undo the scheduler's
 * one deliberate protection, so the test reads the whole object and asserts no field can hold it.
 */
import { buildBrief, gapInDays, lead, opening, recallState, type BriefInput } from "./brief.ts";
import type { ReviewState } from "../review.ts";

let fails = 0;
const ck = (n: string, c: boolean, x = "") => { if (!c) { fails++; console.log(`  FAIL ${n} ${x}`); } else console.log(`  ok   ${n} ${x}`); };

const T = (iso: string) => new Date(`${iso}T09:00:00Z`);
const FOCUS = { row: 1, topic: "Shell mastery and scripting", status: "Not started", description: "Write a 200-line bash tool.", month: 1, hours: 14 };

console.log("gapInDays");
ck("same day is zero", gapInDays("2026-09-09", "2026-09-09") === 0);
ck("counts whole days", gapInDays("2026-09-01", "2026-09-09") === 8);
ck("a future event costs the line rather than going negative", gapInDays("2026-10-01", "2026-09-09") === null);
ck("unparseable costs the line", gapInDays("nonsense", "2026-09-09") === null);

console.log("recallState — three states, because two would lie");
{
  const due: ReviewState = { a: { rung: 0, due: "2026-09-01", seen: 1 } };
  const later: ReviewState = { a: { rung: 0, due: "2026-12-01", seen: 1 } };
  ck("overdue reads as waiting", recallState({ state: due, synced: true }, T("2026-09-09")) === "waiting");
  ck("nothing due reads as none", recallState({ state: later, synced: true }, T("2026-09-09")) === "none");
  ck("an unreadable store is unknown, NOT none",
    recallState({ state: {}, synced: false }, T("2026-09-09")) === "unknown");
  ck("absent review is unknown", recallState(null, T("2026-09-09")) === "unknown");
}

console.log("the brief never carries a backlog count");
{
  const many: ReviewState = {};
  for (let i = 0; i < 37; i++) many[`k${i}`] = { rung: 0, due: "2026-08-01", seen: 1 };
  const brief = buildBrief({ focus: FOCUS, review: { state: many, synced: true } }, T("2026-09-09"));
  ck("37 overdue cards render as a state, not a number", brief.recall === "waiting");
  const serialised = JSON.stringify(brief);
  ck("the number 37 appears nowhere in the brief", !serialised.includes("37"), serialised.slice(0, 120));
  // Guard the shape, not just this instance: no field may be a count of due cards.
  ck("no field holds a due count", !Object.keys(brief).some((k) => /due|backlog|overdue/i.test(k)), Object.keys(brief).join(","));
}

console.log("case 1 — nothing recorded, which is today");
{
  const brief = buildBrief({ focus: FOCUS }, T("2026-09-09"));
  ck("still names the focus row", brief.focus?.topic === "Shell mastery and scripting");
  ck("gap is null rather than zero", brief.gapDays === null);
  ck("shipped defaults to none", brief.shipped === 0);
  const line = opening(brief);
  ck("the opening does not report a zero", !/\b0\b/.test(line), line);
  ck("the opening contains no digit at all", !/\d/.test(line), line);
  ck("it says what to do rather than what is missing", /starts|first row/i.test(line), line);
}

console.log("case 2 — back after a fortnight in month 12");
{
  const brief = buildBrief({ focus: FOCUS, lastEventDay: "2026-08-26" }, T("2026-09-09"));
  ck("the gap is measured", brief.gapDays === 14, String(brief.gapDays));
  const line = opening(brief);
  ck("the opening carries no digit", !/\d/.test(line), line);
  ck("it does not read as a forfeit", !/lost|broken|failed|missed|behind/i.test(line), line);
  ck("it points back at the work", /row/i.test(line), line);
}

console.log("the opening is warm at every gap, and never numeric");
{
  for (const [last, label] of [[null, "never"], ["2026-09-09", "same day"], ["2026-09-08", "yesterday"], ["2026-09-07", "2 days"], ["2026-09-01", "8 days"], ["2026-06-01", "100 days"]] as const) {
    const brief = buildBrief({ focus: FOCUS, lastEventDay: last }, T("2026-09-09"));
    const line = opening(brief);
    ck(`no digit after ${label}`, !/\d/.test(line), line);
    ck(`no vocabulary of loss after ${label}`, !/lost|broken|failed|streak|behind/i.test(line), line);
  }
}

console.log("lead — strips the transport label, keeps the sentence");
ck("drops the EVIDENCE prefix", lead("EVIDENCE - row 28, readiness 0% to 14%.") === "row 28, readiness 0% to 14%.");
ck("drops the STUDY prefix", lead("STUDY - Studied 3 of the last 21 days.") === "Studied 3 of the last 21 days.");
ck("keeps only the lead line", lead("EVIDENCE - first line.\nsecond line.\nthird.") === "first line.");
ck("leaves an unlabelled sentence alone", lead("Studied 3 of the last 21 days.") === "Studied 3 of the last 21 days.");
ck("does not eat a capitalised word that is not a label", lead("Python is 69% of the core market.") === "Python is 69% of the core market.");
ck("empty in, empty out", lead("") === "");

console.log("consumed, never recomputed");
{
  const evidence = { statement: "EVIDENCE - row 28: readiness 0% to 14%.\nrepeated share sentence." } as unknown as NonNullable<BriefInput["evidence"]>;
  const brief = buildBrief({ focus: FOCUS, evidence }, T("2026-09-09"));
  ck("buys is the lead line computeEvidence rendered, label removed",
    brief.buys === "row 28: readiness 0% to 14%.", String(brief.buys));
  ck("buys does not repeat the share sentence the Evidence panel prints",
    !String(brief.buys).includes("repeated share"));

  const streak = { rateStatement: "Studied 3 of the last 21 days (14%).", runStatement: "Longest run 2 days.", statement: "STUDY - all of it plus recency" } as unknown as NonNullable<BriefInput["streak"]>;
  const withStreak = buildBrief({ focus: FOCUS, streak }, T("2026-09-09"));
  ck("rhythm is rate + run, not the labelled combined statement",
    withStreak.rhythm === "Studied 3 of the last 21 days (14%). Longest run 2 days.", String(withStreak.rhythm));
  ck("rhythm carries no transport label", !String(withStreak.rhythm).includes("STUDY -"));
}

console.log(fails ? `\n${fails} FAILED` : "\nall assertions passed");
process.exit(fails ? 1 : 0);
