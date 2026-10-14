// Run with: osascript -l JavaScript store-secret.js add|update|check|remove SERVICE ACCOUNT
// Remove requires prior user confirmation and shared-mapping checks by the caller.
// Only non-secret metadata is accepted as arguments. Never return dialog contents.
// Boundary: argv and JSON carry names/status only; secret text stays inside this
// process until the CLI write. The caller owns mapping edits and confirmation.
ObjC.import('Foundation');
ObjC.import('AppKit');
ObjC.import('Security');
// JXA Ref(number) is not a UInt32 pointer; use a native in/out length buffer.
ObjC.bindFunction('SecKeychainGetPath', ['int', ['void *', 'void *', 'void *']]);

// Security's CFString constants are not reliably exposed by the JXA bridge.
// These are their public string values (not secret data).
var keys = {
    itemClass: 'class', genericPassword: 'genp', service: 'svce',
    account: 'acct', returnAttributes: 'r_Attributes'
};
var codes = { success: 0, missing: -25300, duplicate: -25299, ambiguous: -99901, commandFailed: -99902 };

function itemQuery(service, account) {
    var query = $.NSMutableDictionary.alloc.init;
    query.setObjectForKey($(keys.genericPassword), $(keys.itemClass));
    query.setObjectForKey($(service), $(keys.service));
    query.setObjectForKey($(account), $(keys.account));
    return query;
}

function findItems(service, account) {
    // Ask for attributes and item references, never kSecReturnData/password bytes.
    // All matches are needed: accepting the first would hide cross-Keychain ambiguity.
    var query = itemQuery(service, account);
    query.setObjectForKey($.NSNumber.numberWithBool(true), $(keys.returnAttributes));
    query.setObjectForKey($.NSNumber.numberWithBool(true), $('r_Ref'));
    query.setObjectForKey($('m_LimitAll'), $('m_Limit'));
    var result = Ref();
    var code = Number($.SecItemCopyMatching(query, result));
    return { code: code, items: code === 0 ? ObjC.castRefToObject(result[0]) : null };
}

function statusResult(code) {
    if (code === codes.ambiguous) return { status: 'ambiguous' };
    if (code === codes.missing) return { status: 'missing' };
    if (code === codes.duplicate) return { status: 'already_exists' };
    return { status: 'error', code: code };
}

function uniqueItem(service, account) {
    var found = findItems(service, account);
    if (found.code !== codes.success) return statusResult(found.code);
    if (Number(found.items.count) !== 1) return statusResult(codes.ambiguous);
    return { status: 'resolved', item: found.items.objectAtIndex(0) };
}

function resolveTarget(service, account) {
    var found = uniqueItem(service, account);
    if (found.status !== 'resolved') return found;
    var target = itemKeychainPath(found.item);
    return target.code === undefined ?
        { status: 'resolved', path: target.path } : statusResult(target.code);
}

function checkItem(service, account) {
    // Presence means metadata lookup succeeded in the owning Keychain; it does not
    // verify the password, API validity, or whether the runtime loader can read it.
    var target = resolveTarget(service, account);
    if (target.status !== 'resolved') return target;
    var code = securityMetadata('find-generic-password', service, account, target.path);
    return code === codes.success ? { status: 'present' } : statusResult(code);
}

function preflight(operation, service, account) {
    // Refuse collisions/missing updates before showing a secret-entry dialog.
    // An access failure is not evidence that an item is absent.
    var result = checkItem(service, account);
    if ((operation === 'add' && result.status === 'missing') ||
        (operation === 'update' && result.status === 'present')) return { status: 'ready' };
    if (result.status === 'present') return { status: 'already_exists' };
    return result;
}

function securityMetadata(command, service, account, keychain) {
    if (['find-generic-password', 'delete-generic-password'].indexOf(command) === -1 ||
        !keychain || keychain[0] !== '/' || /[\x00-\x1f\x7f]/.test(keychain)) {
        return codes.commandFailed;
    }
    // No -w/-g: metadata checking and deletion never request password data.
    return runSecurity([command, '-a', account, '-s', service, keychain]);
}

