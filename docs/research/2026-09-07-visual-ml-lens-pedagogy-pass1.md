# Pedagogy verdict: the claim is false, and the protocol it recommends is inverted

## 1. The claim, tested

"Visual understanding sticks 10x longer than reading" has no referent. There is no measurement in the learning literature of a 10x retention ratio for interactive visualisation over text. The largest reliable retention effect that exists is the **testing effect** - retrieval practice vs. restudy - and at one week it runs on the order of 1.5x, not 10x. It favours the half of this plan the PDF is not selling: `/Users/rasul/senior-fde-dashboard/lib/review.ts`.

What the visualisation literature actually supports is narrower and points the other way for a plan like this one:

- **Transient information effect** (Sweller/Ayres): animation degrades retention of *procedural* content relative to static segmented diagrams, because the learner cannot self-pace symbolic extraction from a moving image. This is why **The Illustrated Transformer** - 39 static figures, 512-dim / 64-dim-per-head / 8 heads / divide-by-8 stated as literal numbers, self-paced - is pedagogically *stronger* for row 116 than **Transformer Explainer**, despite Transformer Explainer being the more impressive artifact.
- **Fluency illusion** (Bjork): smooth, well-designed presentation inflates judgments of learning while depressing actual retention. A 60 fps decision boundary is a maximally fluent stimulus.
- **Expertise reversal** (Kalyuga): supportive visual scaffolding helps novices and measurably *harms* learners who already hold a schema, because reconciling a redundant external representation costs working memory. This is the direct argument against "after the reading."
- **Concreteness fading** (Fyfe/McNeil/Goldstone): the one condition under which concrete-first beats abstract-first is when the concrete representation is *explicitly faded* to the symbolic one. Concrete-only transfers worse than abstract-only. The PDF's "spend 30 minutes interacting with it" prescribes concrete-only.

I did not have to reach for this literature to falsify the claim, though. **The agents who visited the sites already falsified it, independently, seven times, without coordinating:**

> TF Playground (row 111/112): "you finish with feel and no ability to compute"
> Seeing Theory (row 96): "someone could spend an hour, feel fluent in Bayesian inference, and still be unable to write a conjugate update"
> Setosa (row 94): "You will feel why PC1 is PC1; you will not be able to compute it afterwards"
> Embedding Projector (row 107): "strong geometric intuition but unable to implement t-SNE or UMAP"
> R2D3 part 1 (row 102): "you will retain a feeling rather than a skill"
> TensorSpace (row 114): "you leave with a picture, not an implementation"
> Distill/Grand Tour, ML Visualized, ConvNet Playground: same shape

Seven reviewers, seven different sites, converging spontaneously on the same sentence. That is the strongest single piece of evidence in the dataset, and it is a direct contradiction of the PDF's headline claim about the very sites the PDF recommends.

## 2. What this plan actually tests - and why that settles the placement question

I checked what the spaced-retrieval system actually schedules. `eligible()` in `review.ts` takes the first three prompts per topic in array order. In `data/recall-bank.json`, that is deterministically the interview questions, never the drills. Verified: **0 of the 875 `drill` prompts enter the ladder. All 357 scheduled cards are `recall` kind.**

And every scheduled ML card is a *symbolic production* task:

| row | card | what it demands |
|---|---|---|
| 94 | q93-0 | Derive the SVD of a 2x2 at the whiteboard |
| 95 | q94-1 | Write Adam's update, derive the bias corrections |
| 111 | q110-1 | Derive the Xavier variance condition, then the 2/n_in change for ReLU |
| 114 | q113-0 | Derive ResNet-18's receptive field showing the jump and RF recursions |
| 116 | q115-0 | Derive scaled dot-product attention, justify 1/sqrt(d_k) |
| 107 | q106-0 | Derive the two k-means update steps from the objective |

Not one is a recognition task. Not one can be answered by having seen a picture. **Transfer-appropriate processing** says retention is maximised when study processing matches test processing; the test here is chalk-on-whiteboard derivation and plot triage. Watching a decision boundary morph matches neither. TF Playground's own reviewer noted the tool exposes no gradient, no weight update, and no backprop step - which means for row 111, whose topic is literally "backpropagation, activations, initialisation, regularisation," the tool covers zero of the four mechanisms at the level the card requires. The "strong" mapping to row 111 is overstated; it is a real match to row 112's loss-curve work and a decorative one to row 111.

## 3. The structural hazard: this specific scheduler cannot survive a fluency illusion

Read `/Users/rasul/senior-fde-dashboard/app/recall.tsx` lines 128-147 with `grade()` in `review.ts`. The reveal is **not an answer key** - it renders `meta.outcomes`, three capability statements ("You should be able to…"). The learner then self-scores fluent / halting / gone. That is a judgment of learning, taken at face value: `grade()` trusts the input entirely and has no independent check.

