'use client';

import { useState } from 'react';
import type { ReadingProgress, Bookmark } from '@/lib/types/features';

interface ResumeReadingButtonProps {
  novelId: string;
  progress?: ReadingProgress | null;
  bookmarks?: Bookmark[];
  onNavigate: (chapterNumber: number) => void;
}

export default function ResumeReadingButton({
  novelId,
  progress,
  bookmarks = [],
  onNavigate,
}: ResumeReadingButtonProps) {
  const [showBookmarks, setShowBookmarks] = useState(false);

  if (!progress && bookmarks.length === 0) {
    return null;
  }

  return (
    <div className="space-y-3">
      {/* Resume Reading Button */}
      {progress && (
        <button
          onClick={() => onNavigate(progress.chapter_number)}
          className="w-full py-3 px-4 bg-gradient-to-r from-blue-600 to-purple-600 text-white rounded-xl font-semibold hover:opacity-90 transition-all flex items-center justify-center gap-2"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
          </svg>
          อ่านต่อ - บทที่ {progress.chapter_number}
        </button>
      )}

      {/* Bookmarks Button */}
      {bookmarks.length > 0 && (
        <div>
          <button
            onClick={() => setShowBookmarks(!showBookmarks)}
            className="w-full py-3 px-4 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 rounded-xl font-semibold hover:bg-gray-50 dark:hover:bg-gray-700 transition-all flex items-center justify-center gap-2"
          >
            <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
              <path d="M5 4a2 2 0 012-2h6a2 2 0 012 2v14l-5-2.5L5 18V4z" />
            </svg>
            ที่คั่นหนังสือ ({bookmarks.length})
          </button>

          {/* Bookmarks List */}
          {showBookmarks && (
            <div className="mt-2 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden">
              {bookmarks.map((bookmark) => (
                <button
                  key={bookmark.id}
                  onClick={() => onNavigate(bookmark.chapter_number)}
                  className="w-full px-4 py-3 text-left hover:bg-gray-50 dark:hover:bg-gray-800 border-b border-gray-200 dark:border-gray-700 last:border-b-0 transition-colors"
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-medium text-gray-900 dark:text-white text-sm">
                        บทที่ {bookmark.chapter_number}
                      </p>
                      {bookmark.note && (
                        <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                          {bookmark.note}
                        </p>
                      )}
                    </div>
                    <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                    </svg>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
