# Lumen FDE — operating manual

How to use the thing while studying. Rasul at the desk, Claude Code beside him.

This is a lens, not the fact file. Every mechanism here is explained in
[architecture.md](architecture.md) and cited by section number rather than re-explained; where a
number appears it carries a `verify:` anchor that `scripts/verify-docs.py` checks against the
source data. When something is broken rather than merely confusing, go to
[runbook.md](runbook.md). The reasoning behind the designs is in [talk-track.md](talk-track.md).

Three surfaces, and they are not interchangeable:

| surface | reach for it when |
|---|---|
| the dashboard, 10 tabs <!-- verify:tabs=10 --> | you are reading, filtering, marking status, or looking at the market |
| the MCP, 18 tools <!-- verify:mcp_tools=18 --> | Claude Code needs the plan in its context, or needs to write something durable |
| the 2 crons <!-- verify:crons=2 --> | they reach for you — 03:00 and 03:30 UTC, unattended |

One number to hold before anything else: the plan is 119 rows <!-- verify:rows=119 -->, 117 of
them active <!-- verify:active_rows=117 --> and 2 skipped <!-- verify:skipped_rows=2 -->, over
23 months <!-- verify:months=23 --> and 1,588 hours <!-- verify:hours=1588 -->.

---

## 1. The 18 MCP tools

`mcp/server.js`, served from Render so Claude Code can reach the same plan the dashboard reads.
Transport, auth, rate limit and the Render deploy filter are architecture.md §3.6.

Two things are true of every tool and are easier to state once:

- **Row numbering. Nothing needs converting by hand any more.** Every tool takes and returns
  `row`, the **1-based** plan row the Market tab, the benchmark and the weekly email all cite:
  `get_plan` accepts `row` and returns it, `get_syllabus` prefers `row` over the older `index`,
  and the four market tools return `row` and `syllabus_index` together. The 0-based number still
  exists because `data/curriculum.json` is keyed by it — it is always `row - 1`, and the banner at
  the top of `mcp/server.js` explains why both are carried rather than one. (architecture.md §4.1.)
- **Freshness.** Everything read from `data/*.json` is the copy baked into the Render deploy;
  everything read from `reports/` is fetched live from GitHub. So plan and syllabus answers are as
  fresh as the last Render deploy, and progress answers as fresh as the repo. **The market tools
  are the exception:** each report is held per process for `MARKET_TTL_MS` (`mcp/server.js`), so a
  market answer can trail the repo by that window. The scan runs daily, so this is invisible in
  normal use and shows only if you re-ask straight after running a scan by hand.

| tool | reach for it when |
|---|---|
| `get_plan` | you need a row's month, hours, depth target, deliverable or resource links |
| `get_learning_context` | you want a book or repo picked for the topic you are on |
| `get_syllabus` | you are starting a topic and want the 12–20 parts, failure modes and proof of work |
| `ask_lumen` | you want something explained in prose, grounded in the plan — not a market figure |
| `list_ask_reports` | you want to find an Ask you saved earlier |
| `read_ask_report` | you have the path and want the answer back |
| `save_study_note` | you asked, explicitly, for a note to outlive the session |
| `record_progress` | you actually finished a topic and want it to count toward readiness |
| `get_progress_history` | you want to confirm an event landed in the repo |
| `get_progress_analytics` | you want what is actually done — per-topic status, hours cleared against the active plan hours, and which events matched no row |
| `score_assessment` | you have finished a weekly, monthly or quarterly and want it graded |
| `semantic_search` | you need the open web, or you need to find something in this repo remotely |
| `get_audit_log` | a tool call just failed and you want the reason it recorded |
| `get_connection_map` | you do not know which server or which search backend you are talking to |
| `get_market_priorities` | you want to know what to study next, ranked by the readiness the market says each row buys |
| `get_market_reach` | you want the requisitions takeable without leaving India, and the named companies behind them |
| `get_market_skill` | you want to know whether the market asks for what one plan row teaches |
| `get_market_plan_risk` | you want the planned hours the market is not paying for, and what it asks for that the plan never teaches |

