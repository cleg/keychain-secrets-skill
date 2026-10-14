# macOS Keychain Environment Secrets Skill

![A Keychain key connecting AI services and shell workflows](header.jpg)

An agent-independent skill for managing API secrets stored as macOS Keychain generic-password items and exposed to shell programs through environment variables configured under `~/.config/keychain-env`, with a one-time shell startup integration.

This is a convenience layer around a familiar local shell workflow, not a production secrets-management platform. Its guiding principle is **automate the expected flow; pause for concrete unexpected conditions**. Routine checks happen silently. Mapping files contain names, not passwords, and are ordinary user configuration. Access/ownership concerns can be informational warnings; questions are reserved for missing information, ambiguous targets, concrete conflicts, or failed/uncertain operations. The workflow avoids obvious mistakes rather than guaranteeing enterprise filesystem security.

The skill separates installation from secret management:

- **install** (or init) — set up managed files and one-time shell integration without creating a secret.
- **add** — require an existing managed setup, create a Keychain item, and add an environment-variable mapping.
- **remove** — remove a mapping and, when safe, its Keychain item.
- **update** — replace the Keychain password without changing configuration.
- **list** — show recognized mappings without secret values.
- **check** — identify mappings whose Keychain items are missing or cannot be verified.

## The secret stays out of the agent's context

**You enter the secret in a native macOS window, not in chat. The bundled helper stores it in Keychain and returns only a JSON status and, on native failure, a numeric error code. The secret value is not returned to the agent.**

New items are created by `/usr/bin/security add-generic-password` using its default creator access policy, without explicit trusted-application flags. The helper invokes it directly through `NSTask` with an argument array, never a shell. Add omits `-U`; update uses `-U` after unique metadata checks, with the existing item’s owning Keychain explicitly selected. Unresolved ownership stops the write. Updates do not explicitly configure trusted applications. The accepted CLI upsert race can recreate an item removed after the final check; update is Keychain-scoped, not persistent-identity-scoped. The system utility documents that the creating application is trusted by default; other processes running as you may invoke that tool to retrieve an item. Existing access policies and locked Keychains may still require system authorization; prompt-free operation is not guaranteed.

The helper uses hidden **Secret** and **Retype secret** fields and the system `osascript` runtime with AppKit/Security.framework. There is no custom binary, compilation, or package dependency. The agent supplies only non-secret operation, service, and account names. **Add/update internally pass the entered value as the CLI's `-w` argument: it is unavoidably visible to local process-argument inspection while that subprocess runs.** This is an intentional implementation trade-off, documented here rather than gated by an extra per-operation confirmation. A clear add/update request proceeds through preflight checks directly to native secure entry; the agent does not separately ask you to accept subprocess-argument exposure or normal environment inheritance. Ambiguous targets, concrete conflicts, and deletion still require clarification or confirmation. The value is not sent in agent/tool-call arguments, logs, an environment variable, or a temporary file. Child stdin/stdout/stderr go to the null device; raw CLI diagnostics and exceptions are never returned. CLI nonzero exits map to a generic safe helper error (`-99902`), not guessed native error codes.

This is a workflow guarantee, not a sandbox: an agent with local process/file access may still have capabilities to read credentials, and exported secrets are available to child processes. The skill prohibits credential inspection and secret-bearing diagnostics. Secret values necessarily exist in the helper's memory; JavaScript cannot guarantee memory erasure. A compromised local account is outside the protection offered here.

## How it works

The agent invokes the bundled helper through `osascript`, passing only the operation, service name, and account. For add/update, the helper uses JXA (JavaScript for Automation) and AppKit to show a native window with hidden **Secret** and **Retype secret** fields. You enter the value there, not in chat.

The helper then launches the system `/usr/bin/security` utility directly through `NSTask`, using an argument array rather than a shell command. The following examples show the equivalent command shapes; `VALUE` is a placeholder for the value collected inside the helper, not something the agent supplies or asks you to paste into a terminal:

