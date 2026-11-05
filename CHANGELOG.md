# Changelog

## 1.1.0 - private workspace hardening

- Fail closed when owner authentication or production session signing is missing. Use independently signed 12-hour sessions, same-origin JSON writes, body limits, private cache headers and a nonce-based script policy.
- Add sign out and a public health endpoint without study data or credentials.
- Reuse proof-save identities on retries; verify uncertain GitHub writes against stored content without overwriting conflicts. Bound GitHub request time and retry transient reads.
- Preserve progress beyond 100 events, with eight concurrent reads and an explicit capacity failure at the GitHub directory limit.
- Show recall sync failures and offer a merge-aware retry. Validate review state before saving.
- Monitor the private API gate and scheduled-work freshness independently through GitHub Actions. Record digest acceptance only after the email provider accepts it.
- Pin dependencies and CI actions, update vulnerable dependencies, add an audit gate, and provide a verified Git bundle restore procedure.
- Include the pending market-read recovery and report-only deployment suppression from PR #2.

This release targets one owner's private workspace. Platform firewall activation and post-deployment acceptance remain release gates; this is not a claim of SSO, organizational roles, an SLA, or compliance certification.
