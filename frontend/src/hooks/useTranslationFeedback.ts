import { useState, useEffect, useCallback } from 'react';
import {
  submitTranslationFeedback,
  getChapterFeedback,
  getChapterQualityScore,
} from '@/lib/new-api';
import type { TranslationFeedback, ChapterQualityScore } from '@/lib/types/features';

// ============================================
// Translation Feedback Hook
// ============================================

export function useTranslationFeedback(novelId: string, chapterNumber?: number) {
  const [feedbackList, setFeedbackList] = useState<TranslationFeedback[]>([]);
  const [qualityScore, setQualityScore] = useState<ChapterQualityScore | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    if (!novelId) return;
    
    setLoading(true);
    setError(null);
    try {
      if (chapterNumber !== undefined) {
        const [feedbackRes, scoreRes] = await Promise.all([
          getChapterFeedback(novelId, chapterNumber),
          getChapterQualityScore(novelId, chapterNumber),
        ]);
        setFeedbackList(feedbackRes.data || []);
        setQualityScore(scoreRes.data || null);
      }
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to fetch feedback data');
    } finally {
      setLoading(false);
    }
  }, [novelId, chapterNumber]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const submitFeedback = async (data: {
    rating: number;
    comment?: string;
    has_errors?: boolean;
    error_details?: Array<{
      type: string;
      description: string;
      original_text?: string;
      corrected_text?: string;
    }>;
  }) => {
    if (!novelId || chapterNumber === undefined) return false;

    setError(null);
    try {
      await submitTranslationFeedback({
        novel_id: novelId,
        chapter_number: chapterNumber,
        ...data,
      });
      await fetchData();
      return true;
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to submit feedback');
      return false;
    }
  };

  const submitRating = async (rating: number, comment?: string) => {
    return submitFeedback({ rating, comment });
  };

  const reportError = async (
    errorType: string,
    description: string,
    originalText?: string,
    correctedText?: string
  ) => {
    return submitFeedback({
      rating: 1,
      has_errors: true,
      error_details: [{
        type: errorType,
        description,
        original_text: originalText,
        corrected_text: correctedText,
      }],
    });
  };

  return {
    feedbackList,
    qualityScore,
    loading,
    error,
    submitFeedback,
    submitRating,
    reportError,
    refresh: fetchData,
  };
}

// ============================================
// Quick Rating Hook (for star rating component)
// ============================================

export function useQuickRating(novelId: string, chapterNumber: number) {
  const [userRating, setUserRating] = useState<number | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const [loading, setLoading] = useState(false);

  const submitRating = async (rating: number) => {
    setLoading(true);
    try {
      const { submitTranslationFeedback } = await import('@/lib/new-api');
      await submitTranslationFeedback({
        novel_id: novelId,
        chapter_number: chapterNumber,
        rating,
      });
      setUserRating(rating);
      setSubmitted(true);
      return true;
    } catch (err) {
      console.error('Failed to submit rating:', err);
      return false;
    } finally {
      setLoading(false);
    }
  };

  const reset = () => {
    setUserRating(null);
    setSubmitted(false);
  };

  return { userRating, submitted, loading, submitRating, reset };
}
