-- Add reading progress, bookmarks, and translation feedback tables

-- ============================================
-- READING PROGRESS & BOOKMARKS
-- ============================================

CREATE TABLE IF NOT EXISTS reading_progress (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    novel_id VARCHAR(100) NOT NULL,
    chapter_number INTEGER DEFAULT 0,
    progress_percentage FLOAT DEFAULT 0,
    last_read_at TIMESTAMP DEFAULT NOW(),
    created_at TIMESTAMP DEFAULT NOW(),
    UNIQUE(user_id, novel_id)
);

CREATE INDEX idx_reading_progress_user_id ON reading_progress(user_id);
CREATE INDEX idx_reading_progress_last_read ON reading_progress(user_id, last_read_at DESC);

CREATE TABLE IF NOT EXISTS bookmarks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    novel_id VARCHAR(100) NOT NULL,
    chapter_number INTEGER NOT NULL,
    position INTEGER DEFAULT 0,
    note TEXT,
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_bookmarks_user_id ON bookmarks(user_id);
CREATE INDEX idx_bookmarks_novel_chapter ON bookmarks(novel_id, chapter_number);

-- ============================================
-- TRANSLATION QUALITY FEEDBACK
-- ============================================

CREATE TABLE IF NOT EXISTS translation_feedback (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    novel_id VARCHAR(100) NOT NULL,
    chapter_number INTEGER NOT NULL,
    rating INTEGER CHECK (rating >= 1 AND rating <= 5),
    comment TEXT,
    has_errors BOOLEAN DEFAULT FALSE,
    error_details JSONB DEFAULT '[]'::jsonb,
    created_at TIMESTAMP DEFAULT NOW(),
    UNIQUE(user_id, novel_id, chapter_number)
);

CREATE INDEX idx_translation_feedback_novel ON translation_feedback(novel_id, chapter_number);
CREATE INDEX idx_translation_feedback_rating ON translation_feedback(rating);

-- Add quality_score column to chapters
ALTER TABLE chapters ADD COLUMN IF NOT EXISTS quality_score FLOAT;
ALTER TABLE chapters ADD COLUMN IF NOT EXISTS feedback_count INTEGER DEFAULT 0;
