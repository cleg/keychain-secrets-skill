// Opt-in integration: one unique disposable item, public synthetic values only.
// No GUI, password inspection, real credentials, configuration edits, or unscoped deletion.
ObjC.import('Foundation');
function run(argv) {
    var source = ObjC.unwrap($.NSString.stringWithContentsOfFileEncodingError(
        argv[0], $.NSUTF8StringEncoding, Ref()));
    eval(source.replace('function run(argv)', 'function productionRun(argv)'));
    var service = 'keychain-skill-test-' + ObjC.unwrap($.NSUUID.UUID.UUIDString);
    var account = 'public-synthetic-account';
    var stage = 'preflight', passed = false, created = false, cleanup = 'not_needed';
    function assert(condition) { if (!condition) throw new Error('Test failed'); }
    function firstRead() {
        var task = $.NSTask.alloc.init;
        task.setLaunchPath('/usr/bin/security');
        task.setArguments($(['find-generic-password', '-a', account, '-s', service, '-w']));
        task.setStandardOutput($.NSFileHandle.fileHandleWithNullDevice);
        task.setStandardError($.NSFileHandle.fileHandleWithNullDevice);
        task.setStandardInput($.NSFileHandle.fileHandleWithNullDevice);
        task.launch;
        task.waitUntilExit;
        return Number(task.terminationStatus);
    }
    function cleanupDisposable() {
        var result = removeItem(service, account);
        return result.status === 'missing' ? 'absent' : result.status;
    }
    try {
        assert(preflight('add', service, account).status === 'ready');
        assert(preflight('update', service, account).status === 'missing');
        stage = 'production_add';
        assert(writeItem('add', service, account, '  public synthetic Ω ; $(not-a-shell)  ').status === 'created');
        created = true;
        // FIRST password read: no earlier read or access approval. Discard both streams.
        stage = 'first_cli_read';
        assert(firstRead() === 0);
        stage = 'collision';
        assert(preflight('add', service, account).status === 'already_exists');
        assert(writeItem('add', service, account, 'public synthetic collision').status === 'already_exists');
        assert(JSON.parse(productionRun(['check', service, account])).status === 'present');
        stage = 'production_remove';
        assert(JSON.parse(productionRun(['remove', service, account])).status === 'deleted');
        assert(JSON.parse(productionRun(['check', service, account])).status === 'missing');
        assert(JSON.parse(productionRun(['remove', service, account])).status === 'missing');
        passed = true;
    } catch (_) {
        // Only fixed stage names and public metadata are returned; never raw exceptions.
    } finally {
        if (created) {
            try { cleanup = cleanupDisposable(); } catch (_) { cleanup = 'error'; }
        } else if (stage === 'production_add') {
            cleanup = 'write_uncertain_check_metadata';
        }
    }
    return JSON.stringify({ status: passed && (cleanup === 'deleted' || cleanup === 'absent') ?
        'passed' : 'failed', stage: stage, service: service, account: account, cleanup: cleanup });
}
