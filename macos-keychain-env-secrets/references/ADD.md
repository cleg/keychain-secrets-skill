# Add a mapped secret

Use this procedure for add only. Update changes the Keychain value without editing shell files; its shorter procedure is in SKILL.md.

## 1. Resolve and preflight

Resolve the requested environment variable and service; default account is the actual macOS account. Read CONFIG.md and SHELL-EDIT.md for mapping and file-edit rules.

Run the installed `scripts/config-preflight.js` once with `add VARIABLE SERVICE [ACCOUNT]`, using literal quoted non-secret arguments. Verify its pinned SHA-256 from SKILL.md before invocation. The helper is read-only: it inspects configuration without sourcing it and never calls Keychain or collects a secret. Use the returned resolved account, not an inherited USER value.

Continue only on `ready`; informational `warnings` do not require approval. On `installation_required`, report the missing managed files and suggest running this skill's explicit `install` operation. If the user already configured loading manually, suggest checking `.zshrc` or their selected shell integration themselves. Stop before native entry; add neither installs files nor inspects startup configuration. Other blocked/error/invalid-argument results also stop before mutation; resolve the concrete condition without replacing the helper or bypassing its refusal.

Both `~/.config/keychain-env/init.sh` and `mappings.sh` must exist. Their presence is the installation marker, not proof that a shell sources them. Preflight checks actual access, syntax, canonical mappings, duplicate declarations, and a usable mapping-edit method. Ownership and non-default permissions are warnings; inherited credential values are allowed. It does not compare the installed loader with the bundle or inspect startup files, login shell, or ZDOTDIR. It cannot inspect unexported attributes in a separate running shell or detect assignments in startup files; runtime attribute checks remain in place.

## 2. Collect and create

Briefly identify variable, service, and resolved account. Verify `scripts/store-secret.js` as specified in SKILL.md and invoke `add SERVICE ACCOUNT` directly. Its internal preflight rejects existing, ambiguous, or inaccessible targets before opening native entry; a separate `check` call is unnecessary on this normal path. It rechecks after entry before insert-only creation.

Continue only on `created`. On `already_exists`, ask before changing operation; never silently update. On `cancelled` or `validation_failed`, leave configuration untouched. Follow SKILL.md for errors, interruption, and uncertain writes; do not blindly retry.

## 3. Add the mapping

After `created`, use SHELL-EDIT.md to add exactly one canonical declaration for the resolved target. Use an explicit account if the shell's USER would select a different account. Preserve all other declarations and bytes.

Change only the existing mappings.sh. Leave init.sh and all startup files untouched; do not recreate a file that disappears after preflight. Recheck content, target identity, and any symlink destinations immediately before writing; the earlier read-only preflight is not a lock or a substitute for these checks.

Validate canonical format and shell syntax without sourcing. Continue only when installed content and syntax are verified; use practical access preservation rather than exhaustive metadata checks. Report the changed files and retained private backup paths.

Keychain creation and file installation are not one transaction. If the mapping edit fails, report that the item was created, which files changed, and the recovery options. Do not silently delete the new item or claim the mapping is usable.
