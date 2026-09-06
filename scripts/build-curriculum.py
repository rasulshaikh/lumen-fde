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
BANK = ROOT / "data" / "recall-bank.json"
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
        # month/track/hours are duplicated here for the UI; the plan is authoritative. A
        # renumber silently desynced 90 files once, so drift is now a hard error.
        for key, col, cast in (("track", 0, str), ("month", 1, float), ("hours", 13, float)):
            if key in d and cast(d[key]) != cast(plan_rows[i][col]):
                problems.append(f"{path.name}: {key} is {d[key]!r} but the plan says {plan_rows[i][col]!r}")
        topics[str(i)] = d

    OUT.write_text(json.dumps({"topics": topics}, ensure_ascii=False, indent=1))

    # The recall strip needs prompts on first paint, and curriculum.json is 3.7MB — far too
    # large to import into the client bundle. Emit a slim bank instead.
    #
    # Shape matters: the reveal text is stored ONCE PER TOPIC, not per prompt. Storing it
    # per prompt made a 2.6MB file for 1710 prompts — bigger than the problem it solved.
    #
    # Two corpora, deliberately. interviewQuestions are scenario-shaped and answerable aloud
    # in ~90s, which is what retrieval practice needs. outcomes[] are NOT usable as prompts:
    # 132 of the 947 are build-shaped ("write, closed-book in 45 minutes, a 200-line bash
    # CLI…"), i.e. multi-hour deliverables restated as capabilities. Asked as flashcards the
    # honest answer is "I'd have to try", which grades as nothing and teaches the learner to
    # lie to the scheduler. They serve as the self-grading REFERENCE on the reveal instead,
    # which is what they were actually written for.
    meta, prompts = {}, []
    for i, d in sorted(topics.items(), key=lambda kv: int(kv[0])):
        meta[i] = {"topic": d["topic"], "track": d.get("track", ""), "outcomes": d.get("outcomes", [])[:3]}
        for n, q in enumerate(d.get("interviewQuestions", [])):
            prompts.append({"i": int(i), "k": f"q{i}-{n}", "kind": "recall", "p": q})
        for n, f in enumerate(d.get("failureModes", [])):
            prompts.append({"i": int(i), "k": f"f{i}-{n}", "kind": "drill", "p": f})
    BANK.write_text(json.dumps({"meta": meta, "prompts": prompts}, ensure_ascii=False))
    kinds = {}
    for b in prompts:
        kinds[b["kind"]] = kinds.get(b["kind"], 0) + 1
    print(f"recall bank: {len(prompts)} prompts ({kinds}) · {BANK.stat().st_size/1024:.0f}KB -> {BANK.relative_to(ROOT)}")

    subs = sum(len(t["subtopics"]) for t in topics.values())
    urls = sum(1 for t in topics.values() for s in t["subtopics"] if s.get("resource", {}).get("url", "").startswith("http"))
    print(f"merged {len(topics)}/{len(plan_rows)} topics · {subs} subtopics · {urls} urls -> {OUT.relative_to(ROOT)}")
    for p in problems:
        print("  !", p)
    if problems and "--strict" in sys.argv:
        sys.exit(1)


if __name__ == "__main__":
    main()