Now compound it. `LADDER = [1, 7, 21, 60, 150, 240, 330]`, and fluent advances one rung. A single inflated "fluent" at rung 2 moves a card from 21 days to 60. Two in a row moves it to 150.

So: the characteristic failure mode of an interactive visualisation - *subjective understanding rising faster than productive ability* - is precisely the input signal this scheduler is least able to detect and most severely amplifies. A learner who spends 25 minutes in **GAN Lab** watching KL and JS divergence converge and then grades q98-0 ("derive cross-entropy as negative log-likelihood") as fluent has just bought a 60-day gap on material they cannot write down. The plan's honesty depends entirely on the learner's self-report being uninflated at the moment of grading. Visual material immediately before a review session is the cleanest available way to inflate it.

**This is the whole reason the answer is "before the reading, never after."** Not aesthetics. The "after" slot the PDF implicitly recommends is the one slot that corrupts the grading signal.

## 4. Where a visualisation legitimately sits - three slots, and only three

**Slot A - pre-reading anchor. Capped at 10 minutes, gated by a written prediction. Before the `learn` text, never after.**

Concreteness fading is real but requires the fade. Operationalise it: open the site, write down a prediction *before* touching a control, run it, then close the tab and go to the derivation. The prediction gate is what converts passive viewing into a generation-effect event (Kapur: predicting and being wrong beats being told, for transfer). Ten minutes, not thirty - thirty minutes is a full subtopic slot at this plan's granularity (subtopics run 10-40 min, median 25) and buys nothing after the first minute of the "oh, that's what it looks like" payoff.

Concretely: **K-Means (Naftali Harris)** before row 107's k-means block; **R2D3 part 1** before row 102's tree block; **Seeing Theory** ch. 5 before row 96's Bayes block; **Image Kernels Explained** before row 114 subtopic 1.

**Slot B - failure-mode induction inside the proof-of-work clinics. This is the highest-value slot and no agent proposed it.**

Read row 111's `proofOfWork` (`data/curriculum/110.json`): `backprop-forensics` ships eight deliberately broken trainers, emits "loss curves, per-layer activation histograms, per-layer gradient norms on a log axis, and the update-to-weight ratio," and demands a **blind-triage log with an honestly stated hit rate**. Row 116's `attention-forensics` ships six sabotaged GPTs with their loss curves. Row 112's subtopic 16 is literally "Loss-curve taxonomy: reading the five broken configs from the plot," 35 minutes, currently resourced to the Google ML Crash Course's *pictures* of broken curves.

That is the one place in the entire plan where a visualisation is not merely additive but **non-substitutable**, because the learner can *generate the pathology themselves and vary it*, which no static resource permits. TF Playground at lr=10 on spiral, versus lr=0.00001, versus 6x8 with regularisation off and noise at 50 - three reproducible signatures in four minutes. And the finding the reviewer logged as a *defect* of the spiral preset URL - the stock 4-2 net plateauing at test loss ~0.38 through 4,590 epochs - is in fact the single most valuable thing on that page, because it is a clean, reproducible **under-capacity signature** to sit next to an over-fit one.

This reframes several sites entirely. **ML Visualiser** stays dropped, but its CNN module is instructive as an anti-example: it reads the ground-truth label and assigns it 70-90% confidence. That is *exactly* the leakage failure mode row 104 (model evaluation) and row 116's third failure mode ("val loss tracks train loss perfectly - the reported number is memorisation") are about. It is worthless as a teaching site and mildly useful as a five-minute "find the leak" exercise. Don't restore it; the point is that the drop was correct on first-exposure grounds and would have been wrong on failure-mode grounds - which is how much the slot matters.

The uncomfortable corollary: the 875 drill prompts - the material this slot serves - are structurally unreachable. `PER_TOPIC = 3` plus array ordering guarantees not one of them ever reaches the ladder. **If you want the visual layer to pay for itself, the review system has to change before the resources do.** Reserving one of the three per-topic slots for a drill (take prompts 0, 1, and the first `drill`) would cost nothing in throughput and would put failure-mode recognition - the thing visuals are genuinely good at - into spaced retrieval for the first time.

**Slot C - arithmetic self-checkers, used as feedback on hand computation.**

**CNN Explainer**'s second widget recomputes output dimensions live from Input Size / Padding / Kernel Size / Stride. That is not a visualisation; it is a marking scheme for row 114 subtopic 2 ("Padding, stride, dilation, groups and the 1x1 convolution," 35 min) and a partial one for q113-0's receptive-field recursion. Compute by hand, then check. That is retrieval practice with immediate corrective feedback - the highest-value pattern in the entire literature - and it happens to be delivered by a web page.

**Netron** belongs here too, and only here. Its reviewer was right that it "explains nothing on its own." It is an inspection instrument for an artifact you already built. List it under rows 113/116/117 as *"run this on your own checkpoint"*, never as a resource to browse - and carry the reviewer's correction, because a learner who points it at a raw `.pth` state_dict gets a flat weight inventory and concludes the tool is broken.

