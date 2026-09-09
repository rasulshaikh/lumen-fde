## Verdict

Adding the visual resources improves this plan, but only if every one is demoted from where the PDF wants to put them. The prescription - "pick ONE concept you're struggling with, open the matching site, spend 30 minutes interacting with it" - is the wrong unit of work here, and its justification ("visual understanding sticks 10x longer than reading") is not a finding, it is a number with no measurement behind it. Adopted as written, the advice dilutes. Adopted as instrument-reading resources attached to named subtopics, and as failure reproductions feeding the forensics artifacts, roughly ten of the twenty-six surviving sites are clear net additions and the rest are noise.

## The claim, evaluated

No result in the learning-science literature has the form "visual beats textual by a durability multiplier." Durability is governed by retrieval, spacing, and generation, not modality. Roediger & Karpicke (2006) is the canonical shape: a study-study group beat a study-test group at five minutes and lost badly at one week (roughly 40% vs 61% recall) - the group that *felt* like it learned more had learned less, and the crossover took a week to appear. Mayer's multimedia effect is real but is a comprehension-and-transfer effect of roughly d≈0.4-0.7, not a retention multiplier, and Kalyuga's expertise-reversal work shows it shrinks toward zero and then inverts as prior knowledge rises.

The most relevant experiment is one the PDF appears not to know: Hundhausen, Douglas & Stasko's 2002 meta-study of 24 controlled experiments on *algorithm visualization* - exactly what half these sites are (K-Means Visualization, DBSCAN Visualization, Gradient Descent Visualizer, R2D3, ML Playground). Graphical sophistication did not predict learning; the form of learner engagement did. Visualizations paired with prediction or construction beat text; visualizations viewed passively were statistically indistinguishable from no visualization. "Spend 30 minutes interacting with it" is precisely the passive-with-a-mouse condition that produced nothing.

Worse, interactive visualization is the best-documented producer of *fluency illusion* in educational technology. A smooth animation of backprop generates a high judgment-of-learning at low retrieval strength. In a system whose scheduler takes the learner's word for it, that is not a neutral cost.

## Why this plan in particular changes the answer

`data/curriculum.json` holds 119 topics, 2,236 subtopics, 1,614 hours - 994.6 h of subtopic study plus 619.4 h of build time. The 43 ML topics in `/tmp/ml-topics.json` are 827 subtopics and 560 h of that. **Every one of the 2,236 subtopics already carries a resource URL - 2,236 of 2,236.** There is no empty slot anywhere. The "subtopic-resource" and "add-as-visual-primer" slots in the site findings are therefore not additions; they are *displacements*. Median subtopic budget is 26.7 minutes, so the PDF's 30-minute session costs more than one entire subtopic.

More decisively: **a visualization cannot enter the spaced-retrieval system at all.** `scripts/build-curriculum.py` emits interviewQuestions first as `kind:"recall"` and failureModes second as `kind:"drill"` - 835 and 875, 1,710 total. `eligible()` in `lib/review.ts` takes the first `PER_TOPIC=3` prompts per topic in array order, and the minimum interviewQuestions count across all 119 topics is 7. Running the selector over the bank: **357 eligible cards, 357 of them `recall`, zero `drill`.** All 875 failure-mode drills are unreachable, and the `card.kind === "drill"` branch in `app/recall.tsx` is dead code in practice.

That settles the question mechanically. The durable knowledge this plan produces is exactly 357 derivation-and-diagnosis questions - "derive the backward pass for a two-layer MLP and tell me where the 1/B goes" (row 111), "derive scaled dot-product attention and justify the 1/√d_k" (row 116), "derive the condition on the learning rate for GD to converge on a quadratic with Hessian H" (row 112) - rehearsed on the 1/7/21/60/150/240/330 ladder, at most seven times over 479+ days. A visualization is a one-shot input into a system whose durability is carried entirely by those 357 cards. It cannot "stick 10x longer"; it is never scheduled again.

## The plan has already answered this, eight times

