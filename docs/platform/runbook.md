# Lumen FDE — runbook

What breaks, what it costs, and how to fix it.

Facts live in [`architecture.md`](./architecture.md). This file does not restate them; it cites
them. Where a number appears here it is either anchored for `scripts/verify-docs.py` or it names
the report file and the scan date it was read from.

Every entry in section 3 is a failure that **actually happened in this repository**. The commit
that fixed each one is named, because the commit message is the primary source and this document
is a summary of it.

Read section 1 first. It is the part that is true at 3am.

---

## 1. What you can see, and what you cannot

### There is no alerting. None.

Nothing pages, emails, or posts when the nightly scan fails. There is no Sentry, no
health-check pinger, no dead-man's switch, no Slack webhook. `grep -riE
"sentry|pagerduty|healthchecks|cronitor|uptimerobot"` over the repo returns nothing outside two
design documents that list alerting as deliberately not built.

The practical consequence, stated plainly: **if `/api/cron/market-scan` starts returning 502
tonight, it will keep returning 502 every night and the only thing that changes is that the
Market tab's numbers get older.** The tab renders whatever `reports/market/benchmark.json` last
held. It does not say "this is nine days stale". A week of total scan failure and a week of
quiet market look identical from the dashboard.

This is a known gap, not a procedure with a missing page. Do not go looking for the alert
channel; there isn't one. Until there is, the substitute is section 1.2 — a thirty-second manual
check.

### 1.1 The four places that hold signal

| where | what it tells you | cost to check |
|---|---|---|
| `git log --oneline -- reports/market/` | whether last night's cycle completed | instant, local |
| `reports/market/index.json` → `updatedAt`, `cursor`, `boardsOk` | when the scan last ran, and how far it got | instant, local |
| Vercel dashboard → project → Logs, filtered to `/api/cron/` | the actual error, and the only place `console.error` output lands | a browser |
| `https://<render-host>/healthz` | whether the MCP server is up (free tier, it sleeps) | a curl |

The git log is the best of these because it is local, free, and structural. A completed cycle
writes its files in a fixed order (`architecture.md` §5.5), and each write is a commit whose
message is `market: update <path>` — the string is built in `lib/market/store.ts` `writeJson()`.

A healthy full cycle therefore leaves, newest first:

```
market: update reports/market/insight.json
market: update reports/market/trend.json          # absent if today's point is byte-identical
market: update reports/market/benchmark.json
market: update reports/market/index.json
```

plus `history/YYYY-MM-DD.json` on the first completed cycle of a new day. GitHub creates no
commit for a PUT whose content is unchanged, so a missing `trend.json` commit on a re-run is
normal. A missing `index.json` commit never is.

### 1.2 The morning check

```bash
git -C ~/senior-fde-dashboard pull --ff-only
git log --oneline -6 -- reports/market/
python3 -c "import json; i=json.load(open('reports/market/index.json')); \
print(i['updatedAt'], 'cursor', i['cursor'], 'boardsOk', i['boardsOk'], \
'failed:', [k for k,v in i['boards'].items() if not v['ok']])"
```

What the third line should print: a timestamp from within the last 24 hours, `cursor 0`,
`boardsOk 27`, and an empty failed list. That is what it prints today, against a scan of
`2026-09-07T17:37:03.572Z`. <!-- verify:enabled_boards=27 -->

- `cursor` non-zero → the cycle is partial. Section 3.4.
- `boardsOk` below 27 → one or more boards failed. Section 4.1 — usually benign.
- `updatedAt` older than about 26 hours → the scan is not running at all. Section 2 triage.

### 1.3 Triage table

