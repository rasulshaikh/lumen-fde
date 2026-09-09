VERIFICATION RESULT - 4 recommendations + 1 repair, checked against `/Users/rasul/senior-fde-dashboard/data/curriculum.json`, `/Users/rasul/senior-fde-dashboard/data/workbook.json`, `/tmp/ml-topics.json`, and `/Users/rasul/senior-fde-dashboard/docs/research/2026-09-07-visual-ml-site-verification.json`.

The document is unusually accurate on facts. Every subtopic name, minutes figure, incumbent label, learn-text quote, arithmetic total, script behaviour and URL status I checked is exact. Three claims are wrong, one load-bearing. Two recommendations are sound as written, one is sound but overstated, one should be cut.

---

## ITEM 1 - bbycroft moved within row 116 from subtopic 17 to subtopic 0. CUT IT.

**(a) Names - PASS, verbatim.** `topics["115"]` (i=115, row 116, month 23, hours 17.0). `subtopics[17].name` = `"Attention-head heatmaps: producing them and reading them honestly"`, 30 min. `subtopics[0].name` = `"The residual stream and the shape contract of a decoder block"`, 25 min.

**(b) Incumbent - the document's own eviction test fails here.** Incumbent at `115[0]` is `"Maths/CS/AI Compendium - Ch.07 Computational Linguistics, 04. Transformers and language models"`. §3.1 says *"it is still cited elsewhere in the plan, so nothing leaves the library."* **False.** Across all 2,236 subtopic resource URLs, `chapter%2007 .../04. transformers and language models.md` occurs at **exactly one** slot - row 116 subtopic 0. The *repo* is cited 24 times; that chapter file goes to zero. This is precisely the survival check the document runs correctly for Vaswani (3 rows → 2) and omits for its own eviction.

**(c) Site behaviour vs the verification JSON - partly unsourced.** The verdict's conclusion is quoted correctly: *"Genuinely served: only 'The position-wise feed-forward network and the activation choice' ... and, loosely, 'The residual stream and the shape contract of a decoder block'. That is 2 of 20 subtopics."* But:

- The document silently upgrades **"loosely"** into a positive placement.
- The auditor's *unqualified* survivor is the FFN/GELU match - `115[10]`, incumbent Shazeer *GLU Variants*. The document never evaluates that slot and installs bbycroft on the weaker of the two.
- The evidence credited to "the challenge" - *"no head selector, a three-token `{A, B, C}` vocabulary"* - **is not in the verification JSON** (`grep -i "head selector|three-token|3-token|A, B, C"` → 0). It comes from `docs/research/2026-09-07-visual-ml-lens-risk-pass2.md` line 15: *"bbycroft has no adjustable parameter anywhere and a `{A,B,C}` vocabulary."* Substance corroborated, attribution wrong. And **the challenge never audited bbycroft at subtopic 17** - 17 was not among the seven row-116 matches examined - so "it provably cannot serve that slot" is lens prose, not a challenge finding.

**(d) Minutes - PASS.** 25 min is the real field value.

**Simpler alternative never considered:** evict bbycroft outright, put BertViz at 17, leave the Compendium at 0. One eviction instead of two, and it does not retire a chapter URL to preserve a resource the auditor scored 2-of-20 on a 17-hour row whose depth target is debugging a *training* run, which an inference-only viz cannot touch.

---

## ITEM 2 - BertViz into row 116 subtopic 17. SOUND. Adopt.

**(a)** PASS.

**(b) Net positive, and the escape from the challenge is legitimate.** The challenge killed BertViz because row 116's `Do` already renders per-head heatmaps. Verified: `workbook.json` Plan[116][10] = *"Harvard NLP - The Annotated Transformer"*. The refutation is explicitly scoped - *"four load-bearing sentences in match 1 are false"* - and all four concern displacing the `Do`. This document is not displacing the `Do`, so the refutation does not reach it. The one-resource-per-subtopic contract is real: **0 of 2,236 subtopics have a null resource**, so slot 17 needs an occupant once bbycroft leaves.

**Weakness not stated:** the subtopic's verb is *"producing them and reading them honestly."* The challenge established the `Do` already teaches the **producing** half (`attn_map(attn, layer, head, ...)`, `for layer in range(6)`, `assert n_heads == 8`). BertViz adds breadth on the *reading* half only - narrower than §3.2's framing.

