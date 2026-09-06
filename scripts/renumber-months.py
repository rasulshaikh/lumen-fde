"""Relabel plan months so a month is a real month, not a sequencing bucket.

The plan grew while keeping month numbers that meant "stage", not "calendar month":
M4 held 104h (6.5 weeks at 16h/week) while M10 held 21h (1.3 weeks). This walks the
topics in their EXISTING order and closes each month once it reaches the per-month
budget, so nothing is reordered and every prerequisite chain survives — only the value in
the Month column changes.

Run it again after any change to the Hours column. The month count follows from the
hours, so re-baselining Hours without re-running this leaves the calendar lying.

    python3 scripts/renumber-months.py            # report only
    python3 scripts/renumber-months.py --write
"""
from __future__ import annotations

import collections
import json
import pathlib
import sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
WORKBOOK = ROOT / "data" / "workbook.json"
CURRICULUM = ROOT / "data" / "curriculum.json"
WEEKLY_HOURS = 16.0
WEEKS_PER_MONTH = 52.0 / 12.0  # 4.333
# The month count is derived, not declared. It was hardcoded to 13, which quietly
# became a lie the moment the Hours column was re-baselined to fund building as
# well as reading — the same class of stale number this script exists to remove.

MONTH_COL = 1
HOURS_COL = 13
TOPIC_COL = 2


def main() -> None:
    write = "--write" in sys.argv
    wb = json.loads(WORKBOOK.read_text())
    header, rows = wb["Plan"][0], wb["Plan"][1:]

    before_topics = [str(r[TOPIC_COL]) for r in rows]
    before_hours = sum(float(r[HOURS_COL]) for r in rows)
    before_width = {len(r) for r in rows}
    months = max(1, round(before_hours / (WEEKLY_HOURS * WEEKS_PER_MONTH)))
    budget = before_hours / months

    # Existing order already encodes the teaching sequence: stable-sort by current month
    # only, so rows inside a month keep their relative order and nothing jumps a stage.
    order = sorted(range(len(rows)), key=lambda i: float(rows[i][MONTH_COL]))

    assigned: dict[int, int] = {}
    month = 1
    acc = 0.0
    for pos, idx in enumerate(order):
        h = float(rows[idx][HOURS_COL])
        remaining_months = months - month
        remaining_rows = len(order) - pos
        # Close the month when it is full, but never so early that the remaining months
        # cannot each get at least one topic.
        if month < months and acc > 0 and acc + h / 2 > budget and remaining_rows > remaining_months:
            month += 1
            acc = 0.0
        assigned[idx] = month
        acc += h

    new_rows = [list(r) for r in rows]
    moved = 0
    for idx, m in assigned.items():
        if float(new_rows[idx][MONTH_COL]) != float(m):
            moved += 1
        new_rows[idx][MONTH_COL] = float(m)

    # --- guard rails: this must be a pure relabel ---
    assert [str(r[TOPIC_COL]) for r in new_rows] == before_topics, "topic order changed"
    assert abs(sum(float(r[HOURS_COL]) for r in new_rows) - before_hours) < 1e-6, "hours changed"
    assert {len(r) for r in new_rows} == before_width, "row width changed"
    assert len(new_rows) == len(rows), "row count changed"
    seen = sorted({int(r[MONTH_COL]) for r in new_rows})
    assert seen == list(range(1, months + 1)), f"months not contiguous 1..{months}: {seen}"
    for a, b in zip(rows, new_rows):
        diff = [i for i in range(len(a)) if a[i] != b[i]]
        assert diff in ([], [MONTH_COL]), f"a column other than Month changed: {diff}"

    load = collections.defaultdict(float)
    count = collections.Counter()
    for r in new_rows:
        load[int(r[MONTH_COL])] += float(r[HOURS_COL])
        count[int(r[MONTH_COL])] += 1

    print(f"{len(rows)} topics · {before_hours:.0f}h · {months} months · target {budget:.1f}h/month "
          f"({budget / WEEKLY_HOURS:.1f} weeks at {WEEKLY_HOURS:.0f}h/wk)")
    print(f"{moved} rows change month; every other column untouched\n")
    print("  month  topics   hours   weeks")
    for m in range(1, months + 1):
        print(f"   M{m:<4} {count[m]:5}  {load[m]:6.0f}  {load[m] / WEEKLY_HOURS:6.1f}")
    spread = max(load.values()) - min(load.values())
    print(f"\n  spread {spread:.0f}h")
    print(f"  total  {sum(load.values()):.0f}h = {sum(load.values()) / WEEKLY_HOURS:.1f} weeks "
          f"= {sum(load.values()) / WEEKLY_HOURS / WEEKS_PER_MONTH:.1f} months")

    if write:
        wb["Plan"] = [header] + new_rows
        WORKBOOK.write_text(json.dumps(wb, ensure_ascii=False, indent=2))
        # curriculum.json carries its own copy of month, keyed by plan index. Left
        # unsynced it becomes the next stale number, so it moves with the workbook.
        cur = json.loads(CURRICULUM.read_text())
        for i, r in enumerate(new_rows):
            t = cur["topics"].get(str(i))
            if t:
                t["month"] = int(r[MONTH_COL])
        CURRICULUM.write_text(json.dumps(cur, ensure_ascii=False, indent=1))
        print("\nwritten to data/workbook.json and data/curriculum.json")
    else:
        print("\n(dry run — pass --write to apply)")


if __name__ == "__main__":
    main()
