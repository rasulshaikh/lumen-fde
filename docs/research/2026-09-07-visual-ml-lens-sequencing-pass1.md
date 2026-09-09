The learner is at Month 1 (`/Users/rasul/senior-fde-dashboard/reports/progress/2026-09-05T16-21-59-907Z-shell-mastery-and-scripting-in-progress.md`), so every month below is still ahead: M2 ≈ Oct 2026, M12 ≈ Aug 2027, M22 ≈ Jun 2028, M23 ≈ Jul 2028.

## The position

Sequencing is not a refinement on top of the mapping - it is the thing that makes the mapping usable. Honour every non-weak match at its own month and you get **64 placements for 26 surviving sites (2.5× duplication), 2,008 minutes / 33.5 hours of visual material, 56.5% of it (1,134 min) landing in M21-M23** - the three heaviest ML months in the plan at 59.5h, 69h and 73.5h of coursework respectively. TF Playground appears four times inside M22 alone (rows 111, 112, ×2 counting the spiral duplicate); Netron three times across M22-M23; Illustrated Transformer and BertViz twice each inside M23. The visual layer, scheduled naively, piles onto the exact months that are already saturated and starves M2-M11, which absorb only 440 minutes total.

## The measurement that forces the rule

Compute each site's month span over its non-weak matches. The distribution is bimodal with an empty middle - **nothing spans 5 to 10 months**:

| span | sites |
|---|---|
| 0-2 mo | GAN Lab, R2D3 p2, DBSCAN, CNN Explainer, Image Kernels, TensorSpace, Diffusion Explainer, REINFORCEjs, K-Means (Harris), Netron, ML Playground, R2D3 p1, ConvNet Playground |
| 4 mo | TF Playground, TF Playground spiral |
| **11-20 mo** | BertViz, Illustrated GPT-2, Illustrated Transformer, Transformer Explainer, bbycroft, Seeing Theory, Gradient Descent Viz, ML Visualized, Embedding Projector, Distill.pub, Setosa EV |

Every wide-span site straddles one of exactly two discontinuities the curriculum builds in: the **M-track → N/O gap** (maths at M2-M11, its application at M18-M23) and the **G/H → O gap** (LLM engineering at M12-M16, transformer internals at M23). Fifteen sites need no sequencing decision at all. Eleven do, and all eleven fail for the same structural reason.

## The rule

**Clause 0 - the scheduling unit is the page, not the domain.** Applying anything at domain level is what manufactures the 18-20 month spans. Setosa EV (span 20) is nine independent explorables; Distill (19) is ~45 independent articles; ML Visualized (18) is 12 downloadable notebooks in 4 chapters. Split first and the spans collapse: Setosa's eigenvector/PCA pages → row 94 (M2), its conditional-probability page → row 96 (M5), its image-kernels page → row 114 (M22). Distill's "Why Momentum Really Works" → row 95 (M4), "How to Use t-SNE Effectively" → row 107 (M21), the Circuits thread → row 114 (M22), the GNN pair → row 119 (M23), "Exploring Bayesian Optimization" → row 106 (M21). ML Visualized's Optimization chapter → row 95 (M4), cross-entropy → row 99 (M11), Linear Models → row 101 (M18), Clustering/Reduction → row 107 (M21), Neural Networks → row 111 (M22). This dissolves three of the four widest spans without a judgment call.

**Clause 1 - span ≤ 4 after splitting: schedule once, at the strongest match, done.**

**Clause 2 - span ≥ 11: apply the artifact test.** Does the resource require the learner to already possess a model, checkpoint, notebook or dataset of their own? **No → primer → earliest month, opened in the pre-read slot before the topic's first deep session, and never re-opened.** **Yes → working tool → latest month only, and inside that month not at topic start but at the proof-of-work/debug phase.**

**Clause 3 - ration by slot geometry.** Subtopics carry explicit `minutes` (15-35, occasionally 50). A 12-15 minute resource (Image Kernels, R2D3 p1, DBSCAN, K-Means, TensorSpace, Netron) drops into a subtopic slot cleanly. A 40-minute one (bbycroft, Illustrated GPT-2) does not fit any slot in row 50 (max 35 min) and must take the topic-level `watch`/`do` slot or span two subtopics. Cap at one primer + at most one working tool per row. Row 107 currently attracts seven candidates against a 455-minute budget - dropping all seven costs 192 min, 42% of the topic's entire subtopic budget. Row 101 attracts five against the smallest budget in the ML set (390 min), and four of the five are neural-net or probability sites that matched on the generic words "regularisation" and "bias-variance."

**Clause 4 - rot decays with distance.** A verdict from Sept 2026 applied to M23 is a 22-month-old verdict. Re-verify at month start, weighted by fragility.

## Primers - open early, then never again

**Seeing Theory → row 96 (M5), not row 101 (M18).** Intuition-only, archived ("This site is archived for reference"), and contains zero ML by the finding's own admission. Its row-101 match is 13 months later, by which point row 101 needs the bias-variance decomposition computed, not felt.

**Setosa eigenvector/PCA → row 94 (M2). Embedding Projector → row 94 (M2), not row 107 (M21).** This is the rule's sharpest test, because Embedding Projector's *exact* match is at row 107 and its *strong* match at row 94. It goes to M2 anyway: the finding states it has "zero math exposition, derivations or code - you will leave with strong geometric intuition but unable to implement t-SNE or UMAP," which is precisely the capability row 107 demands. The M21 slot belongs to Distill's t-SNE article, which teaches the perplexity/cluster-size/distance failure modes the Projector cannot. Two sites, same row, resolved by the rule rather than by taste.

