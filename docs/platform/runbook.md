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

### There is exactly one alert, and it rides the morning email

`scanAlerts()` in `app/api/cron/daily-digest/route.ts` is the whole alerting layer. It reads
`reports/market/index.json` thirty minutes after the scan and prepends up to two lines to the
digest, above the study brief, because a broken pipeline outranks it:

- **SCAN STALE** — `index.json` `updatedAt` is older than `STALE_AFTER_MS` (26 h: the 03:00 scan
  plus the 03:30 digest plus one missed night is 24.5 h, and the remainder is slack so a single
  late or retried run does not cry wolf). The same line fires when `updatedAt` is unparseable.
- **PARTIAL SCAN** — `boardsOk` is under `DELTA_MIN_BOARDS` (`lib/market/benchmark.ts`), which is
  the same threshold `computeBenchmark()` suppresses movement and new-roles on. Without this line
  a short scan reads as a still market: the numbers stop moving and nothing says why.

Both thresholds are constants in those two files. Read them there before trusting a number
quoted here.

**What the alert does not cover**, which is the part that matters at 3am:

- **It is in the body, never the subject.** The subject is always `Lumen · <topic>`. If you
  triage by subject line you will not see it.
- **It dies with the digest.** `CRON_SECRET` unset or rotated 401s the digest before it reads
  anything (4.3); a missing `RESEND_API_KEY` or `RESEND_FROM_EMAIL` 503s it (3.5). Either one
  silences the scan and its alerter together. The code's stated answer is that the absence of the
  email is then the signal — which only works if you would notice an absence.
- **A GitHub read failure produces no alert, on purpose.** Every error path in `newCoreReqs()`
  returns `NO_MARKET`, whose `alerts` is empty: GitHub being unreachable is not evidence the scan
  is broken, and a false stale line on an outage morning teaches you to skim the real one. That
  failure lands in the Vercel logs and nowhere else.
- **Nothing else alerts at all.** No Sentry, no health-check pinger, no Slack webhook, no
  dead-man's switch on the scan's own success path.

The dashboard is not a second channel. The Market tab renders whatever `benchmark.json` last
held; it stamps the computation time on every render (3.1), but it prints an absolute timestamp
and no warning, so a week of failed scans and a week of quiet market still *look* alike until
you read the date.

Section 1.2 is the thirty-second check that answers the question the email cannot: did the
digest itself run.

### 1.1 The five places that hold signal

| where | what it tells you | cost to check |
|---|---|---|
| this morning's digest email, first lines of the body | SCAN STALE / PARTIAL SCAN, or neither | free, already sent |
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
`boardsOk 27` — every enabled board in `data/market-sources.json`
<!-- verify:enabled_boards=27 --> — and an empty failed list.

- `cursor` non-zero → the cycle is partial. Section 3.4.
- `boardsOk` below 27 → one or more boards failed. Section 4.1 — benign while it stays at or
  above `DELTA_MIN_BOARDS`. **Strictly below it, movement and new roles are suppressed entirely**
  (`lib/market/benchmark.ts`), so a whole surface goes quiet rather than wrong. That is the
  PARTIAL SCAN alert's trigger too, so the email should already have told you.
- `updatedAt` older than `STALE_AFTER_MS` → the scan is not running at all. Section 2 triage.
  This is not a heuristic you have to remember: it is the constant the SCAN STALE alert fires on,
  and running this check by hand is how you confirm it when the email did not arrive.

### 1.3 Triage table

| symptom | look at | likely section |
|---|---|---|
| Market tab numbers are old | `index.json` `updatedAt` | 3.1, 3.4, 4.2 |
| Market tab is empty, "not synced" | `GITHUB_TOKEN` in Vercel | 4.2 |
| Scan returns 502, files partly written | Vercel logs for `snapshot write failed` | 3.1 |
| A company's roles vanished overnight | `index.json` `boards[token].error` | 4.1 |
| A company's count dropped but did not zero | truncation guard, `verifiedTotal` | 3.2 |
| Curriculum reverted to old hours/months | `git diff data/curriculum/` | 3.3 |
| Digest led with SCAN STALE | `index.json` `updatedAt`, then Vercel logs for `/api/cron/market-scan` | 1, 3.1, 3.4, 4.3 |
| Digest led with PARTIAL SCAN | `index.json` `boardsOk` and `boards[token].error` | 4.1, 3.2 |
| No digest email arrived — which also means no alert | `CRON_SECRET` first, then `RESEND_FROM_EMAIL`, `RESEND_API_KEY` | 4.3, 3.5 |
| Digest arrived without its framing line | `MINIMAX_API_KEY` | 3.5 |
| Market tab has no Quaere paragraph | `insight.json` `quaere` is `null` | 3.5, 4.4 |
| Neither cron ran, no logs at all | `CRON_SECRET` | 4.3 |
| Claude Code quotes plan rows the dashboard does not show | Render `buildFilter` | 4.5 |

