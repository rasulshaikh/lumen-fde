# Lumen FDE — talk track

How I talk about this system, and how the system maps back onto the plan it was built to run.

This is a lens, not the fact file. Every number here is either anchored for
`scripts/verify-docs.py` or cited to the report file and scan date it came from; the definitions
behind them live in [`architecture.md`](architecture.md), which is the only place a fact is
stated once.

Two audiences, one document. In an interview it is the evidence file: the decisions, the ones
that were wrong, and how they got caught. Studying, it is the map: which of the
119 <!-- verify:rows=119 --> plan rows each piece of this work is evidence for, and — more
usefully — which rows it does *not* discharge.

---

## 1. The sixty-second version

A single-user study platform for one 23-month <!-- verify:months=23 --> Senior FDE plan. Three
processes: a Next.js app on Vercel with 10 tabs <!-- verify:tabs=10 --> and
10 API routes <!-- verify:api_routes=10 -->; an MCP server on Render exposing
18 tools <!-- verify:mcp_tools=18 --> so Claude Code reads the same plan the dashboard reads;
and GitHub as the database, because every mutable artifact is a file in the repo. No database,
no queue, no object store (`architecture.md` §1).

Two crons <!-- verify:crons=2 -->. At 03:00 UTC one of them scans
27 <!-- verify:enabled_boards=27 --> enabled first-party ATS boards, classifies titles against
per-company evidence, extracts skills from the JD bodies, and writes a benchmark that says what
the market asks for against what the plan teaches (`architecture.md` §5). At 03:30 the other
sends a study digest.

The most interesting thing about it is not the stack. It is that the whole system is built to
stop me lying to myself with a number: about the market, about my own progress, and about
whether the documentation still describes the code.

---

## 2. Decisions I can defend

Each of these has an alternative I rejected, a piece of evidence that decided it, and a plan row
it is partial evidence for. "Partial" is doing real work in that sentence — see §5.

### 2.1 The sandbox is a microVM in a different account, not a PTY on the box with the keys

**The decision.** The Sandbox tab runs against one named Vercel Sandbox — a Firecracker microVM,
`env: {}` at create, `lumen-study`, 1 vCPU (`architecture.md` §3.5).

**The alternative.** `node-pty` on the Render host that already runs the MCP server. It is less
code, it has no cold start, and it gives a real PTY instead of a line-based shell.

**Why not.** That box holds `GITHUB_TOKEN` — which has write access to this repo, which *is* the
study plan — plus every other secret `mcp/server.js` reads: `MCP_API_KEY`,
`LUMEN_INTERNAL_API_KEY`, `MINIMAX_API_KEY`, `SURFSENSE_API_KEY`. That list is the `process.env`
reads in that one file rather than a copy of `architecture.md` §8's table, because a hand-copied
blast radius drifts the moment a secret changes host — this one carried `RESEND_API_KEY` until a
fact-check found only the Vercel crons read it. A single auth bug in a shell endpoint there is a
full credential compromise and write access to the plan in the same step. In the microVM the
isolation is structural rather than earned: `env: {}` means no Lumen secret exists inside it even
if the shell is completely owned.

**How I know, rather than assume.** I asked the VM. All nine secret names absent; 18 environment
variables total, every one of them CA-bundle and PATH plumbing (commit `53fcb77`). That is a
five-second check and it is the difference between a security claim and a security property.

**What it cost.** Vercel Sandbox executes commands and does not hand back a PTY, so `xterm.js`
would be ~250 KB wrapping a capability that does not exist. The client is line-based over a
streamed NDJSON response. `python3 x.py` and `pytest` work; `vim` and `top` do not, and the docs
say so rather than pretending (`architecture.md` §3.5).

**Rows this is evidence for:** 68 (Threat modelling and secrets lifecycle, M16), 6 (Docker
internals — its depth target is literally "explain a container without the word 'lightweight
VM'", and choosing a microVM over a container over a process is that same distinction with money
on it, M2), 30 (Auth: OAuth2, OIDC, JWT — the sandbox authenticates by OIDC, M7).

### 2.2 Skill extraction is a deterministic matcher, not a model