**Gradient Descent Visualizer → row 95 (M4) only; delete its row 112 mapping.** The row-112 match (M22, optimisers) is refuted by content, not by sequencing: the finding grepped the page for Adam/momentum/SGD/RMSprop/Adagrad and got zero hits. The page implements Nelder-Mead, full-batch GD, and nonlinear CG - a classical-optimization axis, not the deep-learning adaptive-optimizer axis row 112 covers. Scheduling it at M4 also front-loads the *only* site with a live TLS failure (wildcard cert expired 2026-08-28); at M4 ≈ Dec 2026 that is a 3-month verification horizon instead of 21.

**TF Playground → row 111 (M22) only. Reject row 101 (M18) with cause, and fold the "spiral preset" entry into it.** At M18 row 101 teaches logistic regression, i.e. cross-entropy; TF Playground uses squared error even for classification and has no cross-entropy anywhere. It would actively teach the wrong loss for the topic in hand. The spiral entry is the same origin differing by a URL fragment, and its default 2×[4,2] net cannot solve the spiral - verified plateau at test loss ~0.38 through 4,590 epochs. Sequencing kills the duplicate automatically: one site, one month, with "switch to spiral, observe that it does not converge, then add depth or features" as an instruction *inside* the M22 session rather than as a second entry.

**GAN Lab → row 99 (M11).** Span 0, and the only correct use of a GAN artifact in this plan is as a **KL/JS divergence visualizer** for information theory, eleven months before any deep learning. Session note must say uncheck "Use pre-trained model" or the 25 minutes shows a converged equilibrium.

**Transformer cluster, split across the 11-month gap.** Row 50 (M12) states its own requirement: "You do not need to derive backprop, but you must be able to read `softmax(QK^T/sqrt(d_k))V` and say what each symbol is and what shape it has." Row 116 (M23) lists rows 94, 95, 99, 111, 112, 113, 115 as prerequisites. The plan already encodes the two depths; the sequencing rule just reads them off.

- **M12: Transformer Explainer + Illustrated GPT-2.** Illustrated GPT-2 matches row 50's decoding/top_k subtopics exactly and is 40 min, so it takes a reading slot, not a subtopic.
- **M23: bbycroft as the row-116 primer.** Held back from M12 deliberately - its payload is per-cell resolution ("every cell is one real number"), which is wasted on M12's shape-level requirement but is exactly row 116's first subtopic, "The residual stream and the shape contract of a decoder block… x is (B,T,d_model) at every point," which asks the learner to hand-compute `4*d_model² + 8*d_model²` and check it. bbycroft's nano-gpt has a stated 85k parameter count to check against.
- **M23: Illustrated Transformer as the row 115 → 116 bridge.** Row 115 is literally "seq2seq and the road to attention" and sits in the same month as 116. Read at the end of 115, before 116 opens.

## Working tools - open late, at debug time

**BertViz → row 116 (M23), during the build. Reject its row 50 (M12) primer slot.** Three grounds: it is a pip-installable library needing local HF weights, `attn_implementation="eager"` and a Jupyter/Colab runtime, whereas row 50's prerequisites specify hosted-API work; its neuron view is BERT/GPT-2/RoBERTa only on a vendored 2019 fork; and the M12 payload is delivered with zero setup by Transformer Explainer. At M23 it earns its place against two named artefacts in row 116's proof-of-work: the head view is the visual assay for the `no-causal-mask` row of the "Designing the ablation table" subtopic (35 min), and for the causality test in `attention-forensics` that "perturbs token t and asserts bitwise-identical logits at all positions < t" - a correct causal mask renders as a strictly lower-triangular head view. Insert at the "Debugging a training run: the diagnostics ladder in order" subtopic (50 min), the largest slot in row 116.

**Netron → row 117 (M23), not row 113 (M22) as mapped - unless you add an export step.** I grepped all 119 topics: **ONNX, TorchScript and torch.export appear nowhere in the plan.** Safetensors appears at rows 12, 55, 117. Per the verified finding, a raw `.pth` state_dict and Safetensors both render as a flat inventory of `Weights` nodes - no operators, no data flow. So Netron's headline architecture-DAG feature is unreachable at row 113 or 114 with what the plan actually produces. Its real value is at row 117, where it does not need the graph at all: LoRA adapters ship as Safetensors, and row 117's proof-of-work names "the `target_modules` mismatch that trains 0.02% of what the config claims" as a failure mode to reproduce. Netron on the adapter file shows exactly which modules received A/B matrices and at what rank. That is a tool capability matched to a named failure the plan already schedules. If you want Netron at row 113 as advertised, you must add a ~20-minute export subtopic; otherwise reclassify it as a weight-shape inspector.

**AttentionViz → nowhere.** Correctly grouped with the inspection tools in principle, moot in fact: HTTPS frontend calling `http://18.219.70.154:8500`, blocked as mixed content, with HSTS closing the http workaround permanently. Its slot would be M23 ≈ Jul 2028 and the backend is an unmanaged EC2 box with no domain. Do not schedule it and do not put it on a re-check list.

## What the rule buys

Duplication drops from 64 placements to 26. The M22-M23 visual load drops from 767 minutes to roughly 300. M2-M11 rises from 440 to roughly 700, spreading intuition-building across months where the ML-track hour load is 11-14h rather than 69-73.5h. And two verification tasks become month-keyed rather than perpetual: fix the R2D3 hostname (`www.r2d3.us` returns Cloudflare 522; the apex works) before M18, and re-check the Gradient Descent Visualizer certificate before M4.