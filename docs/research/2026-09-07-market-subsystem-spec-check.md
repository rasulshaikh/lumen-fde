# Spec conformance audit — job-market benchmark subsystem

Spec: `/Users/rasul/senior-fde-dashboard/docs/research/2026-09-07-job-market-benchmark-spec.md`
Verification: `npx tsc --noEmit` clean; `npm run test:market` → **all assertions passed** (54). No files edited.

---

## Correction to the task premise

The task says **30 boards**. Neither the spec nor the build says 30 — the spec says **27**. `data/market-sources.json` carries **32 entries, 27 enabled** (`boardCount: 32`, `enabledCount: 27`, lines 5–6), split 15 Ashby / 11 Greenhouse / 1 Lever, exactly the spec's Tier A/B/C tables. `BOARD_COUNT = 27` at `lib/market/benchmark.ts:28`; `benchmark.test.mts:345` asserts the constant equals the enabled-set size.

---

## Section 1 — Sources

15 Ashby (`market-sources.json:8–543`), 11 Greenhouse with bare listings, no `?content=true` (`:545–938`), 1 Lever (`:940–972`) — **IMPLEMENTED**. `verifiedMatches`/`verifiedBytes` match the spec tables on all 27 (OpenAI 72/12,913,585; Snowflake 81; Applied 30; Sierra 55; Databricks 97/745,127; Palantir 110/5,978,887). Every entry carries `verifiedAt` and a one-line `why` — zero missing across all 32. Aggregators absent (grep `remotive|remoteok`: 0 hits).

**Token exactness — each verified individually:** Anduril `andurilindustries` (:977) ✅ · Glean `gleanwork` (:812) ✅ · Applied Intuition `applied` (:84) ✅ · Mistral `mistral.ai` (:205, dot included) ✅ · dbt Labs on `fivetran` (:737–740) ✅ · Palantir `"ats": "lever"` (:942) ✅

**Anyscale Lever-tombstone note — IMPLEMENTED.** `:542`: *"LEVER TOMBSTONE: api.lever.co/v0/postings/anyscale returns HTTP 200 with a single fake posting…never fall back by slug guessing or accept a 200 without checking the body."* Enforced structurally at `lib/market/fetch.ts:86–90` — dispatch is on the pinned `source.ats`; no slug-guessing path exists. Mistral's empty-`[]` Lever board also noted (`:234`).

**Disabled WITH reasons — each verified:** Anduril `:975`/`why :1005` (clearance gating, 2.33 MB for 2,211 rows) · Vannevar `:1009`/`:1036` (TS/SCI, onsite classified) · Retool `:1040`/`:1065` (Gem GraphQL fragility; `ats: "gem"` deliberately outside the adapter set) · Hugging Face `:1069`/`:1095` (Workable widget, 0 matches; `ats: "workable"` outside the set) · W&B `:1099`/`:1127` (bonus). **DEVIATED, an improvement** — the spec deletes these; the build keeps them disabled with audited evidence and unguessable tokens preserved. `market-scan/route.ts:206` filters on `enabled`; `fetch.ts:117` returns `unsupported ats` if one were enabled.

---

## Section 2 — Fetch architecture

**All IMPLEMENTED:** 45 s per-board timeout (`fetch.ts:78,:120`), concurrency 6 (`route.ts:40`), full `Posting` shape incl. `titleRaw` (`fetch.ts:49–73`), mandatory `title.trim()` first (`:211`, evidence `:200–209`, tests `:185–188`), case-insensitive throughout (`classify.ts:58`), per-company patterns never global (`:258`, rule `:6–17`, tests `:171–172`), **exclude[] beats core/adjacent** (`:262–264`), stage 2 Greenhouse-only and unseen-only (`route.ts:94–95`, `fetch.ts:164`) at concurrency 4 / 20 s (`:80–81`, gate `:187–198`), failed JD → `skills: null` and excluded (`route.ts:130`, `store.ts:201`, `benchmark.ts:211`), seen-set authoritative with `updated_at` explicitly refused (`fetch.ts:271–275`), cold start → `baseline: true`, no new-roles list (`benchmark.ts:248,:369`, tests `:341–342`), `Promise.allSettled` + per-board catch (`route.ts:236,:228`), board status record (`store.ts:29–36`), **missing-sweep only for `ok` boards** (`store.ts:225`, rationale `:213–218`), `boardsOk < 24` suppression (`benchmark.ts:38,:400–402`, tab `page.tsx:170`, tests `:331–335` assert the literal `partial scan, 23 of 27 boards, deltas suppressed`).