| symptom | look at | likely section |
|---|---|---|
| Market tab numbers are old | `index.json` `updatedAt` | 3.1, 3.4, 4.2 |
| Market tab is empty, "not synced" | `GITHUB_TOKEN` in Vercel | 4.2 |
| Scan returns 502, files partly written | Vercel logs for `snapshot write failed` | 3.1 |
| A company's roles vanished overnight | `index.json` `boards[token].error` | 4.1 |
| A company's count dropped but did not zero | truncation guard, `verifiedTotal` | 3.2 |
| Curriculum reverted to old hours/months | `git diff data/curriculum/` | 3.3 |
| No digest email arrived | `RESEND_FROM_EMAIL`, `RESEND_API_KEY` | 3.5 |
| Digest arrived without its framing line | `MINIMAX_API_KEY` | 3.5 |
| Market tab has no Quaere paragraph | `insight.json` `quaere` is `null` | 3.5, 4.4 |
| Neither cron ran, no logs at all | `CRON_SECRET` | 4.3 |
| Claude Code quotes plan rows the dashboard does not show | Render `buildFilter` | 4.5 |

---

## 2. Degrades or corrupts

This is the only distinction that matters when you are tired.

**Degrades** — an output is missing or stale. The stored state is still true. Doing nothing
until morning costs freshness and nothing else. Most of this system degrades, on purpose:
`architecture.md` §8 lists every environment variable and every one of them degrades rather than
crashing.

**Corrupts** — a wrong value was written and now looks like a measurement. The damage survives
the fix, because the next read cannot tell the bad number from a good one. These are the ones
worth waking up for, and they are worth waking up for **only until you have stopped the write** —
the repair is a `git revert`, which can wait.

Every failure mode in this document, classified:

| # | failure | class |
|---|---|---|
| 3.1 | concurrent GitHub writes race the branch ref | **corrupts** — a lost file the tab then reads as stale truth |
| 3.2 | truncation guard measured against the match count | **corrupts** — the worst one in the system |
| 3.3 | a script writes the curriculum bundle but not its source | **corrupts** — and silently reverts |
| 3.4 | `SCAN_DEADLINE_MS` assumes a 300 s function | degrades — the cursor is what makes it safe |
| 3.5 | `MINIMAX_API_KEY` / `RESEND_FROM_EMAIL` empty | degrades |
| 3.6 | browser-driving a write control writes real state | **corrupts** — study history, by hand |
| 4.1 | one board fails | degrades, by design |
| 4.2 | GitHub unreachable | degrades, by design — the abort is the guard |
| 4.3 | `CRON_SECRET` unset or rotated | degrades silently, which is the problem |
| 4.4 | model paragraph dropped by the digit check | degrades, by design |
| 4.5 | Render serves stale plan rows | **corrupts** the answer, not the data |
| 4.6 | `MCP_API_KEY` or `LUMEN_PASSWORD` unset | exposure, not corruption |

Corruption in this system is almost always *plausible*. There is no crash and no red banner —
there is a number that is 8% lower than it should be, sitting in a table of numbers that are
right. That is why the guards in section 4 exist and why section 3.2 is the one to reread.

---

## 3. Failures that happened

### 3.1 Three GitHub writes in a `Promise.all` raced the branch ref

**Fixed in `b6c1ef7` — "write the three snapshot files sequentially, not concurrently".**

Every write in this system is a commit on `main` via the GitHub contents API. Three of them
issued concurrently race the branch ref: GitHub accepts whichever arrives first and rejects the
rest with `is at <sha> but expected <sha>`.

The first real scan hit this. It fetched all 27 boards, computed the benchmark, wrote
`index.json`, `trend.json` and `history/2026-09-07.json` — and lost `benchmark.json`, the one
file the Market tab actually reads. It then returned 502.

**How you notice.** The Vercel log line `[cron/market-scan] snapshot write failed`, and a 502
from a run that did all the work. In the git log, an `index.json` commit with no matching
`benchmark.json` commit beside it.

**How you confirm.** The error text names two shas. Resolve both:

```bash
git cat-file -t <sha>   # "commit", not "blob", is the tell
```

If both resolve to **commits**, this is a branch-ref race, not a stale-file-sha conflict. That
distinction is what named the cause the first time: the two shas were the trend and history
commits, i.e. the two writes that beat the benchmark to the ref.

