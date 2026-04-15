/**
 * API client for new features:
 * - Auto-Update Novel Tracking
 * - Reading Progress & Bookmarks
 * - Translation Quality Feedback
 */

import axios from 'axios';

const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:8080';

const apiClient = axios.create({
  baseURL: BACKEND_URL,
  withCredentials: true, // Send cookies automatically
});

// ============================================
// Library Management
// ============================================

export async function getLibrary() {
  const response = await apiClient.get('/api/library');
  return response.data;
}

export async function addToLibrary(data: { novel_id: string }) {
  const response = await apiClient.post('/api/library', data);
  return response.data;
}

export async function removeFromLibrary(novelId: string) {
  const response = await apiClient.delete('/api/library', {
    params: { novel_id: novelId },
  });
  return response.data;
}

export async function getUserProfile() {
  const response = await apiClient.get('/api/users/me');
  return response.data;
}

// ============================================
// Auto-Update Novel Tracking
// ============================================

export async function subscribeToNovel(data: {
  novel_id: string;
  source_url: string;
  source_type: string;
}) {
  const response = await apiClient.post('/api/subscriptions', data);
  return response.data;
}

export async function unsubscribeFromNovel(subscriptionId: string) {
  const response = await apiClient.delete('/api/subscriptions', {
    params: { id: subscriptionId },
  });
  return response.data;
}

export async function getUserSubscriptions(userId: string) {
  const response = await apiClient.get('/api/subscriptions', {
    params: { user_id: userId },
  });
  return response.data;
}

export async function triggerNovelUpdate() {
  const response = await apiClient.post('/api/subscriptions/trigger-update');
  return response.data;
}

export async function getUpdateHistory(novelId: string, limit = 10) {
  const response = await apiClient.get('/api/subscriptions/history', {
    params: { novel_id: novelId, limit },
  });
  return response.data;
}

// ============================================
// Reading Progress
// ============================================

export async function saveReadingProgress(data: {
  novel_id: string;
  chapter_number: number;
  progress_percentage: number;
}) {
  const response = await apiClient.post('/api/reading-progress', data);
  return response.data;
}

export async function getReadingProgress(userId: string) {
  const response = await apiClient.get('/api/reading-progress', {
    params: { user_id: userId },
  });
  return response.data;
}

export async function getNovelProgress(userId: string, novelId: string) {
  const response = await apiClient.get('/api/reading-progress/novel', {
    params: { user_id: userId, novel_id: novelId },
  });
  return response.data;
}

// ============================================
// Bookmarks
// ============================================

export async function addBookmark(data: {
  novel_id: string;
  chapter_number: number;
  position: number;
  note?: string;
}) {
  const response = await apiClient.post('/api/bookmarks', data);
  return response.data;
}

export async function removeBookmark(bookmarkId: string) {
  const response = await apiClient.delete('/api/bookmarks', {
    params: { id: bookmarkId },
  });
  return response.data;
}

export async function getUserBookmarks(userId: string) {
  const response = await apiClient.get('/api/bookmarks', {
    params: { user_id: userId },
  });
  return response.data;
}

export async function getNovelBookmarks(userId: string, novelId: string) {
  const response = await apiClient.get('/api/bookmarks/novel', {
    params: { user_id: userId, novel_id: novelId },
  });
  return response.data;
}

// ============================================
// Translation Quality Feedback
// ============================================

export async function submitTranslationFeedback(data: {
  novel_id: string;
  chapter_number: number;
  rating: number;
  comment?: string;
  has_errors?: boolean;
  error_details?: Array<{
    type: string;
    description: string;
    original_text?: string;
    corrected_text?: string;
  }>;
}) {
  const response = await apiClient.post('/api/feedback', data);
  return response.data;
}

export async function getChapterFeedback(novelId: string, chapterNumber: number) {
  const response = await apiClient.get('/api/feedback/chapter', {
    params: { novel_id: novelId, chapter_number: chapterNumber },
  });
  return response.data;
}

export async function getChapterQualityScore(novelId: string, chapterNumber: number) {
  const response = await apiClient.get('/api/feedback/quality-score', {
    params: { novel_id: novelId, chapter_number: chapterNumber },
  });
  return response.data;
}

export async function getUserFeedbackHistory(userId: string) {
  const response = await apiClient.get('/api/feedback/history', {
    params: { user_id: userId },
  });
  return response.data;
}
