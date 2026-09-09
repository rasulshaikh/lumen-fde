# Lumen FDE - architecture

This is the fact file. `operating.md`, `runbook.md` and `talk-track.md` are lenses onto it and
cite it rather than restating it; a number appears here once and nowhere else in the set.

Every number below names the file it was read from, so `scripts/verify-docs.py` can check it
against source data instead of against an editor's memory. Supersedes
`docs/lumen-fde-architecture.md`, which predates the Sandbox tab, the Market tab, the market
cron, and the 890h → 1,588h / 13 → 23 month rebaseline. That file says "13 tools", and its own
superseding banner corrects it to 14; both numbers are now stale. The count is 18 - §3.6, read
from the `tools` array in `mcp/server.js`, which is where it should be read from rather than
from either doc.

---

## 1. What the system is

A single-user study platform for one 23-month Senior FDE plan. Three things run:

1. **A Next.js app on Vercel** - the dashboard (8 tabs), 13 API routes, and 2 cron endpoints.
2. **An MCP server on Render** - 18 tools, so Claude Code can read the same plan the dashboard
   reads, and write progress back to it.
3. **GitHub, as the database** - every mutable artifact (progress events, review schedule,
   market index, benchmark, insight, trend) is a file in this repo, read whole and written
   whole through the contents API.

There is no database, no queue and no object store. The scan, the benchmark and the review
schedule are all files, and the reason is in `lib/market/store.ts`: state that must survive a
redeploy, be diffable, and be readable by a second process on a different host.

---

## 2. How the pieces connect

```
                                   ┌──────────────────────────────────────────┐
                                   │  GitHub - rasulshaikh/lumen-fde @ main   │
                                   │                                          │
        ┌─────────read/write──────►│  reports/market/index.json    (750 reqs) │
        │                          │  reports/market/benchmark.json           │
        │                          │  reports/market/insight.json             │
        │                          │  reports/market/trend.json               │
        │                          │  reports/market/history/YYYY-MM-DD.json  │
        │                    ┌────►│  reports/progress/*.md   (append-only)   │
        │                    │     │  reports/review/state.json  (one file)   │
        │                    │     │  reports/notes/*.md · reports/asks/*.md  │
        │                    │     │  reports/audit/*.json                    │
        │                    │     └──────────────────────────────────────────┘
        │                    │                        ▲
        │                    │                        │ GITHUB_TOKEN
        │                    │                        │
┌───────┴────────────────────┴──────────┐   ┌─────────┴───────────────────────┐
│  Vercel - Next.js (proxy.ts gate)     │   │  Render - mcp/server.js          │
│                                       │   │  Node http, JSON-RPC at /mcp     │
│  app/(app)/      8 routes              │   │  18 tools, MCP 2025-03-26        │
│  app/api/*       13 routes            │   │  /healthz · free tier, sleeps    │
│  vercel.json     2 crons              │   └─────────┬───────────────────────┘
│                                       │             │ POST /api/ask
│   ┌─ /api/cron/market-scan  03:00 UTC │◄────────────┘ x-lumen-internal-key
│   │    27 boards → classify → skills  │
│   │    → benchmark → insight → 5 files│
│   └─ /api/cron/daily-digest 03:30 UTC │──────► Resend ──► inbox
│                                       │
│  data/*.json  bundled at build time   │──────► MiniMax-M3 (Ask, digest framing,
│  (workbook, curriculum, recall-bank,  │        Quaere's reading)
│   market-sources, market-skill-map)   │
└───────────────┬───────────────────────┘
                │ @vercel/sandbox
                ▼
        ┌───────────────────────┐
        │ Firecracker microVM   │  name "lumen-study", 1 vCPU, env: {}
        │ Sandbox tab's shell   │  no Lumen credential is reachable inside
        └───────────────────────┘
```

Two edges are worth naming because they are the ones that surprise people:

- **Render reads GitHub, not the local checkout, for market numbers.** `mcp/server.js`
  `readMarketReport()` fetches `reports/market/benchmark.json` and `insight.json` over the API
  with a 4 s budget (`MARKET_READ_MS`), because `readJson` would serve whatever the checkout
  held at deploy time and Claude Code would then quote a different market than the dashboard.
- **The MCP server prefers to proxy.** With `LUMEN_ASK_URL` and `LUMEN_INTERNAL_API_KEY` set,
  `ask_lumen` posts to `/api/ask` and inherits its context. Without them it assembles its own
  context and calls MiniMax directly - which is why the market-context builder is duplicated
  in `mcp/server.js` and must stay identical to `app/api/ask/route.ts`.

---

## 3. Surfaces

### 3.1 The password gate

