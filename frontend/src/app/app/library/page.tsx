'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { FEATURED_NOVELS } from '@/lib/novels';
import ResumeReadingButton from '@/components/ResumeReadingButton';
import Skeleton from '@/components/Skeleton';
import { useReadingProgress } from '@/hooks/useReadingProgress';
import { useLibrary } from '@/hooks/useLibrary';
import { Inbox, Search } from 'lucide-react';
import type { ReadingProgress } from '@/lib/types/features';
import { offlineStorage } from '@/lib/offline-storage';
import { epubGenerator } from '@/lib/epub-generator';
import { useToast } from '@/providers/ToastProvider';
import { Library as LibraryIcon, Trash2, Loader2 } from 'lucide-react';

interface LibraryNovel {
  id: string;
  novel_id: string;
  title: string;
  author: string;
  chapter_number: number;
  reading_progress: number;
  last_read_at: string;
  saved_at: string;
}

export default function LibraryPage() {
  const { success, error: showError, info, warning } = useToast();
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState<'recent' | 'title' | 'progress'>('recent');
  const [apiProgressMap, setApiProgressMap] = useState<Record<string, ReadingProgress | null>>({});
  const [downloadingNovel, setDownloadingNovel] = useState<string | null>(null);
  const [localLibrary, setLocalLibrary] = useState<LibraryNovel[]>([]);

  const userId = typeof window !== 'undefined' ? localStorage.getItem('userId') || undefined : undefined;
  const { progressList } = useReadingProgress(userId);
  const { novels, loading: libraryLoading, refetch: refetchLibrary } = useLibrary();

  // Build progress map from API
  useEffect(() => {
    if (progressList.length > 0) {
      const map: Record<string, ReadingProgress | null> = {};
      progressList.forEach(p => {
        map[p.novel_id] = p;
      });
      setApiProgressMap(map);
    }
  }, [progressList]);

  // Merge backend novels with localStorage fallback
  useEffect(() => {
    if (novels.length > 0) {
      setLocalLibrary(novels);
    } else if (novels.length === 0 && !libraryLoading) {
      // API returned empty, try localStorage fallback
      const saved = localStorage.getItem('novelLibrary');
      if (saved) {
        const parsed = JSON.parse(saved);
        setLocalLibrary(parsed.map((n: any) => ({
          id: n.id || n.novelId,
          novel_id: n.novelId || n.id,
          title: n.title,
          author: n.author || 'ไม่ทราบผู้แต่ง',
          chapter_number: n.chapterNumber || 1,
          reading_progress: n.readingProgress || 0,
          last_read_at: new Date(n.lastReadAt || 0).toISOString(),
          saved_at: new Date(n.savedAt || 0).toISOString(),
        })));
      }
    }
  }, [novels, libraryLoading]);

  // Sort library
  const sortedLibrary = [...localLibrary].sort((a, b) => {
    if (sortBy === 'recent') {
      return new Date(b.last_read_at).getTime() - new Date(a.last_read_at).getTime();
    } else if (sortBy === 'title') {
      return a.title.localeCompare(b.title);
    } else {
      return (b.reading_progress || 0) - (a.reading_progress || 0);
    }
  });

  const filteredLibrary = sortedLibrary.filter(novel =>
    novel.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
    novel.author.toLowerCase().includes(searchQuery.toLowerCase())
  );

  // Loading state
  if (libraryLoading && localLibrary.length === 0) {
    return (
      <div className="max-w-6xl mx-auto space-y-6">
        <Skeleton variant="title" className="w-48 mb-6" />
        <Skeleton variant="text" className="w-full h-10 mb-4" />
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          <Skeleton count={3} variant="card" className="h-32" />
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white"><LibraryIcon size={24} className="inline" /> ไลบรารี</h1>
          <p className="text-gray-500 dark:text-gray-400">นิยายที่บันทึกไว้ {filteredLibrary.length} เรื่อง</p>
        </div>
        <Link
          href="/app/reader"
          className="inline-flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-blue-600 to-purple-600 text-white rounded-lg font-medium hover:opacity-90 transition-opacity"
        >
          + เพิ่มนิยายใหม่
        </Link>
      </div>

      {/* Featured Novels Quick Access */}
      <div className="bg-white dark:bg-gray-900 rounded-xl p-4 border border-gray-200 dark:border-gray-700">
        <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3"><LibraryIcon size={16} className="inline" /> นิยายแนะนำ</h3>
        <div className="flex gap-3 overflow-x-auto pb-2">
          {FEATURED_NOVELS.map(novel => (
            <Link
              key={novel.id}
              href={`/app/reader?novel=${novel.id}`}
              className="flex-shrink-0 flex items-center gap-2 px-3 py-2 bg-gray-50 dark:bg-gray-800 rounded-lg hover:bg-blue-50 dark:hover:bg-blue-900/30 transition-colors"
            >
              <img
                src={novel.coverUrl}
                alt={novel.title}
                className="w-8 h-10 object-cover rounded"
                onError={(e) => {
                  e.currentTarget.style.display = 'none';
                }}
              />
              <div>
                <div className="text-sm font-medium text-gray-900 dark:text-white">{novel.titleTh}</div>
                <div className="text-xs text-gray-500">{novel.totalChapters} บท</div>
              </div>
            </Link>
          ))}
        </div>
      </div>

      {/* Search and Sort */}
      <div className="flex flex-col sm:flex-row gap-4">
        <div className="flex-1">
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="ค้นหานิยาย..."
            className="w-full px-4 py-3 border border-gray-300 dark:border-gray-600 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent dark:bg-gray-900 dark:text-white"
          />
        </div>
        <select
          value={sortBy}
          onChange={(e) => setSortBy(e.target.value as any)}
          className="px-4 py-3 border border-gray-300 dark:border-gray-600 rounded-xl dark:bg-gray-900 dark:text-white"
        >
          <option value="recent">อ่านล่าสุด</option>
          <option value="title">ชื่อ</option>
          <option value="progress">ความคืบหน้า</option>
        </select>
      </div>

      {/* Library Grid */}
      {filteredLibrary.length === 0 ? (
        <div className="bg-white dark:bg-gray-900 rounded-2xl p-12 border border-gray-200 dark:border-gray-700 text-center">
          <Inbox size={48} className="mx-auto text-gray-300 dark:text-gray-600 mb-4" />
          <h3 className="text-xl font-semibold text-gray-900 dark:text-white mb-2">
            {searchQuery ? 'ไม่พบนิยาย' : 'ยังไม่มีนิยายในไลบรารี'}
          </h3>
          <p className="text-gray-500 dark:text-gray-400 mb-6">
            {searchQuery ? 'ลองค้นหาด้วยคำอื่น' : 'เริ่มอ่านนิยายและบันทึกไว้'}
          </p>
          {!searchQuery && (
            <Link
              href="/app/reader"
              className="inline-block px-6 py-3 bg-gradient-to-r from-blue-600 to-purple-600 text-white rounded-lg font-medium hover:opacity-90 transition-opacity"
            >
              เริ่มอ่านนิยาย
            </Link>
          )}
        </div>
      ) : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredLibrary.map(novel => {
            const apiProgress = apiProgressMap[novel.novel_id] || null;
            const progressPercent = apiProgress?.progress_percentage || novel.reading_progress || 0;
            const chapterNum = apiProgress?.chapter_number || novel.chapter_number || 1;

            return (
              <div
                key={novel.id}
                className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden hover:shadow-lg transition-shadow"
              >
                <div className="p-4">
                  <div className="flex items-start justify-between">
                    <div className="flex-1 min-w-0">
                      <h3 className="font-semibold text-gray-900 dark:text-white truncate">
                        {novel.title}
                      </h3>
                      <p className="text-sm text-gray-500 dark:text-gray-400 truncate">
                        {novel.author || 'ไม่ทราบผู้แต่ง'}
                      </p>
                    </div>
                    <button
                      onClick={() => {
                        setLocalLibrary(prev => prev.filter(n => n.id !== novel.id));
                        localStorage.setItem('novelLibrary', JSON.stringify(
                          JSON.parse(localStorage.getItem('novelLibrary') || '[]').filter((n: any) => (n.id !== novel.id && n.novelId !== novel.novel_id))
                        ));
                      }}
                      className="p-2 text-gray-400 hover:text-red-500 transition-colors"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>

                  <div className="mt-3 flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
                    <span>บท {chapterNum}</span>
                  </div>

                  {/* Progress bar */}
                  <div className="mt-3">
                    <div className="flex items-center justify-between text-xs text-gray-500 dark:text-gray-400 mb-1">
                      <span>ความคืบหน้า</span>
                      <span>{progressPercent}%</span>
                    </div>
                    <div className="h-1.5 bg-gray-100 dark:bg-gray-700 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-gradient-to-r from-blue-500 to-purple-500"
                        style={{ width: `${progressPercent}%` }}
                      />
                    </div>
                  </div>

                  <div className="mt-3 text-xs text-gray-400 dark:text-gray-500">
                    อ่านล่าสุด: {new Date(novel.last_read_at).toLocaleDateString('th-TH')}
                  </div>

                  {/* Resume Reading Button */}
                  <div className="mt-3">
                    <ResumeReadingButton
                      novelId={novel.novel_id}
                      progress={apiProgress}
                      bookmarks={[]}
                      onNavigate={(chapterNumber) => {
                        window.location.href = `/app/reader?novel=${novel.novel_id}&chapter=${chapterNumber}`;
                      }}
                    />
                  </div>

                  {!apiProgress && (
                    <Link
                      href={`/app/reader?novel=${novel.novel_id}&chapter=${chapterNum}`}
                      className="mt-2 block w-full py-2 text-center bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-300 rounded-lg hover:bg-blue-100 dark:hover:bg-blue-900/50 transition-colors text-sm font-medium"
                    >
                      เปิดอ่าน
                    </Link>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
