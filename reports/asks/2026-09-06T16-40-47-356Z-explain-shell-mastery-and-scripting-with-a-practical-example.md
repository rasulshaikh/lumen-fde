# Lumen Ask

Date: 2026-09-06T16:40:47.356Z

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

What "Shell mastery and scripting" actually means for an FDE

You write small programs that run on a customer's machine, not your laptop. The program is bash, the dependencies are whatever coreutils already ships with, and the operator is a tired SRE who will Ctrl-C your script if it looks stuck. Every behavior in the syllabus, the strict mode, the traps, the quoting, the exit codes, exists because something went wrong in the field without it. The interview question is usually one of three flavors. Rewrite a script that silently swallowed failures and ask what you would change. Diagnose a cron job that runs but produces no output. Or hand you a hostile input, filenames with spaces, a dash, a newline, and watch how your script handles it.

---

The practical example, end to end

The script: a data-load runner for a customer migration. It reads a manifest of CSV files from S3, downloads each one to a temp dir, validates the header row, loads it into the warehouse through their REST API with a bearer token, writes a summary line to a log file, and exits with sysexits codes so cron can branch on the result.

The shape, around 200 lines, looks like this in your head before you write a line of it:

1. Shebang and strict mode. `#!/usr/bin/env bash`, `set -Eeuo pipefail`, `IFS=$'\n\t'`. The `IFS` change protects against word splitting on spaces in filenames. `-E` lets ERR traps fire inside functions, which you need because most real work lives in functions.
2. Constants near the top. `readonly PROG=$(basename "$0")`, `readonly VERSION=1.2.0`, `readonly LOCK_FD`. Constants are easier to audit than variables, and `readonly` catches typos.
3. Usage, version, help. `usage()` writes a one-line synopsis, every flag, its default, every env var the script honors, and the exit codes. `-h` exits 0. `-V` prints the version. `-x` enables `set -x` for debugging without editing the script.
4. Argument parsing with getopts. The optstring `':hVxo:n:t:'` means h, V, x, o, n, t, silent on errors, no required flags in the string itself. Required checks happen after the loop. Secrets come from `--token-file` or `TOKEN_FILE` env var, never argv.
5. Logging. A `log()` function that prepends ISO timestamp, PID, and level, and writes INFO to stdout, WARN and ERROR to stderr. Two streams so a wrapper can capture errors without grepping. A `LOG_FILE` env var redirects to a file when set.
6. Cleanup trap, registered early. `trap 'cleanup EXIT $?'` runs even on SIGTERM. `cleanup` removes the temp dir, releases the lock fd, logs the final status, and preserves `$?` because the next command clobbers it.
7. Signal traps. `trap 'die SIGINT 130' INT`, `trap 'die SIGTERM 143' TERM`. Each calls the central error path which exits with the conventional code so the caller sees a meaningful status.
8. The work loop. `mapfile -t files < <(jq -r '.[]' "$MANIFEST")`. Then `for f in "${files[@]}"; do load_one "$f" || die "load $f failed" 70; done`. The `|| die` is the explicit error handling that strict mode cannot give you, because `-e` is suppressed on the right of `||` in some contexts and you want a custom message anyway.
9. Inside `load_one`: `mktemp -d` for a per-file scratch dir, `curl -fsS --retry 3 --token "$TOKEN"` for the upload, header check with `[[ "${header,,}" == "id,email,created_at" ]] || die 65`, then an atomic `mv` of the `.processed` marker.
10. Tests. A `tests/` directory with `bats` scripts that run the tool against a fixture manifest, a fake `curl` shim that returns canned responses, and a hostile tree of filenames including `-rf`, `a b`, `new\nline`, and ``. The test asserts the right exit code on each scenario.

The interview answer format: draw this shape on the whiteboard in 60 seconds, name each block, point at the part that protects against the silent-failure bug, and you have shown mastery without showing off.

---

Why each rule earns its place

`set -euo pipefail` is the floor, not the ceiling. It catches the obvious cases but lets you down in conditions, pipelines, and functions called from conditions, which is where your real code lives. The `|| die` pattern is the actual safety net.

Quoting is the difference between a script that works on three files and one that corrupts the customer's data when a filename has a space. The rule "every expansion is double-quoted unless you can name the reason" is the only one you need to memorize.

Traps are what you write on day one and forget, and the customer notices on day ninety when SIGTERM leaves a half-written file behind. The EXIT trap runs even when signals kill you, which is the whole point.

Parameter expansion beats forking sed for two reasons. One, every `$(basename "$f")` is a fork+exec, and on a 100k-file manifest on a jump host that turns a 2-second job into a 20-minute job. Two, parameter expansion makes the intent visible without leaving the shell.

Sysexits codes turn your script into a citizen. Cron, systemd timers, CI, and the customer's wrapper scripts all branch on exit codes. `exit 0` and `exit 1` is the difference between a tool and a toy.

---

Production and FDE interview lens

In production this pattern is the backbone of every customer integration: data sync, log shippers, one-shot migration runners, deploy hooks, cron-triggered cleanup jobs. The same script lands on three different customer environments with three different OS versions and three different sets of installed tools. Bash is the lowest common denominator that always works.

In the interview the question usually arrives as a debugging scenario. A nightly cron produces no output and you do not know if it ran. Walk through the chain. Did cron even start it, check `/var/log/cron` or `journalctl -u cron`. Did the script die on `set -u` because an env var was missing, check the exit code with `echo $?` returns 1 or 2 in bash for unbound variable. Did `set -o pipefail` reveal a failing intermediate stage that the old script swallowed. Did the `curl` call hang because the bearer token was empty and the API returned 401 in the body but exit 0 on the wrapper because `|| true` was upstream. Each step is a thing you named in the syllabus.

The candidate who can list `set -Eeuo pipefail`, EXIT trap, getopts with silent optstring, `[[ ]]` over `[ ]`, parameter expansion over `basename`, mapfile over `cat | while`, and sysexits codes, and then draw how they fit together in one diagram, is the candidate who can write the next customer tool without supervision.

---

The 20-minute exercise

Goal: harden a fragile loader script that the candidate already has on their laptop, or write a small one from scratch. Pick whichever you have not done recently.

The task.

Write `bin/load.sh`, a 60 to 120 line bash
