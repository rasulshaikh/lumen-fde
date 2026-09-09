
## 1. VERDICT ON SOURCES

### Tier A - Ashby (single fetch, `descriptionPlain` inline, no stage 2 possible)

| Company | Token | Endpoint | Matches | Bytes |
|---|---|---|---|---|
| OpenAI | `openai` | `https://api.ashbyhq.com/posting-api/job-board/openai` | 72 | 12,913,585 |
| Snowflake | `snowflake` | `.../job-board/snowflake` | 81 | 4,751,640 |
| Applied Intuition | `applied` | `.../job-board/applied` | 30 | 4,364,950 |
| Sierra | `sierra` | `.../job-board/sierra` | 55 | 3,701,229 |
| Cohere | `cohere` | `.../job-board/cohere` | 28 | 2,353,921 |
| Mistral AI | `mistral.ai` | `.../job-board/mistral.ai` | 48 | 2,144,386 |
| Decagon | `decagon` | `.../job-board/decagon` | 34 | 1,728,080 |
| LangChain | `langchain` | `.../job-board/langchain` | 33 | 1,410,854 |
| Baseten | `baseten` | `.../job-board/baseten` | 5 | 1,142,581 |
| Perplexity | `perplexity` | `.../job-board/perplexity` | 4 | 965,373 |
| Fireworks AI | `fireworks` | `.../job-board/fireworks` | 10 | 897,717 |
| Abridge | `abridge` | `.../job-board/abridge` | 4 | 829,857 |
| Writer | `writer` | `.../job-board/writer` | 6 | 738,467 |
| Modal Labs | `modal` | `.../job-board/modal` | 6 | 271,264 |
| Anyscale | `anyscale` | `.../job-board/anyscale` | 2 | 222,952 |

**Subtotal: 38.44 MB, 418 matches.** Ashby has no per-job endpoint and no "omit descriptions" param, so this is a hard floor. Anyscale carries a **Lever tombstone trap** (`api.lever.co/v0/postings/anyscale` returns 200 with one fake posting) - the config must pin ATS per company and never fall back by slug guessing.

### Tier B - Greenhouse (two-stage: bare listing, then `/jobs/{id}` only for new matches)

| Company | Token | Bare-listing bytes | Matches |
|---|---|---|---|
| Databricks | `databricks` | 745,127 | 97 (literal-FDE family after tightening; 321 with bare `Solutions Architect`) |
| Datadog | `datadog` | 607,837 | 17 |
| Anthropic | `anthropic` | 422,479 | 40 |
| Samsara | `samsara` | 197,853 | 42 |
| Scale AI | `scaleai` | 169,340 | 36 |
| dbt Labs / Fivetran | `fivetran` | 167,293 | 16 |
| Cresta | `cresta` | 84,661 | 20 |
| Glean | `gleanwork` | 69,909 | 6 |
| Sigma Computing | `sigmacomputing` | 41,499 | 10 |
| Together AI | `togetherai` | 37,067 | 4 |
| Observe AI | `observeai` | 10,294 | 3 |

Listing: `https://boards-api.greenhouse.io/v1/boards/{token}/jobs` (no `?content=true`). Per-job: `https://boards-api.greenhouse.io/v1/boards/{token}/jobs/{id}`, ~10-16 KB each, HTML-entity-escaped HTML in `content`.

**Stage-1 subtotal: 2.55 MB, 291 matches.**

### Tier C - Lever

| Company | Token | Endpoint | Matches | Bytes |
|---|---|---|---|---|
| Palantir | `palantir` | `https://api.lever.co/v0/postings/palantir?mode=json` | 110 | 5,978,887 |

Lever has no listing-only mode. 110 matches is the densest board in the corpus and worth the 6 MB. Strip the 34 Intern / New Grad / "Year at Palantir" variants at classification.

### Dropped, with reasons

| Company | Reason |
|---|---|
| Harvey | 0 FDE roles across 348 postings. Its "Legal Engineer" family gates on bar admission and is explicitly no-code. Adding it injects ~24 false positives per scan. 4.58 MB saved. |
| Pinecone | 0 matches, 6-role board, only R&D + Marketing departments exist. |
| Confluent | 0 matches; the Ashby endpoint carries only the product-eng/PM slice, not Confluent's real field org. Polling it measures nothing. |
| Hugging Face | 0 matches, 6-role board, self-serve commercial motion, Workable ATS (a third adapter for zero yield). |
| Weights & Biases | 0 matches; post-CoreWeave the board is pure platform engineering. |
| Anduril | 34 matches but 2.33 MB bare listing for 2,211 rows, and the Technical Operations Engineer ladder is overwhelmingly US-person / clearance gated. Wrong eligibility for a Pune-based candidate. |
| Vannevar Labs | 3 matches, all requiring active TS/SCI and onsite classified presence. Practical yield zero. |
| Retool | 2 matches, both London, behind Gem's **undocumented internal GraphQL** (`POST https://jobs.gem.com/api/public/graphql`) which can gain a persisted-query allowlist at any time. A fourth adapter for a fragile 2-role return. |
| Remotive, RemoteOK, all aggregators | ToS. Remotive requires attribution + link-back, caps ~4 calls/day, and forbids using listings to collect emails - a digest email is arguably exactly that. First-party ATS only, permanently. |

