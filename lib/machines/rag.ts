/**
 * RAG: what actually reaches the model, and the three ways the answer quietly gets worse.
 *
 * Explains plan row 53 - "RAG at depth: chunking, embeddings, hybrid retrieval, reranking".
 *
 * This one is close to home. Quaere is a retrieval system: `app/api/ask/route.ts` assembles a
 * context out of ranked, capped blocks and hands it to a model, and every failure this machine
 * demonstrates has a counterpart already recorded in this repo's own backlog - a cap so tight the
 * content could not be reached, a block that shipped provenance instead of substance, a store that
 * returned nothing and got read as "nothing exists".
 *
 * The fault that matters most is the empty retrieval. A model handed no context does not stop. It
 * answers anyway, fluently, from what it already believed - and that is indistinguishable from a
 * good answer until someone checks.
 */
import { clamp01, dialValue, stepAt, type Machine, type Scene, type SceneNode } from "./types";

const EMPTY = "empty-retrieval";
const NO_RERANK = "no-rerank";
const FAT_CHUNKS = "fat-chunks";

/** Tokens left for retrieved passages once the question, instructions and answer room are paid for. */
const CONTEXT_BUDGET = 4800;

const q = (note?: string): SceneNode => ({ id: "q", label: "Question", x: 40, y: 82, kind: "actor", note });
const emb = (note?: string): SceneNode => ({ id: "emb", label: "Embedder", x: 116, y: 38, kind: "service", note });
const store = (note?: string, down = false): SceneNode => ({ id: "store", label: "Vector store", x: 116, y: 126, kind: "store", note, down });
const rank = (note?: string, dim = false): SceneNode => ({ id: "rank", label: "Reranker", x: 208, y: 126, kind: "service", note, dim });
const llm = (note?: string, down = false): SceneNode => ({ id: "llm", label: "Model", x: 280, y: 82, kind: "service", note, down });

const EDGES = [
  { from: "q", to: "emb", dashed: true },
  { from: "emb", to: "store", dashed: true },
  { from: "store", to: "rank", dashed: true },
  { from: "rank", to: "llm", dashed: true },
  { from: "store", to: "llm", dashed: true },
  { from: "llm", to: "q", dashed: true },
  { from: "q", to: "llm", dashed: true },
];

