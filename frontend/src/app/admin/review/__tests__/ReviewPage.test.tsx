/**
 * The review queue hides approve/edit/reject from non-admins (the backend
 * answers 403 for them) and shows them to admins, based on `role` from
 * GET /api/users/me.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

const getMe = vi.fn();
const approve = vi.fn();

vi.mock('@/lib/api', async () => {
  const actual = await vi.importActual<typeof import('@/lib/api')>('@/lib/api');
  return {
    ...actual,
    authApi: { getMe: () => getMe() },
    aiReviewApi: {
      getPending: vi.fn().mockResolvedValue({
        items: [
          {
            id: 'item-1',
            novel_id: 'novel-1',
            novel_title: 'Fixture Novel',
            chapter_number: 7,
            translated_text: 'ข้อความแปล',
            grade: 'C',
            overall_score: 60,
            issues: [],
            strengths: [],
            priority: 3,
            created_at: '2026-01-01T00:00:00Z',
          },
        ],
      }),
      getStats: vi.fn().mockResolvedValue({ pending: 1, approved: 0, rejected: 0, total_processed: 0 }),
      approve: (...args: unknown[]) => approve(...args),
      edit: vi.fn(),
      reject: vi.fn(),
    },
  };
});

import ReviewQueuePage from '../page';

async function openFirstItem() {
  render(<ReviewQueuePage />);
  fireEvent.click(await screen.findByText('Fixture Novel'));
  // The editor for the selected item is now visible.
  return screen.findByLabelText('ข้อความที่แปล');
}

describe('ReviewQueuePage moderation controls', () => {
  beforeEach(() => {
    getMe.mockReset();
    approve.mockReset();
    window.matchMedia = vi.fn().mockReturnValue({ matches: false }) as unknown as typeof window.matchMedia;
  });

  it('hides approve/edit/reject for a regular user', async () => {
    getMe.mockResolvedValue({ id: 'u1', role: 'user' });
    const editor = await openFirstItem();

    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('ดูได้อย่างเดียว'));
    expect(screen.queryByRole('button', { name: /อนุมัติ/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /บันทึกการแก้ไข/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /ปฏิเสธ/ })).not.toBeInTheDocument();
    expect(editor).toHaveAttribute('readonly');

    // Keyboard shortcuts do not open the confirm dialog either.
    fireEvent.keyDown(window, { key: 'a' });
    expect(screen.queryByText(/ยืนยันการอนุมัติ/)).not.toBeInTheDocument();
  });

  it('treats a failed /api/users/me as non-admin', async () => {
    getMe.mockRejectedValue(new Error('401'));
    await openFirstItem();
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('ดูได้อย่างเดียว'));
    expect(screen.queryByRole('button', { name: /อนุมัติ/ })).not.toBeInTheDocument();
  });

  it('shows the controls to an admin', async () => {
    getMe.mockResolvedValue({ id: 'a1', role: 'admin' });
    const editor = await openFirstItem();

    const approveButton = await screen.findByRole('button', { name: /อนุมัติ/ });
    expect(screen.getByRole('button', { name: /บันทึกการแก้ไข/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /ปฏิเสธ/ })).toBeInTheDocument();
    expect(editor).not.toHaveAttribute('readonly');

    approve.mockResolvedValue({});
    fireEvent.click(approveButton);
    await waitFor(() => expect(approve).toHaveBeenCalledWith('item-1'));
  });
});
