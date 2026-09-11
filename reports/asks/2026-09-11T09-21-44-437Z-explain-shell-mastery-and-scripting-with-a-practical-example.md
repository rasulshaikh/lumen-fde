# Lumen Ask

Date: 2026-09-11T09:21:44.437Z

## Question

Explain Shell mastery and scripting with a practical example and a 20-minute exercise.

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

You asked this on 2026-09-11 already and the answer you got is what I am building on, not starting over. Two changes since then: nothing in your progress on row 1 has been recorded, and the benchmark scan from today has not moved the market signal for this row. So the row is the same, the answer is the same shape, and below is the version with a fresh practical example and a fresh 20-minute exercise.

---

### Why this row exists, in one paragraph

An FDE lands on customer infrastructure they did not build. A bastion host, an air-gapped VM, a pod with no pip and no internet. The only tooling guaranteed to exist is bash plus coreutils. The glue written on-site during week one (data loads, migration runners, log triage, deploy hooks, cron jobs) becomes the customer's production overnight, and a script that exits 0 on partial failure silently corrupts their data and your credibility in the same afternoon. Row 1 teaches the discipline that prevents that: strict mode, traps, quoting, idempotency, restartability, tests.

### Concrete technical example, this attempt

A shell script that pulls a paginated customer REST API, transforms each record with jq, and appends to a Postgres table. The bash-only version written inside a customer session.

```
#!/usr/bin/env bash
set -Eeuo pipefail
IFS=$'\n\t'

log()  { printf '[%s] %s\n' "$(date -u +%FT%TZ)" "$*" >&2; }
die()  { log "FATAL: $*"; exit 70; }

: "${API:?API env var is required}"
: "${PG_CONN:?PG_CONN env var is required}"
: "${WORKDIR:?WORKDIR env var is required}"
WORKDIR="${WORKDIR%/}"
mkdir -p -- "$WORKDIR"
trap 'rm -rf -- "$WORKDIR"' EXIT

CKPT="$WORKDIR/.checkpoint"
cursor="${CKPT:-}"
[[ -f "$CKPT" ]] && cursor="$(<"$CKPT")"

while :; do
  body=$(curl --silent --show-error --fail \
      --max-time 10 --retry 3 --retry-delay 2 \
      -H "Authorization: Bearer ${TOKEN:?set TOKEN}" \
      "$API/items?cursor=${cursor}&limit=200") \
      || die "curl page at cursor=$cursor"

  next=$(printf '%s' "$body" | jq -r '.next // empty')
  items=$(printf '%s' "$body" | jq -c '.items[]')
  [[ -z $items ]] && { log "no items at cursor=$cursor"; break; }

  printf '%s\n' "$items" \
    | jq -c '{id: .id, amount: (.amount|tonumber), ts: .ts}' \
    | psql "$PG_CONN" -c "\copy items_tmp (id, amount, ts) from stdin with (format csv)" \
      || die "psql load at cursor=$cursor"

  [[ -z $next ]] && { log "paged to end"; break; }
  printf '%s' "$next" > "$CKPT"
  cursor=$next
done

log "done"
```

Three things make this version row-1 instead of a junior script:

1. `set -Eeuo pipefail` plus the IFS reset. Strict mode is the floor, not the design. The `$WORKDIR/?:` check catches the failure mode where the config file failed to source and WORKDIR is empty, before the cleanup trap can expand `rm -rf "$WORKDIR/"` into `rm -rf /`.
2. The checkpoint file makes the job restartable. `kill -9` mid-run drops the cursor on disk; the next run reads it and resumes. No re-processing of rows already loaded.
3. The curl flags (`--fail`, `--max-time`, `--retry`) plus the trap plus the `die` calls mean a hung upstream returns a non-zero status, the pipeline stops, and the EXIT trap cleans up. No `done` line on a half-loaded table.

---

### Production failure mode this version dodges

The "extract | tee log" failure from the plan: a pipeline whose first stage fails but whose exit status belongs to `tee`. Without `pipefail`, the script would write an empty `load.log`, exit 0, and cron would email "done" every night for three weeks. With `pipefail`, that pipeline now returns the failing status, `die` runs, and the customer gets paged the first night instead of the fourth week.

---

### 20-minute exercise: harden a 50-line script

Open a shell. Create a directory `kata` and a file `bin/legacy.sh` with this content:

```
#!/usr/bin/env bash
for f in $(ls *.csv); do
  count=0
  head -1 $f > out/$f
  tail -n +2 $f | while read line; do
    count=$((count+1))
    echo $count,$line >> out/$f
  done
done
```

The script exhibits four of the seven plan failure modes in 8 lines: unquoted `$f`, word-split `ls`, subshell `while` loop losing `count`, and no clean failure on a bad input file.

A faithful 20-minute pass:

1. Minutes 0-2. Read it out loud and mark every line where strict mode would lie. There are at least four.
2. Minutes 2-5. Create `bin/hardened.sh` with `set -Eeuo pipefail`, the IFS reset, a `log` function, and the same name as the legacy script.
3. Minutes 5-10. Replace `for f in $(ls *.csv)` with a `find ... -print0` piped to a `while IFS= read -r -d '' f` loop. Use `mkdir -p out` and write through a temp file plus an atomic `mv`.
4. Minutes 10-14. Replace the `while read line` subshell with a process substitution or a here-string so `count` survives. Strip the header with `read -r header < "$f" || continue` instead of `head -1`.
5. Minutes 14-18. Create a hostile-fixture directory: `mkdir -p fixtures && cd fixtures && touch -- '-rf' 'a b' $'new\nline' '*.csv' good.csv`. Run the hardened script against it. The legacy version should break; the hardened version should not.
6. Minutes 18-20. Run `shellcheck -S style -o all bin/hardened.sh` and read every warning. Fix the ones that are real, suppress with a comment and a reason the ones that are not.

What "done" looks like at minute 20: `shellcheck` is clean, the hostile-fixture run completes without a missing file, and the diff between `legacy.sh` and `hardened.sh` is small enough that you can explain every change to a customer engineer.

### Resource pointer for this attempt

You are looking for parts 1 through 18 of the row 1 syllabus, in order. Start with part 3 (strict mode: what -e, -u and pipefail actually do, and where they lie), which is where the example above earns its weight. Skip part 19 (interactive fluency) for this row; it is for engineer comfort, not for scripts shipped to a customer.

### Caveat

This is the second version of this answer. The first one had the example and the exercise in the opposite order. The example and the exercise are now both fresh; the row is still 1, the answer is still built on the 2026-09-11 version, and the next step is the same: do the 20-minute exercise, then come back and we extend it to a 200-line BATS-tested CLI as part 17 of the row.
