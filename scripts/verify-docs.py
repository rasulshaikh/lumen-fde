"""Check the numbers in docs/platform/*.md against the code and data they describe.

Docs opt in per claim with a trailing HTML comment naming an anchor:

    The plan is 119 rows, 117 of them active. <!-- verify:rows=119 --> <!-- verify:active_rows=117 -->

Syntax: `<!-- verify:<anchor>=<value> -->`, any number of them per line, value may carry
thousands commas (1,588). Only anchors are checked; free prose is never scanned. That is
deliberate — a regex over prose matches years, percentages and version numbers, and a checker
that reports three false alarms gets muted in a week. An unknown anchor name is a hard error,
so a typo cannot pass by matching nothing.

Anchors cover structure that lives in the repo (rows, hours, tools, tabs, boards). Live scan
output in reports/market/ is deliberately NOT anchorable: the 03:00 UTC market-scan rewrites
those numbers, so anchoring them would fail most mornings for no defect. Docs cite those with
the report file and the scan date instead.

    python3 scripts/verify-docs.py            # check docs/platform/*.md
    python3 scripts/verify-docs.py --list     # print every anchor and its current value
    python3 scripts/verify-docs.py FILE...    # check specific files
"""
import json
import pathlib
import re
import sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
DOCS = ROOT / "docs" / "platform"

ANCHOR = re.compile(r"<!--\s*verify:([a-z_]+)\s*=\s*([^\s>]+?)\s*-->")


def plan_rows() -> list:
    return json.loads((ROOT / "data" / "workbook.json").read_text())["Plan"][1:]


def counted(pattern: str, text: str) -> int:
    return len(re.findall(pattern, text))


def mcp_tools() -> int:
    # The tool table is one object per line inside `const tools = [ ... ];`. Counting `name:`
    # over the whole file would also catch the dispatcher's string compares below it.
    src = (ROOT / "mcp" / "server.js").read_text()
    block = src.split("const tools = [", 1)[1].split("\n];", 1)[0]
    return counted(r'\bname:\s*"', block)


def tabs() -> int:
    """The nav entries, from components/Nav.tsx.

    This read app/page.tsx and its `TABS` constant until the routing migration deleted that
    file. The failure was not a wrong number: `anchors()` builds every value eagerly, so an
    uncaught FileNotFoundError here meant all 52 anchors across four documents went unchecked
    while the script reported nothing at all. `resilient()` below is the structural fix; this
    is the correct source.
    """
    src = (ROOT / "components" / "Nav.tsx").read_text()
    block = re.search(r"export const NAV = \[(.*?)\];", src, re.S).group(1)
    return counted(r"label:", block)


def anchor_builders() -> dict:
    rows = plan_rows()
    active = [r for r in rows if str(r[15]).strip().lower() != "skipped"]
    curriculum = json.loads((ROOT / "data" / "curriculum.json").read_text())["topics"]
    sources = json.loads((ROOT / "data" / "market-sources.json").read_text())["boards"]
    skill_map = json.loads((ROOT / "data" / "market-skill-map.json").read_text())
    bank = json.loads((ROOT / "data" / "recall-bank.json").read_text())
    vercel = json.loads((ROOT / "vercel.json").read_text())
    ladder = re.search(r"export const LADDER = \[(.*?)\]", (ROOT / "lib" / "review.ts").read_text()).group(1)
    return {
        # data/workbook.json Plan — col 15 is Status, "Skipped" means inactive
        "rows": lambda: len(rows),
        "active_rows": lambda: len(active),
        "skipped_rows": lambda: len(rows) - len(active),
        "hours": lambda: int(sum(float(r[13] or 0) for r in active)),  # col 13, active rows only
        "months": lambda: len({int(float(r[1])) for r in active}),     # col 1
        # data/curriculum/NN.json is the SOURCE; data/curriculum.json is built from it
        "curriculum_files": lambda: len(list((ROOT / "data" / "curriculum").glob("*.json"))),
        "curriculum_topics": lambda: len(curriculum),
        "subtopics": lambda: sum(len(t["subtopics"]) for t in curriculum.values()),
        # market config and the study scheduler
        "boards": lambda: len(sources),
        "enabled_boards": lambda: sum(1 for b in sources if b.get("enabled") is not False),
        "skills": lambda: len(skill_map["skills"]),
        "gaps": lambda: len(skill_map["gaps"]),
        "prompts": lambda: len(bank["prompts"]),
        "ladder_rungs": lambda: counted(r"\d+", ladder),
        # code surfaces
        "mcp_tools": lambda: mcp_tools(),
        "tabs": lambda: tabs(),
        "api_routes": lambda: len(list((ROOT / "app" / "api").rglob("route.ts"))),
        "crons": lambda: len(vercel["crons"]),
        "market_modules": lambda: len(list((ROOT / "lib" / "market").glob("*.ts"))),  # tests are .mts
        "market_tests": lambda: len(list((ROOT / "lib" / "market").glob("*.test.mts"))),
    }


