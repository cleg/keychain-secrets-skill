---
name: macos-keychain-env-secrets
description: Manage API secrets stored as macOS Keychain generic passwords and loaded into environment variables through managed shell configuration under ~/.config/keychain-env. Use for install, add, remove, update, list, and check of Keychain-backed shell secrets.
---

# macOS Keychain environment secrets

A simple local automation around macOS `security` and shell environment mappings. Mappings contain names, not secret values; handle them as ordinary user configuration, not an enterprise security boundary. **Automate the expected flow; pause for concrete unexpected conditions.** This is not a production secrets-management platform. Implementation trade-offs and limitations are documented in the repository README; do not turn them into repeated warnings or consent gates.

## Operating rules

- Never request a secret in chat or put one in tool-call arguments, output, logs, traces, or temporary files. Native hidden entry collects the value and returns only status. Internal subprocess arguments are part of the documented implementation, not an extra consent step.
- Do not read passwords for inspection or verification: no `security find-generic-password -w`/`-g`, environment dumps, or shell tracing. Do not source configuration to inspect it.
- Resolve variable, service, account, and shell consistently. Validate names using [CONFIG.md](references/CONFIG.md); quote non-secret arguments rather than interpolating executable source. Default account is the current macOS account; do not blindly trust a changed `$USER`.
- Preserve unrelated configuration and follow [SHELL-EDIT.md](references/SHELL-EDIT.md) for edits. Do not expose configuration contents, diffs, backups, or raw syntax diagnostics.
- Do not silently overwrite collisions, guess dynamic mappings, bypass Keychain ambiguity/ownership checks, or treat errors as absence. Report partial completion if Keychain and file operations differ.
- A clear add/update request authorizes the resolved operation. Preflight, briefly identify the target, and open secure entry without another chat confirmation. Ask when information is missing, scope is ambiguous, or an observed conflict/error requires a new decision. Keep deletion confirmation.

## Installed helper

During secret management, use the installed `scripts/store-secret.js` unchanged. Do not patch, instrument, inline, or regenerate it to work around a failure. Skill development is a separate explicitly authorized task and must not use real secrets as debugging inputs.

Before each invocation, verify its SHA-256 using system `shasum`. Resolve the script relative to the installed skill, not the working directory:

```sh
script='/resolved/installed/skill/scripts/store-secret.js'
expected='081a7d19c980cbeefd8495f4402d7518afe54085e759b7828743607f734071a6'
if actual=$(/usr/bin/shasum -a 256 < "$script") &&
   [ "${actual%% *}" = "$expected" ]; then
  :
else
  printf '%s\n' 'Helper integrity check failed; stop.' >&2
  exit 1
fi
```

On mismatch or an unreadable helper, stop before execution or mutation; ask to restore a trusted installation or authorize a separate upgrade. Do not repair the pin or use a fallback to bypass failure. Successful verification is an internal check, not a user-facing checkpoint. The reviewed digest is `081a7d19c980cbeefd8495f4402d7518afe54085e759b7828743607f734071a6`.

Invoke with three safely quoted non-secret arguments:

```sh
osascript -l JavaScript '/resolved/installed/skill/scripts/store-secret.js' check 'service-name' 'resolved-account'
```

Operations are `add`, `update`, `check`, and `remove`. Allow sufficient time for secure entry or system authorization. Parse the JSON status, not just the process exit code:

| Status | Action |
| --- | --- |
| `created`, `updated`, `deleted` | Corresponding operation succeeded. |
| `present` | One metadata match and a successful scoped CLI metadata lookup; not password/API validation. |
| `missing` | No matching item; not an access failure. |
| `already_exists` | Add collision; do not silently switch to update. |
| `ambiguous` | Multiple matches; ask to resolve the target. |
| `cancelled`, `validation_failed` | No write; leave configuration unchanged. |
| `invalid_arguments`, `error` | Stop, investigate status/metadata without reading passwords, and report safe numeric codes only. |

Check/remove resolve unique metadata and the owning Keychain, then call `security find-generic-password` without password flags or `security delete-generic-password` there. Update uses scoped `add-generic-password -U`; add is insert-only in the default Keychain. CLI I/O is discarded, and CLI failures return generic helper code `-99902`. Do not substitute unscoped deletion or hand-written update calls that bypass the helper's checks.

## Read-only configuration helper

Use the installed `scripts/config-preflight.js` unchanged for installation planning, add preflight, and variable-based update resolution. Before every invocation, use the same `shasum` verification procedure above with that script's absolute path and expected digest `ee821165521a7926cc215539ddd628835e6e06e6f817a6e65e54e3bd6a755000`. Integrity failure stops the operation without fallback.

```sh
osascript -l JavaScript '/resolved/installed/skill/scripts/config-preflight.js' install
osascript -l JavaScript '/resolved/installed/skill/scripts/config-preflight.js' add 'VARIABLE' 'service-name'
# Optional fourth argument: explicit account; otherwise actual macOS account, not inherited USER.
osascript -l JavaScript '/resolved/installed/skill/scripts/config-preflight.js' resolve-update 'VARIABLE'
```

