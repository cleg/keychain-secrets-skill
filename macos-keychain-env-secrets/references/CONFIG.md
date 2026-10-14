# Managed shell configuration

## Layout and trust

Use these fixed paths (do not implicitly switch to XDG_CONFIG_HOME):

- `~/.config/keychain-env/init.sh`: a copy of bundled `scripts/init.sh`.
- `~/.config/keychain-env/mappings.sh`: user-owned Keychain mapping declarations.

Both files are sourced shell code, but canonical mappings contain only names, not secret values. Create directories mode 700 and files mode 600. Existing ownership or permissions outside these defaults produce informational warnings, not automatic refusal: proceed when readable and editable, retaining existing access semantics. Do not automatically change ownership or permissions. Follow SHELL-EDIT.md for links, practical edit methods, and recovery; ignore com.apple.provenance. Runtime does not enforce filesystem trust or guarantee protection against another local user modifying accessible configuration.
No Python, Ruby, Node, third-party packages, or developer tools are required. Runtime uses the system shell and `security`; Keychain management uses `store-secret.js`. The read-only `config-preflight.js` uses system JXA/Foundation for explicit installation planning, add configuration checks, and update mapping resolution; its invocation and integrity pin are in SKILL.md. It never sources configuration or calls Keychain. A successful preflight is not a lock: agents still edit configuration using SHELL-EDIT.md, including the immediate pre-installation conflict check. The runtime loader is not a general-purpose file editor.

## Canonical mapping format

Use LF line endings and one declaration per line, with literal, single-quoted arguments. CRLF mappings are rejected rather than normalized: sourcing them can append a carriage return to the final argument.

```sh
keychain_env 'OPENROUTER_API_KEY' 'openrouter-api-key'
keychain_env 'OTHER_TOKEN' 'other-service' 'explicit-account'
```

The optional third argument defaults to the current shell's `$USER`. Resolve it to the current macOS account before management operations; a changed/missing USER must not silently select another account. An explicit account is preserved exactly.

Blank lines and standalone `#` comments are allowed. No assignments, expansions, command substitutions, continuation lines, or other commands belong in the managed format. A literal apostrophe is represented using standard adjacent shell quoting: `'part'\''rest'`. Agents must parse this recognized grammar without executing it; syntax validation alone is not format validation. Mark everything else unresolved and ask before editing. Never guess an account/service from dynamic code.

Variable names must match `^[A-Za-z_][A-Za-z0-9_]*$`; the `_keychain_env_` prefix is reserved. Do not target shell-control variables (for example HOME, USER, PATH, IFS, ENV, BASH_ENV, SHELLOPTS, ZDOTDIR) or special/readonly variables; ask for an ordinary credential variable instead. Runtime explicitly reserves `TIMEFORMAT`, `TIMEFMT`, `ZSH_VERSION`, `BASH_*`, BASHOPTS, CDPATH, GLOBIGNORE, HISTTIMEFORMAT, HISTFILE, HISTSIZE, HISTFILESIZE, HISTCONTROL, HISTIGNORE, PS0–PS4, PROMPT_COMMAND, PROMPT, PROMPT2, RPROMPT, RPS1, and RPS2 in addition to the core controls: plain scalar attributes alone cannot identify every special Bash variable. Prompt/trace hooks and history controls must never receive credentials. In particular, Bash can print HISTTIMEFORMAT through `history`, and HISTFILE controls the history output path. This list is defense in depth, not an exhaustive inventory of shell-specific special names. Services and accounts are non-empty literal text without ASCII control characters (U+0000–U+001F) or DEL (U+007F), including tabs, CR, LF, and NUL. Credential targets must be unset or ordinary scalar variables with no attributes except export. Integer, array, nameref, case-conversion, readonly, special, and other attributed targets are unsupported; do not silently remove their attributes. Validate these constraints before writing; runtime checks are defense in depth, not a complete validator.

Each variable has exactly one declaration. Different variables may share an account/service; deletion must check all declarations and relevant legacy startup mappings read-only for dependencies. Legacy code is not edited or migrated implicitly; shared or unresolved references block item deletion. Runtime skips a duplicate variable with a warning (first declaration wins); agents reject duplicates before any mutation. Malformed or unresolved configuration must not trigger partial guessed edits.

## Installation boundary

The explicit `install` operation owns initial managed-file setup and shell startup integration; follow [INSTALL.md](INSTALL.md). It creates no Keychain items. Loader upgrades and legacy migrations require separately resolved scope rather than silent replacement.

Add requires both managed files to exist and treats their presence as an installed setup. It validates managed-file safety and mappings, but never reads or changes startup files, discovers the login shell, checks ZDOTDIR, or requires the installed loader to equal the current bundle. Missing files stop add with `installation_required` and guidance to run install or inspect shell integration manually. Existing files do not prove that loading works; troubleshooting is separate from add. Startup-variable assignments are outside add's checks, while inherited credential values are allowed because loading deliberately replaces them; runtime target-attribute checks remain enforced.

## Runtime behavior

Source init.sh to load or reload all mappings. It uses no eval. A successful read into an ordinary scalar replaces the inherited environment value, preserving spaces and Unicode. Before reading Keychain, the loader checks target attributes using shell-specific introspection in a subshell. Unsupported targets warn and skip without changing their attributes or existing values. The shared loader supports macOS bash and zsh, not arbitrary POSIX shells; its zsh-specific expansion is evaluated only in the zsh branch. Shell detection probes shell-specific builtins in a subshell instead of trusting inherited version variables; a spoofed ZSH_VERSION in bash cannot select the zsh branch. Read failure warns and exports an empty value. Duplicate/invalid declarations warn and skip; missing mappings.sh warns. Never print the captured value. Tracing shell startup can expose secrets and is prohibited for verification.

Runtime deliberately uses `security find-generic-password` with account/service and the current Keychain search list. It does not perform the native helper's uniqueness check: when multiple items match, it may load whichever item `security` selects. A successful runtime read does not establish unique identity. Management `check`, `update`, and `remove` still reject ambiguity. Resolve ambiguous items before relying on a credential; metadata-only `check` can identify this condition without reading its value.

Removing a declaration does not unset a value in an existing shell, even on reload. The user must unset that variable or close the shell; existing child processes retain their environment. Moving declarations into the managed file can change precedence relative to other startup statements; check placement during installation or migration.

## Agent operations

- **Install:** explicitly set up managed files and shell integration using INSTALL.md, without accessing Keychain.
- **Add:** require existing managed files; after native creation, add exactly one canonical declaration to mappings.sh. Leave the loader and startup files untouched.
- **Update:** resolve from mappings.sh and update Keychain only; no configuration backup/edit is needed.
- **Remove:** confirm declaration-only or item-deletion scope after shared-item checks. Declaration-only removal edits just the safely identified declaration with recovery data; it does not invoke native check/delete or change Keychain, even when the item is shared. For item deletion, require a verified native `present` check before file edits, remove the declaration when one exists, then delete the unique Keychain item. Ambiguity/error stops this scope without silently switching to declaration-only. Retain loader, files, and startup block even when no mappings remain.
- **List/check:** read mappings.sh without executing it. Missing configuration means no managed mappings, not an instruction to install anything. Inspect startup integration only when diagnosing it. Unresolved code is reported separately; these operations must not edit files.

Keep completion reports brief: result, target, any changed file and backup location, and necessary next action. Explain observed failures or partial completion, not routine implementation caveats. Show only mapping metadata, safe statuses, changed file paths, and recovery locations. Never display configuration contents, diffs, backups, or raw shell diagnostics.
