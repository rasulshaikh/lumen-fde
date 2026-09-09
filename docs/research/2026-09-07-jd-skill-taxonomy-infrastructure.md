## Sources fetched

17 live postings across four boards:

- **OpenAI** (Ashby `posting-api/job-board/openai`, 780 open roles): FDE - SF; Forward Deployed Software Engineer - SF; Applied AI Engineer, Enterprise; Applied AI Architect, Enterprise; Applied AI Engineer, Agent Enablement.
- **Anthropic** (Greenhouse `boards/anthropic`, 591 roles): Forward Deployed Engineer; Applied AI Engineer; Applied AI Engineer, Enterprise; Applied AI Architect; Applied AI Security Architect.
- **Cohere** (Ashby `job-board/cohere`, 143 roles): FDE, Agentic Platform; FDE, Infrastructure Specialist; Applied AI Engineer, Agents & Automations.
- **Scale AI** (Greenhouse `boards/scaleai`): Frontier Agents Engineer (Applied AI); Staff Applied AI Engineer; Sr Staff ML Forward Deployed Engineer, Enterprise GenAI; FDE, GenAI.

GAP verification ran against `/Users/rasul/senior-fde-dashboard/data/curriculum.json` - 119 topics, **2,236 subtopics** (count verified), each with a `name` plus a 400-900-char `learn` body. I regex-searched names *and* bodies across all 119 rows, not just the 43 in `/tmp/ml-topics.json`. **Row numbers use the `/tmp/ml-topics.json` convention: row N = Nth data row of the Plan sheet** (= `workbook.json["Plan"][N]`, index 0 being the header). LLM fundamentals = row 50, RAG at depth = row 54, GNNs = row 119.

---

## 1. Canonical skills → JD surface forms → plan rows

### Tier A - in nearly every JD (12-17 of 17)

**A1. Evaluation of AI systems - 14/17. The most universal ML skill in this corpus.**
Surface forms fetched: "evaluation frameworks" (Anthropic ×2, Cohere, Scale ×2), "build evaluation systems", "evaluation harnesses", "evaluation strategies" (OpenAI Applied AI Engineer Enterprise), "help customers develop evals" (Anthropic Applied AI Architect), "eval frameworks"/"eval suites" (Cohere), "evaluation methodologies" (Cohere, Scale), "LLM-as-a-Judge", "golden datasets", "regression suites", "offline benchmarks", "online A/B experiments", "human evaluation" (all five in one Scale sentence), "graders", "production signals", "human judgment" (OpenAI: *"evaluate AI systems systematically using representative data, graders, production signals, and human judgment"*), "eval-driven feedback" (OpenAI FDE), "quantitative metrics" (Scale).
→ **H-59 primary** (error analysis/open coding, 200-case sampling frame, inter-annotator agreement, judge pathologies, paired bootstrap/McNemar, promptfoo harness, CI gate tiers, "the eval report the customer can forward to their exec"). Reinforced by **G-51**, **G-54** (golden set, ablation table, CI regression gate), **G-53**, **H-64**, **N-104**, **M-97/M-98**.

**A2. Agents and agentic systems - 11/17 (Scale Frontier Agents alone uses "agent*" 19×).**
"agentic workflows", "production AI agents", "agent design" (Anthropic Enterprise: *"advising their engineering teams on architecture, agent design, and evaluation"*), "agent architectures", "autonomous agents", "agent frameworks", "multi-agent systems", "ReAct or Plan-and-Execute" (Cohere, verbatim), "tool use", "memory", "agent guardrails", "sub-agents" and "agent skills" (Anthropic FDE: *"technical artifacts for customers like MCP servers, sub-agents, and agent skills"*), "human-in-the-loop", "human oversight".
→ **G-53 primary** (workflow/agent boundary, five workflow patterns, termination budgets, ReAct, planning + replanning, reflection/evaluator-optimizer, context as finite resource, short/long-term memory, orchestrator-workers, multi-agent topology, handoffs, HITL gates via Temporal signals, blast radius). Plus **G-57**, **G-52**, **K-85**, **K-84**.

**A3. LLM / frontier-model fluency - 12/17 LLM; 9/17 "frontier"/"foundation model".**
"model behaviour", *"how model behaviour affects product experience"* (OpenAI FDE), *"Maintain strong knowledge of the latest developments in LLM capabilities and implementation patterns"* (Anthropic), *"the LLM stack: frontier models, vector databases, and orchestration frameworks"* (Cohere).
→ **G-50**, **H-66** (Anthropic vs OpenAI APIs side by side), **O-116**, **O-115**.

