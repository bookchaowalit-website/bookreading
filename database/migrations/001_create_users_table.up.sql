-- Create users table
CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    name VARCHAR(255) NOT NULL,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Create user_library table
CREATE TABLE IF NOT EXISTS user_library (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    novel_id VARCHAR(100) NOT NULL,
    added_at TIMESTAMP DEFAULT NOW(),
    UNIQUE(user_id, novel_id)
);

CREATE INDEX idx_user_library_user_id ON user_library(user_id);

-- Create user_terminology table
CREATE TABLE IF NOT EXISTS user_terminology (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    novel_id VARCHAR(100),
    original_term VARCHAR(500) NOT NULL,
    translation VARCHAR(500) NOT NULL,
    term_type VARCHAR(50) DEFAULT 'general',
    description TEXT,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    UNIQUE(user_id, novel_id, original_term)
);

CREATE INDEX idx_user_terminology_user_id ON user_terminology(user_id);
CREATE INDEX idx_user_terminology_novel_id ON user_terminology(novel_id);