**Blast radius.** `benchmark.json` keeps yesterday's content while `index.json` holds today's.
The tab reads the benchmark, so it shows yesterday's market with no indication that it is a day
behind. Nothing in the seen-set is wrong — the benchmark is a pure function of `index.json`
(`architecture.md` §5.3) and recomputes on the next successful cycle.

**Fix.** Already fixed: the four writes are sequential, `index.json` first and alone. If it ever
comes back, the shape to look for is `Promise.all` around anything that calls `writeJson`. The
concurrent version was inherited from `app/api/review/route.ts`, which writes a *single* file and
therefore cannot race itself — copying that shape to a multi-file writer is the mistake.

To recover a lost cycle without waiting for tomorrow, re-run the scan; it recomputes everything
downstream of `index.json` from scratch.

**Class: corrupts.** Not the seen-set, but the reader's belief. A stale benchmark presented as
current is a wrong measurement, and there is no staleness indicator on the tab to catch it.

### 3.2 The truncation guard compared a posting count against a *match* count

**Fixed in `a9f082c` — "check the truncation guard against the board total, not the match count".**

`fetchBoard()` in `lib/market/fetch.ts` refuses a listing that came back suspiciously short,
because a partial fetch produces a real-looking small number instead of an error. The floor is
60% of the board's audited size.

The bug was the denominator. The audit stored `verifiedMatches` — how many of a board's postings
match the FDE title patterns — and the floor was computed from that. So:

| board | matches | total | match-based floor | total-based floor |
|---|---|---|---|---|
| Databricks | 97 | 870 | 58 | **522** |
| Decagon | 34 | 139 | 20 | **83** |

A Databricks fetch returning **100 of 870 rows** cleared a floor of 58 and would have been
written to the index as truth. The Decagon case that motivated the guard in the first place — a
fetch returning 10 of 139 — cleared a floor of 20 by luck.

**How you notice.** You mostly do not, which is the entire point. A truncated board is not an
error; it is a company that appears to have quietly stopped hiring. The observable is a
company's core count dropping sharply while `boards[token].ok` stays `true`.

**How you confirm.**

```bash
python3 -c "import json; i=json.load(open('reports/market/index.json')); \
b=i['boards']; \
print({k:(v['total'],v['matched']) for k,v in b.items()})"
```

Compare `total` against that board's `verifiedTotal` in `data/market-sources.json`. If `total`
is well under `verifiedTotal` and the board still reported `ok: true`, the guard did not fire and
should have. Cross-check by hitting the board's `listUrl` directly and counting.

**Blast radius.** Every percentage in the benchmark. Skill shares are computed over core
requisitions, so a board that contributes 97 of 189 core reqs (`reports/market/benchmark.json`,
scan of 2026-09-07) and silently drops to 11 moves every share in the table. `trend.json` records
the bad point permanently, and week-over-week movement is then computed against it.

**Fix.** The floor comes from `source.verifiedTotal`, which is now stored on all 32 boards.
<!-- verify:boards=32 --> If a board legitimately grows or shrinks, re-audit it and update
`verifiedTotal` — do not lower the ratio. If a bad cycle already landed, revert the
`reports/market/` commits for that day and re-run the scan.

**Class: corrupts, and it is the worst one here.** A false negative looks exactly like a quiet
week. Nothing downstream can distinguish them, and `trend.json` keeps the lie for 180 points.

### 3.3 Two scripts wrote `data/curriculum.json` but not the per-topic sources

**Fixed in `aa18478` — "write the per-topic curriculum files, not just the bundle".**

`data/curriculum/NN.json` is the **source**, 119 files. `data/curriculum.json` is **built** from
them by `scripts/build-curriculum.py`. `architecture.md` §4.2 states this rule; it is the
distinction that caused this bug. <!-- verify:curriculum_files=119 -->

`scripts/rebaseline-hours.py` and `scripts/renumber-months.py` originally wrote `workbook.json`
and the bundle only. The re-baseline and the renumber therefore never reached the source files,
and the very next `build-curriculum.py` run regenerated the bundle **from the untouched sources**
and reverted 117 of 119 topics. <!-- verify:active_rows=117 -->

