// Pure validation tests: no frameworks, Keychain calls, dialogs, or real secrets.
ObjC.import('Foundation');
function run(argv) {
    var source = ObjC.unwrap($.NSString.stringWithContentsOfFileEncodingError(
        argv[0], $.NSUTF8StringEncoding, Ref()));
    // Evaluate only the unchanged pure validators, never the production entry point.
    function loadFunction(name) {
        var start = source.indexOf('function ' + name + '(');
        var end = source.indexOf('\nfunction ', start + 1);
        if (start < 0 || end < 0) throw new Error('Validator not found');
        return eval('(' + source.slice(start, end).trim() + ')');
    }
    var validate = loadFunction('validateValues');
    var validArgs = loadFunction('validArguments');
    function assert(condition) { if (!condition) throw new Error('Validation test failed'); }

    assert(validate('', '') !== null);
    assert(validate('synthetic-a', 'synthetic-b') !== null);
    ['\r', '\n', '\x00'].forEach(function (control) {
        var value = 'synthetic' + control + 'value';
        assert(validate(value, value) !== null);
        assert(validate('synthetic', value) !== null);
        assert(validate(value, 'synthetic') !== null);
    });
    ['  synthetic Ω 🔑  ', ' ', 'e\u0301'].forEach(function (value) {
        assert(validate(value, value) === null);
    });
    assert(validate(' synthetic ', 'synthetic') !== null);
    assert(validate('é', 'e\u0301') !== null);

    ['add', 'update', 'check', 'remove'].forEach(function (operation) {
        assert(validArgs([operation, 'service Ω', ' account ']) === true);
    });
    assert(validArgs(['invalid', 'service', 'account']) === false);
    assert(validArgs(['check', '', 'account']) === false);
    assert(validArgs(['check', 'service', '']) === false);
    assert(validArgs(['check', 'service']) === false);
    assert(validArgs(['check', 'service', 'account', 'extra']) === false);
    for (var code = 0; code <= 127; code++) {
        if (code > 31 && code !== 127) continue;
        var metadata = 'synthetic' + String.fromCharCode(code);
        assert(validArgs(['check', metadata, 'account']) === false);
        assert(validArgs(['check', 'service', metadata]) === false);
    }
    return 'PASS: secret format, exact whitespace/Unicode comparison, metadata validation';
}
