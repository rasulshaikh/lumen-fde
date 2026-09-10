# Lumen game layer - design

Written 2026-09-10. Four builds, shipped in order, each standalone.

## The constraint that shapes all four

Lumen refuses, in writing and in code, the four mechanics most learning games are built on:

| Refused | Where |
|---|---|
| Progress counts | `lib/review.ts` - "'37 due', close it forever" |
| Streaks as chains | `lib/motivation.ts` - "a gap moves the rate and leaves the run standing" |
| Scores | `components/TestRunner.tsx` - "a score that looks objective while being a keyword match is worse than no score" |
| Praise for activity | `lib/companion/context.ts` - "do not congratulate them for having chosen" |

So nothing here awards a point, keeps a chain, or congratulates. A build that needs one of those to
work is the wrong build. What is left, and what these four use instead, is **understanding you can
see happening** and **consequences you caused**.

---

## Build 1 - Topic Machines

A steppable, breakable animation of one system. Watch a TCP handshake. Drop the SYN-ACK. Watch the
retransmission timer fire.

### Why SVG and not canvas

`lib/backdrop.ts` is canvas because it draws an abstract wireframe with no text: a pure
`frame(t, w, h)` returning geometry, asserted in `lib/backdrop.test.mts` without a browser. A
labelled system diagram is a different problem. It needs crisp type at every zoom, it needs to
inherit the theme's CSS variables in both light and dark, it needs to be readable by a screen
reader, and it needs to be assertable. SVG through React gives all four, and this repo already
renders components to string in two suites (`lib/paths.test.mts`, `lib/plan-sync.test.mts`), so the
same technique tests a scene.

The pure-function discipline carries over unchanged. That is the part worth keeping, not the canvas.

### The abstraction

```ts
scene(step: number, phase: number, faults: string[]) => Scene
```

Pure. `step` is which stage of the system we are in, `phase` is 0..1 within that step so tokens
glide rather than jump, `faults` is what the learner has broken. The renderer draws the returned
`Scene` and owns no logic. Everything interesting is therefore testable without a DOM.

A `Scene` is nodes, edges, tokens in flight, a caption saying what is happening, and a detail line
saying why it matters.

### The three machines in v1

Each names the real plan rows it explains, so it is reachable from the topic you are studying rather
than floating in its own world.

| Machine | Plan rows |
|---|---|
| TCP: handshake, loss, retransmission | idx 2 - Networking: TCP/IP, DNS, TLS, HTTP/2, load balancers, firewalls |
| Kubernetes: scheduling a pod, and the probes that kill it | idx 7, 8 - Kubernetes core; Kubernetes production ops |
| RAG: chunk, embed, retrieve, rerank, generate | idx 53 - RAG at depth |

### Breaking it is the point

Each machine exposes faults. Drop a packet. Cordon the only node with capacity. Set the readiness
probe too aggressive. Return an empty retrieval. The fault changes the scene, and the caption says
what the system did about it.

This is the mechanic that replaces scoring. Nobody tells you whether you were right; you watch what
happens and the system's response is the feedback. Consequence, not judgment.

### What is asserted

The suite guards the defect class this repo produces most - a control that looks like it does
something and does not:

1. Every machine's `topicIndices` resolve to real rows in `data/workbook.json`.
2. `scene()` is pure - identical inputs give deep-equal output.
3. Every step produces a scene with a caption.
4. **Every fault changes the scene.** A fault that renders identically is a dead control and fails.
5. Every edge references node ids that exist; every token references a real edge.
6. No coordinate is ever NaN.

---

## Build 2 - Alive

Motion and reaction, running alongside Build 1 rather than after it. `components/Backdrop.tsx`
already paints; this is mostly turning it up and letting it respond to where you are in the plan.

Explicitly polish, priced as polish. It teaches nothing and does not pretend to.

---

## Build 3 - Daily pull  (BUILT: the unfinished machine)

The hook question was put to the reader and answered: **an unfinished machine**.

You cordon a node and walk away, and the pod is still Pending. That is not an obligation and not a
debt - nothing accumulates while you are gone, nothing decays, and coming back a month later costs
exactly what coming back tomorrow costs. An open loop rather than a number going down.

The recall question rides along with it, and that is the actual job. The bank holds 1,710 prompts
and the hard part was never answering one, it was opening the thing. A question about the system
already on your screen is a much shorter walk than "go and practise".

Held to three rules, each asserted:

- **No count, ever.** Not days away, not questions waiting, not machines left open. A number turns
  a return into a reckoning.
- **No reproach.** "Still cordoned" is a fact about the machine. "You left this broken six days
  ago" is a fact about the person, and this product does not make those.
- **Untrusted input.** The state lives in localStorage on the reader's device, so it can be stale,
  hand-edited or crafted. Twelve malformed shapes are pinned to render nothing rather than half a
  sentence, and a record naming one live fault and one that a deploy removed is rejected whole
  rather than repaired.

The strip renders nothing at all when nothing is broken, and nothing server-side ever.

---

## Build 4 - Incident sim  (BUILT: first version)

A ticket arrives, you have a terminal, and nobody tells you the answer. Two incidents, on Practice
rather than in a tenth tab, because that page is already "find out whether you actually know it".

| Incident | Rows | The trap |
|---|---|---|
| The new version never came up | 7, 8 | The customer blames the deploy. The deploy is fine: a node cordoned nine days ago plus a memory request raised in the same PR. Neither alone would have stopped it. |
| The assistant got worse and nobody deployed anything | 53 | Every span is 200, latency normal, nothing errored. The embedding provider rolled a version: same name, same dimensions, different weights. Valid arithmetic, no meaning. |

### How it grades, and what that costs

It grades exactly one thing: **did the service come back.** That is a fact about the system, not a
judgement about your reasoning, and it is the only honest thing a simulation can assert. No score,
no rating of the path, no "3 of 5 optimal probes".

A wrong fix is not rejected - it runs, and the sim reports what it really did. Rolling back serves
the old version the customer already told you they tried. Deleting a pod to make room takes them
from a stale version to no version at all. Raising top-k searches more of the wrong space. The
consequence is the teaching.

The cost, stated because it is real: you can fix an incident by guessing, six fixes and one works,
and nothing stops you trying them in order. The alternative is grading reasoning, which is what
`TestRunner` refused in writing. What the sim does instead is make guessing visibly unsatisfying.

### What is asserted

- Exactly one fix resolves. Two makes the outcome ambiguous, zero makes it a puzzle that hates you.
- Every wrong fix reports a real consequence - substance, not "that did not work", which is marking
  with extra steps.
- **No probe prints the cause or names the working command.** The evidence is on screen and the
  diagnosis is not, or the exercise is reading comprehension.
- The evidence is spread across at least two commands, and not every command is decisive.
- The ticket is what the customer said, not what is true - asserted per incident, so a future one
  cannot be written as a tidy problem statement with the answer in it.

### Still missing

Not a terminal you type into: the commands are a fixed set you choose from. Real free-form input
needs `/sandbox` and a parser, and is the obvious next increment. No timer, deliberately - a clock
would turn a diagnosis into a race, and the interview it prepares for does not work like that.

---

## Order and why

1. **Topic Machines** - the only one that creates a reusable engine. Doing it first makes 4 cheaper.
2. **Alive** - small, independent, fills gaps without blocking.
3. **Daily pull** - needs its design question answered, and answering it is easier with machines in hand.
4. **Incident sim** - largest, and depends on 1.

Each ships standalone. Stopping after any one leaves something real.