### Budget

- **27 boards.** 819 pattern-matching postings, collapsing to roughly **380-430 distinct requisitions** after location-clone dedupe.
- **Daily decompressed volume: ~47 MB** (38.44 Ashby + 5.98 Lever + 2.55 GH stage 1 + ~0.2 GH stage 2 in steady state).
- **Daily wire volume: ~8-10 MB.** The measured figures above come from `curl`, which does not send `Accept-Encoding` by default. Node's `fetch` does, and decompresses transparently; JD-heavy JSON with duplicated HTML+plaintext bodies compresses roughly 5-8:1. Budget the 47 MB for parse time and heap, the 9 MB for egress.
- **Cold start adds ~4 MB once** (291 Greenhouse per-job fetches).
- **Time: 240 s wall-clock target, 220 s hard deadline, 45 s per-board timeout, concurrency 6.** Fits a 300 s `maxDuration`. Section 2 describes the cursor that makes it survive a 60 s cap.

---

## 2. FETCH ARCHITECTURE

### Stage 1 - listing

Per board, one request. `AbortSignal.timeout(45_000)`. Adapter normalizes to a common shape:

```
Posting = {
  company, ats, sourceId,        // Ashby job.id | Greenhouse job.id | Lever posting.id
  title, titleRaw,               // titleRaw preserves trailing whitespace before trim
  location, department, team,
  url,                           // jobUrl | absolute_url | hostedUrl
  publishedAt,                   // publishedAt | first_published | createdAt - display only
  jd: string | null              // present for Ashby/Lever, null for Greenhouse
}
```

Mandatory normalization before anything else: **`title.trim()`**. Anyscale ships `"Head of Customer Engineering "`, Sierra ships `"Deployed Infrastructure Engineer "` and `"Strategist, Agent Development "`, Retool and Writer ship trailing spaces, Databricks ships leading tabs, dbt/Fivetran ships `" Staff Product Manager - dbt v2"` with a leading space. Matching is case-insensitive throughout (Writer uses sentence case: `"AI deployment engineer"`).

### Stage 1.5 - title filter

Filter on `titlePatterns` from `data/market-sources.json`, per company, never globally. The verified per-company evidence is the whole asset here: `Applied AI` is core FDE at Mistral and Anthropic, and a **false positive** at Databricks and Perplexity. `Solutions Engineer` is genuine engineering at Scale and Glean, and internal IT at OpenAI. There is no global pattern list; the config is the deliverable.

Three filter fields per company:
- `core[]` - build-role substrings.
- `adjacent[]` - pre-sales SE/SA, Implementation Consultant, Engagement Manager.
- `exclude[]` - substrings that void a match. Non-negotiable entries: Anduril's `HVAC`; Sierra's `Agent Builder`, `Agent Runtime`, `New Grad`; Databricks' `Recruiter`, `Enablement`, `Engagement Manager`, `Technical Program Manager`, `Statutory`; Datadog's `Manager`/`Director`/`Area Vice President` prefixes on `Services Architect` and `Product Solutions Architect`; Palantir's `Intern`, `New Grad`, `Year at Palantir`.

Two companies need **structured-field guards**, not substrings:
- **Sierra**: `title contains "Software Engineer, Agent"` **AND** `department === "Engineering"` **AND** `team === "Agent Engineering"`.
- **Baseten**: `team` contains `"FDE"` or `"Forward Deployed"` - this is the only way to catch `"AI Inference Engineer"`, whose body opens *"As a Forward Deployed Engineer at Baseten..."* but whose title contains no FDE substring. A title-only filter silently misses it.

**Never match on description text for classification.** 23 of Baseten's 88 postings mention "forward deployed" - including `Account Executive - Enterprise` and `Site Reliability Engineer` - because unrelated roles describe partnering with the FDE team. Description text is for *skill extraction only*, after a role has already been classified by title/department.

### Stage 2 - JD fetch

Triggered **only** for Greenhouse postings that (a) passed the title filter and (b) whose `company::sourceId` is absent from the stored seen-set. Ashby and Lever JDs arrive in stage 1 at no extra cost.

Steady state: 0-15 fetches per run. Concurrency 4, 20 s each. If a per-job fetch fails, the req is stored with `skills: null` and re-attempted next run (a null-skill req is excluded from benchmark denominators, so a failed fetch understates a count rather than corrupting it).

### "New since last run"

**The seen-set is authoritative. `updated_at` / `publishedAt` are not used for this decision.** Greenhouse's `updated_at` churns on any edit including typo fixes; Ashby's `publishedAt` is stable but boards backfill and re-list. A req is new iff `company::sourceId` is not a key in `index.json.reqs`.

Cold start (`index.json` missing or `reqs` empty): every req is written with `firstSeen = now`, and the run emits `baseline: true` and **no** new-roles list. The digest prints "market baseline established, N requisitions" once, then never again.

### Failure isolation

`Promise.allSettled` over boards. Per board, record `boards[company] = { ok, error, total, matched, fetchedAt, bytes }`.

