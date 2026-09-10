# What is pending

Every item here came from a measured audit or a shipped bug, not from a wishlist. Each says what it
would unlock and roughly what it costs. Nothing is here because it sounds like a good idea.

Last rebuilt: 2026-09-10, after the six-agent context audit (39 findings) and the Codex validation
pass.

---

## Fixed already, listed so the backlog is not mistaken for the whole picture

| | Was |
|---|---|
| Syllabus ordering | outcomes, failure modes, interview questions and proof of work reached the model for **0 of 119 topics**. Now 119 of 119. |
| Plan status | `planMap` shipped the workbook's frozen column 15, so Quaere believed **117 of 119 rows had never been started**, permanently. Now overlaid with live progress. |
| CompReality labelling | column 2 is the **Source**, and it was announced as `verdict`. Quaere was told "verdict fde.academy salary guide". Every column is named now. |
| Answer truncation | 1,600-token cap with `finish_reason` never read, so cut-off answers were served and committed as complete. |
| Parts index | 2,236 subtopic names were invisible whenever no topic was open. |
| Named roles | the 11 requisitions reachable from Pune were counted and never named. |
| Papers | a three-hour capstone retained nothing. |
| Book rule | Quaere would summarise chapters of books whose text is not in the repo. |
| Who is asking | name, location, target role and pace sat in `data/profile.json` and reached no prompt. |
| Recall detail | the whole schedule was fetched and reduced to "something is waiting". Now names topics and rungs, still without a count. |
| Skill demand | 26 of 34 measured skills were dropped by a 10-line fill. All 34 ship, with the reachable share beside the market share. |
| `insight.quaere` | the cron writes a reading **for this companion** and the companion never saw it. |
| Study rhythm | `lib/motivation.ts` had 19,510 bytes of tests and reached no prompt. |
| Prior answers | `reports/asks/` was write-only; Quaere re-answered questions with no record it already had. |
| `context.ts` tests | the module building most of the prompt was the only one in its folder with no test. |

---

## Ship next

Ordered by what a reader would notice.

### 1. `library-sources.json` ships whole and uncapped

15,483 characters, roughly 40% indexing debris, with no key joining it to the plan. It is the
single largest block in the system prompt and the least selective. Trimming it is the cheapest
token win available and it is the last of the six ranked items.

### 2. The bank's marking key per topic

The three-outcome key the on-screen exam reveals never reaches a prompt, so Quaere marks written
answers against its own idea of the topic rather than the plan's.

### 3. Verbatim JD evidence

34 job-description fragments, 5,272 characters, behind the coverage percentages. Quaere has the
shares and none of the prose, so it paraphrases from its own priors what requisitions say.

### 4. `benchmark.newSinceLastRun` and movement

The daily delta the reader gets by email and Quaere cannot discuss.

---

## Decide first, then build

These are product calls, not defects. I am not going to make them unilaterally.

**Recording a mock rep.** The Mocks panel can open, explain and hand a rep to Quaere, but cannot
mark one done. The counts live in `data/workbook.json`, a committed input rather than a store, so a
writer there would put the same number in two places. It belongs with the artifacts and papers
stores. Not built, and the panel deliberately says nothing about it rather than implying a button.

**Exam formats are hardcoded in a client component.** Scope sizes and rubrics live in
`components/Assessments.tsx` and duplicate the workbook's Mocks sheet. One of the two should own it.

**`data/curriculum/*.json` is a 3.61 MB byte-identical duplicate** that nothing reads at runtime.
Two comments in `lib/market/` cite `50.json` as the worked example for 0-based indexing, and that
convention is load-bearing. Verify before removing.

---

## Known unverified

Stated plainly because a claim nobody checked is not a feature.

1. **Nothing behind the password has been clicked by its author.** `/practice`, `/paths`, the focus
   card, the selection capture and the record button were verified through unit tests, rendered
   replicas at real widths, and the deployed stylesheet. Nobody has pressed the buttons.
2. **`POST /api/papers` has never run against real GitHub.** `reports/papers/` does not exist.
   Neither do `reports/artifacts/`, `reports/companion/sessions/` or `reports/review/`. Every store
   the companion reads from is empty, so most of its evidence blocks are exercising their
   "none recorded yet" branch and nothing else.
3. **The two-request live web search** has been measured standalone (23.6s to 38.6s) but the client
   flow has not been exercised end to end.
4. **`vercel env ls` does not list `SURFSENSE_*`**, yet the brief demonstrably wrote from
   production. Unexplained, and it should be explained rather than left as a coincidence.

---

## The four defect classes this repo actually produces

Worth re-reading before adding anything, because all four have recurred.

1. **A duplicate CSS rule silently overriding an earlier one.** `.login-shell` declared three times,
   `.panel-head` four, `.bar-item` twice, `body` twice. Several fixes were written next to the first
   declaration and undone by a later one. `lib/backdrop.test.mts` now reads the stylesheet to guard
   the one case that made a whole feature invisible.
2. **A comment or doc asserting something the code does not do.** A `CRON_SECRET` path that never
   existed; a link card carrying a headline the site had dropped; "this list is now exhaustive" with
   nothing checking it.
3. **A cap or guard so tight that what it protects is unreachable.** The 7,000-character syllabus
   cut made four sections structurally impossible to ship, and every test passed the whole time.
4. **A control that looks like it does something and does not.** "Aim at this one" set state nothing
   read. "Try again" on a failed record returned immediately because the guard was `!== "no"`. A
   second paper reported itself recorded with no request ever made. The Plan's status dropdown died
   permanently on one failed fetch because `"failed"` had no way back. Each looked correct on screen.

   The largest single cause is a stale `useMemo`: `aim` was in the memo body and absent from its
   dependency array, so the provider's context object never recomputed and every visual consumer
   read an old snapshot. tsc, `next build` and fifteen suites cannot see that. `react-hooks/
   exhaustive-deps` can, and this repo had no lint configured at all - no eslint dependency, no
   config, no script. It is wired into CI as an error now, and on its first run it found two more.
