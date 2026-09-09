/**
 * Paper draw tests. Run with:  npx tsx lib/paper.test.mts
 *
 * Run against the real bank, not a fixture. The property this function exists to guarantee is a
 * property of the actual data: `data/recall-bank.json` holds 1,710 prompts spread unevenly across
 * 119 topics, and a fixture with three tidy topics of five questions each would pass every
 * assertion below while telling you nothing about whether a six-question weekly checkpoint over
 * your real shell, networking and systems rows comes back balanced.
 */
import bank from "../data/recall-bank.json" with { type: "json" };
import { drawPaper } from "./paper.ts";

type Prompt = { i: number; k: string; kind: string; p: string };
const prompts = (bank as { prompts: Prompt[] }).prompts;

let fails = 0;
const ck = (n: string, c: boolean, x = "") => { if (!c) { fails++; console.log(`  FAIL ${n} ${x}`); } else console.log(`  ok   ${n} ${x}`); };

const forTopics = (ids: number[]) => prompts.filter((p) => ids.includes(p.i));
const spread = (paper: Prompt[]) => {
  const by = new Map<number, number>();
  for (const p of paper) by.set(p.i, (by.get(p.i) ?? 0) + 1);
  return [...by.values()];
};

console.log("the real bank is what it claims to be");
{
  ck("1,710 prompts", prompts.length === 1710, `${prompts.length}`);
  ck("across 119 topics", new Set(prompts.map((p) => p.i)).size === 119);
  ck("every prompt has a unique key", new Set(prompts.map((p) => p.k)).size === prompts.length);
  const counts = [...new Map(prompts.map((p) => [p.i, prompts.filter((q) => q.i === p.i).length])).values()];
  ck("and the topics are NOT evenly sized, which is why the draw balances", new Set(counts).size > 1,
    `${Math.min(...counts)} to ${Math.max(...counts)} per topic`);
}

console.log("a weekly checkpoint over three real topics is balanced");
{
  // Rows 0, 1, 2 of the plan: the first three topics, as an early reader would actually get.
  const paper = drawPaper(forTopics([0, 1, 2]), 6, 12345) as Prompt[];
  ck("six questions", paper.length === 6, `${paper.length}`);
  ck("two from each topic", spread(paper).every((n) => n === 2), spread(paper).join("/"));
  ck("no question twice", new Set(paper.map((p) => p.k)).size === paper.length);
  ck("every question belongs to a topic in scope", paper.every((p) => [0, 1, 2].includes(p.i)));
}

console.log("an uneven scope spreads as evenly as the bank allows");
{
  const paper = drawPaper(forTopics([0, 1, 2, 3, 4]), 12, 999) as Prompt[];
  ck("twelve questions", paper.length === 12, `${paper.length}`);
  const s = spread(paper);
  ck("every topic in scope is represented", s.length === 5, `${s.length} topics`);
  // Round-robin means no topic can be more than one ahead of the least-used until one runs dry.
  ck("no topic dominates", Math.max(...s) - Math.min(...s) <= 1, s.join("/"));
}

console.log("a bank smaller than the paper gives what it has, not a loop");
{
  const one = prompts.filter((p) => p.i === 0);
  const paper = drawPaper(one, 500, 7) as Prompt[];
  ck("returns the whole topic and stops", paper.length === one.length, `${paper.length} of ${one.length}`);
  ck("without repeating", new Set(paper.map((p) => p.k)).size === paper.length);
}

console.log("degenerate inputs return nothing rather than throwing");
{
  ck("no prompts", drawPaper([], 6, 1).length === 0);
  ck("zero questions", drawPaper(forTopics([0]), 0, 1).length === 0);
  ck("negative questions", drawPaper(forTopics([0]), -5, 1).length === 0);
}

console.log("the same seed reproduces the paper, a new seed does not");
{
  const scope = forTopics([0, 1, 2]);
  const a = drawPaper(scope, 6, 42) as Prompt[];
  const b = drawPaper(scope, 6, 42) as Prompt[];
  ck("same seed, same paper", a.map((p) => p.k).join("|") === b.map((p) => p.k).join("|"));

  const distinct = new Set(Array.from({ length: 30 }, (_, i) => drawPaper(scope, 6, i * 7919).map((p) => p.k).join("|")));
  ck("thirty seeds give many different papers", distinct.size >= 20, `${distinct.size} distinct papers`);

  // The weekly checkpoint is sat every week for 23 months. If the first question were usually the
  // same one, it would stop being a test of recall within a month.
  const firsts = new Set(Array.from({ length: 40 }, (_, i) => drawPaper(scope, 6, i * 104729)[0]?.k));
  ck("and the opening question varies", firsts.size >= 8, `${firsts.size} distinct openers over 40 seeds`);
}

console.log("a quarterly paper over many topics still fills");
{
  const wide = Array.from({ length: 30 }, (_, i) => i);
  const paper = drawPaper(forTopics(wide), 20, 2024) as Prompt[];
  ck("twenty questions", paper.length === 20, `${paper.length}`);
  ck("twenty distinct topics, one each", new Set(paper.map((p) => p.i)).size === 20, `${new Set(paper.map((p) => p.i)).size}`);
  ck("no duplicates", new Set(paper.map((p) => p.k)).size === 20);
}

console.log(fails ? `\n${fails} FAILED` : "\nall passed");
process.exit(fails ? 1 : 0);
