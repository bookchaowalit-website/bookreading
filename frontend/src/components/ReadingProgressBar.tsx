'use client';

interface ReadingProgressBarProps {
  currentChapter: number;
  totalChapters: number;
  scrollProgress: number; // 0-100
  wordCount: number;
  estimatedReadTime: number; // minutes
}

export default function ReadingProgressBar({
  currentChapter,
  totalChapters,
  scrollProgress,
  wordCount,
  estimatedReadTime,
}: ReadingProgressBarProps) {
  return (
    <div className="sticky top-0 z-20 bg-white/80 dark:bg-gray-900/80 backdrop-blur-lg border-b border-gray-200 dark:border-gray-800">
      {/* Scroll Progress Bar */}
      <div className="h-1 bg-gray-200 dark:bg-gray-700">
        <div
          className="h-full bg-gradient-to-r from-blue-600 to-purple-600 transition-all duration-150"
          style={{ width: `${scrollProgress}%` }}
        />
      </div>

      {/* Info Bar */}
      <div className="flex items-center justify-between px-4 py-2 text-xs text-gray-500 dark:text-gray-400">
        <div className="flex items-center gap-4">
          <span>
            บทที่ <span className="font-semibold text-gray-900 dark:text-white">{currentChapter}</span>
            {totalChapters > 0 && <span> / {totalChapters}</span>}
          </span>
          {wordCount > 0 && (
            <span className="hidden sm:inline">
              {wordCount.toLocaleString()} คำ
            </span>
          )}
        </div>
        <div className="flex items-center gap-4">
          {estimatedReadTime > 0 && (
            <span className="hidden sm:inline">
              อ่านประมาณ {estimatedReadTime} นาที
            </span>
          )}
          <span>
            {Math.round(scrollProgress)}%
          </span>
        </div>
      </div>
    </div>
  );
}