```sh
# Add: insert a new item in the default Keychain.
/usr/bin/security add-generic-password \
  -a 'ACCOUNT' -s 'SERVICE' -w 'VALUE'

# Update: replace the value in the resolved owning Keychain.
/usr/bin/security add-generic-password \
  -a 'ACCOUNT' -s 'SERVICE' -w 'VALUE' \
  -U '/path/to/owning.keychain-db'

# Check: query metadata, without requesting the password.
/usr/bin/security find-generic-password \
  -a 'ACCOUNT' -s 'SERVICE' '/path/to/owning.keychain-db'

# Remove: delete the matching item in the resolved owning Keychain.
/usr/bin/security delete-generic-password \
  -a 'ACCOUNT' -s 'SERVICE' '/path/to/owning.keychain-db'
```

Before checking, updating, or removing an existing item, the helper uses Security.framework metadata queries to reject ambiguous matches and resolve the owning Keychain. Add/update use the default creator access policy without explicit trusted-application flags. Add omits `-U` to avoid overwriting an existing item; update includes it. Because `-U` is an upsert, it can recreate an item that disappears between resolution and writing.

Child stdin, stdout, and stderr are discarded. The agent receives only a JSON result such as `{"status":"updated"}` or a safe error code—not the password. The helper still passes the value internally in the subprocess argument array, with the local argv visibility described above. Later, the shell loader retrieves the stored value into the configured environment variable; the agent does not read it back for verification.

## Safety behavior

- **Add is insert-only:** an existing item is never silently overwritten.
- **Check reads metadata only:** exactly one match is `present`; missing, ambiguous, and native errors remain distinct. It does not verify password readability or API acceptance.
- **Update and remove are owning-Keychain scoped:** both reject ambiguous native metadata and resolve the unique item’s owning Keychain before CLI mutation. Check also runs metadata-only `security find-generic-password` in that Keychain, without `-w`/`-g`. Remove runs `security delete-generic-password` there; unresolved ownership stops. CLI I/O is discarded and failures map to generic helper error `-99902`, not guessed absence. Removal requires user confirmation and checks for other exports sharing the item.
- **The installed script is read-only during secret management:** the agent must not patch, instrument, regenerate, or replace it to make an operation work. Before each invocation, it must verify the SHA-256 pinned in [`SKILL.md`](macos-keychain-env-secrets/SKILL.md) and stop on mismatch without bypassing the check. The digest detects changed bytes, not malicious replacement of both script and instructions; it is not a signature or independent trust anchor. Verification has a check-to-execution race and does not sandbox the agent. Skill development updates the pin after review, separately from secret management.
- **Shell edits preserve recovery data:** the [editing procedure](macos-keychain-env-secrets/references/SHELL-EDIT.md) uses private backups, preserved link destinations, practical access preservation, content conflict checks, syntax validation without sourcing, and guarded recovery. Writable existing files can be edited in place; atomic replacement is optional. Provenance metadata is ignored. Keychain and file changes are not one transaction.
- **Fallbacks are deliberately limited:** an interactive Terminal can add a secret without exposing it to the agent. Update stops if native entry is unavailable; a hand-written `-U` command must not bypass the helper’s metadata and owning-Keychain checks. Check is inconclusive and deletion stops if the verified native helper is unavailable. Integrity failures never trigger a fallback. A generic native error or interruption is not evidence that entry is unavailable: recheck metadata and ask before retrying; fallback is permitted only when entry unavailability is established before a write, with a fresh missing-item check.

## Opinionated behavior

This skill deliberately keeps the environment variable exported when Keychain reading fails. The shell prints a warning and sets the variable to an empty value, allowing startup and subsequent commands to continue. An empty value may replace one inherited from an earlier process; this is part of the chosen behavior. Commands that use the variable decide for themselves how to handle an empty credential.

## Installation

