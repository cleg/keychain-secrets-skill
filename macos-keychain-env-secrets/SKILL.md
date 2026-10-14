---
name: macos-keychain-env-secrets
description: Manage API secrets stored as macOS Keychain generic passwords and loaded into environment variables through managed shell configuration under ~/.config/keychain-env. Use for install, add, remove, update, list, and check of Keychain-backed shell secrets.
---

# macOS Keychain environment secrets

A local convenience layer around macOS `security` and shell environment mappings, not a production secrets-management platform. **Automate the expected flow; pause for concrete unexpected conditions.** Mappings contain names, not secret values; handle them as ordinary user configuration. The repository README documents implementation trade-offs and limitations; these are not repeated warnings or consent gates.

## Operating rules

- Collect secrets through native hidden entry, which returns only status. Never request a secret in chat or put one in tool-call arguments, output, logs, traces, or temporary files. Internal subprocess arguments are a documented implementation trade-off, not an extra consent step. Secrets must be non-empty single-line text without CR, LF, or NUL; native entry preserves spaces and Unicode and enforces this format.
- Verify using metadata and helper statuses only. Do not read passwords: no `security find-generic-password -w`/`-g`, environment dumps, or shell tracing. Inspect configuration without sourcing it, including for verification.
- Read [CONFIG.md](references/CONFIG.md) before resolving mappings or validating target names. Resolve variable, service, and account exactly; default account is the actual macOS account, not an unchecked inherited `$USER`. Resolve the shell only when the operation requires it. Quote non-secret arguments rather than interpolating executable source.
- Follow [SHELL-EDIT.md](references/SHELL-EDIT.md) before any file edit. Preserve unrelated configuration; keep configuration contents, diffs, backups, and raw syntax diagnostics out of output.
- Treat collisions and ambiguous targets as decision points. Do not guess dynamic mappings, bypass Keychain ambiguity/ownership checks, or treat errors as absence. Report file and Keychain outcomes separately when they differ.
- A clear add/update request authorizes the resolved operation. Preflight, briefly identify the target, and open secure entry without another chat confirmation. Ask when information is missing, scope is ambiguous, or an observed conflict/error requires a new decision. Deletion requires one confirmation of resolved scope.

## Choose the operation

Follow only the requested branch. Startup integration belongs to explicit install; startup troubleshooting, loader upgrades, and legacy migration require separately resolved scope.

