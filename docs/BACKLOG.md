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
| Library blocks | `library-context.json` and `library-sources.json` were both `JSON.stringify`d into the system message: 20,375 chars, the largest thing in it, shipping the same 16 books twice plus `filename`, `relativeFolder`, `(Z-Library)`/`(PDFDrive)` tags and a `(for <name>)` watermark. Merged to one block, 21.0% smaller, none of that provenance surviving. |
| Practice topic | /practice sent **no topic at all**, so `syllabusContext` never fired there and a question asked mid-paper was answered from the model's own idea of the subject. The runner now pins the current question's topic. |
| New roles | `benchmark.newSinceLastRun` reached the reader's inbox every morning and reached no prompt, so a learner who read the digest and asked about those roles was talking to something that had never seen them. Now shipped, with the scan's own date leading it so a stale file cannot read as "today". |
| JD evidence | the 34 `evidence` fragments (3,813 chars of audited posting wording) sat behind the coverage percentages and reached no prompt, so asked what a requisition says Quaere paraphrased from its priors. Now attached to the skill line each one explains, with the file's silence about the employer stated rather than papered over. |

---

## Ship next

Nothing. All six ranked items are shipped or retired, and the two that were retired are recorded
below with the reason rather than deleted. Adding to this list again should require a measurement,
the way every item above got here.

---

## Considered and declined, with the reason

**Movement into the prompt.** The other half of the `newSinceLastRun` item, left alone on purpose.
`insight.velocity.statement` already reaches this prompt carrying a near-identical "no skill moved"
sentence, and `components/Market.tsx:232` already renders movement on screen. A second block saying
the same thing would teach the model to hedge between two sources that never disagree. Revisit only
if velocity stops shipping.

**Per-fragment JD attribution.** The evidence fragments ship, but without naming an employer. There
is no company field on those entries; the three research docs behind them cover three different
corpora, so the corpus size cannot be stated as one number; and for several fragments the source
cannot be recovered from the prose at all. So the block states that the file records the wording and
not the poster, and forbids attributing one to a named employer. Zero of the 34 fragments name a
company, which is what makes that rule enforceable rather than aspirational - and there is a test
pinning that, because the day one of them does, the rule quietly becomes a lie.

---

## Removed from this list, because the item was wrong

**"The bank's marking key per topic."** It said the exam's three-outcome key never reaches a prompt
"so Quaere marks written answers against its own idea of the topic rather than the plan's". Quaere
marks nothing. `components/TestRunner.tsx:17-21` refuses automatic marking in writing and gives the
reason: "nothing available here can mark that honestly, and a score that looks objective while being
a keyword match is worse than no score." The item described a feature that was deliberately declined,
and building it would have reversed a documented decision on the strength of a backlog line.

What was real underneath it: /practice sent no topic at all, so nothing about the subject reached
Quaere from that page. Fixed above, without touching the grading decision.

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

## The five defect classes this repo actually produces

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

   Building twenty machines in one batch produced eight more instances of this class in a single
   shape: a fault toggle that changes nothing, because something upstream in the same machine
   already stopped the request. `lib/machines.test.mts` catches it structurally - every fault is
   checked against every subset of the others - and the fix is never to suppress it quietly. A
   setting that cannot matter because an earlier one already refused is itself the lesson, so the
   machine names it: "the SCP would also refuse, and is not consulted."

   The largest single cause is a stale `useMemo`: `aim` was in the memo body and absent from its
   dependency array, so the provider's context object never recomputed and every visual consumer
   read an old snapshot. tsc, `next build` and fifteen suites cannot see that. `react-hooks/
   exhaustive-deps` can, and this repo had no lint configured at all - no eslint dependency, no
   config, no script. It is wired into CI as an error now, and on its first run it found two more.
5. **A value derived from a field that was never specified to have that shape.** The machine picker
   built its label as `title.split(":")[0].split(",")[0]`, which was correct for the three titles
   that existed when it was written. At twenty-three it rendered "Driver", "Replay" and "Five
   steps" - labels that identify nothing and cannot be told apart - because the new titles are
   punctuated differently. Nothing failed; the heuristic simply stopped meaning anything. Machines
   now declare a `short` label and the suite asserts it is unique and fits on a line.

   The same batch produced the sibling of this: a layout sized for the number of items that existed
   when it was written. The picker was a grid of 64px cards, which at twenty-three items put 1,656
   pixels of buttons above the content on a phone. Neither of these is visible from a test, a build
   or a type - both were found by rendering the real markup against the real stylesheet and looking
   at it, which is the only method that works for this class.
