# Routed pages, Quaere everywhere, and a motivation layer - design

Date: 2026-09-08
Status: approved, ready for implementation

## The problem

`app/page.tsx` is 699 lines holding all ten sections in one route, with **zero routing hooks**.
Every section mounts in the same component, so the page grows downward without end - which is
what "the pages are getting truncated" describes. Nothing is linkable: there is no URL for the
Market tab, no bookmark for Curriculum, and Quaere cannot point at a view.

Underneath that, the plan is a 23-month commitment currently at month 1 and 0%. The system
measures the work but does nothing to sustain it, and the failure mode over that horizon is quiet
abandonment rather than lack of information.

## Scope: three projects, in this order

1. **Routing** - mechanical, high certainty, unblocks the rest.
2. **Quaere everywhere** - needs the shared layout from 1.
3. **Motivation layer** - needs somewhere to live, and benefits from 1 and 2.

Single user. But per the "don't paint into a corner" decision, everything user-specific moves into
one config file rather than staying scattered: the GitHub repo, the location used for reachability,
the name, the weekly-hours target. This is not multi-user and does not pretend to be; it just
means the day it might be, the values are in one place.

## 1. Routing - extract, then route

**Two mechanical steps, each independently verifiable.** Not a big-bang split: 699 lines moving at
once with no UI tests is how a regression ships, and this repo's tests cover only the data layer.

**Step 1 - extract.** Each section's component moves out of `page.tsx` into `components/`, a pure
move with no behaviour change. Verifiable because the rendered output must be byte-identical.

**Step 2 - route.** A route per section importing its component, under a shared layout:

```
app/(app)/layout.tsx     nav + Quaere dock, present on every route
app/(app)/page.tsx       Overview
app/(app)/plan/          curriculum/  sandbox/  mocks/  roadmaps/
app/(app)/library/       assessments/ comp/     market/
components/              one file per section
data/profile.json        repo, location, name, weekly target
```

Ten routes, each deep-linkable, each small enough to hold in your head. The secondary benefit is
real: `Market` alone is a few hundred lines inside a file that also renders nine other things.

**Constraints.** `proxy.ts` gates `/api/cron/` and password-gates everything else - the new routes
inherit that unchanged. Client state that currently lives in `page.tsx` (`statuses`, hydration
state) moves to the layout or a provider, because the progress write-guard depends on knowing
whether hydration has settled, and that guard must survive the migration intact.

## 2. Quaere everywhere

A collapsible dock in the shared layout, on all ten routes, keyboard-summoned. It reads the current
route and includes that page's context automatically, so the same question means different things
on `/market` and on `/plan` without the user disambiguating.

Nothing new is needed underneath: `/api/ask` already builds the full plan server-side and takes an
optional per-topic syllabus and market block, and the 18 MCP tools already expose the same data to
Claude Code.

**The rule that survives the migration: Quaere reads every number and writes none.** It is already
true of the market subsystem, and it is what keeps a measured number trustworthy when it sits
beside prose.

## 3. The motivation layer

Four mechanics, each grounded in data that already exists. Nothing here invents a metric.

**Evidence.** Completing a row reports what it bought, not that it was completed: readiness before
and after, the skill it cleared, that skill's share of core requisitions, and - when one exists - a
named reachable role that asks for it. Every part is already computed by `lib/market/insight.ts`;
the marginal table is exactly this calculation run forward.

**Streaks, built for recovery.** No chain, and no broken-streak state anywhere in the UI.

- "Studied 14 of the last 21 days" - a rate that dips rather than resetting.
- Longest run, which only ever increases.
- Returning after a gap reads "back after 5 days; longest run 12", never a zero.

The design constraint is explicit: **nothing on the page may punish week 30.** A 40-day streak
displayed as broken is a plausible quit trigger on a 23-month plan, which is the outcome this whole
layer exists to prevent.

**Shipped artifacts.** The curriculum carries 119 `proofOfWork` deliverables and **nothing records
them** - the system cannot currently answer "what have I built." Add recording (what, when, a URL)
and a wall that displays them. This is the closest thing here to a real product feature, and it
compounds into the portfolio used at interview.

**Quaere noticing, with a hard constraint.** It may speak only about events that actually happened:
a progress event, a shipped artifact, a readiness move. It may not manufacture encouragement, and
**silence on a quiet week is correct behaviour.** The first time it praises something that did not
happen, the user learns to skip it, and it becomes worse than nothing.

## Testing

The existing four suites must stay green throughout; CI runs them plus `verify-docs.py`.

- **Step 1 is verified by equivalence**: the rendered DOM of each extracted section must match what
  `page.tsx` produced. A screenshot or serialized-DOM comparison, not a claim.
- **Routing**: every route renders, deep links resolve, the password gate still applies, and
  `/api/cron/` still 401s without its secret.
- **The write-guard must survive**: load any page, touch nothing, zero POSTs to `/api/progress`;
  controls disabled until hydration settles. This regressed once already and cost real data.
- **Motivation**: a completed row produces the correct readiness delta; a gap in study days renders
  as a rate and a longest-run, never as a broken streak or a zero; Quaere emits nothing on a week
  with no events.

## Not doing

- **Multi-user, auth, a database.** The decision was explicitly "not painting into a corner", not
  building for other users. That would abandon the single-repo storage model everything is built on
  and compete directly with the 1,588 hours.
- **Points, badges, levels.** Rejected on the user's own framing: the reward is the evidence.
- **A notification channel.** The daily digest already exists and already carries alerts.
- **Redesigning the visual language.** Swiss International, `--primary #5e6ad2`, the existing
  spacing scale. This is a structural migration, not a restyle.
