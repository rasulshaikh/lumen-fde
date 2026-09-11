# Lumen Ask

Date: 2026-09-11T19:03:51.902Z

## Question

Help me with the GTM module “Map the revenue system”. Ask me this review question and assess my reasoning against its acceptance checks: A sales team says marketing sends bad leads. What would you measure before buying another tool? Keep the next exercise free.

## Plan context

GTM / RevOps learning tab. Section: path. Selected module: Map the revenue system.  Planned pace: 8h/week. Learner-marked complete: none. Current evidence notes (learner supplied, not independently verified): none. The full module, video, reading, and source catalogs are supplied server-side.

## Answer

Quick map of the revenue system

What the module is asking you to build, in one sentence: a written description of how your practice company, OrbitDesk, turns a stranger into a paying customer, with every handoff owned and every metric traceable. The artifacts are revenue-map.md, metric-dictionary.csv, and a lifecycle diagram.

Core vocabulary you need before the review question lands:

- ICP means Ideal Customer Profile. It is the short list of who you actually sell to, not a wish list.
- Lifecycle stage is the contact's status as a person, such as subscriber, lead, MQL, SQL, customer. It is independent of any single deal.
- Deal stage is where one specific sales opportunity sits, such as qualified, proposal, closed-won. A contact can move lifecycle stages without a deal moving.
- MQL and SQL are marketing-qualified and sales-qualified leads. MQL fits the ICP and is interested. SQL has been accepted by sales as worth working.
- Handoff is the moment ownership of a contact passes from one team to the next, with a rule that triggers the move and a person accountable for what happens after.

The review question you asked to be tested on

A sales team says marketing sends bad leads. What would you measure before buying another tool?

The acceptance checks from the module are: a rejected lead has a reason and a route back to marketing, you can explain why a contact lifecycle is different from a deal stage, and every metric has a denominator and a time window. You will be scored against those three.

How to think about the answer

The instinct is to fix the lead source, which is a solution. The module trains you to refuse the solution frame and stay on the measurement frame. So you measure first, then decide what to fix, and you never assume the tool is the fix.

Concrete technical example you can speak to

Say you pull the last 90 days of leads. For each one you want four numbers: the count sent, the count accepted by sales as SQL, the count rejected, and the count that turned into closed-won regardless of acceptance. The denominator for lead-to-SQL conversion is all leads sent in the window. The denominator for SQL-to-close is SQLs created in the window, not all leads. If you mix the two denominators you will inflate the win rate, and the sales team will distrust your number more than they distrust the leads. You also want a rejection reason on every rejected lead, drawn from a small fixed list such as wrong size, no budget, no timing, duplicate, spam. Without the reason, "bad leads" is a feeling, not data.

Production system and FDE interview connection

This is exactly the pattern FDE work uses when a customer says the model is bad. You do not retrain or swap models first. You split the input traffic into accepted and rejected streams, attach a reason to every rejection, compute precision against a labelled sample, and only then propose a change. Interviewers test for this by asking how you would debug a customer's complaint about an AI feature. The answer shape is identical: instrument the pipeline, label a sample, measure with the right denominator, then change one thing.

Practical next step

Reply with your written answer to the review question. I will score it against the three acceptance checks, point out where your reasoning is solid, and name the specific gap if your denominator logic or lifecycle-versus-deal distinction is loose. The next module, "Build the HubSpot data contract", stays free of charge and is the natural follow-on because it makes the company, contact, and deal keys you just talked about into a real schema.