**(c)** The one JSON-sourced trap is quoted accurately: *"BertViz renders a pretrained HF GPT-2, which is always triangular, so it cannot detect leakage in Rasul's own implementation."* The others (`attn_implementation="eager"`, RoBERTa-only neuron view, issue #131, Apache-2.0) return **0 hits in the verification JSON**; they come from `risk-pass1.md` line 27. Corroborated, mis-attributed.

**(d)** 30 min - PASS.

---

## ITEM 3 - Transformer Explainer into row 50 subtopic 3. SOUND SLOT, OVERSTATED CASE.

**(a) PASS.** `topics["49"]` (i=49, row 50, month 12, hours 15.5). `subtopics[3].name` = `"Self-attention: Q, K, V and the causal mask, at the level where you can draw it"`, 40 min. Incumbent = `Vaswani et al., "Attention Is All You Need" (arXiv)`.

**(b) The "decisive check nobody ran" reproduces exactly.** `1706.03762` appears at precisely three subtopics: `(50, 3)`, `(115, 19)`, `(116, 2)`. Row 50 outcome #2 is verbatim as quoted.

Three things are softer than presented:

1. **"Costs nothing" overstates.** Both survivors are month 23; the learner loses any pointer to the paper for eleven months. Defensible trade, not a zero.
2. **It fails the document's own CNN Explainer test.** The challenge says of row 50: *"BPE splitting, positional embedding summed not concatenated, Q/K/V with the causal mask ... are genuinely taught."* And `49[3].learn` already contains the derivation - *"divide by sqrt(d_k) to keep the softmax out of saturation ... positions j > i are set to -inf before the softmax."* The delta is **modality, not content** - exactly the ground on which §7 kills CNN Explainer (*"the only real delta is modality (interactive vs passive), not content"*). The test is applied to one and not the other.
3. **The gate is unenforceable.** §3.3 conditions the swap on *"draw first ... then open the page to check."* §6 concedes *"`resource` has no notes field."* It is the sole exception to the rule Disagreement 5 declares right by evidence.

**(c) PASS, and the re-slot is the correction the auditor asked for.** Verbatim in the JSON: `AttentionMatrix.svelte` reading `block_${blockIdx}_attn_head_${attentionHeadIdx}_attn`/`_attn_masked`/`_attn_dropout`; `HeadStack.svelte` cycling 12 heads; `InputForm.svelte` line 40 `const wordLimit = 12`; *"ROW 50 - survives on substance, refuted as labelled ... 'replace-do' is the wrong verb."* (626 MB / 63 chunks is from `risk-pass1.md`, not the JSON.)

**(d)** 40 min - PASS.

---

## ITEM 4 - Naftali Harris DBSCAN into row 107 subtopic 8. SOUND. Adopt. One supporting claim false.

**(a) PASS.** `topics["106"].subtopics[8].name` = `"DBSCAN: core points, density-reachability, and the border points that are not deterministic"`, 25 min. Incumbent = `"scikit-learn - sklearn.cluster.DBSCAN (eps, min_samples, core_sample_indices_, noise label -1)"`.

**(b) Net positive on the headline half - one unacknowledged loss.** The `learn` text is quoted verbatim and correctly. "sklearn is not lost from the row" checks out: `106[9]` = `plot_dbscan.html`, `106[5]` = `plot_kmeans_assumptions`, `106[19]` = `common_pitfalls`, Plan[107][4] Read = sklearn Unsupervised User Guide. **But** the same `learn` text depends on API-reference facts neither the applet nor the example pages carry: `metric='precomputed'` for the sparse radius-neighbours graph, and *"DBSCAN has no predict method by design."* The evicted page is the row's only API reference.

**(c) PASS - best-evidenced item.** *"MATCH 1 (exact, DBSCAN core/reachability/border) - SURVIVES. Three-for-three on the subtopic's three named components, and the border half is not vocabulary overlap."* Source-level confirmation (`dbscan.js` 100-106 overwrite branch, `generate.js dbscan_borders()`, Example A / minPoints=4 / epsilon=1.98). Every trap in §3.4 is verbatim.

**FALSE CLAIM - load-bearing for Disagreement 6.** §3.4 and Disagreement 6 assert this is *"the single per-match claim in all 26 challenge verdicts that the auditor recorded as surviving."* At least eight others record survivors:

- Distill.pub - *"n = number of proposed matches that survive **intact** (rows 114 and 106)"*
- ML Visualized - *"1 of 5 proposed matches survives"*
- The Illustrated GPT-2 - *"ROW 116 - survives only in reduced form"*
- ConvNet Playground - *"ROW 114 (CV) - half survives"*
- Netron - *"Row 114 ... survives, but not at 'exact'"*
- Transformer Explainer - *"ROW 50 - survives on substance"*
- R2D3 part 1 - *"1 of 3, and only in downgraded form"*
- Embedding Projector - *"only row 107 survives"*

The true, narrower claim - DBSCAN match 1 is the only one surviving **unqualified** - still supports the recommendation. But Disagreement 6 uses the absolute version to overturn risk-pass2, and the absolute version is wrong.

**(d)** 25 min - PASS.

---

## THE REPAIR - row 50 `Do` / `Do URL`. CORRECT AND OWED. Adopt.

`Plan[50]`: col 10 = `"Karpathy: Let's build GPT (follow along, optional)"`, col 11 = `"https://www.youtube.com/@AndrejKarpathy"` - a channel root, exactly as stated. Header confirms col 10 = `Do (lab / game / build)`, col 11 = `Do URL`. Duplicate warning correct: `Plan[116][8]` = `https://www.youtube.com/watch?v=kCc8FmEb1nY`. Row 50's `proofOfWork` is `llm-mechanics-lab` with all four named parts.

---

## MECHANISM (§6) - verified clean, one framing objection

All reproduces: `115.json`/`49.json`/`106.json` are the right files; **119 of 119** per-topic files carry stale `month`/`hours` (`00`: 1/8 vs 1.0/14.0; `49`: 7.0/10 vs 12.0/15.5; `106`: 12.0/7 vs 21.0/12.5; `115`: 13/12 vs 23.0/17.0; `116`: 13/10 vs 23.0/16.0 - all five exact); `scripts/build-curriculum.py:44` is `topics[str(i)] = d`, `:79` gates on `--strict`; `scripts/renumber-months.py:110` is `t["month"] = int(r[MONTH_COL])` with `:82` asserting `diff in ([], [MONTH_COL])`; `scripts/verify_curriculum_urls.py` does route 522 to `dead` (absent from the 500/502/503/504 retry set and from the blocked/dead lists, falling through to `("error", code) if code == 0 else ("dead", code)`) and TLS failure to `error`. Recall bank: **1,710 prompts, 835 recall / 875 drill, 357 eligible, 357 of 357 recall**, `LADDER = [1, 7, 21, 60, 150, 240, 330]`, `PER_TOPIC = 3`. Minutes: rows 94-119 = **12,234 vs 20,100**; 107 = 455/750; 116 = 710/1020; 114 = 620/930; whole plan **59,676 min = 994.6 h vs 1,614 declared**. §5 census: **2,236 subtopics**, 3 interactive + 5 Distill = **8 = 0.36%**. All four new URLs return 200.

**Objection to the framing.** §1 says *"Total cost: zero minutes, zero hours."* But step 4 runs `build-curriculum.py --strict`, which **cannot pass** until step 1 reconciles 119 files - and step 1 is described as *"not part of this decision."* The four URL swaps are free; shipping them is not.

**Two minor errors:** §4's Embedding Projector greps are given as `analogy 2, fairness 4`; actual counts are 0/0 over the 827 ML subtopics (the verdict's own numbers) and 7/6 over the full 2,236. Non-load-bearing. §3.4's "seven other datasets" vs the verdict's "all eight" is arguably a correction, not a misread.

