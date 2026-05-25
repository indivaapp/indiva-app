/**
 * Shared time utilities — used by firebaseService, story screens and detail screens.
 * Centralising here eliminates the copy-paste of tsToMs across 3 files.
 */

/**
 * Converts any Firebase Timestamp-like value to milliseconds.
 * Supports:
 *   1. Real Firestore Timestamp object (.toMillis())
 *   2. Plain-object from JSON deserialization ({ seconds, nanoseconds })
 *   3. ISO string or numeric timestamp (fallback)
 * Returns null when the value is falsy or cannot be parsed.
 */
export function tsToMs(ts: any): number | null {
  if (!ts) return null;
  if (typeof ts.toMillis === 'function') return ts.toMillis();
  if (typeof ts.seconds === 'number') return ts.seconds * 1000;
  const ms = new Date(ts).getTime();
  return isNaN(ms) ? null : ms;
}

/**
 * Returns a human-readable "time ago" string for a Firebase timestamp.
 * Returns an empty string when the timestamp is missing or invalid.
 */
export function timeAgoFromTs(timestamp: any): string {
  try {
    const ms = tsToMs(timestamp);
    if (!ms) return '';
    const diff = Math.floor((Date.now() - ms) / 1000);
    if (diff < 60) return 'Az önce';
    if (diff < 3600) return `${Math.floor(diff / 60)} dk önce`;
    if (diff < 86400) return `${Math.floor(diff / 3600)} sa önce`;
    return `${Math.floor(diff / 86400)} gün önce`;
  } catch {
    return '';
  }
}
