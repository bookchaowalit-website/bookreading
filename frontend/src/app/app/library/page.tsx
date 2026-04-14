'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { FEATURED_NOVELS } from '@/lib/novels';
import ResumeReadingButton from '@/components/ResumeReadingButton';
import Skeleton from '@/components/Skeleton';
import { useReadingProgress } from '@/hooks/useReadingProgress';
import type { ReadingProgress } from '@/lib/types/features';
import { offlineStorage } from '@/lib/offline-storage';
import { epubGenerator } from '@/lib/epub-generator';
import { useToast } from '@/providers/ToastProvider';

interface SavedNovel {
  id: string;
  novelId: string;
  url: string;
  title: string;
  originalTitle: string;
  author: string;
  chapterNumber: number;
  content: string;
  translatedContent: string;
  terminology: any[];
  savedAt: number;
  lastReadAt: number;
  readingProgress: number;
}

export default function LibraryPage() {
  const { success, error: showError, info, warning } = useToast();
  const [hydrated, setHydrated] = useState(false);
  const [library, setLibrary] = useState<SavedNovel[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState<'recent' | 'title' | 'progress'>('recent');
  const [apiProgressMap, setApiProgressMap] = useState<Record<string, ReadingProgress | null>>({});
  const [downloadingNovel, setDownloadingNovel] = useState<string | null>(null);

  const userId = typeof window !== 'undefined' ? localStorage.getItem('userId') || undefined : undefined;
  const { progressList, getProgressForNovel } = useReadingProgress(userId);

  // Mark as hydrated to avoid SSR/CSR mismatch
  useEffect(() => {
    setHydrated(true);
  }, []);

  useEffect(() => {
    // Build progress map from API
    if (progressList.length > 0) {
      const map: Record<string, ReadingProgress | null> = {};
      progressList.forEach(p => {
        map[p.novel_id] = p;
      });
      setApiProgressMap(map);
    }
  }, [progressList]);

  useEffect(() => {
    const savedLibrary = localStorage.getItem('novelLibrary');
    if (savedLibrary) {
      let novels = JSON.parse(savedLibrary);

      // Sort
      if (sortBy === 'recent') {
        novels.sort((a: SavedNovel, b: SavedNovel) => b.lastReadAt - a.lastReadAt);
      } else if (sortBy === 'title') {
        novels.sort((a: SavedNovel, b: SavedNovel) => a.title.localeCompare(b.title));
      } else if (sortBy === 'progress') {
        novels.sort((a: SavedNovel, b: SavedNovel) => b.readingProgress - a.readingProgress);
      }

      setLibrary(novels);
    }
  }, [sortBy]);

  const deleteFromLibrary = (id: string) => {
    const newLibrary = library.filter(n => n.id !== id);
    setLibrary(newLibrary);
    localStorage.setItem('novelLibrary', JSON.stringify(newLibrary));
  };

  // Download for offline reading
  const downloadForOffline = async (novel: SavedNovel) => {
    setDownloadingNovel(novel.id);
    info('กำลังดาวน์โหลดสำหรับอ่านออฟไลน์...');

    try {
      // Save chapter to IndexedDB (in real app, fetch all chapters)
      await offlineStorage.saveChapter({
        novelId: novel.novelId || novel.id,
        chapterNumber: novel.chapterNumber || 1,
        title: novel.title,
        originalTitle: novel.originalTitle || novel.title,
        content: novel.content || '',
        translatedContent: novel.translatedContent || '',
        downloadedAt: Date.now(),
        size: (novel.content?.length || 0) + (novel.translatedContent?.length || 0),
      });

      success('ดาวน์โหลดสำหรับอ่านออฟไลน์เรียบร้อย!');
    } catch (err: any) {
      showError('เกิดข้อผิดพลาดในการดาวน์โหลด');
    } finally {
      setDownloadingNovel(null);
    }
  };

  // Export as EPUB
  const exportAsEpub = async (novel: SavedNovel) => {
    info('กำลังสร้าง EPUB...');

    try {
      await epubGenerator.downloadEpub(
        {
          title: novel.title,
          author: novel.author || 'ไม่ทราบผู้แต่ง',
          description: novel.content?.substring(0, 200) || '',
          language: 'th',
        },
        [{
          chapterNumber: novel.chapterNumber || 1,
          title: novel.title,
          originalTitle: novel.originalTitle || novel.title,
          content: novel.content || '',
          translatedContent: novel.translatedContent || '',
        }],
        `${novel.title.replace(/[^a-zA-Z0-9ก-๙]/g, '_')}.epub`,
        { includeTranslated: true }
      );

      success('ดาวน์โหลด EPUB เรียบร้อย!');
    } catch (err: any) {
      showError(`สร้าง EPUB ล้มเหลว: ${err.message}`);
    }
  };

  const filteredLibrary = library.filter(novel =>
    novel.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
    novel.author.toLowerCase().includes(searchQuery.toLowerCase())
  );

  // Show skeleton during hydration
  if (!hydrated) {
    return (
      <div className="max-w-6xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <Skeleton variant="title" className="w-48" />
          <Skeleton variant="card" className="w-32 h-10" />
        </div>
        <Skeleton count={3} variant="card" />
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">📚 ไลบรารี</h1>
          <p className="text-gray-500 dark:text-gray-400">นิยายที่บันทึกไว้ {library.length} เรื่อง</p>
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
        <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">📚 นิยายแนะนำ</h3>
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
            placeholder="🔍 ค้นหานิยาย..."
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
          <div className="text-6xl mb-4">📭</div>
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
            const apiProgress = apiProgressMap[novel.novelId || novel.id] || null;
            const displayProgress = apiProgress || {
              chapter_number: novel.chapterNumber,
              progress_percentage: novel.readingProgress || 0,
              novel_id: novel.novelId || novel.id,
            };

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
                      onClick={() => deleteFromLibrary(novel.id)}
                      className="p-2 text-gray-400 hover:text-red-500 transition-colors"
                    >
                      🗑️
                    </button>
                  </div>

                  <div className="mt-3 flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
                    <span>บท {novel.chapterNumber}</span>
                    <span>•</span>
                    <span>{novel.terminology?.length || 0} คำศัพท์</span>
                  </div>

                  {/* Progress bar - sync from API */}
                  <div className="mt-3">
                    <div className="flex items-center justify-between text-xs text-gray-500 dark:text-gray-400 mb-1">
                      <span>ความคืบหน้า</span>
                      <span>{apiProgress?.progress_percentage || novel.readingProgress || 0}%</span>
                    </div>
                    <div className="h-1.5 bg-gray-100 dark:bg-gray-700 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-gradient-to-r from-blue-500 to-purple-500"
                        style={{ width: `${apiProgress?.progress_percentage || novel.readingProgress || 0}%` }}
                      />
                    </div>
                  </div>

                  <div className="mt-3 text-xs text-gray-400 dark:text-gray-500">
                    อ่านล่าสุด: {new Date(novel.lastReadAt).toLocaleDateString('th-TH')}
                  </div>

                  {/* New: Resume Reading Button */}
                  <div className="mt-3">
                    <ResumeReadingButton
                      novelId={novel.novelId || novel.id}
                      progress={apiProgress}
                      bookmarks={[]}
                      onNavigate={(chapterNumber) => {
                        window.location.href = `/app/reader?novel=${novel.novelId || novel.id}&chapter=${chapterNumber}`;
                      }}
                    />
                  </div>

                  {!apiProgress && (
                    <Link
                      href={`/app/reader?novel=${novel.novelId || novel.id}&chapter=${novel.chapterNumber}`}
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