`bbycroft.net/llm` is already in row 116 - attached to subtopic 17 of 20, *"Attention-head heatmaps: producing them and reading them honestly"* (30 min), **after** subtopic 1 ("Scaled dot-product attention: derive it on paper", 45 min) and after subtopic 15 (the debugging ladder). Distill's *misread-tsne* sits on row 107 subtopic 16, "t-SNE… **and the plot you must not over-read**." Distill's *augmented-rnns* sits on row 115's "Attention heat maps **as a diagnostic instrument**." Distill's *computing-receptive-fields* sits on row 114 subtopic 2, "Receptive field arithmetic, **effective vs theoretical**."

The revealed rule is unambiguous and correct: **a visual attaches to the subtopic whose deliverable is reading an instrument honestly, never to the subtopic whose deliverable is deriving an equation.** The single exception - Distill's *Why Momentum Really Works* on row 95's "Momentum and Nesterov acceleration" - is a primer that carries the derivation with it.

So: **at the diagnostic end of learn, and inside build. Never before the derivation, never in the `do` slot.**

## The prohibitions

"Add-as-visual-primer" is proposed for rows 111, 112, 114, 116. Reject all *as primers*, on the plan's own calendar. Row 111 is month 22; row 116 is month 23. By then the learner has completed row 94 (month 2), 95 (month 4), 96 (month 5), 99-100 (month 11), 101 (month 18). The beginner TensorFlow Playground was built for - 2016, plain SGD only, squared error used for classification, no exposed gradient or weight update anywhere in the UI - does not exist at month 22. Handing a 20-month-trained learner a decision-boundary heatmap before "Hand-deriving the backward pass of an L-layer MLP" (row 111 subtopic 1, 35 min) is a textbook expertise-reversal setup.

Second: **never let a visualization occupy a `do`.** Row 50's `do` *is* broken - `youtube.com/@AndrejKarpathy`, a channel homepage, duplicating row 116's `watch`, already flagged "(optional)". But swapping a build for a browse converts the only active slot into a passive one. Row 50 already has its real `do`: the `llm-mechanics-lab` proof-of-work. Point `do` there. Both "replace-do" mappings should be rejected on that principle.

## The insertions that win their slot

| Site | Row | Exact subtopic | Why it wins |
|---|---|---|---|
| Transformer Explainer | 50 | 3 - "Self-attention: Q, K, V and the causal mask, **at the level where you can draw it**" (40 min) | The one outcome in 2,236 whose deliverable is literally a drawing. |
| bbycroft LLM Viz | 116 | move 17 → **0**, "The residual stream and the **shape contract** of a decoder block" | Its strength is hover-able real numbers - a shape contract, not a derivation. Misplaced at 17: no head selector, 3-token vocab, so you cannot *produce* a heatmap. |
| BertViz | 116 | 17 - "**producing** them and reading them honestly" | Actually produces them from your own model. Carry the `attn_implementation="eager"` fix in the `learn` text. |
| Netron | 114 | 9 - "Building ResNet-18 by hand: the block table" | Earns 15 min only as a **verification instrument for the artifact you just built**. A raw `.pth` renders as a flat weight list. |
| Image Kernels | 114 | 0 - "Convolution as a layer" | Serves 0 and explicitly **not** 1: kernel hard-coded 3×3, padding prose-only, no stride/dilation/groups. |
| K-Means Viz (Harris) | 107 | 2 - "Lloyd's algorithm, local minima" | Reassign/Update *is* the two-step derivation. Cannot serve subtopic 4: displays no SSE. |
| DBSCAN Viz (Harris) | 107 | 8 - "**border points that are not**" | Its expansion overwrites a border point's cluster - the ambiguity is executable. Cannot serve 9: no k-distance plot exists. |
| Seeing Theory | 96 | 5 - "deriving Beta-Binomial" | Its Bayesian chapter is conjugate-only, which is precisely and only this subtopic. |
| R2D3 part 2 | 101 | 18 - "**Double descent: the caveat you must not overstate**" (10 min) | The plan already has a subtopic whose job is to correct what R2D3 part 2 teaches as universal. |
| Gradient Descent Visualizer | 112 | 1 - "deriving the η < 2/λ_max bound" | Only if the expired cert is fixed. Its .26(x²+y²)+.48xy has H=[[.52,.48],[.48,.52]], λ={1.00, 0.04}, κ=25 - predict η<2, η\*=1.923, contraction 0.923, *then* set the slider. Predict-then-check is the only pattern that survives Hundhausen. |

