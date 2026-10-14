// Read-only path bridge: default-Keychain metadata only, no item/password query or mutation.
ObjC.import('Foundation');
ObjC.import('Security');
ObjC.bindFunction('SecKeychainGetPath', ['int', ['void *', 'void *', 'void *']]);
var native = $;
function run(argv) {
    var source = ObjC.unwrap(native.NSString.stringWithContentsOfFileEncodingError(
        argv[0], native.NSUTF8StringEncoding, Ref()));
    var start = source.indexOf('function itemKeychainPath(');
    var end = source.indexOf('\nfunction ', start + 1);
    function assert(condition) { if (!condition) throw new Error('Keychain path contract failed'); }
    assert(start >= 0 && end > start);
    var keychain = Ref();
    assert(Number(native.SecKeychainCopyDefault(keychain)) === 0);
    var copyCode = 0, pathCode = 0, pathCalls = 0;
    var $ = function (value) { return native(value); };
    $.NSMutableData = native.NSMutableData;
    $.NSData = native.NSData;
    $.NSString = native.NSString;
    $.NSUTF8StringEncoding = native.NSUTF8StringEncoding;
    $.SecKeychainItemCopyKeychain = function (reference, result) {
        assert(reference === 'public-synthetic-item-reference');
        return copyCode || Number(native.SecKeychainCopyDefault(result));
    };
    $.SecKeychainGetPath = function (reference, length, buffer) {
        pathCalls++;
        return pathCode || Number(native.SecKeychainGetPath(reference, length, buffer));
    };
    var resolve = Function('$', 'codes', 'Ref', 'ObjC',
        'return (' + source.slice(start, end).trim() + ')')($, { success: 0 }, Ref, ObjC);
    var item = { objectForKey: function (key) {
        assert(ObjC.unwrap(key) === 'v_Ref');
        return 'public-synthetic-item-reference';
    } };
    var result = resolve(item);
    assert(result.path && result.path[0] === '/' && pathCalls === 1);
    copyCode = -25293; pathCalls = 0;
    assert(resolve(item).code === -25293 && pathCalls === 0);
    copyCode = 0; pathCode = -50;
    assert(resolve(item).code === -50 && pathCalls === 1);
    var refused = false;
    try { resolve({ objectForKey: function () { return null; } }); } catch (_) { refused = true; }
    assert(refused);
    return 'PASS: native Keychain path buffer bridge and fail-closed reference/path errors (no item access)';
}