**The decision.** `lib/market/skills.ts` matches include/exclude phrases with an optional
proximity window against `data/market-skill-map.json` — 34 skills <!-- verify:skills=34 -->,
hand-authored, boolean per requisition (`architecture.md` §4.5).

**The alternative.** Send the JD bodies to a model and ask which skills each requires. That is
the obvious v1 and it would have been a day's work instead of a week's.

**Why not.** The benchmark's whole purpose is week-over-week movement — is evals rising, is
Python still 67%. A non-deterministic extractor makes that movement uninterpretable: you cannot
tell a market that moved from a sampler that moved. It also costs money daily, and it would
silently reintroduce every false positive the taxonomy work eliminated
(`docs/research/2026-09-07-job-market-benchmark-spec.md`, "Model-written skill extraction",
rejected).

**The corollary I like better than the decision.** The model is not banned from the subsystem —
it is confined to interpretation. Two calls exist inside the scan — the email's framing line at
≤60 words and Quaere's reading of the tab at ≤80 — both framing rather than measurement, and both
dropped entirely if the returned paragraph contains a digit (`architecture.md` §5.6). The 60 is
load-bearing two sections later; see §3.4. The Market tab calls no model at request time at all.
A market benchmark whose numbers came from a model is not a benchmark.

**Rows:** 59 (Evals as infrastructure — "answer 'how do you know it works?' with numbers, per
class, over time", M14), 63 (Drift, feedback loops, registries, rollout, M15), 51 (Prompt
engineering as code: versioning, regression sets, M12).

### 2.3 CORE and ADJACENT are counted separately, and adjacent is the bigger number

**The decision.** The headline denominator is core only. Adjacent — pre-sales SE/SA,
implementation, engagement — is counted, reported, and excluded from every percentage
(`architecture.md` §5.3).

**Why it matters here specifically.** On the 2026-09-08 scan, `reports/market/benchmark.json`
holds 189 distinct core requisitions across 23 companies and **206 adjacent across 17
companies**, plus 21 leadership. Those counts are rewritten by the 03:00 cron and are quoted with
a scan date for that reason; the claim that survives every scan is the ordering — adjacent
outnumbers core. Fold them together and "the FDE market" becomes Databricks Solutions Architects
and Datadog Sales Engineers, and every readiness number I compute is then a readiness for
pre-sales.

The first live probe made the same point louder: Databricks alone returned 105 core and 161
adjacent before dedupe (commit `355fede`). One board could have set the entire denominator.

**The related discipline.** Dedupe runs *before* counting, on `dedupeKey(company, title)` with
the location suffix stripped — on that same scan Palantir's 63 postings are 26 requisitions, and
LangChain's city clones of one Deployed Engineer role are one key. The clone counts move with the
boards, which is why I cite the mechanism (`lib/market/classify.ts`) and not the tally: what does
not move is that uncollapsed, two boards' cloning habits decide every percentage. Seniority
tokens survive normalization, because "Senior" is signal; only location suffixes are stripped.

**Rows:** 104 (Model evaluation, M20 — the denominator you compute a rate over is the half of
that row this exercises), 38 (Entity resolution and record linkage, M9 — the clone collapse is
exactly this), 91 (Target list: 40 companies, referrals, warm intros, M9 — the scan mechanizes
the target-list half of that deliverable and touches neither referrals nor warm intros).

### 2.4 One rendered sentence per fact — which was right for the email and wrong for the tab

**The decision.** `lib/market/benchmark.ts` and `insight.ts` emit a rendered `statement` string
per entry alongside the structured fields, so the weekly email and the Market tab say the
identical sentence and there is one place to fix a wording.

**What it did to the tab.** The Market tab printed those statements. Measured before the rebuild
(`docs/superpowers/specs/2026-09-07-market-tab-layout-design.md`): 34 coverage entries as prose
blocks at identical visual weight, 2 of them at 0%, 133 plan-row chips *all* reading "not
started", 9,025 characters in one list, and all 34 sentences containing the phrase "of core FDE
requisitions". The structured fields were there the whole time and unused.

**The fix, and the shape of it.** The tab was rebuilt into three zones — Decide, Reach, Market —
using `pct`/`hits`/`reqs`/`companies`/`rows` directly. The email still renders `statement`.
Nothing in `benchmark.ts` or `insight.ts` changed, so the "one place to fix a sentence"
guarantee survives for the surface it was actually written for (commit `ab9920c`).

