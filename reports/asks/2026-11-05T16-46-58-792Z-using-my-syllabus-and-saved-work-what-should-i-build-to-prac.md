# Lumen Ask

Date: 2026-11-05T16:46:58.792Z

## Question

Using my syllabus and saved work, what should I build to practise hybrid retrieval and reranking, and which recorded experiments show I have already tested it? Search my saved notes if evidence is missing. Cite your sources; do not infer completion.

## Plan context

Overview - headline progress across the plan, hours by month, the single next action, and the by-track breakdown.

## Answer

## What to build

Build a **Dokeo retrieval ablation repository** for plan row 54, “RAG at depth.” The syllabus calls for:

- A versioned set of 60 - 80 labelled questions, including unanswerable questions.
- One `make eval` command that runs a named configuration.
- Comparisons between:
  - A naive baseline
  - Structure-aware chunking
  - An alternate embedding model
  - Hybrid RRF retrieval
  - Cross-encoder reranking
  - Contextual retrieval
- Metrics for recall@5, recall@20, nDCG@10, citation-verified answer accuracy, latency, and cost.
- A stored `run_id` for every result.
- CI checks and a production runbook [S3].

This repository is your clearest practice artifact because it demonstrates both **how hybrid retrieval works** and **how you prove that reranking improves the system**.

### What “hybrid retrieval” means here

Hybrid retrieval combines two search methods:

1. **Dense retrieval** finds passages with similar meaning. It can retrieve a question about “closing a customer account” even when the documentation says “terminate an account.”
2. **Lexical retrieval** searches exact words. It is better for error codes, SKUs, API names, and version strings [S6].

A practical implementation can use:

- Dense search with pgvector.
- Keyword search with PostgreSQL full-text search.
- **Reciprocal Rank Fusion**, or RRF, to combine the ranked lists.

RRF is a ranking method. It gives useful credit to documents that appear in both result lists. It does not require the two scores to have the same scale.

### What “reranking” means here

The first retrieval stage returns many candidates, such as 50 chunks. A **reranker** then reads the query and each candidate together. It predicts which candidate is most useful for that query.

The syllabus explicitly gives cross-encoder reranking its own row in the ablation table [S3]. It also gives a useful diagnostic:

- High recall@50 but low recall@5 means the right passages were retrieved. Improve the ranking.
- Low recall@50 means the correct passages were never retrieved. Change chunking, embeddings, or hybrid retrieval [S10].

This distinction is important in an FDE interview. You should explain whether reranking solves a **ranking failure** or whether you actually need a **retrieval failure** fix.

## Minimum useful architecture

Start with the frozen baseline from the syllabus:

- Fixed 512-token chunks.
- No overlap.
- One embedding model.
- Cosine similarity.
- Top five results.
- One prompt.
- Temperature zero [S1].

Expose two replaceable functions:

```python
retrieve(query, k) -> list[Chunk]
answer(query) -> (text, cited_chunk_ids)
```

Then add the experiment pipeline:

```text
Question
  ├── Dense retrieval → top 50 candidates
  ├── Lexical retrieval → top 50 candidates
  ├── RRF fusion → top 50 candidates
  ├── Cross-encoder reranking → top 5 candidates
  └── Context assembly → answer → citation verification
```

For PostgreSQL, the keyword side can use:

- `to_tsvector('english', text)`
- A GIN index
- `websearch_to_tsquery`
- `ts_rank_cd`
- `pg_trgm` for typo and identifier matching [S6]

Do not add every component at once. Change one thing per run. Otherwise, you will not know which change caused the improvement.

## Recommended build sequence

### 1. Build the reproducible harness first

Persist:

- Model IDs
- Chunking parameters
- Retrieval depth
- Prompt hash
- Git commit
- Configuration name
- Every retrieved chunk with its question, rank, and `run_id` [S1]

The command should be something like:

```bash
make eval CONFIG=hybrid_rrf
make eval CONFIG=hybrid_rrf_reranker
```

Both commands must run against the same held-out set. A notebook result that cannot be reproduced is not enough [S1].

### 2. Implement dense plus lexical retrieval

Use two deliberately different test cases:

- A paraphrase question to demonstrate the strength of dense retrieval.
- An exact identifier question, such as `ERR_AUTH_403`, to demonstrate the strength of lexical retrieval [S6].

Combine their rankings with RRF. Save the candidate lists before and after fusion.

### 3. Add cross-encoder reranking

Rerank the top 50 fused candidates. Compare:

- Dense top five
- Lexical top five
- Hybrid RRF top five
- Hybrid RRF plus reranker top five