The guard that should have caught it existed and did not fire, because nothing had asked it to
run. `build-curriculum.py`'s own comment reads *"a renumber silently desynced 90 files once, so
drift is now a hard error"*. The scripts were routing around the guard, not defeating it.

**How you notice.** The dashboard's hours or months revert to values you already fixed. The
symptom that surfaced it originally: `00.json` said 8h against the plan's 14.0, and `115.json`
said M13/12h against M23/17.0.

**How you confirm.**

```bash
python3 scripts/build-curriculum.py --strict
```

Every mismatch prints as `! NN.json: hours is X but the plan says Y`. With `--strict` it exits
non-zero. Then verify the totals:

```bash
python3 -c "import json,glob; f=sorted(glob.glob('data/curriculum/*.json')); \
print(len(f),'files,',sum(len(json.load(open(x))['subtopics']) for x in f),'subtopics')"
```

That prints `119 files, 2236 subtopics` today, and the same subtopic count must appear in the
built bundle — that identity is what "in sync" means. <!-- verify:subtopics=2236 -->

**Blast radius.** Everything the plan feeds: the Plan and Curriculum tabs, `/api/ask`'s
server-side grounding, the daily digest's next-topic pick, `lib/market/insight.ts`'s
over-investment arithmetic, and the recall bank (1,710 prompts, rebuilt in the same pass).
<!-- verify:prompts=1710 --> A reverted rebaseline puts the wrong hours in front of every one of
them.

**Fix.** Both scripts now write `data/curriculum/*.json` and print `Now run: python3
scripts/build-curriculum.py` as their last line. The rule, restated because it is the one people
get backwards: **write the source files, then rebuild. Anything that writes only
`data/curriculum.json` will be silently undone.** To recover, fix the sources and rebuild — the
bundle is disposable.

**Class: corrupts, silently and on a delay.** The revert happens on the *next* build, which may
be days after the edit, so the change and its loss are not adjacent in the git log.

### 3.4 `SCAN_DEADLINE_MS` defaults to 220,000, which assumes a 300-second function

`app/api/cron/market-scan/route.ts` sets `DEADLINE_MS = Number(process.env.SCAN_DEADLINE_MS) ||
220_000`. That budget is correct for a 300 s function. **Vercel Hobby caps a function at 60 s.**

The route deliberately does not declare `maxDuration`, because Hobby rejects a build that asks
for more than its cap and hardcoding 300 would make the design plan-specific. So on Hobby the
deadline never fires: the platform kills the invocation at 60 s, mid-cycle.

This is survivable, and the reason is the cursor. Workers pull boards in config order and `next`
ends as the first board never dispatched. `index.cursor` stores it, and the run writes
`index.json` and stops without computing anything:

> `const complete = next >= boards.length;` … everything below that line — `sweepMissing`,
> `capReqs`, `computeBenchmark`, `appendTrend`, `computeInsight` — runs only on a complete cycle.

That gate is what makes a partial cycle safe rather than merely survivable. A benchmark computed
over a truncated corpus would print a percentage whose denominator is "the boards that happened
to fit in this invocation", and it would look exactly like a real one.

**How you notice.** `reports/market/index.json` `cursor` is non-zero, and the scan's JSON
response carries `partial: true`. The benchmark stops advancing while `index.json` keeps
updating — an `index.json` commit with no `benchmark.json` commit beside it, night after night.

**How you confirm.** Read the cursor across two consecutive days. If it advances (0 → 11 → 22 →
0) the cycle is completing over several invocations and the system is working as designed. If it
sits at the same value, the scan is dying before it can make progress — different problem, look
at the Vercel logs.

**Blast radius.** Freshness only. Unreached boards keep yesterday's data rather than looking
closed, and their new roles arrive a day or two late. On a 60 s function a full cycle takes 3–4
daily invocations, so the benchmark updates roughly twice a week instead of nightly.

