'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import { mangaApi, MangaTextRegion } from '@/lib/api';
import ReadingProgressTracker from '@/components/ReadingProgressTracker';
import AddBookmarkButton from '@/components/AddBookmarkButton';
import { useCurrentReadingSession, useBookmarks } from '@/hooks/useReadingProgress';
import {
  Palette, Upload, Search, CheckCircle2, XCircle, AlertTriangle, Info,
  BookOpen, Download, Lightbulb, Link2, Loader2, Globe,
  ChevronLeft, ChevronRight, Play, Pause
} from 'lucide-react';

type SourceLanguage = 'en' | 'ko' | 'ja' | 'zh' | 'zh-TW';
type RenderStyle = 'overlay' | 'inpaint' | 'side_by_side';
type Provider = 'openai' | 'gemini';
type InputMode = 'url' | 'upload';

interface TranslatedPage {
  page_number: number;
  translated_base64: string;
  original_base64: string;
  regions_count: number;
  error?: string;
}

// Toast/Modal types
type ToastType = 'success' | 'error' | 'warning' | 'info';

interface Toast {
  id: number;
  message: string;
  type: ToastType;
}

export default function MangaTranslatorPage() {
  // Toast state for app-style notifications
  const [toasts, setToasts] = useState<Toast[]>([]);
  const toastIdRef = useRef(0);

  // Show toast notification
  const showToast = useCallback((message: string, type: ToastType = 'info') => {
    const id = ++toastIdRef.current;
    setToasts(prev => [...prev, { id, message, type }]);

    // Auto-remove after 5 seconds
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id));
    }, 5000);
  }, []);

  // Remove toast
  const removeToast = useCallback((id: number) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  }, []);

  // Input mode
  const [inputMode, setInputMode] = useState<InputMode>('url');

  // URL mode state
  const [mangaUrl, setMangaUrl] = useState('');
  const [isFetching, setIsFetching] = useState(false);
  const [isTranslatingUrl, setIsTranslatingUrl] = useState(false);
  const [fetchedInfo, setFetchedInfo] = useState<{
    title: string;
    total_pages: number;
    site_name: string;
  } | null>(null);
  const [translatedPages, setTranslatedPages] = useState<TranslatedPage[]>([]);
  const [translationProgress, setTranslationProgress] = useState<{ current: number; total: number } | null>(null);

  // Upload mode state
  const [images, setImages] = useState<{ id: string; file: File; base64: string; preview: string }[]>([]);
  const [results, setResults] = useState<{ imageId: string; originalBase64: string; translatedBase64: string; regions: MangaTextRegion[] }[]>([]);

  // Common state
  const [isTranslating, setIsTranslating] = useState(false);
  const [currentView, setCurrentView] = useState<'original' | 'translated'>('translated');

  // Settings
  const [sourceLang, setSourceLang] = useState<SourceLanguage>('en');
  const [renderStyle, setRenderStyle] = useState<RenderStyle>('overlay');
  const [provider, setProvider] = useState<Provider>('openai');
  const [model, setModel] = useState('gpt-4o');
  const [tone, setTone] = useState('casual');

  // API Keys (loaded from settings)
  const [openaiKey, setOpenaiKey] = useState('');
  const [geminiKey, setGeminiKey] = useState('');

  // Health status
  const [healthStatus, setHealthStatus] = useState<{
    ocr_available: boolean;
    openai_configured: boolean;
    gemini_configured: boolean;
  } | null>(null);

  // New: Manga reading progress hooks
  const userId = typeof window !== 'undefined' ? localStorage.getItem('userId') || undefined : undefined;
  const mangaId = fetchedInfo?.title?.replace(/\s+/g, '-').toLowerCase() || '';
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

  // Refs
  const fileInputRef = useRef<HTMLInputElement>(null);
  const resultsRef = useRef<HTMLDivElement>(null);

  // Load API keys from settings on mount
  useEffect(() => {
    const settings = localStorage.getItem('appSettings');
    if (settings) {
      const parsed = JSON.parse(settings);
      setOpenaiKey(parsed.openaiApiKey || '');
      setGeminiKey(parsed.geminiApiKey || '');
      setProvider(parsed.translationProvider || 'openai');
      setTone(parsed.defaultTone || 'casual');
    }
  }, []);

  // Check health on mount
  useEffect(() => {
    const checkHealth = async () => {
      try {
        const health = await mangaApi.healthCheck();
        setHealthStatus(health);
      } catch (error) {
        console.error('Health check failed:', error);
      }
    };
    checkHealth();
  }, []);

  // Scroll to results when new page is added
  useEffect(() => {
    if (translatedPages.length > 0 && resultsRef.current) {
      resultsRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }, [translatedPages.length]);

  // URL Mode: Fetch manga info
  const handleFetchManga = async () => {
    if (!mangaUrl.trim()) {
      showToast('Please enter a manga URL', 'warning');
      return;
    }
    setIsFetching(true);
    setFetchedInfo(null);
    setTranslatedPages([]);
    setTranslationProgress(null);

    try {
      const response = await mangaApi.fetchFromUrl(mangaUrl, sourceLang);
      setFetchedInfo({
        title: response.title,
        total_pages: response.total_pages,
        site_name: response.site_name,
      });
      showToast(`Found ${response.total_pages} pages from ${response.site_name}`, 'success');
    } catch (error: any) {
      showToast(`Failed to fetch manga: ${error.response?.data?.detail || error.message}`, 'error');
    } finally {
      setIsFetching(false);
    }
  };

  // URL Mode: Translate with progress
  const handleTranslateUrl = async () => {
    if (!mangaUrl.trim()) {
      showToast('Please enter a URL', 'warning');
      return;
    }
    if (!openaiKey && !geminiKey) {
      showToast('Please configure API keys in Settings', 'warning');
      return;
    }

    setIsTranslatingUrl(true);
    setTranslatedPages([]);
    setTranslationProgress({ current: 0, total: fetchedInfo?.total_pages || 0 });

    try {
      const response = await mangaApi.translateFromUrl(mangaUrl, {
        sourceLang,
        renderStyle,
        tone,
        provider,
        model,
        openaiApiKey: openaiKey,
        geminiApiKey: geminiKey,
      });

      // Simulate progressive display for better UX
      for (let i = 0; i < response.pages.length; i++) {
        const page = response.pages[i];
        setTranslationProgress({ current: i + 1, total: response.pages.length });

        if (!page.error) {
          setTranslatedPages(prev => [...prev, page]);
        }

        await new Promise(resolve => setTimeout(resolve, 100));
      }

      // Save to sessionStorage for manga reader
      const mangaReaderData = {
        pages: translatedPages,
        title: fetchedInfo?.title || 'Translated Manga',
        totalPages: response.pages.length,
        translatedAt: Date.now(),
      };
      sessionStorage.setItem('mangaReaderData', JSON.stringify(mangaReaderData));

      showToast(`Translation complete! ${response.pages.length} pages translated`, 'success');
    } catch (error: any) {
      showToast(`Translation failed: ${error.response?.data?.detail || error.message}`, 'error');
    } finally {
      setIsTranslatingUrl(false);
    }
  };

  // Upload Mode: File handling
  const handleFileSelect = useCallback((files: FileList | null) => {
    if (!files) return;

    const newImages: { id: string; file: File; base64: string; preview: string }[] = [];
    Array.from(files).forEach((file) => {
      if (!file.type.startsWith('image/')) return;

      const reader = new FileReader();
      reader.onload = (e) => {
        const base64 = (e.target?.result as string)?.split(',')[1];
        const preview = e.target?.result as string;

        newImages.push({
          id: `${file.name}-${Date.now()}`,
          file,
          base64,
          preview,
        });

        if (newImages.length === files.length) {
          setImages((prev) => [...prev, ...newImages]);
          showToast(`${newImages.length} images added`, 'success');
        }
      };
      reader.readAsDataURL(file);
    });
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    handleFileSelect(e.dataTransfer.files);
  }, [handleFileSelect]);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
  }, []);

  const translateAllImages = async () => {
    if (images.length === 0) {
      showToast('Please upload images first', 'warning');
      return;
    }
    if (!openaiKey && !geminiKey) {
      showToast('Please configure API keys in Settings', 'warning');
      return;
    }

    setIsTranslating(true);
    const newResults: { imageId: string; originalBase64: string; translatedBase64: string; regions: MangaTextRegion[] }[] = [];

    try {
      for (let i = 0; i < images.length; i++) {
        const image = images[i];
        setTranslationProgress({ current: i + 1, total: images.length });

        const response = await mangaApi.translateImage(image.base64, {
          sourceLang,
          renderStyle,
          tone,
          provider,
          model,
          openaiApiKey: openaiKey,
          geminiApiKey: geminiKey,
        });

        newResults.push({
          imageId: image.id,
          originalBase64: response.original_image_base64,
          translatedBase64: response.translated_image_base64,
          regions: response.regions,
        });

        setResults([...newResults]);
      }
      showToast(`All ${images.length} images translated!`, 'success');
    } catch (error: any) {
      showToast(`Translation failed: ${error.response?.data?.detail || error.message}`, 'error');
    } finally {
      setIsTranslating(false);
      setTranslationProgress(null);
    }
  };

  const clearAll = () => {
    setImages([]);
    setResults([]);
    setMangaUrl('');
    setFetchedInfo(null);
    setTranslatedPages([]);
    setTranslationProgress(null);
  };

  const downloadImage = (base64: string, filename: string) => {
    const link = document.createElement('a');
    link.href = `data:image/png;base64,${base64}`;
    link.download = filename;
    link.click();
  };

  const languageLabels = {
    en: 'English → Thai',
    ko: 'Korean (Manhwa)',
    ja: 'Japanese (Manga)',
    zh: 'Chinese (Manhua)',
    'zh-TW': 'Traditional Chinese',
  };

  const hasApiKeys = openaiKey || geminiKey;

  return (
    <div className="max-w-6xl mx-auto">
      {/* Toast Container - App-style notifications */}
      <div className="fixed top-4 right-4 z-50 flex flex-col gap-2">
        {toasts.map(toast => (
          <div
            key={toast.id}
            className={`px-4 py-3 rounded-xl shadow-lg flex items-center gap-3 animate-slide-in min-w-[300px] max-w-[400px] ${toast.type === 'error' ? 'bg-red-500 text-white' :
              toast.type === 'success' ? 'bg-green-500 text-white' :
                toast.type === 'warning' ? 'bg-yellow-500 text-white' :
                  'bg-gray-800 text-white'
              }`}
          >
            <span className="text-lg">
              {toast.type === 'error' ? <XCircle size={18} /> :
                toast.type === 'success' ? <CheckCircle2 size={18} /> :
                  toast.type === 'warning' ? <AlertTriangle size={18} /> : <Info size={18} />}
            </span>
            <span className="flex-1 text-sm">{toast.message}</span>
            <button
              onClick={() => removeToast(toast.id)}
              className="text-white/70 hover:text-white"
            >
              ✕
            </button>
          </div>
        ))}
      </div>

      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">
          <Palette size={24} className="inline mr-2" />Manga/Manhwa Translator
        </h1>
        <p className="text-gray-600 dark:text-gray-400">
          Paste a manga URL to read translated, or upload images manually.
        </p>

        {/* Health status */}
        {healthStatus && (
          <div className="mt-3 flex flex-wrap gap-3 text-sm">
            <span className={`px-2 py-1 rounded ${healthStatus.ocr_available ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
              OCR: {healthStatus.ocr_available ? '✓' : '✗'}
            </span>
            <span className={`px-2 py-1 rounded ${hasApiKeys ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700'}`}>
              API Keys: {hasApiKeys ? '✓' : 'Setup Required'}
            </span>
            {!hasApiKeys && (
              <a href="/app/settings" className="px-2 py-1 rounded bg-blue-100 text-blue-700 hover:bg-blue-200">
                Go to Settings →
              </a>
            )}
          </div>
        )}
      </div>

      {/* Mode Tabs */}
      <div className="flex gap-2 mb-6">
        <button
          onClick={() => setInputMode('url')}
          className={`px-6 py-3 rounded-xl font-medium transition-all ${inputMode === 'url'
            ? 'bg-blue-600 text-white shadow-lg'
            : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700'
            }`}
        >
          <Link2 size={18} className="inline mr-2" />Paste URL (Easy)
        </button>
        <button
          onClick={() => setInputMode('upload')}
          className={`px-6 py-3 rounded-xl font-medium transition-all ${inputMode === 'upload'
            ? 'bg-blue-600 text-white shadow-lg'
            : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700'
            }`}
        >
          <Upload size={18} className="inline mr-2" />Upload Images
        </button>
      </div>

      {/* Settings Panel */}
      <div className="bg-white dark:bg-gray-900 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-4 mb-6">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div>
            <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Source Language</label>
            <select
              value={sourceLang}
              onChange={(e) => setSourceLang(e.target.value as SourceLanguage)}
              className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-gray-50 dark:bg-gray-800 text-gray-900 dark:text-white text-sm"
            >
              {Object.entries(languageLabels).map(([code, label]) => (
                <option key={code} value={code}>{label}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">AI Provider</label>
            <select
              value={provider}
              onChange={(e) => setProvider(e.target.value as Provider)}
              className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-gray-50 dark:bg-gray-800 text-gray-900 dark:text-white text-sm"
            >
              <option value="openai">OpenAI (GPT-4)</option>
              <option value="gemini">Google Gemini</option>
            </select>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Render Style</label>
            <select
              value={renderStyle}
              onChange={(e) => setRenderStyle(e.target.value as RenderStyle)}
              className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-gray-50 dark:bg-gray-800 text-gray-900 dark:text-white text-sm"
            >
              <option value="overlay">Overlay</option>
              <option value="inpaint">Replace Text</option>
              <option value="side_by_side">Side by Side</option>
            </select>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Tone</label>
            <select
              value={tone}
              onChange={(e) => setTone(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-gray-50 dark:bg-gray-800 text-gray-900 dark:text-white text-sm"
            >
              <option value="casual">Casual</option>
              <option value="serious">Serious</option>
              <option value="comedy">Comedy</option>
              <option value="action">Action</option>
            </select>
          </div>
        </div>
      </div>

      {/* URL Mode */}
      {inputMode === 'url' && (
        <div className="bg-white dark:bg-gray-900 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-6 mb-6">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
            <Link2 size={20} className="inline mr-2" />Paste Manga URL
          </h2>

          <div className="flex gap-3">
            <input
              type="url"
              value={mangaUrl}
              onChange={(e) => setMangaUrl(e.target.value)}
              placeholder="https://mangadex.org/chapter/... or https://bato.to/title/..."
              className="flex-1 px-4 py-3 rounded-xl border border-gray-300 dark:border-gray-600 bg-gray-50 dark:bg-gray-800 text-gray-900 dark:text-white"
            />
            <button
              onClick={handleFetchManga}
              disabled={isFetching || !mangaUrl.trim()}
              className="px-6 py-3 bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-300 rounded-xl font-medium disabled:opacity-50"
            >
              {isFetching ? <Loader2 size={20} className="animate-spin" /> : <Search size={20} />}
            </button>
          </div>

          <div className="mt-3 text-sm text-gray-500 dark:text-gray-400">
            <span className="font-medium">Supported:</span> MangaDex, Bato.to, MangaKakalot, Toonily, Asura Scans, Webtoons, and more
          </div>

          {fetchedInfo && (
            <div className="mt-4 p-4 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-xl">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="font-semibold text-green-900 dark:text-green-100">{fetchedInfo.title}</h3>
                  <p className="text-sm text-green-700 dark:text-green-300">
                    {fetchedInfo.site_name} • {fetchedInfo.total_pages} pages
                  </p>
                </div>
                <button
                  onClick={handleTranslateUrl}
                  disabled={isTranslatingUrl || !hasApiKeys}
                  className={`px-6 py-3 rounded-xl font-medium transition-colors ${isTranslatingUrl || !hasApiKeys
                    ? 'bg-gray-300 dark:bg-gray-700 text-gray-500 cursor-not-allowed'
                    : 'bg-blue-600 hover:bg-blue-700 text-white'
                    }`}
                >
                  {isTranslatingUrl ? <Loader2 size={20} className="inline mr-2 animate-spin" /> : <Globe size={20} className="inline mr-2" />} {isTranslatingUrl ? 'Translating...' : 'Translate to Thai'}
                </button>
              </div>
            </div>
          )}

          {translationProgress && isTranslatingUrl && (
            <div className="mt-4 p-4 bg-blue-50 dark:bg-blue-900/20 rounded-xl">
              <div className="flex items-center gap-4">
                <div className="flex-1">
                  <div className="flex justify-between mb-2">
                    <span className="font-medium text-blue-900 dark:text-blue-100">
                      Translating... {translationProgress.current}/{translationProgress.total} pages
                    </span>
                    <span className="text-sm text-blue-700 dark:text-blue-300">
                      {Math.round((translationProgress.current / translationProgress.total) * 100)}%
                    </span>
                  </div>
                  <div className="w-full bg-blue-200 dark:bg-blue-800 rounded-full h-3">
                    <div
                      className="bg-blue-600 h-3 rounded-full transition-all duration-300"
                      style={{ width: `${(translationProgress.current / translationProgress.total) * 100}%` }}
                    />
                  </div>
                </div>
              </div>
              <p className="mt-2 text-sm text-blue-600 dark:text-blue-400">
                <Lightbulb size={14} className="inline mr-1" /> Translated pages appear below as they complete!
              </p>
            </div>
          )}
        </div>
      )}

      {/* Upload Mode */}
      {inputMode === 'upload' && (
        <div
          className="bg-white dark:bg-gray-900 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-6 mb-6"
          onDrop={handleDrop}
          onDragOver={handleDragOver}
        >
          <div
            className="border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-xl p-8 text-center hover:border-blue-500 dark:hover:border-blue-400 transition-colors cursor-pointer"
            onClick={() => fileInputRef.current?.click()}
          >
            <div className="mb-3"><Upload size={48} className="mx-auto text-gray-400" /></div>
            <p className="text-gray-600 dark:text-gray-400 mb-2">
              Drag and drop manga images here, or click to select
            </p>
            <p className="text-sm text-gray-500 dark:text-gray-500">
              Supports PNG, JPG, WEBP • Multiple files allowed
            </p>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              multiple
              className="hidden"
              onChange={(e) => handleFileSelect(e.target.files)}
            />
          </div>

          {images.length > 0 && (
            <div className="mt-4">
              <div className="flex items-center justify-between mb-3">
                <span className="text-sm text-gray-600 dark:text-gray-400">
                  {images.length} images uploaded
                </span>
                <button
                  onClick={clearAll}
                  className="text-sm text-red-600 dark:text-red-400 hover:underline"
                >
                  Clear All
                </button>
              </div>

              <div className="grid grid-cols-4 md:grid-cols-6 gap-3">
                {images.map((image) => (
                  <div key={image.id} className="relative group">
                    <img
                      src={image.preview}
                      alt="Uploaded manga"
                      className="w-full h-24 object-cover rounded-lg border border-gray-200 dark:border-gray-700"
                    />
                    <button
                      onClick={() => setImages(prev => prev.filter(img => img.id !== image.id))}
                      className="absolute top-1 right-1 bg-red-500 text-white rounded-full w-5 h-5 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity text-xs"
                    >
                      ✕
                    </button>
                  </div>
                ))}
              </div>

              <button
                onClick={translateAllImages}
                disabled={isTranslating || !hasApiKeys}
                className={`mt-4 px-6 py-3 rounded-xl font-medium transition-colors ${isTranslating || !hasApiKeys
                  ? 'bg-gray-300 dark:bg-gray-700 text-gray-500 cursor-not-allowed'
                  : 'bg-blue-600 hover:bg-blue-700 text-white'
                  }`}
              >
                {isTranslating ? <><Loader2 size={20} className="inline mr-2 animate-spin" />Translating {translationProgress?.current || 0}/{images.length}...</> : <><Globe size={20} className="inline mr-2" />Translate to Thai</>}
              </button>
            </div>
          )}
        </div>
      )}

      {/* Reader - Translated Pages */}
      {translatedPages.length > 0 && (
        <div ref={resultsRef} className="bg-white dark:bg-gray-900 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 overflow-hidden">
          <div className="sticky top-0 z-50 bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-700 px-4 py-3">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="font-semibold text-gray-900 dark:text-white">{fetchedInfo?.title}</h2>
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  {translatedPages.length} / {fetchedInfo?.total_pages || translatedPages.length} pages
                  {isTranslatingUrl && <span className="ml-2 text-blue-600 dark:text-blue-400 animate-pulse">• translating...</span>}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <a
                  href="/app/manga-reader"
                  className="px-4 py-2 bg-gradient-to-r from-purple-600 to-blue-600 text-white rounded-lg text-sm font-medium hover:opacity-90 transition-opacity flex items-center gap-2"
                >
                  <BookOpen size={16} /> เปิดใน Reader
                </a>
                <button
                  onClick={() => setCurrentView('original')}
                  className={`px-3 py-1 rounded-lg text-sm ${currentView === 'original' ? 'bg-blue-600 text-white' : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400'}`}
                >
                  Original
                </button>
                <button
                  onClick={() => setCurrentView('translated')}
                  className={`px-3 py-1 rounded-lg text-sm ${currentView === 'translated' ? 'bg-blue-600 text-white' : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400'}`}
                >
                  Translated
                </button>
                {!isTranslatingUrl && translatedPages.length > 0 && (
                  <button
                    onClick={() => {
                      translatedPages.forEach(p => downloadImage(currentView === 'original' ? p.original_base64 : p.translated_base64, `page-${p.page_number}.png`));
                      showToast(`Downloading ${translatedPages.length} images...`, 'info');
                    }}
                    className="px-3 py-1 rounded-lg bg-green-600 text-white text-sm hover:bg-green-700 flex items-center gap-1"
                  >
                    <Download size={14} /> Download All
                  </button>
                )}
              </div>
            </div>

            {/* New: Manga Reading Progress & Bookmark Bar */}
            {mangaId && translatedPages.length > 0 && (
              <div className="mt-3 pt-3 border-t border-gray-200 dark:border-gray-700 flex items-center justify-between gap-4">
                <div className="flex-1">
                  <div className="flex items-center justify-between text-xs text-gray-500 dark:text-gray-400 mb-1">
                    <span className="flex items-center gap-1"><BookOpen size={12} /> อ่านแล้ว {translatedPages.length} หน้า</span>
                    <span>{Math.round((translatedPages.length / (fetchedInfo?.total_pages || translatedPages.length)) * 100)}%</span>
                  </div>
                  <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-1.5">
                    <div
                      className="bg-gradient-to-r from-blue-600 to-purple-600 h-1.5 rounded-full transition-all"
                      style={{ width: `${(translatedPages.length / (fetchedInfo?.total_pages || translatedPages.length)) * 100}%` }}
                    />
                  </div>
                </div>
                <AddBookmarkButton
                  novelId={mangaId}
                  chapterNumber={1}
                  position={translatedPages.length}
                  onAddBookmark={handleAddBookmark}
                />
              </div>
            )}
          </div>

          <div className="flex flex-col items-center bg-gray-100 dark:bg-gray-800 py-4">
            {translatedPages.map((page, index) => (
              <div key={page.page_number || index} className="w-full max-w-3xl mb-1 relative">
                <img
                  src={`data:image/png;base64,${currentView === 'original' ? page.original_base64 : page.translated_base64}`}
                  alt={`Page ${page.page_number}`}
                  className="w-full"
                />
                <div className="absolute top-2 right-2 bg-black/50 text-white text-xs px-2 py-1 rounded">
                  {page.page_number}
                </div>
              </div>
            ))}

            {isTranslatingUrl && translationProgress && translationProgress.current < translationProgress.total && (
              <div className="w-full max-w-3xl py-20 flex items-center justify-center bg-gray-200 dark:bg-gray-700">
                <div className="text-center">
                  <div className="mb-3"><Loader2 size={48} className="mx-auto animate-spin text-gray-500 dark:text-gray-400" /></div>
                  <p className="text-gray-600 dark:text-gray-400">Translating next page...</p>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Upload Results */}
      {results.length > 0 && inputMode === 'upload' && (
        <div className="bg-white dark:bg-gray-900 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Translation Results</h2>
            <button
              onClick={() => {
                results.forEach((r, i) => downloadImage(r.translatedBase64, `translated-${i}.png`));
                showToast(`Downloading ${results.length} images...`, 'info');
              }}
              className="px-3 py-1 rounded-lg bg-green-600 text-white text-sm flex items-center gap-1"
            >
              <Download size={14} /> Download All
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {results.map((result, idx) => (
              <div key={result.imageId} className="border border-gray-200 dark:border-gray-700 rounded-xl overflow-hidden">
                <img
                  src={`data:image/png;base64,${result.translatedBase64}`}
                  alt={`Translated ${idx + 1}`}
                  className="w-full"
                />
                <div className="p-2 bg-gray-50 dark:bg-gray-800 flex justify-between">
                  <span className="text-sm text-gray-600 dark:text-gray-400">Page {idx + 1}</span>
                  <button
                    onClick={() => downloadImage(result.translatedBase64, `page-${idx + 1}.png`)}
                    className="text-sm text-blue-600 dark:text-blue-400"
                  >
                    Download
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Instructions */}
      <div className="mt-6 bg-blue-50 dark:bg-blue-900/20 rounded-xl p-4">
        <h3 className="font-semibold text-blue-900 dark:text-blue-100 mb-2"><Lightbulb size={18} className="inline mr-2" />How to use</h3>
        <div className="text-sm text-blue-700 dark:text-blue-300 space-y-1">
          <p><strong>Easy Mode:</strong> Paste a manga URL → Click Translate → Read in webtoon-style reader</p>
          <p><strong>Manual Mode:</strong> Upload images → Translate → Download results</p>
          <p className="mt-2"><AlertTriangle size={14} className="inline mr-1" /> Requires API keys configured in <a href="/app/settings" className="underline">Settings</a></p>
        </div>
      </div>

      {/* CSS for animation */}
      <style jsx>{`
        @keyframes slide-in {
          from {
            transform: translateX(100%);
            opacity: 0;
          }
          to {
            transform: translateX(0);
            opacity: 1;
          }
        }
        .animate-slide-in {
          animation: slide-in 0.3s ease-out;
        }
      `}</style>
    </div>
  );
}
