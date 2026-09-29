# Lumen platform audit - 2026-09-08

Six lenses; four returned findings. Two agents and the synthesis returned bare acknowledgements, so this is the raw lens output rather than a ranked list. Verified independently: the 875 unreachable drills and the digest pinned to plan row 1.


# ===== DEAD =====

# DEAD AND UNREACHABLE - Lumen audit

Repo: `/Users/rasul/senior-fde-dashboard` @ `de964e5`. Method: `tsc --noEmit --noUnusedLocals --noUnusedParameters`, a per-export cross-reference over `app lib mcp proxy.ts scripts`, node passes over each `data/*.json` and `reports/*`, and a CSS-selector-vs-JSX diff. No files edited.

## Not dead (so it is not re-audited)
- **All 10 tabs render**: `app/page.tsx:55` `TABS` vs branches `:606-619`. Every component in the file is mounted.
- **All 10 API routes have callers**: `/api/auth/login`←`login/form.tsx:18`; `/api/sandbox`←`terminal.tsx:74,118`; `/api/review`←`recall.tsx:41,81`; `/api/recall`←`recall.tsx:64`; `/api/market`←`page.tsx:170`; `/api/progress`←`page.tsx:493,524`; `/api/curriculum`←`page.tsx:498,508`; `/api/ask`←`page.tsx:599`+`mcp/server.js:121`; both crons←`vercel.json`.
- **All 14 MCP tools wired**: declared `mcp/server.js:13-28`, handled `:155-170`.
- **`data/curriculum/*.json` maps 1:1**: 119 files ↔ 119 topics ↔ 2,236 subtopics, 0 orphans either direction.
- **The "119 of 119 stale month/hours" landmine in `docs/research/2026-09-07-visual-ml-decision.md:146` is already fixed** - I re-ran `build-curriculum.py`'s own drift rule: **0 of 119**. Those docs are stale, not the data.
- `reports/market/history/` is write-only *on purpose*, documented `app/api/market/route.ts:11-12`. `lib/market/skills.ts:208`'s unused `company` param is deliberate per its docstring `:204-206`. `data/source.xlsx` kept deliberately per `README.md:15`. `sharp` is absent from `package.json` but present in `package-lock.json` as an optional dep of `next`, so `build-icons.mjs` runs after `npm ci`.

## 1. UNREACHABLE - 875 of 1,710 recall prompts can never be scheduled
`build-curriculum.py:64-67` appends all `interviewQuestions` (`recall`) before all `failureModes` (`drill`); `lib/review.ts:70-78` `eligible()` takes the first `PER_TOPIC = 3` per topic **in array order**; min recall per topic is 7.
```
total prompts 1710 · by kind { recall: 835, drill: 875 }
eligible 357 { recall: 357 } · drills within first3: 0
```
→ `app/recall.tsx:114` and `:117` are unreachable branches; `/api/recall` (`route.ts:19`) ships ~50% never-renderable prompts. **Not safe to delete the branch** - the defect is the ordering.

## 2. UNREACHABLE - the daily digest emails the same topic forever
`daily-digest/route.ts:45` reads `workbook.json` Plan col 15, a static committed file: `{ 'Not started': 117, Skipped: 2 }` → `next` is always `"Shell mastery and scripting"` (row 0). `grep -rn "workbook.json" app lib mcp` finds imports only; progress lands in `localStorage` / `reports/progress/*.md`, which the digest never reads. Only the recall question rotates (`:51`), within that one topic.

## 3. DEAD - `new-india-remote` flags render nowhere
`tsc` → `app/page.tsx(276,9): TS6133: 'indiaFlags' is declared but its value is never read.` Producer `lib/market/insight.ts:885-894` (its comment: *"the one market event worth an interruption"*); `page.tsx:277` excludes the kind from `otherFlags`, which *is* rendered `:307`; absent from `marketContext()` (`ask/route.ts:126`, `mcp/server.js:83`) and the digest. `page.tsx:340-342` explains the regression. Deleting line 276 is safe; removing production breaks `insight.test.mts:401-403`.

## 4. DEAD - unused import bundles `lesson-context.json` into the ask route
`tsc` → `app/api/ask/route.ts(5,8): TS6133: 'lesson' ... never read.` `grep -n "lesson"` on that file returns exactly the import. **Safe to delete.** Side effect: `docs/lumen-fde-architecture.md:145` claims Quaere gets this context - only `mcp/server.js:127,157` actually use it.

## 5. DEAD - `scripts/add-gap-rows.py`, a spent one-shot and a hazard
Docstring says one-shot; all three rows present (Plan 35, 42, 64); guard `:78` prints `skip (already present)` then `:83` still rewrites 124 KB. Zero references. **Delete it** - `INSERTIONS` `:57-61` inserts without renumbering, and `data/curriculum/NN.json` is keyed by plan-row index, so a future run shifts every syllabus off its topic. Its Hours (8/8/6) are pre-rebaseline.

## 6. DEAD - dead loop in `scripts/index-library.py:29-30`
Spawns a `pdfinfo` subprocess per PDF, discards the result; `:34` repeats the loop for real. **Safe to delete - halves runtime.** Script itself has zero references and hardcodes `~/Downloads/{ML Books, Books ML}` `:6-7`; its output *is* live at `ask/route.ts:219`.

## 7. DEAD DATA - `workbook.json` columns nothing reads
- **Col 16 "Notes"**: `row-length histogram { '16': 119, '17': 1 }` - header-only phantom.
- **Cols 6/9/12 ("Read/Watch/Do cost")**: populated on all 119 rows (`'Free'`, `'Paid (~$45)'`, …), read by nothing. `page.tsx` uses `4,5,7,8,10,11,13,14,15`; `mcp/server.js:155` maps `{label,url}`; `ask/route.ts:52` uses `0,1,2,13,15`. **357 cells reaching no surface.** Better surfaced than deleted.
- **`benchmark.json` `leadershipCount` / `adjacentCompanyCount`** - `benchmark.ts:126-127,469-470`, read by nothing.

