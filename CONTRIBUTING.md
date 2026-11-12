# Contributing

Anyone with a GitHub account can fork this repository, create a branch in their fork, and open a pull request against `main`. No collaborator invitation is required. Only the repository owner, @gabed457, has merge authority; opening a pull request does not grant write access.

Before opening a pull request:

1. Run `npm ci`, `npm test` and `npm run build`.
2. Describe the behavior being changed and how you verified it.
3. Keep credentials, account configuration, cookies, local recordings and raw Codex session exports out of commits and attachments. Use synthetic fixtures or minimal redacted examples.

Preserve the Watergirl-only input boundary, complete collision observations, explicit Pause/Stop, and editable prompt/skills/guardrails. Do not add hidden level routes or Fireboy automation. Live integration tests should be muted and should not take focus from another app. Unit tests do not need a real account or a running game.

CI checks builds and tests. Passing CI does not automatically merge a pull request; the owner decides what to accept.
