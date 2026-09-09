# Lumen Ask

Date: 2026-09-09T15:05:38.870Z

## Question

What will a senior FDE interview actually test that my plan does not cover?

## Plan context

No topic filter was active.

## Answer

A senior FDE interview tests what a senior FDE does, which is make decisions under uncertainty in a customer's environment. Your plan covers most of the building blocks, but the interview is not a checklist of blocks. It is a small number of judgment calls made under time pressure. Here is what it actually tests, written so a fifth grader can follow, with the technical idea kept exact.

1. Trade-off speaking, not trade-off knowing.
You will be asked to defend a choice live. The right answer is rarely the "best" one. It is the one you can explain against the second-best. The plan covers the technical space in row 47 system design playbook, row 48 LLM-era system design, row 75 demos and defending trade-offs, and row 85 LLM system design mocks. Production example: choosing between a prompt-only fix and a fine-tune for a hallucinating summarizer, where the prompt path ships in two days and the fine-tune takes three weeks but cuts cost by 60 percent. The interview wants the sentence "I would ship the prompt fix this week, measure it on the eval set, and only fine-tune if the cost-per-good-answer stays above target." The next step is to take one row 47 decision and write the second-best option and the one number that flips you.

2. Customer simulation under pressure.
You will role-play a 20 minute call where the "customer" is angry, confused, or political. The plan covers this in row 87 client simulations and learning interviews, row 73 discovery, row 75 executive communication, and row 88 STAR stories. The interview is testing whether you slow down, restate the problem, and pull one number before proposing a fix. Production example: a buyer says the pilot is "failing" because latency is 4 seconds. You do not start tuning the model. You ask what task is on the critical path, who is measuring the 4 seconds, and what the previous baseline was. The next step is to do one timed row 87 simulation this week and record it.

3. Live debugging of a system you did not build.
Row 39 landing in a codebase you did not write is the only row that practices orientation, reproduction, and isolation under time. Most candidates skip it. Production example: a trace shows a 503 from the embedding service only for one tenant. You check the recent deploy, the tenant-specific config map, the rate limit header, and the upstream health check before touching code. The next step is to clone one open-source FastAPI service and write a 30 minute reproduction script from cold.

4. Numbers you can defend in your head.
Throughput, latency, cost per request, and cache hit rate, all back-of-envelope, no calculator. The plan covers the concepts in row 62 serving at scale, row 65 cost and latency engineering, and row 48 LLM-era system design, but the interview does not ask you to recite. It asks "if we 10x traffic, what breaks first and what is the cheapest fix." Production example: 1000 requests per second at 800ms p50 means about 800 in-flight. Doubling the model cuts latency by 30 percent but doubles GPU cost, so the cheaper fix is usually a smaller model on the easy 80 percent plus a bigger model only on the hard tail. The next step is to memorize three ratios: GPU memory to KV cache size, cost per million tokens across model tiers, and p99 to p50 spread for LLM endpoints.

5. Stakeholder mapping, not just stakeholder communication.
Row 75 demos and executive communication and row 87 cover speaking to executives. The interview also tests whether you can draw the org. Who is the buyer, who is the user, who is the blocker, who loses if this works. Production example: the engineering lead loves the design but the security lead will block the rollout because of data residency. You do not win by pitching harder to engineering. You win by getting security a private walkthrough two days before the review. The next step is to pick one row 75 case and draw the four roles on one page.

6. Honest "I do not know, here is how I would find out."
A senior is graded on the shape of the unknown, not on faking coverage. The plan's row 44 Designing Data-Intensive Applications and row 45 MIT 6.824 lectures build the instinct. Production example: asked about a database you have never used, the right answer is "I would read the first 20 pages of the docs, the consistency model page, and the failure modes page, then I would reproduce one bug from their issue tracker." The next step is to write that sentence in your own words and keep it ready.

7. Ethics, safety, and the "should we" question.
Row 56 guardrails and prompt injection and row 71 compliance cover the surface. The deeper test is whether you will pause when a customer asks you to ship something you should not ship. Production example: a customer asks you to auto-send personalized outreach emails based on scraped LinkedIn data. The right answer is to explain the spam-law and consent-line risk in plain language and offer the compliant version. The next step is to write a two-sentence refusal you would actually say out loud.

8. The "week one" question.
Almost every senior loop ends with "what would you do in your first 30 days." The plan covers this implicitly in row 73 discovery, row 74 engagement documents, and row 79 releasing to a fleet of customer installs, but the interview wants a concrete week-by-week, not a philosophy. Production example: week 1 read every postmortem and run the eval set against production traces, week 2 pick the one user-visible pain and ship a thin slice, week 3 instrument the pain point so you can prove it moved, week 4 write the next two quarters as three options with costs. The next step is to write your own 30-day plan for the company you are interviewing with, before the loop.

What the plan does not drill, that the interview will.
Two things stand out. First, live refusal and scope pushback. You will be asked to take on work you should not take, or to promise a date you cannot meet. Row 77 negotiation covers the offer side, but not the in-engagement refusal. Production example: customer asks for a feature that would breach their own security policy; you say "I can scope it as a documented exception with sign-off from your CISO, or I can scope the compliant version, but I will not ship the first version without that sign-off in writing." Second, postmortem you actually wrote. Row 25 incident response covers the theory, but the interview often asks you to walk through one you owned end to end, with the timeline, the customer-facing message, and what you changed so it would not recur. The next step is to write one postmortem from your own past work, even if the incident was small, in the format the row expects.

One practical next step.
Take one row from your plan that is marked "not started" and one interview question it does not drill, and pair them. Concretely: start row 28 production Python architecture this week, and for every chapter you read, write the 30 second answer to "what would you do in week one at a customer running this." That pairs the skill with the interview shape, which is what a senior loop is really testing.