## 8. WRITE-ONLY stores
- **`reports/audit/`** - `mcp/server.js:41` writes; the only surfacing tool `get_audit_log` `:168` returns the **in-process** array `:10`, empty after every Render free-tier cold start (which `:169` itself admits).
- **`reports/notes/`** - `save_study_note` `:162` writes; `read_ask_report` `:161` hard-rejects paths outside `reports/asks/`, and there is no `list_notes`.

## 9. DEAD CSS - leftovers of the removed static quiz
`.quiz-options` (`globals.css:52,55,76`), `.quiz-option.correct` / `.wrong` (`:52`), `.quiz-option.muted-option` (`:52,257`) - no emitter; only `quiz-option` (`recall.tsx:143-144`) and `quiz-action` exist. **All safe to delete.** Adjacent: CSS defines `.prob-0`…`.prob-3` but `page.tsx:619` emits `prob-${i}` over 6 rows, so `prob-4`/`prob-5` are unstyled.

## 10. ORPHANED TEST - `lib/review.test.mts` has no runner
`package.json` has `test:market`/`test:surfacing`/`test:insight`, no `test:review`; `.github/workflows/ci.yml` runs only `npm ci` + `npm run build`, so **none of the four suites (1,387 lines) run in CI**. I ran it: `all assertions passed`.

## 11. LOW - exports with zero importers, stale doc pointer
`lib/review.ts` `LADDER:20`, `DAILY_CAP:30`, `NEW_PER_DAY:31`, `today:42` (they appear in `review.test.mts:7-8` only as comment prose, not its import list `:11`); `lib/market/store.ts` `PROGRESS_DIR:182`, `MISSING_DAYS:249`, `MAX_REQS:251`, `TREND_POINTS:253`; `benchmark.ts:63` → `TS6196: 'SkillDef' is declared but never used`. `README.md:13` points at `scripts/verify-curriculum-urls.sh`, which **does not exist** (real file: `verify_curriculum_urls.py`).

## Repo state note
`scripts/verify-docs.py` (untracked, mtime 23:35, references a nonexistent `docs/platform/*.md`) appeared *during* this audit, as did an edit to `next-env.d.ts` - concurrent in-flight work, excluded.

## Ranked
1. **§1** - 875 drill prompts (51% of the bank) unschedulable.
2. **§2** - the daily email pinned to plan row 1 for 23 months.
3. **§3** - `new-india-remote` renders on zero surfaces.

# ===== BROKEN =====

# Lumen runtime audit - 2026-09-07

**How I ran it.** `LUMEN_PASSWORD= npx next dev -p 3411` (Next 16.3.4, Turbopack), then drove the real UI in a browser (all 10 tabs clicked, console + network read on each), curled all 10 API routes, restarted with `LUMEN_PASSWORD=testpass123` to exercise the gate, ran `npx tsc --noEmit`, `npx next build`, all 4 test suites, and `scripts/verify_curriculum_urls.py`. I edited nothing; `git status` is unchanged (the untracked `docs/platform/` + `scripts/verify-docs.py` were already there). I intercepted the two GitHub-writing calls (`POST /api/progress`, `PUT /api/review`) client-side so the audit did not commit to your repo.

---

## What actually works (verified, not assumed)

All 10 tabs render with real data. **Zero console errors** across every tab. Zero server errors in the dev log. `tsc --noEmit` clean. `next build` clean (18 routes). `review`, `market`, `insight`, `surfacing` suites all pass. Auth gate correct (`/` → 307 `/login`, `/api/*` → 401 JSON, `/api/cron/*` falls through to its own Bearer check, `/icon.svg` + `/favicon.ico` + `/opengraph-image.png` public, wrong password → 401, cookie `HttpOnly; SameSite=lax`, `secure` in prod). Sandbox works end-to-end (`uname -a && python3 -V && pwd` → `Linux ... 6.18.40 / Python 3.14.4 / /vercel`). Recall strip works end-to-end (card → write → reveal → grade → `{"q1-0":{"rung":1,"due":"2026-09-14","seen":1,"lastGrade":"fluent"}}`). Market → Plan deep link works (clicked "row 28 M7", landed on Plan with that syllabus expanded). Curriculum lazy-load works (`?summary=1` then `?i=0`). All 11 "Takeable from Pune" role links return 200. All 27 job boards returned `ok:true` with non-zero results. `recall-bank.json`: 1,710 prompts, 1,710 distinct keys - no collisions.

---

## Broken

### 1. The daily email computes your progress from a column nothing ever writes - CRITICAL

`app/api/cron/daily-digest/route.ts:39-46` - `digest()` reads status from `r[15]`, i.e. `data/workbook.json` → `Plan` column 15. That column holds **117 "Not started" + 2 "Skipped"** and is only ever rewritten by `scripts/rebaseline-hours.py` / `scripts/add-gap-rows.py`. The app never writes it: the dashboard writes `localStorage["lumen-statuses"]` and appends `reports/progress/*.md`.

`lib/market/insight.ts:17` states the correct rule for its own subsystem - *"Readiness reads PROGRESS EVENTS, never workbook column 15."* The digest does exactly what that comment forbids.