Install the skill in the current project with the [skills CLI](https://github.com/vercel-labs/skills):

```bash
npx skills add cleg/keychain-secrets-skill --skill macos-keychain-env-secrets
```

Add `-g` to install it for all your projects. For a manual installation, place or symlink the [`macos-keychain-env-secrets`](macos-keychain-env-secrets) directory into your agent's skills directory. The skill contains agent-independent instructions and an inspectable JXA script and shared bash/zsh shell loader. Keep the `scripts/` and `references/` directories alongside `SKILL.md`. The [shell-file editing procedure](macos-keychain-env-secrets/references/SHELL-EDIT.md) covers private backups, expected symlink resolution, practical access preservation, content conflict detection, and recovery. Routine edits do not require separate recovery manifests; unclear link destinations and actual access failures need resolution; routine metadata differences do not interrupt the flow.

## Set up shell loading

After installing the skill, explicitly ask your agent to run its `install` operation. This creates the managed files and establishes shell loading without collecting or storing a secret. Initial installation owns shell integration; add never performs setup automatically. Both managed files mark an existing setup, so repeat installation does not inspect or repair startup integration. For initial zsh setup, an explicit install request autonomously appends the loader block to the end of `~/.zshrc`, preserving ordinary `source`/`eval` initialization. This assumes the file normally runs from beginning to end. If you have custom control flow, early returns, or other unusual startup logic, review the placement manually; you can move the whole integration block wherever it fits your setup. Completion reminds you that the block was added at the end and can be moved. Concrete file conflicts, invalid syntax, an inherited non-default ZDOTDIR during initial setup, and ambiguous bash startup arrangements still need resolution. Startup troubleshooting is a separate request. See the [install workflow](macos-keychain-env-secrets/references/INSTALL.md).

## Runtime configuration

The agent installs two private, user-owned files:

```text
~/.config/keychain-env/
  init.sh       # bundled runtime loader
  mappings.sh   # literal mapping declarations; no secret values
```

Mappings use this format, with an optional explicit account (otherwise `$USER`):

```sh
keychain_env 'OPENROUTER_API_KEY' 'openrouter-api-key'
keychain_env 'OTHER_TOKEN' 'other-service' 'explicit-account'
```

An explicit install creates a one-time startup block that sources init.sh. Add requires both managed files to exist and assumes shell integration is installed; it never inspects or changes startup files, discovers the login shell, checks ZDOTDIR, or requires the loader to equal the current bundle. File presence is not proof of working shell loading. Missing files produce `installation_required` with missing paths and guidance to run install or check shell integration manually; no secret is created. Routine add/remove edits only mappings.sh; updates change only Keychain. Both files are trusted executable shell code, not passive data. No eval is used by the loader. The bundled read-only `scripts/config-preflight.js` plans explicit installation and inspects add configuration in one invocation, replacing agent-generated inspection scripts; `resolve-update` resolves an existing variable mapping without startup or writable-file checks. It uses system JXA/Foundation and returns safe JSON metadata/status, never configuration contents or secret values. New directories use mode 700 and new files mode 600; existing modes are retained. No Python, Ruby, Node, package installation, or developer tools are required at runtime.

Add follows the dedicated [add procedure](macos-keychain-env-secrets/references/ADD.md): require existing managed files, configuration preflight, native creation, then a guarded mapping edit. Managed-file readability, syntax, canonical declarations, duplicate mappings, and editability remain checked. Different ownership, non-default permissions, and hard links return informational warnings when an appropriate edit method exists. Existing inherited credential values are allowed; no values are returned. ACLs and flags matter only when they affect access or editing, and com.apple.provenance is ignored. Startup assignments and integration are intentionally outside add preflight; runtime attribute checks still protect unsupported targets. Preflight is read-only, not a transaction or a guarantee about arbitrary startup code; file identity and content must still be rechecked immediately before edits. Update resolves its target and invokes the native helper directly, leaving files untouched. Neither normal add nor update needs a separate Keychain `check` call: `store-secret.js` already performs its own metadata preflight before opening secure entry and checks the target again before writing. Explicit `check` remains available for diagnostics and uncertain outcomes. Both installed helpers are integrity-checked before invocation.

Managed mappings use LF line endings; preflight rejects CRLF rather than resolving names differently from the shell. Install checks editability only for files it changes, so existing read-only mappings can be reused. File inspection is bounded at 1 MiB; oversized files return `inspection_limit`. Syntax checks do not execute configuration or establish whether a startup block will be reached.

See [configuration specification](macos-keychain-env-secrets/references/CONFIG.md) for canonical quoting, duplicate handling, startup integration, accounts, and failure behavior. There is no automatic legacy migration. Existing user configuration can be moved as a separately authorized task. Removal does not unset values in running shells, even if the loader is reloaded.

## Limitations

- **macOS only:** requires the macOS `security` command and Keychain generic-password items. Native secure entry also requires a graphical session and system `osascript` with AppKit/Security frameworks. Check/remove do not open the helper's secret-entry window, but Security.framework may require system authorization or Keychain unlocking; headless completion is not guaranteed.
- **zsh and bash:** a shared loader with shell-specific attribute inspection is sourced from the selected startup file. Credential targets must be unset or ordinary scalar variables with no attributes except export; unsupported targets are skipped before Keychain access without changing existing values or attributes. The default is `~/.zshrc`; bash startup placement must be selected for the user's shell setup. Fish and other shells are not managed.
- `list` and `check` inspect only canonical `~/.config/keychain-env/mappings.sh` declarations, not all Keychain items. Dynamic or ambiguous managed mappings need manual review. Startup-code review belongs to explicit installation or troubleshooting, not routine add.
- `check` verifies unique metadata presence, not password readability or API acceptance. Ambiguous matches and access failures are distinct from missing items. If the native helper is unavailable, check is inconclusive and deletion stops rather than falling back to broad matching.
- **Runtime lookup:** the loader uses the item selected by `security` from the current Keychain search list, without enforcing uniqueness. Management operations reject ambiguous matches; resolve them before relying on runtime loading.
- **Concurrent changes:** CLI update/removal match account/service in the resolved Keychain, not persistent item identity. A replacement there after resolution can become the target; removal explicitly accepts this race. Replaced items or new matches in other Keychains are outside the workflow's guarantees; metadata checks and CLI writes are not atomic or a transactional uniqueness guarantee. CLI add writes to the default Keychain; preflight checks the search list. A concurrent match in another Keychain can still make the result ambiguous.
- **Metadata format:** service/account names must be non-empty and contain no ASCII control characters or DEL, including tabs.
- **Secret format:** non-empty single-line text; CR, LF, and NUL are rejected by native entry. Spaces and Unicode are not trimmed or normalized. Multiline/binary credentials are unsupported; existing values are not read for format validation.
- Exported secrets are inherited by child processes and may remain in already-running shells after an update. Start a new shell to load the updated value.
- The skill is guidance, not a transactional tool: Keychain changes and file edits can succeed or fail separately. Native secure entry keeps values out of agent/chat/logs, but add/update expose them in the local child process argv. If native entry is unavailable, add requires an interactive terminal and update stops. Secret values exist in process memory; JavaScript does not guarantee memory erasure.

## Verification

The existing macOS integration check mutates Keychain and is **opt-in**, not a routine verification step. Run it only with explicit authorization from the repository root:

```sh
osascript -l JavaScript tests/store-secret.js "$PWD/macos-keychain-env-secrets/scripts/store-secret.js"
```

The opt-in test creates one UUID-named disposable item with public synthetic data using the production add function. Its first password read immediately invokes `/usr/bin/security`, discards stdout/stderr, and asserts exit status only, without any prior read approval. It checks metadata presence and collision refusal; it does not inspect the value or run update. It exercises production check, removal, and repeated missing-item removal. Cleanup uses the same production removal with unique metadata and an explicitly resolved owning Keychain; no unscoped deletion is used. The result reports the disposable metadata and cleanup status, including leftovers if cleanup fails. No existing credentials or user shell configuration are accessed. System authorization is possible; do not approve a first-read prompt and then call that prompt-free proof. Actual modal entry/cancellation, retries, and keyboard navigation need a separately authorized GUI trial.

### Workflow evidence and limits

The current default-creator-access helper received a user-confirmed agent-driven add/update/remove trial on 2026-10-14, returning `created`, `updated`, and `deleted`. This is workflow evidence, not independent password readback or a guarantee of prompt-free operation. The author also confirmed shell loading after migration to the managed layout.

An earlier explicit-trust revision passed an authorized synthetic first-read test on an unlocked local setup, with output discarded and no prompt observed. That historical result does not establish first-read behavior for the current revision. System authorization remains possible.

Mocked and isolated tests cover transport, metadata refusal, configuration planning, and selected entry-point behavior. They do not establish full GUI interaction, arbitrary startup behavior, or agent compliance; native mutation and GUI trials remain separately authorized, opt-in work.

### Non-mutating checks

Pure validator tests cover CR/LF/NUL rejection, exact whitespace/Unicode comparisons, and every forbidden ASCII metadata control character. They evaluate only the production validation functions, without loading Security/AppKit, calling Keychain, or opening dialogs:

```sh
osascript -l JavaScript tests/validation.js "$PWD/macos-keychain-env-secrets/scripts/store-secret.js"
```

A mocked metadata-CLI contract test checks production check/remove, exact argument arrays without password flags, owning-Keychain scope, missing/ambiguous/access-error refusal, invalid path refusal, discarded I/O, and conservative CLI failure mapping. It makes no Keychain calls:

```sh
osascript -l JavaScript tests/metadata-cli.js "$PWD/macos-keychain-env-secrets/scripts/store-secret.js"
```

A mocked add/update-contract test exercises the production functions with a fake task: insert-only add, Keychain-scoped `-U` update, absence of explicit trust flags, exact Unicode/whitespace argument preservation, discarded I/O, collision/missing/ambiguity/access-error refusal, and conservative failure mapping. It makes no Keychain calls and does not establish prompt-free retrieval:

```sh
osascript -l JavaScript tests/write-cli.js "$PWD/macos-keychain-env-secrets/scripts/store-secret.js"
```

A mocked entry-point test verifies that direct add/update calls run their internal metadata preflight before opening native entry, and refuse missing/collision/ambiguous/error states as appropriate. It also checks write-result propagation and cancellation with mocked fields. It makes no Keychain calls or GUI requests:

```sh
osascript -l JavaScript tests/write-entry.js "$PWD/macos-keychain-env-secrets/scripts/store-secret.js"
```

The read-only configuration helper has isolated temporary-filesystem tests for install planning, startup-independent add preflight, missing-file diagnostics, update mapping resolution, warning-only ownership/permission differences, inherited-value acceptance, ignored provenance, in-place versus replacement edit planning, CRLF refusal, no-op installs with read-only/immutable mappings, and initial end-of-file startup placement; these never use the real shell configuration or Keychain:

```sh
osascript -l JavaScript tests/config-preflight.js "$PWD/macos-keychain-env-secrets/scripts/config-preflight.js"
```

A read-only native path test substitutes a synthetic item reference and uses the default Keychain reference only to exercise the real `SecKeychainGetPath` buffer bridge. It checks path/reference error refusal, never queries items or reads passwords, and does not validate native item-to-Keychain resolution or writes:

```sh
osascript -l JavaScript tests/keychain-path.js "$PWD/macos-keychain-env-secrets/scripts/store-secret.js"
```

An optional development-only Python 3 check compares production metadata attribute keys and query/reference literals with the installed Security.framework, without Keychain calls. Python is not required at runtime:

```sh
python3 tests/security-constants.py "$PWD/macos-keychain-env-secrets/scripts/store-secret.js"
```

The shell loader has isolated tests with a fake `security` command and a temporary HOME. They include prompt/trace/history/control-variable and ZSH_VERSION refusal, shell detection despite a spoofed inherited version variable, unchanged existing targets, and absence of credential reads for refused targets. They also compare runtime and preflight variable-name rules, including reserved names, prefixes, and allowed boundary cases. They do not access Keychain or the user's configuration:

```sh
/bin/sh tests/shell-loader.sh
```