### `get_plan`

**Answers:** what does the plan say about these rows — track, month, topic, depth target, hours,
deliverable, status, and the Read/Watch/Do label-and-URL pairs.

**Inputs:** `row` (one 1-based plan row), `query` (case-insensitive substring of the topic),
`month` (exact number), `track` (case-insensitive substring), `limit`. All optional and ANDed.

**It returns 30 rows, not the whole plan.** `limit` defaults to 30 and caps at the full 119
<!-- verify:rows=119 -->; the unfiltered plan is roughly 131 KB, which the handler prices at some
33k tokens of a caller's context for "show me the plan". Truncation is stated, not silent — every
response carries `total` and `returned`, so `returned < total` is your cue to filter or raise
`limit`. Each row carries both `row` and `index` (`row - 1`), so nothing has to be converted.

**Reach for it when** you need row metadata, or the exact topic string to hand to
`record_progress`. It is the cheapest tool here — no network at all, just the bundled workbook.

**Do not reach for it to check your own progress.** The `status` field is workbook column 15, the
committed baseline, which holds only `Not started` and `Skipped` and is never written by the app
(architecture.md §4.1, §5.4). It will say `Not started` about a topic you finished last month.
`get_progress_analytics` is the tool that knows.

### `get_learning_context`

**Answers:** what is in the indexed study library.

**Inputs:** none.

**Reach for it when** you want Claude Code to connect the current topic to something you already
own. It returns `data/library-context.json`, `data/repository-context.json` and
`data/lesson-context.json` whole — 16 books, 10,521 pages, 2 repositories (architecture.md §3.2).

**It will not search inside a book.** The PDFs are not in this repo. You get title, author, page
count, role and topic tags, which is enough to choose, not enough to quote. `lesson-context.json`
is one hardcoded lesson, not one per topic — the per-topic material is `get_syllabus`.

### `get_syllabus`

**Answers:** everything to learn for one plan topic — why an FDE needs it, prerequisites, the
parts with one public resource each, outcomes, production failure modes, senior-level interview
questions, and the proof-of-work artifact. 2,236 subtopics <!-- verify:subtopics=2236 --> across
119 source files <!-- verify:curriculum_files=119 -->.

**Inputs:** `row` (1-based plan row, and the one to use — it is the number every market statement
and the Market tab cite), `index` (the older 0-based key, `row - 1`), or `query` (substring of
topic or track). No arguments lists every topic with its row, index, month, hours and part count.

Precedence is `row`, then `index`, then `query`, and only the first one present is read. Beyond
that: a `query` matching exactly one topic returns that full syllabus; a `query` matching several
returns the short list, so you can pick a row from it.

**Reach for it when** you open a topic for real — this is the day's material. Reach for
`get_plan` instead when you only want the row's hours or links, and for `ask_lumen` when you want
something explained rather than listed.

**It serves `data/curriculum.json`, which is built output.** Fixing something you see here means
editing `data/curriculum/NN.json` and rerunning `scripts/build-curriculum.py` (architecture.md
§4.2). Editing the bundle is the bug that already reverted 117 topics once.

### `ask_lumen`

**Answers:** an open question about the plan, in plain language, with the whole plan and a capped
digest of the measured market in context.

**Inputs:** `prompt` (required), `context` (optional free text — the active topic, what you just
tried, what confused you).

**Reach for it when** the question is "why" or "how does this connect" — prose, not figures.
Reach for `get_syllabus` instead when you want the topic's own material, which is deterministic
and free.

**It is not the tool for a market number.** It is handed a capped digest of the scan, not the
reports, so a number it was not given is a number it cannot have; the system prompt forbids it to
compute, rescale or round one (architecture.md §2, §5.6), which is protection against invention
and not a substitute for measurement. Its own description routes market questions to
`get_market_priorities`, `get_market_reach`, `get_market_skill` and `get_market_plan_risk`, which
return the stored sentences unchanged. Ask it *why* a market finding holds; ask them *what* it is.