export const rag: Machine = {
  id: "rag",
  title: "RAG: what reaches the model, and what quietly does not",
  subtitle: "Embed, retrieve, rerank, fit, answer. Break retrieval and watch the model answer anyway.",
  topicIndices: [53],
  steps: ["Embed the question", "Retrieve", "Rerank", "Fit the context", "Generate"],
  /*
   * Chunk size as something you pull, because "how many chunks fit" is a division nobody performs.
   * The budget is fixed; drag the chunk size and watch the number that survives fall, which is the
   * same trade every RAG system makes and almost nobody sees happen.
   */
  dials: [
    { id: "chunk", label: "Chunk size", min: 200, max: 3000, step: 100, unit: "tok", value: 800,
      hint: "Bigger chunks carry more context each and crowd each other out of the budget." },
  ],
  faults: [
    { id: EMPTY, label: "Retrieval returns nothing", blurb: "The store is reachable and matches nothing. The single most dangerous state in the whole pipeline." },
    { id: NO_RERANK, label: "Skip the reranker", blurb: "Ship whatever vector similarity ranked first. Similar is not the same as relevant." },
    { id: FAT_CHUNKS, label: "Chunks too large", blurb: "Fewer chunks fit the budget, so the right passage is the one that gets cut." },
  ],

  scene(step, phase, faults, dials): Scene {
    const p = clamp01(phase);
    const s = stepAt(step, 5);
    const empty = faults.includes(EMPTY);
    const skipRank = faults.includes(NO_RERANK);
    const fat = faults.includes(FAT_CHUNKS);
    // The fault is the shortcut; the dial is the arithmetic. Both land in the same place.
    const chunk = fat ? 2000 : dialValue(rag, dials, "chunk");
    // A fixed context budget, divided. 4,800 tokens is what is left for retrieved passages after
    // the question, the instructions and room for an answer.
    const fits = Math.max(0, Math.min(20, Math.floor(CONTEXT_BUDGET / chunk)));

    if (s === 0) {
      return { nodes: [q("why is my pod Pending?"), emb("1536 dims"), store(), rank(undefined, skipRank), llm()], edges: EDGES,
        tokens: [{ id: "e", from: "q", to: "emb", at: p, label: "text", tone: "normal" }],
        caption: "The question becomes a vector.",
        detail: "The same model must embed the documents and the query. Mixing embedding models is the silent misconfiguration that makes retrieval look merely mediocre rather than broken." };
    }

    if (s === 1) {
      if (empty) {
        return { nodes: [q(), emb(), store("0 matches", true), rank(undefined, true), llm()], edges: EDGES,
          tokens: [{ id: "r", from: "emb", to: "store", at: Math.min(p, 0.5), label: "nearest 20", tone: "fault" }],
          caption: "The store returns nothing at all.",
          detail: "Note what did NOT happen: no error, no exception, no alert. An empty result set is a perfectly valid response to a query, and everything downstream treats it as one.",
          fault: `Zero chunks retrieved.${fat ? " Chunk size is set too large as well, and it cannot matter: there is nothing to fit." : ""}${skipRank ? " The reranker is off as well, and that cannot matter either." : ""}` };
      }
      return { nodes: [q(), emb(), store(fat ? "20 chunks, 2000 tok each" : "20 chunks"), rank(undefined, skipRank), llm()], edges: EDGES,
        tokens: [{ id: "r", from: "emb", to: "store", at: p, label: "nearest 20", tone: fat ? "slow" : "normal" }],
        caption: "The store returns the twenty nearest chunks.",
        detail: "Nearest by cosine distance, which is a statement about wording and not about truth. A chunk that says the exact opposite of the right answer in the right vocabulary scores extremely well.",
        fault: fat ? "Each chunk is now large enough to crowd out the others." : undefined };
    }

    if (s === 2) {
      if (empty) {
        return { nodes: [q(), emb(), store("0 matches", true), rank("nothing to rank", true), llm()], edges: EDGES, tokens: [],
          caption: "There is nothing to rerank.",
          detail: "Every stage after retrieval degrades gracefully to doing nothing, which is exactly why the failure travels all the way to the answer without meeting resistance.",
          fault: `The pipeline is still perfectly healthy. It is just empty.${skipRank ? " You also turned the reranker off, which changes nothing while there is nothing to rank - two settings, one of them invisible." : ""}` };
      }
      if (skipRank) {
        return { nodes: [q(), emb(), store("20 chunks"), rank("skipped", true), llm()], edges: EDGES,
          tokens: [{ id: "k", from: "store", to: "llm", at: p, label: "top 6 by cosine", tone: "slow" }],
          caption: "The reranker is skipped. Vector order goes straight through.",
          detail: "A cross-encoder reads the question and the chunk together and can tell 'mentions Pending' from 'explains Pending'. Cosine similarity cannot, because it never sees them at the same time.",
          fault: "Ranked by similarity, not by usefulness." };
      }
      return { nodes: [q(), emb(), store("20 chunks"), rank("reordered"), llm()], edges: EDGES,
        tokens: [{ id: "k", from: "store", to: "rank", at: p, label: "20 candidates", tone: "normal" }],
        caption: "A cross-encoder reads each chunk against the question and reorders them.",
        detail: "Retrieve wide and rerank narrow. The first stage is cheap and should be generous; the second is expensive and should be strict. Getting that the wrong way round is the most common design mistake here." };
    }

    if (s === 3) {
      if (empty) {
        return { nodes: [q(), emb(), store("0 matches", true), rank(undefined, true), llm("context: question only")], edges: EDGES,
          tokens: [{ id: "c", from: "q", to: "llm", at: p, label: "question, no context", tone: "fault" }],
          caption: "The model receives the question and no supporting context.",
          detail: "This is the moment the system stops being a retrieval system and becomes a chatbot, without changing a line of code or logging anything unusual.",
          fault: `Nothing grounds the answer that is about to be produced.${fat ? " The chunk-size setting you changed is still wrong and still irrelevant: a budget cannot truncate an empty list." : ""}` };
      }
      return { nodes: [q(), emb(), store(), rank(undefined, skipRank), llm(`${fits} chunks fit`)], edges: EDGES,
        tokens: [{ id: "c", from: skipRank ? "store" : "rank", to: "llm", at: p, label: `top ${fits}`, tone: fat ? "slow" : "normal" }],
        caption: `${fits === 0 ? "No chunk fits" : fits === 1 ? "One chunk fits" : `${fits} chunks fit`} the ${CONTEXT_BUDGET}-token budget at ${chunk} tokens each.`,
        detail: "A cap that is too tight does not announce itself - the block still looks full. This repo shipped exactly that: a syllabus cap that made four sections structurally unreachable while every test passed.",
        fault: fits < 6 ? `At ${chunk} tokens a chunk, ${20 - fits} of the twenty retrieved passages are cut to make room. Retrieval found them; the budget threw them away.` : undefined };
    }

    if (empty) {
      return { nodes: [q(), emb(), store("0 matches", true), rank(undefined, true), llm("answering from priors")], edges: EDGES,
        tokens: [{ id: "a", from: "llm", to: "q", at: p, label: "fluent answer", tone: "fault" }],
        caption: "The model answers anyway. Confidently, and from memory.",
        detail: "It does not know that it was given nothing, so it cannot tell you. The only defence is upstream: check the retrieval count before the call and say 'I could not find anything' yourself.",
        fault: "This answer is indistinguishable from a good one until somebody verifies it." };
    }
    return { nodes: [q(), emb(), store(), rank(undefined, skipRank), llm("grounded")], edges: EDGES,
      tokens: [{ id: "a", from: "llm", to: "q", at: p, label: "answer + citations", tone: skipRank || fat ? "slow" : "normal" }],
      caption: "The model answers from the passages it was given.",
      detail: "Citations are what make this checkable. An answer you cannot trace back to a retrieved chunk is one you have to take on trust, and taking a generated answer on trust is the thing RAG exists to avoid.",
      fault: skipRank || fat ? "Grounded, but in weaker passages than the store actually had." : undefined };
  },
};
