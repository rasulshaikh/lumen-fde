# Lumen Ask

Date: 2026-09-10T04:00:25.620Z

## Question

Explain Production Python architecture: domain models, repositories, DI, packaging with a practical example and a 20-minute exercise.

## Plan context

A. Linux, Networking, Shell | Shell mastery and scripting | Write a 200-line bash tool with set -euo pipefail, traps, getopts, logging and tests, without looking anything up | resources: The Linux Command Line (William Shotts), MIT The Missing Semester (lectures 1-5, 7), OverTheWire Bandit (levels 0-33)
A. Linux, Networking, Shell | Linux internals: processes, systemd, permissions, filesystems, packaging | Explain what happens from boot to a systemd service serving traffic; diagnose a stuck process from /proc | resources: Linux Journey (all of Grasshopper and Journeyman), freeCodeCamp.org: Linux Server Course - System Configuration and Operation, SadServers (scenarios, easy to medium)
A. Linux, Networking, Shell | Networking: TCP/IP, DNS, TLS, HTTP/2, load balancers, firewalls | Trace a request from DNS to TLS handshake to response and name every hop; debug a failed webhook with tcpdump | resources: High Performance Browser Networking (ch 1-4, 12-13), Hussein Nasser: Network Engineering, Protohackers (network programming challenges)
A. Linux, Networking, Shell | Performance and troubleshooting on a single box | Use the USE method; read top, vmstat, iostat, strace and perf output and say what is wrong | resources: Brendan Gregg: Linux Performance page and USE method, Brendan Gregg: Linux Performance Tools (talk), SadServers (hard scenarios)
A. Linux, Networking, Shell | Git at depth: rebase, bisect, reflog, hooks, monorepo hygiene | Recover a lost commit, bisect a regression, rewrite history safely | resources: Pro Git (ch 1-3, 7), Missing Semester: Version Control (git) lecture, Learn Git Branching (all levels)
B. Containers and Kubernetes | Docker internals: namespaces, cgroups, layers, networking | Explain a container without the word 'lightweight VM'; draw the layer cache; debug a bridge network issue | resources: Docker docs: Get started and Engine concepts, TechWorld with Nana: Docker Tutorial for Beginners [FULL COURSE in 3 Hours], Play with Docker
B. Containers and Kubernetes | Production images and supply chain: multi-stage, non-root, SBOM, scanning, signing | Ship an image under 200 MB, non-root, zero HIGH CVEs, with an SBOM | resources: Docker: Building best practices, Civo: Mastering Container and Image Security with Bret Fisher@BretFisher, Trivy (scan, SBOM) on your own images
B. Containers and Kubernetes | Kubernetes core: Pod, Deployment, Service, Ingress, ConfigMap, Secret, namespaces | Draw the object model from memory; explain how a request reaches a Pod through Ingress and Service | resources: Kubernetes docs: Concepts, TechWorld with Nana: Kubernetes Tutorial for Beginners [FULL COURSE in 4 Hours], Killercoda Kubernetes scenarios

## Answer

I'll teach this the way I would a smart friend learning it the first time, then give you one concrete example, then a 20-minute exercise you can run tonight.

## The one-sentence idea

You split the program into four layers and you let inner layers call outward only through named ports. The build itself enforces that rule, so a sloppy import fails CI instead of a code review.

A "port" is just a name for what the inner layer needs from the outside world, written as a Python Protocol. An "adapter" is the concrete thing that fulfils that port, such as a Postgres repository or the Anthropic SDK. The composition root is the one file that wires adapters to ports.

Think of it like a restaurant. The kitchen does not own a phone. It has a "take orders" port at the pass. The phone line and the QR-code tablet are two different adapters plugged into the same port. Swap the tablet for a phone and the kitchen does not notice.

## The four layers, in plain words

