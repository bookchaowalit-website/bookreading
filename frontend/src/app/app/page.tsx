'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { FEATURED_NOVELS } from '@/lib/novels';
import { useReadingProgress } from '@/hooks/useReadingProgress';
import { useNovelSubscriptions } from '@/hooks/useSubscriptions';

interface SavedNovel {
  id: string;
  title: string;
  author: string;
  chapterNumber: number;
  savedAt: number;
  readingProgress: number;
}

export default function DashboardPage() {
  const [recentNovels, setRecentNovels] = useState<SavedNovel[]>([]);
  const [stats, setStats] = useState({
    totalNovels: 0,
    totalChapters: 0,
    totalWords: 0,
  });
  const [apiStats, setApiStats] = useState({ totalProgress: 0, activeSubscriptions: 0 });

  const userId = typeof window !== 'undefined' ? localStorage.getItem('userId') || undefined : undefined;
  const { progressList } = useReadingProgress(userId);
  const { subscriptions } = useNovelSubscriptions(userId);

  useEffect(() => {
    // Load library from localStorage
    const savedLibrary = localStorage.getItem('novelLibrary');
    if (savedLibrary) {
      const library = JSON.parse(savedLibrary);
      setRecentNovels(library.slice(0, 5));
      setStats({
        totalNovels: library.length,
        totalChapters: library.reduce((acc: number, n: SavedNovel) => acc + 1, 0),
        totalWords: library.reduce((acc: number, n: any) => acc + (n.content?.length || 0), 0),
      });
    }
  }, []);

  useEffect(() => {
    // Update API stats
    setApiStats({
      totalProgress: progressList.length,
      activeSubscriptions: subscriptions.filter(s => s.is_active).length,
    });
  }, [progressList, subscriptions]);

  return (
    <div className="max-w-6xl mx-auto space-y-8">
      {/* Welcome section */}
      <div className="bg-gradient-to-r from-blue-600 to-purple-600 rounded-2xl p-6 text-white">
        <h1 className="text-2xl font-bold mb-2">ยินดีต้อนรับ! 👋</h1>
        <p className="text-blue-100">
          เลือกนิยายที่ต้องการอ่านและเริ่มอ่านได้ทันที
        </p>
      </div>

      {/* Featured Novels */}
      <div>
        <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">📚 นิยายแนะนำ</h2>
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {FEATURED_NOVELS.map(novel => (
            <Link
              key={novel.id}
              href={`/app/reader?novel=${novel.id}`}
              className="group bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700 hover:shadow-lg hover:border-blue-500 transition-all overflow-hidden"
            >
              <div className="flex items-start gap-3 p-4">
                <img
                  src={novel.coverUrl}
                  alt={novel.title}
                  className="w-16 h-20 object-cover rounded-lg shadow group-hover:scale-105 transition-transform"
                  onError={(e) => {
                    e.currentTarget.src = 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" width="64" height="80" viewBox="0 0 64 80"><rect fill="%23e5e7eb" width="64" height="80"/><text x="32" y="45" text-anchor="middle" fill="%236b7280" font-size="12">📚</text></svg>';
                  }}
                />
                <div className="flex-1 min-w-0">
                  <h3 className="font-semibold text-gray-900 dark:text-white truncate group-hover:text-blue-600">
                    {novel.titleTh}
                  </h3>
                  <p className="text-sm text-gray-500 dark:text-gray-400 truncate">
                    {novel.authorTh}
                  </p>
                  <div className="mt-2 flex items-center gap-2 text-xs text-gray-400">
                    <span className="px-2 py-0.5 bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-300 rounded">
                      {novel.category}
                    </span>
                    <span>{novel.totalChapters} บท</span>
                  </div>
                  <p className="mt-2 text-xs text-gray-400 dark:text-gray-500 line-clamp-2">
                    {novel.descriptionTh}
                  </p>
                </div>
              </div>
            </Link>
          ))}
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <div className="bg-white dark:bg-gray-900 rounded-xl p-4 border border-gray-200 dark:border-gray-700">
          <div className="text-3xl font-bold text-gray-900 dark:text-white">{stats.totalNovels}</div>
          <div className="text-sm text-gray-500 dark:text-gray-400">นิยายในไลบรารี</div>
        </div>
        <div className="bg-white dark:bg-gray-900 rounded-xl p-4 border border-gray-200 dark:border-gray-700">
          <div className="text-3xl font-bold text-gray-900 dark:text-white">{stats.totalChapters}</div>
          <div className="text-sm text-gray-500 dark:text-gray-400">บทที่อ่าน</div>
        </div>
        <div className="bg-white dark:bg-gray-900 rounded-xl p-4 border border-gray-200 dark:border-gray-700">
          <div className="text-3xl font-bold text-gray-900 dark:text-white">{Math.round(stats.totalWords / 1000)}K</div>
          <div className="text-sm text-gray-500 dark:text-gray-400">คำที่แปล</div>
        </div>
        <div className="bg-white dark:bg-gray-900 rounded-xl p-4 border border-gray-200 dark:border-gray-700">
          <div className="text-3xl font-bold text-gray-900 dark:text-white">{apiStats.totalProgress}</div>
          <div className="text-sm text-gray-500 dark:text-gray-400">บันทึกความคืบหน้า</div>
        </div>
        <div className="bg-white dark:bg-gray-900 rounded-xl p-4 border border-gray-200 dark:border-gray-700">
          <div className="text-3xl font-bold text-gray-900 dark:text-white">{apiStats.activeSubscriptions}</div>
          <div className="text-sm text-gray-500 dark:text-gray-400">ติดตามอยู่</div>
        </div>
      </div>

      {/* Quick Actions */}
      <div>
        <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">การดำเนินการด่วน</h2>
        <div className="grid sm:grid-cols-2 lg:grid-cols-5 gap-4">
          <Link
            href="/app/reader"
            className="group bg-white dark:bg-gray-900 rounded-xl p-4 border border-gray-200 dark:border-gray-700 hover:shadow-lg transition-all hover:-translate-y-1"
          >
            <div className="w-12 h-12 bg-gradient-to-br from-blue-500 to-blue-600 rounded-xl flex items-center justify-center text-2xl mb-3 group-hover:scale-110 transition-transform">
              📖
            </div>
            <h3 className="font-semibold text-gray-900 dark:text-white">อ่านนิยาย</h3>
            <p className="text-sm text-gray-500 dark:text-gray-400">เลือกนิยายที่ต้องการอ่าน</p>
          </Link>
          <Link
            href="/app/library"
            className="group bg-white dark:bg-gray-900 rounded-xl p-4 border border-gray-200 dark:border-gray-700 hover:shadow-lg transition-all hover:-translate-y-1"
          >
            <div className="w-12 h-12 bg-gradient-to-br from-purple-500 to-purple-600 rounded-xl flex items-center justify-center text-2xl mb-3 group-hover:scale-110 transition-transform">
              📚
            </div>
            <h3 className="font-semibold text-gray-900 dark:text-white">ไลบรารี</h3>
            <p className="text-sm text-gray-500 dark:text-gray-400">ดูนิยายที่บันทึกไว้</p>
          </Link>
          <Link
            href="/app/terminology"
            className="group bg-white dark:bg-gray-900 rounded-xl p-4 border border-gray-200 dark:border-gray-700 hover:shadow-lg transition-all hover:-translate-y-1"
          >
            <div className="w-12 h-12 bg-gradient-to-br from-green-500 to-green-600 rounded-xl flex items-center justify-center text-2xl mb-3 group-hover:scale-110 transition-transform">
              📝
            </div>
            <h3 className="font-semibold text-gray-900 dark:text-white">คำศัพท์</h3>
            <p className="text-sm text-gray-500 dark:text-gray-400">จัดการคำศัพท์ที่ใช้</p>
          </Link>
          {/* New: Subscriptions link */}
          <Link
            href="/app/chapters"
            className="group bg-white dark:bg-gray-900 rounded-xl p-4 border border-gray-200 dark:border-gray-700 hover:shadow-lg transition-all hover:-translate-y-1"
          >
            <div className="w-12 h-12 bg-gradient-to-br from-teal-500 to-teal-600 rounded-xl flex items-center justify-center text-2xl mb-3 group-hover:scale-110 transition-transform">
              🔔
            </div>
            <h3 className="font-semibold text-gray-900 dark:text-white">ติดตาม</h3>
            <p className="text-sm text-gray-500 dark:text-gray-400">จัดการการติดตามนิยาย</p>
          </Link>
          <Link
            href="/app/settings"
            className="group bg-white dark:bg-gray-900 rounded-xl p-4 border border-gray-200 dark:border-gray-700 hover:shadow-lg transition-all hover:-translate-y-1"
          >
            <div className="w-12 h-12 bg-gradient-to-br from-orange-500 to-orange-600 rounded-xl flex items-center justify-center text-2xl mb-3 group-hover:scale-110 transition-transform">
              ⚙️
            </div>
            <h3 className="font-semibold text-gray-900 dark:text-white">การตั้งค่า</h3>
            <p className="text-sm text-gray-500 dark:text-gray-400">ปรับแต่งการใช้งาน</p>
          </Link>
        </div>
      </div>

      {/* Recent Novels */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">อ่านล่าสุด</h2>
          <Link href="/app/library" className="text-sm text-blue-600 hover:underline">
            ดูทั้งหมด
          </Link>
        </div>

        {recentNovels.length === 0 ? (
          <div className="bg-white dark:bg-gray-900 rounded-xl p-8 border border-gray-200 dark:border-gray-700 text-center">
            <div className="text-4xl mb-4">📭</div>
            <p className="text-gray-500 dark:text-gray-400 mb-4">ยังไม่มีนิยายในไลบรารี</p>
            <Link
              href="/app/reader"
              className="inline-block px-6 py-2 bg-gradient-to-r from-blue-600 to-purple-600 text-white rounded-lg font-medium hover:opacity-90 transition-opacity"
            >
              เริ่มอ่านนิยายใหม่
            </Link>
          </div>
        ) : (
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {recentNovels.map((novel) => (
              <Link
                key={novel.id}
                href={`/app/reader?novel=${novel.id}`}
                className="bg-white dark:bg-gray-900 rounded-xl p-4 border border-gray-200 dark:border-gray-700 hover:shadow-lg transition-all"
              >
                <h3 className="font-semibold text-gray-900 dark:text-white truncate">{novel.title}</h3>
                <p className="text-sm text-gray-500 dark:text-gray-400">{novel.author || 'ไม่ทราบผู้แต่ง'}</p>
                <div className="mt-3 flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
                  <span>บท {novel.chapterNumber}</span>
                  <span>•</span>
                  <span>{new Date(novel.savedAt).toLocaleDateString('th-TH')}</span>
                </div>
                <div className="mt-3">
                  <div className="h-1.5 bg-gray-100 dark:bg-gray-700 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-gradient-to-r from-blue-500 to-purple-500"
                      style={{ width: `${novel.readingProgress || 0}%` }}
                    />
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>

      {/* Tips */}
      <div className="bg-blue-50 dark:bg-blue-900/20 rounded-xl p-6 border border-blue-200 dark:border-blue-800">
        <h3 className="font-semibold text-blue-900 dark:text-blue-100 mb-2">💡 เคล็ดลับ</h3>
        <ul className="text-sm text-blue-700 dark:text-blue-300 space-y-1">
          <li>• เลือกนิยายจากรายการแนะนำแล้วเริ่มอ่านได้ทันที</li>
          <li>• ปรับแก้คำแปลตัวละครในหน้าคำศัพท์เพื่อให้แปลสอดคล้องตลอดเรื่อง</li>
          <li>• บันทึกนิยายเพื่ออ่านต่อได้โดยไม่ต้องแปลใหม่</li>
        </ul>
      </div>
    </div>
  );
}
