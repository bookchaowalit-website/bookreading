-- Create novels table
CREATE TABLE IF NOT EXISTS novels (
    id VARCHAR(100) PRIMARY KEY,
    title VARCHAR(500) NOT NULL,
    author VARCHAR(255),
    description TEXT,
    cover_url TEXT,
    source_url TEXT,
    source_type VARCHAR(50),
    total_chapters INTEGER DEFAULT 0,
    status VARCHAR(50) DEFAULT 'ongoing',
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_novels_title ON novels(title);
CREATE INDEX idx_novels_author ON novels(author);

-- Create chapters table
CREATE TABLE IF NOT EXISTS chapters (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    novel_id VARCHAR(100) NOT NULL REFERENCES novels(id) ON DELETE CASCADE,
    chapter_number INTEGER NOT NULL,
    title VARCHAR(500) NOT NULL,
    original_title VARCHAR(500),
    url TEXT,
    content TEXT,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    UNIQUE(novel_id, chapter_number)
);

CREATE INDEX idx_chapters_novel_id ON chapters(novel_id);
CREATE INDEX idx_chapters_chapter_number ON chapters(chapter_number);

-- Create terminology table (shared terminology across users)
CREATE TABLE IF NOT EXISTS terminology (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    novel_id VARCHAR(100),
    original_term VARCHAR(500) NOT NULL,
    translation VARCHAR(500) NOT NULL,
    term_type VARCHAR(50) DEFAULT 'general',
    description TEXT,
    source VARCHAR(50) DEFAULT 'manual',
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    UNIQUE(novel_id, original_term)
);

CREATE INDEX idx_terminology_novel_id ON terminology(novel_id);
