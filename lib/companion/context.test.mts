/**
 * Context builder tests. Run with:  npx tsx lib/companion/context.test.mts
 *
 * This module builds most of what Quaere reads, and until now it was the only file in
 * `lib/companion/` without a test. `lib/motivation.ts`, which reaches no prompt at all, carries
 * 19,510 bytes of them.
 *
 * Two invariants matter more than everything else here, because violating either produces a
 * confident sentence that is wrong:
 *
 * 1. **The recall backlog count never appears.** Not as a total, not as "and 28 more". `lib/review.ts`
 *    and `app/recall.tsx` both record the reason: "'37 due', close it forever". A number is what
 *    makes someone abandon a review system, and this reader has 23 months left.
 * 2. **Unknown is never rendered as none.** A store that could not be read must never produce a
 *    sentence claiming the reader has done nothing.
 */
import {
  benchmarkGapsContext,
  evidenceContext,
  marketDepthContext,
  recallContext,
  rhythmContext,
  workbookContext,
} from "./context.ts";
import { LADDER } from "../review.ts";

let fails = 0;
const ck = (n: string, c: boolean, x = "") => { if (!c) { fails++; console.log(`  FAIL ${n} ${x}`); } else console.log(`  ok   ${n} ${x}`); };
const NOW = new Date("2026-09-10T09:00:00Z");
const topic = (k: string) => `Topic ${k}`;

console.log("the recall backlog count never reaches a prompt");
{
  // The exact situation the rule exists for: a large backlog after a break.
  const state: Record<string, { rung: number; due: string; seen: number; lastGrade?: "gone" | "halting" | "fluent" }> = {};
  for (let i = 0; i < 37; i++) state[String(i)] = { rung: i % LADDER.length, due: "2026-09-01", seen: 3, lastGrade: "halting" };
  const text = recallContext({ state, synced: true }, NOW, topic);

  ck("the total is absent", !/\b37\b/.test(text), text.slice(0, 120));
  ck("the withheld count is absent", !/\b31\b/.test(text));
  ck("no 'and N more' phrasing", !/and \d+ more/i.test(text), text);
  ck("it says more remain without counting them", /and more besides/.test(text));
  ck("and it tells the model the rule", /NEVER state how many cards are due/.test(text));
  ck("topics are named", /Topic 0/.test(text));
  ck("rungs are given, since a rung is a position and not a backlog", /rung \d+ of 7/.test(text));

  // Weakest first: a card at rung 0 has just been dropped and is the one to revisit.
  const first = text.split("weakest rung first: ")[1]?.split(";")[0] ?? "";
  ck("the weakest rung leads the list", /rung 1 of 7/.test(first), first);
}

console.log("recall distinguishes unknown, empty and waiting");
{
  const unknown = recallContext(null, NOW, topic);
  const unread = recallContext({ state: {}, synced: false }, NOW, topic);
  const empty = recallContext({ state: {}, synced: true }, NOW, topic);
  const waiting = recallContext({ state: { "0": { rung: 0, due: "2026-09-01", seen: 1 } }, synced: true }, NOW, topic);

  ck("a missing schedule says so", /could not be read/.test(unknown));
  ck("an unreadable one says the same", /could not be read/.test(unread));
  ck("and forbids claiming either way", /Do not claim anything is or is not due/.test(unknown));
  ck("an empty schedule is a real answer", /nothing is due today/.test(empty));
  ck("unknown and empty are different sentences", unknown !== empty);
  ck("waiting names the topic", /Topic 0/.test(waiting));
}

console.log("the compensation sheet's columns are labelled correctly");
{
  const text = workbookContext();
  // The bug this catches: column 2 is the Source and was announced as `verdict`, so the prompt
  // read "verdict fde.academy salary guide (Feb 2026)".
  ck("the source is called a source", /source: /.test(text), text.slice(0, 200));
  ck("no column is called a verdict any more", !/verdict/i.test(text));
  ck("the odds are labelled as the learner's own read", /odds \(the learner's own read, not data\)/.test(text));
  ck("and every market carries all four", (text.match(/what it takes: /g) ?? []).length >= 5);
}

console.log("unknown is never rendered as none");
{
  const unreadable = evidenceContext({ artifacts: [], synced: false }, { count: 0, latest: null, synced: false });
  ck("an unreadable artifact store says unknown", /unreadable right now/.test(unreadable));
  ck("and says NOT zero in those words", /NOT zero/.test(unreadable), unreadable);
  // The phrase "built nothing" DOES appear, inside the instruction forbidding it. What matters is
  // that it is an instruction and not a claim, so assert the instruction rather than the absence.
  ck("and instructs the model not to claim otherwise", /do not tell the learner they have built nothing/i.test(unreadable));
  ck("it does not report a count of zero", !/\b0 recorded\b/.test(unreadable));

  const empty = evidenceContext({ artifacts: [], synced: true }, { count: 0, latest: null, synced: true });
  ck("a readable empty store is a different sentence", /none recorded yet/.test(empty));
  ck("the two do not collapse", unreadable !== empty);
}

console.log("the market block carries every measured skill and the reading written for it");
{
  const skills = Array.from({ length: 34 }, (_, i) => ({ label: `Skill ${i}`, marketPct: 90 - i * 2, reachablePct: 50 + i }));
  const text = marketDepthContext({ quaere: "The scan's own reading.", reachability: { skills } });

  ck("all 34 skills ship, not 10", (text.match(/^- Skill /gm) ?? []).length === 34, `${(text.match(/^- Skill /gm) ?? []).length}`);
  ck("each carries both shares", /market 90%, reachable 50%/.test(text));
  ck("the highest market share leads", text.indexOf("Skill 0") < text.indexOf("Skill 33"));
  ck("the stored reading is included", /The scan's own reading/.test(text));
  ck("and is labelled interpretation, not measurement", /interpretation, not measurement/.test(text));

  ck("a null insight contributes nothing", marketDepthContext(null) === "");
  ck("no skills and no reading contributes nothing", marketDepthContext({ quaere: null, reachability: { skills: [] } }) === "");
}

console.log("rhythm reports a rate and refuses to invent a chain");
{
  const text = rhythmContext({ statement: "4 study days in the last 14." }, [{ day: "2026-09-09", title: "A question" }]);
  ck("the rate is stated", /4 study days/.test(text));
  ck("and the no-chain rule travels with it", /gap moves the rate and leaves the run standing/.test(text));
  ck("prior answers are listed", /2026-09-09: A question/.test(text));
  ck("with the instruction to build on them", /build on it rather than starting over/.test(text));

  ck("no streak, no history, no block", rhythmContext(null, []) === "");
  ck("history alone still renders", rhythmContext(null, [{ day: "d", title: "t" }]).includes("t"));
}

console.log("every block states its own cap when it truncates");
{
  const many = Array.from({ length: 40 }, (_, i) => ({ label: `Skill ${i}`, marketPct: 1, reachablePct: 1 }));
  const text = marketDepthContext({ quaere: null, reachability: { skills: many } });
  ck("the overflow is disclosed", /more skills not shown/.test(text), text.split("\n").pop() ?? "");

  const gaps = benchmarkGapsContext({ gaps: Array.from({ length: 20 }, (_, i) => ({ id: `g${i}`, statement: `Gap ${i}` })), overInvested: [] } as never);
  ck("gaps disclose theirs too", /more gaps not shown/.test(gaps), gaps.split("\n").pop() ?? "");
}

console.log(fails ? `\n${fails} FAILED` : "\nall passed");
process.exit(fails ? 1 : 0);
