'use client';

import { useEffect, useState, useCallback } from 'react';
import { useCurrentReadingSession } from '@/hooks/useReadingProgress';

interface ReadingProgressTrackerProps {
  novelId: string;
  chapterNumber: number;
  totalChapters: number;
  scrollProgress?: number; // 0-100 based on scroll position
}

export default function ReadingProgressTracker({
  novelId,
  chapterNumber,
  totalChapters,
  scrollProgress = 0,
}: ReadingProgressTrackerProps) {
  const { currentProgress, saveCurrentProgress } = useCurrentReadingSession(novelId);
  const [lastSaved, setLastSaved] = useState<string | null>(null);
  const [showSaveIndicator, setShowSaveIndicator] = useState(false);

  // Calculate overall progress
  const overallProgress = totalChapters > 0
    ? ((chapterNumber - 1 + scrollProgress / 100) / totalChapters) * 100
    : 0;

  // Auto-save progress every 30 seconds
  const autoSaveProgress = useCallback(async () => {
    await saveCurrentProgress(chapterNumber, overallProgress);
    setLastSaved(new Date().toLocaleTimeString('th-TH'));
    setShowSaveIndicator(true);
    setTimeout(() => setShowSaveIndicator(false), 2000);
  }, [chapterNumber, overallProgress, saveCurrentProgress]);

  useEffect(() => {
    const interval = setInterval(autoSaveProgress, 30000); // Every 30 seconds
    return () => clearInterval(interval);
  }, [autoSaveProgress]);

  // Save on unmount
  useEffect(() => {
    return () => {
      autoSaveProgress();
    };
  }, [autoSaveProgress]);

  return (
    <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl p-4">
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300">
          📖 ความคืบหน้าการอ่าน
        </h3>
        
        {showSaveIndicator && (
          <span className="text-xs text-green-600 dark:text-green-400 flex items-center gap-1">
            <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
            </svg>
            บันทึกแล้ว
          </span>
        )}
      </div>

      {/* Progress Bar */}
      <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2 mb-2">
        <div
          className="bg-gradient-to-r from-blue-600 to-purple-600 h-2 rounded-full transition-all duration-300"
          style={{ width: `${Math.min(overallProgress, 100)}%` }}
        />
      </div>

      {/* Progress Info */}
      <div className="flex items-center justify-between text-xs text-gray-500 dark:text-gray-400">
        <span>
          บทที่ {chapterNumber}/{totalChapters}
        </span>
        <span>
          {overallProgress.toFixed(1)}%
        </span>
      </div>

      {/* Last Read Info */}
      {currentProgress && (
        <div className="mt-3 pt-3 border-t border-gray-200 dark:border-gray-700">
          <p className="text-xs text-gray-500 dark:text-gray-400">
            อ่านล่าสุด: บทที่ {currentProgress.chapter_number}
            {lastSaved && ` • ${lastSaved}`}
          </p>
        </div>
      )}
    </div>
  );
}