**Two paths, and you can tell them apart by the result.** Proxied through `/api/ask`, the answer
is saved to `reports/asks/` and `list_ask_reports` will find it. Called directly against MiniMax
from Render — which is what happens without `LUMEN_ASK_URL` and `LUMEN_INTERNAL_API_KEY` — the
answer comes back and nothing is saved (architecture.md §8).

### `list_ask_reports`

**Answers:** which Ask answers are saved in `reports/asks/`.

**Inputs:** `limit` (default 20, capped at 50).

**Reach for it when** you half-remember an answer and want its path for `read_ask_report`.

**It does not sort.** GitHub returns directory entries in name order and the filenames start with
an ISO stamp, so this returns the **oldest** `limit` reports, not the newest. That is the opposite
of `get_progress_history`, which sorts descending. With more than 20 saved, raise `limit` to 50 or
browse `reports/asks/` on GitHub.

### `read_ask_report`

**Answers:** what did that saved Ask actually say.

**Inputs:** `path` (required), which must start with `reports/asks/` — any other path is refused
before the request is made.

**Reach for it when** `list_ask_reports` gave you the path. It returns the markdown as text.

### `save_study_note`

**Answers:** nothing — it writes. A markdown note to `reports/notes/<ISO stamp>-<slug>.md`, plus a
durable audit record.

**Inputs:** `title` and `body`, both required.

**Reach for it when** you explicitly want something to outlive the session: a decision, a
gotcha, a design you argued yourself into. Its own description tells the model to use it only on
an explicit request, and that is the right rule — an assistant that saves notes on its own
initiative fills `reports/notes/` with restatements of the conversation.

**Nothing reads it back.** No MCP tool lists or fetches notes (architecture.md §4.6). The note is
for you, on GitHub. If you want it retrievable from a tool, `save_study_note` is the wrong tool
and there is not a right one yet.

### `record_progress`

**Answers:** nothing — it writes one append-only event to
`reports/progress/<ISO stamp>-<topic>-<status>.md`, plus a durable audit record.

**Inputs:** `topic` (required), `status` (required: `not_started` / `in_progress` / `done` /
`skipped`), `notes` (optional).

**Reach for it when** you finished a topic away from the browser. It is the same file shape the
Plan tab's status dropdown writes, so the two are interchangeable.

**Two rules decide whether it counts for anything:**

1. **The topic string must match a plan row exactly** after trimming and lowercasing. Both the
   dashboard's merge and the insight pass match on that string and nothing else; an event that
   matches no row is saved but counts toward nothing (architecture.md §5.4). Copy the topic out of
   `get_plan` rather than typing it. **This tool says so out loud** — the response carries
   `matchedPlanRow`, and on a miss a `warning` and a `didYouMean` list of near topics, so re-record
   with the verbatim string. It is the Plan tab's dropdown that fails silently here, not this.
2. **Only `done` moves readiness.** `in_progress` is not evidence and `skipped` is a decision not
   to acquire the skill. The insight pass accepts `done`, `complete`, `completed` or `finished`
   and nothing else.

### `get_progress_history`

**Answers:** which progress events exist, newest first.

**Inputs:** `limit` (default 30, capped at 100).

**Reach for it when** you want to confirm an event landed — right after `record_progress`, or
after marking a row on the Plan tab, whose sync is fire-and-forget and cannot report a failure.

**It returns filenames, paths and URLs, not contents.** The status is in the filename; the notes
are not. Open the URL for those. A missing `reports/progress` directory returns `[]`, because a
history that has not started is genuinely empty rather than unknown.

### `get_progress_analytics`

