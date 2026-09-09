# Research artifacts, 2026-09-07

Output of two adversarial multi-agent workflows. Both are evidence, not conclusions:
every claim below was produced by an agent that fetched the thing it describes, but
only the visual-ML mappings went through a dedicated challenge stage.

## Job market
- `2026-09-07-job-market-benchmark-spec.md` - the implementable design for a daily
  first-party ATS scan and a market benchmark against the plan. 30 boards, verified
  tokens, two-stage fetch, storage, and the benchmark statement format.
- `2026-09-07-jd-skill-taxonomy-{infrastructure,ml,fde-craft}.md` - skill vocabulary
  built from real fetched job descriptions, each skill mapped to plan rows or marked
  GAP. The craft one reconstructed all 119 topics and searched all 2,236 subtopic
  bodies, and separates real gaps from things that only look like gaps.

## Visual-ML list (28 sites)
- `2026-09-07-visual-ml-site-verification.json` - per-site verification and the full
  challenge verdicts.
- `2026-09-07-visual-ml-lens-{pedagogy,risk,sequencing}-pass{1,2}.md` - three
  cross-validation lenses, each run TWICE independently. Keep both passes: they do not
  fully agree, and the disagreement is informative. risk-pass1 argues for adding
  nothing; pedagogy-pass2 argues adding helps if every item is demoted from where the
  source list puts it; risk-pass2 is the only one that lands a concrete set (four items,
  90 minutes). The risk lens is the most load-bearing either way - it establishes that
  every one of the 2,236 subtopics already carries exactly one resource, so nothing here
  is additive, and that several "exact matches" recommend installing the incumbent.

## Known defects in the runs that produced these
- The challenge stage used ONE `refuted` boolean per site for a BUNDLE of matches, so
  all 26 read as refuted while 25 still name a surviving match. Read
  `strongestSurvivingMatch`, not `refuted`.
- Four synthesis agents returned a bare acknowledgement when their prompt inlined tens
  of thousands of characters. The job-market spec here was recovered from the agent's
  transcript, where it had been written in full. The coverage lens was lost this way
  and re-run; the visual-ML proposal is still being regenerated.
- FDE role counts moved between runs (Databricks 321 -> 184) because the title filter
  was agent judgement. Section 1 of the spec explains it and section 2 makes the filter
  deterministic config - which is the reason that file is the deliverable.
