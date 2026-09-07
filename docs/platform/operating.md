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

- **Row numbering.** `get_plan` returns `index`, and `get_syllabus` takes `index`, and both are
  **0-based** — the offset into `Plan` after the header row. The Market tab and the benchmark
  cite **1-based** plan rows. "Row 58" on the Market tab is `index: 57` here. (architecture.md
  §4.1.)
- **Freshness.** Everything read from `data/*.json` is the copy baked into the Render deploy;
  everything read from `reports/` is fetched live from GitHub. So plan and syllabus answers are
  as fresh as the last Render deploy, and progress and market answers are as fresh as the repo.

| tool | reach for it when |
|---|---|
| `get_plan` | you need a row's month, hours, depth target, deliverable or resource links |
| `get_learning_context` | you want a book or repo picked for the topic you are on |
| `get_syllabus` | you are starting a topic and want the 12–20 parts, failure modes and proof of work |
| `ask_lumen` | you want an explanation grounded in the plan *and* the measured market, saved to GitHub |
| `list_ask_reports` | you want to find an Ask you saved earlier |
| `read_ask_report` | you have the path and want the answer back |
| `save_study_note` | you asked, explicitly, for a note to outlive the session |
| `record_progress` | you actually finished a topic and want it to count toward readiness |
| `get_progress_history` | you want to confirm an event landed in the repo |
| `get_progress_analytics` | you want the count of recorded events by status |
| `score_assessment` | you have finished a weekly, monthly or quarterly and want it graded |
| `semantic_search` | you need the open web, or you need to find something in this repo remotely |
| `get_audit_log` | a tool call just failed and you want the reason it recorded |
| `get_connection_map` | you do not know which server or which search backend you are talking to |

### `get_plan`

**Answers:** what does the plan say about these rows — track, month, topic, depth target, hours,
deliverable, status, and the Read/Watch/Do label-and-URL pairs.

**Inputs:** `query` (case-insensitive substring of the topic), `month` (exact number), `track`
(case-insensitive substring). All optional and ANDed; no arguments returns all 119 rows
<!-- verify:rows=119 -->.

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
count, role and topic tags, which is enough to choose, not enough to quote.

### `get_syllabus`

**Answers:** everything to learn for one plan topic — why an FDE needs it, prerequisites, the
parts with one public resource each, outcomes, production failure modes, senior-level interview
questions, and the proof-of-work artifact. 2,236 subtopics <!-- verify:subtopics=2236 --> across
119 source files <!-- verify:curriculum_files=119 -->.

**Inputs:** `index` (0-based plan row), or `query` (substring of topic or track). No arguments
lists every topic with its index, month, hours and part count.

Three behaviours worth knowing: `index` wins if both are passed; a `query` matching exactly one
topic returns that full syllabus; a `query` matching several returns the short list, so you can
pick an index from it.

**Reach for it when** you open a topic for real — this is the day's material. Reach for
`get_plan` instead when you only want the row's hours or links, and for `ask_lumen` when you want
something explained rather than listed.

**It serves `data/curriculum.json`, which is built output.** Fixing something you see here means
editing `data/curriculum/NN.json` and rerunning `scripts/build-curriculum.py` (architecture.md
§4.2). Editing the bundle is the bug that already reverted 117 topics once.

### `ask_lumen`

**Answers:** an open question about the plan, in plain language, with the whole plan and the
measured market in context.

**Inputs:** `prompt` (required), `context` (optional free text — the active topic, what you just
tried, what confused you).

**Reach for it when** the question is "why" or "how does this connect", especially if it touches
the market: the answer carries the benchmark and insight numbers, and the model is instructed to
quote them rather than compute them (architecture.md §2, §5.6). Reach for `get_syllabus` instead
when you want the topic's own material, which is deterministic and free.

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
   matches no row is counted as unmatched and silently does nothing (architecture.md §5.4). Copy
   the topic out of `get_plan` rather than typing it.
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