| Request | Scope and procedure |
| --- | --- |
| Install / init | Follow [INSTALL.md](references/INSTALL.md): managed files and shell integration only; no secret creation or automatic resumption of add. |
| Add | Follow [ADD.md](references/ADD.md): require existing managed files, create the item, then add its mapping. |
| Update | Follow [Update](#update): Keychain value only; configuration remains unchanged. |
| Remove | Follow [Remove](#remove): confirm declaration-only, declaration plus item, or Keychain-only scope. |
| List | Follow [List](#list): recognized mapping metadata, not a Keychain inventory. |
| Check | Follow [Check](#check): mapping item presence, not password readability or API validity. |

Before invoking either helper, read [Helper integrity](#helper-integrity) and its contract below. On an uncertain write or established native-entry unavailability, follow [Write recovery](#write-recovery).

### Update

1. For a variable target, verify `config-preflight.js` and invoke `resolve-update VARIABLE`; continue only on `resolved`, using its exact service/account. For an explicitly requested service/account, validate and resolve those literals directly without configuration inspection. State the target; do not reconfirm a clear request.
2. Verify `store-secret.js` and invoke `update SERVICE ACCOUNT` directly. Its internal preflight requires a unique existing item and resolved owning Keychain before native entry; no separate `check` is needed. Continue only on `updated`. On `missing`, ask before creating instead; ambiguity/error stops. Cancellation leaves the value unchanged.
3. **Complete when:** the helper returned `updated` and configuration was left unchanged. No startup inspection, writable-file preflight, or backups are needed. Existing shells retain the old value until reloaded or replaced; do not read it back for verification.

### Remove

1. Resolve the exact variable/service/account using CONFIG.md. Inspect all canonical declarations and relevant legacy startup mappings read-only for references to that service/account. Shared references or code whose dependency cannot be resolved block item deletion; do not guess or implicitly edit/migrate legacy code. Show the target and obtain one confirmation of scope: declaration only, declaration plus item, or Keychain-only item.
2. For declaration-only scope, remove only the safely identified mapping using SHELL-EDIT.md. Leave Keychain unchanged, invoke neither `check` nor `remove`, and report item status as unverified. Shared item references do not block this scope.
3. For item-deletion scope, verify and invoke `check` before file edits; continue only on `present`. On `missing`, ask whether to remove just the declaration; ambiguity/error stops both mutations rather than silently changing scope.
4. Remove the target declaration if applicable, verifying the edit under SHELL-EDIT.md before proceeding. Retain other mappings, the loader, managed files, and startup integration even when no mappings remain. Then verify and invoke `remove`; require `deleted` to claim item deletion.
5. **Complete when:** every action in the confirmed scope has its own verified outcome: the requested declaration is absent after a verified edit, and/or the helper returned `deleted`. If either action fails, report actual file and Keychain outcomes separately. Removing a mapping does not clear values in existing shells or processes.

### List

Read canonical mappings under CONFIG.md without executing them. Show variable, service, and resolved account, never values. Report unfamiliar/dynamic code as unresolved. Missing configuration means no managed mappings; install nothing.

**Complete when:** every canonical declaration is represented in the metadata result and unresolved declarations are noted, or missing configuration is reported. Leave files and Keychain unchanged.

### Check

For each canonical mapping resolved under CONFIG.md, invoke verified `check` with its service/account. Report `present`, `missing`, `ambiguous`, or `unable to verify` for errors/unavailable helper. Note unresolved mappings separately. Missing items cause the loader to warn and export an empty value.

**Complete when:** every canonical mapping has a reported verification outcome and unresolved mappings are noted, or missing configuration is reported. Leave files and Keychain unchanged; do not fetch passwords or claim API validity.

## Helper integrity

During secret management, use installed `scripts/store-secret.js` and `scripts/config-preflight.js` unchanged. Do not patch, instrument, inline, or regenerate them to work around a failure. Skill development is separately authorized and must not use real secrets as debugging inputs.

Before **every invocation**, resolve the script relative to the installed skill, not the working directory, and verify its SHA-256 using system `shasum`. Use the corresponding reviewed pin:

| Script | Expected SHA-256 |
| --- | --- |
| `scripts/store-secret.js` | `081a7d19c980cbeefd8495f4402d7518afe54085e759b7828743607f734071a6` |
| `scripts/config-preflight.js` | `93c5170d885140aee03a112274f32587b5d6e3c41ec1850002cbfafe1a24579c` |

```sh
script='/resolved/installed/skill/scripts/selected-helper.js'
expected='REVIEWED_PIN_FROM_TABLE'
if actual=$(/usr/bin/shasum -a 256 < "$script") &&
   [ "${actual%% *}" = "$expected" ]; then
  :
else
  printf '%s\n' 'Helper integrity check failed; stop.' >&2
  exit 1
fi
```

On mismatch or an unreadable helper, stop before execution or mutation; ask to restore a trusted installation or authorize a separate upgrade. Do not repair the pin or bypass failure with a fallback. Successful verification is internal, not a user-facing checkpoint.

## Keychain helper contract

Invoke `store-secret.js` with three safely quoted non-secret arguments: operation (`add`, `update`, `check`, or `remove`), service, and resolved account.

```sh
osascript -l JavaScript '/resolved/installed/skill/scripts/store-secret.js' check 'service-name' 'resolved-account'
```

Allow sufficient time for secure entry or system authorization. Parse JSON status, not just process exit code:

| Status | Meaning / action |
| --- | --- |
| `created`, `updated`, `deleted` | Corresponding Keychain operation succeeded; file completion is separate. |
| `present` | One metadata match and successful scoped CLI metadata lookup; not password/API validation. |
| `missing` | No matching item; not an access failure. |
| `already_exists` | Add collision; ask before changing operation. |
| `ambiguous` | Multiple matches; ask to resolve the target. |
| `cancelled`, `validation_failed` | No write; leave configuration unchanged. |
| `invalid_arguments`, `error` | Stop, investigate status/metadata without reading passwords, and report safe numeric codes only. |

Check/remove resolve unique metadata and the owning Keychain, then call `security find-generic-password` without password flags or `security delete-generic-password` there. Update uses scoped `add-generic-password -U`; add is insert-only in the default Keychain. CLI I/O is discarded; CLI failures return generic helper code `-99902`. Do not substitute unscoped deletion or hand-written update calls bypassing these checks.

## Read-only configuration helper contract

Use installed `config-preflight.js` rather than generating inspection scripts for these operations. It never writes files, executes configuration, or accesses Keychain; it returns JSON metadata, not file contents.

| Invocation arguments | Success gate | Scope / result |
| --- | --- | --- |
| `install` | `ready` | Installation flags and metadata baselines; a startup path is included only for initial setup. Follow INSTALL.md. |
| `add VARIABLE SERVICE [ACCOUNT]` | `ready` | Managed-file preflight and resolved account; follow ADD.md. |
| `resolve-update VARIABLE` | `resolved` | Exact mapped service/account; no loader/startup or file-writability inspection. |

```sh
osascript -l JavaScript '/resolved/installed/skill/scripts/config-preflight.js' install
osascript -l JavaScript '/resolved/installed/skill/scripts/config-preflight.js' add 'VARIABLE' 'service-name'
# Optional fourth argument: explicit account; otherwise actual macOS account, not inherited USER.
osascript -l JavaScript '/resolved/installed/skill/scripts/config-preflight.js' resolve-update 'VARIABLE'
```

A `warnings` array is informational: briefly mention relevant access/ownership concerns and continue on `ready` or `resolved` without approval. Non-default permissions, different ownership, hard links, and inherited credential variables alone do not block a usable operation. Ignore provenance metadata. `blocked`, `error`, and `invalid_arguments` stop before mutation; resolve concrete access failures or ambiguity, not routine metadata differences. Add's `installation_required` handling is in ADD.md. Metadata baselines are not locks; SHELL-EDIT.md owns the immediate content/destination conflict check.

## Write recovery

A timeout, interruption, or generic error does not prove cancellation or native-entry unavailability. Recheck metadata before retrying a possibly started write; explain uncertain outcomes and ask before another write. Do not blindly retry or switch entry methods.

If native entry is independently known to be unavailable **before an add write**, a fresh verified `missing` check permits an actual interactive terminal using `security add-generic-password -a 'resolved-account' -s 'service-name' -w`, with no value after `-w`. Do not capture entry; explain the supported single-line format from Operating rules. If no interactive terminal is available, provide a safely quoted local command and wait for completion confirmation. Update has no interactive fallback bypassing ownership checks. Helper integrity failure never permits a fallback.

## Completion report

Report the result briefly with target names and any necessary next action. For file changes, identify changed files and retained backup paths without displaying their contents. Explain partial completion and recovery options on failure. Mention existing-shell values when relevant; do not enumerate internal checks or repeat general risk disclosures. Presence/syntax checks do not prove runtime loading, and metadata checks do not prove password readability or API acceptance.
