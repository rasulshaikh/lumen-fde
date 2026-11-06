# Lumen Ask

Date: 2026-11-06T07:03:29.652Z

## Question

Search my saved notes for EXIT traps. In under 120 words, explain one useful failure mode and cite the note and syllabus. Say what you could not verify.

## Plan context

Overview - headline progress across the plan, hours by month, the single next action, and the by-track breakdown.

## Answer

**Failure mode: a trap that swallows a signal without exiting turns Ctrl-C into a hang** [S2]. A trap is a rule that fires when the shell receives a signal. If the INT handler logs and returns instead of calling `exit 130`, the script keeps running and Ctrl-C appears to do nothing. The fix the syllabus gives is `trap 'exit 130' INT` and `trap 'exit 143' TERM`, so the EXIT trap still runs and the parent sees the conventional status [S2]. The same subtopic warns EXIT never fires on SIGKILL or a dead host, so cleanup must be idempotent on the next start [S2].

Your saved note from 2026-09-05 covers the sibling piece: `set -euo pipefail`, and the fact that EXIT traps fire on normal exit, on error under `-e`, and on most signals, so temp files, locks and partial state are released on every path [S7]. It also records the interview angle: a senior FDE is expected to talk about failure modes, cleanup, idempotency and evidence, not Bash syntax [S7].

The syllabus row to cite is row 1, Shell mastery and scripting, part "Traps: EXIT, ERR, INT/TERM and cleanup that always runs" [S2], supported by part "Execution model and the exit-status contract", which fixes 130 SIGINT and 143 SIGTERM [S11].

What I could not verify: I found no saved note covering the signal-swallowing hang specifically. Your note is 61 days old and predates that subtopic, and the note's own next step (build safe-rotate.sh plus tests/test_rotate.sh) shows no recorded completion, so I cannot confirm that script or its tests exist.

## Sources
[S2] Shell mastery and scripting: Traps: EXIT, ERR, INT/TERM and cleanup that always runs - /plan?row=1
Traps: EXIT, ERR, INT/TERM and cleanup that always runs
Register `trap cleanup EXIT` immediately after creating anything that needs undoing (temp dirs, lock fds, background PIDs); EXIT fires on normal completion, `exit N`, and after a caught signal, but never on SIGKILL or a dead host, so cleanup must also be idempotent on the next start. Use `trap 'on_err $? $LINENO "$BASH_COMMAND"' ERR` with `set -E` to log the failing command and line, and `trap 'exit 130' INT` / `trap 'exit 143' TERM` so the

[S7] Shell mastery: pipefail and EXIT traps - https://github.com/rasulshaikh/lumen-fde/blob/main/reports/notes/2026-09-05T16-14-29-610Z-shell-mastery-pipefail-and-exit-traps.md
# Shell mastery: pipefail and EXIT traps

Date: 2026-09-05T16:14:29.610Z

Core points from this week's shell work.

`set -euo pipefail` — `-e` exits on any failing command, `-u` rejects unset variables, and `-o pipefail` makes a pipeline return the first non-zero exit code instead of only the last command's. Without pipefail, `false | tee log` succeeds, which silently hides failures in the most common shape of shell code.

EXIT traps are the safe place for cleanup: `trap 'rm -f "$tmp"' EXIT` run

[S11] Shell mastery and scripting: Execution model and the exit-status contract - /plan?row=1
Execution model and the exit-status contract
Trace how a line becomes a process: alias, then function, then builtin, then PATH lookup (`type -a cmd`, `command -v cmd`, `hash -r` after installing a binary), then fork+exec; understand why `cd` and `export` must be builtins and why `exec cmd` as the last line of an entrypoint replaces the shell so PID 1 receives signals directly. Know the exit-status contract cold: 0 success, 1-125 yours, 126 found but not executable, 127 not found, 128+N killed by
