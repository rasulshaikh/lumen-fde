"""One-shot: add the three Scaler-gap topics to data/workbook.json.

Rows are inserted next to their sibling topics so the Plan tab stays readable,
and match the existing 16-column shape (Notes column is unused across all rows).
"""
import json
import pathlib

ROOT = pathlib.Path(__file__).resolve().parent.parent
WORKBOOK = ROOT / "data" / "workbook.json"

REALTIME = [
    "E. Backend and Data", 4.0,
    "Real-time transports: SSE, WebSockets, streaming at scale",
    "Choose SSE vs WebSocket from first principles; stream LLM tokens with resumable delivery, backpressure, and multi-worker fan-out",
    "High Performance Browser Networking, ch. 16 (SSE); ch. 15 XHR and ch. 17 WebSocket sit either side of it",
    "https://hpbn.co/server-sent-events-sse/", "Free",
    "Hussein Nasser: Server-Sent Events Crash Course (~30 min; SSE vs WebSocket vs long polling)",
    "https://www.youtube.com/watch?v=4HlNv1qpZFY", "Free",
    "Relay Claude's SSE stream to the browser over your own SSE endpoint with Last-Event-ID resume, then load test the WebSocket path with k6/websockets",
    "https://platform.claude.com/docs/en/build-with-claude/streaming", "Free",
    8.0,
    "DefenderMate streaming endpoint with resumable SSE, a backpressure note, and a k6 load-test report",
    "Not started",
]

FRONTEND = [
    "E. Backend and Data", 5.0,
    "React and Next.js for FDE demos and internal tools",
    "Ship a typed App Router UI over your own API: server components, forms with validation, auth, and streamed responses",
    "react.dev Learn (React 19 fundamentals: components, state, hooks)",
    "https://react.dev/learn", "Free",
    "Jack Herrington (React 19, TanStack, AI interfaces)",
    "https://www.youtube.com/@jherr", "Free",
    "Build the Next.js App Router dashboard app end to end, then rebuild the Lumen plan view against your own API",
    "https://nextjs.org/learn/dashboard-app", "Free",
    8.0,
    "A Next.js front end over DefenderMate with streamed output and auth",
    "Not started",
]

EXPERIMENT_TRACKING = [
    "H. AI in Production", 7.0,
    "Experiment tracking and prompt versioning as CI",
    "Longitudinal run history for prompts and models: registry-backed versions, labelled rollouts, CI gates on regression, one-step rollback",
    "MLflow 3 GenAI prompt registry and the Langfuse prompt CI/CD guide",
    "https://langfuse.com/resources/engineering/prompt-cicd", "Free",
    "Databricks: Data + AI Summit 2025 playlist (see \"MLflow 3.0: AI and MLOps on Databricks\")",
    "https://www.youtube.com/playlist?list=PL0xpxeJYJBvlBe_Fbvqs9YsHrnXZd5fYC", "Free",
    "Wire langfuse/experiment-action into a repo so an eval regression fails the pull request",
    "https://github.com/langfuse/experiment-action", "Free",
    6.0,
    "A prompt registry with versioned rollout, a CI gate that fails on eval regression, and a demonstrated rollback",
    "Not started",
]

# (new row, topic of the row it should follow)
INSERTIONS = [
    (REALTIME, "Redis: caching, rate limiting, idempotency, streams"),
    (FRONTEND, "Warehouse layer: dbt, DuckDB, dimensional modelling"),
    (EXPERIMENT_TRACKING, "Drift, feedback loops, registries, rollout"),
]


def main() -> None:
    workbook = json.loads(WORKBOOK.read_text())
    plan = workbook["Plan"]
    header, rows = plan[0], plan[1:]
    width = len(rows[0])

    for row, after_topic in INSERTIONS:
        if len(row) != width:
            raise SystemExit(f"row {row[2]!r} has {len(row)} cols, expected {width}")
        if any(str(existing[2]) == row[2] for existing in rows):
            print(f"skip (already present): {row[2]}")
            continue
        index = next(i for i, existing in enumerate(rows) if str(existing[2]) == after_topic)
        rows.insert(index + 1, row)
        print(f"inserted after {after_topic!r}: {row[2]}")

    workbook["Plan"] = [header] + rows
    WORKBOOK.write_text(json.dumps(workbook, ensure_ascii=False, indent=2))
    print(f"\ntopics: {len(rows)}   hours: {sum(float(r[13] or 0) for r in rows):.0f}")


if __name__ == "__main__":
    main()