**Answers:** what is actually done — how many topics stand at each status, the hours those done
topics clear against the active plan hours <!-- verify:hours=1588 --> with a completion
percentage, the rows done, the newest ten events, and any event whose topic matched no plan row.

**Inputs:** none.

**Reach for it when** you want the honest answer to "how far in am I", and every time before
`get_plan`'s `status` tempts you (see above). It is the only tool that reads progress as progress.

**It counts topics, not events, and it reads filenames only.** The status, topic and date are
parsed out of each progress filename, so a hundred events cost one directory listing rather than a
hundred fetches; the notes inside the files are not read. Per topic the newest event wins, exactly
as the readiness pass does it, so taking one topic from `in_progress` to `done` is one topic and
not two. Every event is considered — there is no window — until GitHub's 1,000-file directory
maximum, which the response says out loud in its `note` when it is reached.

**Its percentage is not the Market tab's readiness, and they will disagree.** This one is hours:
the plan's own hours of the done rows over the active plan hours. Readiness weights each skill by
how often the market asks for it (architecture.md §5.4), so clearing a heavy row the market rarely
mentions moves this number a lot and that one barely at all. Both are correct; they answer
different questions.

### `score_assessment`

**Answers:** what does this assessment score, and what should be done about it.

**Inputs:** `assessment` and `answers`, one 0–4 rating per rubric criterion:

- `weekly` and `monthly` — four ratings, weighted 40 / 25 / 20 / 15.
- `quarterly` — five ratings, weighted 20 / 25 / 25 / 15 / 15.

Ratings are clamped into 0–4, so a stray 7 scores as 4 rather than erroring. Too *few* ratings
does error, because the missing criterion would otherwise be graded as a zero you never gave.

**`quick_check` is retired and always throws.** The enum still lists it, so the value is offerable
and the error is the only thing that tells you — the four-question quiz it graded was replaced by
the recall strip, and grading against a key whose questions no longer exist is an invented score.
The handler in `mcp/server.js` says the same in its refusal message. Use `weekly`, `monthly` or
`quarterly`, or ask for a recall prompt.

**Reach for it when** you have finished the work the Assessments tab describes. Weekly and monthly
use identical weights — the difference is the rubric you hold yourself to, not the arithmetic.

**Nothing is stored.** The score comes back and vanishes. If it is worth keeping, follow it with
`save_study_note`.

### `semantic_search`

**Answers:** what does the web say, or where does this appear in this repo.

**Inputs:** `query` (required), `provider` (`surfsense` or `github`), `limit`, `country_code`.

Without `provider`, it picks SurfSense when `SURFSENSE_API_KEY` is configured and GitHub code
search otherwise. Passing `provider: "surfsense"` explicitly turns off the fallback: a SurfSense
failure then errors instead of quietly becoming a repo search, which is what you want when you
asked for the web specifically.

**Reach for it when** Claude Code is not in a checkout of this repo. If you are in the checkout,
grep is faster and complete — the GitHub path is a code search scoped to `repo:` this repository,
capped at 10 results, and inherits GitHub's indexing lag.

### `get_audit_log`

**Answers:** what did this MCP process just do, and did it work.

**Inputs:** `limit` (default 50, capped at 100) and `durable` (boolean, default true — pass
`false` to skip the GitHub read and answer from memory alone).

**Reach for it when** a tool call failed and the error you saw was terse. Entries carry the
action, ok/failed, up to 180 characters of detail, and a timestamp.

**Two lists, and only one of them survives.** `inProcess` is memory on this one Render process,
last 500 events: a restart empties it, and the free tier sleeps after inactivity, so an empty
`inProcess` usually means the server restarted rather than that nothing happened. `durable` is
`reports/audit/*.json` on GitHub, which only the two repo-writing tools append to —
`save_study_note` and `record_progress` (architecture.md §3.6). So a read that failed before the
sleep is gone; a write is not.

### `get_connection_map`

**Answers:** which dashboard, repo and MCP URL this server believes it is part of, where durable
writes go, whether SurfSense is live, and the free-tier sleep caveat.