The critical rule: **the missing-sweep runs only for boards that returned `ok` this run.** Without it, one Ashby 500 marks all 55 Sierra reqs as disappeared, and the next successful run reports 55 "new" roles. A failed board's entries keep their previous `lastSeen` untouched.

`boardsOk` is written to the snapshot. If `boardsOk < 24`, the movement/delta line is suppressed everywhere (email and tab) and replaced with "partial scan, N of 27 boards, deltas suppressed."

### The 60-second escape hatch

`index.json.cursor` holds the index of the next board to start. The route walks boards from the cursor, checking a wall-clock deadline (`SCAN_DEADLINE_MS`, default 220_000) before starting each new board. On deadline it stops, writes the cursor, and returns `{ partial: true, cursor }`. The missing-sweep and the benchmark recompute run **only when the cursor wraps to 0**, i.e. a full cycle completed. This makes the design correct under a 60 s cap (a full cycle takes 3-4 daily invocations) without any code change - set `SCAN_DEADLINE_MS=50000`.

---

## 3. STORAGE

Follows `app/api/review/route.ts`: one file, read whole, written whole with its `sha`. Rationale is the same one that route documents - this is mutable state rewritten every run, not an append-only history.

### `reports/market/index.json` - the inventory and seen-set

```json
{
  "version": 1,
  "updatedAt": "2026-09-07T03:04:11Z",
  "cursor": 0,
  "boardsOk": 27,
  "boards": {
    "openai": { "ok": true, "total": 780, "matched": 72, "bytes": 12913585, "fetchedAt": "...", "error": null },
    "sierra": { "ok": false, "total": 0, "matched": 0, "bytes": 0, "fetchedAt": "...", "error": "HTTP 502" }
  },
  "reqs": {
    "openai::a1b2c3-...": {
      "company": "OpenAI",
      "title": "Forward Deployed Engineer, Healthcare",
      "key": "openai::forward deployed engineer healthcare",
      "location": "San Francisco",
      "url": "https://jobs.ashbyhq.com/openai/a1b2c3-...",
      "class": "core",
      "publishedAt": "2026-08-19",
      "firstSeen": "2026-08-20",
      "lastSeen": "2026-09-07",
      "missingSince": null,
      "skills": ["evals","agents","rag","tool-use","mcp","guardrails","security-compliance","latency-cost","python"]
    }
  }
}
```

**JD text is never stored.** It is fetched, stripped, matched, and discarded in-memory; only the `skills` fingerprint persists. That is what keeps this file at roughly 400-550 KB for ~420 reqs, and it means the benchmark can be recomputed from `index.json` alone - no re-fetch - whenever `market-skill-map.json` changes. (Changing the *skill definitions* does require a re-scan; changing the *plan-row mapping* or the phrasing does not.)

**Seen-set bounding, three mechanisms:**
1. A req absent from an `ok` board gets `missingSince = today`. It is **deleted** after 14 consecutive days missing. Board absence means the req closed.
2. Hard cap 3,000 entries; on overflow, evict by oldest `lastSeen` first. This stops a token change that starts returning a foreign board's 2,000 roles from exploding the file.
3. `class: "junior"` and unmatched postings are never written at all.

Steady state is therefore ~420 live + up to two weeks of decay ≈ 500 entries.

### `reports/market/benchmark.json` - the computed snapshot

Rewritten on every full cycle. Read by `/api/market` and by the weekly email. Contains `computedAt`, `coreCount`, `adjacentCount`, `companyCount`, `boardsOk`, and the arrays `coverage[]`, `gaps[]`, `overInvested[]`, `newSinceLastRun[]` - each entry already carrying its rendered statement string, so the tab and the email render identical text and there is one place to fix a sentence.

### `reports/market/trend.json` - the sparkline

A single file, appended-and-truncated to the last 180 points: `[{ "d":"2026-09-07", "core":412, "companies":25, "s":{"evals":0.67,"agents":0.61,...} }]`. One point per full cycle, ~40 KB at cap. Rewritten whole with its sha.

### `reports/market/history/2026-09-07.json` - write-only archive

The only append usage: the full snapshot for that day, for auditing a number that looks wrong. **Nothing ever lists or reads this directory in a request path**, which is precisely the N+1 that `app/api/progress/route.ts` documents (it lists `reports/progress` then re-fetches each file individually, capped at 100). The tab reads `benchmark.json` and `trend.json` - two fixed paths, two requests, no fan-out. If the archive is ever needed, it is read by hand in GitHub's UI.

---

## 4. THE BENCHMARK

### Step 1 - the denominator

Two role classes, and **the headline percentage is computed over CORE only.**

- **CORE** - hands-on build roles: literal Forward Deployed Engineer, plus verified house equivalents (Palantir Deployment Strategist, Sierra `Software Engineer, Agent` + `Agent Strategist`, Decagon `Agent Deployment Engineer`, Scale `Frontier Agents Engineer`, LangChain `Deployed Engineer`/`Deployed Architect`, Cohere FDE, Anduril-style `Technical Operations Engineer`, Anthropic `Applied AI Architect`, Fireworks `AI Field Engineer`/`Applied Machine Learning Engineer`, Writer `AI deployment engineer`, Observe AI `AI Agent Engineer, Client Facing`, Modal/Anyscale `Customer Engineer`).
- **ADJACENT** - pre-sales `Solutions Architect`/`Solution Engineer`/`Sales Engineer`, `Implementation Consultant`, `Engagement Manager`, and every title containing Manager / Director / Head of / VP.

