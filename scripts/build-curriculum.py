"""Merge data/curriculum/NN.json (one per plan topic) into data/curriculum.json.

The per-topic files are the editable source; the merged file is what the app and
the MCP read. Re-run after editing any topic file.
"""
import json
import pathlib
import sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
SRC = ROOT / "data" / "curriculum"
OUT = ROOT / "data" / "curriculum.json"
PLAN = ROOT / "data" / "workbook.json"

REQUIRED = ["i", "topic", "why", "prerequisites", "subtopics", "outcomes", "failureModes", "interviewQuestions", "proofOfWork"]


def main() -> None:
    plan_rows = json.loads(PLAN.read_text())["Plan"][1:]
    topics = {}
    problems = []
    for path in sorted(SRC.glob("*.json")):
        try:
            d = json.loads(path.read_text())
        except Exception as exc:  # noqa: BLE001
            problems.append(f"{path.name}: unreadable ({exc})")
            continue
        missing = [k for k in REQUIRED if k not in d]
        if missing:
            problems.append(f"{path.name}: missing {missing}")
            continue
        i = int(d["i"])
        if not (0 <= i < len(plan_rows)):
            problems.append(f"{path.name}: index {i} out of range")
            continue
        if str(plan_rows[i][2]).strip() != str(d["topic"]).strip():
            problems.append(f"{path.name}: topic mismatch — plan has {plan_rows[i][2]!r}, file has {d['topic']!r}")
        topics[str(i)] = d

    OUT.write_text(json.dumps({"topics": topics}, ensure_ascii=False, indent=1))
    subs = sum(len(t["subtopics"]) for t in topics.values())
    urls = sum(1 for t in topics.values() for s in t["subtopics"] if s.get("resource", {}).get("url", "").startswith("http"))
    print(f"merged {len(topics)}/{len(plan_rows)} topics · {subs} subtopics · {urls} urls -> {OUT.relative_to(ROOT)}")
    for p in problems:
        print("  !", p)
    if problems and "--strict" in sys.argv:
        sys.exit(1)


if __name__ == "__main__":
    main()
