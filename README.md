# macOS Keychain Environment Secrets Skill

An agent-independent skill for managing API secrets stored as macOS Keychain generic-password items and exposed to shell programs through environment variables configured in `~/.zshrc`.

The skill documents five operations:

- **add** — create a Keychain item and add an environment-variable mapping.
- **remove** — remove a mapping and, when safe, its Keychain item.
- **update** — replace the Keychain password without changing `~/.zshrc`.
- **list** — show recognized mappings without secret values.
- **check** — identify mappings whose Keychain items are missing or cannot be verified.

The procedure requires an interactive terminal for entering secret values, creates a backup before editing `~/.zshrc`, and warns when an item cannot be read while still exporting an empty variable. It never requires the agent to see the secret itself.

## Installation

Use the skill file at [`macos-keychain-env-secrets/SKILL.md`](macos-keychain-env-secrets/SKILL.md). Place or symlink the `macos-keychain-env-secrets` directory into your agent's skills directory, according to that agent's conventions. The skill is written as instructions rather than an agent-specific executable.

## Limitations

- **macOS only:** requires the macOS `security` command and Keychain generic-password items.
- **zsh only:** reads and edits `~/.zshrc`; it does not manage bash, fish, or other startup files.
- `list` and `check` inspect only recognizable `~/.zshrc` mappings, not all Keychain items. Dynamic or ambiguous shell code needs manual review.
- `check` verifies item availability, not whether an API accepts the credential. Keychain access failures may require investigation.
- Exported secrets are inherited by child processes and may remain in already-running shells after an update. Start a new shell to load the updated value.
- The skill is guidance, not a transactional tool: Keychain changes and file edits can succeed or fail separately. An interactive terminal is required to add or update a password without exposing it in command arguments or chat.