If ADJACENT went into the denominator, "the market" would be measured by 169 Databricks Solutions Architects and 39 Datadog Sales Engineers, and the answer would be about pre-sales, not FDE. ADJACENT is counted and displayed separately - it is real signal about where the roles are - but it never sets a headline number.

**Requisition dedupe** before counting: `key = company + "::" + normalizedTitle`, where normalization lowercases, collapses whitespace, and strips a curated location/region vocabulary from suffixes and parentheses (`- Germany`, `, EMEA`, `(Singapore)`, `- Tokyo`, `, UK`, `- Bay Area`, city names from a fixed list). Seniority tokens (Senior, Staff, Lead, Sr.) are **kept** - they are the signal, not the noise. This collapses LangChain's 15 `Deployed Engineer (City)` clones to 1, Harvey-style location fan-out generally, and Samsara's 6 region-cloned Mid-Market SEs to 1. Without it, LangChain and Databricks would dominate every percentage.

The denominator is reported as a pair everywhere: **`x of N reqs, across C of K companies`**. A skill that is 100% of one company's 26 cloned reqs must be visibly distinguishable from a skill that is 40% across 12 companies.

### Step 2 - JD text to skill hits

Four passes, in order:

**(a) Boilerplate removal.** Two mechanisms, because static lists rot:
- Static per-company blocks in `market-sources.json` (Anthropic's *"reliable, interpretable, and steerable AI systems"*, Applied Intuition's *"is powering the future of physical AI"*, Harvey-style intros, EEO paragraphs). The taxonomy work already verified that leaving Anthropic's mission sentence in corrupts naive term counts.
- Automatic: any normalized line ≥40 chars appearing in **≥60% of that company's matched postings** is dropped for that company. Self-maintaining; catches boilerplate rewrites without a config edit.

**(b) Normalization.** Greenhouse `content` is HTML-entity-escaped HTML - `html.unescape` then strip tags. Ashby/Lever have `descriptionPlain` already. Then lowercase, collapse whitespace, punctuation to spaces except inside protected tokens (`llm-as-a-judge`, `soc 2`, `fine-tune`).

**(c) Section scoping.** Keep from the first responsibilities/requirements heading (`what you'll do`, `responsibilities`, `you may be a good fit`, `requirements`, `qualifications`, `about the role`) and cut at the first tail heading (`benefits`, `compensation`, `salary range`, `equal opportunity`, `we are an equal`, `how we're different`). If no heading is found, keep the whole body. This alone removes most of the perks-and-values noise.

**(d) Matching.** Per skill, a boolean over the requisition - **presence, not occurrence count.** Three noise controls, all configurable per skill:

1. `include[]` - literal phrases, word-boundary matched.
2. `exclude[]` - a hit inside one of these phrases is void. Real examples: `evals` excludes `performance evaluation`, `self-evaluation`, `candidate evaluation`; `field-engineering` excludes `field marketing`, `field enablement`, `field activation`.
3. `proximity` - the hit must sit within ±80 chars of one of a required term set. This is the main anti-noise device. `fine-tuning` requires `model|llm|weights|adapter|dataset` nearby, which kills "fine-tune the process". `deployment` requires `customer|production|enterprise|environment` nearby, which kills "inference deployment" and "data center capacity delivery".
4. `minDistinctForms` - a weak skill fires only when ≥2 distinct surface forms appear. `mlops` needs both a pipeline term and a model term.

Skills are **capability terms, never title terms**. `Applied AI` is a job-title string that means customer-facing at Mistral and core research at Perplexity; it is therefore not a skill. Skills are `evals`, `agents`, `rag`, `tool-use`, `mcp`, `prompt-engineering`, `observability`, `latency-cost`, `guardrails`, `fine-tuning`, `embeddings`, `security-compliance`, `human-in-the-loop`, `llm-as-judge`, `model-routing`, `python`, `kubernetes`, `discovery`, `scoping`, `sow-docs`, `demos-exec-comms`, `domain-fluency`, `air-gapped-delivery`, `handover`, `pattern-codification`, `value-measurement`, `enablement-training`.

### Step 3 - skills to plan rows

`data/market-skill-map.json` is **hand-authored and static**, built from the two taxonomy reports. No model touches it. Only the counting is automated; the mapping is audited once and reviewed when the plan changes.

```json
{
  "id": "evals",
  "label": "Evals and evaluation frameworks",
  "include": ["eval", "evals", "evaluation framework", "evaluation harness", "llm-as-a-judge",
              "llm as a judge", "golden dataset", "regression suite", "grader", "offline benchmark"],
  "exclude": ["performance evaluation", "self-evaluation", "candidate evaluation", "evaluation of candidates"],
  "proximity": { "terms": ["model","llm","agent","prompt","quality","production"], "window": 80 },
  "primaryRow": 59,
  "supportRows": [51, 63, 98, 104],
  "evidence": "row 59 subtopics cover the 200-case set with stratified sampling, judge validation against humans, judge pathologies, the CI gate with per-class floors, paired bootstrap and McNemar"
}
```

