// Small view helpers for formatting dates used by EJS templates.
// Keep pure JS and minimal dependencies so templates remain fast.

function parseToDate(s) {
  if (!s) return null;
  const str = String(s).trim();
  // ISO-like
  if (/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(.\d+)?Z?$/.test(str)) {
    const d = new Date(str);
    if (!isNaN(d)) return d;
  }
  // Local canonical: YYYY-MM-DD HH:mm
  const m = str.match(/^(\d{4})-(\d{2})-(\d{2})[ ](\d{2}):(\d{2})/);
  if (m) {
    const [_, Y, Mo, D, H, Mi] = m;
    return new Date(+Y, +Mo - 1, +D, +H, +Mi);
  }
  // Fallback: try Date parse
  const d = new Date(str);
  return isNaN(d) ? null : d;
}

function fmt12(txt) {
  const dt = parseToDate(txt);
  if (!dt) return String(txt || '');
  const opts = { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' };
  return dt.toLocaleString(undefined, opts);
}

function canonicalLocal(txt) {
  const dt = parseToDate(txt);
  if (!dt) return String(txt || '');
  const Y = dt.getFullYear();
  const M = String(dt.getMonth() + 1).padStart(2, '0');
  const D = String(dt.getDate()).padStart(2, '0');
  const h = String(dt.getHours()).padStart(2, '0');
  const mi = String(dt.getMinutes()).padStart(2, '0');
  return `${Y}-${M}-${D} ${h}:${mi}`;
}

module.exports = { fmt12, canonicalLocal };