---

## 2. Degrades or corrupts

This is the only distinction that matters when you are tired.

**Degrades** — an output is missing or stale. The stored state is still true. Doing nothing
until morning costs freshness and nothing else. Most of this system degrades, on purpose:
`architecture.md` §8 lists every environment variable and what its absence costs, and *most* of
them degrade rather than crash. Read the qualifier there — the table says "except where noted"
and bolds its exceptions. The ones that break outright rather than degrade are `CRON_SECRET`
(both crons 401), `RESEND_API_KEY` / `RESEND_FROM_EMAIL` (the digest 503s, which also takes the
staleness alert with it), `GITHUB_TOKEN` (the scan 503s, `/api/progress` 502s), `MINIMAX_API_KEY`
for `/api/ask` only, and `MCP_API_KEY` (the whole MCP server 503s — see 4.6). Exactly one fails
open: `LUMEN_PASSWORD`.

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
| 3.4 | `SCAN_DEADLINE_MS` assumes a 300 s function | degrades — the cursor is what makes it safe, and on measured runtimes it does not fire at all |
| 3.5 | `MINIMAX_API_KEY` / `RESEND_FROM_EMAIL` empty | degrades |
| 3.6 | browser-driving a write control writes real state | **corrupts** — study history; the accidental path is closed on `/api/progress`, not on `/api/review` |
| 4.1 | one board fails | degrades, by design |
| 4.2 | GitHub unreachable | degrades, by design — the abort is the guard |
| 4.3 | `CRON_SECRET` unset or rotated | degrades silently, which is the problem |
| 4.4 | model paragraph dropped by the digit check | degrades, by design |
| 4.5 | Render serves stale plan rows | **corrupts** the answer, not the data |
| 4.6 | `LUMEN_PASSWORD` unset | exposure, not corruption — the only fail-open left |
| 4.6 | `MCP_API_KEY` unset | degrades, hard — every MCP tool 503s, and it refuses rather than opens |

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
current is a wrong measurement. The tab does give you the means to catch it — `app/page.tsx`
renders `Computed <benchmark.computedAt> UTC · N of M boards` above every Market panel — but it
is an absolute timestamp with no relative age and no warning state, deliberately, so catching it
requires reading the date rather than noticing a colour. On this failure that date is
yesterday's while `index.json` says today.

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

**Blast radius.** Every percentage in the benchmark. Skill shares are computed over the
*distinct* core requisitions `distinct()` in `lib/market/benchmark.ts` returns — `coreCount` in
`benchmark.json` is that number, and the per-board contribution is not in `benchmark.json` at
all, so recompute it from `index.json` before quoting one. Do not reach for `verifiedMatches` in
`data/market-sources.json`: that is a raw title-pattern count across all classes, undeduped, and
it runs several times the real figure. On the 2026-09-08 scan the largest contributor is
Databricks at 35 of 189, and the truncation above — 100 of 870 rows, 11% of the board — would
leave roughly 4 of those 35, moving every share in the table. `trend.json` records the bad point
permanently, and week-over-week movement is then computed against it.

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
deadline never fires — the platform would kill the invocation at 60 s first.

**Measure before you act on this.** The archived scans say the deadline is not the live problem:
`updatedAt` to the last board's `fetchedAt` in `reports/market/index.json` is 4.2 s across all 27
boards on the 2026-09-08 scan and 14.8 s on 2026-09-07. Six workers exhaust 27 boards long before
either budget, `next` reaches `boards.length`, and the cycle completes in one invocation with
seconds spent, not minutes. The 220 s figure is what the scan would need in the pathological case
— every board hanging to its full 45 s `BOARD_TIMEOUT_MS` (`lib/market/fetch.ts`), 6 at a time,
≈225 s. Treat that as the ceiling this design survives, not as the normal cost. Re-derive the two
numbers above from the current file before concluding anything; they are live scan output and
this document cannot anchor them.

