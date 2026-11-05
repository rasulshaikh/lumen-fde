# Private workspace production readiness

Scope: one owner using the existing login, Vercel app, Render MCP bridge and GitHub-backed records. Team accounts, tenant isolation, SSO and compliance certification are outside this release.

## Access and secrets

Production requires `LUMEN_PASSWORD` and an independent `LUMEN_SESSION_SECRET` of at least 32 characters. A missing setting returns 503 on private routes. Preview is also closed unless configured; never copy production write credentials into an untrusted preview. `/healthz` is public liveness only, not a provider-readiness assertion.

Sessions last 12 hours. Rotating the password or signing secret invalidates all existing cookies. The cookie is HttpOnly, Secure in production, SameSite=Lax, path `/`. Sign out expires it and performs a full navigation. No account recovery email is exposed: the owner recovers through Vercel project access and rotates the two settings.

Browser mutations require the exact request origin, JSON content type and at most 128 KiB. Server-to-server `LUMEN_INTERNAL_API_KEY` bypass is confined to `/api/ask`. Cron routes require their bearer secret. The nonce CSP requires dynamic HTML rendering; do not cache nonce-bearing private HTML at a CDN. Style attributes remain permitted because the existing UI uses them.

The in-process login throttle is bounded but is only a fallback. It is **not distributed protection**. Stage the native Vercel rule in `ops/login-rate-limit.json` and review matching traffic before enforcement. Rate-limit counters are per Vercel region. Do not publish an unreviewed firewall configuration or replace unrelated rules. Consult [Vercel rate limits](https://vercel.com/docs/vercel-firewall/vercel-waf/rate-limiting) and the account's current usage terms before activating a new billable feature.

## Save and recovery behavior

GitHub reads have a 10-second deadline and up to two retries for transient HTTP responses; long Retry-After windows are returned promptly. Writes are never blindly retried. A conflict or uncertain network response is successful only if the stored bytes match the intended content. Stale SHA updates remain conflicts.

The proof form retains its save key and date while the same submission is retried. Its deterministic append-only path prevents duplicate records after an ambiguous acknowledgement. Editing the submission creates a new save identity. Closing or refreshing the form does not persist its unsaved draft, so check existing proof before recreating an uncertain submission from a fresh page.

Review grades are saved locally first. A failed sync is visible; Retry sync reads the current cloud SHA and merges cards by observation count, keeping the durable copy on ties. This avoids a stale tab silently replacing newer state. Simultaneous grading of the same card is not an event log and does not add two competing counts together.

Progress reads all available markdown events with concurrency eight. At the GitHub directory ceiling of 1,000 entries it returns an explicit compaction error instead of losing older topics. Compact to a validated status snapshot before reaching this limit. GitHub remains a private-workspace store, not an unbounded transactional database.

## Monitoring and alerts

`.github/workflows/production-monitor.yml` runs twice hourly and on manual dispatch without calling the email cron. It fails if public liveness fails, anonymous progress is accessible, market data is stale, or the last provider-accepted digest is over 26 hours old. A missing first digest gets 26 hours from the commit that introduced the monitor. Date-only benchmark freshness allows 50 hours for UTC boundaries.

The heartbeat confirms provider acceptance, not inbox delivery. Enable GitHub Actions failure notifications for the repository in the owner's account. Scheduled Actions can be delayed or disabled by GitHub; an external uptime service is needed for an independent contractual availability guarantee. No such service or paid subscription is provisioned by this release.

On failure: check the failing monitor step, Vercel runtime logs, the market cron's last result, GitHub token access and Resend delivery logs. Retry reads safely. Do not run the digest manually as a diagnostic because it sends a real email. Do not mark an outage healthy by writing a fabricated heartbeat.

## Backups and restore

Run from a clean checkout after fetching current production history:

```sh
git fetch origin --prune
node scripts/backup-rehearsal.mjs /absolute/private/lumen-backup.bundle /absolute/new-restore-directory
```

The script refuses existing destinations, creates and verifies an all-refs bundle, clones into a fresh directory, runs `git fsck`, confirms HEAD, parses committed report JSON and records a SHA-256 manifest. Store another encrypted copy outside the GitHub account. A local bundle alone does not protect against losing this computer.

Bundles include committed records and history. They exclude environment secrets, provider configuration, unsaved drafts and review grades that never synced from localStorage. Keep owner-controlled recovery for GitHub, Vercel, Render, Resend and model-provider credentials separately. Do not place credentials in this repository or attach them to a release.

For an actual restore, isolate a new private repository and deployment, restore refs from the verified bundle, recreate provider settings through owner access, and validate reads before permitting writes. For code rollback, promote the preceding verified Vercel deployment; data commits remain intact. Recover a damaged mutable JSON file from a known-good commit using a conditional GitHub write and retain the incident history. Never force-push main as a rollback.

## Release acceptance

Before merge: lint, production build, all test scripts, documentation anchors and dependency audit must pass. CI has read-only contents permissions, pinned actions and a timeout. Test with fixture credentials and stubbed GitHub responses, including failed saves, replayed saves and stale SHA conflicts.

After merge: verify production deployment SHA, health version, anonymous API rejection, signed-in desktop/mobile navigation, sign out, and security headers. Confirm the new signing secret is provisioned before deploy; existing cookies will require one new sign-in. Confirm the next scheduled market and digest runs and the independent monitor. A real production record-write test requires a named disposable record and owner acceptance; fixture tests are not live persistence evidence.

Only tag `v1.1.0` and publish release notes against the verified merge commit. Never tag the feature branch or describe unobserved scheduled runs as accepted. The pending PR #2 is superseded by this release branch and should be closed once this change lands.
