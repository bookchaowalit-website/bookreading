import { useState, useEffect, useCallback } from 'react';
import {
  saveReadingProgress,
  getReadingProgress,
  getNovelProgress,
  addBookmark,
  removeBookmark,
  getUserBookmarks,
  getNovelBookmarks,
} from '@/lib/new-api';
import type { ReadingProgress, Bookmark } from '@/lib/types/features';

// ============================================
// Reading Progress Hook
// ============================================

export function useReadingProgress(userId?: string) {
  const [progressList, setProgressList] = useState<ReadingProgress[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchProgress = useCallback(async () => {
    if (!userId) return;
    
    setLoading(true);
    setError(null);
    try {
      const response = await getReadingProgress(userId);
      setProgressList(response.data || []);
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to fetch reading progress');
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    fetchProgress();
  }, [fetchProgress]);

  const saveProgress = async (
    novelId: string,
    chapterNumber: number,
    progressPercentage: number
  ) => {
    setError(null);
    try {
      await saveReadingProgress({
        novel_id: novelId,
        chapter_number: chapterNumber,
        progress_percentage: progressPercentage,
      });
      await fetchProgress();
      return true;
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to save progress');
      return false;
    }
  };

  const getProgressForNovel = (novelId: string) => {
    return progressList.find(p => p.novel_id === novelId) || null;
  };

  return {
    progressList,
    loading,
    error,
    saveProgress,
    getProgressForNovel,
    refresh: fetchProgress,
  };
}

// ============================================
// Current Reading Session Hook
// ============================================

export function useCurrentReadingSession(novelId: string) {
  const [currentProgress, setCurrentProgress] = useState<ReadingProgress | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const loadProgress = async () => {
      const userId = localStorage.getItem('userId');
      if (!userId || !novelId) return;

      setLoading(true);
      try {
        const { getNovelProgress } = await import('@/lib/new-api');
        const response = await getNovelProgress(userId, novelId);
        setCurrentProgress(response.data || null);
      } catch (err) {
        console.error('Failed to load reading progress:', err);
      } finally {
        setLoading(false);
      }
    };

    loadProgress();
  }, [novelId]);

  const saveCurrentProgress = async (chapterNumber: number, percentage: number) => {
    const userId = localStorage.getItem('userId');
    if (!userId) return;

    try {
      const { saveReadingProgress } = await import('@/lib/new-api');
      await saveReadingProgress({
        novel_id: novelId,
        chapter_number: chapterNumber,
        progress_percentage: percentage,
      });
      setCurrentProgress(prev => prev ? {
        ...prev,
        chapter_number: chapterNumber,
        progress_percentage: percentage,
        last_read_at: new Date().toISOString(),
      } : null);
    } catch (err) {
      console.error('Failed to save progress:', err);
    }
  };

  return { currentProgress, loading, saveCurrentProgress };
}

// ============================================
// Bookmarks Hook
// ============================================

export function useBookmarks(userId?: string) {
  const [bookmarks, setBookmarks] = useState<Bookmark[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchBookmarks = useCallback(async () => {
    if (!userId) return;
    
    setLoading(true);
    setError(null);
    try {
      const response = await getUserBookmarks(userId);
      setBookmarks(response.data || []);
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to fetch bookmarks');
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    fetchBookmarks();
  }, [fetchBookmarks]);

  const addNewBookmark = async (
    novelId: string,
    chapterNumber: number,
    position: number,
    note?: string
  ) => {
    setError(null);
    try {
      await addBookmark({
        novel_id: novelId,
        chapter_number: chapterNumber,
        position,
        note,
      });
      await fetchBookmarks();
      return true;
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to add bookmark');
      return false;
    }
  };

  const deleteBookmark = async (bookmarkId: string) => {
    setError(null);
    try {
      await removeBookmark(bookmarkId);
      setBookmarks(bookmarks.filter(b => b.id !== bookmarkId));
      return true;
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to remove bookmark');
      return false;
    }
  };

  const getBookmarksForNovel = (novelId: string) => {
    return bookmarks.filter(b => b.novel_id === novelId);
  };

  return {
    bookmarks,
    loading,
    error,
    addBookmark: addNewBookmark,
    removeBookmark: deleteBookmark,
    getBookmarksForNovel,
    refresh: fetchBookmarks,
  };
}
