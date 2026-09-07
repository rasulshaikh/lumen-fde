# Platform documentation — design

Date: 2026-09-07
Status: approved, ready for implementation

## The problem

`docs/lumen-fde-architecture.md` is 323 lines describing a system that no longer exists. It has
no Sandbox tab, no Market tab, no market-scan cron, no `benchmark`/`insight`/`reach` modules, no
Quaere, and it predates the 890h → 1,588h and 13 → 23 month rebaseline. It says **"13 tools"**
where `mcp/server.js` now serves **14**.

Nothing in the codebase reads it, so nothing caught the drift.

## Four readers, one set of facts

Four documents, because four genuinely different people read them. **One** of them holds facts;
the other three are lenses that cite it. A number appears in exactly one place.

| file | reader | holds |
|---|---|---|
| `docs/platform/architecture.md` | someone who needs to understand the system | **every fact**: components, data flow, file formats, env vars, the source-vs-built distinction |
| `docs/platform/operating.md` | Rasul, studying | how to use it: the 14 MCP tools, 10 tabs, 2 crons |
| `docs/platform/runbook.md` | Rasul at 3am, or whoever inherits it | what breaks, blast radius, how to fix |
| `docs/platform/talk-track.md` | Rasul in an interview | the decisions, the tradeoffs, the bugs found — and the plan rows each maps to |

Interview evidence and study companion merge deliberately: *"the market subsystem is row 20's
CI/CD and row 63's drift detection, built for real"* is the same sentence in both jobs.

The lenses may restate a fact only by citing `architecture.md`. Where a lens needs a number, it
names the anchor it came from so the verify script can check it.

## Making the docs testable

`scripts/verify-docs.py` — greps every numeric claim in `docs/platform/*.md` and asserts it
against source data. Non-zero exit on any drift, listing file, line, claimed value, actual value.

Anchors, and where truth lives:

| claim | source of truth |
|---|---|
| plan rows, active rows | `data/workbook.json` `Plan` |
| total hours, month count | `data/workbook.json` cols 13 and 1 |
| subtopics | `data/curriculum.json` |
| enabled boards | `data/market-sources.json` `enabled` |
| MCP tools | `mcp/server.js` tool definitions |
| tabs | `app/page.tsx` `TABS` |
| API routes, crons | `app/api/**/route.ts`, `vercel.json` |

This is not a new idea in this repo: `scripts/build-curriculum.py` already hard-errors on
month/hours drift between the workbook and the per-topic files, and its comment records that a
renumber once silently desynced 90 of them. Same guard, pointed at prose.

The script must be run and pass as part of this work, not merely written.

## What each document must get right

**architecture.md.** The distinction that has already caused one real bug: `data/curriculum/NN.json`
is the SOURCE and `data/curriculum.json` is BUILT from it by `scripts/build-curriculum.py`. Two
scripts wrote only the bundle, and the next build reverted 117 of 119 topics. Any doc that gets
this backwards will cause it again.

**operating.md.** Every one of the 14 MCP tools: what it answers, its inputs, when to reach for
it. This is the half Rasul uses daily with Claude Code beside him.

**runbook.md.** Grounded in failures that actually happened, not hypotheticals — the concurrent
GitHub writes that raced the branch ref and lost `benchmark.json`; the truncation guard that
checked a match count instead of a board total; `SCAN_DEADLINE_MS` assuming a 300s function.

**talk-track.md.** The decisions and why, including the ones that were wrong and how they were
caught: statement strings that made the tab unreadable, a challenge schema too coarse to express
per-match verdicts, gap claims that dissolved under adversarial review. An FDE interview asks
"tell me about something you got wrong," and this is the honest answer to it.

## Retiring the old set

`docs/lumen-fde-architecture.md` is superseded by `docs/platform/architecture.md`. Its rendered
siblings (`.html`, `.pdf`, `.svg`, `.css`, and the mindmap PNG) are artifacts of a superseded
source. **Do not delete them in this change** — a PDF may have been shared externally. Mark the
`.md` as superseded with a pointer to the new location, and leave the binaries for a separate
decision.

## Testing

- `scripts/verify-docs.py` exits 0 against the committed docs.
- Deliberately break one number, confirm it exits non-zero and names file, line, claimed, actual.
- Existing suites stay green: `test:market`, `test:surfacing`, `test:insight`.
- Every internal link and file path in the four docs resolves.

## Not doing

- No generated HTML/PDF pipeline. Markdown only; the old set proved rendered artifacts rot.
- No doc for the study curriculum itself — that is `data/`, and the app renders it.
- No API reference for the 10 HTTP routes beyond what `operating.md` needs. They are internal to
  the app and behind a password gate; the MCP surface is the one a human drives.
