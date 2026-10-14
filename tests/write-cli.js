// Mocked production add/update contract: no Security calls, Keychain items, or dialogs.
ObjC.import('Foundation');
var foundation = $;
function run(argv) {
    var source = ObjC.unwrap(foundation.NSString.stringWithContentsOfFileEncodingError(
        argv[0], foundation.NSUTF8StringEncoding, Ref()));
    function loadFunction(name, names, dependencies) {
        var start = source.indexOf('function ' + name + '(');
        var end = source.indexOf('\nfunction ', start + 1);
        if (start < 0 || end < 0) throw new Error('Function not found');
        return Function.apply(null, names.concat(
            'return (' + source.slice(start, end).trim() + ')')).apply(null, dependencies);
    }
    function assert(condition) { if (!condition) throw new Error('Write contract failed'); }
    var codes = { success: 0, missing: -25300, duplicate: -25299, ambiguous: -99901, commandFailed: -99902 };
    var found, launched, waited, status = 0, fail = false, args, path, streams;
    var nullDevice = {};
    var task = {
        setLaunchPath: function (value) { path = value; },
        setArguments: function (value) { args = value; },
        setStandardOutput: function (value) { streams.push(value); },
        setStandardError: function (value) { streams.push(value); },
        setStandardInput: function (value) { streams.push(value); }
    };
    Object.defineProperty(task, 'launch', { get: function () {
        launched++; if (fail) throw new Error('synthetic diagnostic');
    } });
    Object.defineProperty(task, 'waitUntilExit', { get: function () { waited++; } });
    Object.defineProperty(task, 'terminationStatus', { get: function () { return status; } });
    var $ = function (value) { return value; };
    $.NSTask = { alloc: { init: task } };
    $.NSFileHandle = { fileHandleWithNullDevice: nullDevice };
    function findItems() { return found; }
    var runner = loadFunction('runSecurity', ['$', 'codes'], [$, codes]);
    var statusResult = loadFunction('statusResult', ['codes'], [codes]);
    var writer = loadFunction('securityWrite', ['runSecurity'], [runner]);
    var add = loadFunction('addItem', ['codes', 'findItems', 'securityWrite', 'statusResult'],
        [codes, findItems, writer, statusResult]);
    var unique, target, pathCalls;
    function uniqueItem() { return unique; }
    function itemKeychainPath() { pathCalls++; return target; }
    var resolve = loadFunction('resolveTarget', ['uniqueItem', 'itemKeychainPath', 'statusResult'],
        [uniqueItem, itemKeychainPath, statusResult]);
    var write = loadFunction('writeItem',
        ['codes', 'addItem', 'resolveTarget', 'securityWrite', 'statusResult'],
        [codes, add, resolve, writer, statusResult]);
    function reset(code, count) {
        found = { code: code, items: { count: count } };
        launched = 0; waited = 0; streams = []; args = null; pathCalls = 0;
    }
    reset(codes.missing);
    var value = '  public synthetic Ω ; $(not-a-shell)  ';
    assert(add('service', 'account', value).status === 'created');
    assert(path === '/usr/bin/security' && launched === 1 && waited === 1);
    assert(JSON.stringify(args) === JSON.stringify(['add-generic-password', '-a', 'account',
        '-s', 'service', '-w', value]));
    assert(streams.length === 3 && streams.every(function (v) { return v === nullDevice; }));
    [1, 44, 45, 255].forEach(function (exit) {
        reset(codes.missing); status = exit;
        assert(add('service', 'account', value).code === codes.commandFailed);
    });
    reset(codes.missing); fail = true;
    assert(add('service', 'account', value).code === codes.commandFailed);
    fail = false;
    [[0, 1, codes.duplicate], [0, 2, -99901], [-25293, 0, -25293]].forEach(function (c) {
        reset(c[0], c[1]);
        assert(JSON.stringify(add('service', 'account', value)) === JSON.stringify(statusResult(c[2])) && launched === 0);
    });
    status = 0;
    reset(0, 1); unique = { status: 'resolved', item: {} };
    target = { path: '/synthetic keychains/Ω.keychain-db' };
    assert(write('update', 'service', 'account', value).status === 'updated');
    assert(pathCalls === 1 && launched === 1 && waited === 1);
    assert(JSON.stringify(args) === JSON.stringify(['add-generic-password', '-a', 'account',
        '-s', 'service', '-w', value, '-U', target.path]));
    assert(streams.length === 3 && streams.every(function (v) { return v === nullDevice; }));
    ['missing', 'ambiguous', 'error'].forEach(function (state) {
        reset(0, 1); unique = { status: state, code: -25293 };
        assert(JSON.stringify(write('update', 'service', 'account', value)) === JSON.stringify(unique));
        assert(pathCalls === 0 && launched === 0);
    });
    reset(0, 1); unique = { status: 'resolved', item: {} }; target = { code: -25293 };
    assert(write('update', 'service', 'account', value).code === -25293 && launched === 0);
    target = { path: '/synthetic.keychain-db' };
    reset(0, 1); status = 44;
    assert(write('update', 'service', 'account', value).code === codes.commandFailed);
    reset(0, 1); fail = true;
    assert(write('update', 'service', 'account', value).code === codes.commandFailed);
    return 'PASS: add/update CLI, owning-Keychain scope, default creator access (no explicit trust flags), exact argv, discarded I/O, safe failures and metadata refusal (mocked)';
}