function runSecurity(args) {
    try {
        var task = $.NSTask.alloc.init;
        task.setLaunchPath('/usr/bin/security');
        task.setArguments($(args));
        // CLI diagnostics can contain sensitive arguments; discard all I/O.
        task.setStandardOutput($.NSFileHandle.fileHandleWithNullDevice);
        task.setStandardError($.NSFileHandle.fileHandleWithNullDevice);
        task.setStandardInput($.NSFileHandle.fileHandleWithNullDevice);
        task.launch;
        task.waitUntilExit;
        // CLI exits are not OSStatus values; never infer absence or collisions.
        return Number(task.terminationStatus) === 0 ? codes.success : codes.commandFailed;
    } catch (_) {
        // Never serialize exceptions, tasks, arguments, or raw diagnostics.
        return codes.commandFailed;
    }
}

function removeItem(service, account) {
    var target = resolveTarget(service, account);
    if (target.status !== 'resolved') return target;
    // CLI deletion is Keychain/name scoped, not persistent-identity scoped.
    // A replacement after resolution can become the target; checks are non-atomic.
    var code = securityMetadata('delete-generic-password', service, account, target.path);
    return code === codes.success ? { status: 'deleted' } : statusResult(code);
}

function secureField(y) {
    var field = $.NSSecureTextField.alloc.initWithFrame($.NSMakeRect(0, y, 360, 24));
    field.setPlaceholderString('Required');
    return field;
}

function label(text, y) {
    var field = $.NSTextField.alloc.initWithFrame($.NSMakeRect(0, y, 360, 20));
    field.setStringValue(text);
    field.setEditable(false);
    field.setSelectable(false);
    field.setBezeled(false);
    field.setDrawsBackground(false);
    return field;
}

function makeDialog(operation, service, account, retry) {
    var alert = $.NSAlert.alloc.init;
    alert.setMessageText(operation === 'add' ? 'Add Keychain secret' : 'Update Keychain secret');
    alert.setInformativeText('Service: ' + service + '\nAccount: ' + account +
        '\n' + (retry || 'Enter a non-empty single-line secret (no CR, LF, or NUL).\n' +
            'Spaces and Unicode are preserved.\n' +
            'Saving exposes the value in local security process arguments.'));
    alert.addButtonWithTitle(operation === 'add' ? 'Add' : 'Update');
    alert.addButtonWithTitle('Cancel');
    var view = $.NSView.alloc.initWithFrame($.NSMakeRect(0, 0, 360, 112));
    var first = secureField(64), second = secureField(8);
    view.addSubview(label('Secret', 90));
    view.addSubview(first);
    view.addSubview(label('Retype secret', 34));
    view.addSubview(second);
    first.setNextKeyView(second);
    alert.setAccessoryView(view);
    alert.window.setInitialFirstResponder(first);
    return { alert: alert, first: first, second: second };
}

function validateValues(first, second) {
    // Compare exact text: trimming or Unicode normalization would change a secret.
    // Single-line validation also avoids command-substitution newline loss in loading.
    if (first.length === 0) return 'The secret must not be empty. Please try again.';
    if (/[\r\n\x00]/.test(first) || /[\r\n\x00]/.test(second)) {
        return 'Use a single-line secret without CR, LF, or NUL characters. Please try again.';
    }
    if (first !== second) return 'The two values do not match. Please try again.';
    return null;
}

function showValidationError(message, exhausted) {
    var alert = $.NSAlert.alloc.init;
    alert.setAlertStyle($.NSAlertStyleWarning);
    alert.setMessageText('Secret not saved');
    alert.setInformativeText(message + (exhausted ?
        '\nNo attempts remain. Run the operation again to retry.' : ''));
    alert.addButtonWithTitle('OK');
    alert.runModal;
}

function securityWrite(service, account, value, keychain) {
    // Argument arrays avoid shell interpretation, but the value is still a local
    // process argument. No explicit trust flags are added; CLI/default ACLs apply.
    var args = ['add-generic-password', '-a', account, '-s', service, '-w', value];
    // Add is insert-only; update explicitly accepts CLI upsert races.
    if (keychain) args.push('-U', keychain);
    return runSecurity(args);
}

