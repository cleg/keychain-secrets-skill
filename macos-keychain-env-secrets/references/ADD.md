# Add a mapped secret

Use this procedure for add only. Update changes Keychain without editing files; its procedure is in [SKILL.md](../SKILL.md#update).

## 1. Resolve and preflight

Read [CONFIG.md](CONFIG.md) for target constraints and [SHELL-EDIT.md](SHELL-EDIT.md) for file-edit rules. Resolve the requested variable and service, with any explicit account preserved exactly.

Verify `config-preflight.js` under [Helper integrity](../SKILL.md#helper-integrity), then invoke it once with `add VARIABLE SERVICE [ACCOUNT]`, using literal quoted non-secret arguments. Apply the [configuration helper contract](../SKILL.md#read-only-configuration-helper-contract). Use the returned resolved account, not inherited USER.

**Continue only on `ready`.** On `installation_required`, report missing managed paths and suggest the explicit install operation. If loading was configured manually, suggest checking `.zshrc` or the selected shell integration themselves. Stop before native entry; do not install automatically. Other blocked/error/invalid-argument results also stop before mutation; resolve the concrete condition without bypassing the helper's refusal.

Both `~/.config/keychain-env/init.sh` and `mappings.sh` must exist; their presence is the installation marker, not proof of shell loading. Preflight checks actual access, syntax, canonical mappings, duplicate declarations, and a usable mapping-edit method. It never reads or changes startup files, discovers the login shell, checks ZDOTDIR, or compares the loader with the bundle. It cannot inspect unexported attributes in a separate running shell or detect startup assignments; runtime attribute checks remain in place.

## 2. Collect and create

Briefly identify variable, service, and resolved account. Verify `store-secret.js` and invoke `add SERVICE ACCOUNT` directly under the [Keychain helper contract](../SKILL.md#keychain-helper-contract). Its internal preflight rejects existing, ambiguous, or inaccessible targets before native entry and rechecks after entry before insert-only creation; no separate `check` is needed on this normal path.

**Continue only on `created`.** On `already_exists`, ask before changing operation. On `cancelled` or `validation_failed`, leave configuration untouched. Follow [Write recovery](../SKILL.md#write-recovery) for interruption, uncertain writes, or established entry unavailability.

## 3. Add the mapping

After `created`, follow SHELL-EDIT.md to add exactly one canonical declaration for the resolved target to the existing mappings.sh. Use an explicit account if the shell's USER would select a different account. Preserve all other declarations and bytes; leave init.sh and startup files untouched. Do not recreate a managed file that disappears after preflight.

**Complete when:** the helper returned `created`, the installed mapping matches the exact resolved variable/service/account, and the edit meets SHELL-EDIT.md's completion criterion. This establishes item creation and mapping installation, not runtime loading.

Keychain creation and file editing are not one transaction. If the mapping edit fails, report that the item was created, the actual file outcome, and recovery options under [Completion report](../SKILL.md#completion-report). Do not silently delete the new item or claim the mapping is usable.