The pathological case is survivable, and the reason is the cursor. Workers pull boards in config
order and `next` ends as the first board never dispatched. `index.cursor` stores it, and the run
writes `index.json` and stops without computing anything:

> `const complete = next >= boards.length;` … everything below that line — `sweepMissing`,
> `capReqs`, `computeBenchmark`, `appendTrend`, `computeInsight` — runs only on a complete cycle.

That gate is what makes a partial cycle safe rather than merely survivable. A benchmark computed
over a truncated corpus would print a percentage whose denominator is "the boards that happened
to fit in this invocation", and it would look exactly like a real one.

**How you notice.** `reports/market/index.json` `cursor` is non-zero, and the scan's JSON
response carries `partial: true`. The benchmark stops advancing while `index.json` keeps
updating — an `index.json` commit with no `benchmark.json` commit beside it, night after night.

**How you confirm.** Read the cursor across two consecutive days.

- It advances (0 → 11 → 22 → 0): the cycle is completing over several invocations. Working as
  designed, and slower than the measurements above say it should be — something is hanging.
- **It sits at the same non-zero value and no `index.json` commit appears: that is this failure
  in its worst form, not a different one.** A hard platform kill lands before the index write, so
  nothing is committed, the cursor stays frozen at wherever it was, and the run leaves no trace
  in the repo. The Vercel logs are where you go next, but do not read a frozen cursor as evidence
  against a deadline problem — it is the signature of the deadline never getting a chance to fire.
- It sits at 0 and `updatedAt` still advances nightly: the deadline is not involved. Cycles are
  completing; look elsewhere.

**Blast radius.** Freshness only. Unreached boards keep yesterday's data rather than looking
closed, and their new roles arrive a day or two late. How many invocations a cycle takes is a
function of how slow the boards are that night, not of the plan tier — on the measured runtimes
it is one.

**Fix.** On a 60 s function, the deadline is the *second* thing to look at, because on measured
runtimes it is never reached. Look first at what actually runs long after the boards are done:
`quaereReading()` → `modelParagraph()` carries an `AbortSignal.timeout(40_000)`, and it is the
one long call in the route. It runs **after** `index.json`, `benchmark.json`, `trend.json` and
the history archive are already committed, so a 60 s kill inside it costs `insight.json` and
nothing else — the cursor stays 0, the benchmark advances normally, and the file recomputes
tomorrow. `SCAN_DEADLINE_MS` does not touch that path at all.

If the boards genuinely are slow enough to approach the cap, then set `SCAN_DEADLINE_MS` to
`50000` in the Vercel project's environment variables. The knob exists precisely so the plan tier
is configuration, not code. On Pro, leave the default: 220,000 to *start* boards plus a 45 s
`BOARD_TIMEOUT_MS` for one dispatched at the wire leaves headroom under 300 s.

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

**How you confirm.** `insight.quaere` is `null` in `reports/market/insight.json`. Check the file
rather than trusting a value quoted here: it is rewritten on every complete cycle and has been
both `null` and populated on consecutive days. `null` alone does not prove a missing key either:
the digit check (4.4) also produces `null`, and so does a MiniMax timeout. Separate them in the
Vercel log — a dropped
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

**Three reverts: `2aadad0`, `6ee14a7`, `329b3b4` — all in one session. Partly fixed in
`8650270` — "viewing the dashboard can no longer overwrite recorded progress".**

The highest-frequency corruption in this repo's history, and it *was* partly a code defect: the
status select took its value from the workbook baseline until `/api/progress` hydrated, so any
interaction in that window committed "Not started" over real progress. `8650270` disabled the
selects until the fetch settles, kept them disabled on a failed hydration, made re-selecting a
row's current value a no-op, and made `/api/progress` reject any status outside the four the UI
offers with 400. It reports zero POSTs from loading the page and opening the Plan tab.

What actually landed: two false `done` records on Shell mastery and Linux internals, 220 ms
apart; then two `not_started` records that **un-skipped** PySpark and the MIT 6.824 Raft lab —
which would have flipped the plan back to 119 active topics in the dashboard and in
`get_progress_analytics`, undoing a scope decision with data rather than code
<!-- verify:rows=119 -->; then a `q0-0 rung 1, fluent, due 2026-09-13` review entry that would
have suppressed the first Shell-mastery question for a week and started its ladder from a review
that never happened.

