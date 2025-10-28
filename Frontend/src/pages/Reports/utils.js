// Utilities for Reports
export function parseServerTimestamp(ts) {
  if (!ts) return null;
  if (ts instanceof Date) return ts;
  if (typeof ts === 'number') return new Date(ts);
  const s = String(ts).trim();
  const reDateTime = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}(?:\.\d+)?$/;
  const reDateOnly = /^\d{4}-\d{2}-\d{2}$/;
  try {
    if (reDateTime.test(s)) {
      return new Date(s.replace(' ', 'T') + 'Z');
    }
    if (reDateOnly.test(s)) {
      return new Date(s + 'T00:00:00Z');
    }
    const d = new Date(s);
    if (!isNaN(d.getTime())) return d;
  } catch (err) {
    // fall through
  }
  return null;
}
