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

---

## Ship next

Ordered by what a reader would notice.

### 1. The review schedule is read over the network and then thrown away

`recallContext` reduces the whole of `reports/review/state.json` to one of three sentences. Every
rung, grade and topic in the ladder is fetched and discarded. Quaere cannot say *what* is due, only
that something is.

**Constraint that must survive:** the backlog **count** stays out of the prompt. Named topics and
their rungs are fine; an integer is not, and `lib/review.ts` records why.

### 2. Twenty-six of thirty-four measured skills never reach the prompt

The coverage fill ships 10 lines and drops the rest, including RAG, MCP, Kubernetes and guardrails.
`insight.reachability.skills` — the reachable-market share of all 34, which is the number the whole
market model exists to produce — is absent entirely.

### 3. `insight.quaere` is a stored reading written for the companion, and the companion never sees it

The nightly cron writes an 80-word interpretation of the scan specifically for Quaere. The tab
renders it. The prompt does not include it.

### 4. The streak and pace layer

`lib/motivation.ts` carries 19,510 bytes of tests and reaches no prompt. Two files claim `/api/ask`
consumes it. Neither is true.

### 5. Quaere's own saved answers are write-only

Twenty-one answers in `reports/asks/`. It re-answers the same question with no memory that it
already has, and no way to say "as I said on the 3rd".

### 6. `library-sources.json` ships whole and uncapped

15,483 characters, roughly 40% indexing debris, with no key joining it to the plan. It is the
single largest block in the system prompt and the least selective.

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

## The three defect classes this repo actually produces

Worth re-reading before adding anything, because all three have recurred.

1. **A duplicate CSS rule silently overriding an earlier one.** `.login-shell` declared three times,
   `.panel-head` four, `.bar-item` twice, `body` twice. Several fixes were written next to the first
   declaration and undone by a later one. `lib/backdrop.test.mts` now reads the stylesheet to guard
   the one case that made a whole feature invisible.
2. **A comment or doc asserting something the code does not do.** A `CRON_SECRET` path that never
   existed; a link card carrying a headline the site had dropped; "this list is now exhaustive" with
   nothing checking it.
3. **A cap or guard so tight that what it protects is unreachable.** The 7,000-character syllabus
   cut made four sections structurally impossible to ship, and every test passed the whole time.
