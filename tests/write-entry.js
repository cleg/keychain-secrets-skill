// Mocked entry-point contract: add/update perform their own preflight before GUI entry.
// No Keychain access, dialogs, real secrets, or user configuration.
ObjC.import('Foundation');
var foundation = $;
function run(argv) {
    var source = ObjC.unwrap(foundation.NSString.stringWithContentsOfFileEncodingError(
        argv[0], foundation.NSUTF8StringEncoding, Ref()));
    function load(name, names, dependencies) {
        var start = source.indexOf('function ' + name + '(');
        var end = source.indexOf('\nfunction ', start + 1);
        if (end < 0) end = source.length;
        if (start < 0) throw new Error('Function not found');
        return Function.apply(null, names.concat('return (' + source.slice(start, end).trim() + ')'))
            .apply(null, dependencies);
    }
    function assert(condition) { if (!condition) throw new Error('Entry contract failed'); }
    var result, checks = 0, dialogs = 0, activated = 0;
    var preflight = load('preflight', ['checkItem'], [function () { checks++; return result; }]);
    var $ = { NSApplicationActivationPolicyAccessory: 1,
        NSApplication: { sharedApplication: {
            setActivationPolicy: function () {},
            activateIgnoringOtherApps: function () { activated++; }
        } } };
    var entry = load('run', ['validArguments', 'checkItem', 'removeItem', 'preflight', '$', 'collectAndStore'],
        [function () { return true; }, function () { throw new Error('Unexpected check dispatch'); },
            function () { throw new Error('Unexpected removal'); }, preflight, $,
            function (op, service, account) {
                assert(service === 'synthetic-service' && account === 'synthetic-account');
                dialogs++; return { status: op === 'add' ? 'created' : 'updated' };
            }]);
    ['add', 'update'].forEach(function (op) {
        ['missing', 'present', 'ambiguous', 'error'].forEach(function (status) {
            result = { status: status };
            if (status === 'error') result.code = -25293;
            checks = 0; dialogs = 0; activated = 0;
            var actual = JSON.parse(entry([op, 'synthetic-service', 'synthetic-account']));
            var accepted = op === 'add' ? status === 'missing' : status === 'present';
            assert(checks === 1 && dialogs === (accepted ? 1 : 0));
            assert(activated === (accepted ? 1 : 0));
            if (accepted) assert(actual.status === (op === 'add' ? 'created' : 'updated'));
            else if (op === 'add' && status === 'present') assert(actual.status === 'already_exists');
            else assert(JSON.stringify(actual) === JSON.stringify(result));
        });
    });
    var response = 1000, writes = 0, cleared = 0, outcome;
    var field = { stringValue: 'public synthetic value', setStringValue: function (value) {
        assert(value === ''); cleared++;
    } };
    var collect = load('collectAndStore',
        ['makeDialog', 'ObjC', 'validateValues', 'showValidationError', 'writeItem'],
        [function () { return { alert: { runModal: response }, first: field, second: field }; },
            { unwrap: function (value) { return value; } }, function () { return null; },
            function () { throw new Error('Unexpected validation failure'); },
            function () { writes++; return outcome; }]);
    ['created', 'updated', 'missing', 'ambiguous', 'error'].forEach(function (status) {
        writes = 0; cleared = 0; outcome = { status: status };
        if (status === 'error') outcome.code = -99902;
        assert(JSON.stringify(collect('update', 'synthetic-service', 'synthetic-account')) ===
            JSON.stringify(outcome));
        assert(writes === 1 && cleared === 2);
    });
    response = 1001; writes = 0; cleared = 0;
    assert(collect('add', 'synthetic-service', 'synthetic-account').status === 'cancelled');
    assert(writes === 0 && cleared === 2);
    return 'PASS: direct add/update preflight, GUI refusal, write-result propagation and cancellation (mocked)';
}
