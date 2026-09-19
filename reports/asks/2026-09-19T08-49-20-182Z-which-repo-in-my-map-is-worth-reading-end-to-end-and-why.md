# Lumen Ask

Date: 2026-09-19T08:49:20.183Z

## Question

Which repo in my map is worth reading end to end, and why?

## Plan context

Overview - headline progress across the plan, hours by month, the single next action, and the by-track breakdown.

## Answer

Short answer: read **AI Engineering from Scratch** end to end and skip OpenBot as a guided read.

You have two repos in the map and they do very different jobs. One is a teaching artifact. The other is a production template.

**AI Engineering from Scratch** by Rohit G is the one worth reading end to end. It is a build-first curriculum: 523 lessons across 20 phases, moving from math and ML foundations through LLMs, agents, MCP, skills, and production artifacts. The reason it earns a full read over an FDE preparation plan is its structure. Each phase ends in something runnable: an artifact, a piece of evidence, a verifiable result. That mirrors what your plan's *Show the work* rule already asks for, and it produces the exact kind of public proof that market segment 1, *Data platform* 44 of 195 reqs, reads first. Reading it end to end also backfills a structural gap the audit flagged: nothing in your plan teaches codifying field patterns back into Product and Research. The pattern library, the accelerator, the route from a field observation to a product input. Studying how this curriculum moves a learner from first principles to a shipped artifact is the closest substitute for that motion you can get without a customer in front of you. Its license is MIT, so you can lift its structure for your own Hermes write-up at row 90. The five FDE-relevant themes to mine from it are: explain systems from first principles, ship runnable artifacts, keep evidence of work, debug agent failure modes, and shape outcomes before implementation. Those map cleanly onto your readiness gap in *Prototype to production*, the skill the market asks for in 37% of core requisitions and that you evidence at 0%.

**OpenBot** by CopilotKit serves a different purpose. It is the reference architecture for a self-hosted AI coworker: browser, file, shell, MCP, and component access routed through a policy gateway, recorded in an audit trail. Read it as a reference, not as a textbook. Go to it when you build your own agent runtime or when a customer asks how to govern a multi-tool agent: AG-UI patterns, MCP plumbing, safe customer automation, tool permissions, failure visibility, operator handoff, and where the production boundary sits. That maps onto audit gaps *Multi-agent topologies and orchestration* 5% market, 18% reachable, and *Engagement documentation* 5% market, 0% reachable. The four FDE themes to pull from it: safe customer automation, tool permissions, failure visibility, operator handoff.

**Why end to end for one and reference for the other.** Your plan already has 117 active topics spanning 1588h, and the audit flagged 13 unmet market asks with 0h scheduled. Reading AI Engineering from Scratch end to end is high marginal value because the plan has no equivalent structured coverage of moving from math to a shipped artifact, and because public proof, an artifact you can show, is the lever the market rewards for entry-level FDE roles. Reading OpenBot end to end costs you the same hours, but only a handful of its pieces become artifacts you can show today; the rest is reference for a motion you may or may not need this year.

**One concrete technical example.** In AI Engineering from Scratch, the later phases teach you to build an agent that calls tools, fails visibly, and writes an evidence trail per run. That is the same architectural shape as OpenBot, but OpenBot hands you the production-grade wiring. Reading both turns *Prototype to production* from a keyword you can claim to a system you can defend in a system design mock at row 85.

**How this connects to the market and to FDE interviews.** Segment 1, *Data platform* 44 of 195 reqs, is where readiness climbs fastest from Pune. Its top asks are *Python as the AI application language* 93% of segment, *Customer-site travel* 80%, *Stakeholder management* 64%, *Translating business problems* 61%, *Prototype to production* 57%. A portfolio anchored on AI Engineering from Scratch's build-evidence-show pattern, plus an OpenBot-shaped governance conversation for the harder questions, is how you evidence four of those five in interviews.

**One practical next step.** Open phase 1 of the curriculum and build the smallest runnable artifact it asks for, end to end, even if you already know how. Time-box it to one study session this week. Record the run, the failure, the fix, and the verification. That single artifact, plus a resume line that points to it, is worth more to *Prototype to production* readiness than another hour of reading.
