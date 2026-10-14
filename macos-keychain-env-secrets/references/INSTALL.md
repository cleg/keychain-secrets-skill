# Install managed shell loading

Use this workflow on an explicit install/init request. Installation creates no Keychain items, collects no secret, and does not automatically resume an earlier add. Add is a separate operation that requires existing managed files.

## 1. Plan read-only

Read [CONFIG.md](CONFIG.md) and [SHELL-EDIT.md](SHELL-EDIT.md). Verify `config-preflight.js` under [Helper integrity](../SKILL.md#helper-integrity) and invoke `install` without additional arguments. Apply the [configuration helper contract](../SKILL.md#read-only-configuration-helper-contract).

**Continue only on `ready`**, using its installation flags and selected startup path. An explicit install request authorizes the default integration without another placement confirmation. For blocked/error results, resolve the concrete condition before editing: access failures, invalid syntax, custom ZDOTDIR, duplicate/unfamiliar integration, a block embedded in compound code, or ambiguous bash startup arrangements. A changed installed loader is an upgrade decision, not permission to overwrite it.

For zsh, append the block to the end of `~/.zshrc`, on a new line at top level, preserving all existing bytes. Ordinary `source`, `.` and `eval` initialization (including Homebrew, plugins, and environment managers) is expected configuration: leave it untouched, without executing it, following its includes, or requesting a placement decision. Validate syntax before and after the edit. Custom ZDOTDIR remains a concrete path ambiguity; resolve it rather than silently editing an inactive file.

Preserve an existing recognized integration rather than adding a duplicate. For bash, reuse established integration or an unambiguous login-to-interactive arrangement; choose one startup file and preserve the others. If all installation flags are false, report that the managed setup already exists and make no changes. File presence and syntax checks do not establish runtime loading.

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

Validate managed files, canonical mappings, and the selected startup file under SHELL-EDIT.md without sourcing them.

## 3. Complete

**Complete when:** both managed files exist, the selected startup file has exactly one recognized integration, every planned edit meets SHELL-EDIT.md's completion criterion, and Keychain was left untouched. When no edits were planned, report the existing setup without claiming a new installation. File presence and syntax do not prove runtime loading; installation is not a transaction.

Follow [Completion report](../SKILL.md#completion-report), suggesting a new shell to load the configuration. When appending to `~/.zshrc`, add: “The loader was added at the end of ~/.zshrc; you can move the whole block if you prefer a different loading order.” This is a completion hint, not an approval gate. On failure, identify exactly which planned files were installed or changed and the recovery options.
