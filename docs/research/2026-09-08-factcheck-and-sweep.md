# Platform fact-check and sweep - 2026-09-08


# ===== FACT-CHECK: architecture =====

# Fact-check: `/Users/rasul/senior-fde-dashboard/docs/platform/architecture.md` (729 lines)

Ground truth re-derived independently. All eight items reproduce exactly:

| item | derived | doc |
|---|---|---|
| `data/workbook.json` Plan | 119 rows, 117 active / 2 `Skipped` (col 15), 1,588.0 active hrs (col 13), 1,614.0 total, months 1-23 (23 distinct, col 1), 15 tracks | ✅ §4.1 L222-230, §10 L691-697 |
| `data/curriculum.json` | 119 topics, 2,236 subtopics | ✅ |
| `data/curriculum/NN.json` | 119 files, 2,236 subtopics - **is the source** | ✅ |
| `mcp/server.js` | 18 tools | ✅ |
| `app/page.tsx` TABS | 10 | ✅ |
| `vercel.json` | 2 crons | ✅ |
| `data/market-sources.json` | 32 boards, 27 enabled | ✅ |

---

## FALSE - fix these

### 1. The MCP auth claim is inverted. The doc describes a fail-open server; the code fails closed.

`architecture.md:194-195`
> **If `MCP_API_KEY` is unset, `allowed()` returns true for everyone** - the server is open.

`architecture.md:640` (§8 env table)
> `MCP_API_KEY` | `mcp/server.js` | **the MCP server accepts anonymous requests**

`mcp/server.js:444-457` - the function is named `authError()`, not `allowed()`, and it refuses:
```js
 * Refuse by default. This returned true for every request whenever MCP_API_KEY was unset - a
 * fail-open guard in front of save_study_note and record_progress ...
function authError(request) {
  const expected = process.env.MCP_API_KEY;
  if (!expected) return { status: 503, message: "MCP_API_KEY is not configured" };
```
`mcp/server.js:465-466` sends that 503 before any dispatch. The doc documents the *bug that was fixed* as current behaviour - it tells an operator the server is exposed when it is actually hard-down without the key, inverting the correct incident response.

Knock-on: `architecture.md:196` "30 requests per 60 s per bearer token (**or per remote address when anonymous**)". The anonymous branch in `rateLimited()` (`mcp/server.js:459`) is unreachable - `authError` returns first.

### 2. §9 says CI does not run tests. It runs all four suites plus the doc checker.

`architecture.md:673-674`
> `.github/workflows/ci.yml` runs `npm ci && npm run build` on Node 22 … It does **not** run the test suites.

`.github/workflows/ci.yml` runs, after `npm run build`: `test:market`, `test:surfacing`, `test:insight`, `test:review`, then `python3 scripts/verify-docs.py`. Its own comment: *"The four suites ran only when someone remembered to run them, which is how a scheduler defect reached main."* Again the doc preserves the pre-fix state.

### 3. `lib/review.test.mts` does have an npm script. The 4/3 split is 4/4.

`architecture.md:667` `npx tsx lib/review.test.mts   # the scheduler simulation - no npm script`
`architecture.md:671-672` "`package.json` declares **3** test scripts … `lib/review.test.mts` has no script and is run directly"
`architecture.md:729` `| test files / npm test scripts | 4 / 3 |`

`package.json`: `"test:review": "npx tsx lib/review.test.mts"`, plus `test:market`, `test:surfacing`, `test:insight`. Four files, four scripts.

### 4. §5.7 "Live numbers from the first real scan" is a full cycle stale.

`architecture.md:533-534` claims both files carry `computedAt 2026-09-07T17:37:03.572Z`, `day 2026-09-07`. Both `reports/market/benchmark.json` and `insight.json` now read `computedAt: "2026-09-08T03:38:54.948Z"`, `day: "2026-09-08"`. Four rows are wrong:

| doc | line | actual |
|---|---|---|
| baseline `true` - first cycle | 542 | `"baseline": false`, `"baselineStatement": null` |
| velocity - unavailable, **1 scan recorded** | 549 | `"VELOCITY - 2 scans spanning 1 day. Velocity needs 7"` (`points: 2`) |
| `quaere` is `null` on this run | 551 | non-null: *"Aim at Data platform first, not because it has more roles…"* |
| trend points recorded \| **1** | 728 | `reports/market/trend.json` holds 2 points |

The heading "the first real scan" is itself wrong - this is the second cycle.

Everything else in that table survives, each confirmed: core 189/23 companies, stored 750 (382 core, 342 adjacent, 26 leadership), boards 27 of 27, readiness 0% / 0 of 490 share points / 0 of 34 skills / 2 matched events (`eventCount: 2, matchedCount: 2`), ranked marginal rows 27, reachable 7 of 189 (4%) across 3 companies, in-India 11 of 189 (6%) across 5, tier split 4·4·3·147·31 (sums to 189), 5 segments 43/50/42/42/12, over-investment 335h / 3 tracks / 26 rows / 21%, flags 0.

### 5. The file contradicts itself on tool count, in the header.

`architecture.md:9-10`
> and which says "13 tools" where `mcp/server.js` serves 14.

`architecture.md:53, 175, 181, 711` all say 18, and 18 is correct - I counted the `tools` array at `mcp/server.js:39-56` and the enumeration at `architecture.md:183-187` matches name-for-name **and in order**: `get_plan · get_learning_context · get_syllabus · ask_lumen · list_ask_reports · read_ask_report · save_study_note · record_progress · get_progress_history · get_progress_analytics · score_assessment · semantic_search · get_audit_log · get_connection_map · get_market_priorities · get_market_reach · get_market_skill · get_market_plan_risk`. No omissions, no extras; index (L711) agrees with prose (L175).

The "14" is quoted from the superseded doc's own banner (`docs/lumen-fde-architecture.md:3-4`), but this file asserts it in its own voice as present-tense fact about `mcp/server.js`. It is the one place the 18 is contradicted.

### 6. MCP server version.

`architecture.md:179` "protocol version `2025-03-26`, server version `1.1.0`."
`mcp/server.js:478` `serverInfo: { name: "lumen-mcp", version: "1.2.0" }`. Protocol version is correct (`mcp/server.js:8`).

### 7. Adjacent count disagrees with the file the doc cites as its source.

`architecture.md:540` and `:718` say **208 adjacent across 17 companies**, sourced to `reports/market/benchmark.json`. That file says `"adjacentCount": 206` and its `adjacentStatement` reads *"206 distinct requisitions across 17 companies, plus 21 leadership."*

208 is what you get deduping `index.json` by `key` yourself (I did: core 189, adjacent 208, leadership 21) - so `architecture.md:456-457` ("dedupe to 189, 208 and 21", cited to `index.json`) is right, and L540/L718 carry that number to a `benchmark.json` citation where it does not hold. Two denominators presented as one.

### 8. §8 omits an env var it claims to enumerate exhaustively.

`architecture.md:620` - "Read from `process.env` across `app/`, `lib/`, `mcp/` and `proxy.ts`." A full grep returns 23 names; the table lists 21. Missing: **`LUMEN_DASHBOARD_URL`**, read at `mcp/server.js:371` (`process.env.LUMEN_DASHBOARD_URL || "https://lumen-fde.vercel.app"`). Also absent from `.env.example` - exactly the condition the doc flags for `MARKET_TO_EMAIL` at L638.