Report recall separately for these groups:

- Exact identifier questions
- Paraphrase questions
- Multi-hop questions
- Unanswerable questions [S10]

That breakdown will demonstrate that the retrieval method solves different failure classes.

### 4. Make citations verifiable

Give every context chunk a stable ID. Require the answer to cite those IDs. Then check:

- Every cited ID existed in the supplied context.
- Important numbers in the answer appeared in the cited text.
- Unanswerable questions cause the model to say that the context does not contain the answer [S2].

This makes citation errors observable rather than merely subjective.

### 5. Add production evidence

Include:

- A GitHub Actions workflow that reruns retrieval evaluations after relevant pull requests.
- A failure rule for a recall@5 regression greater than two points.
- A runbook covering re-embedding, deletion, reindexing, and ingest-lag monitoring [S3].
- Idempotent ingestion using a content hash.
- Separate embedding versions so old and new vectors cannot mix inside one index [S4].
- Safe deletion, tombstones, concurrent reindexing, and a tested rollback path [S5].

For FDE interviews, this turns “I used RAG” into “I built and operated a measurable retrieval system.”

## Which recorded experiments already test it?

I could not verify any recorded hybrid-retrieval or reranking experiment.

The available records show:

- Row 54, the RAG topic, is **not started** [S8].
- No shipped artifacts are recorded [S11].
- No study sessions are recorded [S11].
- A search for saved retrieval experiments, ablation reports, and reranking notes found the row 54 curriculum requirements, but no experiment record [S8].
- The only unrelated saved note I found was about shell scripting [S7].

Therefore, I cannot honestly say that you have already tested hybrid retrieval or reranking. The saved evidence says that no completion or experiment record exists. I cannot determine whether unrecorded local experiments exist outside this workspace.

## Best books for this build

The books are indexed locally, but their text is not in this workspace. I cannot claim to have read their passages.

- **Building Machine Learning Powered Applications**, Chapter 2, “Create a Plan”: use it to connect the retrieval experiment to a product decision and measurable outcome.
- **AI Engineering**, Chapters 6 and 7: use Chapter 6 for context assembly and Chapter 7 for choosing when model adaptation is or is not appropriate.
- **LLM Engineer’s Handbook**, Chapter 4, “RAG Feature Pipeline,” and Chapter 9, “RAG Inference Pipeline”: use them for implementation and deployment guidance.
- **Machine Learning Reference**, the modelling-workflow section: use it for evaluation methodology.

## Practical next step

Create the repository skeleton now:

```text
dokeo-retrieval-ablation/
├── Makefile
├── configs/
├── data/
│   ├── eval.jsonl
│   └── heldout.jsonl
├── src/
│   ├── dense.py
│   ├── lexical.py
│   ├── fusion.py
│   ├── reranker.py
│   ├── answer.py
│   └── metrics.py
├── runs/
├── .github/workflows/eval.yml
└── RUNBOOK.md
```

First commit only the baseline and harness. Do not start with the reranker. The next recorded milestone should be one reproducible `make eval` run with a stored `run_id`. That creates the evidence needed to compare hybrid retrieval and reranking honestly.

## Sources
[S1] RAG at depth: chunking, embeddings, hybrid retrieval, reranking, contextual retrieval, caching: Freeze a naive baseline and a one-command harness - /plan?row=54
Freeze a naive baseline and a one-command harness
Build the dumbest thing that works and then never change it: fixed 512-token chunks, no overlap, one embedding model, cosine top-5, one prompt, temperature 0. Put it behind two functions - retrieve(query, k) -> list[Chunk] and answer(query) -> (text, cited_chunk_ids) - so every later improvement is a swap of exactly one component. Persist run_config (model ids, chunk params, k, prompt hash, git sha) and write every retrieval result row-level to a

[S2] RAG at depth: chunking, embeddings, hybrid retrieval, reranking, contextual retrieval, caching: Context assembly, ordering and enforceable citations - /plan?row=54
Context assembly, ordering and enforceable citations
What lands in the prompt is a design decision, not a concatenation. Deduplicate near-identical chunks, merge adjacent chunks from the same document into one contiguous block carrying its section path, cap total context by tokens and drop from the tail rather than truncating mid-chunk, and order deliberately - models attend worse to the middle of a long context, so put the strongest evidence first and the next strongest last. Give every chunk a

