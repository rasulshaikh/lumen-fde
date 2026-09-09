# The companion - a study partner that remembers, notices, and closes the loop

Date: 2026-09-09
Status: approved, ready for implementation

## The problem

Lumen measures the work well and does almost nothing to sustain it. Over 23 months the failure
mode is quiet abandonment, and three things make that more likely than it needs to be:

**Quaere is a reactive box with no memory.** It is summoned with ⌘K, reads the plan, the current
view and the library, answers, and forgets. Every conversation starts cold. A companion that
cannot remember last week is not a companion; it is a search box with good context.

**The home page reports progress, and progress is zero.** Evidence says nothing is recorded, The
Wall says none of the 119 deliverables exist, Standing shows 3 of 21. All true, and all of it
renders as roughly 1,400px of zeros as the first thing seen every morning. Meanwhile the platform
is sitting on 189 core requisitions, 34 skills, 13 audited gaps, 2,236 syllabus parts, 835
interview questions, a live recall schedule and 16 indexed books - none of which depends on
having finished anything.

**Nothing closes.** A study session begins and ends with no record of what happened, so
consistency has to come from memory and willpower rather than from the system.

## The tone decision, recorded because it changes a stated rule

`lib/motivation.ts` rule 2 says: *"IT DOES NOT CONSOLE EITHER. The product never flatters; the
same rule forbids softening. 'Only 5 days' and 'don't worry' are the same defect as 'great work':
both are the module having an opinion about a number it measured."*

Rasul was shown that tension directly - "keep me motivated" against "it never flatters" - and
chose warmth. **Rule 2 is deliberately replaced.** This is a change to the product's character,
made on purpose, and it is written down here so that nobody later "restores" it as a regression.

What replaces it is not "anything goes":

> **Warmth in words, truth in numbers.**
> The companion may encourage. Every number it shows is rendered from a computed value, never
> written by the model. Any model-authored sentence containing a digit is dropped.

This is not a new mechanism. It is exactly how Quaere's market reading already works and is
already tested - the prompt forbids every digit, and `surfacing.test.mts` asserts both halves
("a digit-free paragraph is kept", and a paragraph carrying a digit is dropped). The companion
reuses it.

Two rules from `motivation.ts` are **kept unchanged**, because both still protect against real
harm:

1. **No chain and no broken-streak state.** There is no field that can go to zero and read as a
   loss. A rate that dips and a longest run that only rises. A 40-day chain rendered broken in
   month 12 is a plausible quit trigger, and warmth does not make that safe.
2. **Market numbers are consumed, never recomputed.** A second arithmetic path to readiness is a
   second number to keep in sync, and the two disagree on the day it matters.

And one constraint carries over from the motivation spec and still binds: **it may speak only
about events that actually happened.** Encouraging someone through a five-day gap is fine.
Congratulating them on work they did not do is the failure that teaches them to stop reading it.

## 1. Profile - `data/profile.json`

One file holding everything user-specific that is currently either hard-coded or absent: name,
location, the target role, the horizon, the weekly-hours target, and the repo. The routed-pages
spec already called for this file and it was never created; the reachability logic and the
companion both want it, and today the location is embedded in market code.

Static, bundled, no secrets. Not a step toward multi-user - it is one place instead of five.

## 2. Memory - `reports/companion/`

Append-only files in the repo, the same discipline as `reports/progress` and `reports/artifacts`.
GitHub is the database here and this changes nothing about that.

**Scope: study facts only.** Decided explicitly. What is remembered:

- topics struggled with
- questions asked more than once
- what has already been explained, so it stops repeating itself
- tracks not yet touched
- session goals and outcomes

What is **not** stored: full conversation transcripts. They would put every question ever asked
into git history and grow the repo without bound, for a marginal gain over the digest.

- `reports/companion/sessions/YYYY-MM-DD-HHMM.md` - one per closed session. Append-only.
- `reports/companion/memory.json` - a bounded rolling digest, oldest entries aged out at a fixed
  cap so it cannot grow without limit. Read whole, written whole, like every other artifact.

`/api/ask` reads the digest so conversations stop starting cold.

## 3. The daily brief - the home page

`/overview` leads with a brief the companion composes, and the metric panels move below it.

Deterministic, computed, never model-written:

| line | source |
|---|---|
| where you are | `statuses` + workbook |
| the next thing, and its specific subtopics | `nextRow` + `curriculum.json` |
| recall due today | `lib/review.ts` - `isDue`, `eligible`, `DAILY_CAP` |
| what finishing it buys | `insight.readiness.marginal` - already computed, consumed not recomputed |
| when you last sat down, and the gap | `reports/progress` + session files |
| what you have shipped | `reports/artifacts` |

Plus **one warm paragraph**, model-written, digit-free, dropped if it carries a digit.

**This is the answer to the blank panels.** The brief always has content, because the plan, the
curriculum, the review schedule and the market always do - none of them requires having finished
anything. The zeros stop being the first thing on the page without any number being hidden.

## 4. The session loop

**Start.** Pick the row (defaulted to the next one), write an intention, clock starts. Held
client-side until the session closes; an abandoned session writes nothing.

**End.** It asks what you learned, then **proposes** what it thinks should be recorded - the row,
the parts covered, the status change - and waits. Nothing is written until it is confirmed.

That confirm step is not politeness. A progress marker in this repo was silently overwritten
once already: a browser session wrote `not_started` over `in_progress`, and the fix was to append
a corrective event rather than edit history. A loop that writes progress automatically at the end
of every session - including sessions that were abandoned, or where the tab was left open - is
the same class of hazard pointed at the same file. The user chose propose-then-confirm.

On confirm: one progress event, optionally one artifact, one session file. All append-only.
New route: `POST /api/session`.

The existing hydration write-guard applies unchanged - no write may be issued before `statuses`
has settled, because that guard is what stopped the last data loss.

## 5. The dock speaks first

On the other nine views the dock stays, but opens with its read of your state - the gap, what is
due, what moved - instead of an empty box. Same digit rule. Same three actions beneath it.

## Not doing

- **No push or browser notifications.** The daily digest email exists, already carries alerts,
  and is the correct channel for reaching outside the app.
- **No new metric.** Everything above is computed from data that already exists.
- **No transcript storage.** Decided above.
- **No streak chain.** Kept from the motivation spec, and warmth does not change it.

## Testing

- Companion computations are pure with `now` as a parameter - no `Date.now()`, no network, no
  filesystem - matching `lib/motivation.ts` and `lib/market/insight.ts`, so every sentence can be
  exercised against a fixture.
- **The digit guard**: a generated paragraph containing a digit is dropped. Assert both
  directions, the way `surfacing.test.mts` already does for the market reading.
- **The brief with zero progress.** This is the case that matters - it is today's state, and it is
  the one the current page handles badly.
- **The brief with progress**, so the empty-state branch is not the only one exercised.
- **The session loop**: start→confirm writes exactly one progress event and one session file;
  cancel writes nothing; an abandoned session writes nothing; append-only is enforced by sending
  no `sha`, as `lib/artifacts.ts` already does.
- **The write-guard survives**: load any page, touch nothing, zero POSTs. This regressed once and
  cost real data.
- Existing five suites stay green; `verify-docs.py` stays at zero drift.

## Sequencing

1. **Profile + memory store** - foundation, nothing visible.
2. **The daily brief** - the biggest visible win, and what removes the empty panels.
3. **The dock speaks first** - small, reuses the brief's computation.
4. **The session loop** - largest; new route, new UI, new store.
