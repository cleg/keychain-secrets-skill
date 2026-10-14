# Source from shell startup; shared macOS zsh/bash loader.
# Attribute inspection uses shell-specific builtins/parameter expansion.
# This file and mappings.sh are trusted executable configuration, not a sandbox.

# Runtime intentionally reads a password, unlike management metadata checks.
# It uses the current search list, not the helper's unique-item ownership check;
# resolve duplicate items before relying on which credential will be loaded.
_keychain_env_read() (
    # A subshell keeps the password and temporary state out of the parent shell.
    if _keychain_env_value=$(command security find-generic-password \
        -a "$2" -s "$1" -w 2>/dev/null); then
        printf '%s' "$_keychain_env_value"
    else
        printf 'Warning: Keychain service %s is unavailable; exporting an empty value.\n' "$1" >&2
    fi
)

_keychain_env_plain_target() (
    # Inspect attributes only; never emit or evaluate an existing variable value.
    # Refuse unfamiliar attributes rather than changing the user's declaration.
    # Probe shell-specific builtins, not spoofable inherited version variables.
    # Option changes are confined to the probe subshell.
    if (builtin shopt -s nullglob) 2>/dev/null; then
        _keychain_env_attributes=$(builtin declare -p "$1" 2>/dev/null | {
            IFS=' ' read -r _keychain_env_builtin _keychain_env_flags _keychain_env_rest &&
                printf '%s' "$_keychain_env_flags"
        })
        case "$_keychain_env_attributes" in
            ''|--|-x) return 0 ;;
            *) return 1 ;;
        esac
    elif (builtin setopt LOCAL_OPTIONS) 2>/dev/null; then
        case "${(tP)1}" in
            ''|scalar|scalar-export) return 0 ;;
            *) return 1 ;;
        esac
    else
        # Only bash and zsh are supported; fail closed in other shells.
        return 1
    fi
)

keychain_env() {
    if [ "$#" -lt 2 ] || [ "$#" -gt 3 ]; then
        printf '%s\n' 'Warning: invalid keychain_env argument count; mapping skipped.' >&2
        return 0
    fi
    # Bash's plain scalar attributes do not identify every special variable.
    # Reject prompt/trace hooks and shell controls even when unset or exported.
    case "$1" in
        ''|[0-9]*|*[!a-zA-Z0-9_]*|_keychain_env_*|HOME|USER|PATH|IFS|ENV|BASH_*|BASHOPTS|SHELLOPTS|ZSH_VERSION|ZDOTDIR|CDPATH|GLOBIGNORE|TIMEFORMAT|TIMEFMT|HISTTIMEFORMAT|HISTFILE|HISTSIZE|HISTFILESIZE|HISTCONTROL|HISTIGNORE|PS[0-4]|PROMPT_COMMAND|PROMPT|PROMPT2|RPROMPT|RPS1|RPS2|UID|EUID|PPID|PID|RANDOM|SRANDOM|SECONDS|LINENO|SHLVL|PWD|OLDPWD|OPTARG|OPTIND|REPLY|status|pipestatus|commands|functions|options|path|fpath|FPATH|MAIL|MAILPATH|LANG|LC_ALL|TERM|TMPDIR|LC_*|ZSH_*)
            printf '%s\n' 'Warning: invalid or reserved environment variable; mapping skipped.' >&2
            return 0 ;;
    esac
    if [ -z "$2" ] || [ -z "${3-${USER-}}" ]; then
        printf '%s\n' 'Warning: empty Keychain service or account; mapping skipped.' >&2
        return 0
    fi
    case "${_keychain_env_seen-}" in
        *"|$1|"*)
            printf 'Warning: duplicate Keychain mapping for %s; mapping skipped.\n' "$1" >&2
            return 0 ;;
    esac
    _keychain_env_seen="${_keychain_env_seen-}|$1|"
    if ! _keychain_env_plain_target "$1"; then
        printf 'Warning: cannot export Keychain variable %s with incompatible attributes; mapping skipped.\n' "$1" >&2
        return 0
    fi
    # zsh readonly assignment can abort the shell even inside an if.
    # Probe with no secret in a subshell before attempting the real assignment.
    if ! (export "$1=") 2>/dev/null; then
        printf 'Warning: cannot export Keychain variable %s; mapping skipped.\n' "$1" >&2
        return 0
    fi
    # A failed read emits no stdout, so this replaces an old value with empty text.
    # Command substitution removes trailing newlines; managed secrets are single-line.
    # One quoted assignment argument: neither the name nor value is evaluated.
    if export "$1=$(_keychain_env_read "$2" "${3-${USER-}}")" 2>/dev/null; then
        :
    else
        printf 'Warning: cannot export Keychain variable %s.\n' "$1" >&2
    fi
    return 0
}

# Reset duplicate tracking on every reload; the first declaration wins.
# Sourcing intentionally executes trusted configuration: it is not a parser.
_keychain_env_seen=''
if [ -r "$HOME/.config/keychain-env/mappings.sh" ]; then
    . "$HOME/.config/keychain-env/mappings.sh"
else
    printf '%s\n' 'Warning: Keychain mappings.sh is missing or unreadable.' >&2
fi
unset _keychain_env_seen
# Reloading init.sh reloads mappings. Do not use keychain_env outside mappings.sh.
