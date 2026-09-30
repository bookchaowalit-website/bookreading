import { describe, it, expect } from 'vitest';
import { subscriptionNeedsAttention, subscriptionStatusLabel } from '../subscriptionStatus';

describe('subscriptionStatusLabel', () => {
  it.each([
    ['active', 'ใช้งานอยู่'],
    ['canceling', 'กำลังยกเลิก (ใช้งานได้ถึงสิ้นรอบบิล)'],
    ['past_due', 'ชำระเงินไม่สำเร็จ กรุณาอัปเดตวิธีชำระเงิน'],
    ['incomplete', 'รอการชำระเงิน'],
    ['canceled', 'ยกเลิกแล้ว'],
    [' PAST_DUE ', 'ชำระเงินไม่สำเร็จ กรุณาอัปเดตวิธีชำระเงิน'],
  ])('maps %s to a Thai label', (status, label) => {
    expect(subscriptionStatusLabel(status)).toBe(label);
  });

  it('never shows raw unknown identifiers', () => {
    for (const status of ['', null, undefined, 'incomplete_expired', 'weird']) {
      expect(subscriptionStatusLabel(status)).toBe('ไม่ทราบสถานะ');
    }
  });
});

describe('subscriptionNeedsAttention', () => {
  it('flags statuses that need a payment update', () => {
    expect(subscriptionNeedsAttention('past_due')).toBe(true);
    expect(subscriptionNeedsAttention('incomplete')).toBe(true);
    expect(subscriptionNeedsAttention('active')).toBe(false);
    expect(subscriptionNeedsAttention('canceling')).toBe(false);
    expect(subscriptionNeedsAttention(undefined)).toBe(false);
  });
});