**Inputs:** none.

**Reach for it first** when something is behaving strangely — it is the cheapest call that
distinguishes "wrong server" from "wrong data", and it is also the fastest way to wake a sleeping
Render instance before a call you care about.

### The four market tools, and what they share

`get_market_priorities`, `get_market_reach`, `get_market_skill` and `get_market_plan_risk` read
the two reports the 03:00 scan writes and the Market tab renders, and they hand back each entry's
stored `statement` verbatim rather than rephrasing the numbers in it — which is why the MCP, the
tab and the Monday email say one sentence and not three. Every response opens with a `scan` header
carrying the scan day and board coverage, so a number cannot be quoted next week as though it were
today's, and every plan row arrives as `row` with `syllabus_index` beside it.

**They do not need the same report, so they do not fail together.** `get_market_priorities` and
`get_market_reach` need `insight.json`; `get_market_skill` and `get_market_plan_risk` need
`benchmark.json` and merely degrade without the insight — the reachable share and the readiness
gain come back `null` while the coverage and the gaps are intact. When the report a tool needs is
missing, it returns `{market: "unavailable", reason}` and does not throw: "no gaps found" and "the
scan did not load" are opposite answers, and an omitted block reads as the first.

#### `get_market_priorities`

**Answers:** which incomplete plan rows buy the most readiness, ranked by how often the market
asks for the skills each one clears; where readiness stands today; and the five market segments
ranked by fit.

**Inputs:** `limit` (default 8, schema maximum 27), `max_month` (1–23
<!-- verify:months=23 -->, rows scheduled that month or earlier), `track` (case-insensitive
substring), `include_segments` (default true; only an explicit `false` drops the segment lines).

**The default shows eight of them.** Filters are applied first and `limit` last, and the response
carries `total` and `returned` — raise `limit` toward `total` for the whole ranked list.

**Reach for it when** the question is "what next". It reads the same ranked table the Market tab's
Decide zone renders, so Claude Code and the tab cannot name different rows.

#### `get_market_reach`

**Answers:** how much of the measured market is takeable without leaving India, at which named
companies, and whether that slice asks for something different from the market at large — the tier
distribution, the named roles with their URLs, and the per-skill whole-market versus reachable
share.

**Inputs:** `tier` (one of `india-remote`, `emea-apac-remote`, `india-office`,
`relocate-sponsor`, `out-of-reach`) and `skills_limit` (default 10, maximum the full mapped-skill
count <!-- verify:skills=34 -->, `0` to omit the skills entirely).

**Omitting `tier` is not "every tier".** It is the slice that needs no move — `india-remote`,
`india-office` and `emea-apac-remote` together. And named roles are stored only for those, so
asking for `relocate-sponsor` or `out-of-reach` returns an empty `roles` plus a `rolesNote` saying
why; the tier counts above it still cover every core requisition.

**Read `derivedCount` before you believe the reach.** Requisitions tiered from the location string
alone never had their body read, and the body pass only ever moves a requisition *out* of reach.
So the reachable figure is an upper bound, and the response says so in `derivedCaveat`.

#### `get_market_skill`

**Answers:** does the market ask for what a plan row teaches, and what does finishing it buy —
whole-market share, the plan rows that teach the skill, the quoted JD evidence, its share of the
reachable slice, and the readiness gain if its row is unfinished.

**Inputs:** `skill` (a skill id such as `python`, or a case-insensitive substring of its label) or
`row` (1-based plan row). `row` is read first if both are passed. No arguments returns the compact
index of every mapped skill <!-- verify:skills=34 --> — id, label, market share, reachable share,
primary row — which is the routing table for the other three.

**A miss is an answer here, not an error.** A `skill` matching nothing returns a message pointing
back at the index. A `row` no mapped skill lists returns a note saying the market does not
measurably ask for what that row teaches — which is `get_market_plan_risk`'s finding, at one row
instead of a whole track.

