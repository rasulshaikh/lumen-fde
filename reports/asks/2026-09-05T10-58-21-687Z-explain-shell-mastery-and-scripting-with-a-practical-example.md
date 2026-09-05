# Lumen Ask

Date: 2026-09-05T10:58:21.688Z

## Question

Explain Shell mastery and scripting with a practical example and a 20-minute exercise.

## Plan context

A. Linux, Networking, Shell | Shell mastery and scripting | Write a 200-line bash tool with set -euo pipefail, traps, getopts, logging and tests, without looking anything up | resources: The Linux Command Line (William Shotts), MIT The Missing Semester (lectures 1-5, 7), OverTheWire Bandit (levels 0-33)
A. Linux, Networking, Shell | Linux internals: processes, systemd, permissions, filesystems, packaging | Explain what happens from boot to a systemd service serving traffic; diagnose a stuck process from /proc | resources: Linux Journey (all of Grasshopper and Journeyman), freeCodeCamp: Linux Server Course, System Configuration and Operation, SadServers (scenarios, easy to medium)
A. Linux, Networking, Shell | Networking: TCP/IP, DNS, TLS, HTTP/2, load balancers, firewalls | Trace a request from DNS to TLS handshake to response and name every hop; debug a failed webhook with tcpdump | resources: High Performance Browser Networking (ch 1-4, 12-13), Hussein Nasser: networking and backend fundamentals playlists, Protohackers (network programming challenges)
A. Linux, Networking, Shell | Performance and troubleshooting on a single box | Use the USE method; read top, vmstat, iostat, strace and perf output and say what is wrong | resources: Brendan Gregg: Linux Performance page and USE method, Brendan Gregg: Linux Performance Tools (talk), SadServers (hard scenarios)
A. Linux, Networking, Shell | Git at depth: rebase, bisect, reflog, hooks, monorepo hygiene | Recover a lost commit, bisect a regression, rewrite history safely | resources: Pro Git (ch 1-3, 7), Missing Semester: Version Control (git) lecture, Learn Git Branching (all levels)
B. Containers and Kubernetes | Docker internals: namespaces, cgroups, layers, networking | Explain a container without the word 'lightweight VM'; draw the layer cache; debug a bridge network issue | resources: Docker docs: Get started and Engine concepts, TechWorld with Nana: Docker Tutorial for Beginners (full course), Play with Docker
B. Containers and Kubernetes | Production images and supply chain: multi-stage, non-root, SBOM, scanning, signing | Ship an image under 200 MB, non-root, zero HIGH CVEs, with an SBOM | resources: Docker: Building best practices, Bret Fisher (Docker Captain) channel: image best practices, Trivy (scan, SBOM) on your own images
B. Containers and Kubernetes | Kubernetes core: Pod, Deployment, Service, Ingress, ConfigMap, Secret, namespaces | Draw the object model from memory; explain how a request reaches a Pod through Ingress and Service | resources: Kubernetes docs: Concepts, TechWorld with Nana: Kubernetes Tutorial for Beginners (full course), Killercoda Kubernetes scenarios

## Answer

Bash Tool Building
==================

First, what is bash? Bash is the default shell on most Linux servers. A shell takes your typed commands and runs them. Bash also speaks a small programming language, so you can put many commands inside a file and run that file like a tiny program. FDEs write these tiny programs to automate deploys, restart stuck jobs, and check logs at 2 a.m.

Second, the safety header `set -euo pipefail`. The `-e` part means exit right away if any command fails, so a broken step cannot silently break the next step. The `-u` part means error on any unset variable, so a typo like `$LOGDIRR` fails loud instead of using an empty string. The `-o pipefail` part means a pipeline like `cmd1 | cmd2` fails if either side fails, not just the last one. In production this stops a partial deploy from looking successful.

Third, traps. A trap is a rule that runs when the script gets a signal. The most useful trap is `trap 'cleanup' EXIT`, which runs your cleanup function no matter how the script ends, even on Ctrl+C. Example: when you download a tarball into `/tmp/build`, the trap deletes `/tmp/build` on exit, so disks do not fill up.

Fourth, `getopts`. This is bash's built in option parser. A line like `while getopts ":v:d:" opt; do` lets your tool accept `-v` and `-d` with arguments. It replaces writing a hand rolled parser, which is the number one source of bugs in shell tools.

Fifth, logging. A `log()` function that prints a timestamp, a level like INFO or ERROR, and your message to stderr is enough. Going to stderr matters because stdout is for real output, the data the tool produces. Mixing logs into data breaks pipelines.

Sixth, tests. The easiest test runner for shell is `bats`, which is plain bash with assertions like `assert_equal`. Each test file runs your tool with known inputs and checks known outputs.

Example: a deploy precheck tool. It takes `-d deploy.env -v`, reads the env file, checks that every required variable like `IMAGE_TAG` and `DB_URL` is set and non-empty, prints one JSON line per check to stdout, and logs progress to stderr. If any check fails, the script exits non zero and the CI pipeline stops the deploy. The EXIT trap prints a summary line, for example `5 checks, 1 failed`, so the on call engineer sees the bottom line first.

How this maps to FDE work. You will write many small bash tools at customer sites: backup scripts, health probes, log shippers, and deploy hooks. The habits above, fail fast, clean up on exit, parse options, separate logs from data, test the tool, are the same habits used in any language. Interviewers love asking "how do you make shell scripts safe in production," and this answer is the one they want.

Exercise, about 20 minutes.

Step 1, 2 minutes. Create a folder `precheck` and inside it create `precheck.sh` starting with `#!/usr/bin/env bash`, `set -euo pipefail`, and `set -o errtrace`.

Step 2, 5 minutes. Add a `cleanup()` function that prints `done` to stderr, and register it with `trap cleanup EXIT`.

Step 3, 8 minutes. Add `getopts` to accept `-d` for the env file and `-v` for verbose. Add a `require_var` function that reads the file with `source`, checks the variable is set with `${var:?}`, and prints `{"check":"$name","ok":true}` to stdout or `{"check":"$name","ok":false}` and returns 1.

Step 4, 3 minutes. Call `require_var` three times for `IMAGE_TAG`, `DB_URL`, `REGION`.

Step 5, 2 minutes. Make a tiny test file `test.bats` with one test that runs `./precheck.sh -d fixtures/good.env` and asserts exit code 0, plus one test on a bad env that asserts exit code 1. Run `bats test.bats`.

Done. You now have a small, safe, tested bash tool you can show in interviews.

Next step. Read Shotts chapters 20 to 24 on scripting, then rewrite the same precheck tool in Python and compare. The comparison is the fastest way to learn when shell is the right tool and when it is not.
