---
name: macos-keychain-env-secrets
description: Manage API secrets stored as macOS Keychain generic passwords and loaded into environment variables by ~/.zshrc. Use for add, remove, update, list, and check of Keychain-backed shell secrets.
---

# macOS Keychain environment secrets

Manage a mapping from a zsh environment variable to a macOS Keychain generic-password item. This is an agent-independent procedure, not a script to execute blindly. Supported operations: `add`, `remove`, `update`, `list`, `check`.

## Non-negotiable safety rules

- Never display, quote, log, summarize, or echo a secret value in responses, terminal output, command traces, diffs, or test results. Never paste a secret into a tool call. Do not use `security find-generic-password -w` or `-g` for inspection; never run `env`, `printenv`, `set`, `set -x`, or `zsh -x` as a verification step where secrets may appear.
- Do not pass a secret as a command-line argument, environment variable, stdin in a logged tool call, or temporary file. `security add-generic-password` supports an interactive password prompt when `-w` is its last option and has no value. Use an actual interactive terminal for entry; the human types the secret directly into that prompt. Never ask the human to paste the value into chat. If an interactive terminal is unavailable, stop and explain that the human must perform the interactive entry locally; do not substitute `-w "$TOKEN"` or another unsafe workaround.
- Do not modify `~/.zshrc` or Keychain for `list` or `check`. Never source `~/.zshrc` to inspect mappings: it can run arbitrary code and load secrets. Do not print the full file, which may contain unrelated credentials. Read locally and show only redacted structure, variable names, service names, and status.
- Default account is the current macOS account (`$USER`), service is the user-chosen Keychain name. Use a consistent account/service pair for lookup, modification, and deletion. Quote non-secret names as shell arguments. Avoid shell injection: never interpolate user-supplied names into executable shell source without correct shell quoting; validate environment-variable names against `^[A-Za-z_][A-Za-z0-9_]*$`.
- Before *every* edit of `~/.zshrc`, make a timestamped, collision-safe backup outside version control, preserving ownership and restricting backup access to the owner (mode 600). The file or its backups may contain unrelated secrets; never print or commit either. Edit atomically where possible, preserve unrelated content, and validate syntax with `zsh -n ~/.zshrc` without sourcing. If validation fails, restore the backup. Do not silently delete backups.
- Treat ambiguity, a locked Keychain, access denial, or other `security` errors as errors, not proof that an item is absent. Do not overwrite or delete unrelated data. Explain partial completion if one of the Keychain/file operations fails; never claim a transaction was atomic.
- If the specific operation or observed state suggests that continuing could damage the user's configuration, overwrite a value, or delete the wrong item, stop before that action, explain the concrete risk without exposing secrets, and ask the user how to proceed. Do not pause for merely hypothetical edge cases.

## Mapping and helper

Detect the actual existing helper and `export VARIABLE="$(helper 'service')"`-style mappings by inspecting `~/.zshrc` without evaluating it. Existing installations may use `keychain_secret`; do not assume every user does. Match only clearly recognized mappings. If the helper exists, reuse it; if it lacks the required warning-on-failure behavior, update it cautiously after backup. If it has unfamiliar semantics or cannot be changed safely, ask before altering it. If no suitable helper exists, add one (and a descriptive comment) without disturbing other code.

Suggested zsh helper (adapt account handling to the existing convention):

```zsh
keychain_secret() {
  local value
  if value=$(security find-generic-password -a "$USER" -s "$1" -w 2>/dev/null); then
    printf '%s' "$value"
  else
    printf 'Warning: Keychain secret for service %s is unavailable; exporting an empty value.\n' "$1" >&2
    return 0
  fi
}
```

`$(...)` captures stdout but leaves stderr visible, so the warning appears when the shell starts while the exported variable still exists with an empty value. Do not print the password in the warning. This helper deliberately reports any read failure as unavailable; `check` should investigate the cause without exposing a value. Note: exporting secrets puts them in the environment of child processes; that is an explicit tradeoff of this workflow. Warn if a proposed service name or variable name reveals sensitive metadata.

## Operations

### `add`

1. Ask for the environment variable name and the Keychain service name separately, plus which shell/account to use if not the default. Confirm intent without asking for the value in chat.
2. Inspect `~/.zshrc` for the variable, mapping and helper; check for an existing matching account/service item without requesting its password. If either name collides or the mapping is ambiguous, stop and resolve it with the user. Do not silently use `-U`: that would overwrite an existing item.
3. In an interactive terminal, let the human enter the secret directly at the prompt, with `-w` last and no value: `security add-generic-password -a "$USER" -s 'service-name' -w`. Do not display the input or capture the prompt's output in a transcript. If this cannot be done safely from the available interface, provide this command with a *placeholder service name* for the user to run locally and pause until they confirm success.
4. Back up `~/.zshrc`, install/update the helper as needed, and add exactly one safely quoted export mapping. Validate syntax. If the file edit fails after Keychain insertion, tell the user an orphan Keychain item may remain; do not silently delete it.

### `remove`

1. Resolve the exact variable and service mapping from `~/.zshrc` (or ask for both if removing an explicitly identified Keychain-only item). Show names and request confirmation before deleting the Keychain item.
2. Search for other references to that account/service in the recognized mappings. If shared, do not delete the Keychain item while another export still depends on it; ask whether to remove just this export. If unsure, stop.
3. Back up and remove only the target export from `~/.zshrc`; do not automatically remove a shared helper. Validate syntax. Then, if safe and confirmed, delete the exact item with `security delete-generic-password -a "$USER" -s 'service-name'`. If deletion fails, report that the export was removed but the item remains. Do not expose its value.

### `update`

1. Accept either the Keychain service name or an environment variable name. For a variable, resolve the service from a single, unambiguous recognized `~/.zshrc` mapping; otherwise ask for clarification. Confirm the target account/service.
2. Verify the item's status without reading its value. If present, use interactive `security add-generic-password -a "$USER" -s 'service-name' -U -w` (`-w` last, no value) to replace it. If absent, distinguish that state from other errors and ask whether to create the item instead. Never use `-U` during `add` without consent.
3. Do not edit `~/.zshrc` for a normal update; no zshrc backup is needed. State that existing shells and child processes will retain their old exported value until the environment is reloaded/new shells start; do not print either value.

### `list`

Parse recognized Keychain-backed exports in `~/.zshrc` without executing it. Show environment variable, service name, and account convention (usually `$USER`), never values. Mark unrecognized or dynamically constructed mappings as `unresolved` rather than guessing. This is **not** an inventory of all Keychain items. Avoid printing unrelated ordinary exports or lines with literal secrets.

### `check`

For each recognized mapping from `~/.zshrc`, check Keychain metadata/existence for the correct account/service **without fetching its password**, e.g. `security find-generic-password -a "$USER" -s 'service-name' >/dev/null 2>/dev/null` and inspect the exit status. Report `present`, `missing`, or `unable to verify` (locked Keychain, denial, ambiguous/non-missing failure). Where needed, distinguish missing from errors by inspecting a *redacted* diagnostic/exit status privately, never dump unfiltered Keychain output into chat. Note unresolved mappings separately. A missing item means the helper will warn and export an empty value on shell startup. `check` cannot discover unused Keychain items or validate that a secret is accepted by its API.

## Completion report

Report the requested operation, variable/service names if appropriate, status, whether `~/.zshrc` was changed and backed up, and any remaining action. Never include secret values, raw file contents, or unredacted command output. For interactive commands, use placeholders for names unless safely quoted actual non-secret names are explicitly needed.
