# Practical shell-file edits

Treat mappings.sh as ordinary user configuration containing names, not passwords. Assist with a minimal, recoverable edit; this workflow does not guarantee transactional updates or enterprise filesystem security. Startup files may contain unrelated secrets, so keep file contents, diffs, backups, and raw diagnostics out of output.

## 1. Identify the file and usable edit method

- Read the existing bytes without executing them. Resolve links to an existing regular file in the expected configuration scope and preserve the links. Missing managed files during add, broken/cyclic links, non-file targets, unreadable files, or unclear destinations stop the edit. Installation alone creates missing managed files.
- Check actual access, not exact permission bits. Different ownership or unusually permissive access is a brief warning, not a confirmation gate, when the requested edit is possible. Keep existing permissions and ownership; use no automatic sudo, chown, or permission repair. New directories use mode 700 and new files mode 600.
- Prefer an in-place edit when the existing file is writable: it naturally retains ownership, permissions, ACLs, hard links, and extended attributes. A writable file does not require a writable parent. Use same-filesystem replacement when appropriate and when the parent permits it; avoid replacement that would change ownership, break hard-link behavior, or discard meaningful access controls. Ask only when no usable method exists or the intended target is ambiguous.
- Ignore com.apple.provenance entirely. Its presence, change, or loss has no bearing on this operation. Do not inventory extended attributes or require exact metadata reproduction. ACLs and flags are relevant only when they affect access or the chosen edit method; their mere presence is not a blocker.

## 2. Prepare and validate

- Keep a collision-safe backup outside version control in a user-owned mode-700 directory, with the backup created mode 600. Retain and report its path. No recovery manifest or exhaustive metadata inventory is required.
- Prepare the minimal edit in a private candidate, preserving unrelated bytes and startup-file line endings. Managed mappings use LF; stop on CRLF rather than converting existing mappings implicitly. Keep candidate files mode 600. Never copy a Keychain password into configuration.
- Validate canonical mapping structure without execution. Check managed-file shell syntax using /bin/sh -n, /bin/zsh -f -n, and /bin/bash --noprofile --norc -n. Validate startup files using their selected shell. Suppress raw diagnostics; report a failure status only.

## 3. Apply and verify

- Immediately before writing, confirm that the original content and resolved target identity/link destination still match what was read. Stop rather than overwriting a concurrent content edit or a changed destination. Metadata-only changes such as provenance do not constitute a conflict.
- Apply using the chosen method. In-place writing preserves the inode and access metadata but is not atomic; atomic replacement is an option, not a requirement. For a newly created file, use an exclusive no-overwrite operation.
- Verify installed content and syntax without sourcing. Check permissions or ownership only where the chosen method could change them; no exhaustive metadata comparison is needed.

## 4. Handle failures

Leave the original untouched when preparation fails. If writing or verification fails, restore from the backup only when the target still belongs to this operation and no subsequent user edit would be overwritten. Verify any claimed recovery. Otherwise report the actual state and backup path. Clean up known temporary candidates, retain backups, and distinguish configuration results from Keychain results. Ordinary checks reduce obvious mistakes; they are not a lock or transaction guarantee.