(`VERCEL_OIDC_TOKEN` is the 23rd; the doc's L651 claim that it is "neither in `.env.example` nor read by the code" is **correct** - the only hit is inside a comment at `app/api/sandbox/route.ts:58`.)

### 9. Corpus size drifted.

`architecture.md:429` and `:721` say 46.98 MB. Summing `boards[].bytes` in the current `index.json` gives 46,961,588 bytes = **46.96 MB**.

---

## MINOR - imprecise, not load-bearing

- **`architecture.md:59`** - diagram's scan box ends `"→ benchmark → insight → 4 files"`. The cycle writes **five**: `index.json`, `benchmark.json`, `trend.json`, `history/DAY.json`, `insight.json` (route lines 539, 559, 560, 564, 594). §5.5 and the route's comments say five (`market-scan/route.ts:624`, `:634`).
- **`architecture.md:198`** - "`get_audit_log` is in-memory only." The 500 cap is right (`mcp/server.js:69`), but `mcp/server.js:368` fetches `reports/audit` from GitHub whenever `args.durable !== false`, default true.
- **`architecture.md:677-678`** - the `scripts/` inventory omits `verify-docs.py`, the script the doc leans on hardest (L6, L687).
- **`architecture.md:313-315`** - §4.5 gap arithmetic doesn't close: 18 claims, "four were deleted", "13 survived". 18 − 4 = 14. Source `_gapsNote` states no survivor count; `gaps` has 13. One deletion unaccounted for.
- **`architecture.md:122`** - "Three tabs fetch" is true for tab-owned data, but the Plan tab also hits `/api/progress` (the doc says so at L132-133) and the always-mounted recall strip hits `/api/recall` and `/api/review`.
- **`architecture.md:18`** - "10 tabs, 10 API routes, and 2 cron endpoints" reads as 12. The 2 crons are 2 *of* the 10; §3.3's table gets this right.
- **`architecture.md:343-344`** - "~420 live requisitions" is faithful to `market-scan/route.ts:428`, but `index.json` now holds 750. Doc and code comment are stale together.

---

## CORRECT - verified, one line each

- **§4.2 SOURCE vs BUILT direction is right, and stated in the right direction.** `data/curriculum/NN.json` → `build-curriculum.py` → `curriculum.json` + `recall-bank.json`. `scripts/build-curriculum.py:1-4` header, `:16` `REQUIRED` matches the doc's nine keys verbatim, `:37-43` hard-checks `topic == plan_rows[i][2]` and `track`/`month`/`hours` against cols 0/1/13, `:39-40` carries the *"A renumber silently desynced 90 files once"* comment. The bug narrative at L260-264 is confirmed: `rebaseline-hours.py` loops `data/curriculum/*.json` writing `hours` and ends `print("\nwritten. Now run: python3 scripts/build-curriculum.py")`; `renumber-months.py` does the same for `month`. Nothing here is backwards.
- **§5 market pipeline, end to end** - every stage matches `app/api/cron/market-scan/route.ts`: abort on `!stored.synced` before any fetch (433-438), 27 enabled boards (445) at `BOARD_CONCURRENCY = 6` (44) with resumable cursor (448, 500), `fetchBoard` → `classify` (never reads `posting.jd`, `classify.ts:16`) → Greenhouse-only `fetchJd` at 4 in flight only for missing fingerprints (86-104, `fetch.ts:166`) → `stripBoilerplate`→`matchSkills` for skills (134) and **unstripped** text for `classifyReach` (135-144) → `markSeen`/`boardsOk`/cursor (485-500) → incomplete-cycle write-and-stop (642-648) → on wrap: `sweepMissing`→`capReqs`→`computeBenchmark`→`appendTrend`→`computeInsight` (504-534) → sequential writes index→benchmark→trend→history→Quaere→insight (539, 559, 560, 564, 582, 594) → Monday `getUTCDay() === 1` Resend (631).
- **§5.1 bounds table** - all twelve values confirmed at their named files: `BOARD_CONCURRENCY 6`, `SCAN_DEADLINE_MS 220_000`, `BOARD_TIMEOUT_MS 45_000`, `JD_TIMEOUT_MS 20_000`/`JD_CONCURRENCY 4`, `MISSING_DAYS 14`, `MAX_REQS 3000`, `TREND_POINTS 180`, `DELTA_MIN_BOARDS 24`, `MOVE_MIN_POINTS 3`, `NEW_ROLES_CAP 3`, `READINESS_FLAG_POINTS 3`, `VELOCITY_MIN_DAYS 7`. (Nit: the route's identifier is `DEADLINE_MS`; `SCAN_DEADLINE_MS` is the env var it reads.)
- **§5.2 all seven rules** confirmed including every anecdote: `ok: false` isolation (`route.ts:70-75`, `store.ts:313` "one Ashby 500 marks all 55 Sierra reqs missing"); `Math.floor(verifiedTotal * 0.6)` with the Decagon 10-of-139 / Databricks 97-of-870 / floors 522 and 83 arithmetic (`fetch.ts:140-146`); "23 of Baseten's 88 postings" (`classify.ts:13`); bounded `\b…\b` match vs "Internal"/"International" (`classify.ts:66-73`); JD never stored; `null` = "no body this run" (`route.ts:131-144`); stripBoilerplate before skills and not before reach, ≥60% frequency / ≥40 normalized chars (`skills.ts:195`).
- **§5.3 / §5.4** - `benchmark.ts:5` "Pure. No network, no filesystem, no `Date.now()`"; `skillShares` 34, `coverage` 34 with the exact field set `pct/hits/reqs/companies/totalCompanies/rows`, `gaps` 13, `overInvested` 3. Five reach tiers in exactly the doc's best-first order (`reach.ts:48-54`), `REACHABLE_TIERS` (`insight.ts:87`) and `IN_INDIA_TIERS` (`insight.ts:105`) as stated.
- **§5.6** - two MiniMax calls, `weeklyFraming` ≤60 words / `quaereReading` ≤80, one shared `modelParagraph()` returning `""` on every path, empty allow-set digit check with the `60`-from-prompt and `58`-from-facts leak history, and `reading || null` at the write (`route.ts:233-318`, `:594`).
- **§3.1 password gate** - `proxy.ts` exempt list matches in order, `publicAsset` regex matches character-for-character, `/api/cron` the only functional exemption, `x-lumen-internal-key` bypass for `/api/ask` only, 401 JSON for `/api/*` else 307. `lib/auth.ts`: 14-day TTL, `lumen_session`, `base64url(payload).HMAC-SHA256(payload, password)`, `LOGIN_LIMIT 8` / `LOGIN_WINDOW_MS 10 min`.
- **§3.3 all ten routes and every "degrades to" cell** - ask `maxDuration = 60` + `AbortSignal.timeout(55000)` + 503 without `MINIMAX_API_KEY`; curriculum 400/404; market's exact `{benchmark:null, trend:[], insight:null, synced:false}`; progress 502 and newest-100 (`slice(0,100)` descending, with the old oldest-100 bug comment); recall `max-age=3600` and `{meta:{},prompts:[]}`; review `{state:{},sha:null,synced:false}`; both crons 401/503.
- **§3.5 sandbox** - `NAME = "lumen-study"`, `VCPUS = 1`, `SESSION_MS = 15 min`, `COMMAND_MS = 120_000`, `MAX_OUTPUT = 256 KB`, `Sandbox.getOrCreate`, `env: {}`, `CWD_FILE = "/tmp/.lumen-cwd"`, `$HOME` read from inside the VM.
- **§4.1 data model** - Plan column indices 0-16 match the header row exactly; Mocks 13 raw → 11 after `isDataRow(r, 9)`, target reps sum to 57; Roadmaps 16; CompReality 7 → 6. `marginalRef()` and `openPlanRow()` both exist in `app/page.tsx`.
- **§4.3 recall bank** - 1,710 prompts = 835 `recall` + 875 `drill`, `meta` 119; independently 835 `interviewQuestions`, 875 `failureModes`, 947 `outcomes` across the 119 source files. 601 KB on disk.
- **§4.4 / §4.5** - 32 boards / 27 enabled matching `boardCount`/`enabledCount`; `BOARD_COUNT = 27` at `benchmark.ts:28`; exactly three adapters `ashby|greenhouse|lever`; the two disabled `gem`/`workable` boards present with reasons; 34 skills / 13 gaps / 3 overInvested; `python` is the only skill without `proximity`; `_rules` states both quoted rules.
- **§7 review scheduler** - `LADDER = [1, 7, 21, 60, 150, 240, 330]`, `DAILY_CAP 5`, `NEW_PER_DAY 2`, `PER_TOPIC 3`, `gone` → `Math.max(0, current - 2)`, top rung clamped by `Math.min(current+1, LADDER.length-1)`, and the 400-day / 386-days-binding / 547-of-700 / ~357-cards figures appear verbatim in `lib/review.ts:22-38`.
- **§2 diagram** - matches the real component graph on every edge: Vercel↔GitHub read/write, Render↔GitHub via `GITHUB_TOKEN`, Render→Vercel `POST /api/ask` with `x-lumen-internal-key`, both cron paths and times, MiniMax's three call sites, `@vercel/sandbox`→Firecracker with `env: {}`. `readMarketReport()` fetching both `benchmark.json` and `insight.json` under `MARKET_READ_MS = 4000` is real (`mcp/server.js:93, 99, 159`), as is the duplicated `marketContext` with its "must stay byte-comparable with app/api/ask/route.ts" banner (`mcp/server.js:74, 112, 205-206`). `buildFilter` includes `mcp/**` and `data/**` with the doc's stated reason as a literal comment in `mcp/render.yaml`.
- **§6 digest** - deterministic body from `workbook.json` + `recall-bank.json`, day-of-year rotation, book match from `library-context.json`, hours ÷ 16, `MARKET_READ_MS = 8_000`, `DIGEST_TO_EMAIL` default `shaikhrasul02@gmail.com`, and `clean()` byte-identical to the copy in `market-scan/route.ts:206-213`.
- **§8 env table, the other 21 rows** - all verified, including the `MARKET_TO_EMAIL` `||`-not-`??` reasoning (`market-scan/route.ts:335-337`), `RENDER_API_KEY` in `.env.example` read by nothing, and the `VERCEL_OIDC_TOKEN` no-preflight rationale.
- **§10 number index vs §-body prose** - diffed every row against its section; the only cross-section disagreements are items 4, 7 and 9 above. Tools 18 = 18, tabs 10 = 10, routes 10 = 10, crons 2 = 2; all plan/curriculum/board/skill figures agree.

**Why the drift survived CI:** `python3 scripts/verify-docs.py` passes - but prints "checked 52 anchors across 4 files" and its anchor set (`verify-docs.py:66-88`) is structural counts only: rows, hours, months, curriculum files/topics/subtopics, boards, skills, gaps, prompts, ladder rungs, `mcp_tools`, `tabs`, `api_routes`, `crons`, market modules, market tests. It checks no `reports/market/*.json` live figure, no npm script count, not CI's own contents, not `serverInfo.version`, and no env-var behaviour claim - precisely the set that is wrong.

---

# VERDICT

**Not reliable as-is, but structurally sound.** Every claim in the sections the other three docs actually cite for structure - §4 the data model (including the SOURCE-vs-BUILT direction, which is correct and correctly stated), §5 the market pipeline, and the 18-tool enumeration - checks out against source. The failures cluster in a different band: **behavioural claims about auth and CI that describe pre-fix code, and live-scan figures one cycle stale.** Those propagate as work items and as wrong incident response, so fix them before this file is cited again.

**Top three to fix:**

1. **`architecture.md:194-195` and `:640` - the `MCP_API_KEY` fail-open claim.** The server refuses with 503 when the key is unset (`mcp/server.js:452-457`); the function is `authError()`, not `allowed()`. An operator reading this would triage a dead MCP as an exposed one. Delete the anonymous-address clause at `:196` while there.

2. **`architecture.md:667, 671-674, 677-678, 729` - the whole §9 test/CI paragraph.** CI runs all four suites and `verify-docs.py`; `test:review` exists; the count is 4 files / 4 scripts; the `scripts/` inventory omits `verify-docs.py`. Three consecutive false statements in the section that tells a new operator what is enforced.

3. **`architecture.md:531-551` plus index rows `:718, :721, :728` - regenerate §5.7 from the current `reports/market/*.json`.** Heading, both `computedAt`s, `baseline`, velocity, `quaere` and trend-point count are a cycle behind; `adjacent 208/17` disagrees with the `benchmark.json` it cites (206); corpus is 46.96 MB. Then extend `scripts/verify-docs.py` to anchor these - its 52 anchors cover none of §5.7, which is why the drift shipped, and this section will drift again tonight at 03:00 UTC.

Also worth a line while editing: `architecture.md:9-10` ("`mcp/server.js` serves 14") is the file's one self-contradiction on tool count - make it 18, or scope it explicitly to the superseded doc's stale banner.

# ===== FACT-CHECK: operating =====

# Fact-check - `/Users/rasul/senior-fde-dashboard/docs/platform/operating.md`

**Scope note:** the file is **493 lines**, not 449. Lines 455-493 (`get_market_priorities`, `get_market_reach`, `get_market_skill`, `get_market_plan_risk`) sit *after* `## 5. Two things that will trip you`, i.e. outside `## 1. The 18 MCP tools`, which carries only 14 subsections.

**Ground truth re-derived** (`python3` over the data files, plus `python3 scripts/verify-docs.py` → `checked 52 anchors across 4 files`, exit 0):

| claim | derived | verdict |
|---|---|---|
| Plan 119 rows / 117 active / 2 skipped | `len(Plan[1:])==119`, `Counter{'Not started':117,'Skipped':2}` | correct |
| 1,588 active hours (col 13) | `1588.0` (all-rows total 1614.0) | correct |
| months 1-23 | `min=1, max=23` | correct |
| curriculum 119 topics / 2,236 subtopics / 119 source files | `119`, `2236`, `glob('data/curriculum/*.json')==119` | correct |
| `mcp/server.js` 18 tools | `tools` array, lines 39-56 = 18 | correct |
| 10 tabs / 2 crons | `app/page.tsx:55`, `vercel.json` | correct |
| 32 boards, 27 enabled | `data/market-sources.json` | correct |
| 16 books, 10,521 pages, 2 repos (line 86) | `16`, `10521`, `2` | correct |
| 1,710 prompts, 7 rungs (line 337) | `len(prompts)==1710`; `lib/review.ts:20 LADDER=[1,7,21,60,150,240,330]` | correct |
| 34 mapped skills (line 452) | `len(benchmark.coverage)==34` | correct |

Every `verify:`-anchored number passes. **Every error below is in un-anchored prose.**

---

## The 18 MCP tools

### 1. `get_plan` - two errors, one a hard falsehood
Doc line 66-68: "**Inputs:** `query` … `month` … `track` … **no arguments returns all 119 rows**." Schema `mcp/server.js:39` also declares `row` (1-119) and `limit` (1-119). `:285` - `const limit = Math.min(Math.max(Number(args.limit) || 30, 1), 119);` and `:296` `rows: matches.slice(0, limit)`. **No arguments returns 30 rows.** The handler comment at `:295` says why ("~131 KB - roughly 33k tokens"). A model reading line 68 concludes rows 31+ do not exist. The "do not use `status` for progress" warning is correct (`:39`).

### 2. `get_learning_context` - correct
`{}` inputs (`:40`); returns all three files whole (`:298`); 16/10,521/2 verified. Omits only the single hardcoded lesson caveat.

### 3. `get_syllabus` - one omission, precedence undocumented
Doc line 98 lists `index` and `query`; schema `:41` also has **`row`** (1-based), which the description calls preferred. `:303` - `args.row !== undefined … ? Number(args.row) - 1 : args.index` - **`row` beats `index`**, undocumented. Line 101's "`index` wins if both are passed" refers to index-vs-query and is **true** (`:304`).

### 4. `ask_lumen` - inputs correct, routing advice contradicts the tool
Two paths correct (`:149` proxy, `:161` direct MiniMax, nothing saved). But doc line 121-123 says reach for it "especially if it touches the market"; the description `:42` says "Prose only … for measured market numbers call get_market_priorities, get_market_reach, get_market_skill or get_market_plan_risk instead."

### 5. `list_ask_reports` - correct
`:310` `slice(0, Math.min(limit || 20, 50))`, no sort - the "oldest first" warning holds.

### 6. `read_ask_report` - correct, understated
`:317-318` rejects `..`/`%2e` *before* the prefix check. Stronger than described.

### 7. `save_study_note` - correct
Both fields required and non-empty (`:321`); nothing reads notes back.

### 8. `record_progress` - one word now wrong
Line 184: an unmatched event "**silently does nothing**". `:336` returns `warning` plus `didYouMean` (`:335`) and `matchedPlanRow`; `:332-334` calls the silent version a fixed defect. Silent is true of the Plan tab, not this tool.

### 9. `get_progress_history` - correct
`:338` limit 30/cap 100; filenames not contents; `:281` returns `[]` on Not Found.

### 10. `get_progress_analytics` - **worst section; three false claims**
1. "no hours figure and no percentage is produced" - `:354` returns `hours: {done, activePlanHours: 1588, completionPct}` (`ACTIVE_HOURS`, `:37`).
2. "Two events for the same topic count twice here" - `:343-347` dedupes per topic, newest wins; `:341-342` names per-event counting as a fixed bug.
3. "over the newest 100 events" - no cap; only GitHub's 1000-file max, noted at `:358`.
4. It quotes a description ("completion, hours") that `:48` no longer contains, then calls it a lie.
5. Table line 51 ("count of recorded events by status") understates: counts are per topic, plus hours, %, `rowsDone`, `unmatched`.

### 11. `score_assessment` - a retired branch documented as working
Lines 222-224 describe `quick_check` as functional. `:189` - `if (assessment === "quick_check") throw new Error("The four-question quick check is retired…")`. **It always errors.** Weights correct (`RUBRICS`, `:187`); clamping correct (`:193`); undocumented that too *few* answers throws (`:192`).

### 12. `semantic_search` - correct
`:362` auto-select + fallback, explicit `surfsense` rethrows; `:178` caps at 10.

### 13. `get_audit_log` - inputs incomplete, framing stale
Line 256 omits **`durable` (boolean, default true)** from `:51`. `:368` now fetches and returns `reports/audit`; response is `{inProcess, durable, note}` (`:369`). 500-event ring and 180-char detail correct (`:69`).

### 14. `get_connection_map` - correct
`:371` matches line 267 field for field.

---

### The four newest - every `Arguments:` line is wrong or incomplete

### 15. `get_market_priorities` - **`limit` omitted**
Schema `:53` has `limit` (1-27, default 8), enforced at `:380-384`. No documented way to reach all 27 ranked rows (`readiness.marginal.length == 27`).

### 16. `get_market_reach` - **`tier` omitted**
`:54` has `tier` (5-value enum) - the "at which named companies" filter the section's own prose advertises. Used at `:397-398`; `:409` returns `rolesNote` for empty tiers. `skills_limit` bounds (0-34, default 10) undocumented.

### 17. `get_market_skill` - **`skill` omitted**
`:55` has `skill` (id or label substring), handled at `:425-428`. The section calls the no-arg index "the routing table" and then omits the argument it feeds.

### 18. `get_market_plan_risk` - **"no arguments" is false; sentence truncated**
`:56` has `kind` (`gaps|over_invested|both`, default both) and `limit` (1-13, default 13), both read at `:435` and gating `:438-439`. With 13 gaps and 3 over-invested tracks, `kind` changes the whole answer. Doc line 487 ends mid-sentence on a dangling `\`.

**Shared error:** all four say they read insight *and* benchmark. Gates differ - `:375`/`:391` bail on `!insight`; `:416`/`:434` bail on `!benchmark`. Undocumented 5-minute cache (`MARKET_TTL_MS = 300_000`, `:216`) contradicts line 38's "as fresh as the repo".

### §1 preamble (lines 32-34) - stale
Both tools now speak 1-based natively: `get_plan` returns `{index, row}` (`:292`) and accepts `row` (`:288`); `get_syllabus` accepts `row` (`:303`). The banner at `:25-34` says this was done so callers need not convert. The doc still teaches the removed conversion.

---

## The 10 tabs - accurate

`app/page.tsx:55` lists exactly the ten in §2's order. `RecallStrip` renders outside every `tab ===` guard (`:632`) ✓. Verified: weekly input 1-80 / `lumen-weekly-hours` (`:475-476`); `POST /api/progress` with `.catch(() => {})` (`:550`); summary-first curriculum fetch (`:642`); library counts (`:645`); Market three zones Decide→Reach→Market (`:303`, `:333`, `:398`), Quaere last and labelled (`:439-445`), header `Computed … UTC · N of M boards` (`:286`), fetch on mount (`:170`); `DAILY_CAP = 5`, 7 rungs, Fluent/Halting/Gone (`recall.tsx:143-145`), no backlog count (`recall.tsx:22`), only In progress/Done enter (`page.tsx:583-586`).

**One stale number, lines 331-334.** Both reports now read `computedAt: 2026-09-08T03:38:54.948Z`, `day: 2026-09-08`; `trend.json` has **2** points, so it is no longer "the first real scan". The 189 / 23 / 11 / 0% figures are still right. §5 line 452 exempts these from anchoring, so `verify-docs.py` will never catch it.

## The 2 crons - accurate except one paragraph

`vercel.json` - `0 3 * * *` and `30 3 * * *` ✓. market-scan body matches `route.ts:650-663` ✓; Monday email last, same cron (`:321`, `:620-626`) ✓. daily-digest body matches `:515` ✓; 8 s budget (`:205`) ✓; nothing written to repo ✓.

**Lines 394-399 are wrong** - and it is the paragraph flagged as most important. `daily-digest/route.ts:118-119`: `const status = (r: Row) => progress?.get(norm(r[2]))?.status ?? normStatus(r[15]);` - progress events are primary, **column 15 is the fallback**. `:213` gives progress its own 8 s budget; `:144-146` prefers an in-progress topic; `:112-116` describes the doc's claim in the past tense ("which is what this email did for months"); `:159-167` adds a "no progress ever recorded" line. Correct in the same paragraph: 16 h/week is hardcoded (`:200`, `:453`).

## Sections 4 and 5 - accurate

Sandbox: `lumen-study`, `VCPUS = 1`, `SESSION_MS = 15*60*1000`, `COMMAND_MS = 120_000`, `MAX_OUTPUT = 256*1024`, `/tmp/.lumen-cwd`, `env: {}` (`app/api/sandbox/route.ts:25-28, 46, 72-78`); history 200 under `lumen-shell-history` (`terminal.tsx:7, 66`). §5's `verify-docs.py` description matches `:100`, `:72-88`, `:111`, `:94`.

---

# Verdict

**Not reliable as-is for the MCP section - the half a model reads and acts on.** Sections 2, 3 (bar one paragraph), 4 and 5 are sound, and every machine-checkable number is correct. But **9 of the 18 tool sections contain a factual error**: 4 wrong/incomplete argument lists, 3 descriptions of behaviour the handler no longer has, 1 branch that always throws, 1 routing instruction the tool contradicts. The cause is uniform - prose written against an older `mcp/server.js`, plus four sections pasted from description strings without opening the schema. `verify-docs.py` sees none of it, because none of it is a number.

**Top three fixes:**

1. **`score_assessment`'s `quick_check` (222-224) and `get_progress_analytics` (211-215).** The two that will drive a failed call or a false statement to the user - "graded against a fixed key" (throws, `server.js:189`) and "no hours figure and no percentage is produced" (both are, `server.js:354`). Rewrite from the handlers.
2. **The four market `Arguments:` lines (459, 469, 479, 489).** Restore `limit`, `tier`, `skill`, and `kind`+`limit`; fix the truncated sentence at 487; move the four sections into §1 so the heading covers 18; give them the `Answers:`/`Inputs:`/`Reach for it when` shape; split the shared "reads insight and benchmark" into the per-tool gate.
3. **`get_plan`'s "no arguments returns all 119 rows" (68)** - it returns 30. Add `row`/`limit` there, `row` to `get_syllabus` (98), `durable` to `get_audit_log` (256), and update the preamble (32-34) to state both tools now take and return 1-based `row`.

Fold in two smaller items: the digest paragraph (394-399), which documents a fixed bug as current behaviour, and the stale scan timestamp (333).

# ===== FACT-CHECK: runbook =====

# Fact-check: `/Users/rasul/senior-fde-dashboard/docs/platform/runbook.md`

## Ground truth, re-derived independently

`python3 /Users/rasul/senior-fde-dashboard/scripts/verify-docs.py` → `checked 52 anchors across 4 files`, zero problems. Recomputed by hand from the data rather than trusting the script: Plan 119 rows / 117 active (col 15 `Skipped` ×2) / 1,588.0 active hours (col 13) / months 1-23; `data/curriculum/*.json` = 119 files, 2,236 subtopics; `data/market-sources.json` = 32 boards, 27 enabled, `verifiedTotal` on all 32; `mcp/server.js` `const tools = [...]` = 18; `app/page.tsx:55` TABS = 10; `app/api/**/route.ts` = 10; `vercel.json` = 2 crons. **Every anchored number in the runbook is correct.** All defects below are in unanchored prose.

---

## Wrong - the fix or the diagnosis would not work at 3am

### 1. §1 / §4.3 / §5 gap 1 - "There is no alerting. None." is false (lines 19-34, 438, 496-498)

`app/api/cron/daily-digest/route.ts:305-334` is an alerter. `scanAlerts()` emits, into the email that already arrives every morning:

> `SCAN STALE - the market scan last succeeded ${staleAge(...)} ago, on ${index.updatedAt.slice(0, 10)}.` (line 318)
> `PARTIAL SCAN - the last scan reached ${index.boardsOk} of ${boardsTotal} boards, under the ${DELTA_MIN_BOARDS} needed…` (line 330)

Commit `88a619c` says so outright: *"Alerting closes the gap runbook.md admitted."* That commit **touched this file** - but only to bump `mcp_tools` 14→18 (`git show 88a619c -- docs/platform/runbook.md` is a one-line diff). Everything the same commit invalidated was left standing.

Concretely wrong now: line 21 "Nothing pages, emails, or posts when the nightly scan fails"; lines 26-30 "it will keep returning 502 every night and the only thing that changes is that the Market tab's numbers get older … A week of total scan failure and a week of quiet market look identical"; line 33 "Do not go looking for the alert channel; there isn't one"; line 438 "the single strongest argument for the alerting that does not exist"; gap 1's recommendation to build a dead-man's switch.

**Your specific question - does the stated threshold match `STALE_AFTER_MS`?** The runbook states no alert threshold, because it denies the alert exists. The one 26-hour number it does give - line 78, `updatedAt` older than about 26 hours → the scan is not running at all - is numerically identical to `const STALE_AFTER_MS = 26 * 60 * 60 * 1000` (`daily-digest/route.ts:274`), whose docstring derives it the same way (03:00 scan + 03:30 digest + one missed night = 24.5 h, plus slack). So the **number is right and the framing is wrong**: what §1.2 presents as a manual heuristic you must remember is the constant the system already fires on.

The one true residue: the alert rides the digest, so it dies with `CRON_SECRET` (§4.3) or `RESEND_FROM_EMAIL` (§3.5) - the code acknowledges this (`route.ts:299`, "if the digest itself stops arriving, the absence of the email is the signal"). That nuance is worth keeping; "None" is not.

### 2. §4.6 - the `MCP_API_KEY` failure mode is inverted (lines 480-481, and the §2 class table line 127)

Runbook: *"`MCP_API_KEY` unset → `allowed()` returns `true` for everyone. The MCP server accepts anonymous JSON-RPC"*, classified as "exposure, not corruption".

`mcp/server.js:445-454`:
```js
 * Refuse by default. This returned true for every request whenever MCP_API_KEY was unset - a
  const expected = process.env.MCP_API_KEY;
  if (!expected) return { status: 503, message: "MCP_API_KEY is not configured" };
```
Fixed in `88a619c`. Unset `MCP_API_KEY` now **breaks the server outright** - every tool 503s - it does not open it. The stated verification on line 484 ("an unauthenticated `tools/list` against `/mcp` succeeding is the check for the second") can no longer succeed by construction, so it will never confirm anything. Someone whose MCP has gone dark and who reads §4.6 is told the opposite of the cause. (`docs/platform/architecture.md:642` carries the same stale row - shared root, fix together.)

### 3. §3.4 - the Hobby narrative is not supported by the archived runs (lines 281-321)

The mechanical half is exact: `app/api/cron/market-scan/route.ts:48` is `const DEADLINE_MS = Number(process.env.SCAN_DEADLINE_MS) || 220_000`; lines 34-38 explain the deliberate absence of `maxDuration` in the words the runbook paraphrases; the cursor works as described (`route.ts:448` resume, `465` the deadline loop, `499-500` `const complete = next >= boards.length; index.cursor = complete ? 0 : next;`, `645-650` the `else` branch writing index and nothing else); `BOARD_TIMEOUT_MS = 45_000` at `lib/market/fetch.ts:80`. The `complete` gate genuinely is the correctness property the runbook says it is.

The consequences are wrong. Measured from the two archived indexes:

| scan | `updatedAt` → last board `fetchedAt` |
|---|---|
| `reports/market/index.json` (2026-09-08) | **4.2 s** for all 27 boards |
| commit `ad0fcc9` (2026-09-07, the scan §1.2 cites) | **14.8 s** |

On Hobby the 220 s deadline is never reached - the boards exhaust first, `next` hits `boards.length`, `complete` is true, and the cycle finishes in one invocation with ~45 s of headroom. Line 284's *"the platform kills the invocation at 60 s, mid-cycle"* and line 312's *"a full cycle takes 3-4 daily invocations, so the benchmark updates roughly twice a week instead of nightly"* describe the pathological case (6 workers × 45 s timeouts ≈ 225 s) as if it were the default.

Two knock-on errors that would misdirect at 3am:

- **The remedy misses the actual 60 s exposure.** The only long tail after the deadline gate is `quaereReading` → `modelParagraph`, `AbortSignal.timeout(40_000)` (`route.ts:250`), and it runs *after* index, benchmark, trend and history are already committed (`route.ts:538-566`, then `580`). A Hobby kill there costs `insight.json` and nothing else - cursor stays 0, the benchmark advances normally. `SCAN_DEADLINE_MS=50000` does not touch that path.
- **"How you confirm" routes the real signature away.** Line 307: *"If it sits at the same value, the scan is dying before it can make progress - different problem, look at the Vercel logs."* If the failure §3.4 describes actually occurred - a hard 60 s kill under the 220 s default - nothing would be written at all: no index write, cursor frozen at 0. That is precisely "sits at the same value", and the runbook sends you elsewhere for it.

### 4. §5 gap 3 - "CI does not run the tests" is false (lines 502-508)

`/Users/rasul/senior-fde-dashboard/.github/workflows/ci.yml` runs `npm ci`, `npm run build`, then `test:market`, `test:surfacing`, `test:insight`, `test:review`, then `python3 scripts/verify-docs.py`. Its own comment: *"The four suites ran only when someone remembered to run them, which is how a scheduler defect reached main."* Added in `5c75462`, which lands **after** `95b649a` (the commit that created this runbook) and before `88a619c`. Four suites, not "three market suites and `lib/review.test.mts` … by hand". The manual commands still work (all four npm scripts exist), so nothing breaks - but a gap closed two commits later is a work item someone will re-do.

### 5. §5 gap 2 / §1 / §3.1 - the Market tab does render its computed time (lines 499-501, 29, 177)

Runbook: *"`computedAt` and `day` are both in the file … so the data to render it exists; **the UI does not use it**."*

`/Users/rasul/senior-fde-dashboard/app/page.tsx:283-287`:
```tsx
  const meta = b
    // Always rendered, never relative. Stale data that looks current is the failure mode this
    // tab is most exposed to, and "3 days ago" is a phrasing that hides how stale.
    ? `Computed ${b.computedAt.slice(0, 16).replace("T", " ")} UTC · ${b.boardsOk} of ${b.boardsTotal} boards`
    : "No scan yet";
```
The tab prints an absolute UTC timestamp plus the board count on every render, and the comment shows absolute-not-relative was a deliberate choice. Line 29 ("It does not say 'this is nine days stale'") is defensible only in the narrow sense that no *relative age or warning colour* is computed; line 501 and §3.1's line 177 ("there is no staleness indicator on the tab to catch it") are not.

---

## Wrong numbers - argument survives, citation does not

### 6. §3.2 blast radius, line 216: "a board that contributes 97 of 189 core reqs (`reports/market/benchmark.json`, scan of 2026-09-07)"

97 is Databricks' **`verifiedMatches`** in `data/market-sources.json` - title-pattern matches across all classes, not deduped, not core-only. It is not in `benchmark.json` at all. Recomputed against the exact index the line cites (commit `ad0fcc9`, `updatedAt 2026-09-07T17:37:03.572Z`), using `computeBenchmark`'s own rule (`lib/market/benchmark.ts:243`, distinct active `class === "core"`): **189 distinct core reqs, of which Databricks contributes 35.** Identical on the 2026-09-08 index. The point still lands - 35/189 is 19% of every denominator - but the number and the file are both wrong, in a section that opens by warning about a wrong denominator.

### 7. §4.1, line 406: "one Ashby 500 marks all 55 Sierra reqs missing … 55 phantom new roles"

Same conflation. 55 is sierra's `verifiedMatches` in `data/market-sources.json`. The index holds **30** Sierra requisitions (21 distinct core) on both the 09-07 and 09-08 scans; `index.boards.sierra` reports `total: 212, matched: 30`. Mechanism right, magnitude wrong.

### 8. §4.2, lines 425-426: "The Market tab distinguishes three states from `synced` alone - no token, GitHub silent, and cold start"

`app/api/market/route.ts` does separate three states, but via `synced` **plus** `error` **plus** `benchmark === null` - not `synced` alone. And the tab collapses two of them: `app/page.tsx:299` renders a single message for `feed?.synced === false`, "The benchmark store is unreachable, so this is 'not known', not 'not scanned'. Check GITHUB_TOKEN." No-token and GitHub-silent look identical on screen. The instruction "read which one before assuming an outage" cannot be carried out from the tab; you have to read `error` off `/api/market`.

### 9. §3.6 fix is stale (lines 359, 386-390)

The history is exact - all three reverts verified below - but `8650270` ("viewing the dashboard can no longer overwrite recorded progress") landed after and changes the standing advice: status selects are now disabled until `/api/progress` hydrates, a failed hydration keeps them disabled, re-selecting a row's current value is a no-op, and the route rejects statuses outside the four the UI offers with 400. That commit reports *"loading the page and navigating to the Plan tab attempts ZERO POSTs."* It also contradicts line 361's "Not a code defect" - it treats the un-hydrated-baseline write as a defect and fixes it. The rule on lines 388-390 is still worth keeping; the framing that only discipline stands between you and a durable write is no longer true.

### 10. §2, lines 105-106: the "everything degrades" claim drops a qualifier

Runbook: *"`architecture.md` §8 lists every environment variable and every one of them degrades rather than crashing."* `architecture.md:621` actually reads "every one of these degrades rather than crashes, **except where noted**", and bolds three exceptions. §3.5 then correctly calls `/api/ask`'s 503 "the one hard failure", and finding 2 adds `MCP_API_KEY`. Answering your question directly, from the code: **degrade** = `MINIMAX_API_KEY` (everything but Ask), `MARKET_TO_EMAIL`, `DIGEST_TO_EMAIL`, `LUMEN_USERNAME`, `GITHUB_REPO`/`BRANCH`, `SURFSENSE_*`, `PUBLIC_MCP_URL`, `PORT`; **break** = `CRON_SECRET` (`market-scan/route.ts:417`, `daily-digest/route.ts:405`, `!secret ||` → 401 on everything), `RESEND_API_KEY`/`RESEND_FROM_EMAIL` for the digest (`daily-digest/route.ts:411`, 503 before any work - which now also kills the staleness alert), `GITHUB_TOKEN` for the scan (503) and `/api/progress` (502), `MINIMAX_API_KEY` for `/api/ask` (`route.ts:207`), `MCP_API_KEY` for the whole MCP server; **fail open** = `LUMEN_PASSWORD` only.

---

## Minor

- **§1, lines 22-24** - the grep claim is now false as written: `grep -riE "sentry|pagerduty|healthchecks|cronitor|uptimerobot"` also hits `lib/market/store.ts` (false positive: "Progres**sEntry**"), `data/workbook.json`, `data/curriculum.json`, `docs/research/2026-09-08-platform-audit.md`, and runbook.md itself. Cosmetic; the audit doc at line 367 confirms the pre-`88a619c` state.
- **§1.2 line 74, §3.2 line 217, §4.2 line 422, §5 line 500** all cite the `2026-09-07T17:37:03.572Z` scan; the checkout is now `2026-09-08T03:38:54.948Z` / `day 2026-09-08`. Every cited *value* still holds (cursor 0, boardsOk 27, 750 reqs, coreCount 189), and the doc's own convention is to cite file + scan date, so no remedy breaks.
- **§1.2 line 77 / §4.1** - "`boardsOk` below 27 → usually benign" never mentions `DELTA_MIN_BOARDS = 24` (`lib/market/benchmark.ts:38`). Below 24, `movement` **and** `newSinceLastRun` are suppressed entirely (`benchmark.ts:241, 384, 425`) - a whole surface goes quiet. It is also exactly what the new PARTIAL SCAN alert fires on, so this omission and finding 1 are the same hole.
- **§4.6 line 480** - "rate-limited to 30 requests per 60 s per remote address": `RATE_LIMIT = 30` / `RATE_WINDOW_MS = 60_000` are right, but the bucket key is `request.headers.authorization || request.socket.remoteAddress || "anonymous"` (`mcp/server.js:459`), so it is per-token first, per-address only as fallback; it trips on the 31st.

---

## Correct - verified, one line each

- **§1.1** - `market: update ${path}` is built at `lib/market/store.ts:160`; the 2026-09-08 cycle's commits are, newest first, insight → history → trend → benchmark → index, exactly as described.
- **§3.1** - every detail matches `b6c1ef7`: 27 boards fetched, index/trend/`history/2026-09-07.json` written, `benchmark.json` lost, 502 returned, both error shas resolving to commits (the trend and history commits), the `Promise.all` shape inherited from `app/api/review/route.ts`. Sequential order confirmed at `market-scan/route.ts:538-566`, index first and alone.
- **§3.2 mechanism and table** - `lib/market/fetch.ts:144` is `const floor = Math.floor(source.verifiedTotal * 0.6)`; `market-sources.json` gives databricks 870/97 and decagon 139/34, so all four cells (522, 58, 83, 20) are exact. `verifiedTotal` present on all 32 boards. The error string quoted in §4.1 is verbatim at `fetch.ts:146`. Both diagnostic snippets run against the real index.
- **§3.3** - matches `aa18478` exactly, including `00.json` 8 h vs 14.0 and `115.json` M13/12h vs M23/17.0, the `build-curriculum.py` comment, and "reverted 117 of 119". Both verification snippets execute; the second prints `119 files, 2236 subtopics`.
- **§3.5** - all three variables really are empty strings in `.env.local`. `/api/ask` 503 (`route.ts:207`); digest 503 (`daily-digest/route.ts:411`); `"Missing RESEND_API_KEY, RESEND_FROM_EMAIL or a recipient."` verbatim at `market-scan/route.ts:338`; `MARKET_TO_EMAIL || DIGEST_TO_EMAIL` is `||` as claimed (line 337); `MARKET_TO_EMAIL` absent from `.env.example`; the Monday email sits after all five writes and outside the 502 branches (`route.ts:620+`), so a mail outage cannot cost a cycle.
- **§3.6 history** - `2aadad0`, `6ee14a7`, `329b3b4` all exist with the exact particulars: two `done` records 220 ms apart on Shell mastery and Linux internals, PySpark and MIT 6.824 Raft un-skipped back to 119 active, `q0-0 rung 1, fluent, due 2026-09-13`.
- **§4.3** - `!secret ||` short-circuit → 401 in both cron routes; 2 crons at `0 3 * * *` and `30 3 * * *`.
- **§4.4** - no allow-set, and both leak stories are documented in the code that fixed them (`market-scan/route.ts:255-278`), including "60 words or fewer" and the `row 58` → "58%" path; log string and `invented.slice(0, 5)` match.
- **§4.5** - `mcp/render.yaml` `buildFilter` lists `mcp/**` and `data/**` with that exact rationale in a comment; 18 tools; `readMarketReport` uses `MARKET_READ_MS = 4000` and reads from GitHub (`mcp/server.js:93-99`).
- **§4.6 `LUMEN_PASSWORD` half** - `proxy.ts:13` passes everything through when unset; `proxy.ts:19` is a 307 to `/login`; the password *is* the HMAC key (`lib/auth.ts:5-15`), so rotation is a global logout.
- **§5 gaps 4, 5, 6** - `--strict` behaviour, the write-only history archive with its null-sha same-day rejection (`market-scan/route.ts:563-565`), and the per-instance login limiter (`lib/auth.ts:20-25`, `LOGIN_LIMIT = 8` / 10 min, resets on cold start) all check out.

---

## Verdict

**Not reliable as-is for the three things it is most likely to be opened for.** Sections 3.1, 3.2 (mechanism), 3.3, 3.5, 4.3, 4.4, 4.5 and the entire anchored numeric layer are accurate and well-sourced - the incident write-ups genuinely trace to their commits and the details survive re-derivation. But the document was written at `95b649a` and three later commits (`5c75462`, `88a619c`, `8650270`) changed the system underneath it while only one anchor was updated. Sections 1, 4.6 and 5 now describe a system that no longer exists, and 3.4 describes a scenario the archived runs contradict. Anchoring caught the numbers and could not catch the prose - exactly the failure mode `verify-docs.py`'s own docstring says it accepts.

**Top three to fix:**

1. **Delete the "no alerting, none" claim and document the alert that exists** - §1 lines 19-34, §4.3 line 438, §5 gap 1. Point at `daily-digest/route.ts:305-334`, state the 26 h threshold as `STALE_AFTER_MS` rather than a heuristic, add the `boardsOk < 24` PARTIAL SCAN line, and keep the one true residue: the alert rides the digest, so `CRON_SECRET` or `RESEND_FROM_EMAIL` silences the alerter along with the scan.
2. **Invert §4.6's `MCP_API_KEY` entry and reclassify it in §2** - unset now returns 503 for every tool (`mcp/server.js:454`); it breaks the server, it does not expose it, and the stated verification step can no longer pass. Fix `architecture.md:642` in the same edit.
3. **Rewrite §3.4 against measured runtimes** - 27 boards complete in 4-15 s, so the deadline is not reached and the benchmark does not drop to twice a week; the real Hobby exposure is the 40 s `modelParagraph` call *after* the four writes, which costs `insight.json` only. Most importantly, fix the confirm step: a frozen cursor with no index write **is** this failure, not "a different problem".

Then, cheaply: correct 97→35 in §3.2 and 55→30 in §4.1 (both are `verifiedMatches` read as core counts), drop §5 gap 3, and soften §5 gap 2 to "no *relative* staleness indicator" since `page.tsx:286` already prints `computedAt`.

# ===== FACT-CHECK: talk-track =====

# Fact-check: `/Users/rasul/senior-fde-dashboard/docs/platform/talk-track.md`

Ground truth re-derived independently. `data/workbook.json` `Plan` has 120 entries (header at index 0) → **119 rows**, col 15 `Status`: 117 `Not started` + 2 `Skipped` = **117 active**, `sum(col 13)` over active = **1588.0**, col 1 spans **1.0-23.0** (23 distinct). `data/curriculum.json` `topics` is a dict of **119** keyed `"0".."118"`, **2,236** subtopics; `data/curriculum/*.json` = **119** files, **2,236** subtopics, **zero** drift against `Plan[i+1]`. `mcp/server.js` `const tools = [` block = **18**. `app/page.tsx:55` `TABS` = **10**. `vercel.json` = **2** crons. `data/market-sources.json` = **32** boards, **27** enabled. All match the prompt's ground truth. `python3 scripts/verify-docs.py` → `checked 52 anchors across 4 files`, exit 0, so **every `<!-- verify:… -->` number in this file is machine-correct**; everything below concerns the un-anchored prose.

---

## A. Plan-row citations

**Convention check first.** The doc states its own convention at line 389-390: *"Row numbers and titles are 1-based `Plan` rows … row N is `Plan[N]` and curriculum topic `N-1`."* That is correct, and it is applied correctly everywhere I checked, including the one place it would be easiest to get wrong - §3.1 line 235-236: `00.json` ↔ `Plan[1]` (14.0h ✓) and `115.json` ↔ `Plan[116]` = M23 / 17.0h ✓. §3.5's `row 27 subtopics[19]`, `row 63 subtopics[9]`, `row 99 subtopics[16]` all resolve via `data/curriculum/{row-1}.json` and all three land on the subtopic described. No off-by-one anywhere in this document.

**Every month cited, checked against `Plan[N][1]`:** rows 5/M1, 6/M2, 20/M5, 25/M6, 27/M6, 30/M7, 34/M8, 35/M8, 38/M9, 40/M10, 44/M10, 51/M12, 56/M13, 59/M14, 63/M15, 68/M16, 74/M17, 75/M17, 76/M17, 82/M19, 91/M9, 92/M19, 104/M20 - **all correct**. One exception:

### A1. Row 52 is M12, not M13 - stated twice
`docs/platform/talk-track.md:405` - `| 52 | M13 | Tool use, structured outputs and MCP servers |`
`docs/platform/talk-track.md:204` - `…explain the trust boundary", M13), 30 (Auth, M7).`

`data/workbook.json` `Plan[52]` = `['G. AI Engineering', 12.0, 'Tool use, structured outputs and MCP servers', …, 14.0, …, 'Not started']` - **month 12.0**. Note the adjacent table line 406 (`| 56 | M13 |`) *is* correct, which is likely how it survived a read-through. This is the row the doc leans on hardest (§2.7, the MCP server is the centrepiece artifact), so it is the single most likely row number to be said out loud.

### A2. Row 91's title is rewritten, not quoted
`talk-track.md:414` and `:119` - *"Target list: 40 companies ranked by fit"*. Actual `Plan[91][2]` = **"Target list: 40 companies, referrals, warm intros"**. "ranked by fit" appears nowhere in the row; "referrals, warm intros" - the half the market scan does *not* mechanize - is dropped. The doc then claims at line 414 the scan "is that row's deliverable, mechanized," which is a stronger claim against the real title than against the paraphrase.

### A3. Row 20's depth target is quoted with words removed
`talk-track.md:186-187` - *its depth target is "a failing test blocks the deploy"*. Actual `Plan[20][3]` = **"A failing test or a HIGH CVE blocks the deploy; ArgoCD syncs on green"**. The other four quoted depth targets are verbatim prefixes and are fine: row 6 (`talk-track.md:67`) ✓, row 59 (`:94`) ✓, row 40 (`:187`) ✓, row 52 (`:203-204`) ✓.

### A4. Titles truncated without ellipsis (cosmetic, listed once)
Table rows 5, 6, 27, 34, 35, 40, 44, 51, 92 drop a trailing clause; rows 38, 59, 74, 104 reorder or subset the title. None changes meaning. Row 104's gloss at `:117` - *"Model evaluation: metric choice, and the denominator you compute a rate over"* - reads like a title but the second clause is the author's; actual is "cross-validation, data leakage, metric choice, calibration".

---

## B. Technical claims about the system

### B1. **The MCP auth "sharp edge" he volunteers no longer exists** - worst finding
`talk-track.md:196-198`: *"If `MCP_API_KEY` is unset, `allowed()` returns true for everyone and the server is open - that is documented in `architecture.md` §8 rather than hidden, and it is a real sharp edge, not a feature."*

`mcp/server.js:452-454`:
```js
function authError(request) {
  const expected = process.env.MCP_API_KEY;
  if (!expected) return { status: 503, message: "MCP_API_KEY is not configured" };
```
The function is no longer called `allowed()`, it does not return true, and it fails **closed** with 503. `mcp/server.js:445` states it in the past tense: *"This returned true for every request whenever MCP_API_KEY was unset."* Fixed in `88a619c` ("The auth check returned true for every request whenever MCP_API_KEY was unset … Now refuses with 503 when unconfigured"). `88a619c` is an ancestor of HEAD **and is the same commit that last touched talk-track.md** - the fix landed and the paragraph describing the vulnerability was not updated. The cited source is stale too: `docs/platform/architecture.md:648` still says `MCP_API_KEY … | **the MCP server accepts anonymous requests**`.

This is a self-inflicted wound in an interview: it is framed as "two things I would raise before an interviewer does," and it describes a live fail-open credential hole in front of the two tools that commit with `GITHUB_TOKEN`. The second half of the same paragraph - the `render.yaml` `buildFilter` claim - is correct: `mcp/render.yaml` has `paths: [mcp/**, data/**]` with a comment giving exactly the stated reason.

### B2. **"The fourth test file with no npm script" is false**
`talk-track.md:219-220`: *"`lib/review.test.mts` is a 400-day simulation, and it is the fourth test file with no npm script, `architecture.md` §9."*

`package.json` scripts: `test:review: npx tsx lib/review.test.mts`, plus `test:market`, `test:surfacing`, `test:insight`. Added in commit `5c75462`. Worse for the story: `.github/workflows/ci.yml:22-25` now runs **all four** suites and `:31` runs `python3 scripts/verify-docs.py`. `docs/platform/architecture.md:671-674` is stale in the same two ways ("`lib/review.test.mts` has no script"; "It does **not** run the test suites"). The §4 table entry at `talk-track.md:396` - *"`.github/workflows/ci.yml` on Node 22; `verify-docs.py`"* - is correct (`node-version: 22`), so the file contradicts itself.

### B3. **§3.5's "Five claims asserted a zero that is not a zero" should be six**
`talk-track.md:321`. `docs/research/2026-09-07-gap-claims-challenge.md:5`: *"I independently confirmed six gap claims that assert a zero which is not a zero"* - and again in the same line, the registry *"tells the dashboard 'No plan row covers this' about six things the plan demonstrably covers."* `lib/market/benchmark.ts:300` agrees: *"used to be printed unconditionally, and it was false for six entries."* The doc itself says **six** eleven lines later (`talk-track.md:332`). The "five" appears to be borrowed from a different fact in the same source line - the five gaps refuted on *all three* lenses (`customer-enablement-training`, `public-sector-acquisition`, `agent-frameworks-named`, `synthetic-data-generation`, `distillation-slm`).

### B4. "Thirteen died on coverage alone" - the lens numbers say otherwise
`talk-track.md:311`. Source: *"`worth-closing` refuted 18/18, `find-the-coverage` refuted 13/18, `jd-evidence` refuted 9/18."* Since `worth-closing` refuted **all eighteen**, nothing died on coverage *alone*. The true statement is "thirteen were refuted by the coverage lens." Small wording, but it is the sentence that carries the paragraph's punch and it inverts an interviewer-checkable ratio.

### B5. `RESEND_API_KEY` is not on the Render box
`talk-track.md:51-52`: *"That box holds `GITHUB_TOKEN` … plus `MINIMAX_API_KEY`, `RESEND_API_KEY` and `MCP_API_KEY` (`architecture.md` §8)."* `grep -o "process\.env\.[A-Z_]*" mcp/server.js` returns `GITHUB_*`, `LUMEN_*`, `MCP_API_KEY`, `MINIMAX_API_KEY`, `PORT`, `PUBLIC_MCP_URL`, `SURFSENSE_*` - **no `RESEND_API_KEY`**. The cited source disagrees too: `architecture.md:633` lists `RESEND_API_KEY | both crons |`, and the crons run on Vercel. Three of the four named secrets check out; this is the isolation argument's blast-radius claim, so the padding is unhelpful. (The wording is inherited verbatim from commit `53fcb77`'s body, so the doc is faithful to its source - the source is the thing that's wrong.) Everything else in §2.1 verifies: `app/api/sandbox/route.ts:25` `NAME = "lumen-study"`, `:26` `VCPUS = 1`, `:78` `env: {}`; "all nine secret names absent; 18 environment variables total" is verbatim from `53fcb77`.

### B6. "Two calls … both ≤80 words" - they are ≤60 and ≤80
`talk-track.md:88`. `app/api/cron/market-scan/route.ts:290` (`weeklyFraming`) = *"In 60 words or fewer"*; `:311` (`quaereReading`) = *"In 80 words or fewer"*. Literally true as an upper bound, but `architecture.md:514-515` states the split correctly and the 60 is load-bearing three sections later - §3.4's whole leak story turns on the prompt saying "In 60 words or fewer." Saying "both ≤80" throws away the setup.

### B7. `208 adjacent` is correct-as-cited but the live file now says 206
`talk-track.md:103-107`. The doc dates the claim ("On the 2026-09-07 scan"), and I confirmed by walking `git log -- reports/market/benchmark.json`: the 2026-09-07T17:37:03Z snapshot had `adjacentCount: 208` (the 09:33Z run that morning had 207). Today's `reports/market/benchmark.json` reads `day: 2026-09-08`, `adjacentCount: 206`, `adjacentCompanyCount: 17`, `coreCount: 189`, `companyCount: 23`, `leadershipCount: 21`. Recomputing from `reports/market/index.json` myself: 750 stored records, 382 core postings → **189** distinct across **23** companies; 342 adjacent postings → 208 distinct all-time, **206** with `lastSeen == 2026-09-08`; 21 distinct leadership. So: honestly cited, arithmetic sound, and the load-bearing claim ("adjacent outnumbers core") holds at 206 too - but if he says "208" and the interviewer opens the repo, the file says 206. Same for `talk-track.md:426` ("Readiness on the 2026-09-07 scan is 0%"): still 0% today (`insight.json` `day: 2026-09-08`, `pct: 0`, `totalWeight: 490`, `skillCount: 34`, `matchedCount: 2`) - only the date is stale.

### B8. "LangChain's 15 city clones are one role" - currently 11
`talk-track.md:113-114`. In `reports/market/index.json` today, LangChain has 26 postings over 7 dedupe keys; the largest group is `langchain::deployed engineer` with **11**. The "fifteen" comes from `lib/market/classify.ts:157`, `lib/market/benchmark.ts:198` and `lib/market/skills.ts:153`, which all still say fifteen. The companion claim in the same sentence is exact: **Palantir has 63 postings over 26 distinct keys** ✓, matching `benchmark.ts:150`'s "one company's 26 cloned reqs."

### B9. "Four round trips" is now five
`talk-track.md:265` (and `architecture.md:500`). `app/api/cron/market-scan/route.ts` has five sequential `writeJson` calls on the success path: `:539` index, `:559` benchmark, `:560` trend, `:564` history, `:594` insight. Commit `b6c1ef7` said "three"; `insight.json` was added later by `a2dc060`. Trivially stale, but it's a number in a sentence about a cost he quantifies.

---

## Claims that are correct - one line each

- **§2.1 sandbox isolation.** `env: {}`, `lumen-study`, 1 vCPU, no PTY, NDJSON - all verified in `app/api/sandbox/route.ts:25-28,74-78`; commit `53fcb77` exists with the matching subject and body.
- **§2.2 deterministic matcher.** `lib/market/skills.ts:14-25,296-301` is include/exclude phrase matching with an optional proximity window; `data/market-skill-map.json` has exactly 34 hand-authored skills; `lib/market/benchmark.ts:16-18` states "No model is involved on this path at all," so the Market tab really calls no model at request time.
- **§2.3 CORE vs ADJACENT.** Independently recomputed from `index.json`: 189 core / 23 companies, adjacent > core, 21 leadership. Dedupe before counting, seniority preserved, location stripped - `lib/market/classify.ts:157-185`. "Databricks alone returned 105 core and 161 adjacent before dedupe" is verbatim from `355fede`'s table.
- **§2.4 statement-string scope error.** Every measurement checks out against `docs/superpowers/specs/2026-09-07-market-tab-layout-design.md:8-15`: 34 coverage entries, 2 at 0%, 133 plan-row chips all "not started", 9,025 characters, all 34 sentences containing "of core FDE requisitions" (`benchmark.ts:281` emits that exact suffix). Commit `ab9920c` exists with the matching subject.
- **§2.5 GitHub-as-database.** `synced:false` ≠ empty, sha-carrying write, sequential-because-branch-ref - all as described.
- **§2.6 verify-docs.** `scripts/verify-docs.py:30,110-115` - anchor regex, unknown anchor is a hard error, live scan output deliberately unanchorable. The `build-curriculum.py` precedent is real: `scripts/build-curriculum.py:40` - `# renumber silently desynced 90 files once, so drift is now a hard error.`
- **§2.7 MCP surface (except B1).** 18 tools, `MAX_BODY = 128 * 1024` (`mcp/server.js:7`), `RATE_LIMIT = 30` / `RATE_WINDOW_MS = 60_000` (`:9-10`), in-memory `get_audit_log` + durable `reports/audit/*.json` from the two mutating tools.
- **§2.8 scheduler.** `lib/review.ts:20` `LADDER = [1, 7, 21, 60, 150, 240, 330]`; `:25-27` - *"simulated over 400 days … the cap binds on 386 days and 547 of 700 prompts are still untouched"* - exact; `recall-bank.json` has 1,710 prompts; `gone` → `Math.max(0, current - 2)` at `:60`; backlog never rendered (`:118-121`). Only the npm-script clause (B2) is wrong.
- **§3.1 the reverted 117 of 119.** Every number matches commit `aa18478`'s body verbatim, and I confirmed the endpoints against the data: `Plan[1][13] = 14.0`, `Plan[116]` = M23 / 17.0h.
- **§3.2 the write race.** Commit `b6c1ef7`; the lost-file set (index, trend, history written; benchmark lost) is exact; "~47 MB" matches `lib/market/store.ts:68` (46.98 MB).
- **§3.3 truncation guard.** The best-evidenced item in the file. `lib/market/fetch.ts:138-146` contains, in a code comment, every number the doc quotes: Databricks 97 of 870 → match-floor 58, total-floor 522, Decagon 10 of 139 → floor 83. `const floor = Math.floor(source.verifiedTotal * 0.6)` is at `fetch.ts:144` exactly as cited, and all 32 boards in `market-sources.json` carry `verifiedTotal`.
- **§3.4 the digit leak.** `market-scan/route.ts:260-273` carries the whole story including *"Verified live: 'Coverage sits at 58% this week' shipped under both."* Caveat worth knowing: the illustrative `row 58, "…" - 18h, month 4` is verbatim from the code comment, but `Plan[58]` is 11.5h / month 14 (18h / month 14 is row 59). The doc faithfully reproduces a source that doesn't match the workbook.
- **§3.5 gap registry.** "All 18 claims were refuted" ✓; 4 deleted / 3 rewritten / 3 frequencies corrected / 13 remain ✓ (`_gapsNote` verbatim; `gaps` has 13; git shows the registry went 17 → 13, so 17−4=13 is internally consistent - the "18" is the count of claims across the three taxonomy docs, not registry entries); "12 of 15 JDs, weakest plan match" ✓ (`pattern-codification.statedFrequency`); knowledge-graphs 3/95 → 1 distinct at 0.999 ✓; public-sector 4/15 → 1/20 ✓; row 99 `subtopics[16]` is a **15-minute** subtopic with the full soft-teacher objective and a `torch.nn.KLDivLoss` resource - exactly as described; `benchmark.ts:300-308` confirms the unconditional-string fix. Only the "five/six" (B3) and "coverage alone" (B4) are off.
- **§3.6 clone groups and the Tokyo role.** Every measured number matches commit `155e26a`'s body line-for-line: `no move at all 5 -> 7 across 1 -> 3 companies`, `without leaving IN 7 -> 11 across 2 -> 5`, `segments with reachable roles: 1 -> 3`. Today's `insight.json` still reads india-remote 4 + emea-apac-remote 3 = 7, +india-office 4 = 11 across 5 companies ✓, so `talk-track.md:415`'s "11 roles takeable without leaving India" is current.
- **Two smaller ones (§3.7).** `20d75b7` and `9e2db40` both exist with matching subjects; `architecture.md:653-658` corroborates the removed OIDC pre-flight.
- **§5 and §6.** 117 `Not started` / 2 `Skipped` ✓; 0 of 490 share points, 0 of 34 skills, 2 matched events ✓; `insight.ts` reads progress events and never col 15 ✓; tracks M/N/O = 3 tracks, 26 rows, 335h, 21% of 1588 ✓ (`benchmark.json` `overInvestedTotal`); `index.json` = **438.9 KB** at **750** records ✓; `MAX_REQS = 3000` at `lib/market/store.ts:251` ✓; `/api/progress` GET is an N+1 ✓ (`route.ts:24`).
- **All nine commit SHAs** cited in the document (`53fcb77`, `355fede`, `ab9920c`, `b6c1ef7`, `a9f082c`, `9e2db40`, `aa18478`, `155e26a`, `20d75b7`) resolve, and every subject line matches the work the doc attributes to it.

---

## One thing missing rather than wrong

§3 opens *"Six of these"* and presents itself as the complete "what I got wrong" set. Commit `88a619c` - the commit that last edited this file - documents three more verified defects that are not in it, all of them better interview material than the one §2.7 currently volunteers: **`get_syllabus` took a 0-based index while every market statement cites a 1-based row**, so following "row 28" into its syllabus silently returned row 29's content; **`read_ask_report`'s `startsWith("reports/asks/")` guard was defeated by WHATWG `..` collapsing**, verified to resolve `reports/asks/../../data/workbook.json`; and the auth fail-open of B1. The off-by-one one is directly on-theme for a document whose §4 header exists to explain the 1-based/0-based seam.

---

## Verdict

**Yes - rely on it, after fixing three things.** The quantitative spine is sound: `verify-docs.py` passes all 52 anchors, every commit SHA resolves to the work claimed, and I independently re-derived 189/23/750/490/34/13/11/2236/1588 from the raw files rather than the doc. The defect pattern is narrow and consistent - three claims went stale when later commits improved the system, and the doc was not re-read against them. Nothing here is invented.

**Top three to fix:**

1. **`talk-track.md:196-198` - delete or invert the `MCP_API_KEY` fail-open paragraph.** `mcp/server.js:452-454` now returns 503 when the key is unset; the function is `authError`, not `allowed()`. As written he would volunteer a credential vulnerability he has already fixed. Fix `architecture.md:648` in the same pass. Consider replacing it with the `read_ask_report` traversal defect from `88a619c`, which *is* a real trust-boundary story and is currently in no document.
2. **`talk-track.md:405` and `:204` - row 52 is M12, not M13.** It is the row backing the MCP server, the most-cited artifact in the file, and it is the one number here an interviewer could contradict from a single `data/workbook.json` lookup. While in the table, fix `:414`/`:119`'s row 91 title to the real "Target list: 40 companies, referrals, warm intros."
3. **`talk-track.md:220` - drop "the fourth test file with no npm script."** `package.json` has `test:review` and `.github/workflows/ci.yml:22-25,31` runs all four suites plus `verify-docs.py`. The truthful version is strictly better for §2.6's argument: the drift checker and all four suites are now build-blocking. Fix `architecture.md:671-674` too.

Then, cheaply, in one editing pass: `:321` five → six; `:311` "died on coverage alone" → "were refuted by the coverage lens"; `:88` "both ≤80 words" → "≤60 and ≤80"; `:52` drop `RESEND_API_KEY`; `:265` four → five round trips; `:114` LangChain's clone group is 11 today, not 15; and re-date §2.3/§5 to the current scan (206 adjacent) or state plainly that the figures are the 2026-09-07 17:37Z snapshot.

# ===== SWEEP: surfaces =====

**GROUND TRUTH - re-derived independently, all confirmed.** `data/workbook.json` Plan: 119 data rows, 117 active (col 15 `"Skipped"` on 2), 1,588.0 active hours / 1,614.0 total (col 13), months 1.0-23.0 (23 distinct). Sheets present: `Plan, Mocks, Roadmaps, CompReality` - no `Dashboard`, and nothing in the codebase reads one (only `docs/lumen-fde-architecture.md:48` mentions it, as history). `curriculum.json` 119 topics / 2,236 subtopics, byte-identical to the 119 `data/curriculum/NN.json` sources. `mcp/server.js` 18 tools. `TABS` 10. `vercel.json` 2 crons. `market-sources.json` 32 boards / 27 enabled (declared counts match actual). `npx tsc --noEmit` exits 0; `npx tsx lib/review.test.mts` all assertions pass; `python3 scripts/verify-docs.py` → "checked 52 anchors across 4 files".

---

## 1. app/page.tsx - the six unexercised tabs

Ran `next dev -p 3111` with `LUMEN_PASSWORD=` and drove all six in the browser, reading rendered text and DOM rather than screenshots.

**Correct:** Mocks (11 loops; the `Total` row and the one-cell note row are both dropped by `isDataRow`, targets sum to 57 = the sheet's own Total). Library (16 books / 2 repos / 10,521 pages, both repo links resolve). Assessments (static, accordion works). Comp reality (6 rows, all fields present). Every tab's data exists in the shape it reads - no tab touches a removed sheet.

### DEFECT - Overview "By track" counts skipped rows; every other figure on the same screen does not

`app/page.tsx:639`
```js
{tracks.map((name) => { const rows = planRows.filter((r) => r[0] === name); const h = rows.reduce((n, r) => n + Number(r[13] || 0), 0);
```
`planRows`, not `activeRows`, and the bar denominator is `rows.length`. This is exactly the scope bug the comment at `page.tsx:590-593` says was fixed ("Scope is now one definition: active = not skipped") - the By-track list was missed, and it uses an inlined `statuses[topicKey(r)] || r[15]` instead of the `statusOf` helper at `page.tsx:579`, which is how it drifted.

Reproduction (observed on the live page): the Pace-map header renders `1588h · 15 tracks`, the hero renders `Your 1588-hour Senior FDE plan`, and the By-track hours immediately below sum to **1,614** - I added the 15 rendered values. Two tracks diverge: `E. Backend and Data` renders "16 topics 210h" (active: 15 topics, 204h - row 43 PySpark is Skipped) and `F. Distributed Systems and System Design` renders "6 topics 112h" (active: 5 topics, 92h - row 46 MIT 6.824 Raft lab is Skipped). Second consequence: because the progress denominator is `rows.length`, marking every non-skipped topic in track F Done renders 5/6 = **83%**, never 100%. Same family, `page.tsx:649`: the footer pairs `{planRows.length} topics` (119) with `{hours} active hours` (1588).

### DEFECT - Roadmaps renders a dead `href="null"` card, bypassing the guard written for exactly this

`app/page.tsx:644`
```js
{roadmapRows.map((r, i) => <a className="resource-card" href={String(r[1])} target="_blank" rel="noreferrer" key={i}>
```
Raw `<a>`, not the `Link` component at `app/page.tsx:31`, whose entire purpose is `if (!href.startsWith("http")) return <span className="resource-link no-link" title="No resource assigned">`. `data/workbook.json` Roadmaps row 12 is `["prior GTM lab FDE Skills Matrix (your upload)", null, "Ratings used to weight tracks J and K"]` - `String(null)` is `"null"`.

Reproduction: open Roadmaps, run `[...document.querySelectorAll('.resource-card')].map(a=>({raw:a.getAttribute('href'),resolved:a.href}))`. Card 12 returns `{raw:"null", resolved:"http://localhost:3111/null"}`. `curl -o /dev/null -w "%{http_code}" http://localhost:3111/null` → **404**. With the gate on (`LUMEN_PASSWORD=testpw`, port 3112) `/null` → **307 → /login**, so in production the card opens a login page in a new tab. The other 15 cards are all valid `https://`.

### DEFECT (low) - Comp reality colours by row index; the same six facts on Overview colour by verdict prose

`app/page.tsx:646` emits `className={`prob prob-${i}`}`; `app/globals.css:45` defines only `.prob-0,.prob-1{color:var(--danger)}.prob-2,.prob-3{color:var(--teal)}`. Measured in the DOM: prob-0/1 `rgb(218,98,104)`, prob-2/3 `rgb(39,166,68)`, **prob-4 and prob-5 fall through to `rgb(138,143,152)`** - there is no rule for them. The colours happen to read correctly today only because the sheet's row order happens to be Low, Very low, Realistic, High. Meanwhile `app/page.tsx:557-570` (`marketTiers`, Overview) derives the same six tones from the verdict text and is order-independent. Reproduction: swap CompReality rows 0 and 3 in the sheet - Overview still renders "High in 3-6 months" green; Comp reality renders it as `prob-0`, red.

### DEFECT - the Mocks month column was never renumbered; it points at the pre-rebaseline calendar

`app/page.tsx:643` renders `M{String(r[3])}` from the Mocks sheet. The Mocks tab shows M6/M8/M9. The plan now runs to M23, and the corresponding Plan work sits at M18-M21: Plan "Take-home rehearsals (four, five hours each, recorded walkthrough)" is **M19** while Mocks "Take-home builds (5h each, with video walkthrough)" renders **M9**; Plan "STAR stories (ten) and two full-loop simulations" is **M21** while Mocks "Behavioural (STAR) sessions" and "Full-loop simulations" both render **M9**.

Root cause, `scripts/renumber-months.py:39` and `:102`:
```py
    header, rows = wb["Plan"][0], wb["Plan"][1:]
        wb["Plan"] = [header] + new_rows
```
It only ever touches `wb["Plan"]`. The Mocks sheet carries its own Month column (index 3) that the script does not know about, so its own docstring instruction - "Run it again after any change to the Hours column ... re-baselining Hours without re-running this leaves the calendar lying" - leaves the Mocks calendar lying. `grep -n 'Mocks' scripts/renumber-months.py` returns nothing.

---

## 2. lib/review.ts + app/recall.tsx - drills now reach the UI, and the branch is wrong

`eligible()` is correct. Verified against the shipped bank, not just the fixture: `eligible(1710 prompts)` → **357 scheduled, 119 drills / 238 recall**, up from 0 drills before the round robin. `data/recall-bank.json` is 875 drill + 835 recall; every one of the 119 topics leads with recall in bank order, which is why the old array-order cut deleted 100% of drills. `npx tsx lib/review.test.mts` passes including the 400-day simulation (100% introduced, 6 still due at end).

I reached the drill branch for the first time by seeding `localStorage`: `lumen-statuses = {"A. Linux, Networking, Shell::Shell mastery and scripting":"In progress"}` and `lumen-review = {"q0-0":{rung:2,due:"2027-01-01",seen:3},"q0-1":{...}}`, then reloading. The strip rendered `label: "Failure drill"` and the drill prompt. Both branches execute; neither crashes.

### DEFECT - the drill card states its own answer inside the question

`app/recall.tsx:117`
```js
<p className="recall-prompt">{card.kind === "drill" ? `What goes wrong, and how would you catch it? - ${card.p}` : card.p}</p>
```
`card.p` for a drill is `curriculum.failureModes[n]` verbatim (`scripts/build-curriculum.py:67`: `prompts.append({"i": int(i), "k": f"f{i}-{n}", "kind": "drill", "p": f})`), and a failure mode is written as a complete declarative account of the failure, its mechanism and its symptom. So the card asks a question whose answer is its own body.

Verbatim from the running page:

> **What goes wrong, and how would you catch it?** - The nightly loader has `set -e` but its critical step is `extract | tee extract.log`; without pipefail the pipeline exits 0 when extract fails, the empty file loads cleanly, and cron reports success for three weeks before the customer notices stale dashboards.

There is nothing to retrieve - the what, the why and the detection latency are all handed over. This defeats the design principle stated at `app/recall.tsx:19-21` ("Recognition ... is the illusion that makes rereading feel productive; committing an answer first is what makes it retrieval") for **119 of the 357 scheduled cards, 33% of the schedule**. It has never been visible until now, which is why it was never caught. Every drill has this shape; sampled `f0-0, f0-1, f41-5, f41-6, f109-6, f109-7` - all six are full narratives of the failure.

Related, same branch: **43 of the 875 drills begin lowercase** (`f3-6` → "…and how would you catch it? - nf_conntrack table full or ephemeral port exhaustion…"), so the template produces a sentence fragment; 2 of those are among the 119 that actually schedule.

### DEFECT (low) - the drill reveal shows the topic's generic outcomes, not anything about the failure drilled

`app/recall.tsx:137-140` renders `meta?.outcomes` unconditionally; `data/recall-bank.json` `meta` has only `{topic, track, outcomes}` - no per-drill reference exists. Observed after clicking Reveal on `f0-0`: the reference is the three closed-book outcomes for "Shell mastery and scripting". For topic 0 they coincidentally mention pipefail; for a card like `f109-6` (isolation-forest `contamination` default flooding an alert queue at 0.172% true rate) the reveal would be the topic's generic outcomes with no bearing on the specific failure. A recall card and a drill card for the same topic show byte-identical references.

---

## 3. app/api/ask/route.ts - the market block is bounded; the plan numbering is not consistent

All six inputs still have the shape the route expects. `curriculum.json` is `{topics: Record<"0".."118", …>}` and `syllabusContext` at `:20` indexes it as such - I checked all 119 for the six fields it reads (`topic, why, prerequisites, subtopics[{name,learn}], outcomes, failureModes`): **zero missing or empty**. `workbook.Plan` col 15 / col 13 / col 0-2 all present on all 119 rows. `library-context.json` (16 entries, 5,207 chars stringified), `library-sources.json` (`{indexedAt, sourceCount, sources}`, 16,010 chars), `repository-context.json` (2 entries, 1,421 chars) are injected wholesale into the system prompt; no absolute paths or filenames leak (`grep -c "/Users/"` → 0). `tsc --noEmit` clean.

**Market context is bounded - one line, because it is correct.** I executed the `marketContext` fill logic at `route.ts:125-169` against the real `reports/market/benchmark.json` + `insight.json`: pre-coverage block 4,617 chars, **8 of 10** coverage statements kept, final digest **6,813 of the 7,000 `MARKET_CAP`**, tail slice at `:168` does **not** fire. That matches the comment at `:115-117` ("renders 6,740, holding eight coverage statements") within data drift. The `header(COVERAGE_LINES)` reserve at `:159` over-estimates by ≥1 char in every case, so it cannot under-reserve.

One latent gap worth naming rather than a defect: only the coverage block is fill-checked. `route.ts:144` maps `insight.segments` in full with no slice, unlike `readiness.marginal` (sliced to 5 at `:141`). If the pre-coverage block alone ever crossed 7,000, `kept` would be empty and `:168`'s blunt `text.slice(0, MARKET_CAP)` would bisect a statement mid-numeral - precisely what `:119-121` says must never happen. Not reachable today: `lib/market/insight.ts:109` defines `SEGMENT_LABEL` as a closed set of 5, so segment count cannot grow without a code change. Today's 5 segments cost 1,962 of the 4,617; it would take ~11 more.

### DEFECT - Quaere is handed two incompatible numbering schemes for plan rows in the same message

`app/api/ask/route.ts:43,51-52`
```js
    const active = rows.filter((r) => String(r[15]).trim().toLowerCase() !== "skipped");
  const lines = active.map((r, i) => `${i}. [M${r[1]}] ${r[0]} :: ${r[2]} (${r[13]}h) - ${r[15]}`).join("\n");
  return `THE FULL PLAN - ${active.length} active topics, …\nThis is the complete plan; nothing is hidden from you.\n\n…`;
```
`i` is a 0-based index into the 117 **active** rows. The market digest appended to the same user message at `route.ts:220` numbers rows 1-based over all 119 (`page.tsx:211` documents the convention: "plan row N is `planRows[N - 1]`"), and `MARKET_RULE` at `:180-185` instructs the model to quote those numbers verbatim. The offset is not even constant - it is −1 before the first Skipped row (index 42) and −3 after it.

Reproduction, from the shipped `insight.json` and `workbook.json`:

| the model is told | resolves to |
|---|---|
| market: `NEXT - row 28, "Production Python architecture: domain models, repositories, DI, packaging"` | `workbook.Plan[28]` ✓ |
| planMap: `28. [M…] … :: FastAPI in production: DI, settings, lifespan, background tasks, workers, deployment` | a different topic |
| market: `row 59, "Evals as infrastructure: eval sets, LLM-as-judge, human review, CI gates"` | `workbook.Plan[59]` ✓ |
| planMap: `59. … :: Serving at scale: vLLM, quantisation, KV cache, batching, GPU maths` | a different topic |

Same for row 81 (market: "Narrative: why FDE, why this company, travel, comp"; planMap 81: "Decomposition drills (ten)"). Ask "tell me about row 59" and the model has two contradictory answers in its context and no way to choose.

### DEFECT - planMap asserts completeness while silently omitting the 2 skipped topics

Same three lines. `route.ts:43` drops Skipped rows, then `:52` prints **"This is the complete plan; nothing is hidden from you."**, and the system prompt at `:218` reinforces it: *"The user message contains the COMPLETE plan - every topic across every track. Never tell the learner a subject is missing from the plan without checking that full list first."* Both statements are false - `PySpark (optional: Databricks- or Palantir-style roles only)` (row 43) and `MIT 6.824 Raft lab (optional deep dive)` (row 46) are not in the text.

Reproduction: ask "Does my plan cover PySpark?" with no topic expanded. `syllabusContext` returns `""` (no `topicIndex`), the market digest names neither, and the only plan text present omits both rows - while explicitly instructing the model to trust that list as complete. The answer will be "there is no PySpark topic in your plan," which is the *exact* failure this function was written to fix, documented at `route.ts:31-35` and again at `page.tsx:43-45` ("Quaere once answered 'there is no ML topic in the visible plan'"). The fix moved the truncation from 8-of-119 to 117-of-119; it did not remove it.

Minor, same flow: `page.tsx:626` sends `history: messages` where each item is `{role, content, reportUrl?}`, and `route.ts:219` forwards `.slice(-8)` straight into the MiniMax `messages` array without picking `{role, content}` - assistant turns that saved a report ship a stray `reportUrl` field to an OpenAI-shaped API.

---

## 4. proxy.ts + lib/auth.ts - the gate

Next 16.3.4 is installed, so `proxy.ts` is the live middleware entrypoint (not an inert file). I verified the exempt set empirically rather than by reading the regex - dev server on 3112 with `LUMEN_PASSWORD=testpw`:

| path | result |
|---|---|
| `/`, `/reports`, `/null` | 307 → `/login` |
| `/login` | 200 |
| `/api/{ask,progress,review,market,curriculum,recall,sandbox}` | 401 |
| `/api/auth/login` | 405 (route reached; POST-only) |
| `/api/cron/{market-scan,daily-digest}` | **401** |
| `/icon.svg`, `/favicon.ico`, `/apple-icon.png`, `/opengraph-image.png` | 200 |
| `/robots.txt`, `/sitemap.xml`, `/manifest.webmanifest` | 404 (no such route) |

**The intended set is correct, and both new surfaces are covered.** `/api/cron` must bypass the cookie gate because Vercel Cron cannot present a session, and both routes fail closed on their own secret - `app/api/cron/market-scan/route.ts:416-417` and `app/api/cron/daily-digest/route.ts:405-406`, identical: `if (!secret || request.headers.get("authorization") !== \`Bearer ${secret}\`) return new Response("Unauthorized", { status: 401 })`. The 401s above are those checks firing, not the gate. The MCP surface is also covered: `grep` over `mcp/server.js` shows exactly one call to the dashboard - `mcp/server.js:150`, `ask_lumen` posting to `LUMEN_ASK_URL` with `x-lumen-internal-key` - which is the one exemption `proxy.ts:14` grants. Every other MCP tool talks to GitHub directly. Verified: POST `/api/ask` with no key → 401, with a wrong key → 401. `/api/auth` is exempt by prefix but contains only the login route, which is IP-rate-limited (`lib/auth.ts:26-31`, 8 attempts / 10 min).

Two observations rather than defects, both about how that set will age:

1. **`proxy.ts:13` exempts by prefix - `path.startsWith("/api/cron")` - and the fail-closed property is duplicated, not shared.** `grep -rn CRON_SECRET --include=*.ts` returns exactly two hits, the two copy-pasted route bodies above; there is no helper. Any third route added under `app/api/cron/` is public the moment it is created and stays public until someone remembers to paste those two lines. The prefix also matches `/api/crontab`, `/api/cron-anything` - nothing exists there today.

2. **The two keys guarding the same trust boundary are compared differently.** `mcp/server.js:456-457` uses `crypto.timingSafeEqual` with an explicit length check for `MCP_API_KEY`; `proxy.ts:14` uses `===` for `LUMEN_INTERNAL_API_KEY`, and `lib/auth.ts:17` uses `===` for the session HMAC. The MCP author decided timing-safety mattered for a key that unlocks Quaere; the internal key unlocks the same tool plus `saveAskReport`, which commits a file into the repo (`app/api/ask/route.ts:199`), and `/api/ask` has no rate limit of its own while `/mcp` does (`mcp/server.js:459`).