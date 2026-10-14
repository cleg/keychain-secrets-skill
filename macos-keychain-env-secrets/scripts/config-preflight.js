// Read-only configuration preflight. No Keychain access, shell sourcing, or writes.
// osascript -l JavaScript /absolute/path/config-preflight.js install
// osascript -l JavaScript /absolute/path/config-preflight.js add VARIABLE SERVICE [ACCOUNT]
// osascript -l JavaScript /absolute/path/config-preflight.js resolve-update VARIABLE
ObjC.import('Foundation');
ObjC.bindFunction('getuid', ['unsigned int', []]);
// Bound file inspection; this helper plans changes but never applies them.
var MAX_BYTES = 1048576;
// -c text shares macOS ARG_MAX with arguments/environment. Keep fragments
// comfortably below that limit; full-file syntax checks still use syntax(path).
var MAX_SYNTAX_TEXT_BYTES = 65536;
var STARTUP_BLOCK = "# Keychain environment configuration\n" +
    'if [ -r "$HOME/.config/keychain-env/init.sh" ]; then\n' +
    '    . "$HOME/.config/keychain-env/init.sh"\nelse\n' +
    "    printf '%s\\n' 'Warning: Keychain environment init.sh is missing or unreadable.' >&2\nfi";

function stop(reason, status) {
    throw { preflightReason: reason, preflightStatus: status || 'blocked' };
}

function validMetadata(value) {
    return typeof value === 'string' && value.length > 0 && !/[\x00-\x1f\x7f]/.test(value);
}

function validVariable(value) {
    return /^[A-Za-z_][A-Za-z0-9_]*$/.test(value) &&
        !/^(_keychain_env_|BASH_)/.test(value) &&
        !/^(HOME|USER|PATH|IFS|ENV|BASHOPTS|SHELLOPTS|ZSH_VERSION|ZDOTDIR|CDPATH|GLOBIGNORE|TIMEFORMAT|TIMEFMT|HISTTIMEFORMAT|HISTFILE|HISTSIZE|HISTFILESIZE|HISTCONTROL|HISTIGNORE|PS[0-4]|PROMPT_COMMAND|PROMPT|PROMPT2|RPROMPT|RPS1|RPS2|UID|EUID|PPID|PID|RANDOM|SRANDOM|SECONDS|LINENO|SHLVL|PWD|OLDPWD|OPTARG|OPTIND|REPLY|status|pipestatus|commands|functions|options|path|fpath|FPATH|MAIL|MAILPATH|LANG|LC_ALL|TERM|TMPDIR)$/.test(value) &&
        !/^(LC_|ZSH_)/.test(value);
}

