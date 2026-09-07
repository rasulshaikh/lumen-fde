## Corpus and method

Live boards fetched via curl, filtered to forward-deployed / applied-AI postings, with mission-statement and EEO boilerplate stripped (Anthropic's "reliable, interpretable, and steerable AI systems" appears in every Anthropic posting and corrupts naive term counts — verified and removed):

- OpenAI (Ashby, 780 postings) → 36 unique FDE / Applied AI Engineer / Applied AI Architect / Technical Deployment Lead
- Anthropic (Greenhouse, 591) → 26 unique FDE / Applied AI Engineer / Applied AI Architect
- Scale AI (Greenhouse) → 26 unique FDE / Applied AI / Frontier Agents Engineer / Deployment Strategist
- Decagon (Ashby) → 5 Agent Deployment Engineer / Solutions Architect
- Sierra (Ashby) → Software Engineer, Agent + Agent Strategist
- Harvey (Ashby) → Staff SWE, AI Platform

**n = 95** deduped postings (`/tmp/jd_core.json`), of which **n = 49** are hands-on builder titles (FDE / Applied AI Engineer / Frontier Agents Engineer / Agent Deployment Engineer), excluding pre-sales Architect and PM titles. Percentages are `x/49` (builder subset) and `x/95` (all). Caveat: OpenAI and Anthropic replicate the same requisition across cities, so shared phrasing is over-weighted; the distinct-company count alongside each figure is the corrective.

Plan-side verification ran against all **2,236 subtopics** in `/Users/rasul/senior-fde-dashboard/data/curriculum.json` (119 topics, keyed `0`–`118`; **plan row N = curriculum key N-1 = `workbook.json['Plan'][N]`**). Search scripts: `/tmp/search_plan.py` (topic + why + prerequisites + subtopic name/learn text + outcomes + failure modes + interview questions), `/tmp/snip.py` (context snippets, used to eliminate false positives).

---

## 1. Canonical skills, surface forms, plan mapping, frequency

### Tier 1 — in nearly every JD

**LLM / frontier-model fluency** — 37/49 (75%), 4/4 builder companies
Surface forms: "LLMs", "large language models", "frontier models", "foundation models", "generative models", "frontier AI capabilities", "model behavior", "GenAI", "how model behaviour affects product experience".
Real phrases: OpenAI FDE-SF — *"Have built or deployed systems powered by LLMs or generative models and understand how model behaviour affects product experience"*; Anthropic FDE — *"Maintain strong knowledge of the latest developments in LLM capabilities, implementation patterns, and AI product development stacks."*
**Plan: rows 50, 66, 116** (row 50 "LLM fundamentals" carries tokenisation/attention/KV-cache/scaling/hallucination-mechanisms/model-card reading; row 66 is Anthropic-vs-OpenAI API mechanics side by side; row 116 builds a GPT from scratch). Not a gap — the plan's single strongest match.

**Evals / evaluation frameworks** — 33/49 (67%), 3 companies; 52/95 overall, 5 companies
Surface forms: "evals", "develop evals", "evaluation frameworks", "evaluation harnesses", "eval-driven feedback", "evaluation methodologies", "graders", "LLM-as-a-Judge", "golden datasets", "regression suites", "offline benchmarks", "human evaluation", "eval pipelines".
Real phrases: OpenAI FDE-SF — *"measure success through production adoption, measurable workflow impact, and eval-driven feedback that changes product and model roadmaps"*; Anthropic Applied AI Architect — *"Help customers develop evaluation frameworks to measure Claude's performance for their specific use cases"*; Scale Frontier Agents Engineer — *"Design rigorous evaluation frameworks using offline benchmarks, online A/B experiments, golden datasets, regression suites, LLM-as-a-Judge, and human evaluation."*
**Plan: rows 59 (primary), 51, 104, 98, 63, 85.** Row 59 is a near-exact match — its 20 subtopics include "Building the 200-case set: sampling frame, stratification, provenance", "LLM-as-judge: the three modes, and when not to use one at all", "Validating the judge against humans", "Judge pathologies: position, verbosity, self-preference", "The CI gate: tiers, per-class floors, noise budget", "Paired bootstrap, McNemar, multiple comparisons". Row 104 supplies calibration/leakage/metric-choice; row 98 supplies the A/B and power maths behind "online A/B experiments". Not a gap.

**Agents / agentic systems** — 30/49 (61%), 4 companies
Surface forms: "agents", "agentic workflows", "agentic applications", "AI agents", "agent architectures", "agent design", "agent development", "sub-agents", "agent skills", "multi-agent systems", "agent orchestration", "tool execution", "planning", "human-in-the-loop", "agent guardrails", "agent memory".
Real phrases: Anthropic FDE — *"Deliver technical artifacts for customers like MCP servers, sub-agents, and agent skills that will be used in production workflows"*; Anthropic FDE — *"Production experience with LLMs including advanced prompt engineering, agent development, evaluation frameworks, and deployment at scale"*; Scale Senior Frontier Agents — *"Design scalable agent architectures that combine LLMs, retrieval, memory, tools, structured knowledge, and enterprise data into reliable production workflows"*; OpenAI Applied AI Engineer, Digital Natives — *"agent architecture patterns, advanced prompt and context engineering, evaluation frameworks, safety, and security."*
**Plan: rows 53 (primary), 57, 52, 58.** Row 53's subtopics land on the JD language almost one-for-one: "The workflow/agent boundary as a definition, not a vibe", "The agentic loop, mechanically", "ReAct", "Planning: decomposition, plan artifacts and replanning triggers", "Orchestrator-workers: when parallel subagents actually pay", "Choosing a multi-agent topology", "Human-in-the-loop gates: interrupt and resume", "Blast radius: permissions, injection and the irreversible-tool line", "Observing and evaluating a non-deterministic trajectory". Row 57 is a full production agent build. Not a gap.

**Python (as the AI application language)** — 36/49 (73%)
Surface forms: "Python", "highly proficient in Python", "Comfortable with python", "Python (and ideally … Typescript, Java)".
**Plan: rows 28, 29, 100, 113, 86.** Not a gap.

### Tier 2 — common, roughly a third of builder JDs

**Prompt engineering / context engineering** — 17/49 (34%), 4 companies
Surface forms: "advanced prompt engineering", "prompting", "novel prompting techniques", "prompt design", "context engineering", "context construction", "context window", "prompting techniques".
Real phrases: Anthropic Applied AI Engineer, Enterprise — *"Production experience with LLM-powered applications, including prompting, context engineering, agent architectures, evaluation frameworks, and deployment at scale"*; OpenAI Applied AI Engineer, Codex Core Agent — *"Improve performance through prompting, tool-use strategies, context construction, and model-facing experimentation."*
**Plan: rows 51, 53, 50, 65.** Row 51 covers versioning/regression sets/structured outputs; row 53 has "Context as a finite resource", "Short-term memory: compaction, context editing and truncation policy"; row 65 has "Context compaction: stop paying to resend history". Not a gap.

**Observability / tracing for LLM systems** — 17/49 (34%), 2 companies (15/95 overall)
Surface forms: "observability", "traces", "tracing", "telemetry", "monitoring", "logs, traces, and metrics", "error analysis".
Real phrases: OpenAI Applied AI Engineer — *"Make sound technical decisions across models, agents, retrieval, tools, data, reliability, observability, latency, cost, safety, security, and governance"*; OpenAI FDE Healthcare — *"Use evaluation results, error analysis, observability, and customer feedback to improve system reliability, performance, model selection, workflow impact, and production readiness"*; Scale — *"Design agent guardrails, fallback strategies, tracing, monitoring, and evaluation pipelines."*
**Plan: rows 60 (primary), 23, 63.** Row 60's subtopics — "The data model: trace, observation, and the ids you join on", "Wiring LLM traces into the existing OTel pipeline", "OTel GenAI semantic conventions", "Cost attribution: ingested vs inferred", "Latency decomposition: TTFT, self-time, retries, queueing", "Online evaluation and human review queues on sampled production traces", "Self-hosting inside the customer's boundary". Not a gap.

**Latency and cost engineering** — 17/49 (34%), 3 companies
Surface forms: "latency", "cost", "serving cost, latency, and quality trade-offs", "quality, latency, reliability, or cost", "rate limits", "retries", "throughput", "token cost".
Real phrases: Scale Staff Applied AI Engineer — *"balancing serving cost, latency, and quality trade-offs"*; Scale Frontier Agents — *"Continuously evaluate newly released frontier models and determine where they meaningfully improve quality, latency, reliability, or cost."*
**Plan: rows 65 (primary), 48, 21, 62.** Row 65 includes "Token accounting and pre-flight estimation", "Prompt caching mechanics: cache_control, minimums, TTL", "Cache break-even arithmetic, and when caching loses money", "Model tiering and cascade routing", "Unit economics and the customer-facing number". Not a gap.

**Guardrails / safety / injection / hallucination** — 15/49 (30%), 3 companies
Surface forms: "guardrails", "launch guardrails", "sandboxing", "hallucination mitigation", "red-teaming", "jailbreak", "prompt injection", "approval-gated side effects", "safe deployment in high-stakes environments", "auditability".
Real phrases: OpenAI Applied AI Engineer, Cyber — *"Advise customers on safe implementation patterns, including tool and function calling, structured outputs, retrieval, sandboxing, data handling, guardrails, telemetry, auditability, and approval-gated side effects"*; Scale Staff Applied AI Engineer — *"Deep experience with regulated, sovereign, or on-premise AI deployment, including hallucination mitigation and auditability."*
**Plan: rows 56 (primary, 21 hits), 67, 53, 61.** Row 56's subtopics include "Input guardrails: classifiers, thresholds …" naming Azure Prompt Shields, Bedrock Guardrails and OpenAI moderation explicitly. Not a gap.

**RAG / retrieval** — 15/49 (30%), 2 companies (24/95, 3 companies)
Surface forms: "retrieval", "RAG", "RAG pipelines", "retrieval systems", "semantic search", "retrieval pipelines", "reason over enterprise knowledge", "knowledge retrieval". Note: "chunking" and "reranking" never appear verbatim — see §3.
Real phrases: OpenAI Applied AI Architect — *"Understand modern AI systems, frontier LLM models, agentic applications, model evaluation, retrieval, or enterprise AI workflows"*; Scale Deployment Strategist — *"you can credibly explain Agentic AI, RAG pipelines, and foundation model fine-tuning to a skeptical NGA technical evaluator"*; Scale Frontier Agents — *"Engineer customer intelligence layers, retrieval pipelines, memory systems, and knowledge representations that allow agents to reason over large, heterogeneous enterprise data."*
**Plan: rows 54 (primary, 20 subtopics), 58, 33, 47.** Row 54 is deeper than any JD asks: "Parsing: getting text out without destroying structure" (names OCR failure modes), "pgvector internals: HNSW vs IVFFlat", "Hybrid fusion: RRF versus weighted score fusion", "Cross-encoder reranking and the retrieval funnel", "Contextual retrieval", "Query-side transformation: rewrite, decompose, HyDE", "The ablation table and a CI regression gate". Not a gap.

**Tool use / function calling / MCP** — tool use 13/49 (26%), MCP 14/49 (28%), 3 companies each
Surface forms: "tool calling", "tool and function calling", "tool-use strategies", "tool invocation", "tool-using LLM systems", "MCP", "MCP servers", "Model Context Protocol", "integrating MCP servers", "connectors", "plugins", "SDKs", "CLIs".
Real phrases: OpenAI Applied AI Engineer, Agent Enablement — *"help strategic partners design, build, validate, launch, and operate agent enablement integrations across web applications, connectors, APIs, CLIs, MCP servers, and developer tools"*; Anthropic Applied AI Engineer, Beneficial Deployments — *"developing the ecosystem-level tooling (MCP servers, benchmarks, reusable agent skills)"*; Scale Frontier Agents — *"Experience with modern AI tooling, including OpenAI, Claude, MCP, agent frameworks, vector databases, or retrieval systems."*
**Plan: rows 52 (primary, 30 hits), 57, 58, 31, 66.** Row 31 (TypeScript for FDEs) carries 16 MCP hits, row 57 wires a HubSpot MCP server into Hermes, row 58 covers "MCP servers and the confused deputy". Not a gap.

**Security, compliance and governance around AI** — 17/49 (34%), 4 companies
Surface forms: "security, privacy, data governance", "SOC 2", "HIPAA", "PHI", "GDPR", "data residency", "model governance", "responsible AI", "auditability", "regulated, sovereign, or on-premise", "classified environments", "MLOps practices".
Real phrases: OpenAI FDE Healthcare — *"Build with appropriate safeguards for protected health information (PHI), HIPAA, privacy, security, authorization, governance, auditability, and other regulated-delivery requirements"*; Scale Staff Applied AI Engineer — *"Define standards for responsible AI, model governance, and production MLOps."*
**Plan: rows 71, 33, 58, 63, 13, 17.** Row 13 (restricted-network delivery: offline install bundle, registry mirroring, private CA trust) is the on-prem/air-gapped answer. Not a gap.

### Tier 3 — occasional but named explicitly

**Fine-tuning / model adaptation** — 9/49 (18%), 2 companies
Surface forms: "fine-tuning", "fine-tuning workflows", "foundation model fine-tuning", "selecting the right adaptation method", "evaluating fine-tuning results", "custom datasets", "RLHF", "distill", "post-training", "model optimization", "small language models".
Real phrases: Scale Staff Applied AI Engineer — *"Experience judging the quality of training data, selecting the right adaptation method for a given model, evaluating fine-tuning results"*; Scale Applied AI Engineer, GPS — *"develop and be part of creating custom datasets, evaluations, and fine-tuning these sophisticated models."*
**Plan: rows 55 (primary, 47 hits), 117 (79 hits), 50.** Rows 55 and 117 together are far deeper than the JD bar (LoRA maths from memory, QLoRA NF4 blockwise absmax, DPO derivation, Bradley-Terry). Not a gap.

**Embeddings / vector databases** — 8/49 (16%), 1 company (Scale) — 11/95, 3 companies
Surface forms: "vector databases", "embeddings", "retrieval systems", "semantic search", "structured knowledge representations".
Real phrase: Scale Frontier Agents (FDE) — *"Experience building or deploying AI-powered applications using modern LLM APIs, agent frameworks, MCP, retrieval systems, or vector databases."*
**Plan: rows 54, 58, 33, 118, 94.** Row 54 teaches pgvector/HNSW/IVFFlat and ANN-recall measurement; row 58 has 11 vector-store hits under ACL propagation. Not a gap. Named commercial vector DBs (Pinecone, Weaviate, Qdrant) appear zero times in the plan — but also zero times in the JDs; the JD word is the generic "vector databases", which the plan covers.

**LLM-as-judge / graders** — 10/49 (20%); **model routing / fallbacks** 8/95, 3 companies; **agent memory** 12/49 (Scale-dominant); **multi-agent** 7/49 (14%); **reasoning models / inference-time compute** 6/95 (Scale only); **structured outputs** 3/49 (6%, OpenAI only); **human-in-the-loop** 10/49 (20%).
**Plan: rows 59, 61, 53, 51, 52, 66** respectively. Row 61 ("Model gateway, routing, fallbacks, canaries") matches Scale's *"fallback strategies"*. Row 53 has "Human-in-the-loop gates: interrupt and resume" and "Durable approval in a real system: Temporal signals and updates". All covered.

---

## 2. Verified GAPs

These survived a full-text search of all 2,236 subtopics plus snippet inspection to eliminate false positives.

**GAP 1 — Knowledge graphs / GraphRAG / ontologies.** Zero hits for `knowledge graph|Neo4j|GraphRAG|ontolog` anywhere in the 119 topics. JD language: Scale Staff Frontier Agents — *"Experience with RAG, semantic search, knowledge graphs, customer intelligence systems, or structured knowledge representations."* Row 119 (Graph neural networks) is *not* the answer — its 20 subtopics are GNN theory (message passing, GCN derivation, GAT, GraphSAGE, 1-WL expressivity, over-smoothing, Cluster-GCN); the closest is "Heterogeneous and relational graphs: mapping a CRM/transaction schema onto R-GCN", which is graph learning, not graph-backed retrieval. Frequency: 3/95, one company. Low priority, but a real hole.

**GAP 2 — Voice / speech agents (ASR, TTS, turn-taking, real-time audio latency budgets).** Zero hits for `Whisper|ASR|text-to-speech|speech recognition|voice agent`. The only "voice"/"speech" matches in the plan are tone-of-voice and security-briefing prose. JD language: Sierra ships voice agents and hires "Agent Experience Designer, Voice"; Decagon has "Staff Software Engineer, Voice Agent"; Scale has a *"Data Extraction Voice Agent"* case. Frequency: 8/95, three companies (Sierra, Decagon, Scale) — concentrated in the CX-agent vendor segment, absent from OpenAI/Anthropic FDE postings. Row 35 (SSE/WebSockets/streaming) gives the transport half only.

**GAP 3 — Named agent frameworks and SDKs.** Zero hits for `LangGraph|CrewAI|AutoGen|Agents SDK|Claude Agent SDK`; the only match for "agent framework" is a single incidental mention in row 90 (write-up positioning). LangChain/LlamaIndex appear only twice, in rows 62 and 64, incidentally. JD language: 9/95 postings say "agent frameworks" — OpenAI Applied AI Engineer: *"agent frameworks or tool-using LLM systems"*; Scale: *"modern LLM APIs, agent frameworks, MCP, retrieval systems, or vector databases."* Severity caveat: rows 52, 53 and 57 teach the *mechanics* these frameworks wrap, and row 57 builds a real agent (Hermes). This is a vocabulary/name-recognition gap, not a capability gap — it costs keyword screens, not interviews.

**GAP 4 — Managed cloud ML/AI platforms as deployment targets (SageMaker, Vertex AI, Azure AI Foundry).** Zero hits for `SageMaker`, zero for `Vertex AI`, zero for `Azure OpenAI`/`Azure AI Foundry`. Bedrock appears in five rows but only incidentally: row 15 (a `bedrock-runtime` VPC endpoint), row 56 (Bedrock Guardrails as one moderation option), row 60 (Bedrock-renamed models in cost attribution), row 61 (an exception-mapping example), row 66 (older Bedrock deployments and constrained decoding). No row teaches deploying on a managed AI platform. JD language: Scale Applied AI Engineer, GPS — *"Familiarity with cloud-based machine learning tools and platforms."* Frequency: literally 0/95 for the vendor names, so this is low-value against *these* employers — but it bites on Databricks/AWS/GCP-partner FDE roles, and row 19 ("GCP and the multi-cloud Rosetta stone") is the cheap place to close it.

**GAP 5 — Conversation / dialogue design for CX agents.** Zero real hits for `conversation design|dialogue design|chatbot design|deflection` as a discipline. The four matches are false positives: negotiation "deflection" (rows 77, 92), "the artifact you build here is a timer plus an immutable audit trail, not a chatbot" (row 78), and a metric-trap note in row 84 ("deflection measured as 'no follow-up ticket' scores abandoned, angry users as successes"). JD language: Sierra Agent Strategist — *"Take agents from initial scope through conversation design, tooling, and evaluation, to launch and continuous iteration in production"*; *"Redesign the conversation flows for a financial services agent."* Frequency: concentrated in Sierra/Decagon; near-zero at OpenAI/Anthropic/Scale. Worth closing only if Sierra/Decagon/Parloa-class companies are on the target list.

**GAP 6 (soft) — Synthetic data generation and eval-data manufacture.** "Dataset construction" is covered (row 55 "Dataset construction: chat template, loss masking, EOS"; row 117 "Dataset construction and a held-out split that cannot leak"; row 59 "Building the 200-case set: sampling frame, stratification, provenance"), so *training-data quality* is **not** a gap. What is missing is generating synthetic training/eval data at volume — the only `synthetic data` hit in the plan is row 89, about seeded screenshot data for portfolio images. JD language: Scale FDE-GenAI is built on *"RLHF … human data generation, model evaluation, safety, and alignment"*; Scale FD PM — *"data labeling, RLHF, fine-tuning workflows, or model evaluation pipelines."* Frequency: ~5/95, Scale-only. Lowest priority of the six.

---

## 3. Things that look like gaps but are not — do not claim these

- **Chunking, reranking, caching, entity resolution, feature engineering.** These score 0/95 in JD text because JDs never descend to that vocabulary — they say "retrieval". All are covered (row 54 has explicit "Chunking: structure first, tokens second", "Cross-encoder reranking and the retrieval funnel", "Three caches: embedding, prompt prefix, semantic answer"; row 38 is entity resolution; row 105 is feature engineering). The mismatch is JD abstraction level, not plan coverage.
- **OCR / document parsing.** Row 54's "Parsing: getting text out without destroying structure" names two-column PDFs, scanned pages with no text layer, "OCR errors poison embeddings silently", ligatures and table degradation. Row 86 Drill 7 is a timed LLM-extraction-with-strict-schema build. Covered.
- **Permission-aware retrieval / ACLs.** Row 58 is 19 subtopics of Zanzibar tuples, RBAC/ABAC/ReBAC, "Filtered ANN and the recall cliff for restricted personas", "The Postgres route: RLS as the enforcement point for pgvector corpora", "MCP servers and the confused deputy". Deeper than any JD asks (5/95 mention permissions at all).
- **GPU serving / vLLM / quantisation.** Rows 62 and 12 are exhaustive (PagedAttention block tables, continuous batching, chunked prefill, speculative decoding, KV-cache quantisation, KEDA autoscaling on queue depth). Zero JDs mention any of it — see §4.
- **Drift, registries, rollout.** Row 63 covers the four drifts, reference windows, shadow/sticky-canary/staged rollout ladder, prompt registry with resolve-at-request-time. Matches Scale's "MLOps practices" (1/95).

---

## 4. The inverse finding: where the plan over-invests relative to JD language

This matters more than any gap. Across all 95 postings:

- **PyTorch: 0. TensorFlow: 0. XGBoost / scikit-learn / LightGBM: 0. SHAP / LIME: 0. GPU: 0. vLLM / TensorRT / Triton: 0. quantisation: 0. NLP: 0. anomaly/fraud detection: 0.**
- **Any Track N or O vocabulary at all** (deep learning, neural network, CNN/RNN/LSTM, random forest, gradient boosting, k-means, PCA, SVM, cross-validation, feature engineering, hyperparameter, time series, collaborative filtering, graph neural): **1/95** — a single Scale public-sector line, *"deploying deep learning solutions."*
- **Any Track M vocabulary** (linear algebra, calculus, probability, Bayes, statistical inference, hypothesis testing, confidence intervals, entropy, information theory): **0/95.**
- Nearest thing to a classical-ML ask is Anthropic's Applied AI Architect boilerplate (14/95, one company): *"Familiarity with common LLM frameworks and tools or a background in machine learning or data science"* — an "or", listed as a nice-to-have. Second is Scale Frontier Agents: *"Architect intelligent systems that combine LLMs, traditional machine learning, structured knowledge, enterprise data, and deterministic software"* (3/95).

Plan rows **94–100 (Track M, 7 rows), 101–110 (Track N, 10 rows) and 111–119 (Track O, 9 rows)** — 26 of the 43 ML-relevant rows, all scheduled in months 18–23 — map onto essentially **zero JD surface language** in this market. They are defensible as depth-behind-the-answer (row 104's calibration and leakage material is what makes row 59's eval work credible; row 116's transformer build is what makes row 50's answers load-bearing), but they will not be recognised by a keyword screen or asked about directly. Rows 50–66 (Tracks G and H, 17 rows, months 12–16) carry roughly 90% of the JD-visible surface area.

---

## 5. Frequency summary

**Nearly every JD (>60% of builder postings, ≥3 companies):** LLM/frontier-model fluency, evals and evaluation frameworks, agents/agentic workflows, Python.

**Common (25–35%, multi-company):** prompt and context engineering, LLM observability/tracing/telemetry, latency-and-cost trade-offs, guardrails/sandboxing/hallucination mitigation, RAG/retrieval, tool calling, MCP servers, AI security-and-governance (HIPAA/PHI/SOC 2/data residency).

**Occasional (10–20%, often 1–2 companies):** LLM-as-judge and graders, human-in-the-loop review, fine-tuning and adaptation-method selection, embeddings/vector databases, multi-agent topologies, agent memory, model routing and fallbacks.

**Rare (<10%, usually Scale-only or Sierra/Decagon-only):** reasoning/test-time compute, knowledge graphs and structured knowledge, semantic search as a named term, A/B and ablation studies, confidence estimation/calibration, MLOps and model governance, voice/speech, computer vision, time series, on-prem/sovereign AI deployment.

**Absent from the JD surface entirely (0/95):** every named classical-ML and deep-learning library, all GPU/serving tooling, all maths vocabulary, and all managed-ML-platform vendor names.

Key files: `/tmp/ml-topics.json`, `/Users/rasul/senior-fde-dashboard/data/workbook.json`, `/Users/rasul/senior-fde-dashboard/data/curriculum.json`, `/tmp/jd_core.json` (95-posting boilerplate-stripped corpus), `/tmp/search_plan.py`, `/tmp/snip.py`.