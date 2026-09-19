# Lumen Ask

Date: 2026-09-19T08:51:12.710Z

## Question

Which is more sellable and profitable if I do it as FDE projects?

## Plan context

Overview - headline progress across the plan, hours by month, the single next action, and the by-track breakdown.

## Answer

Short answer: AI agents you ship into a customer tenant, not classic ML, not deep learning models.

You have asked a question the scan can't fully answer. I will say what I have and what I do not, then map it to the plan.

**What the market actually asks for.** The scan of 27 of 27 first-party job boards found 195 distinct core FDE requisitions. The 5 most-asked skills are Python as the AI application language, 68% of core FDE requisitions, Customer-site travel expectation, 46%, Evals and evaluation frameworks, 43%, Prototype to production, 37%, and Translating business problems into technical architecture, 31%. The 3 fastest-growing asks from the reachable-India lens are Stakeholder management, 27% market, 55% reachable, Building and debugging inside the customer's environment, 16% market, 27% reachable, and Demos, POCs and executive communication, 16% market, 9% reachable. What the scan does not contain is a per-project dollar figure, a per-vertical margin, or a "what sold most last quarter" tally. I do not have those numbers, and I will not invent them.

**What the scan does tell us, by segment.** Segment 1, Data platform: 44 of 195 reqs. The top asks are Python 93% of segment, travel 80%, stakeholder management 64%, translating business problems 61%, prototype to production 57%. Segment 3, Agent engineer: 41 of 195 reqs. The top asks are agents and agentic systems 73%, evals and evaluation frameworks 56%, prototype to production 54%, RAG and retrieval 39%, prompt and context engineering 37%. Agent engineer is the segment where AI agents you actually ship show up on the JD line. Data platform is the segment where the surrounding craft shows up: stakeholder, discovery, travel, business translation.

**What the audited corpus says is undersupplied.** The 13 audited gaps cluster around craft, not around building a model. The 3 gaps with the highest market frequency are Codifying field patterns back into Product and Research, 12 of 15 craft-corpus reqs, 80%, Value measurement and ROI instrumentation, 9 of 15, 60%, and Customer enablement, workshops and training delivery, 7 of 15, 47%. None of those gaps is "build a better model." All of them are about selling and proving outcomes after the model is in place. That is where the margin sits in services: not in the model, but in the wrapper around the model that the customer can defend to their CFO.

**What the audit flags as over-invested.** Track N, Machine Learning Systems, 121.5h, 10 rows, months 18-22. Surface-language match in the current corpus: 1 of 95 postings. Track O, Deep Learning and Multimodal, 129h, 9 rows, months 22-23. Surface-language match: 0 of 95 postings. Track M, Mathematical Foundations, 84.5h, 7 rows, months 2-11. Surface-language match: 0 of 95 postings. The plan hours that defend those tracks are real: row 104's calibration and leakage material is what makes row 59's eval work credible, and row 116's small GPT is what makes row 50's answers load-bearing. But none of those hours reads as a sellable project line item to a buyer.

**What is actually sellable, in plain words.** Three project shapes recur across the scan and the external brief, all of them AI-agent-shaped, none of them classic-ML-shaped.

1. **An agent embedded in a customer workflow.** A procurement agent, a clinical intake agent, a claims triage agent. The deliverable is a working tenant deployment plus an eval suite plus a handover. The corpus asks for Agents and agentic systems at 27% market and 73% of segment 3, Evals at 43% market, and Demos and executive communication at 16% market. Your row 53 (Agents), row 54 (RAG at depth), and row 59 (Evals as infrastructure) are the three lines that justify this on a resume. This shape maps to the Anthropic Applied AI Architect postings in Bangalore, India and to OpenAI's Forward Deployed Engineer, Financial Services, NYC.

2. **An evaluation and observability layer on top of a model the customer already bought.** They bought Claude, or a Bedrock-hosted model, or a Vertex AI endpoint. They cannot prove it works on their data. You ship the eval harness, the LLM-as-judge, the regression set, the dashboard. The corpus asks for Evals at 43% market, LLM observability at 3% market, and Model routing, fallbacks and canaries at 1% market. Your row 59, row 60 (LLM observability), and row 61 (model gateway) are the three lines that defend this. This shape maps to Scale AI's Forward Deployed Engineer, Gen AI and to the Databricks Senior Forward Deployed Engineer posting in Bengaluru.

3. **A governed multi-tenant agent runtime.** A customer wants an agent that touches files, browsers, internal APIs, and their identity system, all recorded in an audit trail. You ship the policy gateway, the audit log, the MCP plumbing, the operator handoff. The corpus asks for MCP servers and Model Context Protocol at 6% market, Multi-agent topologies at 5% market and 18% reachable, and Engagement documentation at 5% market. Your row 52 (tool use and MCP), row 53 (multi-agent), and row 74 (engagement documents) are the three lines that defend this. This shape maps to the OpenBot reference architecture in your map and to the Decagon Agent Deployment Engineer posting in Australia.

**What is not as sellable, given the same scan.**

- **A custom fine-tuned model.** The corpus asks for Fine-tuning and model adaptation at 10% market and 0% reachable from India. Reachable is 0% because every named fine-tuning posting in the scan is a US-on-site role. The work is also mostly research-shaped, not deployment-shaped, so the billable hours look like consulting, not like an FDE engagement. Your row 55 (Fine-tuning vs prompting) and row 117 (Fine-tuning at depth) defend knowledge, not a project line.
- **A bespoke classical ML system.** The corpus asks for Classical ML alongside LLMs at 4% market, 18% reachable. The 1 of 95 postings with surface ML vocabulary is a single Scale public-sector line. Your track N, 121.5h, defends depth, not a sale.
- **A computer vision or speech system.** The corpus has 0 of 95 postings asking for computer vision, 0 for GPU, 0 for PyTorch, 0 for TensorFlow, 0 for vLLM, 0 for Triton, 0 for quantisation, 0 for ASR, TTS or voice agent. Your track O, 129h, defends depth, not a sale.

**One concrete technical example.** Picture a procurement agent at a manufacturing GCC in Pune. The agent reads supplier emails, extracts terms, checks them against a policy doc, drafts a rejection or acceptance, and writes the audit log. The deliverable is the agent runtime plus the eval set plus the policy doc plus the handover. What you ship is not a model. It is the four artifacts together. The agent is row 53. The eval is row 59. The policy doc is row 74. The handover is row 79 (Releasing to a fleet of customer installs). Each of those is a line item an FDE engagement can bill against. A fine-tuned classifier doing the same job ships as a model and a notebook. The notebook is harder to defend to a CFO than four named artifacts.

**How this connects to FDE interviews.** Segment 1, Data platform, has 6 of 44 reqs employable from Pune today. Segment 3, Agent engineer, has 2 of 41. Segment 2, Frontier lab applied, has 2 of 55. The plan's next-best actions are row 28 (Production Python), row 81 (Narrative), row 59 (Evals), row 57 (Hermes Agent), and row 53 (Agents). Four of those five are in the agent or eval family. That is the path that maximises both sellable shape and interview-ready depth.

**One practical next step.** Pick one of the three sellable shapes above, and pick a customer vertical you can credibly research. Then build the smallest version of it locally, end to end, with an eval set, an audit log, and a one-page exec memo, even before you have a buyer. Time-box it to one study session this week. That artifact, plus a resume line that points to it, is worth more to FDE readiness than another week of ML theory, and it gives you a project shape you can name when a recruiter asks what you sell.