[S3] RAG at depth: chunking, embeddings, hybrid retrieval, reranking, contextual retrieval, caching: proof of work - /plan?row=54
Publish a self-contained 'retrieval ablation report' repository over the Dokeo documentation corpus: a versioned JSONL eval set of 60-80 labelled questions (including unanswerable ones), a single `make eval` entrypoint that runs any named configuration against the held-out split, and a generated README containing the ablation table with one row per change - naive baseline, structure-aware chunking, alternate embedding model, hybrid RRF, cross-encoder reranking, contextual retrieval - and columns

[S4] RAG at depth: chunking, embeddings, hybrid retrieval, reranking, contextual retrieval, caching: Embedding pipeline mechanics: batching, limits, idempotency - /plan?row=54
Embedding pipeline mechanics: batching, limits, idempotency
Build ingestion as a batched, resumable job: 64-256 texts per request, a token-bucket that respects the provider's tokens-per-minute limit, retries on 429 and 5xx with exponential backoff plus jitter, and checkpointing by content_hash so a crash at 80% resumes instead of restarting. Normalise vectors to unit length when using cosine so you can switch to the cheaper inner-product operator, and only use a reduced dimensions parameter (Mat

[S5] RAG at depth: chunking, embeddings, hybrid retrieval, reranking, contextual retrieval, caching: Index operations: incremental ingest, deletes, re-embedding migrations - /plan?row=54
Index operations: incremental ingest, deletes, re-embedding migrations
Treat the index as a production database, not a build artifact. Support incremental ingest with upsert by content_hash and hard deletion of chunks whose document version disappeared - orphaned chunks answering from a terminated contract is a compliance incident, not a staleness bug - and know that HNSW deletes leave tombstones so recall and latency drift until you REINDEX CONCURRENTLY. Plan the re-embedding migration you will

[S6] RAG at depth: chunking, embeddings, hybrid retrieval, reranking, contextual retrieval, caching: Lexical retrieval in Postgres: tsvector, GIN, ranking, trigrams - /plan?row=54
Lexical retrieval in Postgres: tsvector, GIN, ranking, trigrams
Implement the keyword half properly: to_tsvector('english', text) in a generated column with a GIN index, query with websearch_to_tsquery (handles quoted phrases, OR and leading minus), and rank with ts_rank_cd plus a normalisation flag so long documents do not win purely by length. Be clear on what lexical search gives you that no embedding will - exact error codes, SKUs, API names, rare acronyms, version strings - and where it fai

[S7] Shell mastery: pipefail and EXIT traps - https://github.com/rasulshaikh/lumen-fde/blob/main/reports/notes/2026-09-05T16-14-29-610Z-shell-mastery-pipefail-and-exit-traps.md
# Shell mastery: pipefail and EXIT traps

Date: 2026-09-05T16:14:29.610Z

Core points from this week's shell work.

`set -euo pipefail` — `-e` exits on any failing command, `-u` rejects unset variables, and `-o pipefail` makes a pipeline return the first non-zero exit code instead of only the last command's. Without pipefail, `false | tee log` succeeds, which silently hides failures in the most common shape of shell code.

EXIT traps are the safe place for cleanup: `trap 'rm -f "$tmp"' EXIT` run

[S8] Plan row 54: RAG at depth: chunking, embeddings, hybrid retrieval, reranking, contextual retrieval, caching - /plan?row=54
RAG at depth: chunking, embeddings, hybrid retrieval, reranking, contextual retrieval, caching | G. AI Engineering | Month 13 | 16 hours. Baseline status Not started; live progress is a separate source. Goal: Beat naive RAG on your own eval set by a measured margin. Deliverable: RAG with eval numbers before and after each improvement. Resources: Anthropic: Contextual Retrieval + Pinecone Learning Center https://www.anthropic.com/news/contextual-retrieval | DeepLearning.AI: Building and Evaluatin

[S10] RAG at depth: chunking, embeddings, hybrid retrieval, reranking, contextual retrieval, caching: Retrieval metrics vs generation metrics - /plan?row=54
Retrieval metrics vs generation metrics
Compute recall@k, precision@k, MRR and nDCG@10 on retrieval alone, separately from any answer-quality score, and always report recall at the k you feed the model and at a much larger k (5 and 50). The gap between them is the single most useful diagnostic you own: high recall@50 with low recall@5 is a ranking problem (buy a reranker), low recall@50 is a representation problem (fix parsing, chunking, hybrid, embeddings). Know why end-to-end answer accuracy a

[S11] Recorded proof and study sessions - /overview
SHIPPED ARTIFACTS: none recorded yet. The plan carries one deliverable per row; none has been recorded.

STUDY SESSIONS: 0 recorded.