1. Domain. Pure Python. No database, no HTTP, no LLM SDK. A Task, a Step, an Invariant. This is the part a customer can read and agree with in five minutes.
2. Service layer. The use cases. "Compile this task", "retry this step". It orchestrates domain objects through ports. It does not know that Postgres exists.
3. Adapters. SQLAlchemy, httpx, the Anthropic client, the filesystem. They implement ports and nothing else.
4. Entrypoints. FastAPI routes, Temporal activities, the CLI. They translate "outside" into "inside": HTTP bodies into domain objects, domain errors into HTTP 404 or 409.

The dependency rule: domain imports nothing, service imports domain and port interfaces only, adapters implement ports, entrypoints wire everything. Imports point inward, never sideways or outward.

## Why FDEs pay for this

A customer engineer inherits your code six weeks after you leave. The real deliverable is a codebase a stranger can extend in a day without calling you. The same service ships against different databases, secret stores and model providers per customer. That is only cheap if persistence, config and LLM calls sit behind ports the composition root wires up. Take-home graders at Palantir, Anthropic and Databricks read your module layout and your pyproject.toml before they run anything.

## Practical example: a "compile task" use case

Imagine a compiler that takes a TaskSpec, runs it through three steps, and asks an LLM to summarise the result. Three layers, one concrete port each.

```python
# kaupex/domain/task.py
from dataclasses import dataclass, field

@dataclass(frozen=True, slots=True)
class Step:
    name: str
    prompt: str

@dataclass(frozen=True, slots=True)
class TaskSpec:
    task_id: str
    tenant_id: str
    steps: tuple[Step, ...]
    version_number: int

    def __post_init__(self):
        if not self.steps:
            raise ValueError("a task needs at least one step")
```

```python
# kaupex/service_layer/ports.py
from typing import Protocol
from kaupex.domain.task import TaskSpec

class LLMClient(Protocol):
    def summarise(self, prompt: str) -> str: ...

class TaskRepository(Protocol):
    def get(self, task_id: str) -> TaskSpec | None: ...
    def save(self, spec: TaskSpec) -> None: ...
```

```python
# kaupex/service_layer/compile_task.py
class Conflict(Exception): ...

def compile_task(spec: TaskSpec, repo: TaskRepository, llm: LLMClient) -> str:
    stored = repo.get(spec.task_id)
    if stored is not None and stored.version_number != spec.version_number:
        raise Conflict(f"stale version {spec.version_number}")
    summary = llm.summarise("\n".join(s.prompt for s in spec.steps))
    repo.save(spec)
    return summary
```

```python
# kaupex/adapters/anthropic_adapter.py
import anthropic

class AnthropicLLMClient:
    def __init__(self, client: anthropic.Anthropic):
        self._client = client
    def summarise(self, prompt: str) -> str:
        return self._client.messages.create(
            model="claude-sonnet-4-5",
            max_tokens=256,
            messages=[{"role": "user", "content": prompt}],
        ).content[0].text
```

```python
# kaupex/entrypoints/bootstrap.py  (the composition root)
def build_app(env: str) -> Callable[[TaskSpec, TaskRepository, LLMClient], str]:
    settings = load_settings(env)
    client = anthropic.Anthropic(api_key=settings.anthropic_key)
    llm = AnthropicLLMClient(client)
    repo = PostgresTaskRepository(settings.dsn) if env == "prod" \
           else SqliteTaskRepository(settings.demo_db_path)
    return lambda spec: compile_task(spec, repo, llm)
```

Three things to notice. The domain file has no `import anthropic` or `import sqlalchemy`. The service function takes a `TaskRepository` and an `LLMClient` as arguments, never reaches for them at module scope. The CLI or FastAPI route calls `build_app(env)` and hands the wired function to the request handler. Swap Postgres for SQLite and Anthropic for LiteLLM by changing only `bootstrap.py` and one new adapter file, and `pytest` runs unchanged because it uses `FakeTaskRepository` and `FakeLLMClient`.

## Production failure modes, kept short

These are the four most common ways the pattern breaks in real systems, taken from the plan's own list.