**Why I tell this one.** The decision was not wrong; its *scope* was. A linear read wants a
sentence, a scannable surface wants a table, and I shipped the sentence to both because emitting
it once felt like the DRY answer. The honest lesson is that "one source of truth" is a claim
about the fact, not about its rendering.

**Rows:** 75 (Demos, executive communication, defending trade-offs, M17), 76 (Technical writing,
M17), 74 (Engagement documents: design docs, runbooks, M17).

### 2.5 GitHub is the database, and the writes are sequential

**The decision.** Every mutable artifact is a file: one file read whole and written whole with
its sha for mutable state, a directory of small files for append-only history
(`architecture.md` §4.6). No database, because the state has to survive a redeploy, be diffable
in review, and be readable by a second process on a different host.

**The rule that carries the most weight.** `synced: false` means "we do not know", never "the
file is empty". A benchmark computed from a failed read would reset the seen-set and report
every live requisition as new the following morning (`architecture.md` §4.6).

**Why sequential.** Each write is a commit on the same branch, so concurrent writes race the
branch ref. See §3.2 — this is one of the ones I got wrong first.

**Rows:** 44 (Designing Data-Intensive Applications — lost updates and compare-and-set are the
whole `sha` story, M10), 34 (Redis: idempotency, M8 — with the caveat in §5), 5 (Git at depth,
M1).

### 2.6 The documentation is checked by a script, not by an editor's memory

**The decision.** `scripts/verify-docs.py` reads every `verify:<anchor>=<value>` HTML comment in
`docs/platform/*.md` and asserts it against source data — `data/workbook.json`, `mcp/server.js`,
`app/page.tsx`, `vercel.json`. Unknown anchor names are a hard error, so a typo cannot pass by
matching nothing.

**Why anchors and not a regex over prose.** A regex over prose matches years, percentages and
version numbers, and a checker that reports three false alarms gets muted inside a week.

**Why it exists at all.** `docs/lumen-fde-architecture.md` said "13 tools" while `mcp/server.js`
served 14, and nothing caught it because nothing read the document. It serves
18 <!-- verify:mcp_tools=18 --> today, and the anchor is the reason that sentence cannot rot the
same way twice.
Live scan output is deliberately *not* anchorable — the 03:00 cron rewrites those numbers, so
anchoring them would fail most mornings for no defect. Those are cited by report file and scan
date instead, which is what §2.3 above does.

**The precedent.** This is the same guard `scripts/build-curriculum.py` already runs against the
data: a file's `topic`, `track`, `month` and `hours` must equal the plan's, and its comment
records why — a renumber once silently desynced 90 files (`architecture.md` §4.2). Same idea,
pointed at prose.