**Fix.** Set `SCAN_DEADLINE_MS` to `50000` in the Vercel project's environment variables on a
Hobby plan. The knob exists precisely so the plan tier is configuration, not code. On Pro,
leave the default: 220,000 to *start* boards plus a 45 s `BOARD_TIMEOUT_MS` for one dispatched
at the wire leaves headroom under 300 s.

**Class: degrades.** Nothing wrong is written. The cursor and the `complete` gate are the two
mechanisms that hold that line, so treat any change to either as a change to a correctness
property, not a performance one.

### 3.5 `MINIMAX_API_KEY` and `RESEND_FROM_EMAIL` are empty locally

In `.env.local` today, three variables are set to the empty string: `MINIMAX_API_KEY`,
`RESEND_FROM_EMAIL`, and `CRON_SECRET`. An empty string is absent in every way that matters, and
the code is written to treat it that way — `sendWeekly()` reads its recipient with `||` and not
`??` specifically so a dashboard-set `""` does not reach Resend as a recipient and take a 422.

What each absence actually costs:

| absent | what happens |
|---|---|
| `MINIMAX_API_KEY` | `modelParagraph()` returns `""` immediately. The digest sends without its framing line; the Monday email sends the deterministic benchmark alone; `insight.quaere` is stored as `null` and the Market tab renders no Quaere block. `/api/ask` returns 503 — the one hard failure, because an Ask with no model has no output at all. |
| `RESEND_FROM_EMAIL` | The daily digest returns 503 and sends nothing. The Monday market email is skipped with `"Missing RESEND_API_KEY, RESEND_FROM_EMAIL or a recipient."` **The scan itself still completes and still writes all five files** — the email is sent last, outside every branch that returns 502, so a mail outage cannot cost a cycle. |
| `CRON_SECRET` | Both crons return 401 before doing anything. Locally that is correct; in production it means nothing runs. See 4.3. |

**How you notice.** The digest arrives with no "Why it matters" row, or does not arrive. The
Market tab shows every measurement and no interpretation paragraph. Nothing errors.

**How you confirm.** `insight.quaere` is `null` in `reports/market/insight.json` — it is `null`
on the 2026-09-07 scan. That alone does not prove a missing key: the digit check (4.4) also
produces `null`, and so does a MiniMax timeout. Separate them in the Vercel log — a dropped
paragraph logs `contains numbers, dropping it` with the offending digits; a missing key logs
nothing at all, because `modelParagraph()` returns before it makes a request.

**Fix.** Fill the variable where you need it. Locally, `MINIMAX_API_KEY` is optional for
everything except `/api/ask`; `CRON_SECRET` must be set to any non-empty string to exercise
either cron. `vercel env pull` refreshes `.env.local` from the project. Note that
`MARKET_TO_EMAIL` is read by the scan but is **not** in `.env.example`.

**Class: degrades, deliberately.** The design rule behind it: the digest used to be a single
model paragraph, and when the model returned nothing the email arrived empty — that shipped. The
substance is now derived from `data/workbook.json` and `data/recall-bank.json` with no model
involved, and the model writes at most one line on top. A bad model day costs a paragraph.

### 3.6 Driving a write control in a browser writes real state

**Three reverts: `2aadad0`, `6ee14a7`, `329b3b4` — all in one session.**

Not a code defect, and the highest-frequency corruption in this repo's history. The dev server
reads `GITHUB_TOKEN` from `.env.local`, so a status select driven in a browser POSTs to
`/api/progress` and writes a durable record to this repository. Grading a recall card PUTs to
`/api/review` and writes a real schedule entry.

What actually landed: two false `done` records on Shell mastery and Linux internals, 220 ms
apart; then two `not_started` records that **un-skipped** PySpark and the MIT 6.824 Raft lab —
which would have flipped the plan back to 119 active topics in the dashboard and in
`get_progress_analytics`, undoing a scope decision with data rather than code
<!-- verify:rows=119 -->; then a `q0-0 rung 1, fluent, due 2026-09-13` review entry that would
have suppressed the first Shell-mastery question for a week and started its ladder from a review
that never happened.