1. Pydantic models double as ORM models. A field rename for one customer forces a migration and a domain change at once.
2. A SQLAlchemy session held open across a 20-second LLM call fills Postgres with `idle in transaction` connections and surfaces as `DetachedInstanceError` days later.
3. `client = anthropic.Anthropic()` at module scope reads `ANTHROPIC_API_KEY` at import time. Tests cannot inject a fake, two tenants share one key, and preloaded gunicorn workers fight over one HTTP connection pool.
4. No lockfile, lower bounds only in requirements.txt. The customer rebuilds six weeks later, pulls a new pydantic minor, and the service fails at startup.

The architectural answer is the same in every case: keep the SDK behind a port, keep the session inside one transaction per use case, validate settings once at process start, and ship `uv.lock` in the repo.

## Connection to real systems and FDE interviews

In production this is what makes a multi-tenant AI rollout tractable. Anthropic direct here, Bedrock behind a gateway there. Postgres here, SQLite for the demo laptop there. Same domain, same service, different adapter, one diff per environment. The "second-engineer test" in the plan is the real proof: a peer who has never seen the repo adds a new compiler step in under a day using only CONTRIBUTING.md, and CI goes green. That is the artefact, not the architecture diagram.

In interviews this is where you earn the senior band. When an interviewer asks "how do you keep an FDE pilot from rotting after you leave", the answer is this layer split, the import-linter contract in CI, and the FakeRepository that makes the test suite two seconds. When they ask "walk me through restructuring a 4,000-line service", the answer is the commit order in row 28's interview question 1: ports first, then service layer over fakes, then adapters last, each commit shippable. When they hand you the `DetachedInstanceError` puzzle, the answer names the layer, the code shape, and the structural fix rather than `max_connections`.

## 20-minute exercise you can run tonight

You will build a four-layer skeleton for the compile-task example, write one fake, run the unit test in under two seconds, and prove the import rule fails the build on purpose.

1. Minute 0 to 2. Create a fresh folder called `kaupex/` with four subfolders: `domain/`, `service_layer/`, `adapters/`, `entrypoints/`. Make each an empty `__init__.py`.
2. Minute 2 to 7. Paste the four code blocks above into `domain/task.py`, `service_layer/ports.py`, `service_layer/compile_task.py`, `adapters/anthropic_adapter.py`. Adjust imports to match your paths.
3. Minute 7 to 10. Add `tests/test_compile_task.py` with a `FakeTaskRepository` (a dict in memory) and a `FakeLLMClient` that returns the literal string "ok". Write one test: build a `TaskSpec`, call `compile_task` with the fakes, assert the summary equals "ok".
4. Minute 10 to 12. Run `pytest -q --durations=0`. Confirm wall time under two seconds.
5. Minute 12 to 16. Install `import-linter` with `pip install import-linter`. Add a `pyproject.toml` section:

   ```toml
   [tool.importlinter:contract]
   type = "layers"
   layers = [
     "kaupex.entrypoints",
     "kaupex.adapters",
     "kaupex.service_layer",
     "kaupex.domain",
   ]
   ```

   Run `lint-imports`. Confirm it passes.
6. Minute 16 to 18. Open `kaupex/domain/task.py`, add `from sqlalchemy import select` at the top. Run `lint-imports`. Watch it fail. Delete the line. Run it again. Watch it pass.
7. Minute 18 to 20. Write a one-line `CONTRIBUTING.md` note: "Domain imports nothing from adapters or entrypoints. `make lint-imports` proves it." That is your future self's first reviewer.

If the import-linter step fails to install or behave, the plan's resource is `pip install import-linter` and the configuration syntax is in the part detail above. If your test runs slow, the bottleneck is almost always the fake touching a real network or filesystem, which is exactly what the layer split exists to prevent.

## Practical next step

Tonight, do the 20-minute exercise end to end and record the screen. Tomorrow, add a second adapter, `adapters/litellm_adapter.py`, that fulfils the same `LLMClient` protocol, and change `bootstrap.py` to pick one based on an env var. The diff should touch only `bootstrap.py` and one new file. That diff is the proof of work the plan asks for, and it is what you will show in a take-home.