**Rows:** 20 (CI/CD and supply chain — its depth target is "A failing test or a HIGH CVE blocks
the deploy; ArgoCD syncs on green", M5), 40 (Testing and contracts — "A failing contract breaks
the build; coverage published", M10), 74 (runbooks and design docs, M17).

### 2.7 The MCP server is a narrow, audited tool surface

18 tools <!-- verify:mcp_tools=18 -->, bearer auth, 30 requests per 60 s, a 128 KB body cap, and
an audit trail split deliberately: `get_audit_log` is in-memory and lossy, the durable trail is
`reports/audit/*.json` written by the two tools that mutate anything (`architecture.md` §3.6).

Two things I would raise before an interviewer does. `read_ask_report` validated its argument
with `startsWith("reports/asks/")` and then interpolated that same string into a GitHub URL — and
WHATWG URL parsing collapses `..` before the request leaves the process, so
`reports/asks/../../data/workbook.json` passed the prefix check and resolved to the plan. The
general shape is the lesson: a check on a value that a *later* stage will still rewrite is not a
check on what that stage receives. Traversal is now rejected before the prefix is consulted. The
same audit found the auth guard returning true for every request whenever `MCP_API_KEY` was
unset; it now refuses with 503 when the key is unconfigured, the shape `github()` already used
for a missing token (both `mcp/server.js`, commit `88a619c`).

And `mcp/render.yaml`'s `buildFilter` has to include `data/**` as well as `mcp/**`, because
`server.js` reads `../data/*.json` from outside its `rootDir`; without it, plan edits never reach
the live MCP and it serves stale rows silently.

**Rows:** 52 (Tool use, structured outputs and MCP servers — its depth target is "Build an MCP
server with auth and narrow tools; explain the trust boundary", M12), 30 (Auth, M7), 56
(Guardrails, prompt injection, red-teaming — the traversal is the injection case, M13).

### 2.8 The review scheduler has two caps, and never shows a backlog

`lib/review.ts`: `LADDER = [1, 7, 21, 60, 150, 240, 330]` — 7 rungs
<!-- verify:ladder_rungs=7 --> — over 1,710 <!-- verify:prompts=1710 --> prompts
(`architecture.md` §7).

Three choices that are all the same choice. Reviews and new cards get separate caps, because
simulated over 400 days a single combined cap bound on 386 of them and left 547 of 700 prompts
untouched — reviews compete with an endless intake and the queue never drains. `gone` drops two
rungs, not to zero, because a lapse is not amnesia and resetting to day 1 is what makes these
systems feel punitive. And the backlog count is never rendered, because seeing "37 due" is what
kills them.

**Rows:** 40 (Testing and contracts: pytest, property tests, OpenAPI contract tests, M10 —
`lib/review.test.mts` is that 400-day simulation, and `.github/workflows/ci.yml` runs it with the
other three suites and `verify-docs.py`, so the simulation blocks a deploy rather than waiting to
be remembered).

---

## 3. What I got wrong

Seven of these. Every one was caught by something specific, and the catching mechanism is the
part worth talking about.

### 3.1 I wrote the built artifact and not the source, and reverted 117 of 119 topics

`data/curriculum/NN.json` is the source; `data/curriculum.json` is built from it by
`scripts/build-curriculum.py`. `rebaseline-hours.py` and `renumber-months.py` both wrote the
bundle only. So the re-baseline and the month renumber never reached the source files, and the
very next build regenerated the bundle *from the untouched sources* and reverted 117 of
119 <!-- verify:rows=119 --> topics. `00.json` still said 8h against the plan's 14.0; `115.json`
still said M13/12h against M23/17.0.

**How it was caught.** Not by the guard that existed. `build-curriculum.py` already had a hard
drift check for exactly this, and it never fired, because nothing had asked it to run — the
scripts were routing around the guard, not defeating it. It was found by an adversarial review
agent verifying something else, and I reproduced the revert deliberately before fixing it
(commit `aa18478`).

**The fix.** Both scripts now write `data/curriculum/*.json` and print `Now run: python3
scripts/build-curriculum.py` as their last line. 119 <!-- verify:curriculum_files=119 --> files
reconciled, 2,236 <!-- verify:subtopics=2236 --> subtopics, zero drift.

**The lesson I actually took.** A guard that runs only when invoked is a guard whose coverage is
a scheduling question. This is the reason `verify-docs.py` exists at all (§2.6).

### 3.2 Three concurrent writes raced the branch ref and lost the one file the tab reads

The first real scan fetched all 27 boards, computed the benchmark, and returned 502 having
written `index.json`, `trend.json` and `history/2026-09-07.json` — and lost `benchmark.json`.
`Promise.all` over three `writeJson` calls made them race the branch ref; GitHub took whichever
arrived first and rejected the rest with "is at &lt;sha&gt; but expected &lt;sha&gt;". Both shas
in the error resolved to commits rather than blobs, which is what named the cause.

**Where the bug came from.** Copied from `app/api/review/route.ts`, which writes a single file
and therefore cannot race itself. The shape was safe in its original context and not in this
one.

**The fix and its price.** Sequential writes, `index.json` first and alone because it is the only
file that cannot be recomputed — benchmark, trend and insight are pure functions of it. A round
trip per file instead of one for all of them costs about a second on a scan that already spends a
minute fetching boards. I quote it as a rate rather than a count because the file set grows:
`insight.json` joined after this fix and made four writes five (commit `b6c1ef7`,
`architecture.md` §5.5).

**Related, and deliberate:** failure severity is graded. A failed `index.json` or
`benchmark.json` write returns 502; a failed `history/` or `insight.json` write is logged and the
run still reports success, because a 502 makes Vercel retry the cron and re-scan ~47 MB of a
market that was already scanned.

### 3.3 The truncation guard was checked against the wrong number

The guard exists to catch a partial fetch, because a board that silently returns 10 of its 139
jobs produces a low count that looks exactly like a quiet week. The spec defines the floor as 60%
of the board's *total*. The build stored only `verifiedMatches`, so the floor came from the match
count: Databricks matches 97 of 870, giving a floor of 58, and a truncated fetch returning 100 of
870 would have sailed through as healthy and been written to the index as truth.

**How it was caught.** A spec-conformance pass that read the built code against the spec clause
by clause — not a test, not a run. The same pass also found the entire output half of spec
section 5 missing.

**The fix.** `verifiedTotal` is stored on all 32 <!-- verify:boards=32 --> boards and the floor
comes from it (`lib/market/fetch.ts:144`). Databricks' floor moves 58 → 522. The Decagon case
that motivated the guard — 10 of 139 — now fails a floor of 83 by design rather than clearing 20
by luck (commit `a9f082c`, `architecture.md` §5.2 rule 2).

### 3.4 The model quoted a plan row back as a percentage, and it shipped

The Monday email's framing paragraph is forbidden from containing a number. The post-check built
its allow-set from the prompt — and the prompt says "In 60 words or fewer", so `60` was
whitelisted forever. Narrowing the allow-set to the facts block was not enough either: coverage
statements cite plan rows and hours (`row 59, "…" — 18h, month 14`), so every row number the
block cites is a whitelisted token — 58 among them — and a row number reads as a percentage the
moment the model puts a `%` after it. **"Coverage sits at 58% this week" shipped under both
versions.**

**The fix.** There is no allow-set. The prompt forbids every digit, so any digit is a violation of
exactly the instruction given, and the whole paragraph is dropped. Any allow-set built from text
the model can read is one the model can quote from.

**How it was caught.** A verification agent wrote both leaks as characterization tests designed
to flip when fixed. They flipped, and they are the regression guard now (commit `9e2db40`,
`architecture.md` §5.6).

### 3.5 I shipped a gap registry that was wrong about my own curriculum

The Market tab's gap list came from three JD taxonomies I had written. Every claim was then
challenged on three independent lenses — find-the-coverage, jd-evidence, worth-closing. **All 18
claims were refuted.** No lens was the sole executioner: worth-closing refuted 18 of 18,
find-the-coverage 13 of 18, jd-evidence 9 of 18, and five claims lost on all three
(`docs/research/2026-09-07-gap-claims-challenge.md`).

The failure mode was uniform: the taxonomies grepped subtopic *names* and `learn` prose, and none
of them read `subtopics[].resource`. So the plan taught the concept under different words and the
audit could not see it.

- My own strongest claim — "codify patterns and feed them back to Product/Research, 12 of 15 JDs,
  weakest plan match" — is refuted by row 27 `subtopics[19]`, which runs the loop as a measured
  practice, plus row 59 and row 63 `subtopics[9]`, which gives the literal event schema.
- Six claims asserted a zero that is not a zero — the same six `benchmark.ts` had been printing
  "No plan row covers this" about. "Distillation is not covered" against row 99 `subtopics[16]`,
  a named 15-minute subtopic with the full soft-teacher objective and a `KLDivLoss` resource.
- Three frequencies were inflated by clones: knowledge-graphs 3/95 collapses to one distinct JD
  at `difflib` similarity 0.999; public-sector 4/15 is really 1/20.

**What I did not do.** I did not manufacture a survivor to justify the exercise, and I changed no
curriculum: no subtopic added, none evicted, no hours moved. Four registry entries were deleted
as factually false, three rewritten from "absent" to "partial", three frequencies corrected, and
13 <!-- verify:gaps=13 --> remain — kept as market signal, explicitly not as instructions to
change the plan (`data/market-skill-map.json` `_gapsNote`). `benchmark.ts` also stopped printing
"No plan row covers this" unconditionally, because for six entries that string was a lie the tab
was telling me.

**Why this is the one I most want to be asked about.** A gap registry that overstates itself
argues for evicting real curriculum. The cost of the bug was not a wrong number on a tab; it was
a wrong study decision, made confidently.

### 3.6 The clone-group fix, and the Tokyo role filed under India

This is two bugs, and the second is the first one's fix.

**Bug one.** Asked whether to target data-platform companies, the tab said they were the only
segment with any reachable roles. Wrong twice. "Reachable" excluded `india-office`, so Anthropic's
Applied AI Architect in Bangalore and Observe AI's AI Agent Engineer in Bengaluru both scored
zero. And larger: a clone group took its reach tier from whichever posting `distinctCore` picked
as representative, by oldest `firstSeen`. But a clone group is one role posted in several cities,
and you apply to the city you can reach. Anthropic's Applied AI Architect read as
`relocate-sponsor` while a clone sat in Bangalore; Databricks' FDE the same while a clone was
`Remote - India`; Cresta's Senior FDE read as out-of-reach while a clone was remote in Australia.

Fixed: a group takes the best tier any clone offers, which can only move a requisition toward
reachable and only on evidence that a takeable posting for that exact role exists. Measured on
the live corpus, reachable went 5 → 7 across 1 → 3 companies, in-India 7 → 11 across 2 → 5, and
segments with reachable roles 1 → 3 (commit `155e26a`).

**Bug two, which I introduced in that fix.** The tier came from the winning clone and the
*location* came from the representative. So the tab rendered "Anthropic — Applied AI Architect,
Tokyo, Japan" under `india-office`. The number was right and the evidence beside it was from a
different posting.

**How it was caught.** By rendering it. It was one of four defects found while rebuilding the
Market tab, none of which had shown up reading the code (commit `ab9920c`). The winning clone's
location and URL now travel with its tier, and the live check is "0 `india-office` rows whose
location is not in India".

**The general lesson, which I believe more than any of the specifics.** Bugs 3.2, 3.6-two and the
CSS specificity defect in the same commit were all invisible to reading and obvious to running.
The three that reading *did* catch — 3.3, 3.5 and 3.7 below — were each caught by an adversarial
pass with an explicit contract ("check the code against the spec clause by clause", "try to
refute each claim", "audit this tool surface"), never by a general review.

### 3.7 The seam in §4's header, shipped as a silent off-by-one

`get_syllabus` took only a 0-based `index`. Every market statement this system emits cites a
1-based plan row — "NEXT - row 28, 'Production Python architecture…'". So a caller who followed
its own recommendation into the syllabus got row 29's content: FastAPI in production, not
production Python architecture. No error, no empty result, no way to notice from the response.

**Why it is the worst kind.** The two numbers are both small integers naming a plan topic, and
the wrong one returns a plausible topic. Nothing about the output says which base it assumed.

**The fix.** Both parameters are explicit — `row` (1-based) and `index` (row − 1) — and every
market tool returns `row` and `syllabus_index` together, so the caller never has to infer a base
(commit `88a619c`). §4's header exists to state the same seam in prose.

### Two smaller ones, for completeness

- **I invented a failure mode the SDK did not have.** `app/api/sandbox/route.ts` pre-flighted
  `VERCEL_OIDC_TOKEN || VERCEL_TOKEN` and 503'd if neither was set. The docs promise only that
  OIDC is handled automatically in production, not that it surfaces under that variable name, and
  the SDK also accepts team/project/token credentials — so the guard could have 503'd a
  deployment that would have authenticated fine. Removed; the SDK's own error surfaces, with a
  hint appended when it looks auth-shaped (commit `20d75b7`).
- **A `git add -A` swept 283 lines of unrelated work into a commit whose message describes only
  the gap-registry repair.** Corrected in the record by the next commit rather than quietly
  (`9e2db40`).

---

## 4. The plan-row map

Which rows this platform is evidence for. Row numbers and titles are 1-based `Plan` rows from
`data/workbook.json`; row N is `Plan[N]` and curriculum topic `N-1` (`architecture.md` §4.1).
That seam is not decorative — getting it wrong is §3.7.

Titles and months here are copied verbatim from `Plan[N][2]` and `Plan[N][1]`, not paraphrased,
because this is the table I read a row number off before saying it out loud. The abbreviated
glosses in §2 are abbreviations of these.

| row | month | title | what in this system is the evidence |
|---|---|---|---|
| 5 | M1 | Git at depth: rebase, bisect, reflog, hooks, monorepo hygiene | GitHub-as-database; the sha-carrying write; the `git add -A` correction (§3.2, §3.6) |
| 6 | M2 | Docker internals: namespaces, cgroups, layers, networking | choosing a Firecracker microVM over a container over a process, on an isolation argument (§2.1) |
| 20 | M5 | CI/CD and supply chain: build, test, scan, sign, deploy | `.github/workflows/ci.yml` on Node 22 running the build, all four suites and `verify-docs.py`; `build-curriculum.py`'s hard drift check (§2.6) |
| 25 | M6 | Incident response and postmortems | the lost-`benchmark.json` write race, diagnosed from the sha in the error (§3.2) |
| 27 | M6 | Supporting a deployment you cannot log into: preflight checks, support bundles, remote diagnosis | per-board failure isolation, `ok:false` rather than skip; the truncation guard (§3.3) |
| 30 | M7 | Auth: OAuth2, OIDC, JWT, RBAC, multi-tenant claims | the sandbox authenticating by OIDC; the MCP bearer check, timing-safe and fail-closed (§2.1, §2.7) |
| 34 | M8 | Redis: caching, rate limiting, idempotency, streams | the login limiter and the MCP limiter — see the caveat in §5 |
| 35 | M8 | Real-time transports: SSE, WebSockets, streaming at scale | the sandbox's NDJSON stream — partial, see §5 |
| 38 | M9 | Entity resolution and record linkage: blocking, fuzzy and probabilistic matching, survivorship | `dedupeKey` and clone groups; 750 stored records → 189 core on the 2026-09-08 scan (§2.3, §3.6) |
| 40 | M10 | Testing and contracts: pytest, property tests, OpenAPI contract tests | 4 test files, 3 <!-- verify:market_tests=3 --> of them under `lib/market/`, all four run by CI; the 400-day scheduler simulation (§2.8) |
| 44 | M10 | Designing Data-Intensive Applications and Kleppmann's lectures | read-whole/write-whole with a sha; lost updates; `synced:false` ≠ empty (§2.5) |
| 51 | M12 | Prompt engineering as code: versioning, regression sets, structured outputs | the digit post-check, written as characterization tests (§3.4) |
| 52 | M12 | Tool use, structured outputs and MCP servers | `mcp/server.js` — 18 tools, bearer auth, narrow schemas, audit trail (§2.7); the `get_syllabus` base error (§3.7) |
| 56 | M13 | Guardrails, prompt injection, red-teaming | confining the model to interpretation; dropping any paragraph containing a digit; the `read_ask_report` traversal (§2.2, §2.7, §3.4) |
| 59 | M14 | Evals as infrastructure: eval sets, LLM-as-judge, human review, CI gates | `benchmark.ts` and `insight.ts` as pure functions, exercised by tests instead of by a 47 MB live scan (§2.2) |
| 63 | M15 | Drift, feedback loops, registries, rollout | week-over-week movement as the reason extraction must be deterministic; `trend.json`; the drift checks in build and docs (§2.2, §2.6) |
| 68 | M16 | Threat modelling and secrets lifecycle | the sandbox isolation argument, verified against nine secret names (§2.1) |
| 74 | M17 | Engagement documents: site survey, PRD-lite, SOW, ADRs, design docs, runbooks | this four-document set, and the checker that keeps it true (§2.6) |
| 75 | M17 | Demos, executive communication, defending trade-offs | this file; the statement-vs-table scope error is the clearest trade-off story in it (§2.4) |
| 76 | M17 | Technical writing and public write-ups | `docs/research/` and the commit messages that carry the reasoning (§3 throughout) |
| 82 | M19 | Resume defence: every line | §3 is the rehearsal — "what broke, what you changed, what you'd do differently" |
| 91 | M9 | Target list: 40 companies, referrals, warm intros | the scan mechanizes the target-list half — 23 companies with core reqs on the 2026-09-08 scan — and nothing of the referral half (§2.3) |
| 92 | M19 | Application pipeline: apply in waves, run three or four loops in parallel | the five reach tiers, and the roles takeable without leaving India — 11 on the 2026-09-08 scan (§3.6) |
| 104 | M20 | Model evaluation: cross-validation, data leakage, metric choice, calibration | core-vs-adjacent denominators; both reachability denominators reported, never one (§2.3) |

---

## 5. What this does not discharge

The honest half, and the reason the platform computes readiness the way it does.

**None of these rows are done.** Column 15 of `data/workbook.json` holds
117 <!-- verify:active_rows=117 --> `Not started` and 2 <!-- verify:skipped_rows=2 --> `Skipped`
(`architecture.md` §4.1). Readiness on the 2026-09-08 scan is **0%** — 0 of 490 share points, 0 of
34 skills cleared, from 2 matched progress events (`reports/market/insight.json`). That is the
expected reading at month one of 23, not a failure, and it is why the Decide zone leads with the
ranked marginal table rather than with the headline percentage.

`lib/market/insight.ts` reads progress events and never workbook column 15, precisely so that
building the platform cannot be mistaken for completing the plan (`architecture.md` §5.4 rule 1).
I built the thing that measures me; it still says zero. That is the design working.

Three rows in the map above are only partially evidenced, and I would say so before being asked:

- **Row 34 (Redis).** The login limiter is a `Map` in one serverless instance's memory and resets
  on cold start — best-effort by construction (`architecture.md` §3.1). The MCP limiter is
  in-process too. The row's deliverable is a token-bucket limiter with idempotency keys and a
  stated position on eviction and persistence. This system has the *problem*; it does not have
  the row's answer to it.
- **Row 35 (Real-time transports).** The sandbox streams NDJSON over a `fetch` response. The row
  asks for SSE-vs-WebSocket chosen from first principles, resumable delivery, backpressure and a
  load-test report. None of those exist here.
- **Row 59 (Evals).** The market tests are unit and characterization tests over pure functions.
  The row asks for 200 labelled examples, per-class accuracy and a CI gate. The habit is right;
  the artifact is not built.

And one thing the whole platform does not touch: tracks M, N and O — 26 rows of mathematics, ML
systems and deep learning — are 335h and 21% of the 1,588 <!-- verify:hours=1,588 --> active
hours, and the benchmark's own over-investment section flags them against measured JD frequency
(`reports/market/benchmark.json`, 2026-09-08 scan). Those three figures come from the workbook
rather than the scan, so unlike the market counts they move only when I re-baseline the plan. The
system that says so is not evidence for them.

---

## 6. Questions I expect, and the shortest true answer

**"What would you do differently?"** Render the surface before designing the data that feeds it.
Three of the seven defects in §3 were invisible to reading and immediate on screen, and the
statement-string mistake (§2.4) was a data decision that could only be evaluated as a layout.

**"How do you know your numbers are right?"** I mostly do not, so the system is built so that
wrong numbers are loud. `synced:false` never degrades to zero. A board under 60% of its audited
total is `ok:false`, not a small week. A digit in a model paragraph drops the paragraph. Adjacent
never enters a core percentage. And a number in these docs that stops matching its source fails
`verify-docs.py`.

**"Tell me about something you got wrong."** §3.5 — I shipped a gap registry that was confidently
wrong about my own curriculum, and the cost was not a bad pixel, it was a bad study decision. It
was caught by an adversarial pass with an explicit contract to refute each claim, and the fix
deleted my own strongest finding.

**"Why is there no database?"** Because the state is small, must survive a redeploy, must be
readable by a second process on a different host, and benefits enormously from being diffable in
review — every scan's numbers arrive as a commit I can read. The cost is real and named: writes
are commits on one branch, so they must be sequential (§3.2), and `reports/progress` GET is an
N+1 by design (`architecture.md` §4.6).

**"What breaks first if this grows?"** The read-whole/write-whole shape. `reports/market/index.json`
is 439 KB at 750 stored requisition records on the 2026-09-08 scan; `MAX_REQS` is 3,000
(`lib/market/store.ts`, `architecture.md` §5.1). The JD body is never stored, which is what keeps
that file near 500 KB instead of ~40 MB — and that decision is load-bearing, not incidental
(`architecture.md` §5.2 rule 5).

---

Facts: [`architecture.md`](architecture.md). Daily use: [`operating.md`](operating.md). Failures
and blast radius: [`runbook.md`](runbook.md).