Month, hours and baseline status come live from `workbook.Plan[row]` cols 1, 13, 15 - so a plan edit updates the sentences without touching the map. The email uses col 15 (the committed baseline); the Market tab merges the client's `lumen-statuses` from localStorage on top, same as the Plan tab.

Gaps are entries with `primaryRow: null` plus a `nearestRow` and a `whyNotCovered` string carried verbatim from the verified taxonomy - the system must never *infer* that a gap exists, only report a mapping a human already audited.

### Step 4 - the actual sentences

**Coverage (top block, sorted by percentage descending):**

> **Evals and evaluation frameworks - 67% of core FDE requisitions (33 of 49), 3 of 6 companies.**
> Covered: row 59, "Evals as infrastructure: eval sets, LLM-as-judge, human review, CI gates" - 18h, month 14. Status: not started. Supporting rows 51, 63, 98, 104.

> **Agents and agentic systems - 61% (30 of 49), 4 of 6 companies.**
> Covered: row 53, "Agents: workflows vs agents, planning, memory, multi-agent, human-in-the-loop" - 16h, month 13. Plus row 57, "Hermes Agent (Nous Research) in production" - 13.5h, month 13.

> **RAG and retrieval - 31% (15 of 49), 2 of 6 companies.**
> Covered: row 54, "RAG at depth: chunking, embeddings, hybrid retrieval, reranking, contextual retrieval, caching" - 16h, month 13. Your plan goes deeper than the market asks: no posting in this corpus uses the words "chunking" or "reranking".

> **MCP servers - 28% (14 of 49), 3 of 6 companies.**
> Covered: row 52, "Tool use, structured outputs and MCP servers" - 14h, month 12.

**Gaps:**

> **GAP - Codifying field patterns back into Product and Research. 80% of the craft corpus (12 of 15 reqs), 4 of 4 companies.**
> No plan row covers this. Nearest: row 74 teaches SOW and handover templates; row 80 teaches templatising a status pack. Neither is the pattern-library or accelerator motion the JDs describe. 0h scheduled against the single highest-frequency bullet in the corpus.

> **GAP - Pre-sales technical account leadership (use-case portfolio, proof of value, adoption plan, technical win). 33% (5 of 15), and 5 of 5 Architect- and SE-titled reqs - the ones carrying the top bands in this corpus.**
> No plan row. Row 73 teaches discovery and row 75 teaches demos; neither teaches the account-plan motion. 0h scheduled.

> **GAP - Knowledge graphs and GraphRAG. 3% (3 of 95 postings), 1 company (Scale AI).**
> No plan row. Nearest: row 119, graph neural networks - 15h, month 23 - which is graph learning, not graph-backed retrieval. Low priority at this frequency.

> **GAP - Voice and speech agents (ASR, TTS, turn-taking, real-time latency budgets). 8% (8 of 95), 3 companies - Sierra, Decagon, Scale.**
> No plan row. Row 35 gives the streaming transport half only. Concentrated entirely in the CX-agent vendor segment; absent from OpenAI and Anthropic FDE reqs.

**Over-investment (the finding that actually changes behaviour):**

> **OVER-INVESTED - Track N, Machine Learning Systems: 10 rows, 121.5h, months 18-22. Surface-language match in the current corpus: 1 posting of 95, one Scale public-sector line, "deploying deep learning solutions."**
> Track O, Deep Learning and Multimodal: 9 rows, 129h, months 22-23 - 0 of 95. Track M, Mathematical Foundations: 7 rows, 84.5h - 0 of 95.
> Combined: 335h, 21% of your 1,588 active hours, against ~1% of JD surface language. PyTorch: 0 postings. TensorFlow: 0. XGBoost, scikit-learn, SHAP: 0. vLLM, quantisation, GPU: 0.
> Defensible as depth behind the answer. Not defensible as scheduled hours if the goal is a role in this corpus.

**Movement (only emitted when a percentage moves ≥3 points or a skill crosses 25/50/75%; otherwise the line is omitted entirely):**

> **MOVED THIS WEEK - MCP servers 28% → 33% (+5). Fine-tuning 18% → 14% (−4). No other skill moved more than 2 points.**

**New roles (daily digest, capped at 3, omitted when zero):**

> **NEW CORE REQS - 3.** Cohere, Forward Deployed Engineer, Singapore. Modal, Forward Deployed Engineer - Systems, New York. Fireworks, AI Field Engineer, Enterprise, San Mateo.

---

## 5. SURFACING

**Not** a fifteen-line block bolted onto the daily digest. That email is a study brief for one topic, and market percentages move by fractions of a point per day - printing them every morning trains you to skip the email.

Three placements, each matched to how fast the underlying thing changes:

**a. Daily digest - one conditional section, max 3 lines, omitted when empty.**
Only `newSinceLastRun` where `class === "core"`, capped at 3 with "+N more". Most mornings this section does not render at all. It goes after `SHIP THIS` and before `ANSWER THIS COLD`, so the study content still leads. Deterministic, no model involvement.