**Reach for it when** you are about to spend a month on a row and want to know what it buys.

#### `get_market_plan_risk`

**Answers:** which of the 1,588 active plan hours <!-- verify:hours=1588 --> the market is not
paying for, and what it asks for that the plan never teaches — the audited gaps with their nearest
plan row, and the over-invested tracks with their measured JD frequency and combined hour cost.
The answer to "should I cut something".

**Inputs:** `kind` (`gaps`, `over_invested` or `both`, default `both`) and `limit` (default and
schema maximum both the audited gap count <!-- verify:gaps=13 -->).

**`kind` decides which half of the answer you get**, and the two halves point opposite ways:
`gaps` is what the market asks for and the plan does not teach, `over_invested` is what the plan
teaches and the market rarely asks for. Ask "what should I drop" with `kind: "gaps"` and you get
the case for adding.

---

## 2. The 10 tabs

`components/Nav.tsx`, the `NAV` constant, in order. Each is its own route under `app/(app)/`, sharing one layout; the recall strip
sits above the tab bar, so it is on every one of them (architecture.md §3.2).

**Overview** — the four metrics (plan progress, hours remaining, weekly commitment, mocks),
hours per month as bars, the next action, per-track coverage, and the compensation tiers ranked
off the CompReality sheet. The weekly-commitment field is editable, clamped to 1–80, and persisted
in `localStorage` under `lumen-weekly-hours`; the weeks and months beside it recompute from it.
*It will not tell you* anything about the market or your readiness against it — that is the
Market tab, and the two use different definitions of "done".

**Plan** — all 119 rows <!-- verify:rows=119 --> with search, track, month and progress filters;
the status dropdown; the Ask button per row; and the row expander that loads that topic's
syllabus inline.
*It will not tell you whether your status write reached GitHub.* The `POST /api/progress` behind
the dropdown is fire-and-forget: a failed sync looks identical to a successful one. Confirm with
`get_progress_history` when it matters.

**Curriculum** — every topic grouped by track, expandable one topic or one whole track at a time,
2,236 subtopics <!-- verify:subtopics=2236 --> in total. It fetches a summary first and one
syllabus per opened topic, so it never ships the 3.7 MB bundle.
*It will not let you edit anything*, and what it renders is built output. Corrections go to
`data/curriculum/NN.json` followed by `scripts/build-curriculum.py` (architecture.md §4.2).

**Sandbox** — section 4 below.

**Mocks** — the Mocks sheet as completed-against-target bars.
*It will not record a rep.* Those counts are workbook cells; a finished mock is an edit to
`data/workbook.json`, not a click.

**Roadmaps** — the Roadmaps sheet as a grid of external links.
*It will not tell you whether a link still resolves.* Nothing checks these on load.

**Library** — the 16 indexed books with author, page count, role and topics, the 2 build
references, and a Quaere button per book that opens Ask pre-filled for that title.
*It will not show you a book's contents.* Only the metadata is indexed; the PDFs stay private.

**Assessments** — the weekly, monthly and quarterly protocols with their instructions and rubric
weights, as three static cards.
*It will not score anything.* Scoring is `score_assessment` or Quaere; this tab is the
instructions and the honest-grading rule.

**Comp reality** — the CompReality sheet: market, verdict, reasoning, and a probability phrase per
row.
*It is context, not a forecast*, and it is a committed sheet — nothing refreshes it.

**Market** — three zones in fixed order (Decide, then Reach, then Market) plus Quaere's reading
last and labelled as interpretation. Fetched from `/api/market` on mount, so once per visit to the
tab. Plan rows cited here are 1-based and clicking one clears the Plan tab's filters and expands
that row.
*It will not tell you anything fresher than the last completed scan cycle*, and it says so: the
header prints `Computed <timestamp> UTC · N of M boards`. No model runs on this path at request
time. Every figure on the tab is read from two files rather than computed here — core requisitions
and companies from `reports/market/benchmark.json` (`coreCount`, `companyCount`), the reachable
count and readiness from `reports/market/insight.json` (`reachability.inIndiaCount`,
`readiness.pct`) — and each file carries the `computedAt` and `day` of the scan that wrote it. Read
them there rather than from here; the 03:00 scan rewrites them, so any figure quoted in this
document is a figure that stopped being true (architecture.md §5.7).

