'use client';

import { useState, useEffect } from 'react';
import { useToast } from '@/providers/ToastProvider';
import { offlineStorage, OfflineNovel } from '@/lib/offline-storage';
import { epubGenerator } from '@/lib/epub-generator';

interface OfflineChapterData {
  chapterNumber: number;
  title: string;
  originalTitle: string;
  content: string;
  translatedContent: string;
}

export default function OfflinePage() {
  const { success, error: showError, info } = useToast();
  const [offlineNovels, setOfflineNovels] = useState<OfflineNovel[]>([]);
  const [loading, setLoading] = useState(true);
  const [storageUsage, setStorageUsage] = useState<{ used: number; total: number }>({ used: 0, total: 0 });

  useEffect(() => {
    loadOfflineNovels();
  }, []);

  const loadOfflineNovels = async () => {
    setLoading(true);
    try {
      const [novels, usage] = await Promise.all([
        offlineStorage.getAllNovels(),
        offlineStorage.getStorageUsage(),
      ]);
      setOfflineNovels(novels);
      setStorageUsage(usage);
    } catch (err) {
      showError('ไม่สามารถโหลดนิยายออฟไลน์ได้');
    } finally {
      setLoading(false);
    }
  };

  const formatSize = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const handleDeleteNovel = async (novelId: string) => {
    if (!confirm('ลบนิยายออฟไลน์นี้?')) return;
    try {
      await offlineStorage.deleteNovel(novelId);
      success('ลบนิยายออฟไลน์แล้ว');
      loadOfflineNovels();
    } catch (err) {
      showError('เกิดข้อผิดพลาดในการลบ');
    }
  };

  const handleExportEpub = async (novel: OfflineNovel) => {
    info('กำลังสร้าง EPUB...');
    try {
      const chapters: any[] = novel.chapters.map(ch => ({
        chapterNumber: ch.chapterNumber,
        title: ch.title,
        originalTitle: ch.originalTitle,
        content: ch.content,
        translatedContent: ch.translatedContent,
      }));

      await epubGenerator.downloadEpub(
        {
          title: novel.title,
          author: novel.author || 'ไม่ทราบผู้แต่ง',
          description: `นิยายออฟไลน์ - ${novel.chapters.length} บท`,
          language: 'th',
        },
        chapters,
        `${novel.title.replace(/[^a-zA-Z0-9ก-๙]/g, '_')}.epub`,
        { includeTranslated: true }
      );

      success('ดาวน์โหลด EPUB เรียบร้อย!');
    } catch (err: any) {
      showError(`สร้าง EPUB ล้มเหลว: ${err.message}`);
    }
  };

  return (
    <div className="max-w-4xl mx-auto p-6 space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">📴 นิยายออฟไลน์</h1>
        <p className="text-gray-500 dark:text-gray-400 mt-1">
          นิยายที่ดาวน์โหลดไว้สำหรับอ่านแบบไม่ใช้อินเทอร์เน็ต
        </p>
      </div>

      {/* Storage Usage */}
      <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700 p-4">
        <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">พื้นที่จัดเก็บ</h3>
        <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2 mb-2">
          <div
            className="bg-gradient-to-r from-blue-600 to-purple-600 h-2 rounded-full transition-all"
            style={{ width: `${storageUsage.total > 0 ? (storageUsage.used / storageUsage.total) * 100 : 0}%` }}
          />
        </div>
        <p className="text-xs text-gray-500 dark:text-gray-400">
          ใช้ไป {formatSize(storageUsage.used)} จาก {formatSize(storageUsage.total)}
        </p>
      </div>

      {/* Loading State */}
      {loading ? (
        <div className="flex justify-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
        </div>
      ) : offlineNovels.length === 0 ? (
        /* Empty State */
        <div className="text-center py-12 bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700">
          <div className="text-6xl mb-4">📴</div>
          <p className="text-gray-500 dark:text-gray-400 font-medium">ยังไม่มีนิยายออฟไลน์</p>
          <p className="text-sm text-gray-400 dark:text-gray-500 mt-2">
            ไปที่หน้าไลบรารีเพื่อดาวน์โหลดนิยายสำหรับอ่านออฟไลน์
          </p>
        </div>
      ) : (
        /* Novels List */
        <div className="space-y-3">
          {offlineNovels.map(novel => (
            <div
              key={novel.novelId}
              className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700 p-4"
            >
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <h3 className="font-semibold text-gray-900 dark:text-white">
                    {novel.title}
                  </h3>
                  <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                    {novel.chapters.length} บท • {formatSize(novel.totalSize)}
                  </p>
                  <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
                    ดาวน์โหลดเมื่อ {new Date(novel.downloadedAt).toLocaleDateString('th-TH')}
                  </p>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => handleExportEpub(novel)}
                    className="px-3 py-2 bg-green-600 text-white rounded-lg text-sm hover:bg-green-700 transition-colors flex items-center gap-2"
                  >
                    📖 Export EPUB
                  </button>
                  <button
                    onClick={() => handleDeleteNovel(novel.novelId)}
                    className="px-3 py-2 bg-red-100 dark:bg-red-900/20 text-red-600 dark:text-red-400 rounded-lg text-sm hover:bg-red-200 dark:hover:bg-red-900/30 transition-colors"
                  >
                    🗑️ ลบ
                  </button>
                </div>
              </div>

              {/* Chapter List Preview */}
              <div className="mt-3 pt-3 border-t border-gray-200 dark:border-gray-700">
                <p className="text-xs text-gray-500 dark:text-gray-400 mb-2">
                  บทที่ {novel.chapters[0]?.chapterNumber} - {novel.chapters[novel.chapters.length - 1]?.chapterNumber}
                </p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