**b. New dashboard tab, "Market"** - added to `TABS` in `app/page.tsx` between "Comp reality" and the end. This is where coverage, gaps, over-investment and the trend sparkline live, always current, never emailed. It is a reference surface, consulted when deciding what to do next, which is exactly the decision the benchmark should inform. It sits naturally beside "Comp reality", which is the other market-facing, non-study tab.

**c. Weekly market email, Monday** - the full benchmark plus week-over-week movement. Weekly matches the rate the numbers actually move, and matches the plan's existing pacing unit (the digest already reasons in "16h/week").

Same discipline as `daily-digest`: **deterministic body, at most one model paragraph.** The model is given the already-computed numbers and asked for ≤60 words on *what to do about it this week*. It is forbidden from producing a number - the prompt says so and the post-check drops the paragraph if it contains a digit that is not in the supplied set. Reuse `clean()` from `daily-digest/route.ts` verbatim (the MiniMax `<think>` stripping, including the unclosed-tag case). Model failure costs a paragraph, not the email. Same `console.error` on empty framing.

---

## 6. FILES TO ADD OR CHANGE

### Add

| Path | Responsibility |
|---|---|
| `data/market-sources.json` | The 27 boards. Per company: `company`, `ats`, `token`, `listUrl`, `jobUrl` template, `tier`, `core[]`, `adjacent[]`, `exclude[]`, `fieldGuards` (Sierra dept+team, Baseten team), `boilerplate[]`. **This file is the asset** - the verified per-company evidence. Every entry carries a `verifiedAt` date and a one-line `why` so a future reader knows the pattern was audited against real JD bodies, not guessed. |
| `data/market-skill-map.json` | Skills (`include`/`exclude`/`proximity`/`minDistinctForms`/`primaryRow`/`supportRows`/`evidence`), gaps (`nearestRow`/`whyNotCovered`), over-invested tracks (row ranges + measured JD frequency). Hand-authored, no model. |
| `lib/market/fetch.ts` | Three ATS adapters (ashby, greenhouse, lever) → common `Posting`. Per-board `AbortSignal.timeout`. Title trim. Returns `{ ok, postings, error, bytes }`, never throws. |
| `lib/market/classify.ts` | Title normalization, location-suffix stripping, dedupe key, core/adjacent/leadership/junior classification, field guards. Pure. |
| `lib/market/skills.ts` | Boilerplate strip (static + 60% auto), HTML unescape + tag strip, section scoping, include/exclude/proximity/minDistinctForms matching. Pure, takes text in and skill ids out. |
| `lib/market/benchmark.ts` | `index.json` + `workbook` + `market-skill-map` → the rendered statement strings. **Pure, no network.** This is what makes the output testable. |
| `lib/market/store.ts` | GitHub read-whole / write-whole-with-sha, mirroring `app/api/review/route.ts` including its degrade-when-`GITHUB_TOKEN`-is-missing behaviour. |
| `lib/market/benchmark.test.mts` | Sits beside `lib/review.test.mts`, same runner. Fixtures: ~40 synthetic postings. Must assert the guards fire - `Field Marketing Manager` is not core; Perplexity's `MTS (Software Engineer, Applied AI)` is not core; Sierra's `Software Engineer, Agent Builder` is excluded by team; Baseten's `AI Inference Engineer` **is** core via team; `Technical Accounting & Reporting Senior Manager` does not match `Technical Account`; 15 LangChain city clones collapse to 1. |
| `app/api/cron/job-scan/route.ts` | `CRON_SECRET` bearer guard (copy the guard from `daily-digest`). Orchestrates both stages, writes the three files, and **on `getUTCDay() === 1` also sends the weekly benchmark email**. |
| `app/api/market/route.ts` | `GET` → `benchmark.json` + `trend.json`. Login-gated (see below). Degrades to `{ benchmark: null, synced: false }` when the files or the token are absent, so the tab renders an empty state rather than erroring. |
| `app/market.tsx` | The Market tab, client component, following the `app/recall.tsx` / `app/terminal.tsx` shape. Renders `benchmark.json`'s pre-rendered statements, merges `lumen-statuses` from localStorage for the live status line, links each cited row to the Plan tab. |

### Change

| Path | Change |
|---|---|
| `app/page.tsx` | Add `"Market"` to `TABS`; add `{tab === "Market" && <Market />}`. The footer already prints `{TABS.length} views` and updates itself. |
| `app/api/cron/daily-digest/route.ts` | Read `reports/market/index.json` via `lib/market/store.ts`. Compute `newSinceLastRun` core reqs. Add one `row("New core reqs", …)` to the HTML table and the matching block to `text`, both wrapped in a conditional so they vanish when empty. **Wrap the read in try/catch that returns `[]`** - a GitHub outage must not stop the study brief from sending. This is the same rule the file already applies to the MiniMax call. |
| `vercel.json` | Add one cron: `{"path":"/api/cron/job-scan","schedule":"0 3 * * *"}` - 30 minutes before the existing `daily-digest` at `30 3 * * *`, so the digest reads fresh data. |

**Two crons total, not three.** The weekly email is folded into `job-scan` behind a Monday check rather than given its own entry, because Vercel Hobby caps at 2 cron jobs with daily-only granularity. This design works unchanged on either plan.

