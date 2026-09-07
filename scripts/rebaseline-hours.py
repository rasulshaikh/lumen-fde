#!/usr/bin/env python3
"""Re-baseline the Hours column so it funds building, not just reading.

The defect: Hours averaged 24 minutes per syllabus part, and that 24 minutes had
to cover reading the source, watching the video, doing the lab AND producing the
topic's proof-of-work artifact. Three rows fail on their own stated arithmetic --
row 39 budgets 6h for a deliverable naming 4.5h of recorded sessions, row 93
budgets 16h for 60 timed problems plus 2.25h of recorded mocks, and row 1 budgets
8h for a topic whose artifact is a public repo with a fixture generator and fixes
for seven failure modes.

The model, in two parts:

  instruction = the syllabus's own per-part minutes
      Not an estimate. Every one of the 2,236 subtopics in curriculum.json already
      carries a `minutes` field, and they sum to 994.6h -- the exact figure the
      audit reported as instruction time. The plan has always known how long it
      takes to teach itself; only the Hours column did not.

  build = max(BUILD_FLOOR, cost of the artifacts the deliverable actually names)
      This half IS an assumption, and is flagged as one. Only 14 of 117 artifacts
      state a clock time and the proofOfWork prose does not yield reliable counts,
      so costing each one individually would be false precision. A flat floor,
      overridden wherever the artifact names countable work.

Hours_new = max(Hours_old, instruction + build). The max() matters: the existing
column encodes real judgement about relative weight, and no topic should lose
budget to a formula. Rows already above the floor keep their own number.
"""
import json
import re
import sys

BUILD_FLOOR = 5.0      # hours to produce one proof-of-work artifact properly
SESSION_OVERHEAD = 2.0 # a recorded 45-min session costs its own length again in
                       # setup, write-up and narration
PROBLEM_MINUTES = 20   # one timed easy-medium problem, solved and logged
DRILL_MINUTES = 30     # one recorded drill
DESIGN_MINUTES = 90    # one written system design

WORDS = {"one": 1, "two": 2, "three": 3, "four": 4, "five": 5, "six": 6,
         "seven": 7, "eight": 8, "nine": 9, "ten": 10, "eleven": 11, "twelve": 12}
COUNT = r"(one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|\d{1,3})"


def n(token):
    return WORDS.get(token.lower(), None) or int(token)


def artifact_hours(text):
    """Cost only the work the artifact names outright. Silent about the rest --
    that is what the floor is for.

    The same artifact is usually described twice, once in proofOfWork and once in
    the Deliverable column ("60 timed problems" appears in both), so counts are
    deduped per kind by taking the largest rather than summing. Taking the max
    also disposes of the sub-counts inside a phrase: "three recorded 45-minute
    two-problem mock screens" yields both 60 problems and 2 problems, and 60 is
    the one that is real."""
    kinds = {
        "problems": (COUNT + r"[- ]?(?:timed\s+)?problems?\b", PROBLEM_MINUTES),
        "drills": (COUNT + r"\s+(?:recorded\s+)?drills?\b", DRILL_MINUTES),
        "designs": (COUNT + r"\s+written\s+designs?\b", DESIGN_MINUTES),
    }
    hours, named = 0.0, []

    # recorded sessions are keyed on their own length, so a topic asking for both
    # 45-minute and 5-hour recordings keeps both
    sessions = {}
    for m in re.finditer(COUNT + r"[^.]{0,40}?recorded\s+(\d+)[- ]minute", text, re.I):
        mins = int(m.group(2))
        sessions[mins] = max(sessions.get(mins, 0), n(m.group(1)))
    for mins, count in sorted(sessions.items()):
        h = count * mins / 60 * SESSION_OVERHEAD
        hours += h
        named.append(f"{count} x {mins}min recorded = {h:.1f}h")

    for kind, (pattern, minutes) in kinds.items():
        counts = [n(m.group(1)) for m in re.finditer(pattern, text, re.I)]
        if not counts:
            continue
        h = max(counts) * minutes / 60
        hours += h
        named.append(f"{max(counts)} {kind} = {h:.1f}h")
    return hours, named


