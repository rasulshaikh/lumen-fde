# Independent validation brief

Written for a second reviewer, on a different model, with no memory of how any of this was built.

The point of this document is to be **disagreed with**. Everything below is a claim someone made
about their own work, and every claim is followed by the command that proves or breaks it. If a
command's output contradicts the claim, the claim is wrong and the code is wrong. Say so plainly.

Do not take the prose in this file, or the comments in the codebase, as evidence. Both were written
by the same author as the code.

---

## 1. What the system is

`lumen-fde` is a single-user study dashboard for one reader (Rasul, Pune) preparing for Senior
Forward Deployed Engineer roles over 23 months. It is a Next.js 16 App Router app on Vercel
**Hobby**, with a Node MCP server on Render, and **GitHub as the database**: every mutable artifact
is a file in this repository, read and written whole.

Stack facts that constrain everything:

- Vercel **Hobby**: max 2 cron jobs per project, both already used (03:00 scan, 03:30 digest).
  Functions cap at **60s**. A build asking for more is rejected at deploy but passes `next build`.
- `proxy.ts` gates the whole app behind a password. `/` and `/login` are public.
- The model call in `/api/ask` is MiniMax-M3 with a 55s timeout inside that 60s function.

```bash
cat vercel.json                       # 2 crons, not 3
grep -rn "maxDuration" app/api        # nothing above 60
sed -n '1,60p' proxy.ts               # the gate
```

## 2. The invariants this codebase claims to enforce

These are the rules the product's credibility rests on. **Look for violations.**

| Rule | Where it is written down |
|---|---|
| The spaced-repetition backlog **count** is never rendered and never enters a prompt. A state, never a number. | `lib/review.ts`, `app/recall.tsx`, `lib/companion/context.ts` |
| **Unknown is never rendered as none.** A store that cannot be read is not an empty store. | `lib/market/store.ts`, and every reader of it |
| Nothing is invented. Every number on screen or in a prompt comes from a file. | `app/api/ask/route.ts` `MARKET_RULE` |
| External text never overrides a number measured in this repo. | `lib/external/brief.ts` |
| The public landing page follows "scale, never state": counts and hours are public; progress, readiness, current focus and anything personal stay behind the gate. | `proxy.ts`, `app/page.tsx` |
| Docs numbers are anchored and checked in CI; prose is **not** checked and has drifted before. | `scripts/verify-docs.py` |

```bash
# The backlog rule. Any integer near a recall count in a prompt path is a violation.
grep -rn "recall" lib/companion/context.ts app/api/ask/route.ts
# The unknown-vs-none rule.
grep -rn "synced" lib/companion/context.ts lib/papers.ts components/Paths.tsx
```

## 3. Verify the whole thing still stands up

```bash
npm ci
npx tsc --noEmit                      # expect: clean
npm run build                         # expect: compiled, 14 API routes, 9 tabs
python3 scripts/verify-docs.py        # expect: checked 76 anchors, no failures
node --check mcp/server.js
for s in $(node -e "console.log(Object.keys(require('./package.json').scripts).filter(x=>x.startsWith('test:')).join(' '))"); do
  echo "== $s"; npm run --silent $s | tail -1
done                                  # expect: 14 suites, all passing
```

CI additionally asserts that **every** `test:` script appears as a step in
`.github/workflows/ci.yml`, because a suite existing is not a suite running.

## 4. The specific claims to attack

Each of these was found and fixed in this session. Each is stated as a number, because a number can
be wrong. Re-derive them.

### 4.1 The syllabus bug: four sections reached the model for 0 of 119 topics

**Claim.** Before commit `2d5d659`, `syllabusContext` rendered subtopic bodies *before* outcomes and
failure modes, then sliced at 7,000 chars. The rendered string runs 16,221 to 34,100 chars and the
earliest `Outcomes:` offset anywhere in the curriculum is 13,401, so outcomes and failure modes
**never** reached a prompt, for any topic. `interviewQuestions` (835) and `proofOfWork` (119) were
not in the route's type at all. After the fix, all four ship for 119 of 119 within a 14,000 cap.

**How to break it.** Rebuild both renderings from `data/curriculum.json` and measure. Check the
current `syllabusContext` really is bounded: does any topic exceed `SYLLABUS_CAP`? Does the fill
loop cut a line mid-sentence? Is `PART DETAIL (n of m)` honest about what it dropped?

```bash
git show 2d5d659 -- app/api/ask/route.ts | head -80
grep -n "SYLLABUS_CAP" app/api/ask/route.ts
```

### 4.2 The paper draw is balanced, not shuffled

**Claim.** `lib/paper.ts` draws round-robin across topics because the bank is uneven (14 to 17
prompts per topic, 1,710 total across 119). Six questions over three rows returns 2/2/2; twelve over
five returns 3/3/2/2/2; forty seeds give 27 distinct opening questions.

**How to break it.** `npm run test:paper` runs against the real bank. Then try to find a scope where
one topic dominates, or where the same paper repeats across seeds.

