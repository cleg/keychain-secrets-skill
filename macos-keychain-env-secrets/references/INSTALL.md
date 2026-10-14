# Install managed shell loading

Use this workflow on an explicit install/init request. Installation creates no Keychain items, collects no secret, and does not automatically resume an earlier add. Add is a separate operation that requires existing managed files.

## 1. Plan read-only

Read [CONFIG.md](CONFIG.md) and [SHELL-EDIT.md](SHELL-EDIT.md). Verify `config-preflight.js` under [Helper integrity](../SKILL.md#helper-integrity) and invoke `install` without additional arguments. Apply the [configuration helper contract](../SKILL.md#read-only-configuration-helper-contract).

**Continue only on `ready`**, using its installation flags and any selected startup path. Both managed files mark an existing installation: when they exist, report the setup without inspecting startup files, discovering the login shell, or repairing integration. A changed installed loader remains a separately resolved upgrade decision. File presence and syntax checks do not establish runtime loading.

For initial zsh setup, append the block to the end of `~/.zshrc` on a new line, preserving all existing bytes. An explicit install request authorizes this placement without another confirmation. Assume ordinary beginning-to-end execution; leave custom control flow, early returns, includes, and loading order to the user's manual review. Validate syntax before and after the edit without executing configuration or following includes. An inherited non-default ZDOTDIR is a concrete initial-path ambiguity; resolve it rather than silently choosing a file.

During initial setup, preserve an existing recognized integration rather than adding a duplicate. For bash, reuse established integration or a simple, unambiguous top-level login-to-interactive arrangement; choose one startup file and preserve the others. Resolve access failures, invalid syntax, duplicate/unfamiliar integration, or ambiguous bash arrangements before editing. Startup troubleshooting is a separate request.

## 2. Install the plan

Follow SHELL-EDIT.md for every file edit, including the immediate content/destination conflict check; preflight baselines are not locks.

- Create the managed directory mode 700 when absent; do not loosen existing parent permissions.
- For a missing init.sh, install bundled scripts/init.sh unchanged, mode 600.
- For a missing mappings.sh, create a comment-only canonical file, mode 600. Preserve existing mappings.
- Only after both managed files exist, add exactly one startup block when required:

```sh
# Keychain environment configuration
if [ -r "$HOME/.config/keychain-env/init.sh" ]; then
    . "$HOME/.config/keychain-env/init.sh"
else
    printf '%s\n' 'Warning: Keychain environment init.sh is missing or unreadable.' >&2
fi
```

Validate managed files and canonical mappings without sourcing them. For a planned startup edit, also validate the selected file under SHELL-EDIT.md; existing managed setups do not require startup inspection.

## 3. Complete

**Complete when:** both managed files exist, any planned startup integration was preserved or installed as specified, every planned edit meets SHELL-EDIT.md's completion criterion, and Keychain was left untouched. When no edits were planned, report the existing setup without claiming a new installation or verified startup integration. File presence and syntax do not prove runtime loading; installation is not a transaction.

Follow [Completion report](../SKILL.md#completion-report), suggesting a new shell to load the configuration. When appending to `~/.zshrc`, add: “The loader was added at the end of ~/.zshrc; you can move the whole block if you prefer a different loading order.” This is a completion hint, not an approval gate. On failure, identify exactly which planned files were installed or changed and the recovery options.