Additional refutations: Gradient Descent Visualizer → row 95 as primer (no SGD, momentum, or Adam - row 95 covers all three); CNN Explainer → row 114 as primer (frozen weights, no backprop); TF Playground → row 112 subtopic 1 (exposes no gradient or LR mathematics; would displace d2l.ai 12.3 with strictly less).

## The position nobody proposed, and the best one

The slot vocabulary - primer / subtopic-resource / replace-do / none - is missing where these sites are worth most: **inside the proof-of-work, as a failure reproduction.** Row 111 ships `backprop-forensics` (eight broken trainers, blind-triage log); row 116 ships `attention-forensics` with a `broken/` dir; row 112 ships `optimiser-parity`. These artifacts *consume* pathologies:

TF Playground on spiral with the stock 2-4-2 network plateaus at test loss ≈0.38 through 4,590 epochs - a free live reproduction of "underfitting because the *representation* is wrong, not the optimiser," the exact discrimination row 112 subtopic 15 trains. Five minutes as a warm-up, not thirty as a session. GAN Lab ships with "Use pre-trained model" checked, so pressing play shows a converged equilibrium a learner will report as "I watched a GAN train" - a better instance of row 112's evaluation-hygiene failure modes than most of its own examples.

Against the tempting one: do not resurrect **ML Visualiser** as a "spot the fraud" exercise, however delicious its `fc[i] = flat[i % 25] * (0.5 + 0.5*Math.random())`. The answer is "read the source," which generalizes to nothing; no repo, author, or license, so nothing is auditable; and row 104 already teaches metric-flatters-a-broken-model with an exercise that produces a committed artifact. **AttentionViz** likewise: HSTS against a plain-HTTP EC2 backend is not learner-fixable.

## Where the dilution actually lives

Not in hours. Twenty-six sites × 30 minutes is 13 hours against 1,614 - 0.8%, unarguable. The dilution is in **grade integrity**. Grades are self-reported; `grade()` advances one rung on `fluent`, drops two on `gone`, and has no way to detect inflation. A learner who has just watched CNN Explainer decompose a convolution neuron, then draws row 114's scheduled card - "write the gradients with respect to the weights and the input for a 3×3, stride-1, padding-1 conv; why is dX a full convolution with the 180°-rotated kernel" - and grades `fluent` on the strength of having seen the window slide, pushes that card to day 60, then day 150. The plan's own guardrail (`app/recall.tsx`: reveal disabled until the textarea has content, "recognition is the illusion that makes rereading feel productive") is aimed at exactly this and is why the system works. Putting a visualization *before* retrieval attacks that guardrail from a direction it does not defend.

Hence the one change that makes all twenty-six earn their place at zero scheduling cost: **route the visual to the lapse branch.** When `record("gone")` fires and the rung drops two, the learner has just demonstrated a specific gap, in the vocabulary of a specific question, with no fluency illusion available - the highest-information moment in the system, and it currently routes to nothing but the `outcomes[]` reveal. Hang the topic's visual there, pulled on demand rather than scheduled. That is where an interactive visualization is unambiguously better than re-reading: not first exposure, not review, but the moment after a failed retrieval, when you already know exactly which picture you needed.

Files: `/Users/rasul/senior-fde-dashboard/lib/review.ts`, `/Users/rasul/senior-fde-dashboard/app/recall.tsx`, `/Users/rasul/senior-fde-dashboard/scripts/build-curriculum.py`, `/Users/rasul/senior-fde-dashboard/data/curriculum.json`, `/Users/rasul/senior-fde-dashboard/data/recall-bank.json`, `/tmp/ml-topics.json`.