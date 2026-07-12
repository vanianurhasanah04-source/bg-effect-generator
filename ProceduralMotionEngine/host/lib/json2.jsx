// json2.jsx
// Minimal ES3-safe JSON.stringify/parse polyfill for the ExtendScript
// engine. Modern AE (23+) ships a native JSON object, but this guard keeps
// the plugin working on older hosts and in sandboxed ExtendScript contexts
// where it is sometimes stripped.
if (typeof JSON === 'undefined') {
  JSON = {};
}

if (typeof JSON.stringify !== 'function') {
  JSON.stringify = function (value) {
    return PME_jsonEncode(value);
  };
}

if (typeof JSON.parse !== 'function') {
  JSON.parse = function (text) {
    // eval is safe here: input always originates from our own JSON.stringify
    // call on the CEP side, never from untrusted external content.
    return eval('(' + text + ')');
  };
}

function PME_jsonEncode(value) {
  var t = typeof value;
  if (value === null) return 'null';
  if (t === 'number' || t === 'boolean') return String(value);
  if (t === 'string') return PME_jsonEncodeString(value);
  if (value instanceof Array) {
    var arrParts = [];
    for (var i = 0; i < value.length; i++) {
      arrParts.push(PME_jsonEncode(value[i]));
    }
    return '[' + arrParts.join(',') + ']';
  }
  if (t === 'object') {
    var objParts = [];
    for (var key in value) {
      if (value.hasOwnProperty(key)) {
        objParts.push(PME_jsonEncodeString(key) + ':' + PME_jsonEncode(value[key]));
      }
    }
    return '{' + objParts.join(',') + '}';
  }
  return 'null';
}

function PME_jsonEncodeString(str) {
  var escaped = str.replace(/[\\"]/g, '\\$&')
                    .replace(/\n/g, '\\n')
                    .replace(/\r/g, '\\r')
                    .replace(/\t/g, '\\t');
  return '"' + escaped + '"';
}
