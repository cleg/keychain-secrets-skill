// Mocked production check/remove: no Keychain calls, passwords, or dialogs.
ObjC.import('Foundation');
var foundation = $;
function run(argv) {
    var source = ObjC.unwrap(foundation.NSString.stringWithContentsOfFileEncodingError(
        argv[0], foundation.NSUTF8StringEncoding, Ref()));
    function load(name, names, dependencies) {
        var start = source.indexOf('function ' + name + '(');
        var end = source.indexOf('\nfunction ', start + 1);
        if (start < 0 || end < 0) throw new Error('Function not found');
        return Function.apply(null, names.concat('return (' + source.slice(start, end).trim() + ')'))
            .apply(null, dependencies);
    }
    function assert(condition) { if (!condition) throw new Error('Metadata CLI contract failed'); }
    var codes = { success: 0, missing: -25300, duplicate: -25299, ambiguous: -99901, commandFailed: -99902 };
    var calls, args, streams, exit = 0, fail = false, path, found, target, pathCalls;
    var nullDevice = {};
    var task = {
        setLaunchPath: function (v) { path = v; },
        setArguments: function (v) { args = v; },
        setStandardOutput: function (v) { streams.push(v); },
        setStandardError: function (v) { streams.push(v); },
        setStandardInput: function (v) { streams.push(v); }
    };
    Object.defineProperty(task, 'launch', { get: function () {
        calls++; if (fail) throw new Error('synthetic diagnostic');
    } });
    Object.defineProperty(task, 'waitUntilExit', { get: function () {} });
    Object.defineProperty(task, 'terminationStatus', { get: function () { return exit; } });
    var $ = function (v) { return v; };
    $.NSTask = { alloc: { init: task } };
    $.NSFileHandle = { fileHandleWithNullDevice: nullDevice };
    var runner = load('runSecurity', ['$', 'codes'], [$, codes]);
    var command = load('securityMetadata', ['runSecurity', 'codes'], [runner, codes]);
    var statusResult = load('statusResult', ['codes'], [codes]);
    function uniqueItem() { return found; }
    function itemKeychainPath() { pathCalls++; return target; }
    var resolve = load('resolveTarget', ['uniqueItem', 'itemKeychainPath', 'statusResult'],
        [uniqueItem, itemKeychainPath, statusResult]);
    var names = ['codes', 'resolveTarget', 'securityMetadata', 'statusResult'];
    var dependencies = [codes, resolve, command, statusResult];
    var check = load('checkItem', names, dependencies);
    var remove = load('removeItem', names, dependencies);
    function reset() {
        calls = 0; streams = []; args = null; exit = 0; fail = false; pathCalls = 0;
        found = { status: 'resolved', item: {} }; target = { path: '/synthetic Ω keychains/test.keychain-db' };
    }
    [check, remove].forEach(function (operation, index) {
        reset();
        var service = 'literal Ω ; $(not-a-shell)', account = 'literal account';
        assert(operation(service, account).status === (index === 0 ? 'present' : 'deleted'));
        assert(calls === 1 && pathCalls === 1 && path === '/usr/bin/security');
        assert(JSON.stringify(args) === JSON.stringify([
            index === 0 ? 'find-generic-password' : 'delete-generic-password',
            '-a', account, '-s', service, target.path]));
        assert(streams.length === 3 && streams.every(function (v) { return v === nullDevice; }));
        ['missing', 'ambiguous', 'error'].forEach(function (status) {
            reset(); found = { status: status, code: -25293 };
            assert(operation(service, account).status === status && calls === 0 && pathCalls === 0);
        });
        reset(); target = { code: -25293 };
        assert(operation(service, account).code === -25293 && calls === 0);
        ['', 'relative.keychain', '/bad\npath', null].forEach(function (p) {
            reset(); target = { path: p };
            assert(operation(service, account).code === codes.commandFailed && calls === 0);
        });
        [1, 44, 45, 255].forEach(function (status) {
            reset(); exit = status;
            var result = operation(service, account);
            assert(result.status === 'error' && result.code === codes.commandFailed);
        });
        reset(); fail = true;
        assert(operation(service, account).code === codes.commandFailed);
    });
    var nativeResult;
    var unique = load('uniqueItem', ['findItems', 'codes', 'statusResult'],
        [function () { return nativeResult; }, codes, statusResult]);
    nativeResult = { code: codes.missing };
    assert(unique('service', 'account').status === 'missing');
    nativeResult = { code: -25293 };
    assert(unique('service', 'account').code === -25293);
    [0, 2].forEach(function (count) {
        nativeResult = { code: codes.success, items: { count: count } };
        assert(unique('service', 'account').status === 'ambiguous');
    });
    var item = {};
    nativeResult = { code: codes.success, items: {
        count: 1, objectAtIndex: function () { return item; }
    } };
    assert(unique('service', 'account').status === 'resolved');
    assert(unique('service', 'account').item === item);
    reset();
    assert(command('add-generic-password', 'service', 'account', target.path) === codes.commandFailed);
    assert(calls === 0);
    return 'PASS: metadata-only CLI check/remove, owning-Keychain scope, exact argv, discarded I/O, ambiguity/missing/access refusal and conservative CLI errors (mocked)';
}
