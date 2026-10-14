#!/bin/sh
# Isolated runtime checks: synthetic values, no Keychain or real startup files.
set -eu
root=$(CDPATH='' cd -- "$(dirname -- "$0")/.." && pwd)
tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT HUP INT TERM
mkdir -p "$tmp/home/.config/keychain-env" "$tmp/bin"
cp "$root/macos-keychain-env-secrets/scripts/init.sh" "$tmp/home/.config/keychain-env/init.sh"
cat > "$tmp/bin/security" <<'MOCK'
#!/bin/sh
[ "$1" = find-generic-password ] && [ "$2" = -a ] && [ "$4" = -s ] && [ "$6" = -w ] || exit 90
printf '%s\t%s\n' "$3" "$5" >> "$MOCK_CALLS"
case "$5" in
    normal) printf '%s' '  synthetic token Ω  ' ;;
    explicit) [ "$3" = 'another account' ] || exit 91; printf '%s' 'synthetic second' ;;
    missing) exit 44 ;;
    duplicate) exit 92 ;;
    quoted) printf '%s' '$(not-executed); * "quoted"' ;;
    *) exit 93 ;;
esac
MOCK
chmod 700 "$tmp/bin/security"
cat > "$tmp/home/.config/keychain-env/mappings.sh" <<'MAPPINGS'
keychain_env 'ZSH_VERSION' 'forbidden'
keychain_env 'TEST_NORMAL' 'normal'
keychain_env 'TEST_EXPLICIT' 'explicit' 'another account'
keychain_env 'TEST_MISSING' 'missing'
keychain_env 'TEST_NORMAL' 'duplicate'
keychain_env 'bad-name' 'normal'
keychain_env '_keychain_env_value' 'normal'
keychain_env 'TEST_QUOTED' 'quoted'
keychain_env 'TEST_LOCKED' 'normal'
keychain_env 'TEST_INTEGER' 'normal'
keychain_env 'TEST_ARRAY' 'normal'
keychain_env 'TEST_UPPER' 'normal'
keychain_env 'TEST_LOWER' 'normal'
keychain_env 'TEST_REFERENCE' 'normal'
keychain_env 'PS1' 'forbidden'
keychain_env 'PS4' 'forbidden'
keychain_env 'PROMPT_COMMAND' 'forbidden'
keychain_env 'BASH_COMMAND' 'forbidden'
keychain_env 'BASH_ENV' 'forbidden'
keychain_env 'CDPATH' 'forbidden'
keychain_env 'GLOBIGNORE' 'forbidden'
keychain_env 'TIMEFORMAT' 'forbidden'
keychain_env 'TIMEFMT' 'forbidden'
keychain_env 'HISTTIMEFORMAT' 'forbidden'
keychain_env 'HISTFILE' 'forbidden'
keychain_env 'HISTSIZE' 'forbidden'
keychain_env 'HISTFILESIZE' 'forbidden'
keychain_env 'HISTCONTROL' 'forbidden'
keychain_env 'HISTIGNORE' 'forbidden'
MAPPINGS
cat > "$tmp/check.sh" <<'CHECK'
set -eu
TEST_MISSING=inherited
TEST_NORMAL=inherited
export TEST_NORMAL
readonly TEST_LOCKED=old
TEST_REFERENT=old
PS1='synthetic prompt'
PS4='synthetic trace'
PROMPT_COMMAND='synthetic hook'
unset BASH_ENV CDPATH GLOBIGNORE HISTTIMEFORMAT HISTCONTROL HISTIGNORE
HISTFILE="$HOME/synthetic-history"
HISTSIZE=37
HISTFILESIZE=41
export HISTFILE HISTSIZE HISTFILESIZE
if [ -n "${ZSH_VERSION-}" ]; then
    typeset -i TEST_INTEGER=7
    typeset -a TEST_ARRAY=(old)
    typeset -u TEST_UPPER=OLD
    typeset -l TEST_LOWER=old
    readonly TEST_REFERENCE=old
else
    declare -i TEST_INTEGER=7
    declare -a TEST_ARRAY=(old)
    if [ "${BASH_VERSINFO[0]}" -ge 4 ]; then
        declare -u TEST_UPPER=OLD
        declare -l TEST_LOWER=old
    else
        readonly TEST_UPPER=OLD TEST_LOWER=old
    fi
    if [ "${BASH_VERSINFO[0]}" -gt 4 ] ||
       { [ "${BASH_VERSINFO[0]}" -eq 4 ] && [ "${BASH_VERSINFO[1]}" -ge 3 ]; }; then
        declare -n TEST_REFERENCE=TEST_REFERENT
    else
        readonly TEST_REFERENCE=old
    fi