**A4. Reliability + safety of model output - reliability 13/17, "safe/safety" 14/17.**
*"reliable, observable, safe, and auditable from day one"* (Cohere, verbatim), *"agent guardrails, fallback strategies, tracing, monitoring, and evaluation pipelines that enable safe deployment in high-stakes environments"* (Scale), *"hallucination mitigation and auditability"* (Scale Staff), "safe fallback behavior" (OpenAI Agent Enablement).
→ **G-56** (injection taxonomy, spotlighting ceiling, guardrail FPR/latency budget, egress control, versioned injection corpus, promptfoo red-team, garak/PyRIT), **G-50** ("What actually reduces hallucination, ranked by effect size"), **G-54**, **G-53**, **H-61**, **G-58**.

**A5. Architecture translation - "architect*" 12/17.**
*"translate ambiguous business problems into technical architectures"* (Scale), *"Develop clear Applied AI Architectures spanning models, applications, data, integration, security, privacy, governance, evaluation, and deployment"* (OpenAI Applied AI Architect, verbatim), *"recommend architectures that meet enterprise security and scale requirements"* (Anthropic Enterprise).
→ **F-48**, **K-85**, **F-47**, **J-74**, with G-52/53/54 as the component library.

### Tier B - common (4-9 of 17)

**B1. RAG and retrieval - "retrieval" 4/17, `\bRAG\b` 2/17.**
*"You've built and deployed highly performant RAG and agentic applications"* (Cohere), *"Experience with RAG, semantic search, knowledge graphs, customer intelligence systems, or structured knowledge representations"* (Scale), *"APIs for knowledge retrieval, inference, evaluation"* (Scale GP), *"Engineer customer intelligence layers, retrieval pipelines, memory systems, and knowledge representations"* (Scale).
→ **G-54** (naive baseline freeze, retrieval-vs-generation metrics, parsing incl. OCR failure modes, embedding-model selection on *your* corpus, pgvector HNSW vs IVFFlat, ANN-recall measurement, tsvector/GIN, RRF vs weighted fusion, filtered vector search, cross-encoder reranking, contextual retrieval, HyDE, three caches, enforceable citations, re-embedding migrations) and **G-58** (Zanzibar tuples, Check vs BatchCheck vs ListObjects, early vs late binding, Drive/SharePoint/Confluence ACL semantics, filtered-ANN recall cliff, CI permission-leak suite). Plus **F-47**, **K-83** run 1, **K-85**.

**B2. Prompt / context engineering - 5/17.** "advanced prompt engineering" (Anthropic FDE), "novel prompting techniques", "prompt and context experiments", "context construction" (Cohere). → **G-51**, **G-53**, **H-65**, **H-64**.

**B3. AI observability - 6/17.** "production observability" (Scale), *"build eval, observability, and feedback systems that measure whether AI experiences succeed in real enterprise workflows"* (Cohere), "reliability, observability, latency, cost" (OpenAI). → **H-60** (OTel GenAI semantic conventions, cost attribution, latency decomposition, prompt-version↔trace linkage, online eval queues, self-hosting inside the customer boundary), **D-23**, **H-63**.

**B4. Cost / latency / quality trade-offs - latency 5/17, cost 4/17.** *"balancing serving cost, latency, and quality trade-offs"* (Scale Staff, verbatim), *"measure agent accuracy, safety, and latency"* (Cohere). → **H-65** (token ledger, TTFT/TPOT, cache break-even, Message Batches API, cascade routing with the p_escalate≈0.35 threshold, non-regression gate for a model downgrade), **F-48**, **H-62**.

**B5. Classical ML alongside LLMs - 7/17.** *"combine frontier models with structured knowledge, retrieval, **traditional machine learning**, and enterprise software"*, *"Developing **predictive models** that work alongside LLMs"*, *"Strong understanding of **machine learning fundamentals**"* (all Scale Frontier Agents, verbatim), *"a background in machine learning or data science"* (Anthropic). → **N-101→N-108**, **M-94→M-100**. Coverage far exceeds demand.

