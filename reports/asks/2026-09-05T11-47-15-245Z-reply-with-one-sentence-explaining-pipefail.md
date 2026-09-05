# Lumen Ask

Date: 2026-09-05T11:47:15.245Z

## Question

Reply with one sentence explaining pipefail.

## Plan context

Shell

## Answer

In pipefail makes a pipeline return the exit code of the first failed command, so a script running cd bad_dir | grep foo correctly reports failure instead of masking it with grep's success.
