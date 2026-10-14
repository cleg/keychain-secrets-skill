# Install managed shell loading

Use this workflow on an explicit install/init request. Installation creates no Keychain items, collects no secret, and does not automatically resume an earlier add. Add is a separate operation that requires existing managed files.

## 1. Plan read-only

Read CONFIG.md and SHELL-EDIT.md. Verify the installed config-preflight.js digest from SKILL.md and invoke `install` without additional arguments. The helper returns installation flags, the selected startup path, and file metadata baselines. It never writes files, executes startup configuration, or accesses Keychain.

Continue on `ready` and carry out the plan without another placement confirmation. An explicit install request authorizes the default integration. Informational warnings do not require approval. For blocked/error results, resolve the concrete condition before editing: access failures, invalid syntax, custom ZDOTDIR, duplicate/unfamiliar integration, a block embedded in compound code, or ambiguous bash startup arrangements. A changed installed loader is an upgrade decision, not permission to overwrite it.

For zsh, append the block to the end of `~/.zshrc`, on a new line at top level, preserving all existing bytes. Ordinary `source`, `.` and `eval` initialization (including Homebrew, plugins, and environment managers) is expected configuration: leave it untouched, without executing it, following its includes, or requesting a placement decision. Validate syntax before and after the edit. Custom ZDOTDIR remains a concrete path ambiguity; resolve it rather than silently editing an inactive file.

Preserve an existing recognized integration rather than adding a duplicate. For bash, reuse established integration or an unambiguous login-to-interactive arrangement; choose one startup file and preserve the others. If all installation flags are false, report that the managed setup already exists and make no changes. File presence and syntax checks do not establish runtime loading.

## 2. Install the plan

Follow SHELL-EDIT.md for every file edit, including backups, parent/link safety, immediate conflict checks, practical access preservation, syntax validation, and recovery. Preflight baselines are not locks.

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

Apply the default placement above; preserve existing integration rather than adding a duplicate. Validate managed files with /bin/sh -n and /bin/zsh -f -n, plus bash validation when relevant. Validate the startup file with its selected shell, suppressing raw diagnostics. Validate canonical mapping format as well. Never source files as agent verification.

## 3. Complete

Verify installed content and syntax under SHELL-EDIT.md. Report changed files and retained backup paths; suggest a new shell for the user to load the configuration. When appending to `~/.zshrc`, add a brief hint: “The loader was added at the end of ~/.zshrc; you can move the whole block if you prefer a different loading order.” This is a completion hint, not an approval gate. If any step fails, report exactly which files were installed or changed and the recovery options. Keep Keychain untouched. Installation is not a transaction and file presence does not prove that every shell will load the mappings.