**Both fieldGuards — verified individually:**
- **Sierra:** `market-sources.json:144–155` — `type: "require"`, `titleContains: "Software Engineer, Agent"`, `require: { department: "Engineering", team: "Agent Engineering" }`. Enforced `classify.ts:229–234,:269`. Tests `:173–175`.
- **Baseten:** `:324–335` — `type: "promote"`, `teamContainsAny: ["FDE","Forward Deployed"]`, `effect: "core"`. Enforced `classify.ts:270`. Tests `:176–177` assert `AI Inference Engineer` is core on team `FDE` and `null` on team `Model Performance` — the exact case the spec says a title-only filter misses.

**Never classify on description text:** `classify.ts` never reads `posting.jd` (grep-verified); rationale `:12–17`.

**The cursor escape hatch — verified individually:** cursor is the next board to start (`store.ts:73`, resumed `route.ts:209`); deadline checked **before starting** each board (`:226`); `SCAN_DEADLINE_MS` defaults `220_000` (`:44`); returns `{ partial, cursor }` (`:327–328`); sweep and recompute **only when the cursor wraps to 0** (`:260–264`); `maxDuration` deliberately undeclared for Hobby (`:27–35`). One addition beyond spec, and it is a **fix**: `confirmedIds()` (`:162–174`) — without it the cycle-completing run would mark every req on earlier-visited boards as missing.

---

## Section 3 — Storage

**All IMPLEMENTED:** read/write-whole-with-sha mirroring `app/api/review/route.ts` (`store.ts:109–153`), token-missing degrade (`:110,:131`), `synced: false` ≠ empty enforced by refusing to scan (`route.ts:195–199`), index and req shapes exact (`:69–79`, `:41–67`), **JD text never stored** (`:53–66`), **14-day decay** (`:156` `MISSING_DAYS = 14`, `:230`), **3,000 cap evicting oldest `lastSeen`** (`:158` `MAX_REQS = 3000`, `:250–262`), **junior/unmatched never written** (`:185`; `route.ts:246` only records what `markSeen` stored), benchmark/trend shapes (`benchmark.ts:111–135`, `store.ts:81,:160,:271–275`), history write-only with no listing anywhere (`:26`, `app/api/market/route.ts:22`).

---

## Section 4 — The benchmark

**All IMPLEMENTED:** CORE-only headline (`benchmark.ts:238–241,:257`), all 12 house-equivalent CORE titles, dedupe with a curated 230-entry location vocabulary (`classify.ts:85–185`), **seniority kept** (`:150–153`, tests `:189–195`), clone collapse (tests `:200,:299,:301`), denominator always a pair (`benchmark.ts:149–150`, test `:313`), static + auto-60% boilerplate (`skills.ts:200–206,:159–176`, tests `:226–229`), unescape-then-strip (`:117–131`, tests `:207–209`), 6 head + 6 tail markers (`:219,:221,:227`), include/exclude/proximity/minDistinctForms (`:262–308`), presence-not-occurrence (`:272–274`), capability terms only with `Applied AI` absent (`_rules[0]`), gaps reported never inferred (17 entries, `benchmark.ts:283–303`, test `:350`), cols 1/13/15 live from workbook with header-at-index-0 (`:167–179`, test `:316`), tab merges `lumen-statuses` (`page.tsx:151`), movement ≥3 pts or a 25/50/75 crossing else omitted (`:41–42,:413,:427`, tests `:324–328`). Over-investment **reproduces the spec headline exactly**: `Combined: 335h across 3 tracks and 26 rows - 21% of your 1588 active hours`.

**DEVIATED (improvements):** leadership split into a third class so `Head of Customer Engineering` can't count as a `Customer Engineer` and doesn't inflate ADJACENT (`classify.ts:194–209`; both printed `benchmark.ts:448`); no protected-token list needed because body and pattern normalize identically (`skills.ts:49–51`); tail markers split anywhere-vs-heading because "benefits"/"compensation" appear mid-sentence.

**DEVIATED (neutral):** 34 skills not 27 — 24 of the spec's 27 as skills, the other three (`pattern-codification`, `value-measurement`, `enablement-training`) moved to `gaps[]`, matching the spec's own Step-4 examples; 10 additions. Step-4 wording semantically identical, ASCII hyphens for dashes.

---

## Section 5 — Surfacing

