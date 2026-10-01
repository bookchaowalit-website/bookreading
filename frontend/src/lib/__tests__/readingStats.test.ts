import { describe, expect, it } from 'vitest';
import { parsePageJump, readingStreak } from '../readingStats';

// vitest.config.ts pins TZ=Asia/Bangkok for these tests.

// Streak days are the reader's local calendar days. The old code compared
// UTC date strings against local midnight, so in Bangkok (UTC+7) a read at
// 08:00 today was filed under a different day and the streak showed 0.
describe('readingStreak (TZ=Asia/Bangkok)', () => {
  const at = (iso: string) => new Date(iso).getTime();

  it('runs in UTC+7', () => {
    expect(new Date('2026-09-30T00:00:00Z').getTimezoneOffset()).toBe(-420);
  });

  it('counts a read this morning as today', () => {
    const now = new Date('2026-09-30T21:00:00+07:00');
    const history = [{ timestamp: at('2026-09-30T09:00:00+07:00'), chaptersRead: 2 }];
    expect(readingStreak(history, now)).toBe(1);
  });

  it('counts consecutive local days, including late-evening reads', () => {
    const now = new Date('2026-09-30T21:00:00+07:00');
    const history = [
      { timestamp: at('2026-09-30T20:00:00+07:00') },
      { timestamp: at('2026-09-29T23:30:00+07:00') },
      { timestamp: at('2026-09-28T00:15:00+07:00') },
    ];
    expect(readingStreak(history, now)).toBe(3);
  });

  it('stops at a gap and ignores zero-chapter and invalid entries', () => {
    const now = new Date('2026-09-30T12:00:00+07:00');
    const history = [
      { timestamp: at('2026-09-30T10:00:00+07:00') },
      { timestamp: at('2026-09-29T10:00:00+07:00'), chaptersRead: 0 },
      { timestamp: at('2026-09-28T10:00:00+07:00') },
      { timestamp: 'not a date' },
    ];
    expect(readingStreak(history, now)).toBe(1);
  });

  it('is 0 with no reading today', () => {
    const now = new Date('2026-09-30T12:00:00+07:00');
    expect(readingStreak([{ timestamp: at('2026-09-28T10:00:00+07:00') }], now)).toBe(0);
    expect(readingStreak([], now)).toBe(0);
  });
});

// An empty or non-numeric jump box used to navigate to page NaN, which sent
// offset=NaN to the API and fell through to re-scraping the novel.
describe('parsePageJump', () => {
  it('accepts whole numbers inside the range', () => {
    expect(parsePageJump('1', 10)).toBe(1);
    expect(parsePageJump(' 10 ', 10)).toBe(10);
  });

  it('rejects empty, non-numeric, fractional and out-of-range input', () => {
    for (const raw of ['', '   ', 'abc', '2.5', '1e3', '0', '-1', '11']) {
      expect(parsePageJump(raw, 10)).toBeNull();
    }
  });
});