Parse JSON: `ready` permits the requested install plan or add's secure-entry step; `resolved` supplies update's exact service/account. A `warnings` array is informational: briefly mention relevant access/ownership concerns and continue on `ready` or `resolved` without asking for approval. Non-default permissions, different ownership, hard links, and inherited credential variables alone do not block a usable operation. Ignore provenance metadata. `blocked`, `error`, and `invalid_arguments` stop before mutation. On add's `installation_required`, report missing paths and suggest running this skill's `install` operation, or checking `.zshrc`/the selected shell integration manually. Do not install automatically during add. Add assumes installation when both managed files exist; it validates managed files and mappings but never reads startup files, discovers the login shell, checks ZDOTDIR, or compares the loader with the bundle. It does not verify shell loading. Only install returns a startup path and installation plan. All operations are read-only, never access Keychain, and return metadata rather than file contents. Resolve-update inspects mappings, not loader/startup or file writability. Baselines are not locks; check content and destination before editing using SHELL-EDIT.md. Stop for concrete access failures or ambiguity, not routine metadata differences.

## Configuration and entry

Read [CONFIG.md](references/CONFIG.md) before working with mappings. Runtime files are fixed at `~/.config/keychain-env/init.sh` and `mappings.sh`. Install bundled `scripts/init.sh` unchanged. Keep mappings canonical and inspect them without execution. Routine mapping changes do not edit startup files.

Startup integration belongs exclusively to the explicit [install workflow](references/INSTALL.md). Add assumes existing integration and changes only mappings; startup troubleshooting is a separately requested task.

Secrets must be non-empty single-line text without CR, LF, or NUL. Spaces and Unicode are preserved. Native entry enforces this; do not read existing values to validate their format.

A timeout, interruption, or generic error does not prove cancellation or native-entry unavailability. Recheck metadata before retrying a possibly started write; explain uncertain outcomes and ask before another write. Do not blindly retry or switch entry methods.

If native entry is independently known to be unavailable before an add write, a fresh verified `missing` check permits an actual interactive terminal using `security add-generic-password -a 'resolved-account' -s 'service-name' -w`, with no value after `-w`. Do not capture entry; explain the supported single-line format. If no interactive terminal is available, provide a safely quoted local command and wait for completion confirmation. Update has no interactive fallback bypassing ownership checks. Helper integrity failure never permits a fallback.

## Operations

### Install

On an explicit install/init request, follow [INSTALL.md](references/INSTALL.md). This autonomously sets up managed files and shell integration without creating a secret. Default zsh placement is the end of `~/.zshrc`; mention that the user can move the block afterwards. Ordinary startup includes/eval do not require a placement confirmation. Keep installation separate from add.

### Add

Follow [ADD.md](references/ADD.md): require existing managed files, run read-only preflight once, invoke secure `add` directly, then edit mappings only on `created`. Missing files stop add with installation guidance. Use the installed helper rather than generating inspection scripts; its normal path needs no separate Keychain `check`.

### Update

1. For a variable target, verify the configuration helper and invoke `resolve-update VARIABLE`; continue only on `resolved`, using its service/account. For an explicitly requested service/account, resolve those literals directly without configuration inspection. State the target; do not reconfirm a clear request.
2. Verify `store-secret.js` and invoke `update SERVICE ACCOUNT` directly. Its internal preflight requires a unique existing item and resolved owning Keychain before native entry; no separate `check` is needed. Require `updated`. On `missing`, ask before creating instead; ambiguity/error stops. Cancellation leaves the value unchanged.
3. Leave configuration unchanged; no startup inspection, writable-file preflight, or configuration backups are needed. Existing shells retain the old value until reloaded or replaced; do not load passwords for agent verification.

### Remove

1. Resolve the exact variable/service/account. Inspect all canonical declarations and relevant legacy startup mappings for shared references. Show the target and obtain one confirmation of scope: declaration only, declaration plus item, or Keychain-only item.
2. Shared or unresolved item references block item deletion, but permit declaration-only removal when the target declaration can be safely identified. Do not edit/migrate legacy code implicitly.
3. For declaration-only scope, remove only the requested mapping using SHELL-EDIT.md. Leave Keychain unchanged and do not invoke check/remove. Report item status as unverified.
4. For item-deletion scope, verify and invoke `check` before file edits; continue only on `present`. On `missing`, ask whether to remove just the declaration; ambiguity/error stops both mutations.
5. Remove the target declaration if applicable, preserving other mappings, loader, and startup integration. Invoke verified `remove`. Report file and Keychain outcomes separately on failure. Existing shell/process values are not cleared by removing a mapping.

### List

Read canonical mappings without executing them. Show variable, service, and account, never values. Report unfamiliar/dynamic code as unresolved. Missing configuration means no managed mappings; install nothing. This is not a Keychain inventory.

### Check

For each canonical mapping, invoke verified `check` with the resolved service/account. Report `present`, `missing`, `ambiguous`, or `unable to verify` for errors/unavailable helper. Note unresolved mappings separately. Do not modify files, fetch passwords, or claim API validity. Missing items cause the loader to warn and export an empty value.

## Completion

Report the result briefly with target names and any action needed. For file changes, identify the changed file and backup location; do not enumerate internal checks or repeat general risk disclosures. Explain partial completion and recovery options when something failed. Mention existing-shell values when relevant, rather than giving a security disclaimer after every operation.
