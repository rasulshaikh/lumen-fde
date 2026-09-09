# A rotating hero, a deep link that lands, and an assessments page that reads something

Date: 2026-09-09
Status: approved, ready for implementation

Three defects found by Rasul looking at the live site, and one of them is the same class of bug
this project has fixed four times already.

## 1. The cited row does not land

`row 13 M4` on /market is already a button, and it already pushes `/plan?row=13`, and `/plan`
already reads the parameter and expands the row. All of that works. The row opens at **y=2265 in
a 21,461px page while the viewport stays at scrollY 0**, so nothing visibly happens and a working
link reads as a dead one.

The fix is landing, not routing: scroll the cited row to the middle of the viewport on arrival
and mark it for long enough to be found by eye.

- Scroll instantly, not smoothly. This is a destination, not a transition, and a 21,000px smooth
  scroll is both slow and nauseating.
- The syllabus body is fetched, so the row may not be in the DOM on the first frame. Poll briefly
  rather than assuming, and give up rather than spinning.
- The mark is a background tint that clears itself after ~2.4s. It must clear: a permanent
  highlight becomes a second, competing "selected" state that nothing ever unsets.

## 2. Assessments reads nothing

`components/Assessments.tsx` imports `useState` and nothing else. Every string in it is a
literal, including the one visible on screen:

> Current plan topics · shell · networking · systems

That says *current* and it is frozen. In month 20 it will still say shell, networking, systems.
This is the same defect as the daily digest pinned to plan row 1, the "9-month operating view"
header, the hardcoded "16 books · 2 repos", and the Ask panel's CSS `:after` counters - a string
that claims to be derived and is not.

Fix: derive it from the same `useAppState()` values every other view reads. Where a line cannot
be derived truthfully it stays generic rather than being dressed up as data.

**Not doing:** recording assessment results. `score_assessment` computes and returns without
persisting, so the page cannot say when you last took a checkpoint. That is a real gap and it
needs a store, a route and tests; it was explicitly deferred.

## 3. The hero is constant

One hardcoded headline and one hardcoded sentence on all ten routes.

The approved field-notebook spec says: *"No motion beyond what exists. A study tool opened daily
for two years should not animate."* A marketing carousel is precisely what that was written
against. Rasul was shown that tension and chose rotation anyway, so this is built - but built so
that what rotates is **measured fact, not slogan**. That is the difference between a carousel and
a status line.

- The `h1` stays. It is the brand promise and it should not move.
- The line beneath it cycles every 7s through facts derived from `useAppState()`: plan size,
  month and track, topics recorded against hours remaining, syllabus parts, peak month. Every one
  is arithmetic over data already on screen elsewhere.
- Crossfade only. No slide, no scale, no bounce.
- Pauses on hover and on keyboard focus, and while the tab is hidden - a timer that runs in a
  background tab is a wasted wake and a surprise on return.
- `prefers-reduced-motion: reduce` renders one line, no timer, no dots. Not a faster animation -
  none.
- The lines are stacked in one grid cell so the tallest sets the height. A hero that changes
  height every 7s would push the entire page down under the reader.
- Dots are real buttons with labels, so the rotation is operable and not only decorative.

## Testing

- `/plan?row=N` for a low, middle and high N: the row is in the viewport after arrival and the
  mark clears. A row cited from /market lands the same way as one pasted into the address bar.
- The assessments string changes when progress changes - verified by moving progress, not by
  reading the code.
- The hero: no layout shift across a full cycle (measured, not eyeballed), the timer stops on
  hover, and under reduced motion there is exactly one line and no interval.
- The five contrast floors still pass in both themes, and no text lands on the ruling.