**What is still exposed.** The dev server reads `GITHUB_TOKEN` from `.env.local`, so a status
select *changed* in a browser still POSTs to `/api/progress` and writes a durable record to this
repository — the fix removed the accidental writes, not the deliberate ones. And `8650270`
touched progress only: grading a recall card still PUTs to `/api/review` and writes a real
schedule entry with no equivalent guard in front of it, which is the half of this incident that
would repeat today.

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

**Fix.** A record that is wholly fabricated — a `done` for a session nobody ran — gets its commit
reverted in the same turn you notice it. A record that *overwrote* a real one gets a correcting
event appended instead, which is what `8650270` did: the progress store is an append-only
history, and a corrected history that hides its own correction is not a history. The erroneous
event stays; the new one says what it corrects.

The rule, which is in these commit messages three times: **any browser automation touching a
control that writes is writing for real.** Seed through `localStorage` and read computed values;
drive the writing path only when the write itself is under test, and clean up immediately. This
still holds even though the accidental-write path is closed — `/api/review` never had that guard.

**Class: corrupts.** Study history has no other source of truth to reconcile against.

---

## 4. Guards that exist, and how to tell one fired

These are not failures. They are the mechanisms that turn a failure into a degrade, and each one
has an observable you should recognise so you do not chase it.

### 4.1 One board fails

Nothing in `lib/market/fetch.ts` throws. A failed board is recorded as `ok: false` with its
error, and `sweepMissing()` only touches requisitions whose board reported `ok: true` this run.
Without that rule, one Ashby 500 sets `missingSince` on every requisition the failed board owns —
30 of them for Sierra on the 2026-09-08 index, and `sweepMissing()` operates on stored
requisitions, not on `verifiedMatches` in `data/market-sources.json`, which is a much larger
undeduped title-match count and not the figure to reach for here.

Two costs, in that order. Immediately, `distinct()` skips any req with a non-null `missingSince`,
so the whole board drops out of every denominator that night while `ok: false` was the only thing
that went wrong. Then, if the outage outlasts `MISSING_DAYS` (`lib/market/store.ts`), the reqs
are deleted outright — and because `markSeen()` only preserves `firstSeen` for a req still in the
index, the board's entire corpus comes back as new roles on the first run after it recovers.

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
announce the entire market as new — the whole seen-set at once, which is ~750 requisition records
in `reports/market/index.json` at present size.

**Observable:** a 502 from the scan with zero board activity in the logs, and `/api/market`
returning `synced: false`.

`/api/market` separates three states, but **not from `synced` alone** — the comment in
`app/api/market/route.ts` says "alone" and its own table does not:

| state | `synced` | `error` | `benchmark` |
|---|---|---|---|
| no `GITHUB_TOKEN` | `false` | `null` | `null` |
| GitHub did not answer | `false` | set | `null` |
| cold start, no cycle yet | `true` | `null` | `null` |

**The tab cannot tell you which.** `app/page.tsx` renders one message for `synced === false` —
"The benchmark store is unreachable … Check `GITHUB_TOKEN`" — so a missing token and a GitHub
outage look identical on screen, and that message names the token in both cases. Read `error` off
`/api/market` directly before you conclude which one you have.

### 4.3 `CRON_SECRET` unset or rotated

Both cron routes check `Authorization: Bearer ${CRON_SECRET}` and return 401 otherwise. If the
secret is unset, `!secret` short-circuits and **every** invocation 401s. <!-- verify:crons=2 -->

This is the failure with the worst signal-to-noise in the whole system, and the one case the
staleness alert cannot report. Both crons share the secret, so an unset or rotated `CRON_SECRET`
401s the digest at its first line — before it reads `index.json`, before `scanAlerts()` runs.
Nothing scans, nothing sends, no error is written anywhere in the repo, and the tab keeps
rendering the last good benchmark.

**Observable:** the digest simply does not arrive, and `index.json` `updatedAt` stops advancing.
The missing email is the earlier of the two signals but it is an absence, not a message — so this
is the one failure where section 1.2's manual check is the primary detector rather than the
backup, and the strongest remaining argument for a dead-man's switch outside this repo.

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
error — the 18 MCP tools answer normally, from stale data. <!-- verify:mcp_tools=18 -->

**Confirm:** ask `get_plan` for a row you recently edited and compare against
`data/workbook.json`. **Fix:** restore the `buildFilter` path and redeploy.

