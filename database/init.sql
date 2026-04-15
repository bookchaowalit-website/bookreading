-- Database schema for BookReading Platform

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Users table
CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    name VARCHAR(255),
    avatar_url VARCHAR(500),
    subscription_plan VARCHAR(50) DEFAULT 'free', -- free, pro, team
    subscription_status VARCHAR(50) DEFAULT 'active',
    stripe_customer_id VARCHAR(255),
    stripe_subscription_id VARCHAR(255),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Novels table
CREATE TABLE novels (
    id VARCHAR(100) PRIMARY KEY,
    title VARCHAR(500) NOT NULL,
    original_title VARCHAR(500),
    source_url VARCHAR(1000),
    source_language VARCHAR(10) DEFAULT 'zh',
    target_language VARCHAR(10) DEFAULT 'th',
    author VARCHAR(200),
    description TEXT,
    cover_image_url VARCHAR(1000),
    status VARCHAR(50) DEFAULT 'ongoing', -- ongoing, completed, hiatus
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Chapters table
CREATE TABLE chapters (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    novel_id VARCHAR(100) NOT NULL REFERENCES novels(id) ON DELETE CASCADE,
    chapter_number INTEGER NOT NULL,
    title VARCHAR(500) NOT NULL,
    original_title VARCHAR(500),
    url VARCHAR(500) DEFAULT '',
    source_url VARCHAR(1000),
    content TEXT,
    original_content TEXT,
    translated_content TEXT DEFAULT '',
    word_count INTEGER DEFAULT 0,
    is_translated BOOLEAN DEFAULT FALSE,
    is_scraped BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(novel_id, chapter_number)
);

-- Terminology/Glossary table for consistent translation
CREATE TABLE terminology (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    novel_id VARCHAR(100) REFERENCES novels(id) ON DELETE CASCADE,
    term VARCHAR(200) NOT NULL,
    original_term VARCHAR(200) NOT NULL,
    translation VARCHAR(200) NOT NULL,
    term_type VARCHAR(50), -- character, location, item, technique, organization, etc.
    description TEXT,
    is_auto_generated BOOLEAN DEFAULT FALSE,
    confidence_score DOUBLE PRECISION DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(novel_id, original_term)
);

-- Translation history for AI context
CREATE TABLE translation_history (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    chapter_id UUID NOT NULL REFERENCES chapters(id) ON DELETE CASCADE,
    source_text TEXT NOT NULL,
    translated_text TEXT NOT NULL,
    source_language VARCHAR(10) NOT NULL,
    target_language VARCHAR(10) NOT NULL,
    model_used VARCHAR(100),
    tokens_used INTEGER,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- User library (saved novels)
CREATE TABLE user_library (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    novel_id VARCHAR(100) NOT NULL REFERENCES novels(id) ON DELETE CASCADE,
    reading_progress FLOAT DEFAULT 0,
    last_chapter_read INTEGER DEFAULT 0,
    is_bookmarked BOOLEAN DEFAULT FALSE,
    saved_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    last_read_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_id, novel_id)
);

-- User terminology (custom terms per user)
CREATE TABLE user_terminology (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    original_term VARCHAR(200) NOT NULL,
    translation VARCHAR(200) NOT NULL,
    term_type VARCHAR(50) DEFAULT 'other',
    description TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_id, original_term)
);

-- User bookmarks/reading progress
CREATE TABLE user_progress (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    chapter_id UUID NOT NULL REFERENCES chapters(id) ON DELETE CASCADE,
    progress_percentage FLOAT DEFAULT 0,
    is_completed BOOLEAN DEFAULT FALSE,
    last_read_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_id, chapter_id)
);

-- Indexes for performance
CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_user_library_user ON user_library(user_id);
CREATE INDEX idx_user_library_novel ON user_library(novel_id);
CREATE INDEX idx_user_terminology_user ON user_terminology(user_id);
CREATE INDEX idx_chapters_novel_id ON chapters(novel_id);
CREATE INDEX idx_chapters_chapter_number ON chapters(chapter_number);
CREATE INDEX idx_chapters_novel_number ON chapters(novel_id, chapter_number);
CREATE INDEX idx_terminology_novel_id ON terminology(novel_id);
CREATE INDEX idx_terminology_original ON terminology(original_term);
CREATE INDEX idx_terminology_confidence ON terminology(confidence_score DESC);
CREATE INDEX idx_translation_history_chapter ON translation_history(chapter_id);
CREATE INDEX idx_user_progress_user ON user_progress(user_id);
CREATE INDEX idx_user_progress_chapter ON user_progress(chapter_id);

-- Updated_at trigger function
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Apply updated_at triggers
CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON users
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_novels_updated_at BEFORE UPDATE ON novels
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_chapters_updated_at BEFORE UPDATE ON chapters
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_terminology_updated_at BEFORE UPDATE ON terminology
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_user_terminology_updated_at BEFORE UPDATE ON user_terminology
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ==================== MULTI-AGENT TRANSLATION TABLES ====================

