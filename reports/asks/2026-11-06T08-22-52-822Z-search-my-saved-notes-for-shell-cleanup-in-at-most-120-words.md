# Lumen Ask

Date: 2026-11-06T08:22:52.822Z

## Question

Search my saved notes for shell cleanup. In at most 120 words, give one EXIT-trap example with a code block and cite the note and syllabus. State the note-search limits; do not infer completion.

## Plan context

Overview - headline progress across the plan, hours by month, the single next action, and the by-track breakdown.

## Answer

**Note:** “Shell mastery: pipefail and EXIT traps” says cleanup belongs in an `EXIT` trap, so temporary files are removed after normal exit, errors, and most signals [S10].

```bash
#!/usr/bin/env bash
tmp=$(mktemp)
trap 'rm -f "$tmp"' EXIT
printf '%s\n' work >"$tmp"
```

**Syllabus:** Row 1, “Traps: EXIT, ERR, INT/TERM and cleanup that always runs,” says to register the trap immediately after creating the resource. EXIT does not run after `SIGKILL` or a dead host, so cleanup must also be safe to repeat [S2].

**Search limits:** I inspected 3 selected files from 46 candidate records. This was not exhaustive, and no completion was established.

## Sources
[S2] Shell mastery and scripting: Traps: EXIT, ERR, INT/TERM and cleanup that always runs - /plan?row=1
Traps: EXIT, ERR, INT/TERM and cleanup that always runs
Register `trap cleanup EXIT` immediately after creating anything that needs undoing (temp dirs, lock fds, background PIDs); EXIT fires on normal completion, `exit N`, and after a caught signal, but never on SIGKILL or a dead host, so cleanup must also be idempotent on the next start. Use `trap 'on_err $? $LINENO "$BASH_COMMAND"' ERR` with `set -E` to log the failing command and line, and `trap 'exit 130' INT` / `trap 'exit 143' TERM` so the

[S10] Shell mastery: pipefail and EXIT traps - https://github.com/rasulshaikh/lumen-fde/blob/main/reports/notes/2026-09-05T16-14-29-610Z-shell-mastery-pipefail-and-exit-traps.md
# Shell mastery: pipefail and EXIT traps

Date: 2026-09-05T16:14:29.610Z

Core points from this week's shell work.

`set -euo pipefail` — `-e` exits on any failing command, `-u` rejects unset variables, and `-o pipefail` makes a pipeline return the first non-zero exit code instead of only the last command's. Without pipefail, `false | tee log` succeeds, which silently hides failures in the most common shape of shell code.

EXIT traps are the safe place for cleanup: `trap 'rm -f "$tmp"' EXIT` run
