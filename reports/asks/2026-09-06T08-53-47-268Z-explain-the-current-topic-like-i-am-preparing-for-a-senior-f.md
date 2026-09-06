# Lumen Ask

Date: 2026-09-06T08:53:47.269Z

## Question

Explain the current topic like I am preparing for a senior FDE interview.

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

Bash tool mastery for a senior FDE interview.

Core idea: a senior FDE writes shell scripts that other engineers will run, debug, and trust in production. Bash is glue. Strong glue needs strict mode, traps, arguments, logs, and tests.

Strict mode. The line set -euo pipefail is a safety belt. -e exits on the first error, so a failed command does not silently keep going. -u treats unset variables as errors, so a typo like $RUNDIR becomes a loud failure instead of a silent empty string. -o pipefail makes a pipeline fail if any command in it fails, not just the last one. In an FDE interview, say this line out loud. It shows you have been burned by scripts that half-ran.

Traps. A trap is a rule you register that fires when the script exits. With trap 'cleanup; exit 1' ERR you run a cleanup function on any error. With trap 'cleanup' EXIT you run cleanup on normal exit too. Production scripts must remove temp files, kill background jobs, and unlock flock files. In a customer environment, a script that leaks /tmp directories across runs is a real outage cause.

Arguments with getopts. getopts parses short flags like -v or -f file. It is the standard way to handle required and optional inputs. Never read $1 blindly, because a missing argument becomes an empty string and the script keeps running. Interviewers like to see a usage() function that prints help and exits non-zero on bad input.

Logging. A real tool writes to a log file with timestamps and a level. A tiny helper like log() that prefixes [INFO] or [ERROR] and the date is enough. In production you redirect logs into journald or a file the customer can ship. An FDE who can read their own logs at 2am is an FDE who keeps their job.

Tests. Shell scripts can be tested with bats or with simple assert functions. The point is that a deploy script that breaks the staging database should fail in CI, not in production. Even five lines of test code change the culture.

Concrete technical example: a 200 line deploy script that takes -e env and -v version, locks a lockfile with flock, traps EXIT to release it, logs to deploy.log, and runs migrations only when -m is passed. This is the shape of real FDE work.

Production connection: customer deploys, model retraining jobs, log rotation, and on-call runbooks all run as bash. A senior FDE owns these scripts end to end.

Interview angle: when asked about scripting, immediately say set -euo pipefail, traps, getopts, logging, and tests. That answer alone signals seniority.

Practical next step: open a terminal and write a 50 line script that copies a directory, takes a -d flag for dry run, traps cleanup, logs to a file, and includes three bats tests. Ship it to a Git repo today.