def resilient(builders: dict) -> tuple[dict, list[str]]:
    """Evaluate each extractor independently.

    anchors() used to build every value in one dict literal, so the first extractor to raise
    aborted the whole run before a single document was read — a stale file path silently
    disabled documentation verification entirely, which is the opposite of what a checker is
    for. Now a broken extractor costs its own anchor, is named in the output, and fails the
    run, while every other anchor is still checked.
    """
    values, broken = {}, []
    for name, build in builders.items():
        try:
            values[name] = build()
        except Exception as error:  # noqa: BLE001 - the point is that any failure is contained
            broken.append(f"{name}: {type(error).__name__}: {error}")
    return values, broken


def main() -> None:
    values, broken = resilient(anchor_builders())
    for failure in broken:
        print(f"  ! anchor extractor failed - {failure}")
    if "--list" in sys.argv:
        for name, value in values.items():
            print(f"  {name:<18} {value}")
        return

    args = [a for a in sys.argv[1:] if not a.startswith("-")]
    files = [pathlib.Path(a).resolve() for a in args] if args else sorted(DOCS.glob("*.md"))
    if not files:
        print(f"no markdown found in {DOCS.relative_to(ROOT)} — nothing to verify")
        return

    checked, problems = 0, []
    for path in files:
        rel = path.relative_to(ROOT) if path.is_relative_to(ROOT) else path
        for lineno, line in enumerate(path.read_text().splitlines(), 1):
            for name, claimed in ANCHOR.findall(line):
                if name not in values:
                    problems.append(f"{rel}:{lineno}: unknown anchor {name!r} — known: {', '.join(sorted(values))}")
                    continue
                checked += 1
                if claimed.replace(",", "") != str(values[name]):
                    problems.append(f"{rel}:{lineno}: {name} claims {claimed}, source says {values[name]}")

            # The anchor is invisible; the number beside it is what a person reads. Those two
            # drifted apart in architecture.md — `| API routes | 10 <!-- verify:api_routes=11 -->`
            # passed this script for as long as it existed, because the anchor was right and the
            # anchor was the only thing being read. Compare the rendered number too.
            #
            # Only when a digit is directly adjacent to the anchor. A trailing anchor on a prose
            # sentence ("...117 of them active. <!-- verify:rows=119 -->") has no number of its
            # own and must not be judged against whichever one happened to come last.
            for match in ANCHOR.finditer(line):
                name, claimed = match.group(1), match.group(2)
                prefix = ANCHOR.sub("", line[: match.start()])
                shown = re.search(r"(\d[\d,]*)\s*$", prefix)
                if shown and shown.group(1).replace(",", "") != claimed.replace(",", ""):
                    problems.append(
                        f"{rel}:{lineno}: {name} renders as {shown.group(1)} but its anchor says {claimed}"
                    )

    print(f"checked {checked} anchors across {len(files)} files")
    for p in problems:
        print("  !", p)
    if problems:
        sys.exit(1)


if __name__ == "__main__":
    main()