fi
# Bash must ignore a spoofed/inherited zsh version. Refusing the mapping
# must also preserve the original version variable in either supported shell.
if [ -n "${BASH_VERSION-}" ]; then
    ZSH_VERSION='synthetic-inherited-version'
    export ZSH_VERSION
fi
TEST_VERSION_BEFORE=$ZSH_VERSION
. "$HOME/.config/keychain-env/init.sh"
[ "$ZSH_VERSION" = "$TEST_VERSION_BEFORE" ]
[ "$PS1" = 'synthetic prompt' ]
[ "$PS4" = 'synthetic trace' ]
[ "$PROMPT_COMMAND" = 'synthetic hook' ]
[ "${BASH_ENV-unset}" = unset ]
[ "${CDPATH-unset}" = unset ]
[ "${GLOBIGNORE-unset}" = unset ]
[ "${HISTTIMEFORMAT-unset}" = unset ]
[ "${HISTCONTROL-unset}" = unset ]
[ "${HISTIGNORE-unset}" = unset ]
[ "$HISTFILE" = "$HOME/synthetic-history" ]
[ "$HISTSIZE" = 37 ]
[ "$HISTFILESIZE" = 41 ]
# Repeat with an existing exported history format, not just an unset target.
HISTTIMEFORMAT='synthetic history format'
export HISTTIMEFORMAT
keychain_env 'HISTTIMEFORMAT' 'forbidden'
[ "$HISTTIMEFORMAT" = 'synthetic history format' ]
# BASH_COMMAND changes automatically in bash; assert it was not exported.
/bin/zsh -f -c '[ "${BASH_COMMAND-unset}" = unset ]'
[ "$TEST_INTEGER" = 7 ]
[ "${TEST_ARRAY[0]-${TEST_ARRAY[1]-}}" = old ]
[ "$TEST_UPPER" = OLD ]
[ "$TEST_LOWER" = old ]
[ "$TEST_REFERENCE" = old ]
[ "$TEST_REFERENT" = old ]
[ "$TEST_NORMAL" = '  synthetic token Ω  ' ]
[ "$TEST_LOCKED" = old ]
[ "$TEST_EXPLICIT" = 'synthetic second' ]
[ "$TEST_MISSING" = '' ]
[ "$TEST_QUOTED" = '$(not-executed); * "quoted"' ]
[ "${_keychain_env_value-unset}" = unset ]
[ "${_keychain_env_seen-unset}" = unset ]
# Child process inheritance without printing any value.
/bin/sh -c '[ "$TEST_NORMAL" = "  synthetic token Ω  " ]'
. "$HOME/.config/keychain-env/init.sh"
# Removing a declaration and reloading does not unset an existing value.
printf '%s\n' '# empty mappings' > "$HOME/.config/keychain-env/mappings.sh"
. "$HOME/.config/keychain-env/init.sh"
[ "$TEST_NORMAL" = '  synthetic token Ω  ' ]
rm "$HOME/.config/keychain-env/mappings.sh"
. "$HOME/.config/keychain-env/init.sh"
CHECK
for shell in /bin/sh /bin/bash /bin/zsh; do
    # Restore mappings for each shell; keep test diagnostics private.
    if [ ! -f "$tmp/original" ]; then cp "$tmp/home/.config/keychain-env/mappings.sh" "$tmp/original"; fi
    cp "$tmp/original" "$tmp/home/.config/keychain-env/mappings.sh"
    : > "$tmp/calls"
    if ! HOME="$tmp/home" USER='synthetic-user' PATH="$tmp/bin:/usr/bin:/bin" MOCK_CALLS="$tmp/calls" \
        "$shell" -f "$tmp/check.sh" > "$tmp/stdout" 2> "$tmp/stderr"; then
        printf 'FAIL: %s runtime checks (diagnostics suppressed)\n' "$shell" >&2
        exit 1
    fi
    [ ! -s "$tmp/stdout" ]
    [ "$(wc -l < "$tmp/calls" | tr -d ' ')" = 8 ]
    if grep -q 'forbidden' "$tmp/calls"; then
        printf 'FAIL: shell-control target triggered a credential read\n' >&2
        exit 1
    fi
    grep -q 'cannot export Keychain variable' "$tmp/stderr"
    grep -q 'duplicate Keychain mapping' "$tmp/stderr"
    grep -q 'invalid or reserved' "$tmp/stderr"
    grep -q 'exporting an empty value' "$tmp/stderr"
    grep -q 'missing or unreadable' "$tmp/stderr"
    printf 'PASS: %s loader behavior\n' "$shell"
done

