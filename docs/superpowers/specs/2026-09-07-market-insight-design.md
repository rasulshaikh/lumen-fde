# Market insight, and Quaere reading it — design

Date: 2026-09-07
Status: approved, ready for implementation

## The problem

The Market tab answers *"what does the market ask for?"* It does not answer *"so what?"*.
189 core requisitions across 23 companies is accurate and impersonal — the same number for any
candidate. Nothing on the tab is about Rasul: not his progress, not his location, not which
slice of the market he should aim at. And Quaere, the study guide, cannot see any of it except
one 60-word paragraph in the weekly email.

## Architecture

```
reports/market/index.json ─┐
reports/progress/*.json   ─┼─→ lib/market/insight.ts (pure) ─→ reports/market/insight.json
data/workbook.json        ─┤                                          │
reports/market/trend.json ─┘                                          ↓
                                            ┌─────────────────────────┼──────────────────┐
                                            ↓                         ↓                  ↓
                                   /api/ask context          Market tab panel     digest / weekly
```

`benchmark.ts` answers what the market asks for; it is impersonal and publishable.
`insight.ts` answers what that means for this candidate; it is personal and is not.
Different inputs, different audiences, different blast radius if wrong. Hence two files rather
than a 700-line `benchmark.ts`.

`insight.ts` is pure — `now` is a parameter, no network, no filesystem — so its arithmetic is
testable without a 47 MB scan, exactly as `benchmark.ts` is.

It runs in the existing cron immediately after `computeBenchmark`, and writes
`reports/market/insight.json` **sequentially** after the other three files. Concurrent writes
race the branch ref; the first real scan lost `benchmark.json` to precisely that.

## Analyses

### 1. Readiness — market-weighted, against real progress

**Progress does not come from the workbook.** `workbook.json` column 15 is a stale baseline:
117 `Not started`, 2 `Skipped`, no other value. Real progress lives in `reports/progress/*.json`
(written by `/api/progress`) and is mirrored to `lumen-statuses` in localStorage. Reading the
workbook column would peg readiness at 0% forever and look like a bug.

A skill counts as evidenced when its `primaryRow` is complete. Readiness is weighted by market
share, not by row count — clearing a 67% skill is worth more than clearing a 4% one:

```
readiness = Σ(pct of evidenced skills) / Σ(pct of all skills)
```

**The marginal table is the deliverable, not the headline.** Rasul is at Month 1, so readiness
is ~0% today and will stay low for months; an absolute number that barely moves is not a
decision aid. For every incomplete row that carries a skill, compute the readiness gain from
finishing it, and rank. That answers "what do I do next" from the first run:

> Finishing row 28 (Production Python architecture, 14.5h) moves readiness 0% → 12%.
> That is the largest single move available. Row 59 (Evals as infrastructure, 12h) is next at +7.

State the absolute number honestly and lead with the ranked table.

### 2. Reachability — five tiers, not a boolean

`location` is already stored, free text, 253 distinct values (`Washington, DC`, `Europe`,
`United Kingdom`, `Tokyo`, `United States`). Three tiers fall out of it with no new extraction.
Visa and clearance language lives in the JD body, which is deliberately discarded, so it is
extracted **at scan time** into a new `ReqRecord.reach` field, the same way `skills` already is.
That keeps the never-store-JD-text rule intact.

| tier | meaning |
|---|---|
| `india-remote` | employable from Pune today — remote-global, or explicit India remote |
| `emea-apac-remote` | remote with a stated region that overlaps IST |
| `india-office` | an Indian city in `location` |
| `relocate-sponsor` | on-site elsewhere at a company that sponsors |
| `out-of-reach` | US-person clause, active clearance, or a region that excludes India |

Report as a distribution over the core count, and recompute every headline percentage within
`india-remote + emea-apac-remote` as a second column. "Evals is 42% of the market" and "evals is
55% of the market you can actually take" are different facts and both belong on the tab.

### 3. Segments — the market is five markets

Assigned from `company` + title family, both already stored.

| segment | companies |
|---|---|
| `deployment-strategist` | Palantir, Scale GPS, (Anduril, Vannevar — disabled) |
| `agent-engineer` | Sierra, Decagon, Cresta, Observe AI |
| `frontier-lab-applied` | OpenAI, Anthropic, Cohere, Mistral |
| `data-platform` | Databricks, Snowflake, dbt/Fivetran, Sigma, Datadog |
| `inference-infra` | Baseten, Modal, Fireworks, Anyscale, Together |

Per segment: requisition count, top five skills by share, reachability mix, and readiness
computed against that segment's demand rather than the whole market. The output is a ranked fit
list — a segment that is 60% reachable and 30% covered beats one that is 5% reachable and 50%
covered, and the tab should say which and why.

### 4. Velocity — honest about having one data point

From `trend.json`. Requires at least two points spanning seven days; reuse `MOVE_MIN_POINTS = 3`
so a skill must move three points or cross a 25/50/75 band to be reported. With one point,
render "one scan recorded, velocity starts next week" and nothing else. Never interpolate.

## Quaere

Three surfaces, one rule: **Quaere may read every number and may write none.**

**a. `/api/ask` context.** Load `benchmark.json` and `insight.json` alongside the existing
curriculum, workbook, library and repository context. Cap the injection the way
`syllabusContext` already caps at 7000 chars, so market data cannot crowd out the question.
Reach: the dashboard chat and the `ask_lumen` MCP tool, so the same answer is available from
Claude Code. This is the highest-value surface and the lowest-risk one — Quaere quotes computed
numbers rather than producing them.

**b. Market tab reading.** One paragraph, ≤80 words, generated by the cron and stored in
`insight.json` so the tab stays model-free at request time. Same digit ban and the same
post-check as the weekly email: any digit drops the paragraph. Rendered in a visually distinct
block labelled *"Quaere's reading — interpretation, not measurement"*, below the numbers, never
interleaved. If the model fails, the block is absent and nothing else changes.

**c. Proactive flags.** Deterministic, no model. Emit a flag when readiness changes by ≥3
points, when a new `india-remote` core requisition appears, or when a skill crosses a band.
Flags render on the tab and feed the digest's existing conditional market section, which already
caps at three lines and omits itself when empty.

## Testing

`lib/market/insight.test.mts`, in the established style: `npx tsx`, hand-rolled `ck()`, no
framework. Pin the things that produce a plausible wrong number rather than a crash:

- readiness weights by market share, not row count
- readiness reads progress events, not the workbook column (a workbook-only run must not read 0%)
- the marginal table ranks by gain and excludes completed rows
- reachability tiers are mutually exclusive and sum to the core count
- an `out-of-reach` req never enters a reachable percentage
- segment assignment is total: every core req lands in exactly one segment
- one trend point yields no velocity claim
- a Quaere paragraph containing any digit is dropped

## Explicitly not building

- **Per-role fit scoring / "should I apply to this".** Cut in the benchmark spec and still cut:
  it turns a market-measurement tool into a job-application tool.
- **Salary or comp analysis.** Ashby exposes bands, they are inconsistently populated and
  geography-mixed, and the Comp reality tab is already honest about not knowing.
- **Model-written numbers anywhere.** The whole design depends on the separation holding.
- **Backfilled velocity.** There is no way to recover board state from before the first scan.
