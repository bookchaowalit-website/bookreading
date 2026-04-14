-- Add novel tracking tables for auto-update, reading progress, bookmarks, and feedback

-- ============================================
-- AUTO-UPDATE NOVEL TRACKING
-- ============================================

-- Track which novels to monitor for updates
CREATE TABLE IF NOT EXISTS novel_subscriptions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    novel_id VARCHAR(100) NOT NULL REFERENCES novels(id) ON DELETE CASCADE,
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    source_url TEXT NOT NULL,
    source_type VARCHAR(50),
    last_chapter_count INTEGER DEFAULT 0,
    last_checked_at TIMESTAMP,
    last_updated_at TIMESTAMP,
    check_interval_hours INTEGER DEFAULT 12,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT NOW(),
    UNIQUE(novel_id, user_id)
);

CREATE INDEX idx_novel_subscriptions_user_id ON novel_subscriptions(user_id);
CREATE INDEX idx_novel_subscriptions_active ON novel_subscriptions(is_active, last_checked_at);

-- Track update history for auditing
CREATE TABLE IF NOT EXISTS novel_update_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    novel_id VARCHAR(100) NOT NULL REFERENCES novels(id) ON DELETE CASCADE,
    chapters_added INTEGER DEFAULT 0,
    chapters_updated INTEGER DEFAULT 0,
    status VARCHAR(50) DEFAULT 'success',
    error_message TEXT,
    checked_at TIMESTAMP DEFAULT NOW(),
    completed_at TIMESTAMP
);

CREATE INDEX idx_novel_update_history_novel_id ON novel_update_history(novel_id);
CREATE INDEX idx_novel_update_history_checked_at ON novel_update_history(checked_at DESC);