**How you notice.** `git log -- reports/progress/ reports/review/` shows a record you do not
remember making. The timestamps cluster within seconds of each other, which no human study
session does.

**How you confirm.** Read the file. `reports/progress/*.md` is one file per event with a
timestamp; a record stamped inside the minute you were testing a UI is yours, not Rasul's.

**Blast radius.** Readiness in `lib/market/insight.ts` reads progress events and never workbook
column 15, so a fabricated `done` moves the readiness percentage. Active-hours arithmetic
(1,588h today) shifts if a `Skipped` row is un-skipped. <!-- verify:hours=1588 --> The review
ladder is worse than wrong: a card graded `fluent` by nobody is scheduled 7 days out and its
rung is now a lie the scheduler cannot detect.

**Fix.** Revert the commit in the same turn you notice it. The rule, which is in these commit
messages three times: **any browser automation touching a control that writes is writing for
real.** Seed through `localStorage` and read computed values; drive the writing path only when
the write itself is under test, and clean up immediately.

**Class: corrupts.** Study history has no other source of truth to reconcile against.

---

## 4. Guards that exist, and how to tell one fired

These are not failures. They are the mechanisms that turn a failure into a degrade, and each one
has an observable you should recognise so you do not chase it.

### 4.1 One board fails

Nothing in `lib/market/fetch.ts` throws. A failed board is recorded as `ok: false` with its
error, and `sweepMissing()` only touches requisitions whose board reported `ok: true` this run.
Without that rule, one Ashby 500 marks all 55 Sierra reqs missing and the next successful run
reports 55 phantom new roles.

**Observable:** `boardsOk` below 27, and `index.json` `boards[token].error` carrying `HTTP 500`
or a timeout. **Do nothing** unless it persists for several days or the error is `suspiciously
small: N of M verified postings` — that is 3.2's guard firing and it means the board's shape
changed. Re-audit and update `verifiedTotal`.

### 4.2 GitHub is unreachable

`readJson()` returns `synced: false` meaning **"we do not know"**, never "the file is empty". The
scan checks it and aborts *before fetching a single board*: 503 when `GITHUB_TOKEN` is missing,
502 when the read failed.

That abort is the guard. Falling through to an empty index would rebuild the seen-set from
scratch, stamp every stored requisition with today's `firstSeen`, and make tomorrow's digest
announce the entire market as new. `reports/market/index.json` holds 750 requisition records
today (scan of 2026-09-07).

**Observable:** a 502 from the scan with zero board activity in the logs, and `/api/market`
returning `synced: false`. The Market tab distinguishes three states from `synced` alone — no
token, GitHub silent, and cold start — so read which one before assuming an outage.

### 4.3 `CRON_SECRET` unset or rotated

Both cron routes check `Authorization: Bearer ${CRON_SECRET}` and return 401 otherwise. If the
secret is unset, `!secret` short-circuits and **every** invocation 401s. <!-- verify:crons=2 -->

This is the failure with the worst signal-to-noise in the whole system: nothing scans, nothing
sends, no error is written anywhere in the repo, and the tab keeps rendering the last good
benchmark. It is indistinguishable from a quiet market until you check `updatedAt`.

**Observable:** `index.json` `updatedAt` stops advancing. That is the only one. This is the
single strongest argument for the alerting that does not exist.

### 4.4 The digit check drops a model paragraph