def main(write):
    wb = json.load(open("data/workbook.json"))
    cur = json.load(open("data/curriculum.json"))
    plan, topics = wb["Plan"], cur["topics"]
    body = plan[1:]

    rows, grew, changes = [], 0, []
    for i, r in enumerate(body):
        skipped = str(r[15]).strip().lower() == "skipped"
        old = float(r[13] or 0)
        t = topics.get(str(i))
        if not t or skipped:
            rows.append((i, r, old, old, 0, 0, []))
            continue
        parts = len(t["subtopics"])
        instruction = sum(s.get("minutes", 0) for s in t["subtopics"]) / 60
        named_h, named = artifact_hours(t["proofOfWork"] + " " + str(r[14]))
        build = max(BUILD_FLOOR, named_h)
        new = max(old, round((instruction + build) * 2) / 2)  # half-hour granularity
        if new != old:
            grew += 1
            changes.append((new - old, i, r[2][:48], old, new, parts, instruction, build, named))
        rows.append((i, r, old, new, parts, build, named))

    active = [x for x in rows if str(x[1][15]).strip().lower() != "skipped"]
    old_tot = sum(x[2] for x in active)
    new_tot = sum(x[3] for x in active)

    print(f"model: syllabus's own per-part minutes + max({BUILD_FLOOR}h, named artifacts) build")
    print(f"       Hours_new = max(Hours_old, instruction + build), half-hour granularity\n")
    print(f"active topics       {len(active)}")
    print(f"hours  {old_tot:>8.0f}h  ->  {new_tot:.0f}h   ({new_tot/old_tot:.2f}x)")
    print(f"rows raised         {grew}   unchanged {len(active)-grew}")
    print(f"min/part all-in     {old_tot*60/sum(x[4] for x in active if x[4]):.1f}  ->  "
          f"{new_tot*60/sum(x[4] for x in active if x[4]):.1f}")
    for wk in (16, 20, 24):
        print(f"at {wk}h/week          {new_tot/wk:.0f} weeks = {new_tot/wk/4.333:.1f} months")

    print("\nlargest increases:")
    for d, i, topic, old, new, parts, ins, bld, named in sorted(changes, reverse=True)[:8]:
        detail = "; ".join(named) if named else f"floor {BUILD_FLOOR}h"
        print(f"  row{i+1:>4}  {old:>5.1f} -> {new:>5.1f}h  ({parts} parts = {ins:.1f}h taught + {bld:.1f}h built)  {topic}")
        if named:
            print(f"          artifact names: {detail}")
    print("\nrows keeping their own number (already above the model):")
    for i, r, old, new, parts, bld, _ in rows:
        if old == new and parts:
            print(f"  row{i+1:>4}  {old:.1f}h  {parts} parts  {r[2][:52]}")

    if not write:
        print("\n(dry run -- pass --write to apply)")
        return

    import glob, pathlib as _p
    for i, r, old, new, parts, bld, _ in rows:
        if new != old:
            plan[1 + i][13] = new
    json.dump(wb, open("data/workbook.json", "w"), ensure_ascii=False, indent=2)

    # data/curriculum/NN.json is the SOURCE, data/curriculum.json is BUILT from it by
    # scripts/build-curriculum.py. Writing only the bundle is how 119 files silently went
    # stale: the next build regenerated the bundle from them and reverted every Hours value
    # in this file's own output. build-curriculum.py has a hard drift check for exactly this
    # and it never fired, because nothing had asked it to run. Write the source; rebuild after.
    for f in sorted(glob.glob("data/curriculum/*.json")):
        path = _p.Path(f)
        d = json.loads(path.read_text())
        i = d.get("i")
        if i is None:
            continue
        want = float(plan[1 + i][13])
        if float(d.get("hours", -1)) != want:
            d["hours"] = want
            path.write_text(json.dumps(d, ensure_ascii=False, indent=1))
    print("\nwritten. Now run: python3 scripts/build-curriculum.py")


if __name__ == "__main__":
    main("--write" in sys.argv)