**Proxy: no change needed.** `proxy.ts` already exempts `path.startsWith("/api/cron")`, which covers `/api/cron/job-scan`. `/api/market` is a read endpoint for the logged-in dashboard and **must stay behind the gate** - it falls through to the session check and returns 401 JSON for an unauthenticated API call, which is the correct behaviour. Do not add an exemption for it.

**No new secrets.** `GITHUB_TOKEN`, `RESEND_API_KEY`, `RESEND_FROM_EMAIL`, `CRON_SECRET`, `MINIMAX_API_KEY` all reused. Optional `MARKET_TO_EMAIL` defaults to `DIGEST_TO_EMAIL`. Optional `SCAN_DEADLINE_MS` defaults to 220000.

---

## 7. FAILURE MODES AND WHAT IT COSTS

**A board changes its token.** The endpoint 404s, the adapter returns `{ ok: false }`, that board's reqs keep their `lastSeen` and are not swept. `boardsOk` drops to 26, the tab shows "Snowflake: HTTP 404 since 2026-09-07", and deltas are suppressed if two more boards fail. Nothing silently degrades to a wrong number. **Fixing it is manual** - re-derive the token (careers-page grep first, then slug variants, and never accept a 200 without checking the body: Anyscale's Lever tombstone and Mistral's empty `[]` Lever board both return 200). Realistic frequency: 1-3 token changes a year across 27 boards.

**A board silently truncates.** The worst case, because it is a false negative that looks like success. Guard: `market-sources.json` stores the `verifiedTotal` from the audit; if a board returns fewer than 60% of that, mark it `ok: false, error: "suspiciously small: 40 of 780"` rather than accepting it. This is exactly what bit the Decagon audit, where WebFetch returned 10 of 139 jobs and produced 2 matches instead of 34.

**A partial scan.** With the cursor, a partial run is a normal state, not an error: boards not reached keep yesterday's data, the missing-sweep and the benchmark recompute are skipped, and the digest still sends. The visible cost is that "new roles" for the unreached boards arrives a day late.

**A Greenhouse per-job fetch fails.** That req is stored with `skills: null` and excluded from every denominator. It retries next run. The count is understated by one, never corrupted.

**The model is down.** The weekly email loses one paragraph. The daily digest is already immune. The Market tab never calls the model at all - every statement it renders is deterministic. This is deliberate: a market benchmark whose numbers came from a model is not a benchmark.

**GitHub is down.** `job-scan` cannot persist; it returns 502 and the next run re-derives from the last stored state, so nothing is lost except a day of "new roles". The daily digest's try/catch means it still sends the study brief. The Market tab shows stale data with its `computedAt` timestamp visible - always render the timestamp, so stale data is obviously stale.

**Honest ongoing maintenance burden.** This is the real cost:
- **~30 min/quarter** re-verifying the highest-value patterns. Title vocabulary drifts - Anthropic did not have "Forward Deployed Engineer" 18 months ago; Datadog is standing up an FDE org right now; Abridge's FDE PM req literally announces a motion that does not exist yet.
- **~1 hour/year** on token breakage across 27 boards.
- **The `exclude[]` lists rot fastest.** They are negative evidence about titles that exist today. When Databricks posts a "Forward Deployed HVAC Technician", precision drops until someone adds a guard. Mitigation: the Market tab shows the 10 most recently added core reqs with their matched patterns, so a bad match is visible within a day rather than quietly inflating a percentage for months.
- **The skill map is the thing that must not be automated.** Every attempt to have a model infer skill→row mapping will produce plausible mappings that are wrong in the specific way the taxonomy already documented - "Applied AI" at Databricks, "Legal Engineer" at Harvey, "Solutions Engineer" at OpenAI. Budget an hour whenever the plan is restructured.

---

## 8. WHAT I WOULD CUT

**Cut from v1:**

- **Aggregators, permanently.** Not scope - a boundary. Remotive and RemoteOK were already rejected on ToS and must not come back as "just one more source".
- **The three fragile or zero-yield adapters.** Retool's undocumented Gem GraphQL, Hugging Face's Workable widget. Two adapters for 2 roles at boards with zero FDE yield, either of which can break without notice.
- **Anduril and Vannevar Labs.** 37 combined matches that are structurally unavailable to a Pune-based candidate without a US clearance. Scanning them produces a number that flatters the corpus and cannot be acted on.
- **Full-text search over stored JDs.** Tempting, and it is why you would want to keep the description text. Don't - storing JD text turns a 500 KB index into a 40 MB one and makes the GitHub write-whole pattern untenable. Store the skill fingerprint. If a specific JD is needed, the `url` is right there.
- **Salary extraction and comp benchmarking.** Ashby's `?includeCompensation=true` makes it look cheap, and it is not: bands are inconsistently populated, currency- and geography-mixed, and often absent on exactly the roles you care about. It would produce a confident-looking number built on a biased sample. There is already a "Comp reality" tab that is honest about not knowing.
- **Model-written skill extraction.** Sending 420 JDs to MiniMax to "identify required skills" is the obvious v1 idea, costs real money daily, is non-deterministic run to run (so week-over-week movement becomes uninterpretable), and would silently reintroduce every false positive the taxonomy work eliminated. The include/exclude/proximity matcher is auditable and free. Keep the model to the one framing paragraph.
- **Per-role fit scoring / "should I apply to this".** A different feature with a different failure mode. It also converts a market-measurement tool into a job-application tool, which changes what it is for.
- **Alerting on individual roles beyond the 3-line digest cap.** A push notification per new FDE req is a notification you will mute within two weeks, and muting it kills the daily digest with it.
- **Historical backfill.** There is no way to get yesterday's board state. Day 1 is `baseline: true`; the trend line starts empty and fills in. Say so in the UI rather than faking it.