`proxy.ts` (Next's proxy/middleware entry point) is the only auth in front of the app. It
exempts, in this order: no `LUMEN_PASSWORD` set at all, **`/` (the public landing page)**,
`/login`, `/api/auth/*`, `/_next/*`,
the branding assets matched by its `publicAsset` regex (favicon, `icon*.svg|png|ico`,
`apple-icon*.png`, `(opengraph|twitter)-image*`, `manifest.webmanifest`, `robots.txt`,
`sitemap.xml`). **`/api/cron/` is NOT in that list - it is GATED, not exempted**, and the check
runs FIRST, before the `LUMEN_PASSWORD` fall-through: a request without a valid
`Bearer $CRON_SECRET` gets 401 whatever the password gate is doing. The trailing slash is
load-bearing (`/api/crontab` must not match). Gating at the prefix rather than exempting it means
a third cron route is protected the day it is created, instead of on the day someone remembers to
paste the check into its body - the routes keep their own identical check as the layer that
survives the proxy being skipped. Cron
routes authenticate themselves instead, on `Authorization: Bearer ${CRON_SECRET}`.

**`/` is public and is not the signed-in home.** `app/page.tsx` is a landing page for a visitor
who is not signed in; a request to `/` carrying a valid session is redirected to `/overview`,
which is where the dashboard's Overview now lives. Both halves of that decision are made in
`proxy.ts` and not in the page, so every authentication decision in this app stays in one file -
a page that reads the session cookie itself is a second place to get it wrong.

The landing renders from bundled JSON only, and the rule it follows is the one `app/login/page.tsx`
already documents: **scale, never state.** Topic counts, hours, syllabus parts and the board count
describe how big the system is and are harmless on a public URL. Progress, readiness, current
focus, streaks and anything naming what has or has not been done stay behind the gate. A number
that needs `statuses` to compute does not belong on that page.

`/api/ask` has one extra bypass: a matching `x-lumen-internal-key` header when
`LUMEN_INTERNAL_API_KEY` is set. That is the Render MCP server's service-to-service path.

Everything else needs a session cookie. `lib/auth.ts` issues `lumen_session` as
`base64url(user.expiry).HMAC-SHA256(payload, password)` with a 14-day TTL - the password *is*
the signing key, so changing it invalidates every session. `POST /api/auth/login` rate-limits
failures at 8 per 10 minutes per client IP, in a `Map` in one serverless instance's memory
(best-effort by construction; it resets on cold start).

Unauthenticated `/api/*` gets 401 JSON; anything else gets a 307 to `/login`.

If `LUMEN_PASSWORD` is unset the password gate is off and the rest of the app is public - but
`/api/cron/*` still 401s without `CRON_SECRET`, because that branch returns before the password
check is reached. "Every route is public" was true before the cron prefix was gated and is not now.

### 3.2 The 8 tabs

`components/Nav.tsx`, the `NAV` constant:

`Overview` · `Plan` · `Curriculum` · `Practice` · `Market` · `Paths` · `Library` · `Sandbox`

Each is its own route under `app/(app)/`, and each page imports its section from `components/` -
`Market` is `components/Market.tsx`, not a branch inside a shared file. Nine of the eleven pages
are 27 lines or fewer; `app/(app)/overview/page.tsx` is the exception at 228, because Overview
also assembles the home feed rather than just mounting a section. Overview moved off `/` when the
public landing page took that path; `/` now belongs to a signed-out visitor (§3.1).
`Sandbox` renders `Terminal` from `app/terminal.tsx`; the recall strip (`app/recall.tsx`) is
mounted in `app/(app)/layout.tsx`, which is why it is present on every view.

**9 app routes, 8 tabs - the difference is deliberate.** `/design` is a route under `app/(app)/`
but is not in `NAV`. It is the living style guide: it renders the tokens the other ten views are
drawn with and measures the five contrast floors in the browser, which is how the light-theme
ruling failure was caught. It is about the app rather than about the plan, and the tab bar is
for the plan, so it is reachable by URL and unlisted. Do not "fix" the count by re-adding it.

This paragraph described a single 699-line client component holding all ten sections until the
routing migration replaced it, and `app/page.tsx` no longer exists. The tab count is anchored and
was checked; a sentence is not, which is the whole reason the count and the prose disagreed.

Four tabs fetch; the rest render bundled JSON:

| tab | source |
|---|---|
| Plan, Overview, Mocks, Roadmaps, Comp reality | `data/workbook.json`, imported at build time |
| Library | `data/library-context.json` (16 books, 10,521 pages), `data/repository-context.json` (2 repos) |
| Curriculum | `GET /api/curriculum?summary=1`, then `?i=<row>` per opened topic |
| Sandbox | `POST /api/sandbox` (NDJSON stream) |
| Market | `GET /api/market` on mount |
| Paths | `GET /api/market` (reach tiers) + `GET /api/artifacts`, over the bundled `CompReality` sheet |

The Plan tab writes status to `localStorage` under `lumen-statuses` and mirrors it to
`POST /api/progress`; on load it merges back whatever `GET /api/progress` returns.

### 3.3 The 13 API routes

| route | methods | what it does | degrades to |
|---|---|---|---|
| `app/api/ask/route.ts` | POST | Quaere/Lumen answer. Builds the full plan (all 119 rows) server-side, optional per-topic syllabus, optional market block; calls MiniMax-M3 with a 55 s timeout; saves the answer to `reports/asks/`. `maxDuration = 60`. | 503 without `MINIMAX_API_KEY`; no `reportUrl` without `GITHUB_TOKEN` |
| `app/api/curriculum/route.ts` | GET | `?summary=1` → parts+minutes per topic; `?i=N` → one syllabus. Never serves the 3.7 MB bundle whole. | 400 with neither param, 404 for an unknown index |
| `app/api/market/route.ts` | GET | Three fixed reads: benchmark, trend, insight. No model runs on this path. | `{benchmark:null, trend:[], insight:null, synced:false}` |
| `app/api/progress/route.ts` | GET, POST | Append-only study history as one markdown file per event; GET lists and re-reads the newest 100. | 502 without `GITHUB_TOKEN` |
| `app/api/recall/route.ts` | GET | `?topics=1,2` → only those topics' prompts out of the 600 KB bank. Cached 1 h. | `{meta:{},prompts:[]}` with no topics |
| `app/api/review/route.ts` | GET, PUT | The whole review schedule as one file, `reports/review/state.json`, written with its sha. | `{state:{},sha:null,synced:false}` - the strip runs local-only |
| `app/api/sandbox/route.ts` | POST | `run` / `stop` against the named Vercel Sandbox. | SDK error text plus an OIDC hint |
| `app/api/artifacts/route.ts` | GET, POST | Shipped deliverables, one markdown file per artifact under `reports/artifacts`. The join key is the plan ROW, validated against the workbook; the topic is derived at write time and never accepted from the caller. Append-only by protocol - no `sha` is sent, so the contents API itself refuses an overwrite. | 502 without `GITHUB_TOKEN`; `synced:false` means "unknown", never "nothing built" |
| `app/api/session/route.ts` | POST | Records that a study session happened, under `reports/companion/sessions`, and updates the companion digest. Same row-validated, topic-derived, append-only discipline as artifacts. **It never writes progress** - marking a row goes through `/api/progress`, which owns that validation and the hydration write-guard. | 400 on an invalid row; 502 when the write fails, leaving the session open to retry |
| `app/api/external-brief/route.ts` | GET, POST | The one thing Lumen shows that is not a file in the repo. GET returns the stored brief and refreshes it when it is a day old, writing a dated file plus `latest.json` under `reports/external`; POST runs one live search for one question and stores nothing. `maxDuration = 60`, and both budgets are subtraction from it. | 503 without SurfSense config; a failed refresh returns the brief already stored, honestly dated |
| `app/api/auth/login/route.ts` | POST | Issues the session cookie. | 503 without `LUMEN_PASSWORD` |
| `app/api/cron/market-scan/route.ts` | GET | Section 5. | 401 without a matching `CRON_SECRET` |
| `app/api/cron/daily-digest/route.ts` | GET | Section 6. | 401 without `CRON_SECRET`; 503 without Resend config |

### 3.4 The 2 crons

`vercel.json`:

| path | schedule (UTC) |
|---|---|
| `/api/cron/market-scan` | `0 3 * * *` - 03:00 |
| `/api/cron/daily-digest` | `30 3 * * *` - 03:30 |

Two, because Vercel Hobby allows two. That constraint is why the Monday market email is folded
into the market scan behind `now.getUTCDay() === 1` rather than being a third entry.

It is also why the external brief is **not** a cron. It wanted `15 3 * * *`; a third entry fails the
deploy while building perfectly with `next build`, which validates nothing about the plan. Neither
fold was available either - the scan already runs past 60s and resumes on a cursor, and the digest
sends email - so `/api/external-brief` refreshes on the first visit of the day instead, fired
unawaited from the Overview page. It lives outside `/api/cron/` because `proxy.ts` gates that prefix
on the secret and a browser cannot present one, so it is gated by the session cookie instead - which
also means it is **not cron-callable as written**. Promoting it later needs a free slot, a
`Bearer CRON_SECRET` check in the route, and a `proxy.ts` exemption; not one of the three exists today.

**The same 60s cap is why live web search is not in `/api/ask`.** The scrape measures 27-39s and the
model call claims up to 55; they do not fit one function. The search is its own route with its own
60s, the client makes two calls, and `/api/ask` re-cleans and re-caps every field that comes back
before any of it reaches a prompt.

### 3.5 The sandbox

`app/api/sandbox/route.ts` opens **one named** Vercel Sandbox (`lumen-study`, 1 vCPU, 15-minute
session, 120 s per command, 256 KB output cap) via `Sandbox.getOrCreate`, so files and installed
packages survive between sessions. `env: {}` is load-bearing: the microVM inherits none of this
app's secrets, which is the whole reason the shell does not run on the Render host that holds
`GITHUB_TOKEN`, `MINIMAX_API_KEY` and `MCP_API_KEY`. Not `RESEND_API_KEY`: `grep -c RESEND_API_KEY mcp/server.js` is 0, and only the two Vercel crons send mail.

`cd` cannot persist across `runCommand` calls, so the working directory is stored inside the
sandbox at `/tmp/.lumen-cwd` and `$HOME` is read from the sandbox rather than assumed.
`app/terminal.tsx` is a line-based shell, not a PTY: `python3 x.py` and `pytest` work, `vim` and
`top` do not.

### 3.6 The MCP server - 18 tools

`mcp/server.js`, deployed from `mcp/render.yaml` (Render web service `lumen-mcp`, free plan,
`rootDir: mcp`, health check `/healthz`). JSON-RPC over `POST /mcp`, protocol version
`2025-03-26` (`PROTOCOL_VERSION`), server version `1.2.0` - both read from `mcp/server.js`, the
version from the `serverInfo` in the `initialize` reply, which is the only place it is declared.

The 18 tools, exactly as the `tools` array declares them:

`get_plan` · `get_learning_context` · `get_syllabus` · `ask_lumen` · `list_ask_reports` ·
`read_ask_report` · `save_study_note` · `record_progress` · `get_progress_history` ·
`get_progress_analytics` · `score_assessment` · `semantic_search` · `get_audit_log` ·
`get_connection_map` · `get_market_priorities` · `get_market_reach` · `get_market_skill` ·
`get_market_plan_risk`

Transport facts that matter operationally:

- `buildFilter` in `mcp/render.yaml` includes `data/**` as well as `mcp/**`, because
  `server.js` reads `../data/*.json` from outside its `rootDir`. Without it, plan edits never
  reach the live MCP and it silently serves stale rows.
- Auth is `Bearer ${MCP_API_KEY}`, checked by `authError()` in `mcp/server.js` before any
  dispatch. **It refuses by default: unset `MCP_API_KEY` is `503 "MCP_API_KEY is not
  configured"` for every request, a wrong key is 401.** So an MCP that answers `/healthz` and
  503s every tool call is missing its key, not under attack - `mcp/render.yaml` declares no
  `envVars`, so nothing in this repo guarantees the variable exists on the service. It failed
  open until 1.2.0, and the function's header comment records that; do not read the comment as
  current behaviour.
- Rate limit: 30 requests per 60 s per bearer token. Request body cap 128 KB. `rateLimited()`
  also keys on the remote address, but that branch is unreachable - an unauthenticated request
  never gets past `authError()`.
- `get_audit_log` returns two lists. `inProcess` is in-memory (last 500 events, lost on every
  free-tier spin-down). `durable` is `reports/audit/*.json` read back from GitHub, written by
  `save_study_note` and `record_progress`, and included unless the call passes
  `durable: false`.
- Free tier sleeps after inactivity; `get_connection_map` says so in its own output.

---

## 4. The data model

### 4.1 `data/workbook.json` - the plan

Four sheets, each an array-of-arrays with a header row at index 0:

| sheet | data rows | note |
|---|---|---|
| `Plan` | 119 | the study plan |
| `Mocks` | 13 raw; 11 after the app drops "Total"/short rows | 57 total target reps |
| `Roadmaps` | 16 | |
| `CompReality` | 7 raw; 6 after the same filter | |

`Plan` columns, by index - these indices are quoted throughout the code, so they are part of
the contract: `0` Track, `1` Month, `2` Topic, `3` Depth target, `4/5/6` Read label/URL/cost,
`7/8/9` Watch, `10/11/12` Do, `13` Hours, `14` Deliverable, `15` Status, `16` Notes.

Measured over `data/workbook.json`:

- **119 rows**, across **15 tracks** (`A. Linux, Networking, Shell` … `O. Deep Learning and
  Multimodal`).
- **117 active, 2 Skipped.** The two skipped are PySpark (6h) and the MIT 6.824 Raft lab (20h).
  Column 15 currently holds only `Not started` (117) and `Skipped` (2).
- **1,588 active hours**, 1,614h including the skipped 26h. "Active" means status ≠ Skipped, and
  that one definition is used by `components/shared.tsx`, `app/api/ask/route.ts` `planMap()`,
  `app/api/cron/daily-digest/route.ts` `digest()` and `lib/market/insight.ts` alike.
- **Months 1-23**, 23 distinct values.

Row numbering has one trap and it appears in four files. The market subsystem cites
**1-based plan rows**: row N is `workbook.Plan[N]`, which is `planRows[N-1]` in `components/shared.tsx`
and curriculum topic key `N-1`. `Market.marginalRef()` and `openPlanRow()` both resolve it in
that direction; `lib/market/benchmark.ts` resolves it in the other.

### 4.2 Curriculum - SOURCE vs BUILT

**This is the distinction that has already caused one real bug. Getting it backwards causes it
again.**

```
data/curriculum/00.json … 118.json   ← THE SOURCE. 119 files, one per plan row. Edit these.
            │
            │  python3 scripts/build-curriculum.py
            ▼
data/curriculum.json                 ← BUILT. 3.7 MB. Never hand-edit.
data/recall-bank.json                ← BUILT in the same pass. 600 KB.
```

- **119 source files**, `data/curriculum/NN.json`, each keyed by `i` = the 0-based plan row.
  Required keys, enforced by `scripts/build-curriculum.py` `REQUIRED`: `i`, `topic`, `why`,
  `prerequisites`, `subtopics`, `outcomes`, `failureModes`, `interviewQuestions`, `proofOfWork`.
- **2,236 subtopics** in total - the same count in the 119 source files and in the built
  `data/curriculum.json`, which is what "in sync" means here.
- The build hard-checks drift: the file's `topic` must equal `Plan[i+1][2]`, and `track`,
  `month`, `hours` must equal plan columns 0, 1 and 13. Its own comment records why: *a renumber
  silently desynced 90 files once*, so drift is now an error rather than a warning.

The bug: `scripts/rebaseline-hours.py` and `scripts/renumber-months.py` originally wrote
`data/workbook.json` and `data/curriculum.json` only. The next `build-curriculum.py` run
regenerated the bundle **from the untouched per-topic files** and reverted the whole edit. The
drift check never fired, because nothing had asked it to run. Both scripts now write the source
files and print `Now run: python3 scripts/build-curriculum.py` as their last line.

The rule, stated once: **write `data/curriculum/NN.json`, then rebuild. Anything that writes
only `data/curriculum.json` is a bug that will be silently undone.**

### 4.3 `data/recall-bank.json` - built, and deliberately slim

Emitted by the same `build-curriculum.py` pass. `data/curriculum.json` is 3.7 MB and cannot go
into a client bundle to show at most five cards a day, so the build flattens it:

- **1,710 prompts** - 835 `recall` (from `interviewQuestions`) and 875 `drill` (from
  `failureModes`), plus a `meta` entry per topic (119) carrying the topic, track and first three
  outcomes.
- The reveal text is stored **once per topic**, not once per prompt. Per-prompt storage made a
  2.6 MB file, bigger than the problem it solved.
- `outcomes[]` are deliberately **not** prompts. 132 of the 947 are build-shaped ("write,
  closed-book in 45 minutes, a 200-line bash CLI…"): asked as a flashcard the honest answer is
  "I'd have to try", which grades as nothing and teaches the learner to lie to the scheduler.
  They are the self-grading reference on the reveal instead.

### 4.4 `data/market-sources.json` - the boards

- **32 boards configured, 27 enabled** (`boardCount` / `enabledCount`, matching the actual
  `boards` array and its `enabled` flags). `lib/market/benchmark.ts` carries the enabled count
  as `BOARD_COUNT = 27` purely for the "N of 27 boards" wording; the counting never depends on
  it, and `benchmark.test.mts` asserts the two agree.
- Three ATS adapters have implementations in `lib/market/fetch.ts`: `ashby`, `greenhouse`,
  `lever`. Gem's undocumented GraphQL and Workable's widget were cut; those boards stay in the
  config, disabled, with their reasons.
- Per board: `ats` (pinned per company, **never** inferred from the slug - `api.lever.co/v0/postings/anyscale`
  returns 200 with a single tombstone), `token`, `listUrl`, `jobUrl`, `tier`, and the audited
  title patterns `core` / `adjacent` / `exclude`, optional `fieldGuards`, `boilerplate`, and the
  audit figures `verifiedMatches` / `verifiedTotal` / `verifiedBytes` / `verifiedAt`.
- The file's own `note` states the governing rule: patterns are per-company evidence, never a
  global list. "Applied AI" is core FDE at Mistral and Anthropic and a false positive at
  Databricks and Perplexity; "Solutions Engineer" is real field engineering at Scale and Glean
  and internal IT at OpenAI.

### 4.5 `data/market-skill-map.json` - hand-authored, never model-written

- **34 skills**, **13 gaps**, **3 over-invested tracks**.
- `_source` records that it was hand-authored from `docs/research/2026-09-07-jd-skill-taxonomy-*.md`
  and the benchmark spec, and that only the counting is automated.
- Each skill carries `include` phrases, `exclude` phrases, an optional `proximity`
  `{terms, window}` block (`python` is the one skill without one), `minDistinctForms`, a
  `primaryRow` and `supportRows` into the plan, and `evidence`.
- `_rules` states the two that shape everything: skills are capability terms and never title
  terms (title classification lives in `lib/market/classify.ts`), and matching is boolean per
  requisition - presence, not occurrence count.
- `_gapsNote` records that all 18 original gap claims were adversarially challenged on
  2026-09-07 across three lenses; four were deleted as factually false, three were rewritten
  from "absent" to "partial", and three had clone-inflated frequencies corrected. 13 survived.

### 4.6 `reports/` - the mutable state

| path | shape | writer | reader |
|---|---|---|---|
| `reports/market/index.json` | one object, `{version, updatedAt, cursor, boardsOk, boards, reqs}` | market-scan | market-scan, daily-digest |
| `reports/market/benchmark.json` | one object of rendered statements | market-scan | `/api/market`, `/api/ask`, MCP |
| `reports/market/insight.json` | one object, personal reading | market-scan | `/api/market`, `/api/ask`, MCP |
| `reports/market/trend.json` | array, one point per completed cycle, capped at 180 | market-scan | `/api/market` |
| `reports/market/history/YYYY-MM-DD.json` | a copy of that day's benchmark | market-scan | **nothing** - write-only archive |
| `reports/progress/*.md` | one file per event | `POST /api/progress`, MCP `record_progress` | `GET /api/progress`, `readProgress()` |
| `reports/review/state.json` | one object, keyed by prompt key | `PUT /api/review` | `GET /api/review` |
| `reports/asks/*.md` | one file per Ask answer | `/api/ask` | MCP `list_ask_reports` / `read_ask_report` |
| `reports/notes/*.md` | one file per saved note | MCP `save_study_note` | - |
| `reports/audit/*.json` | one file per durable MCP action | MCP | - |

Two shapes, chosen per file and not by habit:

- **One file, read whole, written whole with its sha** for mutable state (the review schedule,
  the market index, benchmark, insight, trend). A stale sha is how two writers silently clobber
  each other, so the sha always goes with the write.
- **A directory of small files** for append-only history (`reports/progress`). Its GET is an
  N+1 - list the directory, then fetch each file - and that is correct *for a history*. It is
  explicitly refused for the market index, which the cron rewrites daily.

Both `readJson()` and `readProgress()` in `lib/market/store.ts` obey one rule that the whole
market subsystem rests on: **`synced: false` means "we do not know", never "the file is
empty"**. A benchmark computed from a failed read would reset the seen-set and report all ~420
live requisitions as new the following day.

---

## 5. The market pipeline, end to end

`GET /api/cron/market-scan`, guarded by `Authorization: Bearer ${CRON_SECRET}`.

```
  read index.json ──(synced:false? abort before any fetch)
        │
        ▼
  27 enabled boards, 6 in flight (BOARD_CONCURRENCY), resumable cursor
        │
        │  stage 1  fetchBoard()      45 s/board, truncation guard at 60% of verifiedTotal
        ▼
  classify()      per-company title patterns → core | adjacent | leadership | junior | null
        │         never reads the JD body
        ▼
  stage 2  fetchJd()   Greenhouse only, 4 in flight, only for reqs whose fingerprint is missing
        │
        ▼
  htmlToText → stripBoilerplate → matchSkills   ⇒ skills[]   (the body is then discarded)
  htmlToText → classifyReach                    ⇒ reach tier (UNSTRIPPED text - see below)
        │
        ▼
  markSeen() per req · index.boardsOk recount · cursor advances
        │
        └── cycle incomplete? write index.json and stop.
        │
        ▼  cycle complete (cursor wraps to 0):
  sweepMissing() → capReqs() → computeBenchmark() → appendTrend() → computeInsight()
        │
        ▼  SEQUENTIAL writes, never Promise.all:
  index.json → benchmark.json → trend.json → history/DAY.json → (Quaere) → insight.json
        │
        └── Monday only (getUTCDay() === 1): the weekly benchmark email via Resend
```

### 5.1 Bounds and budgets

| knob | value | file |
|---|---|---|
| `BOARD_CONCURRENCY` | 6 | `app/api/cron/market-scan/route.ts` |
| `SCAN_DEADLINE_MS` | 220,000 default | same |
| `BOARD_TIMEOUT_MS` | 45,000 | `lib/market/fetch.ts` |
| `JD_TIMEOUT_MS` / `JD_CONCURRENCY` | 20,000 / 4 | `lib/market/fetch.ts` |
| `MISSING_DAYS` | 14 | `lib/market/store.ts` |
| `MAX_REQS` | 3,000 | `lib/market/store.ts` |
| `TREND_POINTS` | 180 | `lib/market/store.ts` |
| `DELTA_MIN_BOARDS` | 24 | `lib/market/benchmark.ts` |
| `MOVE_MIN_POINTS` | 3 | `lib/market/benchmark.ts` |
| `NEW_ROLES_CAP` | 3 | `lib/market/benchmark.ts` |
| `READINESS_FLAG_POINTS` | 3 | `lib/market/insight.ts` |
| `VELOCITY_MIN_DAYS` | 7 | `lib/market/insight.ts` |

`maxDuration` is deliberately **not** declared in the scan route. Hobby caps a function at 60 s
and rejects a build asking for more, so hardcoding 300 s would make the design plan-specific.
`SCAN_DEADLINE_MS` is the knob instead: 220,000 on a 300 s function, ~50,000 on a 60 s one, and
the cursor finishes the cycle over 3-4 daily invocations instead of one.

The deadline budgets *starting* boards, not finishing them - a board dispatched at 219 s still
gets its full 45 s, and 220,000 + 45,000 leaves headroom under 300 s.

### 5.2 The seven rules that keep the numbers honest

1. **Failure isolation per board.** Nothing in `lib/market/fetch.ts` throws; a failed board is
   recorded as `ok: false` rather than skipped. `sweepMissing()` only touches reqs whose board
   reported `ok: true` this run. Without that, one Ashby 500 marks all 55 Sierra reqs missing
   and the next successful run reports 55 phantom new roles.
2. **Truncation guard against the board TOTAL, not the match count.** `postings.length` must be
   at least `floor(verifiedTotal * 0.6)`. The Decagon audit had a fetch return 10 of 139 jobs,
   which produced 2 matches instead of 34 and would have been written as truth. A match-based
   floor was the same bug wearing the guard's clothes: Databricks matches 97 of 870, so that
   floor was 58 and a truncated 100-of-870 fetch sailed through. Against the total the floor is
   522, and 10-of-139 fails a floor of 83 by design.
3. **Never classify on description text.** 23 of Baseten's 88 postings mention "forward
   deployed" in the body - including `Account Executive - Enterprise` and `Site Reliability
   Engineer` - because unrelated roles describe partnering with the FDE team.
   `lib/market/classify.ts` deliberately does not read `posting.jd`.
4. **Bounded phrase match, not `includes`.** Every board excludes "Intern"; a bare substring
   test also voids "Internal Tools Engineer" and every "International" title.
5. **The JD body is never stored.** It is fetched, stripped, reduced to `skills[]` and a `reach`
   tier, and discarded. The measured corpus is ~47 MB decompressed per cycle - sum
   `boards[].bytes` in `reports/market/index.json` for the exact figure of the last scan; it was
   46.96 MB across 27 boards on 2026-09-08, 38 MB of it Ashby - storing it would
   turn a ~500 KB file into ~40 MB and break read-whole/write-whole against the contents API.
   The fingerprint is also what lets the benchmark be recomputed with no network when the skill
   map's phrasing changes.
6. **`null` means "no body this run", never "no skills".** `markSeen()` keeps the previously
   stored `skills` and `reach` when the current run has none. Assigning through would wipe every
   known Greenhouse fingerprint each run and deflate every percentage - and for `reach` it is
   worse than a lost value: a location-only tier is an *upper bound*, so it would quietly promote
   every cleared Palantir and Anduril req back into the reachable slice.
7. **`stripBoilerplate` runs before skill matching and NOT before reach tiering.** The
   60%-frequency detector removes lines appearing in ≥60% of a company's postings with ≥40
   normalized characters - and "we are unable to provide visa sponsorship", the ITAR paragraph
   and the clearance clause are exactly such lines. Tiering the stripped text would move every
   Palantir and Anduril req out of `out-of-reach`.

### 5.3 What the benchmark computes

`lib/market/benchmark.ts` is pure: index + skill map + workbook + `now` in, rendered
`statement` strings out. No network, no filesystem, no `Date.now()` - which is the entire
reason it is a separate module from the cron route, since a benchmark that can only be
exercised by a 47 MB live scan is a benchmark nobody checks the arithmetic of.

The headline denominator is **core only**. Adjacent is counted and reported separately and never
sets a headline; if it entered, "the market" would be measured by Databricks Solutions
Architects and Datadog Sales Engineers and the answer would be about pre-sales.

Deduplication is by `dedupeKey(company, title)` - company plus a normalized title with the
location suffix stripped - which collapses city clones. On 2026-09-08
`reports/market/index.json` stored 750 requisition records (382 core, 342 adjacent, 26
leadership) that dedupe to 189, 208 and 21 distinct ones.

Those are the raw dedupe of `index.json` and they are **not** the numbers `benchmark.json`
reports - on that same run it published 206 adjacent, because `distinct()` counts only
requisitions that are live and measured: it skips any record with `skills === null` (no JD body
has ever been read for it) or `missingSince !== null` (absent from its board this run and
inside the 14-day decay window). Five records carried `missingSince` that morning and two
adjacent dedupe keys had nothing else behind them, so 208 became 206. Core and leadership were
unaffected, which is how the gap stayed invisible - it only opens off the headline.

So there are two denominators, and they answer different questions. **Quote
`benchmark.json`'s `adjacentCount` for anything user-facing**; it is what the tab, the weekly
email and the MCP tools all serve. The index dedupe is only the right number when the argument
is about deduplication itself.

Outputs, per `reports/market/benchmark.json`: `coreCount`, `companyCount`, `coreStatement`,
`adjacentStatement`, `baselineStatement`, `skillShares` (34), `coverage` (34 entries with
`pct`/`hits`/`reqs`/`companies`/`totalCompanies`/`rows`), `gaps` (13), `overInvested` (3) with
`overInvestedTotal`, `newSinceLastRun`, and `movement`.

### 5.4 What the insight computes

`lib/market/insight.ts`, also pure. Four rules, each of which produces a plausible wrong number
if broken:

1. **Readiness reads progress events, never workbook column 15.** That column is the committed
   baseline and holds 117 `Not started` and 2 `Skipped`, so a workbook-derived readiness is 0%
   forever and reads as a bug rather than as month one.
2. **Readiness is weighted by market share, not by row count.** Clearing the 67% skill is worth
   sixteen times clearing the 4% one.
3. **An out-of-reach requisition never enters a reachable denominator, and both denominators are
   reported.** "Evals is 42% of the market" and "evals is 55% of the market you can take" are
   different facts and the second is the actionable one.
4. **Velocity needs two points spanning ≥7 days.** With one point it says so and emits nothing;
   it never interpolates, because board state before the first scan cannot be recovered and a
   fabricated slope is indistinguishable from a measured one.

Reachability is five tiers, defined in `lib/market/reach.ts` and ordered best-first for merging
a multi-location posting: `india-remote`, `india-office`, `emea-apac-remote`,
`relocate-sponsor`, `out-of-reach`. Two named sets sit on top of them in `lib/market/insight.ts`:

- `REACHABLE_TIERS` = `india-remote` + `emea-apac-remote` - "employable from Pune today".
- `IN_INDIA_TIERS` = those plus `india-office` - "takeable without leaving India".

Both exist because collapsing to either alone reports something false. Reporting only
`REACHABLE_TIERS` is what made the first run claim data-platform was the sole segment with any
reachable roles, scoring Anthropic's Bangalore Applied AI Architect and Observe AI's Bengaluru
AI Agent Engineer at zero.

### 5.5 The write order, and why it is sequential

Each write is a commit on the same branch, so concurrent writes race the branch ref: GitHub
accepts whichever arrives first and rejects the rest with "is at &lt;commit&gt; but expected
&lt;commit&gt;". **This is not hypothetical - the first real scan wrote `index.json`,
`trend.json` and `history/2026-09-07.json` and lost `benchmark.json` to exactly this.** The
concurrent shape was inherited from `app/api/review/route.ts`, which writes a single file and
therefore cannot race itself. Four round trips instead of one costs about a second on a scan
that already spends a minute fetching boards.

`index.json` is written **first and alone**, because it is the only file that cannot be
recomputed: benchmark, trend and insight are all pure functions of it. A failure after that
point costs a day of freshness on the tab and nothing in the seen-set.

Failure severity is graded deliberately: a failed `index.json` or `benchmark.json`/`trend.json`
write returns 502; a failed `history/` or `insight.json` write is logged and the run still
reports success, because a 502 would make Vercel retry the cron and spend another 47 MB
re-scanning a market that was already scanned.

### 5.6 Quaere, and the digit check

Two places call MiniMax-M3 inside the scan: `weeklyFraming()` (≤60 words, the Monday email's
"what to do this week") and `quaereReading()` (≤80 words, stored into `insight.json` so the
Market tab never calls a model at request time). Both go through one `modelParagraph()`, which
returns `""` on every failure path.

The post-check is the safety property: **any digit in the returned paragraph drops the whole
paragraph.** There is no allow-set, because the prompt says "write no numbers at all", so any
digit is a violation of exactly the instruction given. Two weaker versions leaked in production:
deriving the allow-set from the prompt whitelisted `60` forever (the instruction says "In 60
words or fewer"), and deriving it from the facts block still whitelisted `58`, because coverage
statements cite plan rows and hours (`row 59, "…" - 18h, month 14`) and a row number reads as a
percentage once the model puts a `%` after it. "Coverage sits at 58% this week" shipped under
both.

`modelParagraph()` returning `""` is stored as `null`, not `""` - an empty string in the file
would render an empty Quaere block instead of no block.

### 5.7 One cycle, as an example - the scan of 2026-09-08

**Read this as a worked example of the shape and magnitude of a cycle's output, not as current
fact.** Every figure below is rewritten by the 03:00 UTC scan, so a section transcribing them is
stale the next morning by construction - which is exactly what happened to its predecessor,
which sat here for a day describing itself as "the first real scan" while the second cycle had
already overwritten `baseline`, velocity, `quaere` and the trend length underneath it.

It is dated rather than anchored because `scripts/verify-docs.py` deliberately refuses anchors
under `reports/market/`: an anchor there would fail most mornings with no defect behind it, and
a checker that cries wolf gets muted. Its rule is that live figures are cited by report file and
scan date instead, and that is what this section now does. **For the current numbers, open the
Market tab or read the two files** - do not quote this table.

From `reports/market/benchmark.json` and `reports/market/insight.json`, both `computedAt`
`2026-09-08T03:38:54.948Z`, `day` `2026-09-08` - the second cycle:

| figure | value on that run |
|---|---|
| boards scanned | 27 of 27 |
| core requisitions (distinct) | **189** across **23 companies** |
| adjacent | `adjacentCount` 206 across 17 companies, plus 21 leadership - counted separately, in no percentage, and not the index dedupe's 208 (§5.3) |
| stored requisition records | 750 |
| baseline | `false` - a prior cycle existed, so `newSinceLastRun` is a real diff (empty that morning) |
| readiness | **0%** - 0 of 490 share points, 0 of 34 skills cleared, from 2 matched progress events |
| ranked marginal rows | 27 |
| reachable today (`india-remote` + `emea-apac-remote`) | 7 of 189 (4%), 3 companies |
| takeable without leaving India (+ `india-office`) | **11** of 189 (6%), 5 companies |
| tier split | india-remote 4 · india-office 4 · emea-apac-remote 3 · relocate-sponsor 147 · out-of-reach 31 |
| segments | 5 - data-platform 43, frontier-lab-applied 50, agent-engineer 42, deployment-strategist 42, inference-infra 12 |
| velocity | unavailable - 2 scans spanning 1 day, and velocity needs 7; nothing is interpolated |
| over-investment | 335h across 3 tracks and 26 rows, 21% of the 1,588 active hours |
| flags · Quaere | 0 flags; `quaere` non-null - the reading argued data-platform first |

0% readiness at month one is the expected reading, not a failure. It is why the Decide zone
leads with the ranked marginal table rather than with the headline percentage. That one is
structural rather than incidental: readiness is 0 until progress events start matching plan
rows, so it will read 0 on every cycle for a while yet.

---

## 6. The daily digest

`GET /api/cron/daily-digest`, 03:30 UTC, same `CRON_SECRET` guard.

Everything substantive is derived from `data/workbook.json` and `data/recall-bank.json` with no
model involved: the next non-done, non-skipped topic; its depth target and deliverable; one
recall question rotated by day-of-year so a stalled topic does not send the same question every
morning; a matched book from `data/library-context.json`; and hours remaining ÷ 16 as a week
count. The model writes at most one framing line on top.

That split exists because the digest used to be a single model paragraph, and when the model
returned nothing the email arrived empty - which is what shipped. A bad model day now costs a
paragraph.

`clean()` strips reasoning two ways, both from real delivered mail: a reply that is *entirely* a
`<think>` block (leaving `""` after stripping) and a `<think>` that is never closed (so the
paired regex misses and raw reasoning ships). The same function is copied verbatim into
`app/api/cron/market-scan/route.ts`, deliberately: a route module is an HTTP entry point, not a
library, and importing one route from another drags a second `export async function GET` into
the module graph. The copies must stay identical.

The digest also reads `reports/market/index.json` for new core requisitions, under an 8 s budget
(`MARKET_READ_MS`); every failure there renders as nothing at all.

---

## 7. The review scheduler

`lib/review.ts` - pure functions, no React and no storage, so the interval behaviour can be
tested without a browser. `app/recall.tsx` is the UI; `reports/review/state.json` via
`/api/review` is the sync layer, with `localStorage` (`lumen-review`) as the local copy that
keeps the strip working when GitHub is unreachable.

```ts
export const LADDER = [1, 7, 21, 60, 150, 240, 330];  // days
export const DAILY_CAP = 5;
export const NEW_PER_DAY = 2;
export const PER_TOPIC = 3;
```

- **Grades move the rung, the clock never does.** `fluent` +1 rung, `halting` repeats the
  current rung, `gone` drops **two** rungs and not to zero - a lapse is not amnesia, and
  resetting to day 1 every time is what makes these systems feel punitive and get abandoned.
- **The top rung repeats rather than growing.** A month-1 topic is still checked roughly
  annually however long the plan runs, with no ladder change when the calendar moves.
- **Two caps, not one, and the split is the whole design.** Simulated over 400 days with every
  prompt eligible, a single combined cap bound on 386 days and left 547 of 700 prompts untouched
  - the queue never drains because reviews compete with an endless intake. Reviews run first;
  new cards fill only what is left.
- **`PER_TOPIC = 3`.** The bank holds 1,710 cards; at any sane daily rate that is not coverable,
  so scheduling all of it guarantees most of it is never seen. Three per topic is ~357 cards,
  which converges. The rest are still in the syllabus, where they read as an interview-prep list.
- **The backlog count is never rendered**, and you must write before you can reveal. Seeing "37
  due" is what kills these systems; recognition is the illusion that makes rereading feel
  productive.
- Only topics marked `In progress` or `Done` enter the schedule (`startedTopics` in
  `app/(app)/layout.tsx`). `retention()` counts a card matured at rung ≥ 3, i.e. a 60-day interval.

---

## 8. Environment variables

Read from `process.env` across `app/`, `lib/`, `mcp/` and `proxy.ts`. The list is meant to be
exhaustive, so regenerate it rather than trusting it - a variable added to the code and not to
this table is invisible exactly when someone is deploying:

```bash
grep -rhoE "process\.env\.[A-Z_]+" app lib mcp proxy.ts | sort -u
```

That returns 23 names: the 22 in the table, plus `VERCEL_OIDC_TOKEN`, whose only occurrence is
inside a comment and which is discussed after it. The right-hand column is what actually happens
when the variable is absent - every one of these degrades rather than crashes, except where
noted.

| variable | where | absent ⇒ |
|---|---|---|
| `LUMEN_PASSWORD` | `proxy.ts`, `/api/auth/login`, `lib/auth.ts` | the password gate is off and pages are public; `/api/cron/*` still 401s on `CRON_SECRET`. Login returns 503. |
| `LUMEN_USERNAME` | `proxy.ts`, `/api/auth/login` | defaults to `rasul` |
| `LUMEN_INTERNAL_API_KEY` | `proxy.ts`, `mcp/server.js` | the MCP server cannot bypass the gate for `/api/ask`; `ask_lumen` falls back to calling MiniMax directly |
| `LUMEN_ASK_URL` | `mcp/server.js` | same fallback - the direct path, which is why `marketContext()` is duplicated there |
| `MINIMAX_API_KEY` | `/api/ask`, both crons, `mcp/server.js` | `/api/ask` returns 503; the digest sends without its framing line; the weekly email sends deterministic-only; `insight.quaere` is stored as `null` |
| `GITHUB_TOKEN` | `lib/market/store.ts`, `/api/progress`, `/api/review`, `/api/ask`, `mcp/server.js` | the market scan aborts with 503 before fetching anything; `/api/market` returns `synced:false`; `/api/progress` 502s; the review strip runs local-only; Ask answers still return but are not saved; every GitHub-backed MCP tool errors |
| `GITHUB_REPO` | same | defaults to `rasulshaikh/lumen-fde` |
| `GITHUB_BRANCH` | same | defaults to `main` |
| `CRON_SECRET` | both cron routes | **both crons return 401** - nothing scans, nothing sends |
| `RESEND_API_KEY` | both crons | the digest returns 503; the Monday market email is skipped with a reason |
| `RESEND_FROM_EMAIL` | both crons | same |
| `DIGEST_TO_EMAIL` | daily-digest, market-scan | the digest defaults to `shaikhrasul02@gmail.com`; the market email has no recipient unless `MARKET_TO_EMAIL` is set |
| `MARKET_TO_EMAIL` | market-scan only | falls back to `DIGEST_TO_EMAIL`. **Not in `.env.example`.** Read with `\|\|` and not `??`, because an empty string set in a dashboard is absent in every way that matters and `??` would hand Resend a `""` recipient |
| `SCAN_DEADLINE_MS` | market-scan | defaults to 220,000 - correct for a 300 s function, too long for a 60 s one |
| `MCP_API_KEY` | `mcp/server.js` | **every request to `/mcp` gets `503 "MCP_API_KEY is not configured"`** - `authError()` refuses before dispatch, so the server is hard-down rather than exposed. `/healthz` still answers 200, which is what makes this look like a working service serving nothing |
| `PUBLIC_MCP_URL` | `mcp/server.js` | `get_connection_map` reports `https://lumen-fde.onrender.com/mcp` |
| `LUMEN_DASHBOARD_URL` | `mcp/server.js` | `get_connection_map` reports `https://lumen-fde.vercel.app`. **Not in `.env.example`**, same condition as `MARKET_TO_EMAIL` above |
| `PORT` | `mcp/server.js` | defaults to 10000 (Render sets it) |
| `SURFSENSE_API_KEY`, `SURFSENSE_WORKSPACE_ID` | `mcp/server.js`, `lib/external/brief.ts` (so `/api/external-brief` and, through it, Quaere's outside context) | `semantic_search` falls back to GitHub code search over this repo; `/api/external-brief` 503s, no brief is ever written, and `externalContext` contributes nothing - Quaere answers from the repo alone |
| `SURFSENSE_API_URL` | `mcp/server.js`, `lib/external/brief.ts` | defaults to `https://api.surfsense.com` |
| `NODE_ENV` | `/api/auth/login` | the session cookie's `secure` flag is set only in production |

One entry in `.env.example` is read by nothing in `app/`, `lib/`, `mcp/` or `proxy.ts`:
`RENDER_API_KEY`.

`VERCEL_OIDC_TOKEN` runs the other way - the Sandbox needs it locally (`vercel env pull`; it
expires every 12 hours) and it is automatic on Vercel, but it is neither in `.env.example` nor
read by the code. `app/api/sandbox/route.ts` deliberately does **not** pre-flight it: the SDK
also accepts team/project/token credentials, so guessing the credential mechanism would invent
a failure mode the SDK does not have and 503 a working deployment. The route translates the
SDK's own auth failure into a hint instead.

---

## 9. Build, test, deploy

```bash
npm run dev            # next dev
npm run build          # next build - this is what CI runs
npm run test:market    # npx tsx lib/market/benchmark.test.mts
npm run test:surfacing # npx tsx lib/market/surfacing.test.mts
npm run test:insight   # npx tsx lib/market/insight.test.mts
npm run test:review    # npx tsx lib/review.test.mts - the scheduler simulation
python3 scripts/verify-docs.py        # docs/platform/*.md against the repo
python3 scripts/build-curriculum.py   # after ANY edit under data/curriculum/
```

- **4 test files, 4 npm scripts** - 3 under `lib/market/` plus `lib/review.test.mts`, which
  used to have no script and be run by hand.
- `.github/workflows/ci.yml` runs `npm ci && npm run build` on Node 22 for pushes to `main` and
  for pull requests, **then all four suites and `scripts/verify-docs.py`**. Each suite calls
  `process.exit(fails ? 1 : 0)`, so a failure fails the job with no reporter attached, and doc
  drift fails the build rather than waiting for someone to notice. The suites were unenforced
  until that landed - `next build` type-checks and executes no assertion, so every behavioural
  claim in them held only while someone remembered to run them, and a scheduler defect reached
  `main` through the gap.
- Vercel builds from `next.config.ts` (`reactStrictMode: true`) with the framework and crons
  from `vercel.json`. Render builds `mcp/` from `mcp/render.yaml`.
- `scripts/` also holds `build-icons.mjs`, `canonicalise_curriculum_urls.py`,
  `index-library.py`, `rebaseline-hours.py`, `renumber-months.py`, `verify-docs.py`,
  `verify_curriculum_urls.py`.
  `rebaseline-hours.py` and `renumber-months.py` are the two that must write the per-topic source
  files and then be followed by `build-curriculum.py` - see §4.2.

---

## 10. Number index

Every figure asserted above, and the file it was read from.

Rows carrying a `verify:` anchor are checked by `scripts/verify-docs.py` on every CI run, so
they cannot drift silently - the anchor is an HTML comment in the source of this table, invisible
when rendered. Rows without one are either not anchorable by that script or live scan output,
which it deliberately refuses to anchor; those are dated instead and are a reading, not a
standing fact. The market block at the bottom is all of the second kind.

| claim | value | source |
|---|---|---|
| plan rows | 119 <!-- verify:rows=119 --> | `data/workbook.json` `Plan` |
| active rows (status ≠ Skipped) | 117 <!-- verify:active_rows=117 --> | `data/workbook.json` `Plan` col 15 |
| skipped rows / hours | 2 <!-- verify:skipped_rows=2 --> / 26h | `data/workbook.json` `Plan` cols 15, 13 |
| active hours | 1,588 <!-- verify:hours=1588 --> | `data/workbook.json` `Plan` col 13 |
| total hours incl. skipped | 1,614 | `data/workbook.json` `Plan` col 13 |
| months | 1-23 (23 distinct) <!-- verify:months=23 --> | `data/workbook.json` `Plan` col 1 |
| tracks | 15 | `data/workbook.json` `Plan` col 0 |
| mock rows / total reps | 11 / 57 | `data/workbook.json` `Mocks` |
| roadmap rows | 16 | `data/workbook.json` `Roadmaps` |
| comp-reality rows | 6 | `data/workbook.json` `CompReality` |
| curriculum source files | 119 <!-- verify:curriculum_files=119 --> | `data/curriculum/*.json` |
| subtopics | 2,236 <!-- verify:subtopics=2236 --> | `data/curriculum/*.json` and `data/curriculum.json` |
| recall prompts | 1,710 <!-- verify:prompts=1710 --> (835 recall + 875 drill) | `data/recall-bank.json` |
| books / pages / repos | 16 / 10,521 / 2 | `data/library-context.json`, `data/repository-context.json` |
| boards configured / enabled | 32 <!-- verify:boards=32 --> / 27 <!-- verify:enabled_boards=27 --> | `data/market-sources.json` |
| `BOARD_COUNT` | 27 | `lib/market/benchmark.ts` |
| skills / gaps / over-invested | 34 <!-- verify:skills=34 --> / 13 <!-- verify:gaps=13 --> / 3 | `data/market-skill-map.json` |
| tabs | 8 <!-- verify:tabs=8 --> | `components/Nav.tsx` `NAV` |
| API routes | 13 <!-- verify:api_routes=13 --> | `app/api/**/route.ts` |
| crons | 2 <!-- verify:crons=2 --> (03:00, 03:30 UTC) | `vercel.json` |
| MCP tools | 18 <!-- verify:mcp_tools=18 --> | `mcp/server.js` `tools` |
| review ladder | `[1, 7, 21, 60, 150, 240, 330]` - 7 rungs <!-- verify:ladder_rungs=7 --> | `lib/review.ts` |
| daily cap / new per day / per topic | 5 / 2 / 3 | `lib/review.ts` |
| session TTL | 14 days | `lib/auth.ts` |
| login rate limit | 8 per 10 min | `lib/auth.ts` |
| MCP rate limit / body cap | 30 per 60 s / 128 KB | `mcp/server.js` |
| test files / npm test scripts | 4 / 4 - 3 under `lib/market/` <!-- verify:market_tests=3 --> plus `lib/review.test.mts` | `lib/**/*.test.mts`, `package.json` |

The rest is the 2026-09-08 scan, held to the same rule as §5.7: dated, not anchored, and
superseded by the next 03:00 UTC run. Read the report file before quoting any of it.

| claim | value on 2026-09-08 | source |
|---|---|---|
| core reqs / companies | 189 / 23 | `reports/market/benchmark.json` |
| adjacent / companies / leadership | 206 / 17 / 21 | `reports/market/benchmark.json` `adjacentCount` |
| adjacent, index dedupe | 208 - a different denominator, see §5.3 | `reports/market/index.json` |
| stored req records | 750 (382 core, 342 adjacent, 26 leadership) | `reports/market/index.json` |
| boards ok | 27 of 27 | `reports/market/benchmark.json` |
| corpus size | 46.96 MB decompressed | `reports/market/index.json` `boards[].bytes` |
| readiness | 0% - 0 of 490 share points, 0 of 34 skills | `reports/market/insight.json` |
| reachable today | 7 of 189 (4%), 3 companies | `reports/market/insight.json` |
| takeable without leaving India | 11 of 189 (6%), 5 companies | `reports/market/insight.json` |
| tier split | 4 / 4 / 3 / 147 / 31 | `reports/market/insight.json` `reachability.tiers` |
| segments | 5 | `reports/market/insight.json` |
| over-investment | 335h, 3 tracks, 26 rows, 21% | `reports/market/benchmark.json` `overInvestedTotal` |
| trend points recorded | 2 | `reports/market/trend.json` |