**Repro** (replayed `digest()`'s logic over `data/workbook.json`):
```
TODAY = Shell mastery and scripting
pace  = 0 of 117 topics done · 0.0h of 1588.0h · 1588.0h left, about 99.2 weeks at 16h/week
```
That email is byte-identical every morning for 23 months regardless of what you finish. It is the single highest-value thing on the platform and it is wired to a constant.

Same function, `:70` and `:180`: `weeksLeft` hardcodes `/ 16` and the copy hardcodes `"at 16h/week"`, while `app/page.tsx:459-461` makes weekly hours a user-editable, persisted value. Two sources of truth for the same number.

### 2. `MINIMAX_API_KEY=""` - every model surface is silently dead

`.env.local` sets `MINIMAX_API_KEY` to a literal empty string (2 chars, `""`). Next parses that as `""`, which is falsy, so:

- `POST /api/ask` → **503** `{"error":"MiniMax is not configured yet..."}`. Observed in the UI: clicked the Quaere FAB → FAQ #1 → `Lumen | MiniMax is not configured yet.`
- `app/api/cron/market-scan/route.ts:234` `modelParagraph` returns `""` immediately → no Quaere reading, no weekly framing.
- `app/api/cron/daily-digest/route.ts:158` → no framing paragraph.

**This has already reached committed data.** `reports/market/insight.json` has `"quaere": null` at HEAD, and at every one of the 5 prior scan commits I checked (`761d450`, `06d5336`, `5d966bc`, `89d6750`, `8780bce`). `/api/market` serves that file, so the Market tab's "Quaere's reading" block - the one documented at `app/page.tsx:437-441` - **has never rendered, not once**. I confirmed the section is absent in the live DOM.

I cannot see the Vercel env, so I can't tell you whether prod also has a blank key - but every scan that produced your committed market reports ran with no key.

### 3. `scripts/verify_curriculum_urls.py` reports live URLs as dead

Two classifier bugs, both reproduced directly against the script's own `classify()`:

**308 → "dead".** `scripts/verify_curriculum_urls.py:53-55` treats 308 as a redirect, then re-fetches with `follow=True`. But this machine runs Python 3.9.6, whose `urllib.request.HTTPRedirectHandler` has **no `http_error_308`** (`hasattr(...,'http_error_308') == False`). The follow returns 308 again, the ternary sees "not 200", and it returns `("dead", 308)`.
```
classify("https://modelcontextprotocol.io/") -> ('dead', 308)
curl -L  "https://modelcontextprotocol.io/" -> 200
```

**202 → "dead".** Line 62 only accepts `(200, 206)`; line 72's fallback returns `("dead", code)`. The **single "dead" URL in tonight's curriculum run is a false positive** from exactly this: eur-lex answered 202 mid-run, and returns 200 on re-check.

### 4. The verifier never looks at the URLs on the Plan and Roadmaps tabs

`scripts/verify_curriculum_urls.py:77-82` globs `data/curriculum/*.json` only. It never touches the **296 distinct Read/Watch/Do URLs in `data/workbook.json`** - the three vetted resources rendered on every Plan row, on Overview's "Open reading", and in the "Start with these three" strip - nor the **15 Roadmaps URLs**. That is 311 unchecked links on the two tabs a user actually clicks from.

### 5. Roadmaps card 12 is a link to `/null`

`app/page.tsx:617` renders roadmap cards with a raw `<a href={String(r[1])}>` instead of the guarded `Link` helper at `app/page.tsx:31` (which renders a non-link span when the href isn't `http`). `workbook.Roadmaps` row 12 ("prior GTM lab FDE Skills Matrix (your upload)") has `URL = null`.

Observed in the live DOM: `href="null"` → resolves to `http://localhost:3411/null` → **404**. The card is visually indistinguishable from the 15 that work.

### 6. Market zone 1 header says 27, the table shows 26

`app/page.tsx:304` renders the meta as `insight.readiness.marginal.length` (= 27), but `:316` filters rows through `entry.skills.some(skill => skill.pct > 0)`, which drops one. Row 80 ("Async engagement communication…", its only skill at 0%) vanishes with no explanation. Observed: meta `"27 incomplete rows ranked by readiness gain"`, `.mkt-cols-row` count 26.

### 7. Dead code that the docs present as a feature

- `app/api/ask/route.ts:5` imports `lesson from "@/data/lesson-context.json"` and **never references it**. The architecture doc (§4) lists lesson context as an Ask input; it is not in the prompt.
- `mcp/server.js:149-150` - `score_assessment("quick_check")` scores against a hardcoded key `[1,2,1,2]` for four questions that **exist nowhere in the codebase**. The MCQ quiz was replaced by `RecallStrip` (Gone/Halting/Fluent). `docs/lumen-fde-architecture.md:191` still documents it and gives a *different* key (`1B · 2C · 3A · 4D`). `app/globals.css` still carries dead `.quiz-option.correct` / `.wrong` rules.

### 8. Stale constant inside a model prompt

`app/api/cron/market-scan/route.ts:311` tells the model *"at month one of a twenty-month plan"*. The plan is **23 months / 1,588h**, and `lib/market/insight.ts:101` in the same subsystem says *"Over a 23-month plan"*. The two disagree and the stale one is the one that ships to MiniMax. `"month one"` is also hardcoded - in month 6 it will still say month one.

### 9. `docs/lumen-fde-architecture.md` - stale, as you suspected, and concretely so

- Line 38: *"Exposed product views: Overview, Plan, Mocks, Roadmaps, Library, Assessments, and Comp reality"* - **7 listed, 10 shipped** (missing Curriculum, Sandbox, Market).
- Line 80 + §5 list **13 MCP tools**; `mcp/server.js:14-27` serves **14** (`get_syllabus` is missing from the doc). Your brief says the doc documents 14 - it documents 13.
- §6 documents a Quick Check UI that no longer exists (see #7).
- §4's data table omits `curriculum.json`, `recall-bank.json`, `market-sources.json`, `market-skill-map.json`, `reports/market/*`, `reports/review/state.json`.

---

## URL rot - the actual numbers

**`data/curriculum/*.json` - 2,236 subtopics, all 2,236 with an `http` resource URL, deduped to 1,860 distinct** (376 are repeats; `sre.google/sre-book/service-level-objectives/` is used 11×). Full run, `.tmp/url-check.tsv`:

| status | count |
|---|---|
| live | 1,811 |
| redirected (resolve 200) | 33 |
| blocked (403/429 bot-gate) | 15 |
| dead | **1 - and it is a false positive** |

The one "dead" is `https://eur-lex.europa.eu/eli/reg/2016/679/oj` (GDPR, used by `71.json`, `77.json`). It returned 202 during the run; `curl` gets a clean 200. **Zero curriculum resource URLs are actually dead.** The 15 blocked are all genuine bot-gates on live pages (hhs.gov, sec.gov, dol.gov, gao.gov, fbi.gov, Medium, netflixtechblog, exercism, ACM Queue, HN).

This is not your biggest rot risk. It is in very good shape.

**The 311 unchecked workbook + roadmap URLs** (I ran them through the same `classify()`): **283 live, 15 redirected, 5 blocked, 8 "dead"**. All 8 "dead" are the 308/301 misclassification - every one returns 200 under `curl -L`:

| URL | where | final |
|---|---|---|
| `linuxjourney.com/` | Plan row 2 Read | 301 → `labex.io/linuxjourney` - content preserved, page says so |
| `cloudskillsboost.google/` | Plan row 19 Do | 308 → `skills.google` (rebrand) |
| `deeplearning.ai/short-courses/` | Plan rows 51, 53, 54, 66 Watch + Roadmaps 16 | 308 → `/courses` |
| `modelcontextprotocol.io/` | Plan row 52 Read + Do | 308 → `/docs/2026-07-28/getting-started/intro` |
| `promptfoo.dev/docs/intro` | Plan row 59 Do | 308 → trailing slash |
| `docs.evidentlyai.com/` | Plan row 63 Do | 308 → `/introduction` |
| `gandalf.lakera.ai/` | Plan row 56 Do | 308 → **`play.lakera.ai/agent-breaker`** - a different product from the Gandalf prompt-injection game the row asks for. Worth a human eyeball. |

Also: `workbook.Plan` rows **90, 91, 92** have a `null` Watch URL (label `"n/a"`). Those render correctly as non-links via the `Link` guard - only the Roadmaps tab lacks that guard (#5).

---

## Not broken - checked and cleared

- **`metadataBase` build warning is a non-issue in prod.** `next build` warns and falls back to `localhost:3000`, but `https://lumenfde.com/login` serves `og:image = https://lumenfde.com/opengraph-image.png`, and that asset returns 200 unauthenticated (the `publicAsset` regex in `proxy.ts:10` catches it).
- **Market-scan cron has not "failed to run"** - `app/api/cron/market-scan/route.ts` was first committed today at 12:05 IST (06:35 UTC), after the 03:00 UTC window. It has never had a scheduled slot. All 7 of today's scans were manual.
- **Trend sparkline renders nothing** - correct behaviour, not a bug: one scan recorded, `app/page.tsx:105` prints the honest sentence instead of a fake flat line.
- **`GITHUB_REPO` default** `rasulshaikh/lumen-fde` matches `git remote`. `GITHUB_REPO`/`GITHUB_BRANCH`/`MCP_API_KEY` are absent from `.env.local` and every default is correct.
- **Live MCP on Render is up** - `get_connection_map` and `get_progress_analytics` both answered.
- **React StrictMode double-fetches** `/api/review` and `/api/progress` in dev only. Expected.

---

## Fix order

1. `daily-digest` `digest()` → read `reports/progress/` (reuse the `PROGRESS_DIR` reader in `lib/market/store.ts:182,215` that `insight.ts` already uses), and take weekly hours from one place.
2. Set a real `MINIMAX_API_KEY` in `.env.local` **and** confirm it in Vercel; re-run the scan so `insight.quaere` is non-null.
3. `verify_curriculum_urls.py`: accept `2xx` at line 62, add a `follow=True` fallback that handles 308 (or shell out to `curl -sIL`), and extend the glob to `workbook.json` cols 5/8/11 + `Roadmaps` col 1.
4. `app/page.tsx:617` → use the `Link` helper.
5. `market-scan:311` → derive months and current month from the workbook instead of the strings "twenty-month plan" / "month one".
6. `app/page.tsx:304` → count the filtered list, not `marginal.length`.
7. Delete the `lesson` import and the `quick_check` branch (or rebuild the quiz); refresh §4/§5/§6 of the architecture doc.

# ===== MISSING =====

Lumen measures the market precisely, schedules study rigorously, and then stops at the exact point where preparation becomes a candidacy. Three loops are open, each verified against a file.

**1. 119 deliverables, no build record.** Every Plan row carries one (`data/workbook.json` col 14, zero empty). Read in exactly three places - `app/page.tsx:69`, `app/api/cron/daily-digest/route.ts:149`, `mcp/server.js:155` - written in zero. No built-flag, no artifact URL, no aggregate view. The hero at `app/page.tsx:604` reads "Build proof, not just knowledge." There is nowhere to put proof.

**2. 57 mocks, no score field.** The Mocks sheet's own trailing row says "Edit only 'Done so far'", but `app/page.tsx:616` renders `String(r[6] || 0)` with no input and no POST - changing it means editing JSON and redeploying. All 12 rows read `0.0`. Pass bars like "4/5 on the Hello Interview rubric three times running" have no field to land in. Worse: `score_assessment` (`mcp/server.js:148-153`) computes a weighted number and returns it without calling `github()` or `durableAudit()`, unlike `record_progress` at line 163 - every assessment score is discarded on return. Its `quick_check` branch grades key `[1,2,1,2]` against a quiz deleted when `recall.tsx` replaced it; only dead CSS survives at `globals.css:52`.

**3. 11 reachable requisitions, no applied-state.** `reports/market/insight.json` names them (5 Databricks India-remote FDE, 2 Anthropic Applied AI Architect Bangalore, plus Observe AI, Cresta, LangChain), rendered as clickable cards at `app/page.tsx:344-349`. `grep -rni "applied|application|resume"` returns only `application/json` headers. The platform is a good instrument pointed at a market it never touches.

On `lib/review.ts`: it **is** surfaced daily - `<RecallStrip />` at `app/page.tsx:605`, above the tabs on every view - and the design is right. But it is showing zero cards. `startedTopics` (`page.tsx:556`) requires `In progress`/`Done`; server truth is `Not started ×117, Skipped ×2`, the newest progress event is `...-shell-mastery-and-scripting-not-started.md`, and `git log --all -- reports/review` shows two commits: one test write, one revert of it.

Ranked by (odds improved)/(effort):

- **T0 - hours, not days.** The daily email is frozen forever on plan row 1: `daily-digest/route.ts:40-45` reads the workbook baseline `r[15]`, which nothing ever writes. `lib/market/insight.ts:470` already has the tested matcher. ~20 lines. It is the only surface that reaches him when he does not open the site.
- **T2 - half a day, best ratio.** Application ledger, copying the 32-line `/api/progress` pattern. Every other item makes him a better candidate; this is the only one that produces outcomes, and one real rejection reason re-ranks 119 rows better than 95 job descriptions do. Those reqs will not be open in month 20.
- **T1 - 1 to 1.5 days, highest odds.** Proof register plus a public `/proof` route, which needs a `proxy.ts:14` exemption and a deliberately separate data shape. Closes GAP-3, the taxonomy's highest-frequency finding (12/15 JDs, weakest plan match), already encoded as `benchmark.json gaps[0].id == "pattern-codification"`. See the sequencing caveat first: the top-share deliverables land M7-M17, and row 57 - the only one specified as public - is month 13.
- **T3 - half a day.** Mock results as events.

Rejected: resume builder, streaks/XP (`lib/review.ts:50-57` argues against it, correctly), closing the ML gaps (all three taxonomy docs reach the inverse conclusion - Track M vocabulary scores 0/95), an hours tracker.

# ===== OPS =====

# Lumen - operations and failure modes

## Ground truth established first

| Fact | How verified |
|---|---|
| Vercel plan is **Hobby** | `GET /v2/teams/team_QVRv5qRfUJP5a91JDvUwxV2l` → `billing.plan: "hobby"` |
| Functions get **300 s**, not 60 s | `GET /v9/projects/prj_9s3G9V3uYF2J3AQkbimUbaUPbT5M` → `defaultResourceConfig: {fluid: true, functionDefaultTimeout: 300}`; docs: Hobby default **and** maximum = 300 s with Fluid compute (on by default) |
| Hobby cron precision is **±59 min**, once/day, **no retry on failure** | vercel.com/docs/cron-jobs/usage-and-pricing, /manage-cron-jobs: *"Vercel will not retry an invocation if a cron job fails."* |
| Hobby runtime log retention is **1 hour** | vercel.com/docs/logs/runtime limits table |
| A full 27-board cycle takes **9-17 s** steady state, **~66 s** cold | six production runs: `insight.computedAt` (handler start) vs the `index.json` commit time - 9 s, 10 s, 10 s, 9 s, 13 s, 17 s; cold start 09:30:58Z → commit 09:32:04Z = 66 s |
| The market-scan cron **has never fired on schedule** | `git log --diff-filter=A -- app/api/cron/market-scan/route.ts` → added `2026-09-07 12:05 IST` (06:35 UTC). First scheduled run is 2026-09-08 03:xx UTC. All 8 runs in `git log origin/main -- reports/market/` were manual. |

---

## 1. Every env var, where it is read, what absence does

**Set in Vercel (10, all Production/Sensitive - `vercel env ls`):** `CRON_SECRET`, `GITHUB_TOKEN`, `GITHUB_REPO`, `GITHUB_BRANCH`, `LUMEN_PASSWORD`, `LUMEN_INTERNAL_API_KEY`, `RESEND_API_KEY`, `RESEND_FROM_EMAIL`, `DIGEST_TO_EMAIL`, `MINIMAX_API_KEY`.

**Set in Render (11 - `GET api.render.com/v1/services/srv-dadvk8mq1p3s73fcs7sg/env-vars`):** `MCP_API_KEY` (64 ch), `GITHUB_TOKEN` (93 ch), `GITHUB_REPO`, `GITHUB_BRANCH`, `LUMEN_ASK_URL`, `LUMEN_INTERNAL_API_KEY` (64 ch), `MINIMAX_API_KEY` (**11 ch**), `PUBLIC_MCP_URL`, `SURFSENSE_*`.

**In `.env.local` (12):** `CRON_SECRET=""`, `MINIMAX_API_KEY=""`, `RESEND_FROM_EMAIL=""` are literal empty-quoted strings - dotenv strips the quotes, so all three are `""` and falsy.

| Var | Read at | Absent → |
|---|---|---|
| `LUMEN_PASSWORD` | `proxy.ts:13`, `app/api/auth/login/route.ts:6` | **FAIL-OPEN.** `!process.env.LUMEN_PASSWORD` short-circuits to `NextResponse.next()` - the entire dashboard, all 10 API routes, GitHub-token-backed writes included, become public with no login. The only env var whose absence removes a control rather than a feature. |
| `CRON_SECRET` | market-scan:416, digest:134 | Fail-closed 401 on both crons. **Locally it is `""` → both crons 401 every request; neither can be exercised on localhost without editing `.env.local`.** |
| `GITHUB_TOKEN` | `store.ts:121,136,157,213`, `review/route.ts:9,30,44`, `progress/route.ts:5,7`, `ask/route.ts:193`, `mcp/server.js:30` | market-scan: 503 at `route.ts:435` before any board is fetched (correct - 47 MB not spent). digest: `newCoreReqs()` → `NO_MARKET`, email still sends. `/api/market`: 200 + `synced:false` → `page.tsx:299` warns. `/api/review`: local-only. `/api/progress`: 502 both verbs. |
| `GITHUB_REPO` / `GITHUB_BRANCH` | `store.ts:23-24`, three routes, `mcp/server.js:30` | Defaults `rasulshaikh/lumen-fde` / `main`, which match `git remote -v`. Harmless. |
| `SCAN_DEADLINE_MS` | market-scan:48 | **Not set in Vercel** → 220 000. `Number(x) \|\| 220_000` means `"0"` and any garbage also yield 220 000; the knob cannot be turned down to zero. |
| `MINIMAX_API_KEY` | market-scan:234, digest:136, `mcp/server.js:126` | `modelParagraph` returns `""` on the first line; framing paragraph and Quaere reading absent. Everything measured survives. |
| `RESEND_API_KEY` + `RESEND_FROM_EMAIL` | digest:139-140, market-scan:333-334 | digest: **503 before any work** (`route.ts:140`). market-scan: only the Monday email is skipped; scan completes. |
| `DIGEST_TO_EMAIL` | digest:138, market-scan:337 | digest: hardcoded fallback `shaikhrasul02@gmail.com`. market-scan: no fallback → weekly email silently not sent. Asymmetric. |
| `MARKET_TO_EMAIL` | market-scan:337 | **Not set anywhere.** Falls through to `DIGEST_TO_EMAIL`. Working as designed. |
| `LUMEN_USERNAME` | `proxy.ts:15` | **Not set anywhere.** Defaults `"rasul"`. |
| `LUMEN_INTERNAL_API_KEY` | `proxy.ts:14`, `mcp/server.js:120` | Absent on Vercel → MCP's `/api/ask` bypass dies → `askLumen` falls back to the Render MiniMax path, whose key is 11 characters. |
| `MCP_API_KEY` | `mcp/server.js:172` | **FAIL-OPEN**: `if (process.env.MCP_API_KEY && key !== …) return false; return true;` - unset means every request is authorized, and `save_study_note` / `record_progress` commit to the repo with `GITHUB_TOKEN`. It *is* set on Render (64 ch), so latent, not live. |
| `VERCEL_OIDC_TOKEN` | `sandbox/route.ts:58` (comment only - no pre-flight guard, deliberately) | Project OIDC is `{"enabled": true, "issuerMode": "team"}`, so production is fine. **The copy in `.env.local` expired at `2026-09-07T10:58:14Z`** (decoded `exp` claim) - 7 h stale, so the Sandbox tab is broken locally until `vercel env pull`. |

---

## 2. The nightly scan writes to GitHub

### 2a. Token expiry - **degrades, fails safe**
`GITHUB_TOKEN` is a fine-grained PAT (`github_pat_`, 93 ch). On a 401, `readJson` (`store.ts:141`) throws → `{synced:false, error:"Bad credentials"}` → market-scan returns 502 at `route.ts:437` **before fetching a single board**. That ordering is right: the seen-set is never rebuilt from a failed read, so the "420 phantom new roles" scenario the header comment describes cannot happen. Blast radius: one day of freshness, zero corruption, and the digest keeps arriving with an empty market section.

The gap is that expiry is **unmonitored**. `curl -D -` against `/repos/rasulshaikh/lumen-fde` with the local token returns no `GitHub-Authentication-Token-Expiration` header, so that copy is non-expiring - but the Vercel copy is Sensitive and cannot be read back, so **whether the production token expires is currently unknown to anyone**. If it does, the first symptom is a Market tab timestamp that stops advancing.

### 2b. Rate limit - **not the real risk**
Verified `x-ratelimit-limit: 5000`, `remaining: 5000`. A full cycle spends 4 reads + 5 writes + up to 100 `readProgress` GETs. Even 8 manual cycles in a day (what happened on 09-07) is ~900 requests. The exposure is the *secondary* limit: `store.ts:227` and `progress/route.ts:17` both `Promise.all` over `.slice(0, 100)` - exactly 100 simultaneous GitHub requests. Only 2 files exist in `reports/progress` today, so it is cold; it arms itself as the study log grows. Nothing reads `Retry-After` or retries anything.

### 2c. Conflict - **confirmed live, currently losing a file every re-run**

The comment at `market-scan/route.ts:545-558` documents the historical loss of `benchmark.json` to a concurrent branch-ref race and fixes it by serializing the four writes. That fix works. **A second instance of the same class is live and undetected:**

```ts
// market-scan/route.ts:564
const wroteHistory = await writeJson(historyPath(today), benchmark, null);
…
if (!wroteHistory.ok) console.error("[cron/market-scan] history archive not written", …);  // :569
```

`sha: null` is correct only for a path that does not exist. On the second and later full cycles of the same UTC day the path exists, GitHub rejects the PUT, and the failure is logged and swallowed.

Evidence:
- `git log --full-history origin/main -- reports/market/history/` → **exactly one commit**, `963b843` at 09:32:04Z, despite eight completed cycles that day.
- `reports/market/history/2026-09-07.json` → `computedAt: 2026-09-07T09:30:58.728Z`, while `reports/market/benchmark.json` → `computedAt: 2026-09-07T17:37:03.572Z`. **The archive holds the first cycle of the day, not the last - eight hours stale.**
- Contrast `trend.json`: `dba1b9a`, `f022509`, `0b6fadd`, `cfb2744`, `3a01c22`, `a210439` all exist as *empty* commits (`git show --stat dba1b9a` lists no files), proving those writes succeeded with unchanged content. The history writes produced no commit at all - they were rejected.

Blast radius: **degrades.** Nothing reads that directory (`grep -rn "history/" app lib mcp` → only the definition at `store.ts:36` and two comments). It corrupts the archive's meaning: the file named for a day is not that day's final benchmark. In production, with one cron run per day, it never fires - only on manual re-runs and on Vercel's documented *"cron delivery can also occasionally invoke the same scheduled run more than once."*

### 2d. The same shape elsewhere - `app/recall.tsx:81` - **degrades silently, loses user work**

`app/api/review/route.ts` PUT takes a client-supplied sha and, on conflict, returns **HTTP 200** with `{saved:false, synced:false, error}` (`route.ts:65`). The client:

```tsx
// app/recall.tsx:81-83
fetch("/api/review", { method: "PUT", …, body: JSON.stringify({ state: next, sha }) })
  .then((r) => r.json())
  .then((d) => { if (d.sha) setSha(d.sha); })
  .catch(() => { /* stays local */ });
```

Three consequences, all silent:
1. **A conflict is indistinguishable from success.** `saved:false` is never inspected; no error branch in `record()`, no UI signal.
2. **Once stale, always stale.** On a 409 the response carries no `sha`, so `setSha` never runs and the client keeps its dead sha. Every subsequent grade in that session also 409s. Second device = permanently local-only for the session.
3. **Single-tab loss.** `record()` fires one PUT per grade with no serialization. `sha` is captured from the render closure, so grading two cards before the first PUT returns sends the second with the pre-first sha → 409 → that grade never reaches GitHub. This is precisely the shape that cost `benchmark.json`: a write issued against a sha captured before the previous write landed. localStorage masks it until you switch devices.

The route's own comment (`review/route.ts:53-54`) names the hazard - *"sending a stale one is how two tabs silently clobber each other"* - but neither side acts on the resulting failure.

### 2e. The single highest-cost failure - **degrades, expensive**
`market-scan/route.ts:539-543`: if the `index.json` write fails for any reason (409 from a concurrent `/api/review` or `/api/progress` commit at 03:xx UTC = 08:xx IST, or a transient 5xx), the route returns 502 and **the entire 47 MB scan is discarded with no retry** - Vercel does not retry crons, and Hobby permits only one run per day. One transient conflict costs 24 hours of market data. There is no retry-with-refetched-sha anywhere in `store.ts:156-179`.

---

## 3. `SCAN_DEADLINE_MS` - the premise is wrong, the number is safe, the cursor works

### The comment is stale
`market-scan/route.ts:36-38`: *"Hobby caps a function at 60 s and rejects a build that asks for more."* Not true on this project. `functionDefaultTimeout: 300` with `fluid: true`, and the docs give Hobby a 300 s default *and* maximum under Fluid compute. `app/api/ask/route.ts:14` already exports `maxDuration = 60` without incident. The decision not to declare `maxDuration` is still defensible, but not for the stated reason.

### A full 27-board cycle fits, by a factor of ~18
Measured, not estimated: six production runs completed a 27-board cycle in **9, 10, 10, 9, 13, 17 seconds** (handler start `insight.computedAt` → `index.json` commit). The cold start - 291 stage-2 JD fetches - took **66 s**. `index.json` records 47.0 MB across 27 boards with `boardsOk: 27`, `cursor: 0`, 750 reqs, **zero failed boards**, and board `fetchedAt` spanning only `17:37:04.997` → `17:37:18.416`.

**`DEADLINE_MS = 220_000` is never reached and the cursor has never had to resume.** The resume path is entirely untested in production.

### The stated arithmetic does not close
`route.ts:46-47` claims *"220 000 + 45 000 leaves headroom under a 300 s function."* It accounts for the board timeout and nothing after it. The real tail on a `complete` run, after the last board is dispatched at t=219 s:

| | |
|---|---|
| last board listing | up to 45 s (`fetch.ts:79`) |
| its stage-2 JDs | **ungoverned** - `JD_TIMEOUT_MS` 20 s × `ceil(n/4)`, no deadline check |
| 3 GitHub reads + `readProgress` (≤100 GETs) | seconds |
| 4 sequential GitHub writes | ~2 s |
| `quaereReading` | up to **40 s** (`route.ts:249`) |
| `sendWeekly` → `weeklyFraming`, Mondays | up to a further **40 s** |

220 + 45 + 40 = **305 s**, or **345 s on a Monday**, before counting stage 2 at all. If the deadline ever did fire on a completing run, the function would be killed. The kill lands after `index.json` is committed (`route.ts:539`), so it degrades - the tab shows yesterday's benchmark against today's index - but the budget as documented does not fit the code as written.

### Two real gaps in the deadline itself
- **The deadline only gates *starting* boards.** `route.ts:465`: `while (next < boards.length && Date.now() - startedAt < DEADLINE_MS)`. Never checked inside `scanBoard`. Stage 2's semaphore (`fetch.ts:192`, `JD_CONCURRENCY = 4`) is global, so a cold start with 291 JDs against a degraded Greenhouse is `291/4 × 20 s ≈ 1455 s` with no escape hatch. The function dies at 300 s, `index.json` is never written, **the cursor never advances, and the cold start can never complete** - it retries identically every day forever, silently.
- **`inFlight` and `waiting` at `fetch.ts:190-191` are module scope.** Fluid compute reuses instances. If an invocation is terminated inside `gate()`, the `finally` never runs, `inFlight` stays ≥ 4 on the warm instance, and the next invocation's `await new Promise(resume => waiting.push(resume))` never resolves - `Promise.all` at `route.ts:97` hangs until the 300 s kill, permanently, until the instance recycles. I could not reproduce this (the deadline has never fired), so treat it as a reasoned risk rather than an observation; the state is unambiguously cross-invocation. `frequentCache` at `skills.ts:165` is a `WeakMap` keyed on array identity and is correctly GC-safe by contrast.

### Does the cursor genuinely resume? - yes, structurally
Traced rather than run (it has never fired). The mechanism is sound:

- `route.ts:448` - cursor validated (`> 0`, `< boards.length`, integer), otherwise restart from 0. Handles a shrunk config and a corrupt value.
- `route.ts:464-475` - six workers share `next` via `boards[next++]`. Single-threaded JS makes that atomic. Workers in flight hold indices already consumed, so when the loop exits `next` is exactly the first board never dispatched. Correct resume point.
- `route.ts:499-500` - `complete = next >= boards.length`; cursor wraps to 0 only then. `sweepMissing` and `computeBenchmark` are gated behind `complete`, so no percentage is ever computed over a truncated denominator.
- `confirmedIds` (`route.ts:176-188`) is the piece that makes multi-invocation cycles safe: a board visited *this* run is judged on this run's seen-set; a board visited by an *earlier* run is judged on `req.lastSeen >= board.fetchedAt.slice(0,10)`. Without it the completing run would sweep every req on every earlier-visited board and report them all as new the next day. I walked a day-boundary case (run A day D scans boards 0-19, run B day D+1 finishes) and it holds: reqs on boards 0-19 carry `lastSeen = D`, `fetchedAt = D`, `D >= D` → confirmed, not swept. A board that *failed* in run A is protected separately by `store.ts:325`.
- The documented hole at `route.ts:170-174` is real and correctly described: **two cycles in the same UTC day**, every unvisited board's reqs read as present, so a role that closes between them is never swept. Exactly what happened eight times on 09-07.

The dependency worth naming: **the cursor advances only if the `index.json` write succeeds** (`route.ts:643-647`). A partial run that scans 20 boards and then loses the write to a 409 has spent the egress and made zero progress, and starts from the same cursor tomorrow.

---

## 4. Alerting - there is none

**Verified absent.** `grep -rn "slack\|webhook\|alert\|sentry\|pagerduty\|healthcheck\|heartbeat\|cronitor" app lib mcp vercel.json package.json` returns two false positives: `role="alert"` on the login error, and the word "slack" in a comment at `store.ts:327`. `mcp/server.js` exposes a `/healthz` endpoint that nothing polls.

Every failure path in both crons terminates at `console.error`. On Hobby those logs are **retained for one hour**. The crons fire between 03:00 and 03:59 UTC (08:30-09:29 IST). Rasul would have to open the Vercel Logs tab inside that window, on the right day, to see anything.

**If the scan fails silently for a week:**

| Surface | Behaviour |
|---|---|
| Daily digest email | **Arrives every morning, complete, and looks correct.** `newCoreReqs()` (digest:103-131) returns `NO_MARKET` on every failure path by design, and `computeBenchmark` filters `req.firstSeen === day` (`benchmark.ts:389`), so a stale index yields zero new reqs. The "NEW CORE REQS" block simply does not render (digest:188, 207). **An empty market section is indistinguishable from a quiet market.** The one daily signal he receives is explicitly engineered to survive the scan's death without mentioning it. |
| Market tab | Renders last week's `benchmark.json` with no staleness treatment. `page.tsx:286` prints `Computed 2026-09-07 17:37 UTC · 27 of 27 boards` - accurate, absolute (the comment at :285 deliberately rejects "3 days ago"), entirely passive. The only active warning, `page.tsx:299`, fires on `synced === false` - an unreachable *store*, not a stale one. |
| Weekly Monday email | Sent only inside the `complete` branch on `now.getUTCDay() === 1` (`route.ts:631`). One partial or failed Monday = **no market email that week and no catch-up the next**, silently. |
| Repo | `git log -- reports/market/` stops. The most reliable detector in the system, and it is manual. |

**Two failures are live right now and this is exactly how they hid:**

- **`insight.quaere` is `null` on all six production runs.** Checked every commit of `reports/market/insight.json`: `72e26e1`, `761d450`, `06d5336`, `5d966bc`, `89d6750`, `8780bce` → `quaere: NULL`, every one. It has **never once been produced**. Whether the cause is the key, a non-200, the 40 s timeout, an empty reply after `clean()`, or the digit post-check at `route.ts:274-278` is now unrecoverable - `console.error` at `:589` and `:276` expired within the hour. The Market tab renders a Quaere-shaped hole and says nothing. Related: `MINIMAX_API_KEY` on Render is **11 characters**, not a plausible MiniMax key; the Vercel copy is Sensitive and unreadable.
- **The history archive has been failing since the second run of 09-07** (§2c) with the same one-hour-log outcome.

Both are reported truthfully in the HTTP response body - `route.ts:615-616` returns `insight` and `reading` separately, precisely so the two can be told apart - and nothing reads that body. Vercel does not alert on a 200 whose JSON says `reading: false`.

**Finally: none of this has yet run unattended.** `market-scan/route.ts` was added at 2026-09-07 06:35 UTC; the first scheduled invocation is 2026-09-08 03:xx UTC. Every observation above comes from eight manual runs. `daily-digest` has been scheduled since 2026-09-05 09:21 UTC, so it has had two unattended mornings, and there is no artifact anywhere in the repo that would record whether either one delivered.