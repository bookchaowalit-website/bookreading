'use client';

import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import dynamic from 'next/dynamic';
import { useSearchParams, useRouter } from 'next/navigation';
import api, { aiApi, novelApi, chapterApi, translationApi, ExtractedTerm, Chapter as DbChapter, Novel } from '@/lib/api';
import { FEATURED_NOVELS, getNovelById, FeaturedNovel } from '@/lib/novels';
import ReadingProgressBar from '@/components/ReadingProgressBar';
import { useTranslationFeedback } from '@/hooks/useTranslationFeedback';
import { getErrorDisplay } from '@/lib/translationErrors';
import { useCurrentReadingSession, useBookmarks } from '@/hooks/useReadingProgress';
import { Bookmark } from '@/lib/types/features';

// Dynamic imports for heavy/secondary components
const ReadingProgressTracker = dynamic(() => import('@/components/ReadingProgressTracker'), {
  ssr: false,
  loading: () => <div className="h-2 bg-gray-200 dark:bg-gray-700 rounded animate-pulse" />,
});
const AddBookmarkButton = dynamic(() => import('@/components/AddBookmarkButton'), {
  ssr: false,
  loading: () => <div className="w-8 h-8 bg-gray-200 dark:bg-gray-700 rounded animate-pulse" />,
});
const TranslationFeedbackForm = dynamic(() => import('@/components/TranslationFeedbackForm'), {
  ssr: false,
});
const StarRating = dynamic(() => import('@/components/StarRating'), {
  ssr: false,
  loading: () => <div className="w-32 h-8 bg-gray-200 dark:bg-gray-700 rounded animate-pulse" />,
});

type ViewMode = 'original' | 'translated' | 'sideBySide';
type FontSize = 'small' | 'medium' | 'large' | 'xlarge';
type FontFamily = 'sarabun' | 'noto' | 'inter' | 'system';
type LineSpacing = 'tight' | 'normal' | 'relaxed' | 'loose';
type AIModel = 'gpt-4o' | 'gpt-4o-mini' | 'gpt-4-turbo' | 'gemini-1.5-pro' | 'gemini-2.0-flash';

interface Chapter {
  chapter_number: number;
  title: string;
  original_title: string;
  url: string;
  content: string;
  translated?: string;
  isTranslated?: boolean;
  id?: string;
  translationQuality?: {
    grade: string;
    overall_score: number;
    issues: string[];
  };
}

interface NovelData {
  title: string;
  original_title: string;
  author: string;
  description: string;
  cover_image_url: string;
  chapters: Chapter[];
  currentChapterIndex: number;
  novelId?: string;
}

// Helper function to format content into readable paragraphs
function formatContent(content: string): string[] {
  if (!content) return [];
  const paragraphs = content
    .split(/\n\n+|\n/)
    .map(p => p.trim())
    .filter(p => p.length > 0);
  return paragraphs;
}

// Component to render formatted content
function ContentRenderer({
  content,
  fontSize,
  fontFamily = 'sarabun',
  lineSpacing = 'normal',
  maxWidth = 768,
}: {
  content: string;
  fontSize: FontSize;
  fontFamily?: FontFamily;
  lineSpacing?: LineSpacing;
  maxWidth?: number;
}) {
  const paragraphs = formatContent(content);

  const fontSizeClasses = {
    small: 'text-sm',
    medium: 'text-base',
    large: 'text-lg',
    xlarge: 'text-xl',
  };

  const fontFamilyClasses = {
    sarabun: 'font-sans',
    noto: 'font-sans',
    inter: 'font-sans',
    system: 'font-sans',
  };

  const fontFamilyStyles = {
    sarabun: { fontFamily: 'var(--font-sarabun)' },
    noto: { fontFamily: 'var(--font-sarabun)' },
    inter: { fontFamily: 'var(--font-sarabun)' },
    system: { fontFamily: 'system-ui, -apple-system, sans-serif' },
  };

  const lineSpacingValues = {
    tight: '1.6',
    normal: '1.9',
    relaxed: '2.2',
    loose: '2.6',
  };

  return (
    <div
      className={`novel-content ${fontSizeClasses[fontSize]} text-gray-800 dark:text-gray-200`}
      style={{
        ...fontFamilyStyles[fontFamily],
        lineHeight: lineSpacingValues[lineSpacing],
        maxWidth: `${maxWidth}px`,
        margin: '0 auto',
      }}
    >
      {paragraphs.map((paragraph, index) => {
        const isDialogue = paragraph.startsWith('"') || paragraph.startsWith('"') ||
          paragraph.startsWith('「') || paragraph.startsWith("'");

        return (
          <p
            key={index}
            className={`${isDialogue ? 'novel-dialogue' : ''}`}
          >
            {paragraph}
          </p>
        );
      })}
    </div>
  );
}

