'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import dynamic from 'next/dynamic';
import { useCurrentReadingSession, useBookmarks } from '@/hooks/useReadingProgress';
import { BookOpen, Smartphone, ZoomIn, ZoomOut, User, Globe } from 'lucide-react';

// Dynamic imports for secondary components
const ReadingProgressTracker = dynamic(() => import('@/components/ReadingProgressTracker'), {
  ssr: false,
  loading: () => <div className="h-2 bg-gray-200 dark:bg-gray-700 rounded animate-pulse" />,
});
const AddBookmarkButton = dynamic(() => import('@/components/AddBookmarkButton'), {
  ssr: false,
  loading: () => <div className="w-8 h-8 bg-gray-200 dark:bg-gray-700 rounded animate-pulse" />,
});

interface MangaPage {
  id: string;
  originalBase64: string;
  translatedBase64: string;
  pageNumber: number;
}

export default function MangaReaderPage() {
  // State
  const [currentPage, setCurrentPage] = useState(0);
  const [viewMode, setViewMode] = useState<'vertical' | 'horizontal' | 'webtoon'>('webtoon');
  const [showOriginal, setShowOriginal] = useState(false);
  const [showTranslationOverlay, setShowTranslationOverlay] = useState(true);
  const [zoomLevel, setZoomLevel] = useState(100);
  const [isFullscreen, setIsFullscreen] = useState(false);

  // Demo pages for testing
  const [demoPages, setDemoPages] = useState<MangaPage[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const containerRef = useRef<HTMLDivElement>(null);

  // Load pages from sessionStorage (set by manga translator)
  useEffect(() => {
    const storedData = sessionStorage.getItem('mangaReaderData');
    if (storedData) {
      try {
        const data = JSON.parse(storedData);
        const pages: MangaPage[] = (data.pages || []).map((page: any, index: number) => ({
          id: `page-${index}`,
          originalBase64: page.original_base64 || '',
          translatedBase64: page.translated_base64 || '',
          pageNumber: index + 1,
        }));
        setDemoPages(pages);
        localStorage.setItem('currentMangaId', `manga-${Date.now()}`);
      } catch (error) {
        console.error('Failed to load manga data:', error);
      }
    }
    setIsLoading(false);
  }, []);

  // New: Manga reading progress hooks
  const userId = typeof window !== 'undefined' ? localStorage.getItem('userId') || undefined : undefined;
  const mangaId = typeof window !== 'undefined' ? localStorage.getItem('currentMangaId') || '' : '';
  const { currentProgress } = useCurrentReadingSession(mangaId);
  const { bookmarks, addBookmark, getBookmarksForNovel } = useBookmarks(userId);
  const mangaBookmarks = mangaId ? getBookmarksForNovel(mangaId) : [];

  const handleAddBookmark = async (
    _mangaId: string,
    chapterNumber: number,
    position: number,
    note?: string
  ) => {
    return addBookmark(_mangaId, chapterNumber, position, note);
  };

  const readingProgressPercent = demoPages.length > 0
    ? Math.round(((currentPage + 1) / demoPages.length) * 100)
    : 0;

  // Keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      switch (e.key) {
        case 'ArrowRight':
          if (viewMode === 'horizontal') {
            setCurrentPage((prev) => Math.min(prev + 1, demoPages.length - 1));
          }
          break;
        case 'ArrowLeft':
          if (viewMode === 'horizontal') {
            setCurrentPage((prev) => Math.max(prev - 1, 0));
          }
          break;
        case 'ArrowDown':
          if (viewMode === 'webtoon') {
            // Scroll down naturally
          }
          break;
        case 'ArrowUp':
          if (viewMode === 'webtoon') {
            // Scroll up naturally
          }
          break;
        case ' ':
          if (viewMode === 'horizontal') {
            setCurrentPage((prev) => Math.min(prev + 1, demoPages.length - 1));
          }
          break;
        case 'o':
          setShowOriginal((prev) => !prev);
          break;
        case 'f':
          toggleFullscreen();
          break;
        case 'Escape':
          if (isFullscreen) {
            document.exitFullscreen();
            setIsFullscreen(false);
          }
          break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [viewMode, demoPages.length, isFullscreen]);

  // Toggle fullscreen
  const toggleFullscreen = () => {
    if (!isFullscreen) {
      containerRef.current?.requestFullscreen();
      setIsFullscreen(true);
    } else {
      document.exitFullscreen();
      setIsFullscreen(false);
    }
  };

  // Handle fullscreen change
  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(document.fullscreenElement !== null);
    };

    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', handleFullscreenChange);
  }, []);

  // Zoom controls
  const handleZoomIn = () => setZoomLevel((prev) => Math.min(prev + 25, 200));
  const handleZoomOut = () => setZoomLevel((prev) => Math.max(prev - 25, 50));
  const handleZoomReset = () => setZoomLevel(100);

  // Page navigation
  const goToPage = (page: number) => setCurrentPage(Math.max(0, Math.min(page, demoPages.length - 1)));
  const nextPage = () => goToPage(currentPage + 1);
  const prevPage = () => goToPage(currentPage - 1);

  // Show loading state
  if (isLoading) {
    return (
      <div className="max-w-6xl mx-auto flex items-center justify-center min-h-[60vh]">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600 dark:text-gray-400">กำลังโหลดมังงะ...</p>
        </div>
      </div>
    );
  }

  // If no pages, show upload instructions
  if (demoPages.length === 0) {
    return (
      <div className="max-w-6xl mx-auto">
        <div className="bg-white dark:bg-gray-900 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-8 text-center">
          <div className="mb-4"><BookOpen size={48} className="mx-auto text-gray-400" /></div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-3">
            Manga Reader
          </h1>
          <p className="text-gray-600 dark:text-gray-400 mb-6">
            ยังไม่มีมังงะ ไปที่หน้า Manga Translator เพื่ออัพโหลดและแปลรูป
          </p>
          <a
            href="/app/manga"
            className="inline-block px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-medium transition-colors"
          >
            ไปที่ Manga Translator
          </a>
        </div>

        {/* Reader Features */}
        <div className="mt-6 grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="bg-white dark:bg-gray-900 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-4">
            <div className="mb-2"><Smartphone size={32} className="text-blue-600" /></div>
            <h3 className="font-semibold text-gray-900 dark:text-white mb-1">Webtoon Mode</h3>
            <p className="text-sm text-gray-600 dark:text-gray-400">
              Vertical scrolling optimized for manhwa/webtoons
            </p>
          </div>

          <div className="bg-white dark:bg-gray-900 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-4">
            <div className="mb-2"><BookOpen size={32} className="text-green-600" /></div>
            <h3 className="font-semibold text-gray-900 dark:text-white mb-1">Page-by-Page Mode</h3>
            <p className="text-sm text-gray-600 dark:text-gray-400">
              Traditional manga reading with page navigation
            </p>
          </div>

          <div className="bg-white dark:bg-gray-900 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-4">
            <div className="mb-2"><ZoomIn size={32} className="text-purple-600" /></div>
            <h3 className="font-semibold text-gray-900 dark:text-white mb-1">Zoom & Compare</h3>
            <p className="text-sm text-gray-600 dark:text-gray-400">
              Zoom in/out and compare original vs translated
            </p>
          </div>
        </div>

        {/* Keyboard shortcuts */}
        <div className="mt-6 bg-blue-50 dark:bg-blue-900/20 rounded-xl p-4">
          <h3 className="font-semibold text-blue-900 dark:text-blue-100 mb-3"><BookOpen size={18} className="inline mr-2" />Keyboard Shortcuts</h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-sm">
            <div className="flex items-center gap-2">
              <kbd className="px-2 py-1 bg-white dark:bg-gray-800 rounded text-gray-700 dark:text-gray-300">←/→</kbd>
              <span className="text-blue-700 dark:text-blue-300">Previous/Next page</span>
            </div>
            <div className="flex items-center gap-2">
              <kbd className="px-2 py-1 bg-white dark:bg-gray-800 rounded text-gray-700 dark:text-gray-300">Space</kbd>
              <span className="text-blue-700 dark:text-blue-300">Next page</span>
            </div>
            <div className="flex items-center gap-2">
              <kbd className="px-2 py-1 bg-white dark:bg-gray-800 rounded text-gray-700 dark:text-gray-300">O</kbd>
              <span className="text-blue-700 dark:text-blue-300">Toggle original</span>
            </div>
            <div className="flex items-center gap-2">
              <kbd className="px-2 py-1 bg-white dark:bg-gray-800 rounded text-gray-700 dark:text-gray-300">F</kbd>
              <span className="text-blue-700 dark:text-blue-300">Fullscreen</span>
            </div>
            <div className="flex items-center gap-2">
              <kbd className="px-2 py-1 bg-white dark:bg-gray-800 rounded text-gray-700 dark:text-gray-300">+/-</kbd>
              <span className="text-blue-700 dark:text-blue-300">Zoom in/out</span>
            </div>
            <div className="flex items-center gap-2">
              <kbd className="px-2 py-1 bg-white dark:bg-gray-800 rounded text-gray-700 dark:text-gray-300">Esc</kbd>
              <span className="text-blue-700 dark:text-blue-300">Exit fullscreen</span>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div ref={containerRef} className={`${isFullscreen ? 'bg-gray-900' : ''}`}>
      {/* Toolbar */}
      <div className={`sticky top-0 z-50 ${isFullscreen ? 'bg-gray-900/90' : 'bg-white dark:bg-gray-900'} border-b border-gray-200 dark:border-gray-700 px-4 py-2`}>
        <div className="flex items-center justify-between gap-4">
          {/* Left: View mode */}
          <div className="flex items-center gap-2">
            <select
              value={viewMode}
              onChange={(e) => setViewMode(e.target.value as any)}
              className="px-3 py-1 rounded-lg border border-gray-300 dark:border-gray-600 bg-gray-50 dark:bg-gray-800 text-gray-900 dark:text-white text-sm"
            >
              <option value="webtoon"><Smartphone size={14} className="inline mr-1" /> Webtoon (Vertical)</option>
              <option value="horizontal"><BookOpen size={14} className="inline mr-1" /> Page-by-Page</option>
            </select>

            <button
              onClick={() => setShowOriginal(!showOriginal)}
              className={`px-3 py-1 rounded-lg text-sm ${showOriginal
                ? 'bg-blue-600 text-white'
                : 'bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300'
                }`}
            >
              {showOriginal ? <><User size={14} className="inline mr-1" />Original</> : <><Globe size={14} className="inline mr-1" />Translated</>}
            </button>
          </div>

          {/* Center: Page info (horizontal mode) */}
          {viewMode === 'horizontal' && (
            <div className="flex items-center gap-2">
              <button
                onClick={prevPage}
                disabled={currentPage === 0}
                className="p-2 rounded-lg bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 disabled:opacity-50"
              >
                ◀
              </button>
              <span className="text-gray-900 dark:text-white font-medium">
                {currentPage + 1} / {demoPages.length}
              </span>
              <button
                onClick={nextPage}
                disabled={currentPage === demoPages.length - 1}
                className="p-2 rounded-lg bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 disabled:opacity-50"
              >
                ▶
              </button>
            </div>
          )}

          {/* Right: Controls */}
          <div className="flex items-center gap-2">
            {/* New: Bookmark Button */}
            {mangaId && demoPages.length > 0 && (
              <AddBookmarkButton
                novelId={mangaId}
                chapterNumber={1}
                position={readingProgressPercent}
                onAddBookmark={handleAddBookmark}
              />
            )}

            {/* Zoom */}
            <button
              onClick={handleZoomOut}
              className="p-2 rounded-lg bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 flex items-center justify-center"
            >
              <ZoomOut size={18} />
            </button>
            <span className="text-gray-900 dark:text-white text-sm w-12 text-center">
              {zoomLevel}%
            </span>
            <button
              onClick={handleZoomIn}
              className="p-2 rounded-lg bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 flex items-center justify-center"
            >
              <ZoomIn size={18} />
            </button>

            {/* Fullscreen */}
            <button
              onClick={toggleFullscreen}
              className={`p-2 rounded-lg ${isFullscreen
                ? 'bg-blue-600 text-white'
                : 'bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300'
                }`}
            >
              {isFullscreen ? '⤴' : '⤵'}
            </button>
          </div>
        </div>

        {/* New: Reading Progress Bar */}
        {demoPages.length > 0 && (
          <div className="mt-2 flex items-center gap-3">
            <div className="flex-1">
              <div className="h-1.5 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-blue-600 to-purple-600 rounded-full transition-all"
                  style={{ width: `${((currentPage + 1) / demoPages.length) * 100}%` }}
                />
              </div>
            </div>
            <span className="text-xs text-gray-500 dark:text-gray-400 whitespace-nowrap">
              {readingProgressPercent}%
            </span>
          </div>
        )}

        {/* Page slider (horizontal mode) */}
        {viewMode === 'horizontal' && demoPages.length > 1 && (
          <div className="mt-2 flex items-center gap-2">
            <input
              type="range"
              min={0}
              max={demoPages.length - 1}
              value={currentPage}
              onChange={(e) => goToPage(parseInt(e.target.value))}
              className="w-full h-2 bg-gray-200 dark:bg-gray-700 rounded-lg appearance-none cursor-pointer"
            />
          </div>
        )}
      </div>

      {/* Reader Content */}
      <div className={`${isFullscreen ? 'h-[calc(100vh-60px)]' : 'min-h-[calc(100vh-200px)]'} overflow-auto`}>
        {viewMode === 'webtoon' && (
          <div className="flex flex-col items-center gap-1 py-4">
            {demoPages.map((page, idx) => (
              <img
                key={page.id}
                src={`data:image/png;base64,${showOriginal ? page.originalBase64 : page.translatedBase64}`}
                alt={`Page ${idx + 1}`}
                style={{ width: `${zoomLevel}%` }}
                className="max-w-full rounded shadow-lg"
              />
            ))}
          </div>
        )}

        {viewMode === 'horizontal' && (
          <div className="flex items-center justify-center h-full p-4">
            <img
              src={`data:image/png;base64,${showOriginal ? demoPages[currentPage]?.originalBase64 : demoPages[currentPage]?.translatedBase64}`}
              alt={`Page ${currentPage + 1}`}
              style={{ maxHeight: `${zoomLevel}%`, maxWidth: `${zoomLevel}%` }}
              className="rounded shadow-lg object-contain"
            />
          </div>
        )}
      </div>

      {/* Bottom progress bar */}
      <div className={`sticky bottom-0 ${isFullscreen ? 'bg-gray-900/90' : 'bg-white dark:bg-gray-900'} border-t border-gray-200 dark:border-gray-700 px-4 py-2`}>
        <div className="flex items-center justify-between">
          <div className="flex-1">
            <div className="h-1 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
              <div
                className="h-full bg-blue-600 rounded-full transition-all"
                style={{
                  width: `${((viewMode === 'webtoon' ? demoPages.length : currentPage + 1) / demoPages.length) * 100}%`,
                }}
              />
            </div>
          </div>
          <span className="ml-4 text-sm text-gray-600 dark:text-gray-400">
            {viewMode === 'webtoon' ? `${demoPages.length} pages` : `Page ${currentPage + 1}/${demoPages.length}`}
          </span>
        </div>
      </div>
    </div>
  );
}