`modelParagraph()` drops the entire paragraph if it contains **any** digit, with no allow-set,
because the prompt says "write no numbers at all". Two weaker versions leaked in production:
deriving the allow-set from the prompt whitelisted `60` forever (the instruction says "In 60
words or fewer"), and deriving it from the facts block whitelisted `58`, because coverage
statements cite plan rows and hours and a row number reads as a percentage once the model puts a
`%` after it. "Coverage sits at 58% this week" shipped under both.

**Observable:** `[cron/market-scan] reading contains numbers, dropping it` in the logs, with the
first five offending matches. The result is `insight.quaere: null` and no Quaere block. **Do
nothing.** A missing paragraph beside 40 audited measurements is the correct trade; an invented
number sitting among audited ones discredits the audited ones too.

### 4.5 Render serves stale plan rows

`mcp/server.js` reads `../data/*.json`, which is outside its `rootDir: mcp`. `mcp/render.yaml`'s
`buildFilter` therefore lists both `mcp/**` and `data/**`. Drop `data/**` and Render stops
redeploying on plan edits, and the MCP server silently serves rows that were current at its last
deploy.

**Observable:** Claude Code quotes hours or months that the dashboard does not show. There is no
error — the 14 MCP tools answer normally, from stale data. <!-- verify:mcp_tools=14 -->

**Confirm:** ask `get_plan` for a row you recently edited and compare against
`data/workbook.json`. **Fix:** restore the `buildFilter` path and redeploy.

Related and separate: `readMarketReport()` fetches the benchmark and insight **from GitHub**, not
from the local checkout, on a 4 s budget. That is deliberate — reading the checkout would serve
whatever was bundled at deploy time and Claude Code would quote a different market than the
dashboard. A Render free-tier cold start can exceed that 4 s budget, in which case the market
block is simply absent from the answer.

### 4.6 The gate is off, or the MCP server is open

Two absences that fail open rather than closed, both documented in `architecture.md` §8:

- **`LUMEN_PASSWORD` unset** → `proxy.ts` passes every request through. The whole app is public,
  including all 10 tabs and all 10 API routes. <!-- verify:tabs=10 --> <!-- verify:api_routes=10 -->
- **`MCP_API_KEY` unset** → `allowed()` returns `true` for everyone. The MCP server accepts
  anonymous JSON-RPC, rate-limited to 30 requests per 60 s per remote address.

**Observable:** neither logs anything. `curl -I https://<app>/` returning 200 instead of a 307 to
`/login` is the check for the first; an unauthenticated `tools/list` against `/mcp` succeeding is
the check for the second.

Note that changing `LUMEN_PASSWORD` invalidates every existing session, because the password *is*
the HMAC signing key for `lumen_session` — rotating it is also a global logout, which is the
correct response to a suspected leak.

---

## 5. Known gaps

Listed as gaps, not as procedures. None of these has a workaround in place today.

1. **No alerting of any kind.** Section 1. A week of failed scans produces no signal. The
   cheapest fix that would actually work is a dead-man's-switch ping at the end of the scan's
   success path, but nothing like it is built.
2. **No staleness indicator on the Market tab.** It renders `benchmark.json` whatever its age.
   `computedAt` and `day` are both in the file (`2026-09-07T17:37:03.572Z` / `2026-09-07`), so
   the data to render it exists; the UI does not use it.
3. **CI does not run the tests.** `.github/workflows/ci.yml` runs `npm ci && npm run build` only.
   The three market suites and `lib/review.test.mts` must be run by hand.
   <!-- verify:market_tests=3 --> Before touching `lib/market/` or `lib/review.ts`:
   ```bash
   npm run test:market && npm run test:surfacing && npm run test:insight
   npx tsx lib/review.test.mts
   ```
4. **`build-curriculum.py` reports drift but only exits non-zero with `--strict`.** Without the
   flag it prints `! NN.json: …` lines and writes the bundle anyway. Anything automated that runs
   it must pass `--strict` or read its output; see 3.3.
5. **`reports/market/history/` is write-only.** Nothing reads it, so a corrupt day archived there
   is never noticed by the system. It is a manual forensics resource, and the same-day rewrite is
   rejected by design (null sha against an existing path) and logged rather than treated as a
   failure.
6. **The login rate limit is per serverless instance.** `lib/auth.ts` holds it in a `Map` in one
   instance's memory; it resets on cold start and is not shared across instances. Best-effort by
   construction, not a control you should rely on.