export default function ReaderPage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const novelIdParam = searchParams.get('novel');
  const chapterParam = searchParams.get('chapter');

  const [selectedNovel, setSelectedNovel] = useState<FeaturedNovel | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingChapter, setIsLoadingChapter] = useState(false);
  const [error, setError] = useState('');
  const [novelData, setNovelData] = useState<NovelData | null>(null);
  const [isTranslating, setIsTranslating] = useState(false);
  const [translateProgress, setTranslateProgress] = useState(0);
  const [terminology, setTerminology] = useState<ExtractedTerm[]>([]);
  const [viewMode, setViewMode] = useState<ViewMode>('original');
  const [fontSize, setFontSize] = useState<FontSize>('medium');
  const [fontFamily, setFontFamily] = useState<FontFamily>('sarabun');
  const [lineSpacing, setLineSpacing] = useState<LineSpacing>('normal');
  const [textWidth, setTextWidth] = useState<number>(768); // max-width in pixels
  const [showChapterList, setShowChapterList] = useState(false);
  const [readingProgress, setReadingProgress] = useState(0);
  const [currentChapterForNav, setCurrentChapterForNav] = useState(1);
  const [totalChaptersForNav, setTotalChaptersForNav] = useState(0);
  const [showNovelSelector, setShowNovelSelector] = useState(false);
  const [customNovelUrl, setCustomNovelUrl] = useState('');
  const [isLoadingCustomNovel, setIsLoadingCustomNovel] = useState(false);
  const [selectedModel, setSelectedModel] = useState<AIModel>('gpt-4o');
  const [showRefineModal, setShowRefineModal] = useState(false);
  const [isRefining, setIsRefining] = useState(false);
  const [translationStats, setTranslationStats] = useState<{
    model: string;
    tokens: number;
    quality?: { grade: string; score: number };
  } | null>(null);

  const contentRef = useRef<HTMLDivElement>(null);

  // Initialize from URL params
  useEffect(() => {
    if (novelIdParam) {
      const novel = getNovelById(novelIdParam);
      if (novel) {
        setSelectedNovel(novel);
        loadNovel(novel, chapterParam ? parseInt(chapterParam) : undefined);
      }
    }
  }, [novelIdParam, chapterParam]);

  // Load settings
  useEffect(() => {
    const settings = localStorage.getItem('readerSettings');
    if (settings) {
      const parsed = JSON.parse(settings);
      setFontSize(parsed.fontSize || 'medium');
      setFontFamily(parsed.fontFamily || 'sarabun');
      setLineSpacing(parsed.lineSpacing || 'normal');
      setTextWidth(parsed.textWidth || 768);
    }
  }, []);

  // Save settings
  useEffect(() => {
    localStorage.setItem('readerSettings', JSON.stringify({
      fontSize,
      fontFamily,
      lineSpacing,
      textWidth,
    }));
  }, [fontSize, fontFamily, lineSpacing, textWidth]);

  // Track reading progress
  useEffect(() => {
    const handleScroll = () => {
      if (contentRef.current) {
        const { scrollTop, scrollHeight, clientHeight } = contentRef.current;
        const progress = (scrollTop / (scrollHeight - clientHeight)) * 100;
        setReadingProgress(Math.round(progress));
      }
    };

    const contentEl = contentRef.current;
    if (contentEl) {
      contentEl.addEventListener('scroll', handleScroll);
      return () => contentEl.removeEventListener('scroll', handleScroll);
    }
  }, [novelData]);

  const loadNovel = async (novel: FeaturedNovel, startChapter?: number) => {
    setIsLoading(true);
    setError('');
    setNovelData(null);
    setTranslateProgress(0);

    try {
      // Try to load from database first
      try {
        const novelFromDb = await novelApi.getNovel(novel.id);

        // If a specific chapter is requested, fetch it directly by number
        let targetChapter: DbChapter | null = null;
        if (startChapter) {
          try {
            targetChapter = await chapterApi.getChapterByNumber(novel.id, startChapter);
          } catch (err) {
            console.log('Chapter not found by number, will try to find in list');
          }
        }

        // Load surrounding chapters for navigation
        const chaptersPerPage = 100;
        const targetChapterNumber = startChapter || 1;
        const targetPage = Math.floor((targetChapterNumber - 1) / chaptersPerPage);
        const offset = targetPage * chaptersPerPage;

        const { chapters: dbChapters, total } = await chapterApi.listChapters(novel.id, chaptersPerPage, offset);

        if (dbChapters.length > 0 || targetChapter) {
          // Combine target chapter with surrounding chapters if needed
          let allChapters = dbChapters;
          let initialChapterIndex = 0;

          if (targetChapter && startChapter) {
            // Check if target chapter is already in the list
            const existingIndex = dbChapters.findIndex(ch => ch.chapter_number === startChapter);
            if (existingIndex >= 0) {
              initialChapterIndex = existingIndex;
            } else {
              // Target chapter not in list, add it and sort
              allChapters = [...dbChapters, targetChapter].sort((a, b) => a.chapter_number - b.chapter_number);
              initialChapterIndex = allChapters.findIndex(ch => ch.chapter_number === startChapter);
            }
          } else if (startChapter) {
            // No target chapter found, find closest in list
            const foundIndex = dbChapters.findIndex(ch => ch.chapter_number === startChapter);
            initialChapterIndex = foundIndex >= 0 ? foundIndex : 0;
          }

          setNovelData({
            title: novelFromDb.title || novel.titleTh,
            original_title: novelFromDb.original_title || novel.titleZh,
            author: novelFromDb.author || novel.authorTh,
            description: novelFromDb.description || novel.descriptionTh,
            cover_image_url: novelFromDb.cover_image_url || novel.coverUrl,
            chapters: allChapters.map(ch => ({
              chapter_number: ch.chapter_number,
              title: ch.title,
              original_title: ch.original_title,
              url: ch.source_url,
              content: ch.original_content || '',
              translated: ch.content || undefined,
              isTranslated: ch.is_translated || false,
              id: ch.id,
            })),
            currentChapterIndex: initialChapterIndex,
            novelId: novel.id,
          });

          // If the target chapter doesn't have content, fetch it
          const currentTargetChapter = allChapters[initialChapterIndex];
          if (currentTargetChapter && !currentTargetChapter.original_content && currentTargetChapter.source_url) {
            const chapterResult = await aiApi.fetchChapterContent(currentTargetChapter.source_url);
            setNovelData(prev => {
              if (!prev) return null;
              const updatedChapters = [...prev.chapters];
              updatedChapters[initialChapterIndex] = {
                ...updatedChapters[initialChapterIndex],
                content: chapterResult.content,
              };
              return { ...prev, chapters: updatedChapters };
            });
          }

          setIsLoading(false);
          return;
        }
      } catch (dbErr) {
        console.log('Novel not in database, will scrape from source');
      }

      // If not in database, scrape from source
      const result = await aiApi.scrapeNovel(novel.chapterListUrl, 'zh');

      // Find the chapter by chapter_number (in case there are gaps in chapter numbers)
      let initialChapterIndex = 0;
      if (startChapter) {
        const foundIndex = result.chapters.findIndex(ch => ch.chapter_number === startChapter);
        initialChapterIndex = foundIndex >= 0 ? foundIndex : 0;
      }

      setNovelData({
        title: result.title || novel.titleTh,
        original_title: result.original_title || novel.titleZh,
        author: result.author || novel.authorTh,
        description: result.description || novel.descriptionTh,
        cover_image_url: result.cover_image_url || novel.coverUrl,
        chapters: result.chapters.map(ch => ({
          ...ch,
          translated: undefined,
        })),
        currentChapterIndex: initialChapterIndex,
        novelId: novel.id,
      });

      // Fetch content for the initial chapter if empty
      if (result.chapters.length > 0 && !result.chapters[initialChapterIndex]?.content) {
        const initialChapter = result.chapters[initialChapterIndex];
        if (initialChapter?.url) {
          try {
            const chapterResult = await aiApi.fetchChapterContent(initialChapter.url);
            setNovelData(prev => {
              if (!prev) return null;
              const updatedChapters = [...prev.chapters];
              updatedChapters[initialChapterIndex] = {
                ...updatedChapters[initialChapterIndex],
                content: chapterResult.content,
              };
              return { ...prev, chapters: updatedChapters };
            });

            // Extract terminology from first chapter
            const terms = await aiApi.extractTerminology(
              chapterResult.content.substring(0, 2000),
              'zh',
              'th'
            );
            setTerminology(terms);
          } catch (err) {
            console.error('Failed to fetch initial chapter:', err);
          }
        }
      } else if (result.chapters.length > 0 && result.chapters[initialChapterIndex]?.content) {
        // Extract terminology from first chapter
        const terms = await aiApi.extractTerminology(
          result.chapters[initialChapterIndex].content.substring(0, 2000),
          'zh',
          'th'
        );
        setTerminology(terms);
      }

      // Load saved progress
      const progressKey = `progress_${novel.id}`;
      const savedProgress = localStorage.getItem(progressKey);
      if (savedProgress && !startChapter) {
        const { chapterNumber } = JSON.parse(savedProgress);
        const chapterIndex = result.chapters.findIndex(ch => ch.chapter_number === chapterNumber);
        if (chapterIndex >= 0) {
          setNovelData(prev => prev ? { ...prev, currentChapterIndex: chapterIndex } : null);
        }
      }
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Failed to load novel. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleNovelSelect = (novel: FeaturedNovel) => {
    // Navigate to chapter selection page
    router.push(`/app/chapters?novel=${novel.id}`);
  };

  const handleAddCustomNovel = async () => {
    if (!customNovelUrl.trim()) return;

    setIsLoadingCustomNovel(true);
    setError('');

    try {
      const token = localStorage.getItem('token');
      const response = await fetch('/api/novels', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          url: customNovelUrl.trim(),
          source_lang: 'zh',
          target_lang: 'th',
        })
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to add novel');
      }

      const { novel_id, title, total_chapters } = data.data;

      // Add to localStorage library
      const savedLibrary = JSON.parse(localStorage.getItem('novelLibrary') || '[]');
      const existingIndex = savedLibrary.findIndex((n: any) => n.novelId === novel_id || n.url === customNovelUrl);
      if (existingIndex >= 0) {
        savedLibrary[existingIndex] = {
          ...savedLibrary[existingIndex],
          title: title || savedLibrary[existingIndex].title,
        };
      } else {
        savedLibrary.push({
          id: novel_id,
          novelId: novel_id,
          url: customNovelUrl,
          title: title || 'Unknown Novel',
          author: 'Unknown Author',
          chapterNumber: 1,
          totalChapters: total_chapters || 0,
          savedAt: Date.now(),
          lastReadAt: Date.now(),
          readingProgress: 0,
        });
      }
      localStorage.setItem('novelLibrary', JSON.stringify(savedLibrary));

      // Clear input and navigate to chapters
      setCustomNovelUrl('');
      router.push(`/app/chapters?novel=${novel_id}`);
    } catch (err: any) {
      setError(err.message || 'Failed to add novel. Please check the URL.');
    } finally {
      setIsLoadingCustomNovel(false);
    }
  };

  const handleTranslate = async () => {
    if (!novelData || novelData.chapters.length === 0) return;

    setIsTranslating(true);
    setTranslateProgress(0);

    try {
      const currentChapter = novelData.chapters[novelData.currentChapterIndex];

      // Get settings from localStorage
      const settingsStr = localStorage.getItem('appSettings');
      const settings = settingsStr ? JSON.parse(settingsStr) : {};

      // Check for cached translation first (if chapter has an ID)
      if (currentChapter.id) {
        const cached = await translationApi.getCachedTranslation(currentChapter.id);
        if (cached && cached.translated_text) {
          // Use cached translation
          setNovelData(prev => {
            if (!prev) return null;
            const updatedChapters = [...prev.chapters];
            updatedChapters[prev.currentChapterIndex] = {
              ...updatedChapters[prev.currentChapterIndex],
              translated: cached.translated_text,
            };
            return { ...prev, chapters: updatedChapters };
          });
          // Show Thai tab since this chapter already has a saved translation
          setViewMode('translated');
          setIsTranslating(false);
          return; // Exit early, no need to translate
        }
      }

      const progressInterval = setInterval(() => {
        setTranslateProgress(prev => Math.min(prev + 10, 90));
      }, 500);

      // Use agentic translation if API keys are available
      let result: {
        translated_text: string;
        model_used: string;
        tokens?: number;
        quality?: { grade: string; score: number };
      };

      if (settings.openaiApiKey || settings.geminiApiKey) {
        // Use agentic translation with user's API keys
        const agenticResult = await aiApi.translateAgentic(currentChapter.content, {
          novelId: novelData.novelId,
          novelTitle: novelData.original_title,
          novelTitleTh: novelData.title,
          author: novelData.author,
          chapterNumber: currentChapter.chapter_number,
          chapterTitle: currentChapter.title,
          genre: settings.defaultGenre || 'fantasy',
          tone: settings.defaultTone || 'dark',
          provider: selectedModel.includes('gemini') ? 'gemini' : 'openai',
          twoStep: settings.twoStepTranslation !== false,
          pronounStyle: settings.pronounStyle || 'traditional',
          openaiApiKey: settings.openaiApiKey,
          geminiApiKey: settings.geminiApiKey,
        });
        result = {
          translated_text: agenticResult.translated_text,
          model_used: agenticResult.model_used,
          tokens: agenticResult.tokens_used,
          quality: agenticResult.quality_score ? {
            grade: agenticResult.grade || 'B',
            score: agenticResult.quality_score
          } : undefined
        };

        // Save translation stats
        setTranslationStats({
          model: agenticResult.model_used,
          tokens: agenticResult.tokens_used,
          quality: result.quality
        });
      } else {
        // Fallback to Google Translate
        const googleResult = await aiApi.translateContent(currentChapter.content, 'zh', 'th');
        result = {
          translated_text: googleResult.translated_text,
          model_used: 'google-translate',
          tokens: 0
        };
        setTranslationStats({
          model: 'google-translate',
          tokens: 0
        });
      }

      clearInterval(progressInterval);
      setTranslateProgress(100);

      // Update chapter with translation in local state
      setNovelData(prev => {
        if (!prev) return null;
        const updatedChapters = [...prev.chapters];
        updatedChapters[prev.currentChapterIndex] = {
          ...updatedChapters[prev.currentChapterIndex],
          translated: result.translated_text,
          translationQuality: result.quality ? {
            grade: result.quality.grade,
            overall_score: result.quality.score,
            issues: []
          } : undefined
        };
        return { ...prev, chapters: updatedChapters };
      });

      // Save translation to backend - this is the critical step for persistence
      if (currentChapter.id) {
        try {
          const response = await fetch(`/api/chapters/translate?id=${currentChapter.id}`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${localStorage.getItem('token')}`
            },
            body: JSON.stringify({
              target_lang: 'th',
              use_context: true,
              translated_text: result.translated_text,
              model_used: result.model_used || 'unknown'
            })
          });
          if (response.ok) {
            const data = await response.json();
            const savedChapter = data.data;
            // Update local state with the backend's confirmed saved version
            setNovelData(prev => {
              if (!prev) return null;
              const updatedChapters = [...prev.chapters];
              updatedChapters[prev.currentChapterIndex] = {
                ...updatedChapters[prev.currentChapterIndex],
                translated: savedChapter?.content || result.translated_text,
              };
              return { ...prev, chapters: updatedChapters };
            });
            console.log('✅ Translation saved to database');
          } else {
            console.warn('⚠️ Backend save failed, translation still works locally');
          }
        } catch (err) {
          console.error('Failed to save translation to database:', err);
        }
      }

      // Don't auto-switch to translated - user clicks the tab to switch
      // But since they clicked the translate tab/button, switch to Thai
      setViewMode('translated');
    } catch (err) {
      const errorInfo = getErrorDisplay(err);
      setError(`${errorInfo.title}: ${errorInfo.message}\n\n💡 ${errorInfo.suggestion}`);
    } finally {
      setIsTranslating(false);
    }
  };

  const handleRefine = async (options: {
    model?: AIModel;
    improveStyle?: boolean;
    fixIssues?: boolean;
  }) => {
    if (!novelData || !currentChapter) return;

    setIsRefining(true);
    setShowRefineModal(false);

    try {
      const settingsStr = localStorage.getItem('appSettings');
      const settings = settingsStr ? JSON.parse(settingsStr) : {};
      const currentChapter = novelData.chapters[novelData.currentChapterIndex];

      const modelToUse = options.model || selectedModel;
      setSelectedModel(modelToUse);

      const agenticResult = await aiApi.translateAgentic(currentChapter.content, {
        novelId: novelData.novelId,
        novelTitle: novelData.original_title,
        novelTitleTh: novelData.title,
        author: novelData.author,
        chapterNumber: currentChapter.chapter_number,
        chapterTitle: currentChapter.title,
        genre: settings.defaultGenre || 'fantasy',
        tone: settings.defaultTone || 'dark',
        provider: modelToUse.includes('gemini') ? 'gemini' : 'openai',
        twoStep: true, // Always use two-step for refinement
        pronounStyle: settings.pronounStyle || 'traditional',
        openaiApiKey: settings.openaiApiKey,
        geminiApiKey: settings.geminiApiKey,
      });

      // Update with refined translation
      setNovelData(prev => {
        if (!prev) return null;
        const updatedChapters = [...prev.chapters];
        updatedChapters[prev.currentChapterIndex] = {
          ...updatedChapters[prev.currentChapterIndex],
          translated: agenticResult.translated_text,
          translationQuality: {
            grade: agenticResult.grade || 'B',
            overall_score: agenticResult.quality_score || 80,
            issues: agenticResult.issues || []
          }
        };
        return { ...prev, chapters: updatedChapters };
      });

      setTranslationStats({
        model: agenticResult.model_used,
        tokens: agenticResult.tokens_used,
        quality: {
          grade: agenticResult.grade || 'B',
          score: agenticResult.quality_score || 80
        }
      });

      // Save refined translation to database
      if (currentChapter.id) {
        try {
          await chapterApi.translateChapter(currentChapter.id, 'th', true);
        } catch (err) {
          console.error('Failed to save refined translation:', err);
        }
      }

    } catch (err) {
      setError('Refinement failed. Please try again.');
    } finally {
      setIsRefining(false);
    }
  };

  const handleChapterChange = async (index: number) => {
    if (!novelData || index < 0 || index >= novelData.chapters.length) return;

    const targetChapter = novelData.chapters[index];

    // Smart: if already translated, show Thai; otherwise show original
    if (targetChapter.translated || targetChapter.isTranslated) {
      setViewMode('translated');
    } else {
      setViewMode('original');
    }

    // If chapter content is empty, fetch it on-demand
    if (!targetChapter.content) {
      setIsLoadingChapter(true);
      try {
        const result = await aiApi.fetchChapterContent(targetChapter.url);

        // Save original content to DB so it persists
        if (targetChapter.id && result.content) {
          fetch(`/api/chapters/update?id=${targetChapter.id}`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${localStorage.getItem('token')}`
            },
            body: JSON.stringify({
              original_content: result.content,
              word_count: result.content.length,
              is_scraped: true,
            })
          }).catch(err => console.warn('Failed to save chapter content to DB:', err));
        }

        setNovelData(prev => {
          if (!prev) return null;
          const updatedChapters = [...prev.chapters];
          updatedChapters[index] = {
            ...updatedChapters[index],
            content: result.content,
          };
          return { ...prev, chapters: updatedChapters, currentChapterIndex: index };
        });
      } catch (err: any) {
        setError(err.response?.data?.detail || 'Failed to load chapter. Please try again.');
        setIsLoadingChapter(false);
        return;
      }
      setIsLoadingChapter(false);
    } else {
      setNovelData(prev => prev ? { ...prev, currentChapterIndex: index } : null);
    }

    setShowChapterList(false);

    if (contentRef.current) {
      contentRef.current.scrollTop = 0;
    }

    // Save progress
    if (selectedNovel) {
      const progressKey = `progress_${selectedNovel.id}`;
      localStorage.setItem(progressKey, JSON.stringify({
        chapterNumber: novelData.chapters[index].chapter_number,
        lastRead: Date.now(),
      }));
    }
  };

  const handlePreviousChapter = () => {
    if (novelData && novelData.currentChapterIndex > 0) {
      handleChapterChange(novelData.currentChapterIndex - 1);
    }
  };

  const handleNextChapter = () => {
    if (novelData && novelData.currentChapterIndex < novelData.chapters.length - 1) {
      handleChapterChange(novelData.currentChapterIndex + 1);
    }
  };

  // Keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't trigger if user is typing in an input
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;

      switch (e.key) {
        case 'ArrowLeft':
          e.preventDefault();
          handlePreviousChapter();
          break;
        case 'ArrowRight':
          e.preventDefault();
          handleNextChapter();
          break;
        case 'Home':
          e.preventDefault();
          if (novelData && novelData.chapters.length > 0) handleChapterChange(0);
          break;
        case 'End':
          e.preventDefault();
          if (novelData) handleChapterChange(novelData.chapters.length - 1);
          break;
        case 't':
          // Toggle view mode
          if (e.ctrlKey || e.metaKey) {
            e.preventDefault();
            setViewMode(prev => {
              const modes: ViewMode[] = ['original', 'translated', 'sideBySide'];
              const idx = modes.indexOf(prev);
              return modes[(idx + 1) % modes.length];
            });
          }
          break;
        case 'f':
          // Toggle font size
          if (e.ctrlKey || e.metaKey) {
            e.preventDefault();
            setFontSize(prev => {
              const sizes: FontSize[] = ['small', 'medium', 'large', 'xlarge'];
              const idx = sizes.indexOf(prev);
              return sizes[(idx + 1) % sizes.length];
            });
          }
          break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [novelData, handleChapterChange]);

  const saveToLibrary = () => {
    if (!novelData || !selectedNovel || novelData.chapters.length === 0) return;

    const currentChapter = novelData.chapters[novelData.currentChapterIndex];
    const savedNovel = {
      id: selectedNovel.id,
      novelId: selectedNovel.id,
      url: selectedNovel.chapterListUrl,
      title: novelData.title,
      originalTitle: novelData.original_title,
      author: novelData.author,
      chapterNumber: currentChapter.chapter_number,
      content: currentChapter.content,
      translatedContent: currentChapter.translated || '',
      terminology: terminology,
      savedAt: Date.now(),
      lastReadAt: Date.now(),
      readingProgress: readingProgress,
    };

    const savedLibrary = localStorage.getItem('novelLibrary');
    const library = savedLibrary ? JSON.parse(savedLibrary) : [];
    const newLibrary = [savedNovel, ...library.filter((n: any) => n.id !== selectedNovel.id)];
    localStorage.setItem('novelLibrary', JSON.stringify(newLibrary));
  };

  const currentChapter = novelData?.chapters[novelData.currentChapterIndex];
  const translatedContent = currentChapter?.translated || '';
  const originalContent = currentChapter?.content || '';

  // New feature hooks (must be after currentChapter is defined)
  const userId = typeof window !== 'undefined' ? localStorage.getItem('userId') || undefined : undefined;
  const { feedbackList, qualityScore, submitFeedback } = useTranslationFeedback(
    novelData?.novelId || '',
    currentChapter?.chapter_number
  );
  const { currentProgress, saveCurrentProgress } = useCurrentReadingSession(novelData?.novelId || '');
  const { bookmarks, addBookmark, getBookmarksForNovel } = useBookmarks(userId);
  const novelBookmarks = novelData?.novelId ? getBookmarksForNovel(novelData.novelId) : [];

  const handleAddBookmark = async (
    _novelId: string,
    chapterNumber: number,
    position: number,
    note?: string
  ) => {
    return addBookmark(_novelId, chapterNumber, position, note);
  };

  const handleFeedbackSubmit = async (data: {
    rating: number;
    comment?: string;
    has_errors?: boolean;
    error_details?: Array<{ type: string; description: string; original_text?: string; corrected_text?: string }>;
  }) => {
    return submitFeedback(data);
  };

  const LoadingSpinner = ({ message }: { message: string }) => (
    <div className="flex flex-col items-center justify-center py-12">
      <div className="relative">
        <div className="w-16 h-16 border-4 border-blue-200 dark:border-blue-900 rounded-full"></div>
        <div className="absolute top-0 left:0 w-16 h-16 border-4 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
      </div>
      <p className="mt-4 text-gray-600 dark:text-gray-300 font-medium">{message}</p>
      {isTranslating && (
        <div className="w-48 mt-4">
          <div className="h-2 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-blue-500 to-purple-500 transition-all duration-300"
              style={{ width: `${translateProgress}%` }}
            />
          </div>
          <p className="text-xs text-gray-500 mt-1 text-center">{translateProgress}%</p>
        </div>
      )}
    </div>
  );

  return (
    <div className="max-w-5xl mx-auto space-y-4">
      {/* Reading Progress Bar */}
      {readingProgress > 0 && (
        <div className="sticky top-0 z-20 bg-white/80 dark:bg-gray-900/80 backdrop-blur-lg border-b border-gray-200 dark:border-gray-800 px-4 py-2 flex items-center justify-between text-xs">
          <div className="flex items-center gap-3">
            <div className="h-1.5 w-32 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
              <div className="h-full bg-gradient-to-r from-blue-600 to-purple-600 transition-all" style={{ width: `${readingProgress}%` }} />
            </div>
            <span className="text-gray-500 dark:text-gray-400">{Math.round(readingProgress)}% ของบทนี้</span>
          </div>
        </div>
      )}

      {/* Novel Selector */}
      {!novelData && !isLoading && (
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

          {/* Custom URL Input */}
          <div className="mt-6 pt-6 border-t border-gray-200 dark:border-gray-700">
            <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">
              ➕ เพิ่มนิยายจาก URL
            </h3>
            <div className="flex gap-2">
              <input
                type="text"
                value={customNovelUrl}
                onChange={(e) => setCustomNovelUrl(e.target.value)}
                placeholder="https://www.piaotia.com/html/6/6760/"
                className="flex-1 px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg dark:bg-gray-800 dark:text-white text-sm"
              />
              <button
                onClick={handleAddCustomNovel}
                disabled={isLoadingCustomNovel}
                className="px-4 py-2 bg-gradient-to-r from-green-600 to-teal-600 text-white rounded-lg font-medium hover:opacity-90 disabled:opacity-50 text-sm whitespace-nowrap"
              >
                {isLoadingCustomNovel ? 'กำลังเพิ่ม...' : 'เพิ่มนิยาย'}
              </button>
            </div>
            <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">
              รองรับ: piaotia.com, qidian.com และเว็บไซต์นิยายจีนอื่นๆ
            </p>
          </div>
        </div>
      )}

      {/* Loading State */}
      {isLoading && <LoadingSpinner message="กำลังโหลดนิยาย..." />}

      {/* Error State */}
      {error && !isLoading && (
        <div className="bg-red-50 dark:bg-red-900/30 rounded-xl p-4 border border-red-200 dark:border-red-800">
          <p className="text-red-600 dark:text-red-400">{error}</p>
          <button
            onClick={() => selectedNovel && loadNovel(selectedNovel)}
            className="mt-2 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700"
          >
            ลองอีกครั้ง
          </button>
        </div>
      )}

      {/* Novel Content */}
      {novelData && currentChapter && !isLoading && (
        <div className="space-y-4">
          {/* Novel Header */}
          <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-lg border border-gray-200 dark:border-gray-700 p-4">
            <div className="flex items-start gap-4">
              <img
                src={novelData.cover_image_url || selectedNovel?.coverUrl}
                alt={novelData.title}
                className="w-20 h-28 object-cover rounded-lg shadow"
                onError={(e) => {
                  e.currentTarget.style.display = 'none';
                }}
              />
              <div className="flex-1 min-w-0">
                <h2 className="text-xl font-bold text-gray-900 dark:text-white">
                  {novelData.title}
                </h2>
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  {novelData.author && `ผู้แต่ง: ${novelData.author}`}
                </p>
                <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                  {novelData.chapters.length} บท • {selectedNovel?.status === 'ongoing' ? 'กำลังเขียน' : 'จบ'}
                </p>
              </div>
              <button
                onClick={() => {
                  setSelectedNovel(null);
                  setNovelData(null);
                }}
                className="px-3 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800"
              >
                เปลี่ยนนิยาย
              </button>
            </div>
          </div>

          {/* Chapter Navigation Bar */}
          <div className="bg-white dark:bg-gray-900 rounded-xl shadow border border-gray-200 dark:border-gray-700 p-3 sticky top-4 z-10">
            <div className="flex items-center justify-between gap-4">
              {/* Previous */}
              <button
                onClick={handlePreviousChapter}
                disabled={novelData.currentChapterIndex === 0}
                className="flex items-center gap-1 px-3 py-2 text-sm font-medium text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <span className="text-lg">←</span>
                <span>บทก่อน</span>
              </button>

              {/* Chapter Info */}
              <button
                onClick={() => setShowChapterList(true)}
                className="flex items-center gap-2 px-4 py-2 bg-blue-50 dark:bg-blue-900/30 rounded-lg hover:bg-blue-100 dark:hover:bg-blue-900/50 transition-colors"
              >
                <span className="text-lg">📖</span>
                <div className="text-left">
                  <div className="text-sm font-semibold text-blue-600 dark:text-blue-300">
                    บท {currentChapter.chapter_number}
                  </div>
                  <div className="text-xs text-blue-500 dark:text-blue-400 truncate max-w-[200px]">
                    {currentChapter.original_title}
                  </div>
                </div>
              </button>

              {/* Progress */}
              <div className="hidden sm:flex items-center gap-2">
                <div className="w-32 h-1.5 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-gradient-to-r from-blue-500 to-purple-500"
                    style={{ width: `${readingProgress}%` }}
                  />
                </div>
                <span className="text-xs text-gray-500 dark:text-gray-400">{readingProgress}%</span>
              </div>

              {/* Next */}
              <button
                onClick={handleNextChapter}
                disabled={novelData.currentChapterIndex === novelData.chapters.length - 1}
                className="flex items-center gap-1 px-3 py-2 text-sm font-medium text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <span>บทถัดไป</span>
                <span className="text-lg">→</span>
              </button>
            </div>
          </div>

          {/* New: Reading Progress Tracker & Bookmark */}
          <div className="grid sm:grid-cols-2 gap-4">
            <ReadingProgressTracker
              novelId={novelData.novelId || ''}
              chapterNumber={currentChapter.chapter_number}
              totalChapters={novelData.chapters.length}
              scrollProgress={readingProgress}
            />
            <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl p-4">
              <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">🔖 ที่คั่นหนังสือ</h3>
              <AddBookmarkButton
                novelId={novelData.novelId || ''}
                chapterNumber={currentChapter.chapter_number}
                position={readingProgress}
                onAddBookmark={handleAddBookmark}
              />
              {novelBookmarks.length > 0 && (
                <div className="mt-3 space-y-2">
                  {novelBookmarks.slice(0, 3).map((bm: Bookmark) => (
                    <div key={bm.id} className="text-xs text-gray-500 dark:text-gray-400 flex items-center gap-2">
                      <span>🔖</span>
                      <span>บทที่ {bm.chapter_number}</span>
                      {bm.note && <span className="truncate">- {bm.note}</span>}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Reader Controls */}
          <div className="flex items-center justify-between bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700 p-3">
            {/* View Mode */}
            <div className="flex items-center bg-gray-100 dark:bg-gray-800 rounded-lg p-1">
              <button
                onClick={() => setViewMode('original')}
                className={`px-3 py-1 text-sm rounded-md transition-colors ${viewMode === 'original'
                  ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow'
                  : 'text-gray-600 dark:text-gray-400'
                  }`}
              >
                🇨🇳 ต้นฉบับ
              </button>
              <button
                onClick={() => {
                  if (!translatedContent && !isTranslating) handleTranslate();
                  setViewMode('translated');
                }}
                className={`px-3 py-1 text-sm rounded-md transition-colors ${viewMode === 'translated'
                  ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow'
                  : 'text-gray-600 dark:text-gray-400'
                  }`}
              >
                🇹🇭 แปลไทย
              </button>
              <button
                onClick={() => {
                  if (!translatedContent && !isTranslating) handleTranslate();
                  setViewMode('sideBySide');
                }}
                className={`px-3 py-1 text-sm rounded-md transition-colors ${viewMode === 'sideBySide'
                  ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow'
                  : 'text-gray-600 dark:text-gray-400'
                  }`}
              >
                ⚖️ เทียบ
              </button>
            </div>

            {/* Font Size */}
            <div className="flex items-center gap-2">
              <span className="text-sm text-gray-500 dark:text-gray-400">ขนาด:</span>
              <select
                value={fontSize}
                onChange={(e) => setFontSize(e.target.value as FontSize)}
                className="px-2 py-1 text-sm border border-gray-300 dark:border-gray-600 rounded-lg dark:bg-gray-800 dark:text-white"
              >
                <option value="small">เล็ก</option>
                <option value="medium">กลาง</option>
                <option value="large">ใหญ่</option>
                <option value="xlarge">ใหญ่มาก</option>
              </select>
            </div>

            {/* Font Family */}
            <div className="flex items-center gap-2">
              <span className="text-sm text-gray-500 dark:text-gray-400">ฟอนต์:</span>
              <select
                value={fontFamily}
                onChange={(e) => setFontFamily(e.target.value as FontFamily)}
                className="px-2 py-1 text-sm border border-gray-300 dark:border-gray-600 rounded-lg dark:bg-gray-800 dark:text-white"
              >
                <option value="sarabun">Sarabun</option>
                <option value="noto">Noto Sans</option>
                <option value="inter">Inter</option>
                <option value="system">System</option>
              </select>
            </div>

            {/* Line Spacing */}
            <div className="flex items-center gap-2">
              <span className="text-sm text-gray-500 dark:text-gray-400">บรรทัด:</span>
              <select
                value={lineSpacing}
                onChange={(e) => setLineSpacing(e.target.value as LineSpacing)}
                className="px-2 py-1 text-sm border border-gray-300 dark:border-gray-600 rounded-lg dark:bg-gray-800 dark:text-white"
              >
                <option value="tight">ชิด</option>
                <option value="normal">ปกติ</option>
                <option value="relaxed">ห่าง</option>
                <option value="loose">ห่างมาก</option>
              </select>
            </div>

            {/* Text Width */}
            <div className="flex items-center gap-2">
              <span className="text-sm text-gray-500 dark:text-gray-400">กว้าง:</span>
              <input
                type="range"
                min="480"
                max="1200"
                step="40"
                value={textWidth}
                onChange={(e) => setTextWidth(Number(e.target.value))}
                className="w-20 accent-blue-600"
              />
              <span className="text-xs text-gray-400 w-10">{textWidth}px</span>
            </div>
          </div>

          {/* Content */}
          <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-lg border border-gray-200 dark:border-gray-700 overflow-hidden">
            {/* Loading Chapter State */}
            {isLoadingChapter && <LoadingSpinner message="กำลังโหลดบท..." />}

            {/* Translating State */}
            {isTranslating && <LoadingSpinner message="กำลังแปล..." />}

            {/* Content Display */}
            {!isTranslating && !isLoadingChapter && (
              <div ref={contentRef} className="p-6 md:p-8">
                {viewMode === 'sideBySide' && translatedContent ? (
                  <div className="grid md:grid-cols-2 gap-8">
                    <div className="border-r border-gray-200 dark:border-gray-600 pr-6">
                      <div className="sticky top-0 bg-gray-50 dark:bg-gray-700 py-2 mb-4 font-semibold text-gray-700 dark:text-gray-200 rounded px-3 text-sm">
                        🇨🇳 ต้นฉบับ
                      </div>
                      <ContentRenderer content={originalContent} fontSize={fontSize} fontFamily={fontFamily} lineSpacing={lineSpacing} maxWidth={textWidth} />
                    </div>
                    <div>
                      <div className="sticky top-0 bg-blue-50 dark:bg-blue-900/30 py-2 mb-4 font-semibold text-blue-700 dark:text-blue-300 rounded px-3 text-sm">
                        🇹🇭 คำแปล
                      </div>
                      <ContentRenderer content={translatedContent} fontSize={fontSize} fontFamily={fontFamily} lineSpacing={lineSpacing} maxWidth={textWidth} />
                    </div>
                  </div>
                ) : (
                  <div className="px-6 md:px-8" style={{ maxWidth: `${textWidth}px`, margin: '0 auto' }}>
                    <ContentRenderer
                      content={viewMode === 'original' ? originalContent : translatedContent || originalContent}
                      fontSize={fontSize}
                      fontFamily={fontFamily}
                      lineSpacing={lineSpacing}
                      maxWidth={textWidth}
                    />
                  </div>
                )}
              </div>
            )}

            {/* Translate Button */}
            {!translatedContent && !isTranslating && viewMode !== 'original' && (
              <div className="p-6 space-y-4 border-t border-gray-200 dark:border-gray-700">
                {/* Model Selector */}
                <div className="flex items-center justify-center gap-3">
                  <span className="text-sm text-gray-500 dark:text-gray-400">โมเดล AI:</span>
                  <select
                    value={selectedModel}
                    onChange={(e) => setSelectedModel(e.target.value as AIModel)}
                    className="px-3 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded-lg dark:bg-gray-800 dark:text-white"
                  >
                    <option value="gpt-4o">GPT-4o (แนะนำ)</option>
                    <option value="gpt-4o-mini">GPT-4o Mini (เร็วกว่า)</option>
                    <option value="gemini-2.0-flash">Gemini 2.0 Flash</option>
                    <option value="gemini-1.5-pro">Gemini 1.5 Pro</option>
                  </select>
                </div>

                <div className="text-center">
                  <button
                    onClick={handleTranslate}
                    className="px-8 py-3 bg-gradient-to-r from-blue-600 to-purple-600 text-white rounded-xl font-semibold hover:opacity-90 transition-opacity"
                  >
                    🌐 แปลเป็นภาษาไทย
                  </button>
                </div>
              </div>
            )}

            {/* Translation Complete - Show Refine Option */}
            {translatedContent && !isTranslating && viewMode !== 'original' && (
              <div className="p-4 bg-gray-50 dark:bg-gray-800 border-t border-gray-200 dark:border-gray-700">
                <div className="flex items-center justify-between flex-wrap gap-3">
                  {/* Quality Score */}
                  {translationStats?.quality && (
                    <div className="flex items-center gap-2">
                      <span className={`px-2 py-1 rounded text-sm font-bold ${translationStats.quality.grade === 'A' ? 'bg-green-100 text-green-700' :
                        translationStats.quality.grade === 'B' ? 'bg-blue-100 text-blue-700' :
                          translationStats.quality.grade === 'C' ? 'bg-yellow-100 text-yellow-700' :
                            'bg-red-100 text-red-700'
                        }`}>
                        เกรด {translationStats.quality.grade}
                      </span>
                      <span className="text-xs text-gray-500">
                        {translationStats.quality.score}/100
                      </span>
                    </div>
                  )}

                  {/* Model Used */}
                  <div className="text-xs text-gray-400">
                    ใช้: {translationStats?.model || 'AI'}
                    {translationStats?.tokens ? ` (${translationStats.tokens} tokens)` : ''}
                  </div>

                  {/* Refine Button */}
                  <button
                    onClick={() => setShowRefineModal(true)}
                    className="px-4 py-2 bg-purple-600 text-white text-sm rounded-lg hover:bg-purple-700 transition-colors flex items-center gap-2"
                  >
                    ✨ ปรับปรุงการแปล
                  </button>
                </div>

                {/* New: Star Rating & Translation Feedback */}
                <div className="mt-4 pt-4 border-t border-gray-200 dark:border-gray-700 space-y-4">
                  <StarRating
                    rating={qualityScore?.avg_rating ? Math.round(qualityScore.avg_rating) : 0}
                    onRate={(rating) => submitFeedback({ rating, comment: undefined })}
                    size="sm"
                    label="ให้คะแนนบทนี้"
                  />
                  {qualityScore && qualityScore.feedback_count > 0 && (
                    <p className="text-xs text-gray-500 dark:text-gray-400">
                      คะแนนเฉลี่ย: {qualityScore.avg_rating.toFixed(1)}/5 ({qualityScore.feedback_count} คะแนน)
                    </p>
                  )}

                  <details className="group">
                    <summary className="cursor-pointer text-sm text-blue-600 dark:text-blue-400 hover:underline font-medium">
                      📝 แสดงความคิดเห็นเกี่ยวกับบทนี้
                    </summary>
                    <div className="mt-3">
                      <TranslationFeedbackForm
                        novelId={novelData.novelId || ''}
                        chapterNumber={currentChapter.chapter_number}
                        onSubmit={handleFeedbackSubmit}
                      />
                    </div>
                  </details>
                </div>
              </div>
            )}

            {/* Refining indicator */}
            {isRefining && (
              <div className="p-4 bg-purple-50 dark:bg-purple-900/20 border-t border-gray-200 dark:border-gray-700">
                <div className="flex items-center justify-center gap-3">
                  <div className="w-5 h-5 border-2 border-purple-500 border-t-transparent rounded-full animate-spin"></div>
                  <span className="text-purple-600 dark:text-purple-300 font-medium">กำลังปรับปรุงการแปล...</span>
                </div>
              </div>
            )}

            {/* Bottom Navigation */}
            <div className="p-4 bg-gray-50 dark:bg-gray-800 border-t border-gray-200 dark:border-gray-700">
              <div className="flex items-center justify-between">
                <button
                  onClick={handlePreviousChapter}
                  disabled={novelData.currentChapterIndex === 0}
                  className="flex items-center gap-2 px-4 py-2 text-sm text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white disabled:opacity-50"
                >
                  ← บทก่อนหน้า
                </button>
                <span className="text-sm text-gray-500 dark:text-gray-400">
                  {currentChapter.chapter_number} / {novelData.chapters.length}
                </span>
                <button
                  onClick={handleNextChapter}
                  disabled={novelData.currentChapterIndex === novelData.chapters.length - 1}
                  className="flex items-center gap-2 px-4 py-2 text-sm text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white disabled:opacity-50"
                >
                  บทถัดไป →
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Chapter List Modal */}
      {showChapterList && novelData && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white dark:bg-gray-800 rounded-2xl w-full max-w-2xl mx-4 max-h-[80vh] overflow-hidden">
            <div className="p-4 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                📖 บททั้งหมด ({novelData.chapters.length} บท)
              </h3>
              <button
                onClick={() => setShowChapterList(false)}
                className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg"
              >
                ✕
              </button>
            </div>

            {/* Quick Jump */}
            <div className="p-3 bg-gray-50 dark:bg-gray-700 border-b border-gray-200 dark:border-gray-600">
              <div className="flex items-center gap-2">
                <span className="text-sm text-gray-500 dark:text-gray-400">กระโดดไปบท:</span>
                <input
                  type="number"
                  min={1}
                  max={novelData.chapters.length}
                  placeholder={String(currentChapter?.chapter_number || 1)}
                  className="w-20 px-2 py-1 text-sm border border-gray-300 dark:border-gray-600 rounded-lg dark:bg-gray-800 dark:text-white"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      const targetChapter = parseInt(e.currentTarget.value);
                      const index = novelData.chapters.findIndex(ch => ch.chapter_number === targetChapter);
                      if (index >= 0) {
                        handleChapterChange(index);
                      }
                    }
                  }}
                />
              </div>
            </div>

            <div className="overflow-y-auto max-h-[60vh]">
              {novelData.chapters.map((chapter, index) => (
                <button
                  key={index}
                  onClick={() => handleChapterChange(index)}
                  className={`w-full p-3 text-left hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors border-b border-gray-100 dark:border-gray-700 last:border-b-0 ${index === novelData.currentChapterIndex ? 'bg-blue-50 dark:bg-blue-900/20' : ''}`}
                >
                  <div className="flex items-center gap-3">
                    <span className="text-sm font-medium text-gray-500 dark:text-gray-400 w-16">
                      บท {chapter.chapter_number}
                    </span>
                    <span className={`text-sm flex-1 truncate ${index === novelData.currentChapterIndex ? 'text-blue-600 dark:text-blue-400 font-medium' : 'text-gray-700 dark:text-gray-300'}`}>
                      {chapter.original_title}
                    </span>
                    {chapter.translated && (
                      <span className="text-xs text-green-500">✓ แปลแล้ว</span>
                    )}
                  </div>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Refine Translation Modal */}
      {showRefineModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white dark:bg-gray-800 rounded-2xl w-full max-w-lg mx-4 overflow-hidden">
            <div className="p-4 border-b border-gray-200 dark:border-gray-700">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                ✨ ปรับปรุงการแปล
              </h3>
              <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                เลือกวิธีที่ต้องการปรับปรุงการแปล
              </p>
            </div>

            <div className="p-4 space-y-4">
              {/* Model Selection */}
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  เปลี่ยนโมเดล AI
                </label>
                <select
                  value={selectedModel}
                  onChange={(e) => setSelectedModel(e.target.value as AIModel)}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg dark:bg-gray-700 dark:text-white"
                >
                  <option value="gpt-4o">GPT-4o (แนะนำ - คุณภาพสูง)</option>
                  <option value="gpt-4o-mini">GPT-4o Mini (เร็วกว่า)</option>
                  <option value="gemini-2.0-flash">Gemini 2.0 Flash (เร็วและดี)</option>
                  <option value="gemini-1.5-pro">Gemini 1.5 Pro (คุณภาพสูง)</option>
                </select>
              </div>

              {/* Current Quality */}
              {translationStats?.quality && (
                <div className="p-3 bg-gray-50 dark:bg-gray-700 rounded-lg">
                  <div className="text-sm text-gray-600 dark:text-gray-300">
                    คุณภาพปัจจุบัน:
                    <span className={`ml-2 font-bold ${translationStats.quality.grade === 'A' ? 'text-green-600' :
                      translationStats.quality.grade === 'B' ? 'text-blue-600' :
                        translationStats.quality.grade === 'C' ? 'text-yellow-600' :
                          'text-red-600'
                      }`}>
                      {translationStats.quality.grade} ({translationStats.quality.score}/100)
                    </span>
                  </div>
                </div>
              )}

              {/* Quick Options */}
              <div className="grid grid-cols-2 gap-3">
                <button
                  onClick={() => handleRefine({ model: selectedModel })}
                  className="p-3 bg-blue-50 dark:bg-blue-900/30 rounded-lg border border-blue-200 dark:border-blue-700 hover:bg-blue-100 dark:hover:bg-blue-900/50 transition-colors text-left"
                >
                  <div className="font-medium text-blue-700 dark:text-blue-300">🔄 แปลใหม่</div>
                  <div className="text-xs text-blue-600 dark:text-blue-400 mt-1">
                    ใช้โมเดลที่เลือกแปลใหม่ทั้งหมด
                  </div>
                </button>

                <button
                  onClick={() => handleRefine({ model: 'gpt-4o' })}
                  className="p-3 bg-purple-50 dark:bg-purple-900/30 rounded-lg border border-purple-200 dark:border-purple-700 hover:bg-purple-100 dark:hover:bg-purple-900/50 transition-colors text-left"
                >
                  <div className="font-medium text-purple-700 dark:text-purple-300">⬆️ อัปเกรด</div>
                  <div className="text-xs text-purple-600 dark:text-purple-400 mt-1">
                    ใช้ GPT-4o เพื่อคุณภาพสูงสุด
                  </div>
                </button>
              </div>
            </div>

            <div className="p-4 border-t border-gray-200 dark:border-gray-700 flex gap-3">
              <button
                onClick={() => setShowRefineModal(false)}
                className="flex-1 px-4 py-2 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700"
              >
                ยกเลิก
              </button>
              <button
                onClick={() => handleRefine({ model: selectedModel })}
                className="flex-1 px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700"
              >
                ✨ เริ่มปรับปรุง
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
