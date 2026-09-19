# Lumen Ask

Date: 2026-09-19T08:50:11.020Z

## Question

How it is different than grokbot vs openbot?

## Plan context

Overview - headline progress across the plan, hours by month, the single next action, and the by-track breakdown.

## Answer

Short answer: Grokbot is a product you don't control. OpenBot is a product you do.

**Grokbot** is xAI's Grok, the chatbot. You send messages to a model that xAI runs, on xAI's terms, behind xAI's safety policy. You get a chat window. You don't get the source. You can't change the system prompt, you can't add tools, you can't see the audit trail, and you can't host it inside a customer's tenant. For an FDE that's the difference between a demo and a deliverable.

**OpenBot** is a CopilotKit open-source template at github.com/CopilotKit/OpenBot. It is a self-hosted AI coworker template: browser access, file access, shell access, MCP, and component access routed through a policy gateway, all recorded in an audit trail. You run it on your own infrastructure or your customer's. You define the policy. You define the tools. You own the logs. MIT licensed, so you can fork it and ship it as a starting point for a customer engagement.

**Why this matters for your plan.** Track G covers agents. Row 53 teaches the patterns; row 52 teaches tool use and MCP; row 56 teaches guardrails. OpenBot is the assembled artifact those rows point at: a working policy gateway, a working audit trail, a working MCP integration. Reading it is not studying theory. It is studying how the parts bolt together in one production-grade arrangement. Grokbot is the opposite motion: a finished consumer product you cannot inspect or adapt. Studying it teaches you nothing you can ship.

**One concrete technical example.** Row 56, guardrails and prompt injection defence. The textbook move is to write a filter. The OpenBot move is to route every tool call through a policy gateway that checks the call against a rule set, records the call and its decision in an audit log, and either allows, denies, or escalates to a human. Same problem, production shape. You can't get that from Grokbot's source because you don't have it.

**How it connects to production systems and FDE interviews.** Three of your audited gaps map onto OpenBot's exact anatomy. Multi-agent topologies and orchestration at market 5%, reachable 18% from Pune. MCP servers and Model Context Protocol at market 6%. LLM observability, tracing and telemetry at market 3%. The 11 requisitions you can take from India without leaving home, listed in the scan today, all touch at least one of these. A candidate who has read OpenBot's policy gateway and audit trail can answer "how would you govern a tool-using agent on customer infrastructure" without hand-waving. A candidate who has only used Grokbot cannot.

**One practical next step.** Clone OpenBot, run it locally, add one MCP tool that is allowed, one that is denied, and read the audit trail entry for each. That is one study session and produces an artifact you can show in row 89's portfolio and reference in row 90's positioning.
