// Isolated JXA tests: mocked fixtures and one temporary Foundation fixture only.
// osascript -l JavaScript tests/config-preflight.js /absolute/skill/scripts/config-preflight.js
ObjC.import('Foundation');
function run(argv) {
    var source = ObjC.unwrap($.NSString.stringWithContentsOfFileEncodingError($(argv[0]), $.NSUTF8StringEncoding, Ref()));
    // Load helpers, never the production CLI/context (which inspects the actual account).
    eval(source.slice(0, source.indexOf('\nfunction run(argv)')));
    var passed = 0;
    function assert(condition, label) { if (!condition) throw new Error('FAIL: ' + label); }
    function fixture() {
        var ctx = { home: '/fixture/home', uid: 501, account: 'actual-account', shell: 'zsh',
            bundledLoader: '/bundle/init.sh', environment: { USER: 'spoofed-account' } };
        var entries = {};
        function directory(path, mode) { entries[path] = { type: 'directory', uid: 501, mode: mode || 448 }; }
        function file(path, text, mode) { entries[path] = { type: 'regular', uid: 501,
            mode: mode || 384, links: 1, size: text.length, text: text, identity: { inode: 7 } }; }
        directory(ctx.home); directory(ctx.home + '/.config'); directory(ctx.home + '/.config/keychain-env');
        file(ctx.bundledLoader, '# synthetic loader\n'); file(ctx.home + '/.config/keychain-env/init.sh', '# synthetic loader\n');
        file(ctx.home + '/.config/keychain-env/mappings.sh', "keychain_env 'EXISTING_TOKEN' 'existing-service'\n");
        file(ctx.home + '/.zshrc', STARTUP_BLOCK + '\n');
        var io = {
            stat: function (path) { return entries[path] || null; },
            readable: function (path) { return !!entries[path] && !entries[path].unreadable; },
            writable: function (path) { return !!entries[path] && !entries[path].unwritable; },
            link: function (path) { return entries[path].destination; },
            normalize: function (path, parent) { return ObjC.unwrap($(path[0] === '/' ? path : parent + '/' + path).stringByStandardizingPath); },
            read: function (path) { return entries[path].text; },
            sameBytes: function (a, b) { return entries[a].text === entries[b].text; },
            syntaxText: function (text) {
                return !/(?:^|\n)\s*(?:if\b|fi\b|unused\(\)|\}|cat <<|END\b)/.test(text);
            },
            syntax: function (path) { return !entries[path].invalidSyntax; }
        };
        return { ctx: ctx, io: io, entries: entries, file: file, directory: directory,
            mappings: ctx.home + '/.config/keychain-env/mappings.sh', loader: ctx.home + '/.config/keychain-env/init.sh',
            startup: ctx.home + '/.zshrc' };
    }
    function installCheck(label, change, reason) { return check(label, change, reason, ['install']); }
    function check(label, change, reason, args) {
        var f = fixture(); change(f);
        var result = configurationPreflight(args || ['add', 'NEW_TOKEN', 'service'], f.ctx, f.io);
        assert(result.reason === reason, label + ' (' + result.reason + ')');
        assert(JSON.stringify(result).indexOf('PRIVATE_SENTINEL') < 0, label + ' safe output');
        passed++; return result;
    }
    var ready = check('existing installation', function () {}, 'configuration_ready');
    assert(ready.status === 'ready' && !ready.installation_required && ready.account === 'actual-account', 'default independent USER');
    installCheck('first install', function (f) {
        delete f.entries[f.loader]; delete f.entries[f.mappings]; delete f.entries[f.startup];
        delete f.entries[f.ctx.home + '/.config/keychain-env']; delete f.entries[f.ctx.home + '/.config'];
    }, 'configuration_ready');
    installCheck('first install read-only home', function (f) {
        delete f.entries[f.loader]; delete f.entries[f.mappings]; delete f.entries[f.ctx.home + '/.config/keychain-env'];
        f.entries[f.ctx.home + '/.config'].unwritable = true;
    }, 'parent_not_writable');
    var resolved = check('resolve update', function () {}, 'canonical_mapping', ['resolve-update', 'EXISTING_TOKEN']);
    assert(resolved.status === 'resolved' && resolved.service === 'existing-service' && resolved.account === 'actual-account', 'canonical identity');
    check('resolve no mapping', function () {}, 'mapping_not_found', ['resolve-update', 'MISSING_TOKEN']);
    check('resolve ignores loader and startup', function (f) {
        f.entries[f.loader].type = 'other'; f.entries[f.startup].text = 'source PRIVATE_SENTINEL';
    }, 'canonical_mapping', ['resolve-update', 'EXISTING_TOKEN']);
    check('CRLF mappings', function (f) {
        f.entries[f.mappings].text = "keychain_env 'EXISTING_TOKEN' 'existing-service'\r\n";
    }, 'noncanonical_line_endings', ['resolve-update', 'EXISTING_TOKEN']);
    ['add', 'install'].forEach(function (operation) {
        check('CRLF refused for ' + operation, function (f) {
            f.entries[f.mappings].text += '# comment\r\n';
        }, 'noncanonical_line_endings', operation === 'add' ? ['add', 'NEW_TOKEN', 'service'] : ['install']);
    });
    check('duplicate', function (f) { f.entries[f.mappings].text += "keychain_env 'EXISTING_TOKEN' 'another'\n"; }, 'duplicate_mapping_variable');
    check('existing target', function () {}, 'variable_already_mapped', ['add', 'EXISTING_TOKEN', 'another']);
    ["keychain_env 'TOKEN' \"$SERVICE\"", "keychain_env 'TOKEN' 'a'; echo PRIVATE_SENTINEL",
        "keychain_env 'TOKEN' 'a' # comment", "echo PRIVATE_SENTINEL", "keychain_env 'TOKEN' 'a' \\\n'b'"].forEach(function (text) {
        check('noncanonical mapping', function (f) { f.entries[f.mappings].text = text; }, 'noncanonical_mappings');
    });
    check('invalid variable elsewhere', function (f) { f.entries[f.mappings].text = "keychain_env 'bad-name' 'a'"; }, 'invalid_mapping_variable');
    check('control metadata', function (f) { f.entries[f.mappings].text = "keychain_env 'TOKEN' 'a\tb'"; }, 'invalid_mapping_metadata');
    var quoted = parseMappings("keychain_env 'TOKEN' 'part'\\''rest' 'explicit'\\''account'\n", 'default')[0];
    assert(quoted.service === "part'rest" && quoted.account === "explicit'account", 'apostrophe quoting'); passed++;
    check('explicit metadata spaces Unicode', function () {}, 'configuration_ready', ['add', 'NEW_TOKEN', " service Ω ' ", ' explicit account ']);
    ['HOME', 'USER', 'PATH', 'TIMEFORMAT', 'TIMEFMT', 'BASH_COMMAND', 'PS4', 'HISTFILE', '_keychain_env_private', 'ZSH_VERSION', 'UID', 'status', 'bad-name'].forEach(function (name) {
        check('reserved name', function () {}, 'invalid_arguments', ['add', name, 'a']);
    });
    [['add', 'TOKEN', ''], ['add', 'TOKEN', 'a', ''], ['add', 'TOKEN', 'a\x7f'], ['add', 'TOKEN', 'a', 'b', 'extra'], ['resolve-update'], ['other', 'TOKEN'], ['install', 'TOKEN'], ['install', 'TOKEN', 'service'], []].forEach(function (args) {
        check('invalid arguments', function () {}, 'invalid_arguments', args);
    });
    check('inherited collision', function (f) { f.ctx.environment.NEW_TOKEN = 'PRIVATE_SENTINEL'; }, 'configuration_ready');
    check('add ignores startup assignment', function (f) { f.entries[f.startup].text += '\nexport NEW_TOKEN=PRIVATE_SENTINEL\n'; }, 'configuration_ready');
    check('add ignores startup attributes', function (f) { f.entries[f.startup].text += '\ntypeset -i NEW_TOKEN=3\n'; }, 'configuration_ready');
    check('comment no collision', function (f) { f.entries[f.startup].text += '\n# NEW_TOKEN=PRIVATE_SENTINEL\n'; }, 'configuration_ready');
    installCheck('changed loader', function (f) { f.entries[f.loader].text = 'PRIVATE_SENTINEL'; }, 'changed_loader');
    var metadataResult = check('hardlink', function (f) { f.entries[f.mappings].links = 2; }, 'configuration_ready');
    assert(metadataResult.warnings.some(function (item) { return item.reason === 'hardlinked_file'; }), 'hardlink warning'); passed++;
    var metadataResult = check('foreign owner', function (f) { f.entries[f.mappings].uid = 502; }, 'configuration_ready');
    assert(metadataResult.warnings.some(function (item) { return item.reason === 'foreign_owner'; }), 'foreign owner warning'); passed++;
    var metadataResult = check('private mode', function (f) { f.entries[f.mappings].mode = 420; }, 'configuration_ready');
    assert(metadataResult.warnings.some(function (item) { return item.reason === 'managed_file_permissions'; }), 'private mode warning'); passed++;
    var metadataResult = check('managed dir mode', function (f) { f.entries[f.ctx.home + '/.config/keychain-env'].mode = 493; }, 'configuration_ready');
    assert(metadataResult.warnings.some(function (item) { return item.reason === 'managed_directory_mode'; }), 'managed dir mode warning'); passed++;
    var shared = check('shared writable configuration', function (f) {
        f.entries[f.ctx.home + '/.config'].mode = 511;
        f.entries[f.mappings].mode = 438;
    }, 'configuration_ready');
    assert(shared.warnings.some(function (item) { return item.reason === 'shared_directory_write_access'; }), 'shared access warning'); passed++;
    var foreignParent = check('accessible foreign parent', function (f) {
        f.entries[f.ctx.home + '/.config'].uid = 502;
    }, 'configuration_ready');
    assert(foreignParent.warnings.some(function (item) { return item.reason === 'foreign_owner'; }), 'parent ownership warning'); passed++;
    check('symlink directory', function (f) { f.entries[f.ctx.home + '/.config'].type = 'symlink'; }, 'unsafe_directory');
    check('unsafe symlink', function (f) { f.entries[f.mappings].type = 'symlink'; f.entries[f.mappings].destination = '/outside/private'; }, 'unsafe_symlink');
    check('broken symlink', function (f) { f.entries[f.mappings].type = 'symlink'; f.entries[f.mappings].destination = 'absent'; }, 'unsafe_symlink');
    check('safe owned symlink', function (f) {
        f.file(f.mappings + '.actual', f.entries[f.mappings].text);
        f.entries[f.mappings].type = 'symlink'; f.entries[f.mappings].destination = 'mappings.sh.actual';
    }, 'configuration_ready');
    check('symlink cycle', function (f) { f.entries[f.mappings].type = 'symlink'; f.entries[f.mappings].destination = 'mappings.sh'; }, 'unsafe_file_type');
    check('unsafe link ancestor', function (f) {
        f.entries[f.mappings].type = 'symlink'; f.entries[f.mappings].destination = 'nested/map';
        f.directory(f.ctx.home + '/.config/keychain-env/nested'); f.entries[f.ctx.home + '/.config/keychain-env/nested'].type = 'symlink';
        f.file(f.ctx.home + '/.config/keychain-env/nested/map', '');
    }, 'unsafe_directory');
    check('syntax', function (f) { f.entries[f.mappings].invalidSyntax = true; }, 'shell_syntax');
    installCheck('startup syntax', function (f) { f.entries[f.startup].invalidSyntax = true; }, 'shell_syntax');
    installCheck('read-only startup no edit', function (f) { f.entries[f.startup].immutable = true; f.entries[f.ctx.home].unwritable = true; }, 'configuration_ready');
    ['read-only', 'immutable'].forEach(function (kind) {
        var noOp = installCheck('no-op install ' + kind + ' mappings', function (f) {
            f.entries[f.mappings].unwritable = true;
            f.entries[f.ctx.home + '/.config/keychain-env'].unwritable = true;
            if (kind === 'immutable') f.entries[f.mappings].immutable = true;
            f.io.writable = function () { throw new Error('no-op checked editability'); };
        }, 'configuration_ready');
        assert(!noOp.installation_required && !('edit_method' in noOp.baseline.mappings), 'no mappings edit plan'); passed++;
    });
    check('immutable mappings edit', function (f) { f.entries[f.mappings].immutable = true; }, 'immutable_edit_target');
    check('resolve no edit immutable', function (f) { f.entries[f.mappings].immutable = true; }, 'canonical_mapping', ['resolve-update', 'EXISTING_TOKEN']);
    installCheck('dynamic include', function (f) { f.entries[f.startup].text += '\nsource "$HOME/private"\n'; }, 'configuration_ready');
    check('inactive bash configuration ignored', function (f) {
        f.file(f.ctx.home + '/.bashrc', 'source PRIVATE_SENTINEL\n');
    }, 'configuration_ready');
    ['if false; then\n' + STARTUP_BLOCK + '\nfi',
        'unused() {\n' + STARTUP_BLOCK + '\n}',
        "cat <<'END'\n" + STARTUP_BLOCK + '\nEND',
        'return\n' + STARTUP_BLOCK].forEach(function (text) {
        installCheck('ambiguous block placement', function (f) { f.entries[f.startup].text = text; }, 'startup_context_manual_review');
    });
    installCheck('eval startup', function (f) { f.entries[f.startup].text += '\neval PRIVATE_SENTINEL\n'; }, 'configuration_ready');
    var dynamicPlan = installCheck('append after ordinary initialization', function (f) {
        f.entries[f.startup].text = 'source "$HOME/plugins.sh"\neval "$(brew shellenv)"\n';
        f.file(f.ctx.home + '/.zprofile', 'eval "$(brew shellenv)"\n');
    }, 'configuration_ready');
    assert(dynamicPlan.install_startup_block && dynamicPlan.startup_path === '/fixture/home/.zshrc', 'zsh append default'); passed++;
    installCheck('repeat install after ordinary initialization', function (f) {
        f.entries[f.startup].text = 'source "$HOME/plugins.sh"\neval "$(brew shellenv)"\n' + STARTUP_BLOCK;
    }, 'configuration_ready');
    installCheck('startup sets custom ZDOTDIR', function (f) {
        f.entries[f.startup].text += '\nZDOTDIR="$HOME/custom"\n';
    }, 'custom_zdotdir_manual_review');
    installCheck('unfamiliar integration', function (f) { f.entries[f.startup].text = '. "$HOME/.config/keychain-env/init.sh"'; }, 'unfamiliar_startup_integration');
    installCheck('duplicate integration', function (f) { f.entries[f.startup].text += STARTUP_BLOCK; }, 'startup_integration_ambiguous');
    installCheck('bash unclear', function (f) { f.ctx.shell = 'bash'; delete f.entries[f.startup]; }, 'bash_startup_ambiguous');
    installCheck('bash established', function (f) {
        f.ctx.shell = 'bash'; delete f.entries[f.startup]; f.file(f.ctx.home + '/.bashrc', STARTUP_BLOCK);
    }, 'configuration_ready');
    installCheck('bash infer chain', function (f) {
        f.ctx.shell = 'bash'; delete f.entries[f.startup];
        f.file(f.ctx.home + '/.bash_profile', '. "$HOME/.bashrc"\n'); f.file(f.ctx.home + '/.bashrc', '# empty');
    }, 'configuration_ready');
    check('size limit', function (f) { f.entries[f.mappings].size = MAX_BYTES + 1; }, 'inspection_limit');
    check('safe exception', function (f) { f.io.read = function () { throw new Error('PRIVATE_SENTINEL'); }; }, 'inspection_failed');

    assert(!ready.install_loader && !ready.install_mappings && !ready.install_startup_block &&
        !('startup_path' in ready) && !('startup' in ready.baseline), 'add managed-only baseline'); passed++;
    check('add never inspects startup, shell, or bundle', function (f) {
        f.ctx.environment.ZDOTDIR = '/custom/zdotdir';
        Object.defineProperty(f.ctx, 'shell', { get: function () { throw new Error('shell inspected'); } });
        f.entries[f.loader].text = '# independently updated, valid loader\n';
        delete f.entries[f.ctx.bundledLoader];
        f.entries[f.startup].text = 'source PRIVATE_SENTINEL\nif then\n';
        f.entries[f.startup].invalidSyntax = true;
        var stat = f.io.stat;
        f.io.stat = function (path) {
            if (path.indexOf('/.zsh') >= 0 || path.indexOf('/.bash') >= 0 || path === f.ctx.bundledLoader) {
                throw new Error('unrelated file inspected');
            }
            return stat(path);
        };
        f.io.sameBytes = function () { throw new Error('loader byte comparison'); };
    }, 'configuration_ready');
    check('unsupported shell add', function (f) { f.ctx.shell = 'fish'; }, 'configuration_ready');
    installCheck('unsupported shell install', function (f) { f.ctx.shell = 'fish'; }, 'unsupported_login_shell');
    installCheck('custom ZDOTDIR install', function (f) { f.ctx.environment.ZDOTDIR = '/custom'; }, 'custom_zdotdir_manual_review');
    installCheck('install ignores secret-specific startup assignments', function (f) {
        f.entries[f.startup].text += '\nexport NEW_TOKEN=PRIVATE_SENTINEL\n';
    }, 'configuration_ready');
    var metadataResult = check('loader private permissions', function (f) { f.entries[f.loader].mode = 420; }, 'configuration_ready');
    assert(metadataResult.warnings.some(function (item) { return item.reason === 'managed_file_permissions'; }), 'loader private permissions warning'); passed++;
    check('loader unreadable', function (f) { f.entries[f.loader].unreadable = true; }, 'file_not_readable');
    check('add loader syntax', function (f) { f.entries[f.loader].invalidSyntax = true; }, 'shell_syntax');
    var inPlace = check('writable file read-only parent', function (f) {
        f.entries[f.ctx.home + '/.config/keychain-env'].unwritable = true;
    }, 'configuration_ready');
    assert(inPlace.baseline.mappings.edit_method === 'in_place', 'in-place edit plan'); passed++;
    check('no usable edit method', function (f) {
        f.entries[f.mappings].unwritable = true;
        f.entries[f.ctx.home + '/.config/keychain-env'].unwritable = true;
    }, 'parent_not_writable');
    var replace = check('owned read-only file replaceable', function (f) {
        f.entries[f.mappings].unwritable = true;
    }, 'configuration_ready');
    assert(replace.baseline.mappings.edit_method === 'replace', 'replacement plan'); passed++;
    check('foreign owner cannot preserve ownership', function (f) {
        f.entries[f.mappings].uid = 502; f.entries[f.mappings].unwritable = true;
    }, 'file_not_writable');
    check('hardlink cannot edit in place', function (f) {
        f.entries[f.mappings].links = 2; f.entries[f.mappings].unwritable = true;
    }, 'file_not_writable');
    ['init.sh', 'mappings.sh', 'both'].forEach(function (missing) {
        var result = check('add requires installation ' + missing, function (f) {
            if (missing !== 'mappings.sh') delete f.entries[f.loader];
            if (missing !== 'init.sh') delete f.entries[f.mappings];
            f.io.writable = function () { throw new Error('missing installation edit check'); };
        }, 'installation_required');
        assert(result.status === 'blocked' && result.missing_files.length === (missing === 'both' ? 2 : 1) &&
            result.missing_files.every(function (path) { return /^\/fixture\/home\/\.config\/keychain-env\/(init|mappings)\.sh$/.test(path); }) &&
            /install/.test(result.action), 'missing installation safe guidance');
    });
    var plan = installCheck('install plan without mapping identity', function () {}, 'configuration_ready');
    assert(plan.operation === 'install' && !('variable' in plan) && !('service' in plan) && !('account' in plan) &&
        !!plan.baseline.startup && !plan.installation_required, 'install plan only'); passed++;
    var firstPlan = installCheck('first install flags', function (f) {
        delete f.entries[f.loader]; delete f.entries[f.mappings]; delete f.entries[f.startup];
    }, 'configuration_ready');
    assert(firstPlan.install_loader && firstPlan.install_mappings && firstPlan.install_startup_block &&
        firstPlan.installation_required, 'first install flags'); passed++;
    // productionContext is not invoked here; prove add cannot select its dscl branch.
    assert(source.indexOf("var shell = operation === 'install' ?") >= 0, 'shell discovery install only'); passed++;

    // Exercise Foundation lstat/read/byte comparison and real syntax checks in a fresh sandbox.
    var fm = $.NSFileManager.defaultManager;
    var temp = ObjC.unwrap($.NSTemporaryDirectory()) + 'config-preflight-' + ObjC.unwrap($.NSUUID.UUID.UUIDString);
    function nativeTask(args) { assert(silentTask('/bin/' + args[0], args.slice(1)).code === 0, 'fixture setup'); }
    try {
        nativeTask(['mkdir', '-m', '700', temp]);
        var f = fixture(), ctx = f.ctx; ctx.home = temp; ctx.uid = Number($.getuid());
        nativeTask(['mkdir', '-m', '700', temp + '/.config', temp + '/.config/keychain-env']);
        function write(path, text) {
            assert($(text).writeToFileAtomicallyEncodingError($(path), true, $.NSUTF8StringEncoding, Ref()), 'fixture write');
            nativeTask(['chmod', '600', path]);
        }
        ctx.bundledLoader = temp + '/bundled-init.sh';
        write(ctx.bundledLoader, '# synthetic loader\n');
        write(temp + '/.config/keychain-env/init.sh', '# synthetic loader\n');
        write(temp + '/.config/keychain-env/mappings.sh', "keychain_env 'EXISTING_TOKEN' 'existing-service'\n");
        write(temp + '/.zshrc', STARTUP_BLOCK + '\n');
        write(temp + '/.zshrc', 'source "$HOME/absent-plugin.sh"\neval "$(false)"\n' + STARTUP_BLOCK + '\n');
        var io = foundationIO(), nativeReady = configurationPreflight(['add', 'NEW_TOKEN', 'service'], ctx, io);
        assert(nativeReady.status === 'ready', 'native ready (' + nativeReady.reason + ')'); passed++;
        assert(configurationPreflight(['install'], ctx, io).status === 'ready', 'native dynamic prefix repeat install'); passed++;
        write(temp + '/.zshrc', 'if false; then\n' + STARTUP_BLOCK + '\nfi\n');
        assert(configurationPreflight(['install'], ctx, io).reason === 'startup_context_manual_review', 'native nested block'); passed++;
        write(temp + '/.zshrc', 'source "$HOME/absent-plugin.sh"\neval "$(false)"\n');
        var appendPlan = configurationPreflight(['install'], ctx, io);
        assert(appendPlan.status === 'ready' && appendPlan.install_startup_block, 'native autonomous append plan'); passed++;

        // -c avoids a writer blocked on a shell that rejects its input early.
        // Exercise both shells with a substantial malformed prefix, not a pipe.
        var padding = new Array(12001).join('# synthetic padding\n');
        var malformed = 'if then\n' + padding;
        // Stay within the explicit argv budget with a moderately large fragment.
        malformed = malformed.slice(0, 60000);
        ['zsh', 'bash'].forEach(function (shell) {
            assert(!io.syntaxText(malformed, shell), 'native large malformed text ' + shell); passed++;
            assert(io.syntaxText('# valid fragment\n' + malformed.slice(8), shell), 'native large valid text ' + shell); passed++;
            try {
                io.syntaxText(new Array(MAX_SYNTAX_TEXT_BYTES / 2 + 2).join('Ω'), shell);
                assert(false, 'oversized UTF-8 text accepted');
            } catch (failure) {
                assert(failure.preflightReason === 'inspection_limit', 'native UTF-8 argument bound ' + shell); passed++;
            }
        });
        // A syntactically valid compound around the block reaches the moderately
        // large prefix-only syntax check, which must reject the unclosed if.
        write(temp + '/.zshrc', 'if false; then\n' + malformed.slice(8, 60000) + '\n' + STARTUP_BLOCK + '\nfi\n');
        assert(configurationPreflight(['install'], ctx, io).reason === 'startup_context_manual_review', 'native large malformed prefix'); passed++;
        write(temp + '/.zshrc', new Array(4001).join('# long fragment padding\n') + STARTUP_BLOCK);
        assert(configurationPreflight(['install'], ctx, io).reason === 'inspection_limit', 'native bounded startup fragment'); passed++;

        var marker = temp + '/executed', startup = temp + '/synthetic-startup.sh';
        write(startup, 'printf executed > "' + marker + '"\n');
        // Inherited startup hooks must not run, and neither may command text.
        ObjC.bindFunction('setenv', ['int', ['char *', 'char *', 'int']]);
        ObjC.bindFunction('unsetenv', ['int', ['char *']]);
        var environment = ObjC.deepUnwrap($.NSProcessInfo.processInfo.environment);
        var controls = { BASH_ENV: startup, ENV: startup, ZDOTDIR: temp };
        write(temp + '/.zshenv', 'printf executed > "' + marker + '"\n');
        write(temp + '/.bashrc', 'printf executed > "' + marker + '"\n');
        try {
            Object.keys(controls).forEach(function (key) { $.setenv(key, controls[key], 1); });
            ['zsh', 'bash'].forEach(function (shell) {
                assert(io.syntaxText('. "' + startup + '"\nprintf executed > "' + marker + '"\n', shell), 'native syntax-only text ' + shell);
                assert(!fm.fileExistsAtPath($(marker)), 'no commands or startup executed ' + shell); passed++;
            });
        } finally {
            Object.keys(controls).forEach(function (key) {
                if (environment[key] === undefined) $.unsetenv(key);
                else $.setenv(key, environment[key], 1);
            });
        }
        write(temp + '/.zshrc', STARTUP_BLOCK + '\n');
        var mappingPath = temp + '/.config/keychain-env/mappings.sh';
        write(mappingPath, "keychain_env 'EXISTING_TOKEN' 'existing-service'\r\n");
        assert(configurationPreflight(['resolve-update', 'EXISTING_TOKEN'], ctx, io).reason === 'noncanonical_line_endings', 'native CRLF refusal'); passed++;
        write(mappingPath, "keychain_env 'EXISTING_TOKEN' 'existing-service'\n");
        nativeTask(['chmod', '400', mappingPath]);
        nativeTask(['chmod', '500', temp + '/.config/keychain-env']);
        var readOnlyPlan = configurationPreflight(['install'], ctx, io);
        assert(readOnlyPlan.status === 'ready' && !readOnlyPlan.installation_required, 'native no-op read-only mappings'); passed++;
        nativeTask(['chmod', '700', temp + '/.config/keychain-env']);
        nativeTask(['chmod', '600', mappingPath]);
        assert(silentTask('/usr/bin/chflags', ['uchg', mappingPath]).code === 0, 'fixture immutable flag');
        try {
            var immutablePlan = configurationPreflight(['install'], ctx, io);
            assert(immutablePlan.status === 'ready' && !immutablePlan.installation_required, 'native no-op immutable mappings'); passed++;
        } finally { assert(silentTask('/usr/bin/chflags', ['nouchg', mappingPath]).code === 0, 'clear fixture immutable flag'); }

        assert(silentTask('/usr/bin/xattr', ['-w', 'com.apple.provenance', 'synthetic', mappingPath]).code === 0, 'synthetic provenance setup');
        assert(configurationPreflight(['add', 'NEW_TOKEN', 'service'], ctx, io).status === 'ready', 'provenance ignored'); passed++;
        nativeTask(['chmod', '644', mappingPath]);
        var permissive = configurationPreflight(['add', 'NEW_TOKEN', 'service'], ctx, io);
        assert(permissive.status === 'ready' && permissive.warnings.some(function (item) {
            return item.reason === 'managed_file_permissions';
        }), 'native permissions warning not blocker'); passed++;
        nativeTask(['chmod', '600', mappingPath]);
        nativeTask(['rm', '-r', temp + '/.config']);
        assert(configurationPreflight(['add', 'NEW_TOKEN', 'service'], ctx, io).reason === 'installation_required', 'native missing installation'); passed++;
        assert(configurationPreflight(['install'], ctx, io).status === 'ready', 'native first install'); passed++;
        nativeTask(['mkdir', '-m', '700', temp + '/.config', temp + '/.config/keychain-env']);
        write(temp + '/.config/keychain-env/init.sh', '# synthetic loader\n');
        write(temp + '/.config/keychain-env/mappings.sh', "keychain_env 'EXISTING_TOKEN' 'existing-service'\n");
        nativeTask(['ln', '-s', 'mappings.sh', temp + '/.config/keychain-env/alias']);
        assert(inspectFile(temp + '/.config/keychain-env/alias', temp + '/.config/keychain-env', ctx, io, true).destination === temp + '/.config/keychain-env/mappings.sh', 'native owned link'); passed++;
        nativeTask(['ln', temp + '/.config/keychain-env/mappings.sh', temp + '/hardlink']);
        assert(configurationPreflight(['add', 'NEW_TOKEN', 'service'], ctx, io).status === 'ready', 'native hardlink editable'); passed++;
        nativeTask(['rm', temp + '/hardlink']);
        write(temp + '/.zshrc', 'if then\n');
        assert(configurationPreflight(['add', 'NEW_TOKEN', 'service'], ctx, io).status === 'ready', 'native add ignores startup syntax'); passed++;
        assert(configurationPreflight(['install'], ctx, io).reason === 'shell_syntax', 'native install syntax'); passed++;
        write(temp + '/.config/keychain-env/init.sh', '# custom installed loader\nkeychain_env() { :; }\n');
        ctx.shell = 'unsupported'; ctx.environment.ZDOTDIR = temp + '/custom-zdotdir';
        assert(configurationPreflight(['add', 'NEW_TOKEN', 'service'], ctx, io).status === 'ready', 'native independent add'); passed++;
        ctx.shell = 'zsh'; delete ctx.environment.ZDOTDIR;
        assert(configurationPreflight(['install'], ctx, io).reason === 'changed_loader', 'native install loader mismatch'); passed++;
    } finally { fm.removeItemAtPathError($(temp), Ref()); }
    return 'PASS: ' + passed + ' isolated configuration preflight checks (no user config or Keychain access)';
}
