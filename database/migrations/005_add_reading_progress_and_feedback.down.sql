-- Drop translation feedback
DROP TABLE IF EXISTS translation_feedback;

-- Drop bookmarks
DROP TABLE IF EXISTS bookmarks;

-- Drop reading progress
DROP TABLE IF EXISTS reading_progress;

-- Remove added columns from chapters
ALTER TABLE chapters DROP COLUMN IF EXISTS quality_score;
ALTER TABLE chapters DROP COLUMN IF EXISTS feedback_count;