**The recall strip**, above all ten: at most five cards a day, most-overdue first, from a bank of
1,710 prompts <!-- verify:prompts=1710 --> on a 7-rung ladder <!-- verify:ladder_rungs=7 -->.
You write before you can reveal; you grade Fluent / Halting / Gone. Only topics marked
`In progress` or `Done` enter the schedule, so the strip is empty until you mark a first row.
*It will never show you a backlog count* — that is deliberate, and architecture.md §7 says why.

---

## 3. The 2 crons

`vercel.json`. Both are `GET`, both authenticate on `Authorization: Bearer ${CRON_SECRET}`, and
neither is behind the password gate, but neither is exempt either: `proxy.ts` GATES `/api/cron/`
on `CRON_SECRET` before the password check runs, so an unauthenticated call gets 401
(architecture.md §3.1). To run either by hand, call it with that header.

### `/api/cron/market-scan` — 03:00 UTC (08:30 IST)

**What runs:** the 27 enabled boards <!-- verify:enabled_boards=27 --> are fetched, titles are
classified, Greenhouse job descriptions are reduced to skills and a reachability tier and then
discarded, and — only if the cursor wrapped, meaning every board was visited — the benchmark, the
trend point and the insight are recomputed. Full pipeline: architecture.md §5.

**What lands**, in this order and never concurrently: `reports/market/index.json`, then
`benchmark.json`, `trend.json`, `history/<day>.json`, then `insight.json`. On Mondays only, the
weekly benchmark email goes out afterwards, from the same cron because Hobby allows two.

**How to tell it ran:**

- The Market tab header — `Computed … UTC · N of M boards`. That timestamp is the scan's, not the
  page's.
- The commits on `main` touching `reports/market/`. Five files on a complete cycle, one
  (`index.json`) on a partial one.
- The response body, if you called it by hand:
  `{ok, day, partial, cursor, coldStart, scanned, boards, boardsOk, reqs, …}`. On a complete cycle
  it also carries `core`, `companies`, `newRoles`, `missing`, `deleted`, `evicted`, `insight`,
  `reading`, and on Mondays `emailed` and `emailFraming`.

**`partial: true` is a normal morning, not a failure.** It means the deadline hit before every
board was visited; `cursor` is where tomorrow resumes, the unreached boards keep yesterday's data,
and no benchmark was recomputed. `insight: true` with `reading: false` means the scan worked and
the model paragraph was dropped — including by the digit check, which discards any paragraph
containing a number (architecture.md §5.6).

### `/api/cron/daily-digest` — 03:30 UTC (09:00 IST)

**What runs:** the digest is assembled from `data/workbook.json`, `data/recall-bank.json` and
`data/library-context.json` with no model involved — the next topic, its depth target and
deliverable, one recall question rotated by day-of-year, a matching book, and pace. The model adds
at most one framing line. New core requisitions are recomputed from `reports/market/index.json`
under an 8-second budget, and every failure there renders as nothing at all.

**What lands:** an email, via Resend, to `DIGEST_TO_EMAIL`. **Nothing is written to the repo** —
this cron is read-only against GitHub.

**How to tell it ran:** the email arrives; or the response body,
`{ok: true, sentTo, topic, framing, newCoreReqs, chars}`. `framing: false` means the model
returned nothing and the deterministic digest was sent alone, which is the designed degrade and
not worth chasing.

