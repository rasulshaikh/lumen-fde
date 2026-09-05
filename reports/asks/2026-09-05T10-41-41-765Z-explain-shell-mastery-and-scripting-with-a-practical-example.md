# Lumen Ask

Date: 2026-09-05T10:41:41.765Z

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

Plan: Shell mastery and scripting
Goal: write safe bash tools
Time: 20 minutes
Done when: a tested script runs cleanly

Idea in plain words
Bash is the shell, the program that takes text commands and runs them on Linux. A bash script is a small text file of those commands. Shell mastery means writing scripts that are safe, easy to read, and easy to debug.

The four safety habits to teach first
1. set -euo pipefail. This is a single line at the top of every script. e means exit on error. u means error on undefined variable. o pipefail means a pipeline fails if any step fails. Together they stop small mistakes from becoming silent disasters.
2. traps. A trap is a rule that says if the script is interrupted, run this cleanup first. It stops half-finished temp files from leaking.
3. getopts. A small built-in parser for flags like -v or -f file. It replaces hand-rolled argument parsing.
4. logging. Print what the script is doing with timestamps and levels. Without logs you cannot answer "what happened last night at 3 a.m."

Jargon, defined on first use
- shebang: the first line #!/usr/bin/env bash that tells the OS which interpreter to use.
- exit code: a number 0 to 255 returned by every command. 0 means success, anything else means failure.
- stdin, stdout, stderr: the three default data streams, in, normal out, error out.
- here-doc: a <<EOF block that feeds multiple lines into a command as input.

Concrete technical example
A 30-line script that backs up a directory to a timestamped tarball, with safety habits baked in.

#!/usr/bin/env bash
set -euo pipefail

LOG_DIR="${HOME}/.local/share/backup-logs"
mkdir -p "$LOG_DIR"
LOG_FILE="$LOG_DIR/backup.log"

ts() { date -u +"%Y-%m-%dT%H:%M:%SZ"; }
log() { printf '[%s] %s\n' "$(ts)" "$" | tee -a "$LOG_FILE" >&2; }

cleanup() { rm -f "${TMP_TAR:-}"; }
trap cleanup EXIT INT TERM

usage() {
  cat <<EOF
Usage: $0 -s SOURCE -d DEST [-n NAME]
  -s SOURCE   directory to back up
  -d DEST     destination directory
  -n NAME     backup name (default: hostname)
EOF
  exit 1
}

SOURCE=""; DEST=""; NAME="$(hostname)"
while getopts ":s:d:n:h" opt; do
  case "$opt" in
    s) SOURCE="$OPTARG" ;;
    d) DEST="$OPTARG" ;;
    n) NAME="$OPTARG" ;;
    h|) usage ;;
  esac
done
[[ -z "$SOURCE" || -z "$DEST" ]] && usage

TMP_TAR="$(mktemp -t backup.XXXXXX.tar.gz)"
log "starting backup of $SOURCE"
tar -czf "$TMP_TAR" -C "$(dirname "$SOURCE")" "$(basename "$SOURCE")"
mv "$TMP_TAR" "$DEST/${NAME}-$(date -u +%Y%m%dT%H%M%SZ).tar.gz"
log "backup written to $DEST"

Run it: ./backup.sh -s /etc/nginx -d /var/backups

Each habit is doing real work. set -e stops the tar line if the source is missing. The trap deletes the temp tarball even on Ctrl-C. getopts rejects unknown flags. The log file captures a paper trail.

How this connects to production systems
Every serious ops tool at scale looks like this. Health-check scripts, log rotators, deploy hooks, cron jobs. The shell is the glue between containers, systemd, and CI. The same habits show up in entrypoint scripts inside Docker images. In FDE interviews, interviewers often hand you a broken script and ask what is wrong. Knowing set -euo pipefail and trap lets you spot the missing safety nets in seconds. FDEs also write small bash wrappers that orchestrate kubectl, ssh, and curl during incident response.

The 20-minute exercise
Goal: extend the backup script with a dry-run mode and a tiny test, end to end.

1. Minute 0 to 2. Copy the script into ~/bin/backup.sh and chmod +x it. Run it once with a real source and confirm a tarball appears.
2. Minute 2 to 5. Add a -x flag with getopts that sets DRY_RUN=1. When DRY_RUN=1, the script logs every action but does not run tar or mv.
3. Minute 5 to 8. Write a tiny test file at tests/test_backup.sh. Use bash -e to source the script with a stubbed tar that just echoes. Assert the log line "starting backup" appears.
4. Minute 8 to 11. Run the dry-run against /etc. Confirm the tarball is not created, only the log line is written.
5. Minute 11 to 14. Intentionally break it. Remove the source directory and run without -x. Watch set -e exit cleanly with a nonzero code.
6. Minute 14 to 17. Add a trap that prints "interrupted, cleaned up" if you hit Ctrl-C mid-run. Test by sending SIGINT with kill -INT $$.
7. Minute 17 to 20. Run shellcheck if available. Fix any warnings it reports. Commit the script with a clear message.

What you have proven
You can write a script that is safe under failure, observable through logs, testable in isolation, and debuggable. That is the working definition of shell mastery for an FDE.

One practical next step
Open your last project's deploy script and audit it against these four habits. Add what is missing and rerun it. That single edit usually prevents the next incident.

Helpful resources to keep open
- The Linux Command Line by William Shotts, chapters 4 to 17 and 28 to 30.
- MIT The Missing Semester, lectures 1 to 5 and lecture 7 on debugging.
- OverTheWire Bandit, levels 0 to 33 for hands-on shell fluency.
