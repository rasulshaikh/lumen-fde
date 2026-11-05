# Changelog

## 1.2.1 - phone interaction fixes

- Keep Ask Lumen above navigation so its Close button works in phone landscape.
- Restore focus to a visible assistant opener after closing the panel.
- Give machine sliders and the sandbox command field a 44-pixel interaction height.

## 1.2.0 - source-backed Ask Lumen and usable workspace flows

- Add bounded, model-directed private-source retrieval with validated citations and inspectable excerpts. Keep web search opt-in and clearly identify book maps rather than PDF text.
- Paginate the plan, add a current-topic shortcut, fix narrow Market overflow, enlarge phone controls and restore assistant keyboard focus.
- Add conditional cloud sync for preferences, editable mock repetition counts and saved GTM modules, with retries and conflict handling.
- Complete the HubSpot data-contract exercise and retain unsaved device drafts when a different cloud copy exists.
- Add a shared large-display preference for more readable type and controls.


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