-- Translation Quality Scores
CREATE TABLE translation_quality_scores (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    chapter_id UUID NOT NULL REFERENCES chapters(id) ON DELETE CASCADE,
    grade VARCHAR(1) NOT NULL, -- A, B, C, D
    overall_score FLOAT NOT NULL, -- 0-100
    terminology_score FLOAT NOT NULL,
    flow_score FLOAT NOT NULL,
    accuracy_score FLOAT NOT NULL,
    dialogue_score FLOAT NOT NULL,
    issues JSONB DEFAULT '[]', -- Array of issues found
    strengths JSONB DEFAULT '[]', -- Array of strengths
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Review Queue for Human-in-the-Loop
CREATE TABLE review_queue (
    id VARCHAR(100) PRIMARY KEY, -- novel_id_chXXX_timestamp format
    novel_id VARCHAR(100) NOT NULL REFERENCES novels(id) ON DELETE CASCADE,
    novel_title VARCHAR(500),                   -- Thai novel title for display
    chapter_number INTEGER NOT NULL,
    chapter_title VARCHAR(500),                 -- Chapter title in Thai
    original_text TEXT NOT NULL,
    translated_text TEXT NOT NULL,
    grade VARCHAR(1) NOT NULL,
    overall_score FLOAT NOT NULL,
    issues JSONB DEFAULT '[]',
    strengths JSONB DEFAULT '[]',
    status VARCHAR(20) DEFAULT 'pending', -- pending, approved, edited, rejected
    priority INTEGER DEFAULT 3, -- 1-5, higher = more urgent
    notes TEXT,
    edited_text TEXT,
    reviewed_by VARCHAR(255),
    reviewed_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Agent Pipeline Results (for analysis and improvement)
CREATE TABLE agent_pipeline_results (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    chapter_id UUID NOT NULL REFERENCES chapters(id) ON DELETE CASCADE,
    agent_role VARCHAR(50) NOT NULL, -- translator, terminology, style, quality
    input_text TEXT,
    output_text TEXT,
    issues_found JSONB DEFAULT '[]',
    suggestions JSONB DEFAULT '[]',
    tokens_used INTEGER DEFAULT 0,
    processing_time FLOAT DEFAULT 0, -- seconds
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Translation Sessions (track full pipeline runs)
CREATE TABLE translation_sessions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    novel_id VARCHAR(100) NOT NULL REFERENCES novels(id) ON DELETE CASCADE,
    chapter_number INTEGER NOT NULL,
    final_text TEXT NOT NULL,
    total_tokens INTEGER DEFAULT 0,
    total_time FLOAT DEFAULT 0,
    needs_review BOOLEAN DEFAULT FALSE,
    review_queue_id VARCHAR(100) REFERENCES review_queue(id) ON DELETE SET NULL,
    model_used VARCHAR(100) DEFAULT 'gpt-4o',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Character Profiles (for consistent dialogue style)
CREATE TABLE character_profiles (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    novel_id VARCHAR(100) NOT NULL REFERENCES novels(id) ON DELETE CASCADE,
    original_name VARCHAR(200) NOT NULL,
    thai_name VARCHAR(200) NOT NULL,
    personality TEXT,
    role VARCHAR(100), -- protagonist, antagonist, supporting
    dialogue_style TEXT, -- How they speak
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(novel_id, original_name)
);

-- Apply updated_at trigger for review_queue
CREATE TRIGGER update_review_queue_updated_at BEFORE UPDATE ON review_queue
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_character_profiles_updated_at BEFORE UPDATE ON character_profiles
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Indexes for multi-agent translation tables
CREATE INDEX idx_quality_scores_chapter ON translation_quality_scores(chapter_id);
CREATE INDEX idx_review_queue_novel ON review_queue(novel_id);
CREATE INDEX idx_review_queue_status ON review_queue(status);
CREATE INDEX idx_review_queue_priority ON review_queue(priority DESC);
CREATE INDEX idx_agent_results_chapter ON agent_pipeline_results(chapter_id);
CREATE INDEX idx_agent_results_role ON agent_pipeline_results(agent_role);

-- Translation feedback table
CREATE TABLE IF NOT EXISTS translation_feedback (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    novel_id VARCHAR(100) NOT NULL,
    chapter_number INTEGER NOT NULL,
    rating INTEGER NOT NULL CHECK (rating >= 1 AND rating <= 5),
    comment TEXT,
    has_errors BOOLEAN DEFAULT FALSE,
    error_details JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_id, novel_id, chapter_number)
);

CREATE INDEX idx_feedback_novel_chapter ON translation_feedback(novel_id, chapter_number);
CREATE INDEX idx_feedback_user ON translation_feedback(user_id);

-- Novel subscriptions (auto-update tracking)
CREATE TABLE IF NOT EXISTS novel_subscriptions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    novel_id VARCHAR(100) NOT NULL,
    user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    source_url TEXT NOT NULL,
    source_type VARCHAR(50) DEFAULT 'novel',
    last_chapter_count INTEGER DEFAULT 0,
    last_checked_at TIMESTAMP WITH TIME ZONE,
    last_updated_at TIMESTAMP WITH TIME ZONE,
    check_interval_hours INTEGER DEFAULT 12,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_subscriptions_active ON novel_subscriptions(is_active);
CREATE INDEX IF NOT EXISTS idx_subscriptions_checked ON novel_subscriptions(last_checked_at ASC NULLS FIRST);

-- Novel update history
CREATE TABLE IF NOT EXISTS novel_update_history (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    novel_id VARCHAR(100) NOT NULL,
    status VARCHAR(50) DEFAULT 'checking',
    chapters_added INTEGER DEFAULT 0,
    error_message TEXT,
    checked_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    completed_at TIMESTAMP WITH TIME ZONE
);
CREATE INDEX IF NOT EXISTS idx_update_history_novel ON novel_update_history(novel_id);
CREATE INDEX IF NOT EXISTS idx_update_history_checked ON novel_update_history(checked_at DESC);
CREATE INDEX idx_translation_sessions_novel ON translation_sessions(novel_id);
CREATE INDEX idx_translation_sessions_chapter ON translation_sessions(chapter_number);
CREATE INDEX idx_character_profiles_novel ON character_profiles(novel_id);
