/**
 * "The assistant got worse and nobody deployed anything."
 *
 * Plan row 53, and the system the RAG machine walks through. This one is chosen because every
 * component reports healthy. There is no error anywhere: the embedding model was silently upgraded
 * by the provider, the query vectors no longer live in the same space as the indexed ones, and
 * retrieval returns its nearest neighbours as it always has - they are just no longer related to
 * the question.
 *
 * The failure the whole pipeline is built to avoid is the one it produces here, fluently, with a
 * 200 on every span.
 */
import type { Incident } from "./types";

export const vagueRag: Incident = {
  id: "vague-rag",
  title: "The assistant got worse and nobody deployed anything",
  ticket:
    "Customer says: since about Tuesday the answers have been generic. Still confident, still " +
    "well written, just not about our documents any more. We have not changed anything. " +
    "Their words: it sounds like it is guessing.",
  topicIndices: [53],
  machineId: "rag",
  cause:
    "The embedding provider rolled a new default model version on Tuesday. Queries are now embedded " +
    "in a different space from the corpus, which was indexed in March. Cosine still returns the " +
    "nearest twenty vectors and they are no longer about the question. Nothing errored because " +
    "nothing failed - the dimensions match, so the arithmetic is valid and the meaning is gone.",
  probes: [
    {
      id: "traces",
      cmd: "curl -s $OBS/api/traces?service=assistant | jq '.spans[] | {name, status, ms}'",
      hint: "The customer says nothing is broken. Check whether anything reports as broken.",
      output:
        '{"name":"embed.query","status":"ok","ms":41}\n' +
        '{"name":"vector.search","status":"ok","ms":88}\n' +
        '{"name":"rerank","status":"ok","ms":210}\n' +
        '{"name":"llm.generate","status":"ok","ms":2740}\n\n' +
        "(Every span is 200. Latency is normal. There is nothing here.)",
    },
    {
      id: "retrieval",
      cmd: "curl -s $API/debug/retrieve -d '{\"q\":\"how do I rotate our API keys\"}' | jq '.chunks[:3]'",
      hint: "Look at what retrieval actually returns for a question you know the answer to.",
      output:
        '[\n' +
        '  {"score":0.06,"doc":"2019-brand-guidelines.pdf","text":"...our logo should never be..."},\n' +
        '  {"score":0.05,"doc":"office-move-faq.md","text":"...parking is available on level..."},\n' +
        '  {"score":0.05,"doc":"2019-brand-guidelines.pdf","text":"...the secondary palette..."}\n' +
        ']\n\n' +
        "(Twenty chunks came back. The top three are unrelated, and every score is near zero.)",
      decisive: true,
    },
    {
      id: "scores",
      cmd: "curl -s $API/debug/retrieve -d '{\"q\":\"how do I rotate our API keys\"}' | jq '[.chunks[].score] | {min:min, max:max}'",
      hint: "The shape of the scores, rather than the documents.",
      output:
        '{"min":0.02,"max":0.06}\n\n' +
        "(Before Tuesday this query's top chunk scored 0.89 and the twentieth scored 0.42. Now the whole " +
        "set sits under 0.06 with a 0.04 spread. Two signals, and you need both: the magnitude " +
        "collapsed, which is what unrelated vector spaces look like, AND the spread collapsed, which " +
        "is what having no signal to rank on looks like. Merely bad documents would keep the " +
        "magnitude and lose the spread.)",
      decisive: true,
    },
    {
      id: "embedmodel",
      cmd: "curl -s $API/debug/embed -d '{\"q\":\"test\"}' | jq '{model, dims}' && jq '.model, .indexed_at' index-manifest.json",
      hint: "What embeds the query now, and what embedded the corpus then.",
      output:
        '{"model":"text-embedding-3-large","dims":3072}\n' +
        '"text-embedding-3-large"\n' +
        '"2026-03-02T09:14:00Z"\n\n' +
        "(Same model name. Same dimensions. The provider's changelog notes a default version roll on " +
        "the 8th: same name, same dimension count, different weights.)",
      decisive: true,
    },
    {
      id: "reranker",
      cmd: "curl -s $API/debug/rerank -d '{\"q\":\"how do I rotate our API keys\"}' | jq '.[:2]'",
      hint: "Whether the reranker is rescuing anything.",
      output:
        '[\n  {"score":0.12,"doc":"office-move-faq.md"},\n  {"score":0.11,"doc":"2019-brand-guidelines.pdf"}\n]\n\n' +
        "(The reranker is working correctly and scoring everything it was given as irrelevant. It " +
        "cannot promote a document that retrieval never handed it.)",
    },
    {
      id: "deploys",
      cmd: "git log --oneline --since='3 weeks ago' -- services/assistant",
      hint: "Confirm or kill the customer's claim that nothing changed.",
      output:
        "(no commits)\n\n" +
        "(They are right. Nothing was deployed. Whatever changed, changed underneath them.)",
    },
  ],
  fixes: [
    {
      id: "reindex",
      label: "Re-index the corpus with the pinned model version",
      cmd: "pin embed model to text-embedding-3-large@2026-02 && reindex --all",
      resolves: true,
      effect:
        "Queries and documents are back in the same space. The rotate-API-keys question returns the " +
        "credentials runbook at 0.91 with a normal spread beneath it, and the answers are about the " +
        "customer's documents again. The pin is the part that stops it recurring.",
    },
    {
      id: "topk",
      label: "Increase top-k from 20 to 60",
      cmd: "set RETRIEVAL_TOP_K=60",
      resolves: false,
      effect:
        "Sixty unrelated chunks instead of twenty. The reranker now scores sixty things as " +
        "irrelevant, latency goes from 88ms to 240ms, and the answers do not change. Widening a " +
        "search in the wrong space searches more of the wrong space.",
    },
    {
      id: "swapllm",
      label: "Switch to a stronger generation model",
      cmd: "set LLM_MODEL=frontier-large",
      resolves: false,
      effect:
        "The answers get better written. They are still not about the customer's documents, and " +
        "they are now more convincing, which makes the failure harder for the customer to notice " +
        "and more expensive when they do.",
    },
    {
      id: "prompt",
      label: "Tighten the prompt to only answer from context",
      cmd: "deploy prompt v7: refuse when context is insufficient",
      resolves: false,
      effect:
        "This is the right instinct and it does something real: the assistant now says it cannot " +
        "find anything, instead of inventing an answer. The customer stops being misled and also " +
        "stops getting answers. The retrieval is still broken.",
    },
    {
      id: "clearcache",
      label: "Clear the vector store cache and restart",
      cmd: "redis-cli FLUSHDB && kubectl rollout restart deploy/assistant",
      resolves: false,
      effect:
        "Cold cache, same vectors, same results, forty seconds of elevated latency. Nothing in this " +
        "failure was cached.",
    },
    {
      id: "rollbackprompt",
      label: "Roll the assistant back to last month's release",
      cmd: "kubectl rollout undo deploy/assistant --to-revision=8",
      resolves: false,
      effect:
        "Deployed successfully, and identical. There was nothing wrong with the code - `git log` " +
        "already told you nothing shipped. Rolling back untouched code changes nothing twice.",
    },
  ],
};