function addItem(service, account, value) {
    // Recheck after entry. This and the CLI insert are not a transaction.
    var found = findItems(service, account);
    if (found.code === codes.success) {
        return statusResult(Number(found.items.count) === 1 ? codes.duplicate : codes.ambiguous);
    }
    if (found.code !== codes.missing) return statusResult(found.code);
    var code = securityWrite(service, account, value, null);
    return code === codes.success ? { status: 'created' } : statusResult(code);
}

function itemKeychainPath(item) {
    // Resolve ownership from the native item reference, not the default Keychain.
    // The fixed-size native buffer is checked before decoding a usable absolute path.
    var reference = item.objectForKey($('v_Ref'));
    if (!reference) throw new Error('Missing item reference');
    var keychain = Ref();
    var code = Number($.SecKeychainItemCopyKeychain(reference, keychain));
    if (code !== codes.success) return { code: code };
    var buffer = $.NSMutableData.alloc.initWithLength(4096);
    // UInt32 4096, little-endian on supported Intel/Apple Silicon Macs.
    var length = $.NSData.alloc.initWithBase64EncodedStringOptions('ABAAAA==', 0).mutableCopy;
    code = Number($.SecKeychainGetPath(keychain[0], length.mutableBytes, buffer.mutableBytes));
    if (code !== codes.success) return { code: code };
    var decoded = ObjC.unwrap($.NSString.alloc.initWithDataEncoding(buffer, $.NSUTF8StringEncoding));
    var path = decoded ? decoded.split('\x00')[0] : null;
    // Never default to another Keychain when ownership cannot be resolved.
    if (!path || path[0] !== '/' || /[\x00-\x1f\x7f]/.test(path)) {
        throw new Error('Invalid Keychain path');
    }
    return { path: path };
}

function writeItem(operation, service, account, value) {
    if (operation === 'add') return addItem(service, account, value);
    var target = resolveTarget(service, account);
    if (target.status !== 'resolved') return target;
    // Matching is scoped to the owning Keychain, not a persistent item identity.
    var code = securityWrite(service, account, value, target.path);
    return code === codes.success ? { status: 'updated' } : statusResult(code);
}

function collectAndStore(operation, service, account) {
    // Limit validation retries and clear UI fields before validation or writing.
    // Nulling JS references shortens retention; it does not guarantee memory erasure.
    var retry = null;
    for (var attempt = 0; attempt < 3; attempt++) {
        var dialog = makeDialog(operation, service, account, retry);
        var response = Number(dialog.alert.runModal);
        if (response !== 1000) {
            dialog.first.setStringValue('');
            dialog.second.setStringValue('');
            return { status: 'cancelled' };
        }
        var first = ObjC.unwrap(dialog.first.stringValue);
        var second = ObjC.unwrap(dialog.second.stringValue);
        dialog.first.setStringValue('');
        dialog.second.setStringValue('');
        retry = validateValues(first, second);
        second = null;
        if (retry) {
            first = null;
            showValidationError(retry, attempt === 2);
            continue;
        }
        var result = writeItem(operation, service, account, first);
        first = null;
        return result;
    }
    return { status: 'validation_failed' };
}

function validArguments(argv) {
    return argv.length === 3 && ['add', 'update', 'check', 'remove'].indexOf(argv[0]) !== -1 &&
        !!argv[1] && !!argv[2] && !/[\x00-\x1f\x7f]/.test(argv[1] + argv[2]);
}

function run(argv) {
    try {
        if (!validArguments(argv)) {
            return JSON.stringify({ status: 'invalid_arguments' });
        }
        // No secret-entry dialog on these paths; Security may request authorization.
        if (argv[0] === 'check') return JSON.stringify(checkItem(argv[1], argv[2]));
        if (argv[0] === 'remove') return JSON.stringify(removeItem(argv[1], argv[2]));
        var result = preflight(argv[0], argv[1], argv[2]);
        if (result.status !== 'ready') return JSON.stringify(result);
        var app = $.NSApplication.sharedApplication;
        app.setActivationPolicy($.NSApplicationActivationPolicyAccessory);
        app.activateIgnoringOtherApps(true);
        return JSON.stringify(collectAndStore(argv[0], argv[1], argv[2]));
    } catch (_) {
        // Never serialize native exceptions: they could contain input data.
        return JSON.stringify({ status: 'error' });
    }
}