## 5. Agent-proposed slots I reject

**Transformer Explainer → row 50, `replace-do`. Reject outright.** The instinct is right that row 50's `do` is broken - it points at `youtube.com/@AndrejKarpathy`, a bare channel URL, marked "optional." But replacing a *build* with a *browse* is the worst available edit. Row 50's three scheduled cards are hallucination-mechanism diagnosis, KV-cache memory arithmetic for an 8xA100-vs-8xH100 purchase decision, and what reproducibility you can contractually commit to. Transformer Explainer serves none of the three - its own reviewer confirmed there is no KV-cache visualisation, no training, and a 12-word prompt cap that makes long-range behaviour untestable. Fix the `do` by pointing it at the actual video (`kCc8FmEb1nY`, which row 116 already carries) or a token-accounting exercise, and file Transformer Explainer as a Slot-A primer.

**TF Playground → row 111, `add-as-visual-primer`. Downgrade.** Covers one of the topic's four named mechanisms. Move to row 112 (loss-curve taxonomy, Slot B) and row 101 (regularisation's *effect*, Slot A). Note that even at row 101 it cannot serve the scheduled card: q100-1 asks for ridge-vs-lasso "three ways: the constrained-optimisation picture, what the SVD says each does to a principal direction, and the prior each corresponds to." The tool shows none of the three. It shows the boundary moving. That is the honest ceiling for the entire category: **visualisations serve `subtopics[].learn`; they never serve a card.**

**TF Playground spiral preset.** Drop as a distinct entry, keep the URL as a Slot-B failure-induction recipe inside row 112. One click on a thumbnail is not a resource.

**Gradient Descent Visualizer → row 95.** The reviewer found the cert expired 2026-08-28 and that the page contains no SGD, momentum, or Adam. Row 95's card q94-1 is "write Adam's update and derive the bias correction." Zero overlap with the scheduled retrieval, plus a security interstitial. Leave it out until the cert renews, and even then it is Slot A only.

**Distill → row 106 (hyperparameter optimisation).** Keep, and this is the one Distill mapping that survives: "Exploring Bayesian Optimization" is a derivation with GP surrogates and acquisition functions, not a picture, and row 106's subtopics are Optuna-based. Subtopic-resource, not primer. The AutoML claim in the PDF is fabricated and should be struck.

## 6. The budget, which decides everything

Across the 25 ML and maths rows the subtopic minutes already exceed the declared hours by **+693 minutes** (11,973 vs 11,280). Row 94 is +45, row 99 is +45, row 117 is +45. There is no slack anywhere.

The 25 non-duplicate kept sites, at the durations the reviewers themselves assigned, total **691 minutes**. Adding the visual layer as proposed would exactly double an overrun that already exists. Following the PDF's own "30 minutes each" protocol costs 780 minutes - thirteen hours, roughly a full month's study budget at this plan's pace.

**So the rule has to be net-zero: a visualisation may only enter by displacing minutes from the subtopic it attaches to, never by extending it.** At the 10-minute Slot-A cap and with Slot B folded into proof-of-work time that is already allocated, the whole layer costs roughly 150-200 minutes across 25 rows. That is affordable. At 30 minutes each it is not, and the thing it would displace is derivation time - the only activity in this plan that the scheduled cards actually test.

## 7. Answer, stated plainly

Adding visual resources **improves** this plan, but only under a protocol that is close to the opposite of the one the PDF prescribes. Ten minutes, not thirty. Before the reading, never after - because after the derivation it is redundant processing (expertise reversal) and, worse, it inflates the self-graded fluent/halting/gone signal that `grade()` in `lib/review.ts` accepts without challenge and the 1/7/21/60/150 ladder then compounds. Gated by a written prediction, or it is entertainment. Never adjacent to a review session in either direction.

The largest genuine win is not first exposure at all - it is **failure-mode induction inside the proof-of-work clinics**, where TF Playground, GAN Lab's unchecked "use pre-trained model" box, and R2D3 part 2's overfit leaf are tools for *manufacturing* a pathology you then have to diagnose from the plot. That is where visual material earns its place in a plan whose stated depth targets are all of the form "read a bad loss curve and name the cause." And it is currently unreachable, because 0 of the 875 failure drills ever enter the ladder.

Fix the scheduler first. Then the sites are worth adding.

**Files:** `/tmp/ml-topics.json` · `/Users/rasul/senior-fde-dashboard/lib/review.ts` · `/Users/rasul/senior-fde-dashboard/app/recall.tsx` · `/Users/rasul/senior-fde-dashboard/data/recall-bank.json` · `/Users/rasul/senior-fde-dashboard/data/curriculum/{110,111,113,115,106}.json`