function parseMappingLine(line) {
    // Parse the small literal mapping grammar rather than eval/source shell code.
    // Shell syntax validity alone would still admit commands and expansions.
    if (/^[ \t]*(#.*)?$/.test(line)) return null;
    var prefix = /^[ \t]*keychain_env[ \t]+/.exec(line);
    if (!prefix) stop('noncanonical_mappings');
    var rest = line.slice(prefix[0].length), args = [];
    while (rest.length) {
        // Exactly single-quoted fragments joined by the canonical escaped apostrophe.
        var token = /^'([^']*)'((?:\\''[^']*')*)/.exec(rest);
        if (!token) stop('noncanonical_mappings');
        var value = token[1], tail = token[2];
        while (tail.length) {
            var part = /^\\''([^']*)'/.exec(tail);
            if (!part) stop('noncanonical_mappings');
            value += "'" + part[1];
            tail = tail.slice(part[0].length);
        }
        args.push(value);
        rest = rest.slice(token[0].length);
        if (rest && !/^[ \t]+/.test(rest)) stop('noncanonical_mappings');
        rest = rest.replace(/^[ \t]+/, '');
    }
    if (args.length < 2 || args.length > 3) stop('noncanonical_mappings');
    return args;
}

function parseMappings(text, account) {
    var mappings = [], seen = Object.create(null);
    if (/\r\n/.test(text)) stop('noncanonical_line_endings');
    text.split('\n').forEach(function (line) {
        var args = parseMappingLine(line);
        if (!args) return;
        if (!validVariable(args[0])) stop('invalid_mapping_variable');
        if (!validMetadata(args[1]) || !validMetadata(args.length === 3 ? args[2] : account)) {
            stop('invalid_mapping_metadata');
        }
        if (seen[args[0]]) stop('duplicate_mapping_variable');
        seen[args[0]] = true;
        mappings.push({ variable: args[0], service: args[1], account: args.length === 3 ? args[2] : account });
    });
    return mappings;
}

function parentPath(path) { return path.slice(0, path.lastIndexOf('/')) || '/'; }
function inScope(path, scope) { return path.indexOf(scope + '/') === 0; }

function warn(ctx, reason, path) {
    if (!ctx.warnings) return;
    if (!ctx.warnings.some(function (item) { return item.reason === reason && item.path === path; })) {
        ctx.warnings.push({ reason: reason, path: path });
    }
}

function inspectDirectory(path, ctx, io, privateMode, writable) {
    var info = io.stat(path);
    if (!info) return null;
    if (info.type !== 'directory') stop('unsafe_directory');
    if (info.uid !== ctx.uid) warn(ctx, 'foreign_owner', path);
    if (privateMode && info.mode !== 448) warn(ctx, 'managed_directory_mode', path);
    if (info.mode & 18) warn(ctx, 'shared_directory_write_access', path); // group/other writable
    if (writable && !io.writable(path)) stop('parent_not_writable');
    return info;
}

function inspectFile(path, scope, ctx, io, privateMode) {
    // Follow only bounded, in-scope file links and return identities for the editor.
    // This snapshot is not a lock: the caller must recheck before writing.
    var original = path, links = [], info;
    for (var depth = 0; depth < 16; depth++) {
        info = io.stat(path);
        if (!info) {
            if (links.length) stop('unsafe_symlink');
            return { path: original, destination: path, exists: false };
        }
        if (info.uid !== ctx.uid) warn(ctx, 'foreign_owner', path);
        if (info.type !== 'symlink') break;
        links.push({ path: path, destination: io.link(path), identity: info.identity });
        path = io.normalize(links[links.length - 1].destination, parentPath(path));
        if (!inScope(path, scope)) stop('unsafe_symlink');
    }
    if (!info || info.type !== 'regular') stop('unsafe_file_type');
    if (info.links !== 1) warn(ctx, 'hardlinked_file', path);
    if (privateMode && (info.mode & 63)) warn(ctx, 'managed_file_permissions', path);
    if (!privateMode && (info.mode & 18)) warn(ctx, 'shared_file_write_access', path);
    // Inspect every intervening directory; directory symlinks are deliberately unsupported.
    var parent = parentPath(path);
    while (parent !== scope && inScope(parent, scope)) {
        inspectDirectory(parent, ctx, io, false, false) || stop('unsafe_directory');
        parent = parentPath(parent);
    }
    if (!io.readable(path)) stop('file_not_readable');
    if (info.size > MAX_BYTES) stop('inspection_limit');
    return { path: original, destination: path, exists: true, identity: info.identity,
        mode: info.mode, owner: info.uid, hard_links: info.links, links: links, size: info.size };
}

function syntax(file, shells, io) {
    if (!file.exists) return;
    shells.forEach(function (shell) {
        if (!io.syntax(file.destination, shell)) stop('shell_syntax');
    });
}

function editParent(file, ctx, io) {
    var parent = parentPath(file.destination);
    inspectDirectory(parent, ctx, io, false, false) || stop('missing_edit_parent');
    var info = file.exists ? io.stat(file.destination) : null;
    if (info && info.immutable) stop('immutable_edit_target');
    // In-place edits preserve ownership, ACLs, links and attributes without an inventory.
    if (info && io.writable(file.destination)) {
        file.edit_method = 'in_place';
        return;
    }
    if (info && (info.uid !== ctx.uid || info.links !== 1)) stop('file_not_writable');
    if (!io.writable(parent)) stop('parent_not_writable');
    file.edit_method = 'replace';
}

function startupInspection(ctx, io) {
    // Install-only inspection recognizes the managed block without running startup
    // code. Unfamiliar integration is left for review, not guessed or migrated.
    var names = ctx.shell === 'zsh' ? ['.zshenv', '.zprofile', '.zshrc', '.zlogin'] :
        ['.bash_profile', '.bash_login', '.bashrc', '.profile'];
    var files = {}, integrated = [];
    names.forEach(function (name) {
        var file = inspectFile(ctx.home + '/' + name, ctx.home, ctx, io, false);
        files[name] = file;
        if (!file.exists) return;
        var text = io.read(file.destination).replace(/\r\n/g, '\n');
        syntax(file, [name.indexOf('.z') === 0 ? 'zsh' : 'bash'], io);
        var count = text.split(STARTUP_BLOCK).length - 1;
        if (count > 1) stop('startup_integration_ambiguous');
        if (count === 1) {
            // Validate prefix/suffix independently: a block inside a compound command
            // or heredoc cannot be treated as established top-level integration.
            var offset = text.indexOf(STARTUP_BLOCK);
            var prefix = text.slice(0, offset), suffix = text.slice(offset + STARTUP_BLOCK.length);
            if (!io.syntaxText(prefix, ctx.shell) || !io.syntaxText(suffix, ctx.shell) ||
                /^\s*(?:return|exit)(?:\s|;|$)/m.test(prefix)) stop('startup_context_manual_review');
            integrated.push(name);
        }
        text = text.replace(STARTUP_BLOCK, '');
        var active = text.split('\n').filter(function (line) { return !/^[ \t]*#/.test(line); }).join('\n');
        // A single established bash login -> interactive chain is recognizable, not executed.
        if (name === '.bash_profile') active = active.replace(/^\s*(?:\.|source) "\$HOME\/\.bashrc"\s*$/gm, '');
        if (/keychain_env|keychain-env\/init\.sh/.test(active)) stop('unfamiliar_startup_integration');
        // Ordinary source/eval initialization is preserved, not executed or chased.
        if (/\bZDOTDIR\s*=/.test(active)) stop('custom_zdotdir_manual_review');
    });
    if (integrated.length > 1) stop('startup_integration_ambiguous');
    if (integrated.length === 1) {
        var name = integrated[0];
        if ((ctx.shell === 'zsh') !== (name.indexOf('.z') === 0)) stop('startup_shell_mismatch');
        return { file: files[name], install: false };
    }
    if (ctx.shell === 'zsh') return { file: files['.zshrc'], install: true };
    if (ctx.shell !== 'bash') stop('unsupported_login_shell');
    if (files['.bash_profile'].exists && files['.bashrc'].exists &&
        !files['.bash_login'].exists && !files['.profile'].exists &&
        /^\s*(?:\.|source) "\$HOME\/\.bashrc"\s*$/m.test(io.read(files['.bash_profile'].destination))) {
        return { file: files['.bashrc'], install: true };
    }
    stop('bash_startup_ambiguous');
}

function validateArguments(argv, ctx) {
    var operation = argv[0];
    if (operation === 'install') return argv.length === 1;
    if (operation === 'resolve-update') return argv.length === 2 && validVariable(argv[1]);
    return operation === 'add' && (argv.length === 3 || argv.length === 4) &&
        validVariable(argv[1]) && validMetadata(argv[2]) &&
        validMetadata(argv.length === 4 ? argv[3] : ctx.account);
}

function inspectConfiguration(result, ctx, io) {
    inspectDirectory(ctx.home, ctx, io, false, false) || stop('home_unavailable');
    var config = ctx.home + '/.config', managed = config + '/keychain-env';
    var configInfo = inspectDirectory(config, ctx, io, false, false);
    var managedInfo = inspectDirectory(managed, ctx, io, true, false);
    var mappings = inspectFile(managed + '/mappings.sh', managed, ctx, io, true);
    var loader = result.operation === 'resolve-update' ? null : inspectFile(managed + '/init.sh', managed, ctx, io, true);
    if (result.operation === 'add' && (!loader.exists || !mappings.exists)) {
        result.missing_files = [];
        if (!loader.exists) result.missing_files.push(loader.path);
        if (!mappings.exists) result.missing_files.push(mappings.path);
        result.action = 'Run this skill\'s install operation, or check your shell startup integration manually; restore missing managed files before retrying add.';
        result.installation_required = true;
        stop('installation_required');
    }
    syntax(mappings, ['sh', 'zsh', 'bash'], io);
    return { mappings: mappings, loader: loader,
        declarations: parseMappings(mappings.exists ? io.read(mappings.destination) : '', ctx.account),
        creationParent: managedInfo ? managed : configInfo ? config : ctx.home };
}

function resolveUpdate(result, inspected) {
    // Update needs only the canonical service/account, not a writable config or
    // verified shell integration; the separate Keychain helper performs the write.
    var found = inspected.declarations.filter(function (item) { return item.variable === result.variable; });
    if (!found.length) stop('mapping_not_found');
    result.service = found[0].service; result.account = found[0].account;
    result.status = 'resolved'; result.reason = 'canonical_mapping';
    result.mapping = inspected.mappings;
    return result;
}

function planAdd(result, inspected, ctx, io) {
    // Existing managed files mark installation for add. Startup discovery and
    // loader replacement belong to explicit install, not this credential operation.
    if (inspected.declarations.some(function (item) { return item.variable === result.variable; })) {
        stop('variable_already_mapped');
    }
    syntax(inspected.loader, ['sh', 'zsh', 'bash'], io);
    editParent(inspected.mappings, ctx, io);
    result.status = 'ready'; result.reason = 'configuration_ready';
    result.installation_required = false;
    result.install_loader = false; result.install_mappings = false; result.install_startup_block = false;
    result.baseline = { loader: inspected.loader, mappings: inspected.mappings };
    return result;
}

function planInstall(result, inspected, ctx, io) {
    var loader = inspected.loader, mappings = inspected.mappings;
    if (ctx.shell !== 'zsh' && ctx.shell !== 'bash') stop('unsupported_login_shell');
    if (ctx.environment.ZDOTDIR && ctx.environment.ZDOTDIR !== ctx.home) stop('custom_zdotdir_manual_review');
    if (loader.exists && !io.sameBytes(loader.destination, ctx.bundledLoader)) stop('changed_loader');
    if (!io.readable(ctx.bundledLoader)) stop('bundled_loader_unavailable', 'error');
    syntax({ exists: true, destination: ctx.bundledLoader }, ['sh', 'zsh', 'bash'], io);
    syntax(loader, ['sh', 'zsh', 'bash'], io);
    var startup = startupInspection(ctx, io);
    if (!loader.exists || !mappings.exists) {
        inspectDirectory(inspected.creationParent, ctx, io, false, true);
    }
    // Install preserves existing mappings, even when they cannot be edited.
    if (startup.install) editParent(startup.file, ctx, io);
    result.status = 'ready'; result.reason = 'configuration_ready';
    result.installation_required = !loader.exists || !mappings.exists || startup.install;
    result.install_loader = !loader.exists; result.install_mappings = !mappings.exists;
    result.install_startup_block = startup.install; result.startup_path = startup.file.path;
    result.baseline = { loader: loader, mappings: mappings, startup: startup.file };
    return result;
}

function configurationPreflight(argv, ctx, io) {
    var result = { status: 'invalid_arguments', reason: 'invalid_arguments' };
    try {
        if (!validateArguments(argv, ctx)) return result;
        result = { operation: argv[0], warnings: [] };
        ctx = Object.create(ctx); ctx.warnings = result.warnings;
        if (argv[0] !== 'install') result.variable = argv[1];
        if (argv[0] === 'add') { result.service = argv[2]; result.account = argv.length === 4 ? argv[3] : ctx.account; }
        var inspected = inspectConfiguration(result, ctx, io);
        if (argv[0] === 'resolve-update') return resolveUpdate(result, inspected);
        if (argv[0] === 'add') return planAdd(result, inspected, ctx, io);
        return planInstall(result, inspected, ctx, io);
    } catch (failure) {
        result.status = failure.preflightStatus || 'error';
        result.reason = failure.preflightReason || 'inspection_failed';
        return result;
    }
}

function foundationIO() {
    // Keep platform I/O behind one adapter so isolated tests can exercise policy
    // without touching the real home directory, shell startup, or Keychain.
    var fm = $.NSFileManager.defaultManager;
    return {
        stat: function (path) {
            var attrs = fm.attributesOfItemAtPathError($(path), Ref());
            if (attrs.isNil()) {
                // Do not dereference NSError pointers in JXA. Prove absence through a
                // readable parent's directory listing; failures never become absence.
                var parent = parentPath(path), parentInfo = this.stat(parent);
                if (!parentInfo) return null;
                if (parentInfo.type !== 'directory') stop('unsafe_directory');
                var names = fm.contentsOfDirectoryAtPathError($(parent), Ref());
                if (names.isNil()) stop('filesystem_unavailable', 'error');
                if (ObjC.deepUnwrap(names).indexOf(path.slice(path.lastIndexOf('/') + 1)) < 0) return null;
                stop('filesystem_unavailable', 'error');
            }
            var a = ObjC.deepUnwrap(attrs), type = a.NSFileType;
            return { type: type === 'NSFileTypeDirectory' ? 'directory' : type === 'NSFileTypeRegular' ? 'regular' : type === 'NSFileTypeSymbolicLink' ? 'symlink' : 'other',
                uid: Number(a.NSFileOwnerAccountID), mode: Number(a.NSFilePosixPermissions),
                links: Number(a.NSFileReferenceCount), size: Number(a.NSFileSize),
                immutable: !!a.NSFileImmutable || !!a.NSFileAppendOnly,
                identity: { device: a.NSFileSystemNumber, inode: a.NSFileSystemFileNumber,
                    modified: String(a.NSFileModificationDate), mode: a.NSFilePosixPermissions } };
        },
        readable: function (path) { return !!fm.isReadableFileAtPath($(path)); },
        writable: function (path) { return !!fm.isWritableFileAtPath($(path)); },
        link: function (path) {
            var value = fm.destinationOfSymbolicLinkAtPathError($(path), Ref());
            if (value.isNil()) stop('unsafe_symlink');
            return ObjC.unwrap(value);
        },
        normalize: function (path, parent) {
            return ObjC.unwrap($(path[0] === '/' ? path : parent + '/' + path).stringByStandardizingPath);
        },
        read: function (path) {
            var value = $.NSString.stringWithContentsOfFileEncodingError($(path), $.NSUTF8StringEncoding, Ref());
            if (value.isNil()) stop('invalid_text_encoding');
            return ObjC.unwrap(value);
        },
        sameBytes: function (a, b) {
            var first = $.NSData.dataWithContentsOfFile($(a)), second = $.NSData.dataWithContentsOfFile($(b));
            if (first.isNil() || second.isNil()) stop('bundled_loader_unavailable', 'error');
            return !!first.isEqualToData(second);
        },
        syntaxText: function (text, shell) {
            var flags = shell === 'zsh' ? ['-f', '-n'] : ['--noprofile', '--norc', '-n'];
            if (Number($(text).lengthOfBytesUsingEncoding($.NSUTF8StringEncoding)) > MAX_SYNTAX_TEXT_BYTES) {
                stop('inspection_limit');
            }
            return silentTask('/bin/' + shell, flags.concat(['-c', text])).code === 0;
        },
        syntax: function (path, shell) {
            var flags = shell === 'zsh' ? ['-f', '-n'] : shell === 'bash' ? ['--noprofile', '--norc', '-n'] : ['-n'];
            return silentTask('/bin/' + shell, flags.concat([path])).code === 0;
        }
    };
}

function silentTask(path, args, capture) {
    // Capture is used only for account shell metadata. Syntax-check output stays
    // discarded because startup-file diagnostics can reveal unrelated secrets.
    var task = $.NSTask.alloc.init, pipe = capture ? $.NSPipe.pipe : null;
    task.setLaunchPath(path); task.setArguments($(args));
    task.setStandardInput($.NSFileHandle.fileHandleWithNullDevice);
    task.setStandardOutput(pipe || $.NSFileHandle.fileHandleWithNullDevice);
    task.setStandardError($.NSFileHandle.fileHandleWithNullDevice);
    // Do not let inherited shell startup controls affect syntax-only subprocesses.
    task.setEnvironment($({ PATH: '/usr/bin:/bin', HOME: ObjC.unwrap($.NSHomeDirectory()) }));
    task.launch;
    var data = capture ? pipe.fileHandleForReading.readDataToEndOfFile : null;
    task.waitUntilExit;
    return { code: Number(task.terminationStatus), text: capture ? ObjC.unwrap($.NSString.alloc.initWithDataEncoding(data, $.NSUTF8StringEncoding)) : '' };
}

function productionContext(operation) {
    var args = ObjC.deepUnwrap($.NSProcessInfo.processInfo.arguments);
    var script = args.filter(function (arg) { return /^\/.*\/config-preflight\.js$/.test(arg); })[0];
    if (!script) stop('absolute_script_path_required', 'error');
    script = ObjC.unwrap($(script).stringByResolvingSymlinksInPath);
    // Resolve the actual macOS identity; inherited USER is not authoritative.
    // Only install needs login-shell discovery; add/update ignore startup files.
    var account = ObjC.unwrap($.NSUserName());
    var shell = operation === 'install' ?
        silentTask('/usr/bin/dscl', ['.', '-read', '/Users/' + account, 'UserShell'], true) : { code: 1 };
    var match = shell.code === 0 && /^UserShell: \/(?:bin|usr\/local\/bin|opt\/homebrew\/bin)\/(zsh|bash)\s*$/.exec(shell.text || '');
    return { home: ObjC.unwrap($.NSHomeDirectory()), account: account, uid: Number($.getuid()),
        shell: match ? match[1] : 'unsupported', bundledLoader: parentPath(script) + '/init.sh',
        environment: ObjC.deepUnwrap($.NSProcessInfo.processInfo.environment) };
}

function run(argv) {
    try { return JSON.stringify(configurationPreflight(argv, productionContext(argv[0]), foundationIO())); }
    catch (failure) { return JSON.stringify({ status: failure.preflightStatus || 'error',
        reason: failure.preflightReason || 'inspection_failed' }); }
}