**The one that will confuse you: the email repeats a topic until you record progress against it.**
It reads your progress events first and falls back to workbook column 15 per row — the same
matcher the dashboard and readiness use, so all three agree on which row is next
(`app/api/cron/daily-digest/route.ts`, the `digest` function). A topic marked `in_progress` wins
over plan order, because plan order outranking recorded evidence is what used to send row 0 to a
reader who had already started row 5. What it will not do is rotate: nothing recorded means
nothing moved, so the same brief arrives tomorrow — and the email says so, either as "no progress
has ever been recorded on this topic" or as a day count once something has. Recording is the only
thing that advances it. An unreadable progress store costs freshness rather than truth: the
fallback column holds only `Not started` and `Skipped`, so the email degrades to plan order rather
than to a false claim. The pace line assumes 16 h/week regardless of the Overview tab.

---

## 4. The Sandbox

A real Linux microVM — Firecracker, via `@vercel/sandbox` — and not this app. One named sandbox,
`lumen-study`, 1 vCPU, 15-minute session, 120 seconds per command, 256 KB of output per command
(architecture.md §3.5).

**No Lumen credential is reachable inside it.** `env: {}` on `getOrCreate` is load-bearing: the
VM inherits none of `GITHUB_TOKEN`, `MINIMAX_API_KEY`, `RESEND_API_KEY` or `MCP_API_KEY`. That is
the entire reason the shell does not run on the Render host, and it means a command you paste
without reading cannot exfiltrate anything of yours.

**It is line-based, not a PTY.** The backend executes a command and streams NDJSON back; there is
no terminal to attach to. So:

- **Works:** `python3 script.py`, `pytest`, `pip install`, `apt`, `git`, anything that reads
  argv and writes stdout.
- **Does not work:** `vim`, `top`, `less`, `htop`, any curses UI, any interactive prompt, and
  Ctrl-C into a running foreground process. A command that waits for input will sit there until
  the 120-second cap ends it.

**What persists, and what does not.** Files and installed packages survive between sessions — a
half-finished exercise is there tomorrow, and so is a `pip install` from last week. The working
directory does not: it is kept at `/tmp/.lumen-cwd`, which is outside the snapshot, so a new
session opens at `$HOME` the way a new shell does. `cd` still works within a session.

**Locally it needs an OIDC token.** `vercel env pull`, and it expires every 12 hours. On Vercel it
is automatic. The route does not pre-flight this; it translates the SDK's own auth failure into a
hint in the shell output (architecture.md §8).

Two client-side details: `clear` never leaves the browser, and command history (up to 200 entries,
ArrowUp / ArrowDown) lives in `localStorage` under `lumen-shell-history`. "End session" stops the
sandbox and snapshots it; the next command starts a fresh one with your files intact.

---

## 5. Two things that will trip you, stated once

**"Done" means three different things.** The Plan tab's dropdown writes `localStorage` and a
progress event. `get_plan` reports workbook column 15, which nothing writes. The Market tab's
readiness reads progress events only, weighted by each skill's share of the market — so clearing
one row moves it by however much the market asks for that skill, not by 1/117
<!-- verify:active_rows=117 -->. Three definitions, deliberately, and architecture.md §5.4 says
why the readiness one refuses the workbook column.

**Numbers in these docs are checked, so keep them here.** `python3 scripts/verify-docs.py` reads
every `verify:<anchor>=<value>` HTML comment in `docs/platform/*.md` and asserts it against
`data/`, `app/`, `lib/`, `mcp/` and `vercel.json`; an unknown anchor name is a hard error, so a
typo cannot pass by matching nothing. `--list` prints every anchor and its current value. Live
scan output — core requisition counts, the mapped skills' <!-- verify:skills=34 --> shares,
readiness — is deliberately not anchorable, because the 03:00 scan rewrites it, and a checker that
fails most mornings for no defect gets muted in a week. **So do not restate those numbers here at
all**: name the report file and the field to read it from, the way section 2 and the market tools
in section 1 do. A number this file repeats is a number that has to be maintained twice.
