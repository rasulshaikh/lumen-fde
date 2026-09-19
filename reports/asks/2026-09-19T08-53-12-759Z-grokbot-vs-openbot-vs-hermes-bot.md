# Lumen Ask

Date: 2026-09-19T08:53:12.759Z

## Question

grokbot vs openbot vs hermes bot?

## Plan context

Overview - headline progress across the plan, hours by month, the single next action, and the by-track breakdown.

## Answer

Short answer: three different things. Grokbot is a model product. OpenBot is a runtime template. Hermes Bot is a model you can ship inside either.

You asked this 11 days ago about Grokbot and OpenBot. I will not re-explain those two from scratch. I will add Hermes Bot, and sharpen the comparison so all three are on the same axis.

**The axis: what can you do with it?** Each of the three lives at a different layer of the AI stack. The layer tells you what you can do, what you can change, and what you can show a buyer.

**Grokbot, xAI's Grok.** A hosted chat product. You send messages, you get answers. You do not control the model weights, the system prompt, the tool list, or the deployment surface. The layer is the consumer-facing chat surface. What you can do is study the model's behavior, write about its limits, and use it as a benchmark for your own work. What you cannot do is ship a derivative as a customer deliverable.

**OpenBot, CopilotKit, MIT.** An open-source reference architecture for a self-hosted AI coworker: browser, file, shell, MCP, and component access routed through a policy gateway, recorded in an audit trail. The layer is the agent runtime and governance stack. You control the policy, the tools, the logs, the deployment. You can fork it, modify it, and ship it as the start of a customer engagement. What you cannot do is change the model inside it; OpenBot is model-agnostic.

**Hermes Bot, Nous Research.** A family of open-weight fine-tuned models derived from other base models, built for tool use, function calling, structured outputs, and agent behavior. The layer is the model itself. You control the weights, the system prompt, the fine-tuning, the serving stack. You cannot ship Hermes as a chat product to a customer without the surrounding runtime. Hermes is the brain; OpenBot is the body.

**Why the layer matters for your plan.** Rows 52 to 58 of track G, AI Engineering, 95.5h, are the rows that map onto all three layers. Row 53, Agents, 16h, teaches the orchestration patterns OpenBot implements. Row 52, Tool use and MCP servers, 14h, teaches the tool plumbing OpenBot wires up. Row 55, Fine-tuning vs prompting, 14h, and row 117, Fine-tuning at depth, 16h, defend the choices that put Hermes at the center of an agent rather than prompting a hosted model. Row 57, Hermes Agent in production, 13.5h, is the row that closes the loop: a real Hermes deployment inside a real runtime, end to end.

**Where each one shows up in the measured market.** The 11 named requisitions you can take without leaving India, scanned today, split across these layers.

The Databricks Forward Deployed Engineer postings, 4 of 11, ask for the runtime layer. They name model gateways, retrieval pipelines, eval frameworks, and production deployment. That is OpenBot-shaped work on a Databricks surface. A candidate who has read OpenBot's policy gateway and audit trail can answer the runtime questions without hand-waving. A candidate who has only studied Hermes weights cannot.

The Anthropic Applied AI Architect postings, 2 of 11, ask for the model fluency layer plus the runtime layer. They name Claude API, evaluation frameworks, and customer architecture. That is OpenBot-shaped work that uses Claude as the brain instead of Hermes. Studying OpenBot's policy gateway plus a Hermes-or-Claude swap gives you the most general answer.

The Scale AI Forward Deployed Engineer posting, 1 of 11, asks for GenAI delivery shape. Closer to OpenBot's runtime than to Hermes's weights.

The Decagon and OpenAI postings newly in the scan today, 2 of 11, ask for governed multi-tenant agent runtimes. OpenBot is MIT-licensed reference architecture for exactly that wiring. Studying OpenBot is studying the bones of these two postings.

**Where each one does not show up.** Hermes weights show up in 0 of 95 postings by name. Grokbot is not named in any corpus posting, because the corpus is FDE-shaped and Grokbot is consumer-shaped. The market does not buy Hermes weights, and the market does not buy Grokbot. The market buys the agent runtime that ships inside a customer tenant, which is what OpenBot is.

**One concrete technical example.** A procurement agent at a manufacturing GCC in Pune. The agent reads supplier emails, extracts terms, checks them against a policy doc, drafts a rejection or acceptance, and writes the audit log. The brain is Hermes or Claude, your choice. The body is OpenBot, with MCP servers for the email inbox and the policy doc, and a policy gateway that records every tool call. The deliverable is the runtime plus an eval set plus a handover. Hermes weights give you the brain. OpenBot gives you the body. Grokbot gives you nothing shippable because you cannot host it inside the customer's tenant.

**How this connects to FDE interviews.** Segment 3, Agent engineer, 41 of 195 reqs, asks most for Agents and agentic systems at 73% of segment, Evals at 56%, Prototype to production at 54%, RAG at 39%, Prompt and context engineering at 37%. That is OpenBot-shaped work with Hermes or Claude as the brain. The audit says the only segment where your readiness is climbing the demand wall today is segment 1, Data platform, 44 of 195, where 6 of 44 reqs are employable from Pune today. The Data platform segment asks most for Python at 93%, Customer-site travel at 80%, Stakeholder management at 64%, Translating business problems at 61%, Prototype to production at 57%. The Python comes from row 28. The travel and stakeholder come from rows 73, 74, 75, 80, 81. The runtime pattern comes from row 57. The agent patterns come from row 53. Hermes weights are the lever that makes row 57's "Hermes Agent in production" deliverable credibly yours rather than a Claude derivative.

**The reading I would avoid.** Studying Grokbot as a homework assignment. It does not move any row's needle. Studying Hermes weights in isolation. They defend rows 55 and 117, but rows 55 and 117 together are 30h against a market that asks for fine-tuning at 10% market and 0% reachable from India. Studying OpenBot end to end, plus Hermes as the brain, is the move that defends the most rows per hour.

**One practical next step.** Start row 57, Hermes Agent in production, 13.5h. Run Hermes inside OpenBot locally, with one MCP tool allowed and one denied, and read the audit trail entry for each. That single artifact defends row 57, references row 52 and row 53 in the portfolio, and gives you the bones to answer both the new Decagon and OpenAI postings in interviews.
