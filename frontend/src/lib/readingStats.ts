/** Reading-history helpers for the stats page. Day boundaries use the reader's local time. */

export interface ReadingHistoryEntry {
  date?: string | number;
  timestamp?: string | number;
  lastReadAt?: string | number;
  chaptersRead?: number;
}

/** Local calendar day as "YYYY-MM-DD", or null for an invalid date. */
export function localDayKey(value: Date | string | number): string | null {
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/**
 * Consecutive local days with reading, ending today. Entries with
 * `chaptersRead: 0` or an unparseable date do not count.
 */
export function readingStreak(history: ReadingHistoryEntry[], now: Date = new Date()): number {
  const days = new Set<string>();
  for (const h of history) {
    if ((h.chaptersRead ?? 1) <= 0) continue;
    const key = localDayKey(h.date || h.timestamp || h.lastReadAt || NaN);
    if (key) days.add(key);
  }

  let streak = 0;
  const cursor = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  while (streak < 365 && days.has(localDayKey(cursor) as string)) {
    streak++;
    cursor.setDate(cursor.getDate() - 1);
  }
  return streak;
}

/** Page/chapter number typed into a jump box: a whole number in 1..max, else null. */
export function parsePageJump(raw: string, max: number): number | null {
  const text = raw.trim();
  if (!/^\d+$/.test(text)) return null;
  const n = Number(text);
  return n >= 1 && n <= max ? n : null;
}
