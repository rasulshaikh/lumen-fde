# Market tab layout — design

Date: 2026-09-07
Status: approved (Option A), ready for implementation

## The problem, measured

The Market tab renders 34 coverage entries as prose blocks at identical visual weight:

- **2 entries sit at 0%** — a skill no requisition asks for, rendered as coverage data.
- **8 more sit at 1–4%** (2–7 reqs of 189), visually indistinguishable from Python at 67%.
- **133 plan-row chips, all reading "not started."** Every one. Zero bits of information,
  rendered 133 times.
- **9,025 characters of prose in one list**, and all 34 sentences contain the phrase
  "of core FDE requisitions."

## Root cause

`benchmark.ts` and `insight.ts` emit a rendered `statement` string per entry, and the tab prints
it. That rule exists so the weekly email and the tab say identical sentences with one place to
fix a wording, and it is correct — **for the email**. An email is a linear read where a full
sentence is the right unit. A tab is a scannable surface where a sentence per row is a wall.

The structured fields were always there (`pct`, `hits`, `reqs`, `companies`, `rows`,
`primaryRow`); the tab simply was not using them.

**The fix is scoped to the tab.** The email keeps rendering `statement`. Nothing in
`benchmark.ts` or `insight.ts` changes, so the "one place to fix a sentence" guarantee survives
for the surface it was written for.

## Layout

Three zones, in this order, each with its own heading and visual separation:

### 1. Decide — what to study next
Readiness (absolute, stated honestly) then the ranked marginal table. This leads because it is
the only zone that answers a question you act on today.

### 2. Reach — where you can actually work
The in-India requisitions **by company and title**, not as a percentage. "Databricks — Staff
Forward Deployed Engineer, Remote - India" is more useful than any share. Then the five-tier
distribution as a compact bar, and the derived-count caveat.

### 3. Market — reference
The coverage table (below), velocity, gaps. Scrolled to, not led with.

Quaere's reading sits last, in its distinct block, still labelled interpretation not measurement.

## The coverage table (Option A)

One row per skill. Four columns:

| column | content |
|---|---|
| Skill | label only — never the sentence |
| Market | inline bar + `NN%`, so 67% and 1% look different |
| Yours | reachable-market %, coloured green when ≥ market, red when below |
| Plan row | `row NN` link + month, replacing the chip stack |

Three rules underneath it:

1. **A 0% skill is never rendered.** It is not coverage.
2. **A status is rendered only when it is not "not started."** Today that hides all 133; the day
   row 28 is done it becomes the most useful mark on the page. One rule, correct in both states.
3. **Only skills at ≥20% are expanded.** The remaining 24 collapse behind a
   `24 more below 20%` disclosure. Hidden 0% entries are counted in the footer so nothing
   vanishes silently.

Supporting rows move into the row link's title attribute rather than rendering as chips.

## Reuse, not invention

`app/globals.css` already has the right idioms and they should be used rather than duplicated:
`.track-row` (a 4-column grid with a progress bar), `.track-progress`/`span` (the bar), `table`
/`th`/`td`, and `.status`. New classes only where no existing one fits.

## Testing

This is presentational, so the existing computation tests are unaffected and must stay green
(`test:market`, `test:surfacing`, `test:insight`). Verification is by rendering:

- With today's data: no 0% skill appears; no "not started" text appears anywhere in the tab; the
  coverage list shows 10 rows plus a disclosure naming the 24 hidden.
- With a synthetic progress event marking row 28 done: a status appears on exactly that row.
- The empty state (no `insight.json`) still renders all three zone headings.
- Light and dark both legible; the page works at 850px, where `.mock-row` already collapses.

## Not doing

- No charting dependency. Bars are CSS, the sparkline stays inline SVG.
- No change to `benchmark.ts` or `insight.ts`. The statement strings stay for the email.
- No sorting or filtering controls. The order is share-descending and that is the useful order;
  controls are a second feature and would earn their own decision.
