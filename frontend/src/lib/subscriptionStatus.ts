/**
 * Thai labels for the subscription statuses the backend reports
 * (see backend `subscriptionStatusFor`: active, canceling, past_due,
 * incomplete, canceled). Unknown values fall back to a neutral label
 * instead of leaking raw identifiers into the UI.
 */
const STATUS_LABELS: Record<string, string> = {
  active: 'ใช้งานอยู่',
  canceling: 'กำลังยกเลิก (ใช้งานได้ถึงสิ้นรอบบิล)',
  past_due: 'ชำระเงินไม่สำเร็จ กรุณาอัปเดตวิธีชำระเงิน',
  incomplete: 'รอการชำระเงิน',
  canceled: 'ยกเลิกแล้ว',
};

export function subscriptionStatusLabel(status: string | null | undefined): string {
  const key = (status ?? '').trim().toLowerCase();
  if (!key) return 'ไม่ทราบสถานะ';
  return STATUS_LABELS[key] ?? 'ไม่ทราบสถานะ';
}

/** Statuses where the user must act in the billing portal. */
export function subscriptionNeedsAttention(status: string | null | undefined): boolean {
  const key = (status ?? '').trim().toLowerCase();
  return key === 'past_due' || key === 'incomplete';
}
