/**
 * TypeScript types for new features:
 * - Auto-Update Novel Tracking
 * - Reading Progress & Bookmarks
 * - Translation Quality Feedback
 */

// ============================================
// Auto-Update Novel Tracking
// ============================================

export interface NovelSubscription {
  id: string;
  novel_id: string;
  user_id?: string;
  source_url: string;
  source_type: string;
  last_chapter_count: number;
  last_checked_at?: string;
  last_updated_at?: string;
  check_interval_hours: number;
  is_active: boolean;
  created_at: string;
}

export interface NovelUpdateHistory {
  id: string;
  novel_id: string;
  chapters_added: number;
  chapters_updated: number;
  status: 'success' | 'error' | 'checking';
  error_message?: string;
  checked_at: string;
  completed_at?: string;
}

export interface SubscribeRequest {
  novel_id: string;
  source_url: string;
  source_type: string;
}

// ============================================
// Reading Progress & Bookmarks
// ============================================

export interface ReadingProgress {
  id: string;
  user_id: string;
  novel_id: string;
  chapter_number: number;
  progress_percentage: number;
  last_read_at: string;
  created_at: string;
}

export interface Bookmark {
  id: string;
  user_id: string;
  novel_id: string;
  chapter_number: number;
  position: number;
  note?: string;
  created_at: string;
}

export interface SaveProgressRequest {
  novel_id: string;
  chapter_number: number;
  progress_percentage: number;
}

export interface AddBookmarkRequest {
  novel_id: string;
  chapter_number: number;
  position: number;
  note?: string;
}

// ============================================
// Translation Quality Feedback
// ============================================

export interface TranslationFeedback {
  id: string;
  user_id?: string;
  novel_id: string;
  chapter_number: number;
  rating: number; // 1-5
  comment?: string;
  has_errors: boolean;
  error_details: Array<{
    type: string;
    description: string;
    original_text?: string;
    corrected_text?: string;
  }>;
  created_at: string;
}

export interface SubmitFeedbackRequest {
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
}

export interface ChapterQualityScore {
  novel_id: string;
  chapter_number: number;
  avg_rating: number;
  feedback_count: number;
}

// ============================================
// API Response Types
// ============================================

export interface ApiResponse<T> {
  success: boolean;
  data: T;
  error?: string;
}

export interface PaginatedResponse<T> {
  items: T[];
  total: number;
  page: number;
  limit: number;
}