**Answers:** how many progress events are recorded, split by status, plus the newest ten.

**Inputs:** none.

**Reach for it when** you want the one-line answer to "how much have I actually logged".

**It counts filenames, over the newest 100 events, and computes nothing else.** Despite the
tool's own description naming "completion, hours", no hours figure and no percentage is
produced — those live in the Market tab's readiness, which weights by market share rather than
row count (architecture.md §5.4). Two events for the same topic count twice here; the readiness
pass takes only the newest per row.

### `score_assessment`

**Answers:** what does this assessment score, and what should be done about it.

**Inputs:** `assessment` (`quick_check` / `weekly` / `monthly` / `quarterly`) and `answers`, an
array whose meaning depends on the first:

- `quick_check` — four numeric choices, graded against a fixed key. Returns per-question
  correctness, the expected value, and a percentage.
- `weekly` and `monthly` — four ratings, 0 to 4, weighted 40 / 25 / 20 / 15.
- `quarterly` — five ratings, 0 to 4, weighted 20 / 25 / 25 / 15 / 15.

Ratings are clamped into 0–4, so a stray 7 scores as 4 rather than erroring.

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

**Inputs:** `limit` (default 50, capped at 100).

**Reach for it when** a tool call failed and the error you saw was terse. Entries carry the
action, ok/failed, up to 180 characters of detail, and a timestamp.

**It is memory on one process, last 500 events.** A Render restart empties it, and the free tier
sleeps after inactivity, so an empty log usually means the server restarted rather than that
nothing happened. The durable trail is `reports/audit/*.json`, written only by `save_study_note`
and `record_progress` (architecture.md §3.6).

### `get_connection_map`

**Answers:** which dashboard, repo and MCP URL this server believes it is part of, where durable
writes go, whether SurfSense is live, and the free-tier sleep caveat.

**Inputs:** none.

**Reach for it first** when something is behaving strangely — it is the cheapest call that
distinguishes "wrong server" from "wrong data", and it is also the fastest way to wake a sleeping
Render instance before a call you care about.

---

## 2. The 10 tabs

`app/page.tsx`, the `TABS` constant, in order. All ten are one client component; the recall strip
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
time. As of the first real scan — `reports/market/benchmark.json` and
`reports/market/insight.json`, both `2026-09-07T17:37:03.572Z` — it reads 189 core requisitions
across 23 companies, 11 takeable without leaving India, readiness 0% (architecture.md §5.7).

**The recall strip**, above all ten: at most five cards a day, most-overdue first, from a bank of
1,710 prompts <!-- verify:prompts=1710 --> on a 7-rung ladder <!-- verify:ladder_rungs=7 -->.
You write before you can reveal; you grade Fluent / Halting / Gone. Only topics marked
`In progress` or `Done` enter the schedule, so the strip is empty until you mark a first row.
*It will never show you a backlog count* — that is deliberate, and architecture.md §7 says why.

---

## 3. The 2 crons

`vercel.json`. Both are `GET`, both authenticate on `Authorization: Bearer ${CRON_SECRET}`, and
neither is behind the password gate — `/api/cron` is the proxy's only functional exemption
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

**The one that will confuse you: the digest reads workbook column 15, not your progress events.**
Its "TODAY" is the first row that is neither skipped nor `Done` *in the committed workbook*, and
that column holds only `Not started` and `Skipped` — so the email keeps naming the same topic and
keeps saying `0 of 117 topics done` however much you record, until `data/workbook.json` itself is
edited. The dashboard does not behave this way: it merges `GET /api/progress` on load. The pace
line also assumes 16 h/week regardless of what you set on the Overview tab.

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
scan output — the 189 core requisitions, the 34 mapped skills' <!-- verify:skills=34 --> shares,
readiness — is deliberately not anchorable, because the 03:00 scan rewrites it; cite those with
the report file and the scan date instead, the way section 2 does.