| | Status | Proof |
|---|---|---|
| **a. Daily-digest section (max 3, core-only)** | **MISSING** | `app/api/cron/daily-digest/route.ts` has **zero** market references. The 3-line cap exists nowhere; `newSinceLastRun` is uncapped (`benchmark.ts:368–389`) |
| b. Market tab | IMPLEMENTED | `page.tsx:54` TABS, render `:355`, all four blocks from pre-computed `statement` strings (`:128–195`), `computedAt` always absolute (`:190`). DEVIATED: inline rather than `app/market.tsx` |
| **c. Weekly Monday email** | **MISSING** | grep `getUTCDay\|RESEND\|MINIMAX\|MARKET_TO_EMAIL` in `market-scan/route.ts`: **0 hits** |
| c. Tab never calls the model | IMPLEMENTED | no model reference in the subsystem |

---

## Section 6 — Files

All nine add-list library/API/data/test files IMPLEMENTED. Every spec-named assertion present and passing: `Field Marketing Manager` not core (`:170`), Perplexity `MTS (Software Engineer, Applied AI)` not core (`:171`), Sierra `Agent Builder` blocked by team guard (`:173–175`), Baseten `AI Inference Engineer` IS core via team (`:176`), `Technical Accounting & Reporting Senior Manager` ≠ `Technical Account` (`:178`), 15 LangChain clones → 1 (`:200,:299`). Bonus: `Field Engineer, International` doesn't trip the `Intern` exclude (`:179`).

`vercel.json` ✅ two crons, market-scan `0 3 * * *`, 30 min before the digest. `page.tsx` TABS ✅. Proxy unchanged ✅ (`proxy.ts:13`). `SCAN_DEADLINE_MS` ✅. Cron named `market-scan` not `job-scan` — DEVIATED, internally consistent. **`daily-digest/route.ts` MISSING.** `MARKET_TO_EMAIL` MISSING.

---

## Section 8 — Cut items: is anything built that should not be?

**Nothing. All eight correctly absent.** Full-text JD search — not built; `ReqRecord` has no JD field (`store.ts:41–67`). Salary extraction — not built; the only `salary`/`compensation` strings are `skills.ts:221`/`:227`, section-scoping **tail markers**, i.e. the spec-required logic that *discards* that text. Model-written extraction — zero model calls in the subsystem. Per-role fit scoring — not built. Historical backfill — not built and refused in the UI (`page.tsx:97`). Aggregators, Retool/HF adapters, Anduril/Vannevar, extra alerting — all absent.

---

## Two additional findings

**1. The truncation guard is materially weaker than spec.** §7 says store `verifiedTotal` and fail below 60% of it. The config stores no board total — only `verifiedMatches` and `verifiedBytes`. `fetch.ts:142–145` compares *posting count* against 60% of a *match count*, so Databricks' floor is 58 postings against a listing of several thousand: 100 of 4,000 rows passes as healthy. The Decagon case that motivated the guard (10 of 139) clears a floor of 20 only by luck. This is the spec's stated worst failure mode — a false negative that looks like success.

**2. `newSinceLastRun` is uncapped** despite "capped at 3" in §4 Step 4 and §5a. Harmless today; a defect the moment the digest lands.

---

## Direct answer

**Not ready to run against live boards as a complete system — the scan half is.**

Sections 1–4 are faithful, in places better than specified (the `confirmedIds` cursor fix, the leadership split, normalize-both-sides retiring the protected-token list, two safety valves on the 60% auto-stripper). Every guard the task named is present and test-pinned. Nothing from section 8's cut list was built. `tsc` clean, 54 assertions pass, 335h/21%/1,588 reproduced exactly. Missing is the **entire output half of section 5** — two of three surfaces don't exist.

Smallest set of changes:

1. **Weekly Monday email** — `app/api/cron/market-scan/route.ts`, inside `if (complete)`, gated on `now.getUTCDay() === 1`: render the existing `statement` strings, send via Resend to `MARKET_TO_EMAIL ?? DIGEST_TO_EMAIL`, one ≤60-word MiniMax paragraph reusing `clean()` from `daily-digest/route.ts` verbatim, with the digit post-check. Wiring, not logic — every number is already computed.
2. **Daily-digest section** — `app/api/cron/daily-digest/route.ts`: read `INDEX_PATH` via `lib/market/store.ts`, filter `class === "core" && firstSeen === today`, cap at 3 with "+N more", insert between `SHIP THIS` and `ANSWER THIS COLD`, wrapped in `try/catch` returning `[]`.
3. **Cap `newSinceLastRun` at 3** in `lib/market/benchmark.ts`.
4. **Strengthen the truncation guard** — add `verifiedTotal` to the 27 enabled boards, or compare `bytes` against 60% of the stored `verifiedBytes` at `lib/market/fetch.ts:142`.

Items 1–2 are required for the system to do what section 5 says it is for. Item 4 is required before you trust an unattended number.