**Keep in v1, do not cut:** the CORE/ADJACENT split, the location-clone dedupe, the boilerplate stripper, the proximity guards, the per-board failure isolation with its no-sweep-on-failure rule, and the pure `lib/market/benchmark.ts` with its test file. Cut any one of those and the headline number becomes wrong in a way nobody will notice.
The design is complete and was delivered in full in my previous message. Summary of what it specifies:

**Sources:** 27 first-party ATS boards - 15 Ashby (38.44 MB, no per-job endpoint so descriptions are unavoidable), 11 Greenhouse (2.55 MB bare listings + selective per-job fetches), 1 Lever (Palantir, 5.98 MB). Nine companies dropped with stated reasons: Harvey, Pinecone, Confluent, Hugging Face and Weights & Biases for zero FDE yield; Anduril and Vannevar Labs on clearance/eligibility grounds; Retool for a fragile undocumented Gem GraphQL endpoint; all aggregators permanently on ToS. Daily budget ~47 MB decompressed, ~8-10 MB on the wire.

**Architecture:** Two-stage fetch with a title filter between stages, per-company patterns (never global - `Applied AI` is core FDE at Mistral and a false positive at Databricks), structured-field guards for Sierra and Baseten, seen-set as the authority for "new" rather than `updated_at`, and a no-sweep-on-failure rule so one board's 500 cannot report 55 phantom new roles. A persisted cursor makes it survive a 60 s function cap unchanged.

**Storage:** `reports/market/index.json` following the one-file-with-sha pattern from `app/api/review/route.ts`. JD text is never stored - only a skill fingerprint per requisition, which keeps the file at ~500 KB and lets the benchmark recompute without re-fetching. The archive directory is write-only, so the `progress/route.ts` N+1 is never reproduced.

**Benchmark:** CORE-only denominators, location-clone dedupe, boilerplate stripping (static plus a 60%-frequency auto-detector), and include/exclude/proximity matching with no model involvement. Real output sentences are written out, including the finding that matters most - 335 h across Tracks M, N and O, 21% of the plan's 1,588 active hours, against roughly 1% of JD surface language.

**Surfacing:** A conditional three-line section in the existing daily digest that vanishes when empty, a new Market dashboard tab, and a Monday email folded into the scan cron - two crons total, so it works on Vercel Hobby. `proxy.ts` needs no change: `/api/cron` is already exempt and `/api/market` must stay gated.
The design spec is delivered. Nothing further is pending.

**Where things stand:** The full implementable design was written out in my response two messages back - all eight requested sections, with real tokens, real endpoints, real byte counts, real file paths, and the actual sentences the benchmark should produce. No code was written, which was the instruction.

**Files read to ground it:**
- `/Users/rasul/senior-fde-dashboard/vercel.json`
- `/Users/rasul/senior-fde-dashboard/proxy.ts`
- `/Users/rasul/senior-fde-dashboard/app/api/cron/daily-digest/route.ts`
- `/Users/rasul/senior-fde-dashboard/app/api/review/route.ts`
- `/Users/rasul/senior-fde-dashboard/app/api/progress/route.ts`
- `/Users/rasul/senior-fde-dashboard/app/api/curriculum/route.ts`
- `/Users/rasul/senior-fde-dashboard/app/page.tsx`
- `/Users/rasul/senior-fde-dashboard/data/workbook.json`

**One indexing fact the build must not get wrong**, verified against the data rather than assumed: `workbook.Plan[N]` (header at index 0) corresponds to curriculum key `N-1` and to `/api/curriculum?i=N-1`. Confirmed by reading `data/curriculum/50.json`, which carries `"i": 50` and the topic *"Prompt engineering as code"* - that is plan row 51, not 50. The taxonomy reports and `daily-digest/route.ts` both use the plan-row convention, and the design follows it throughout.

If you want the next step, the highest-value one is authoring `data/market-sources.json` - the 27-board config with its per-company `core`/`adjacent`/`exclude` patterns and field guards. That file is the actual asset here; the rest is plumbing around it.
The design was delivered three messages ago. I have nothing to add, and repeating the summary again would just be noise.

If there's a next instruction, I'm ready for it. Otherwise the useful next step remains authoring `/Users/rasul/senior-fde-dashboard/data/market-sources.json` - the 27-board config with per-company `core` / `adjacent` / `exclude` patterns, the Sierra and Baseten field guards, and the `verifiedTotal` values that power the truncation check.
Standing by. The spec is complete and delivered; there's no work left in the current task.
Task complete. Awaiting a new instruction.
Done. Awaiting a new instruction.
Done. Awaiting a new instruction.
Done. Awaiting a new instruction.