# Compare name validation only: public candidates, no real configuration or reads.
# Stop accepted names at the attribute probe so shell-special variables stay intact.
cat > "$tmp/name-parity.js" <<'PARITY_JS'
ObjC.import('Foundation');
function run(argv) {
    var source = ObjC.unwrap($.NSString.stringWithContentsOfFileEncodingError($(argv[0]), $.NSUTF8StringEncoding, Ref()));
    var start = source.indexOf('function validVariable(');
    var end = source.indexOf('\nfunction ', start);
    if (start < 0 || end < 0) throw new Error('Cannot extract preflight name validation');
    eval(source.slice(start, end));
    var permitted = ['TOKEN', 'API_KEY', '_TOKEN', '_', 'token2', 'PS5', 'PS10',
        'BASH', 'bash_TEST', 'LC', 'lc_TEST', 'ZSH', 'zsh_TEST', '_keychain_env',
        '_KEYCHAIN_ENV_TOKEN', 'HOME_TOKEN', 'STATUS', 'Path'];
    var denied = ('HOME USER PATH IFS ENV BASHOPTS SHELLOPTS ZSH_VERSION ZDOTDIR CDPATH ' +
        'GLOBIGNORE TIMEFORMAT TIMEFMT HISTTIMEFORMAT HISTFILE HISTSIZE HISTFILESIZE ' +
        'HISTCONTROL HISTIGNORE PS0 PS1 PS2 PS3 PS4 PROMPT_COMMAND PROMPT PROMPT2 RPROMPT RPS1 RPS2 ' +
        'UID EUID PPID PID RANDOM SRANDOM SECONDS LINENO SHLVL PWD OLDPWD OPTARG OPTIND REPLY ' +
        'status pipestatus commands functions options path fpath FPATH MAIL MAILPATH LANG LC_ALL TERM TMPDIR ' +
        'BASH_ BASH_TEST _keychain_env_ _keychain_env_TEST LC_ LC_TEST ZSH_ ZSH_TEST').split(' ');
    denied = denied.concat(['', '2TOKEN', 'bad-name', 'bad.name', 'bad name', 'Ω_TOKEN', 'TOKEN;']);
    var rows = [];
    [[true, permitted], [false, denied]].forEach(function (group) {
        group[1].forEach(function (name) {
            if (validVariable(name) !== group[0]) throw new Error('Preflight name rule mismatch: ' + name);
            rows.push((group[0] ? 'allow' : 'deny') + '|' + name);
        });
    });
    return rows.join('\n');
}
PARITY_JS
/usr/bin/osascript -l JavaScript "$tmp/name-parity.js" \
    "$root/macos-keychain-env-secrets/scripts/config-preflight.js" > "$tmp/name-candidates"
printf '%s\n' '# empty synthetic mappings' > "$tmp/home/.config/keychain-env/mappings.sh"
cat > "$tmp/name-parity.sh" <<'PARITY_SH'
set -eu
. "$HOME/.config/keychain-env/init.sh"
_keychain_env_plain_target() {
    printf '%s\n' "$1" > "$PARITY_PROBE"
    return 1
}
_keychain_env_read() {
    printf '%s\n' 'FAIL: name validation attempted a credential read' >&2
    exit 99
}
while IFS='|' read -r expected candidate; do
    : > "$PARITY_PROBE"
    # Isolate duplicate tracking and any unexpected assignment from later cases.
    (keychain_env "$candidate" 'synthetic-service' 'synthetic-account') 2> "$PARITY_DIAGNOSTIC"
    if [ "$expected" = allow ]; then
        [ "$(cat "$PARITY_PROBE")" = "$candidate" ] || exit 1
        if grep -q 'invalid or reserved' "$PARITY_DIAGNOSTIC"; then exit 1; fi
    else
        [ ! -s "$PARITY_PROBE" ] || exit 1
        grep -q 'invalid or reserved' "$PARITY_DIAGNOSTIC" || exit 1
    fi
done < "$PARITY_CANDIDATES"
PARITY_SH
for shell in /bin/sh /bin/bash /bin/zsh; do
    if ! HOME="$tmp/home" USER='synthetic-user' PATH="$tmp/bin:/usr/bin:/bin" \
        PARITY_CANDIDATES="$tmp/name-candidates" PARITY_PROBE="$tmp/name-probe" \
        PARITY_DIAGNOSTIC="$tmp/name-diagnostic" \
        "$shell" -f "$tmp/name-parity.sh" > "$tmp/stdout" 2> "$tmp/stderr"; then
        printf 'FAIL: %s runtime/preflight variable-name parity\n' "$shell" >&2
        exit 1
    fi
    [ ! -s "$tmp/stdout" ]
    printf 'PASS: %s runtime/preflight variable-name parity\n' "$shell"
done
