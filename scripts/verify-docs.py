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
    src = (ROOT / "app" / "page.tsx").read_text()
    block = re.search(r"const TABS = \[(.*?)\]", src, re.S).group(1)
    return counted(r'"[^"]+"', block)


def anchors() -> dict:
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
        "rows": len(rows),
        "active_rows": len(active),
        "skipped_rows": len(rows) - len(active),
        "hours": int(sum(float(r[13] or 0) for r in active)),          # col 13, active rows only
        "months": len({int(float(r[1])) for r in active}),             # col 1
        # data/curriculum/NN.json is the SOURCE; data/curriculum.json is built from it
        "curriculum_files": len(list((ROOT / "data" / "curriculum").glob("*.json"))),
        "curriculum_topics": len(curriculum),
        "subtopics": sum(len(t["subtopics"]) for t in curriculum.values()),
        # market config and the study scheduler
        "boards": len(sources),
        "enabled_boards": sum(1 for b in sources if b.get("enabled") is not False),
        "skills": len(skill_map["skills"]),
        "gaps": len(skill_map["gaps"]),
        "prompts": len(bank["prompts"]),
        "ladder_rungs": counted(r"\d+", ladder),
        # code surfaces
        "mcp_tools": mcp_tools(),
        "tabs": tabs(),
        "api_routes": len(list((ROOT / "app" / "api").rglob("route.ts"))),
        "crons": len(vercel["crons"]),
        "market_modules": len(list((ROOT / "lib" / "market").glob("*.ts"))),  # tests are .mts, not matched
        "market_tests": len(list((ROOT / "lib" / "market").glob("*.test.mts"))),
    }


def main() -> None:
    values = anchors()
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

    print(f"checked {checked} anchors across {len(files)} files")
    for p in problems:
        print("  !", p)
    if problems:
        sys.exit(1)


if __name__ == "__main__":
    main()