### 4.3 The backdrop is real 3D and cannot blow up

**Claim.** `lib/backdrop.ts` is a perspective projection with the camera outside the form, so the
divide can never reach zero. Alpha spans 0.11 to 0.19. The form fits inside the shorter viewport
side on six viewports.

**How to break it.** `npm run test:backdrop`. Then look for a viewport or timestamp that produces
NaN, a negative `k`, or a form wider than the viewport. Check that `prefers-reduced-motion` really
draws one frame rather than a slower loop, and that the loop stops on `visibilitychange`.

**Known history worth checking for regressions:** this feature was invisible in production three
separate times, for three different reasons, while every geometry test passed:
1. `strokeStyle = "rgba(var(--x), .1)"` is invalid; canvas discards it silently.
2. An opaque `body` background painted over a `z-index:-1` child.
3. Four full-bleed elements repainted the page colour on top of it.
4. A canvas measured in a hidden tab reported width 0 and never re-measured.

`lib/backdrop.test.mts` now reads `app/globals.css` and asserts only `html` paints the page colour.
**Check that assertion is not trivially passable.**

### 4.4 Papers are recorded without touching the recall schedule

**Claim.** `reports/papers/` is a separate append-only store. `lib/papers.ts` imports nothing that
can write `reports/review/state.json`. The prompt block names weak topics and never computes a
score, average, trend or streak.

**How to break it.** Follow the import graph. Then read `papersContext` output and look for anything
resembling a score. Check `validatePaper` against hostile input: out-of-range rows, duplicate keys,
a scope containing `../`, a 14-hour sitting.

```bash
grep -rn "review" lib/papers.ts app/api/papers/route.ts    # expect: nothing that writes it
npm run test:papers
```

### 4.5 The parts index cannot fabricate absence

**Claim.** `partsIndexContext` keyword-matches over 2,236 subtopic names, ships at most 30 lines,
and states that a miss is not evidence the plan omits something. Filler-only questions return
nothing rather than confident irrelevance.

**How to break it.** Find a question about something genuinely in the plan that returns zero rows,
or a junk question that returns rows. Check the stop list is not so aggressive it eats real terms.

### 4.6 Answers are no longer silently truncated

**Claim.** `max_completion_tokens` was 1,600 and `finish_reason` was never read, so cut-off answers
were served and committed to `reports/asks/` as complete. One ends on a bare `## 5.`. Now 3,600 with
`finish_reason === "length"` labelled in the answer.

```bash
tail -3 "reports/asks/2026-09-09T18-40-08-797Z-build-a-practical-study-sequence-connecting-ai-engineering-t.md"
grep -n "finish_reason\|MAX_ANSWER_TOKENS" app/api/ask/route.ts
```

**Worth questioning:** is 3,600 output tokens actually safe inside a 55s model call on a 60s
function, or has truncation been traded for timeouts? That trade was asserted, not measured.

### 4.7 The Paths view refuses to invent a country split

**Claim.** A reach tier records that a role needs relocation and a visa, not *where to*. So the Gulf
and US cards read one shared pool and neither renders a total. Only the exact path (India) shows a
headline count.

**How to break it.** Read `lib/paths.ts` and `components/Paths.tsx`. Is there any path by which a
shared attribution renders a summed figure? Does every CompReality row still reach the page?

## 5. Things known to be unverified

State these back if you find them still unverified, and say what it would take to close them.

1. **Everything behind the gate has never been clicked by its author.** `/practice`, `/paths`, the
   focus card, the selection capture and the record button were verified by unit tests, rendered
   replicas at real widths, and the deployed stylesheet. Nobody has pressed the buttons.
2. **`POST /api/papers` has never run against real GitHub.** `reports/papers/` does not exist.
3. **The live web search path** (`POST /api/external-brief`) was measured standalone at 23.6s to
   38.6s, but the two-request client flow has not been exercised end to end.
4. **`vercel env ls` does not list `SURFSENSE_*`**, yet the brief demonstrably wrote from
   production. That contradiction is unexplained.

## 6. What a useful review looks like

Rank findings by whether they would produce a wrong answer, a lost write, or a false claim on
screen. In that order.

The three defect classes this repo has actually produced, so look for more of them:

- **A duplicate CSS rule silently overriding an earlier one.** `.login-shell` declared three times,
  `.panel-head` four, `.bar-item` twice, `body` twice. Several fixes were written next to the first
  declaration and undone by a later one.
- **A comment or doc asserting something the code does not do.** A `CRON_SECRET` path that did not
  exist; a link-preview card carrying a headline the site had stopped using; "this list is now
  exhaustive" as a comment with nothing checking it.
- **A cap or guard that is unreachable.** The 7,000-char syllabus cut that made four sections
  structurally impossible to ship, and every test still passed.

If you find nothing in a section, say so. An empty finding list is a valid result and is more useful
than a padded one.
