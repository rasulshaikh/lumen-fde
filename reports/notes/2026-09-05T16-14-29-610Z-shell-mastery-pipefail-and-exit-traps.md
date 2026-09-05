# Shell mastery: pipefail and EXIT traps

Date: 2026-09-05T16:14:29.610Z

Core points from this week's shell work.

`set -euo pipefail` — `-e` exits on any failing command, `-u` rejects unset variables, and `-o pipefail` makes a pipeline return the first non-zero exit code instead of only the last command's. Without pipefail, `false | tee log` succeeds, which silently hides failures in the most common shape of shell code.

EXIT traps are the safe place for cleanup: `trap 'rm -f "$tmp"' EXIT` runs on normal exit, on error under `-e`, and on most signals, so temporary files, locks and partial state are released on every path rather than only the happy one.

Interview angle: a senior FDE is expected to talk about failure modes, cleanup, idempotency and evidence — not Bash syntax. Be ready to explain what breaks without pipefail and why the trap belongs on EXIT rather than after the last line.

Next: build safe-rotate.sh (keep last five, gzip older, refuse to run as root, getopts for -n/-d, timestamped logs) plus tests/test_rotate.sh.
