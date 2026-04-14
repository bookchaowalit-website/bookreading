-- Create translation_history table
CREATE TABLE IF NOT EXISTS translation_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    novel_id VARCHAR(100) NOT NULL,
    chapter_id UUID,
    chapter_number INTEGER NOT NULL,
    source_text TEXT NOT NULL,
    translated_text TEXT NOT NULL,
    source_lang VARCHAR(10) DEFAULT 'zh',
    target_lang VARCHAR(10) DEFAULT 'th',
    translator_type VARCHAR(50) DEFAULT 'google',
    quality_score FLOAT,
    created_at TIMESTAMP DEFAULT NOW(),
    metadata JSONB DEFAULT '{}'::jsonb
);

CREATE INDEX idx_translation_history_novel_id ON translation_history(novel_id);
CREATE INDEX idx_translation_history_chapter_number ON translation_history(chapter_number);
CREATE INDEX idx_translation_history_created_at ON translation_history(created_at DESC);

-- Create translation_cache table for caching translations
CREATE TABLE IF NOT EXISTS translation_cache (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    source_text_hash VARCHAR(64) UNIQUE NOT NULL,
    source_text TEXT NOT NULL,
    translated_text TEXT NOT NULL,
    source_lang VARCHAR(10) DEFAULT 'zh',
    target_lang VARCHAR(10) DEFAULT 'th',
    translator_type VARCHAR(50) DEFAULT 'google',
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    usage_count INTEGER DEFAULT 1
);

CREATE INDEX idx_translation_cache_hash ON translation_cache(source_text_hash);