---

## IS THE SURVIVING SET TOO LARGE, TOO SMALL, OR RIGHT?

**One item too large - cut Item 1.**

Not because four is too many in principle; the net-zero, minute-neutral, eviction-accounted discipline is the right unit of decision and the document applies it more rigorously than any of the six lens passes. It is too large because **the bbycroft relocation is the one edit that fails the document's own standard.** It creates a second eviction to preserve a resource the auditor scored 2-of-20, installs it on the auditor's *"loosely"* match rather than its unqualified one, retires the only citation of a chapter URL while claiming nothing leaves the library, and rests on evidence attributed to the challenge that is not in the challenge.

Drop it and the edit is strictly simpler and better-supported:

1. **BertViz → 116/17**, evicting bbycroft (one eviction, not two; the Compendium stays at 116/0)
2. **Transformer Explainer → 50/3**, gated, with the eleven-month Vaswani gap stated honestly rather than as "costs nothing"
3. **Harris DBSCAN → 107/8**, on the narrower true claim, with the `metric='precomputed'` / no-`predict` API loss added to the trap paragraph
4. **Row 50 `Do` → `llm-mechanics-lab`**

Three swaps takes the interactive-demo class from 8/2,236 to 9/2,236 (0.40%). The §7 rejections - CNN Explainer, Netron, ML Visualiser, AttentionViz, R2D3 part 2, the TF Playground pair - all hold against their verdicts; none of the twenty-two should be reinstated, so the set is not too small at any point.