**B6. MCP - 4/17, named by both target labs.** *"web applications, connectors, APIs, CLIs, MCP servers, and developer tools"* (OpenAI Agent Enablement), *"MCP servers, sub-agents, and agent skills"* (Anthropic FDE), *"How do MCP, autonomous agents, and RBAC work together?"* (Anthropic Security Architect, verbatim). → **G-52** (JSON-RPC framing, protocol eras, stdio vs Streamable HTTP, inputSchema as validation boundary, constrained decoding, OAuth 2.1 resource server, tool poisoning, Inspector debugging), **E-31**, **G-57**, **G-58**. Deeper than any JD requires - a differentiator.

**B7. Fine-tuning - 2/17.** *"selecting the right adaptation method for a given model, evaluating fine-tuning results"* (Scale Staff, verbatim). → **G-55**, **O-117**. Over-covered.

**B8. Security/compliance/governance - 10/17.** "GDPR, EU AI Act, DORA, NIS2, SOC 2, PCI-DSS", "Zero Data Retention (ZDR)", "EU data residency" (Anthropic Security Architect); *"responsible AI, model governance, and production MLOps"*, *"regulated, sovereign, or on-premise AI deployment, including hallucination mitigation and auditability"* (Scale Staff). → **I-71** (incl. a dedicated "The LLM-specific compliance surface" subtopic naming the EU AI Act), **I-68**, **G-55**, **G-58**, **E-33**.

### Tier C - occasional (1-3 of 17), all covered

| Skill | JD phrase | Freq | Rows |
|---|---|---|---|
| Multi-agent orchestration | "multi-agent systems that coordinate reasoning, planning, tool execution, and human oversight" | 1/17 | G-53 |
| Agent memory | "retrieval, memory, and tool use" | 1/17 | G-53, G-57 |
| Reasoning models | "reasoning techniques", "reasoning paradigms" | 1/17 | G-50, H-66 |
| Confidence estimation | "Develop confidence estimation, reflection, and continuous learning systems" | 1/17 | N-104, M-96, M-99, G-53 |
| Ablation / online experimentation | "Run controlled experiments and ablation studies" | 2/17 | M-98, G-54, H-61 |
| RLHF / RL | "reinforcement learning" | 2/17 | G-50, O-117 |
| MLOps standards | "production MLOps", "an MLOps practice" | 1/17 | H-63, H-64 |
| On-prem / sovereign inference | "private cloud and on-premises environments" (Cohere) | 3/17 | H-62, B-12, B-14, D-27 |
| Training-data quality | "judging the quality of training data" | 1/17 | G-55, H-59 |

---

## 2. Verified GAPs

**GAP-1 - Named orchestration/agent frameworks.** LangChain, LangGraph, LlamaIndex, OpenAI Agents SDK, Claude Agent SDK, Pydantic AI, CrewAI, AutoGen, DSPy, Haystack: **one** hit across 2,236 subtopics, incidental - row 64 "MLflow prompt registry mechanics end to end", where LangChain is a logging integration. The plan hand-rolls every agent *pattern* (G-53), arguably better engineering, but two JDs screen on the noun: Cohere *"deeply familiar with the LLM stack: frontier models, vector databases, and **orchestration frameworks**"*; Scale *"modern AI tooling, including OpenAI, Claude, MCP, **agent frameworks**, vector databases, or retrieval systems."* 2/17 explicit - keyword risk disproportionate to that count.

**GAP-2 - Managed AI platform surfaces (Bedrock, Vertex AI, Azure OpenAI/AI Foundry, SageMaker).** Bedrock: 4 incidental body mentions only (rows 56, 60, 61, 66). Vertex AI, Azure OpenAI, SageMaker: zero. No subtopic teaches deploying a frontier model *through* a hyperscaler surface - which is how Claude is actually bought by regulated enterprises. Anthropic Security Architect: *"cloud architecture and deployment models (AWS, Azure, GCP), including VPCs, private endpoints, hybrid connectivity, and the European sovereign cloud landscape."* 5/17 name the clouds, 0/17 name the AI services - a field-reality gap, not a keyword gap.

**GAP-3 - Knowledge graphs / GraphRAG / ontology modelling.** Zero hits for `knowledge graph|GraphRAG|ontology|Neo4j|Cypher`. Row 119 is real graph ML (message passing, GCN/GAT derivations, R-GCN over a CRM/transaction schema, link prediction, fraud/AML) and row 38 is entity resolution - adjacent, but neither builds or retrieves over a KG. Scale: *"Experience with RAG, semantic search, **knowledge graphs**, customer intelligence systems, or **structured knowledge representations**."* 1/17. Cheap to close as a G-54 subtopic.

