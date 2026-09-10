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
  aimContext,
  cleanSourceTitle,
  libraryContext,
  benchmarkGapsContext,
  evidenceContext,
  marketDepthContext,
  recallContext,
  rhythmContext,
  workbookContext,
} from "./context.ts";
import { LADDER } from "../review.ts";
import books from "../../data/library-context.json" with { type: "json" };
import catalog from "../../data/library-sources.json" with { type: "json" };

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

console.log("the chosen route reaches the companion, and only a real one");
{
  const label = (id: string) => ({ india: "Stay in India", gulf: "The Gulf" } as Record<string, string>)[id] ?? null;

  const chosen = aimContext("gulf", label);
  ck("the route is named", /THE ROUTE THEY ARE AIMING AT: The Gulf/.test(chosen));
  ck("it is framed as a preference, not a commitment", /rather than a commitment/.test(chosen));
  ck("and the model is told to answer for it first", /answer for this one first/.test(chosen));
  ck("while saying what would change elsewhere", /what would change if they were aiming elsewhere/.test(chosen));
  // The product refuses to congratulate people for pressing buttons everywhere else.
  ck("no praise for having chosen", /do not congratulate them for having chosen/.test(chosen));

  // The id comes from localStorage on the reader's device, so it can be stale or hand-edited.
  ck("no choice, no block", aimContext(null, label) === "");
  ck("an unknown route renders nothing", aimContext("mars", label) === "");
  ck("a crafted id renders nothing", aimContext("../../etc/passwd", label) === "");
  ck("an empty id renders nothing", aimContext("", label) === "");
}


console.log("the library ships once, not twice, and without the crawl");
{
  const text = libraryContext(books as never, catalog.sources as never);

  // The join is by page count. It is unique and total today - 16 of 16 - and this is the assertion
  // that keeps it that way: add a book whose page count collides with another and this fails here
  // rather than silently falling back to a filename-derived title in the prompt.
  const pages = books.map((b) => b.pages);
  ck("no two curated books share a page count", new Set(pages).size === pages.length, `${pages.length} books, ${new Set(pages).size} distinct`);
  const unmatched = catalog.sources.filter((s) => !pages.includes(s.pages));
  ck("every indexed source joins to a curated book", unmatched.length === 0, unmatched.map((s) => s.title.slice(0, 40)).join(", "));

  ck("all 16 books render", (text.match(/^- /gm) ?? []).length === 16, `${(text.match(/^- /gm) ?? []).length}`);
  ck("and the block says it is complete rather than a slice", /all 16 of them, complete rather than a slice/.test(text));
  ck("each carries its author", /- Oliver Theobald \(179pp\)/.test(text));
  ck("and the role the curated file gives it", /Plain-English foundation/.test(text));
  ck("and its chapter map", /chapters: Chapter 1 The Machine Learning Landscape/.test(text));
}

console.log("nothing about where the files came from reaches the model");
{
  const text = libraryContext(books as never, catalog.sources as never);
  // All four of these are in data/library-sources.json today and all four were being sent to a
  // third-party model API on every question, inside `JSON.stringify(sourceCatalog)`. None of them
  // helps answer a study question. The watermark is the one that matters most: it carries a real
  // person's name, and it was never anyone's decision to publish it.
  for (const leak of ["Z-Library", "PDFDrive", ".pdf", "Majumder", "Books ML", "relativeFolder", "indexedAt"]) {
    ck(`no ${leak}`, !text.includes(leak));
  }
  ck("the raw filename field is gone entirely", !/filename/i.test(text));
}

console.log("a missing chapter list is unknown, not an absent book");
{
  // The same rule recall and artifacts are held to. A book the indexer did not reach is not a book
  // without chapters, and dropping the line would make it a book that does not exist.
  const text = libraryContext(
    [{ id: "x", title: "A Book", author: "An Author", pages: 111, role: "Reference", topics: ["one", "two"] }] as never,
    [] as never,
  );
  ck("the book still ships", /- A Book - An Author \(111pp\)/.test(text));
  ck("and says the chapters are not indexed", /chapters: not indexed for this one/.test(text));
  ck("rather than claiming it has none", !/no chapters|0 chapters/i.test(text));

  const real = libraryContext(books as never, catalog.sources as never);
  ck("exactly one real book is unindexed today", (real.match(/not indexed for this one/g) ?? []).length === 1, `${(real.match(/not indexed for this one/g) ?? []).length}`);
}

console.log("an indexed source with no curated entry is not dropped");
{
  const text = libraryContext(
    [] as never,
    [{ title: "Something (Z-Library).pdf", pages: 42, chapters: ["Chapter 1 Whatever"] }] as never,
  );
  ck("the orphan ships", /- Something \(42pp\)/.test(text), text);
  ck("under a cleaned title", !/Z-Library|\.pdf/.test(text));
  ck("and is labelled as uncurated", /not in the curated list/.test(text));
  ck("with its chapters intact", /Chapter 1 Whatever/.test(text));
}

console.log("the title cleaner strips provenance and nothing else");
{
  ck("shadow-library tag", cleanSourceTitle("A Title (Z-Library).pdf") === "A Title");
  ck("the other one", cleanSourceTitle("A Title (PDFDrive).pdf") === "A Title");
  ck("the personal watermark", cleanSourceTitle("A Title (for Jane Doe)") === "A Title");
  ck("an early-release marker", cleanSourceTitle("A Title (Second Early Release)") === "A Title");
  // A parenthetical that is part of the actual title must survive - over-stripping would rename books.
  ck("a real parenthetical survives", cleanSourceTitle("Deep Learning (Adaptive Computation)") === "Deep Learning (Adaptive Computation)");
  ck("an already-clean title is untouched", cleanSourceTitle("Mathematics for Machine Learning") === "Mathematics for Machine Learning");
}

console.log("empty in, empty out");
{
  ck("no books and no sources contributes nothing", libraryContext([] as never, [] as never) === "");
}

console.log(fails ? `\n${fails} FAILED` : "\nall passed");
process.exit(fails ? 1 : 0);
