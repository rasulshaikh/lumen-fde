# Lumen Ask

Date: 2026-09-05T11:49:03.117Z

## Question

Explain pipefail in one short technical paragraph.

## Plan context

No topic filter was active.

## Answer

Pipefail is a shell option that makes a pipeline return the exit status of the rightmost command that failed, instead of always returning zero just because the last command succeeded. In bash you turn it on with set -o pipefail, and in production it matters because data and AI pipelines often pipe many steps, like curl into jq into a loader, or a Python script into gzip into an upload. Without pipefail, a broken early step can be silently hidden when the final step happens to succeed, and bad data quietly lands in the feature store or training set. For an FDE, knowing pipefail shows you understand how to make build, test, and ETL scripts fail loudly, which is a common interview topic around shell scripting and reliable data pipelines.

Next step: open one of your shell scripts or Makefile recipes and add set -o pipefail at the top, then run a pipeline where an earlier step is forced to fail and confirm the script exits non-zero.
