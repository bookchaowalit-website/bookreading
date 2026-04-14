'use client';

import { useState, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { novelApi, chapterApi, aiApi, Chapter, Novel } from '@/lib/api';
import { FEATURED_NOVELS, getNovelById, FeaturedNovel } from '@/lib/novels';
import SubscribeButton from '@/components/SubscribeButton';
import { useNovelSubscriptions, useNovelSubscriptionStatus } from '@/hooks/useSubscriptions';

interface ChapterWithStatus extends Chapter {
  is_loaded: boolean;
}

export default function ChaptersPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const novelIdParam = searchParams.get('novel');

  const [selectedNovel, setSelectedNovel] = useState<FeaturedNovel | null>(null);
  const [novelFromDb, setNovelFromDb] = useState<Novel | null>(null);
  const [chapters, setChapters] = useState<ChapterWithStatus[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isScraping, setIsScraping] = useState(false);
  const [error, setError] = useState('');
  const [totalChapters, setTotalChapters] = useState(0);
  const [currentPage, setCurrentPage] = useState(1);
  const [jumpToPage, setJumpToPage] = useState('');
  const [jumpToChapter, setJumpToChapter] = useState('');
  const chaptersPerPage = 50;

  // New: Subscription hooks
  const userId = typeof window !== 'undefined' ? localStorage.getItem('userId') || undefined : undefined;
  const { subscribe, unsubscribe } = useNovelSubscriptions(userId);
  const { isSubscribed, subscription, loading: subLoading } = useNovelSubscriptionStatus(novelIdParam || '', userId);

  useEffect(() => {
    if (novelIdParam) {
      const novel = getNovelById(novelIdParam);
      if (novel) {
        setSelectedNovel(novel);
        loadChaptersFromDatabase(novelIdParam, novel, 1);
      }
    }
  }, [novelIdParam]);

  const loadChaptersFromDatabase = async (novelId: string, featuredNovel: FeaturedNovel, page: number) => {
    setIsLoading(true);
    setError('');

    try {
      // Try to get novel from database
      try {
        const novelData = await novelApi.getNovel(novelId);
        setNovelFromDb(novelData);

        // Load chapters from database
        const offset = (page - 1) * chaptersPerPage;
        const { chapters: dbChapters, total } = await chapterApi.listChapters(novelId, chaptersPerPage, offset);
        setChapters(dbChapters.map(ch => ({ ...ch, is_loaded: !!ch.content || !!ch.original_content })));
        setTotalChapters(total);
        setCurrentPage(page);

        if (total > 0) {
          setIsLoading(false);
          return;
        }
      } catch (err) {
        // Novel not in database, need to scrape
        console.log('Novel not in database, will scrape');
      }

      // If not in database, scrape from source
      setIsScraping(true);

      // Auto-detect source language (Korean vs Chinese)
      const sourceLang = featuredNovel.sourceType === 'korean' ? 'ko' : 'zh';

      const scrapeResult = await aiApi.scrapeNovel(featuredNovel.chapterListUrl, sourceLang);

      // Save to database via backend
      const saveResult = await novelApi.scrapeNovel(featuredNovel.chapterListUrl, sourceLang, 'th', novelId);

      // Now load chapters from database
      const { chapters: dbChapters, total } = await chapterApi.listChapters(saveResult.novel_id, chaptersPerPage, 0);
      setChapters(dbChapters.map(ch => ({ ...ch, is_loaded: !!ch.content || !!ch.original_content })));
      setTotalChapters(total);
      setCurrentPage(1);

      // Update novel from database
      const novelData = await novelApi.getNovel(saveResult.novel_id);
      setNovelFromDb(novelData);

    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to load chapters. Please try again.');
    } finally {
      setIsLoading(false);
      setIsScraping(false);
    }
  };

  const goToPage = (page: number) => {
    if (!novelFromDb || page < 1 || page > totalPages) return;
    loadChaptersFromDatabase(novelFromDb.id, selectedNovel!, page);
  };

  const goToChapter = (chapterNum: number) => {
    if (chapterNum < 1 || chapterNum > totalChapters) return;
    const page = Math.ceil(chapterNum / chaptersPerPage);
    goToPage(page);
    setJumpToChapter('');
  };

  const handleChapterClick = async (chapter: ChapterWithStatus) => {
    router.push(`/app/reader?novel=${novelIdParam}&chapter=${chapter.chapter_number}`);
  };

  const handleNovelSelect = (novel: FeaturedNovel) => {
    router.push(`/app/chapters?novel=${novel.id}`);
  };

  // Calculate total pages
  const totalPages = Math.ceil(totalChapters / chaptersPerPage);

  // Generate page numbers to display
  const getPageNumbers = () => {
    const pages: (number | string)[] = [];
    const maxVisible = 7;

    if (totalPages <= maxVisible) {
      for (let i = 1; i <= totalPages; i++) {
        pages.push(i);
      }
    } else {
      // Always show first page
      pages.push(1);

      if (currentPage > 3) {
        pages.push('...');
      }

      // Show pages around current
      const start = Math.max(2, currentPage - 1);
      const end = Math.min(totalPages - 1, currentPage + 1);

      for (let i = start; i <= end; i++) {
        pages.push(i);
      }

      if (currentPage < totalPages - 2) {
        pages.push('...');
      }

      // Always show last page
      pages.push(totalPages);
    }

    return pages;
  };

  // Get display title
  const displayTitle = novelFromDb?.title || selectedNovel?.titleTh || 'Unknown Novel';
  const displayAuthor = novelFromDb?.author || selectedNovel?.authorTh || '';
  const displayCover = novelFromDb?.cover_image_url || selectedNovel?.coverUrl || '';
  const displayStatus = novelFromDb?.status || selectedNovel?.status || 'ongoing';

  // Calculate chapter range for current page
  const startChapter = (currentPage - 1) * chaptersPerPage + 1;
  const endChapter = Math.min(currentPage * chaptersPerPage, totalChapters);

  return (
    <div className="max-w-5xl mx-auto space-y-4">
      {/* Novel Selector */}
      {!selectedNovel && !isLoading && (
        <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-lg border border-gray-200 dark:border-gray-700 p-6">
          <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-4">
            📚 เลือกนิยายที่ต้องการอ่าน
          </h2>

          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {FEATURED_NOVELS.map(novel => (
              <button
                key={novel.id}
                onClick={() => handleNovelSelect(novel)}
                className="group bg-gray-50 dark:bg-gray-800 rounded-xl p-4 border border-gray-200 dark:border-gray-700 hover:border-blue-500 hover:shadow-lg transition-all text-left"
              >
                <div className="flex items-start gap-3">
                  <img
                    src={novel.coverUrl}
                    alt={novel.title}
                    className="w-16 h-20 object-cover rounded-lg shadow"
                    onError={(e) => {
                      e.currentTarget.src = '/placeholder-book.png';
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
                  </div>
                </div>
              </button>
            ))}
          </div>

          {FEATURED_NOVELS.length === 0 && (
            <div className="text-center py-8 text-gray-500 dark:text-gray-400">
              <p>ยังไม่มีนิยายในระบบ</p>
            </div>
          )}
        </div>
      )}

      {/* Loading State */}
      {isLoading && !isScraping && (
        <div className="flex flex-col items-center justify-center py-12">
          <div className="relative">
            <div className="w-16 h-16 border-4 border-blue-200 dark:border-blue-900 rounded-full"></div>
            <div className="absolute top-0 left-0 w-16 h-16 border-4 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
          </div>
          <p className="mt-4 text-gray-600 dark:text-gray-300 font-medium">กำลังโหลดบท...</p>
        </div>
      )}

      {/* Scraping State */}
      {isScraping && (
        <div className="flex flex-col items-center justify-center py-12">
          <div className="relative">
            <div className="w-16 h-16 border-4 border-purple-200 dark:border-purple-900 rounded-full"></div>
            <div className="absolute top-0 left-0 w-16 h-16 border-4 border-purple-600 border-t-transparent rounded-full animate-spin"></div>
          </div>
          <p className="mt-4 text-gray-600 dark:text-gray-300 font-medium">กำลังดึงข้อมูลนิยายจากเว็บไซต์...</p>
          <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">ข้อมูลจะถูกบันทึกในฐานข้อมูลเพื่อใช้ในครั้งถัดไป</p>
        </div>
      )}

      {/* Error State */}
      {error && !isLoading && (
        <div className="bg-red-50 dark:bg-red-900/30 rounded-xl p-4 border border-red-200 dark:border-red-800">
          <p className="text-red-600 dark:text-red-400">{error}</p>
          <button
            onClick={() => selectedNovel && loadChaptersFromDatabase(novelIdParam!, selectedNovel, 1)}
            className="mt-2 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700"
          >
            ลองอีกครั้ง
          </button>
        </div>
      )}

      {/* Chapter List */}
      {selectedNovel && chapters.length > 0 && !isLoading && (
        <div className="space-y-4">
          {/* Novel Header */}
          <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-lg border border-gray-200 dark:border-gray-700 p-4">
            <div className="flex items-start gap-4">
              <img
                src={displayCover}
                alt={displayTitle}
                className="w-20 h-28 object-cover rounded-lg shadow"
                onError={(e) => {
                  e.currentTarget.style.display = 'none';
                }}
              />
              <div className="flex-1 min-w-0">
                <h2 className="text-xl font-bold text-gray-900 dark:text-white">
                  {displayTitle}
                </h2>
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  {displayAuthor && `ผู้แต่ง: ${displayAuthor}`}
                </p>
                <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                  {totalChapters} บท • {displayStatus === 'ongoing' ? 'กำลังเขียน' : 'จบ'}
                </p>
              </div>
              <div className="flex flex-col gap-2">
                <button
                  onClick={() => {
                    setSelectedNovel(null);
                    setChapters([]);
                    setNovelFromDb(null);
                  }}
                  className="px-3 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800"
                >
                  เปลี่ยนนิยาย
                </button>
                {/* New: Subscribe Button */}
                {novelIdParam && selectedNovel && (
                  <div className="w-48">
                    <SubscribeButton
                      novelId={novelIdParam}
                      sourceUrl={selectedNovel.chapterListUrl}
                      sourceType="novel"
                      isSubscribed={isSubscribed}
                      onSubscribe={subscribe}
                      onUnsubscribe={unsubscribe}
                      subscriptionId={subscription?.id}
                    />
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Chapter Grid */}
          <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-lg border border-gray-200 dark:border-gray-700 p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                📖 เลือกบทที่ต้องการอ่าน
              </h3>
              <div className="text-sm text-gray-500 dark:text-gray-400">
                บท {startChapter} - {endChapter} จาก {totalChapters} บท
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2">
              {chapters.map((chapter) => (
                <button
                  key={chapter.id}
                  onClick={() => handleChapterClick(chapter)}
                  className={`relative p-3 text-left rounded-lg border transition-all ${chapter.is_loaded
                    ? 'bg-blue-50 dark:bg-blue-900/30 border-blue-200 dark:border-blue-700 text-blue-600 dark:text-blue-300 hover:bg-blue-100 dark:hover:bg-blue-900/50'
                    : 'bg-gray-50 dark:bg-gray-800 border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700'
                    }`}
                >
                  <div className="flex items-start gap-2">
                    <span className="font-bold text-sm shrink-0">บท {chapter.chapter_number}</span>
                    {chapter.is_translated && (
                      <span className="shrink-0 w-2 h-2 bg-green-500 rounded-full mt-1"></span>
                    )}
                  </div>
                  {chapter.title && (
                    <p className="text-xs mt-1 line-clamp-2 opacity-80">
                      {chapter.title}
                    </p>
                  )}
                </button>
              ))}
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="mt-6 flex flex-col sm:flex-row items-center justify-between gap-4">
                {/* Jump to chapter */}
                <div className="flex items-center gap-2">
                  <span className="text-sm text-gray-500 dark:text-gray-400">ไปบทที่:</span>
                  <input
                    type="number"
                    min="1"
                    max={totalChapters}
                    value={jumpToChapter}
                    onChange={(e) => setJumpToChapter(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        goToChapter(parseInt(jumpToChapter));
                      }
                    }}
                    placeholder="1-2151"
                    className="w-24 px-2 py-1 text-sm border border-gray-300 dark:border-gray-600 rounded-lg dark:bg-gray-800 dark:text-white"
                  />
                  <button
                    onClick={() => goToChapter(parseInt(jumpToChapter))}
                    disabled={!jumpToChapter}
                    className="px-3 py-1 text-sm bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600 disabled:opacity-50"
                  >
                    ไป
                  </button>
                </div>

                {/* Page navigation */}
                <div className="flex items-center gap-1">
                  {/* Previous button */}
                  <button
                    onClick={() => goToPage(currentPage - 1)}
                    disabled={currentPage === 1}
                    className="px-3 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 disabled:opacity-50 disabled:cursor-not-allowed dark:text-white"
                  >
                    ←
                  </button>

                  {/* Page numbers */}
                  {getPageNumbers().map((page, index) => (
                    <button
                      key={index}
                      onClick={() => typeof page === 'number' && goToPage(page)}
                      disabled={typeof page !== 'number'}
                      className={`min-w-[36px] px-3 py-1.5 text-sm rounded-lg transition-colors ${page === currentPage
                        ? 'bg-blue-600 text-white'
                        : typeof page === 'number'
                          ? 'border border-gray-300 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-800 dark:text-white'
                          : 'text-gray-400 dark:text-gray-500 cursor-default'
                        }`}
                    >
                      {page}
                    </button>
                  ))}

                  {/* Next button */}
                  <button
                    onClick={() => goToPage(currentPage + 1)}
                    disabled={currentPage === totalPages}
                    className="px-3 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 disabled:opacity-50 disabled:cursor-not-allowed dark:text-white"
                  >
                    →
                  </button>
                </div>

                {/* Jump to page */}
                <div className="flex items-center gap-2">
                  <span className="text-sm text-gray-500 dark:text-gray-400">หน้า:</span>
                  <input
                    type="number"
                    min="1"
                    max={totalPages}
                    value={jumpToPage}
                    onChange={(e) => setJumpToPage(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        goToPage(parseInt(jumpToPage));
                        setJumpToPage('');
                      }
                    }}
                    placeholder={`1-${totalPages}`}
                    className="w-20 px-2 py-1 text-sm border border-gray-300 dark:border-gray-600 rounded-lg dark:bg-gray-800 dark:text-white"
                  />
                  <span className="text-sm text-gray-500 dark:text-gray-400">/ {totalPages}</span>
                </div>
              </div>
            )}

            {/* Status Legend */}
            <div className="mt-6 flex items-center gap-4 text-xs text-gray-500 dark:text-gray-400">
              <div className="flex items-center gap-1">
                <span className="w-4 h-4 bg-blue-50 dark:bg-blue-900/30 border border-blue-200 dark:border-blue-700 rounded"></span>
                <span>โหลดแล้ว</span>
              </div>
              <div className="flex items-center gap-1">
                <span className="w-4 h-4 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded"></span>
                <span>ยังไม่โหลด</span>
              </div>
              <div className="flex items-center gap-1">
                <span className="w-2 h-2 bg-green-500 rounded-full"></span>
                <span>แปลแล้ว</span>
              </div>
            </div>
          </div>

          {/* Quick Actions */}
          <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700 p-4">
            <div className="flex items-center justify-between">
              <Link
                href="/app/library"
                className="px-4 py-2 text-sm text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white"
              >
                ← กลับไป Library
              </Link>
              <button
                onClick={() => {
                  const firstChapter = chapters[0];
                  if (firstChapter) {
                    handleChapterClick(firstChapter);
                  }
                }}
                className="px-6 py-2 bg-gradient-to-r from-blue-600 to-purple-600 text-white rounded-lg font-semibold hover:opacity-90 transition-opacity"
              >
                🚀 เริ่มอ่าน
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
