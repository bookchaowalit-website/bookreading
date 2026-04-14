'use client';

import { useState } from 'react';

interface AddBookmarkButtonProps {
  novelId: string;
  chapterNumber: number;
  position?: number;
  onAddBookmark: (
    novelId: string,
    chapterNumber: number,
    position: number,
    note?: string
  ) => Promise<boolean>;
}

export default function AddBookmarkButton({
  novelId,
  chapterNumber,
  position = 0,
  onAddBookmark,
}: AddBookmarkButtonProps) {
  const [showForm, setShowForm] = useState(false);
  const [note, setNote] = useState('');
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);

  const handleSubmit = async () => {
    setLoading(true);
    try {
      const result = await onAddBookmark(novelId, chapterNumber, position, note || undefined);
      if (result) {
        setSuccess(true);
        setShowForm(false);
        setNote('');
        setTimeout(() => setSuccess(false), 2000);
      }
    } catch (error) {
      console.error('Failed to add bookmark:', error);
    } finally {
      setLoading(false);
    }
  };

  if (success) {
    return (
      <div className="flex items-center gap-2 text-green-600 dark:text-green-400 text-sm">
        <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
          <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
        </svg>
        บันทึกที่คั่นแล้ว
      </div>
    );
  }

  if (showForm) {
    return (
      <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg p-3 space-y-3">
        <h4 className="text-sm font-semibold text-gray-900 dark:text-white">
          เพิ่มที่คั่นหนังสือ
        </h4>
        
        <div className="text-xs text-gray-500 dark:text-gray-400">
          บทที่ {chapterNumber} • ตำแหน่ง {position}
        </div>

        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="บันทึก (ไม่บังคับ)..."
          rows={2}
          className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg dark:bg-gray-800 dark:text-white text-sm resize-none"
        />

        <div className="flex gap-2">
          <button
            onClick={handleSubmit}
            disabled={loading}
            className="flex-1 py-2 px-3 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors disabled:opacity-50"
          >
            {loading ? 'กำลังบันทึก...' : 'บันทึก'}
          </button>
          <button
            onClick={() => {
              setShowForm(false);
              setNote('');
            }}
            className="flex-1 py-2 px-3 bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg text-sm font-medium hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors"
          >
            ยกเลิก
          </button>
        </div>
      </div>
    );
  }

  return (
    <button
      onClick={() => setShowForm(true)}
      className="flex items-center gap-2 px-3 py-2 text-sm text-gray-600 dark:text-gray-400 hover:text-blue-600 dark:hover:text-blue-400 transition-colors"
    >
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z" />
      </svg>
      เพิ่มที่คั่น
    </button>
  );
}