**GAP-4 - Knowledge distillation / small-language-model optimisation.** `distillation|small language model|model optimi[sz]ation`: two hits, both row 99, both incidental (label smoothing / KL). Quantisation *is* covered (H-62), "use a smaller model" *is* covered as economics (H-65 cascade routing), but student-teacher distillation is absent. Scale: *"Experience with fine-tuning, **distillation**, reinforcement learning, **small language models**, or **model optimization**."* 1/17.

**GAP-5 - Speech / ASR / TTS / realtime voice.** Zero. Every `voice|speech|audio` curriculum hit is communication style ("active voice", "the IC decision loop") or K8s/Kafka noise. Multimodal *learning* is covered (O-118) and multimodal *input* is covered (H-66 "Content blocks and multimodal input on both"), but no audio pipeline. Honest frequency: **0/17 as a requirement** - the 6/17 "multimodal" hits are 5 instances of Anthropic's boilerplate paper list ("Multimodal Neurons") plus one Scale *preferred* qual. Real content gap, correctly deprioritised for this target set.

**GAP-6 - Feature stores.** Zero hits, and 0/17 in the JDs. Not worth closing.

**GAP-7 (minor) - Eval/observability SaaS breadth.** Plan standardises on promptfoo (rows 56, 59), Langfuse (51, 60, 64), MLflow (64). LangSmith, Braintrust, Arize/Phoenix, Ragas, W&B Weave: zero. No JD names an eval vendor - conversational-fluency gap only.

**Checked and NOT gaps** (each has dedicated subtopics, verified): prompt injection/red-teaming (G-56, 17 subtopics), LLM-judge validation against humans (H-59), pgvector/HNSW/IVFFlat + ANN-recall measurement (G-54), hybrid retrieval/RRF/cross-encoder reranking (G-54), permission-aware retrieval and Zanzibar (G-58), LoRA/QLoRA/PEFT (G-55, O-117), DPO derivation (O-117), quantisation + KV-cache arithmetic (H-62), continuous batching/PagedAttention/speculative decoding (H-62), prompt caching (H-65, H-66), gateway routing/fallbacks/canaries (H-61), drift + model registries (H-63), calibration/reliability diagrams (N-104), SHAP/LIME (N-108), imbalanced data (N-105), Optuna (N-106), transformers from scratch (O-116), CLIP dual-encoder (O-118).

---

## 3. Frequency judgement

**Near-universal (lead with these):** evaluation frameworks (14/17), reliability + output safety (13-14/17), agents/agentic workflows (11/17), LLM/frontier-model fluency (12/17), architecture translation (12/17), Python (8/17 named, implied in all engineer titles), prototype→production (9/17), enterprise security/compliance framing (10/17).

**Common, worth a portfolio artefact:** RAG/retrieval (4-5/17), prompt & context engineering (5/17), AI observability (6/17), latency-cost-quality trade-offs (5/17, 4/17), classical ML alongside LLMs (7/17), MCP (4/17 - low count but named by *both* OpenAI and Anthropic, so the count understates it).

**Occasional, one line each:** multi-agent topologies, memory, reasoning models, confidence estimation, ablations, RLHF, MLOps standards, distillation. Note the shape: **almost every Tier-C term comes from the same two Scale postings.** Scale writes ML-dense JDs; OpenAI, Anthropic and Cohere write delivery-dense ones. If the target list skews to the labs, eval + agent + deployment vocabulary matters more than ML-technique vocabulary.

**The inverse finding, more actionable than any gap:** across all 17 JDs there are **zero** mentions of PyTorch, computer vision, time-series forecasting, recommenders, GPU serving, vLLM, or quantisation, and zero named vector DBs or frameworks. The plan spends months 21-23 on rows 109-119 (time series, recommenders, NN foundations, training deep nets, PyTorch, CV, sequence models, transformers from scratch, fine-tuning at depth, multimodal, GNNs) - ~11 topics, ~215 subtopics - against a near-zero market signal in FDE/Applied-AI postings. Defensible as depth behind *"understand how model behaviour affects product experience"* (OpenAI FDE) and as insurance for Scale's "Sr Staff **ML** Forward Deployed Engineer" variant, but it is the wrong work for month 21 if loops start earlier. The rows matching 14/17 of the market - H-59 evals, G-53 agents, G-54 RAG, H-60 observability, H-65 cost/latency - sit at months 13-15, and GAP-1 and GAP-2 are two or three subtopics each, not a new track.