"""Read-only native constant contract: no Keychain calls, items, or secrets."""
import ctypes
import pathlib
import re
import sys


def security_string(name):
    security = ctypes.CDLL('/System/Library/Frameworks/Security.framework/Security')
    foundation = ctypes.CDLL('/System/Library/Frameworks/CoreFoundation.framework/CoreFoundation')
    convert = foundation.CFStringGetCString
    convert.argtypes = [ctypes.c_void_p, ctypes.c_char_p, ctypes.c_long, ctypes.c_uint32]
    convert.restype = ctypes.c_bool
    value = ctypes.c_void_p.in_dll(security, name)
    buffer = ctypes.create_string_buffer(128)
    if not convert(value, buffer, len(buffer), 0x08000100):
        raise RuntimeError('Native constant conversion failed')
    return buffer.value.decode('utf-8')


def main():
    source = pathlib.Path(sys.argv[1]).read_text()
    keys = re.search(r'var keys = \{(.*?)\n\};', source, re.S)
    if keys is None:
        raise RuntimeError('Production attributes not found')
    names = {
        'itemClass': 'kSecClass', 'genericPassword': 'kSecClassGenericPassword',
        'service': 'kSecAttrService', 'account': 'kSecAttrAccount',
        'returnAttributes': 'kSecReturnAttributes',
    }
    for key, native in names.items():
        value = re.search(rf"\b{key}: '([^']+)'", keys.group(1))
        if value is None or value.group(1) != security_string(native):
            raise RuntimeError('Production attribute differs from installed framework')
    print('PASS: metadata attributes match installed Security.framework')


if __name__ == '__main__':
    main()