Related and separate: `readMarketReport()` fetches the benchmark and insight **from GitHub**, not
from the local checkout, on a 4 s budget. That is deliberate — reading the checkout would serve
whatever was bundled at deploy time and Claude Code would quote a different market than the
dashboard. A Render free-tier cold start can exceed that 4 s budget, in which case the market
block is simply absent from the answer.

### 4.6 The gate is off, or the MCP server refuses everything

Two absences that fail in **opposite** directions. Do not read them as one class:

- **`LUMEN_PASSWORD` unset → fails open.** `proxy.ts` passes every request through. The whole app
  is public, including all 10 tabs and all 10 API routes.
  <!-- verify:tabs=10 --> <!-- verify:api_routes=10 -->
  **Observable:** nothing is logged. `curl -I https://<app>/` returning 200 instead of a 307 to
  `/login` is the check.
- **`MCP_API_KEY` unset → fails closed.** `authError()` in `mcp/server.js` refuses by default:
  no key configured means **503 `MCP_API_KEY is not configured` on every JSON-RPC request**, so
  all 18 tools go dark at once. <!-- verify:mcp_tools=18 --> This is the opposite of what it used
  to do — it returned `true` for every caller when the variable was unset, a fail-open guard in
  front of `save_study_note` and `record_progress`, which commit to the repo with `GITHUB_TOKEN`.
  If your MCP has gone silent, **this is a cause to check, not an exposure to check for.**
  **Observable:** every tool call returns 503 with that message, and `audit("auth", false, …)`
  logs it. `/healthz` still answers 200 — it is checked before the auth gate — so a green health
  check proves the process is up and proves nothing about the key.

`mcp/render.yaml` declares no `envVars`, so nothing in this repo guarantees `MCP_API_KEY` exists;
it is set on the live service only. That is what makes it worth checking first after a redeploy
or a service recreate.

Rate limiting is separate from both: `RATE_LIMIT` requests per `RATE_WINDOW_MS` (30 per 60 s
today, `mcp/server.js`), keyed on the `Authorization` header and falling back to the remote
address only when there is none. So it is per-token first, not per-address, and it trips on the
request *after* the limit — a 429 with `Retry-After: 60`.

Note that changing `LUMEN_PASSWORD` invalidates every existing session, because the password *is*
the HMAC signing key for `lumen_session` — rotating it is also a global logout, which is the
correct response to a suspected leak.

---

## 5. Known gaps

Listed as gaps, not as procedures. None of these is closed today. One entry that used to be here
has since been closed; it is recorded at the end of this section rather than deleted, so nobody
rebuilds it.

1. **The only alerting is inside the digest, so it cannot report the digest's own failure.**
   Section 1 and 4.3. `scanAlerts()` covers a dead scan; nothing covers a dead cron runner, a
   revoked `CRON_SECRET`, or a Resend outage, because all three stop the email that carries the
   alert. The cheapest fix that closes the remaining hole is a dead-man's-switch ping to a service
   outside this repo at the end of the scan's success path. Nothing like that is built.
2. **No *relative* staleness indicator on the Market tab.** The absolute one exists:
   `app/page.tsx` renders `benchmark.computedAt` and the board count above every panel, and the
   comment there says absolute-not-relative was chosen because "3 days ago" hides how stale. What
   is missing is any age computation or warning state, so nine-day-old numbers render in the same
   type as fresh ones and only the date says otherwise.
3. **`build-curriculum.py` reports drift but only exits non-zero with `--strict`.** Without the
   flag it prints `! NN.json: …` lines and writes the bundle anyway. Anything automated that runs
   it must pass `--strict` or read its output; see 3.3.
4. **`reports/market/history/` is write-only.** Nothing reads it, so a corrupt day archived there
   is never noticed by the system. It is a manual forensics resource, and the same-day rewrite is
   rejected by design (null sha against an existing path) and logged rather than treated as a
   failure.
5. **The login rate limit is per serverless instance.** `lib/auth.ts` holds it in a `Map` in one
   instance's memory; it resets on cold start and is not shared across instances. Best-effort by
   construction, not a control you should rely on.

**No longer a gap, so do not rebuild it.** Test running was listed here as manual. It is not:
`.github/workflows/ci.yml` runs `npm ci`, `npm run build`, all four suites (`test:market`,
`test:surfacing`, `test:insight`, `test:review`) and `python3 scripts/verify-docs.py` on every
push to `main` and every pull request. Each suite calls `process.exit(fails ? 1 : 0)`, so a
failure fails the job. Run the same npm scripts locally when you want the answer before you push.
