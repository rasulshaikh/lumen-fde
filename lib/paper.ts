import { shuffle } from "./hero";

/**
 * Draw a paper from the recall bank.
 *
 * The bank holds 1,710 prompts across 119 topics, and it does not hold them evenly: a topic with
 * a long syllabus owns more questions than a short one. That matters because a plain shuffle over
 * the pooled prompts of three topics hands you a six-question paper that is five questions on the
 * topic with the deepest bank and one on the others, which is the opposite of what a checkpoint
 * across three topics is for.
 *
 * So the draw goes round-robin: one question per topic in rotation, until the paper is full or the
 * bank runs out. Six questions over three topics is two each. A topic that runs out early stops
 * contributing and the rest keep going, so a short bank costs its own topic and not the paper.
 *
 * Both the topic order and the question order within a topic are shuffled from the same seed, so
 * the same seed reproduces the same paper (which is what makes this testable) and a new seed gives
 * a genuinely different one (which is what stops the weekly checkpoint asking the same six
 * questions every week for two years).
 */
export type PaperPrompt = { i: number; k: string };

export function drawPaper<T extends PaperPrompt>(prompts: T[], count: number, seed: number): T[] {
  if (count <= 0 || !prompts.length) return [];

  const byTopic = new Map<number, T[]>();
  for (const p of shuffle(prompts, seed)) {
    const list = byTopic.get(p.i) ?? [];
    list.push(p);
    byTopic.set(p.i, list);
  }

  // Topic order is shuffled too, and from a different seed than the questions. Using one seed for
  // both would tie "which topic goes first" to "which question of that topic goes first", so two
  // papers that started with the same topic would tend to start with the same question.
  const order = shuffle([...byTopic.keys()], seed ^ 0x9e3779b9);

  const out: T[] = [];
  for (let round = 0; out.length < count; round++) {
    let added = false;
    for (const topic of order) {
      const next = byTopic.get(topic)?.[round];
      if (!next) continue;
      out.push(next);
      added = true;
      if (out.length >= count) break;
    }
    // Every topic is exhausted. Asking for 20 questions from a bank of 9 gives 9, not a loop.
    if (!added) break;
  }
  return out;
}
