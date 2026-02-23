-- Supabase Database Schema for PDF Chunks and Optimized Messages
-- Run this in your Supabase SQL editor to create the tables

-- 1. PDF Chunks Table (for RAG)
CREATE TABLE IF NOT EXISTS pdf_chunks (
    id BIGSERIAL PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    pdf_id TEXT NOT NULL, -- Identifier for the PDF (e.g., filename hash)
    chunk_id INTEGER NOT NULL,
    chunk_text TEXT NOT NULL,
    word_count INTEGER DEFAULT 0,
    start_index INTEGER DEFAULT 0,
    end_index INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    
    -- Ensure one chunk per pdf_id + chunk_id per user
    UNIQUE(user_id, pdf_id, chunk_id)
);

-- Indexes for fast queries (essential for 10,000+ users)
CREATE INDEX IF NOT EXISTS idx_pdf_chunks_user_pdf ON pdf_chunks(user_id, pdf_id);
CREATE INDEX IF NOT EXISTS idx_pdf_chunks_user_id ON pdf_chunks(user_id);
CREATE INDEX IF NOT EXISTS idx_pdf_chunks_pdf_id ON pdf_chunks(pdf_id);
CREATE INDEX IF NOT EXISTS idx_pdf_chunks_created_at ON pdf_chunks(created_at DESC);

-- 2. Optimized Messages Table (add indexes if they don't exist)
CREATE INDEX IF NOT EXISTS idx_messages_user_created ON messages(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_messages_user_id ON messages(user_id);

-- 3. Query Cache Table (to reduce API calls)
CREATE TABLE IF NOT EXISTS query_cache (
    id BIGSERIAL PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    pdf_id TEXT NOT NULL,
    query_hash TEXT NOT NULL, -- Hash of the query text
    query_text TEXT NOT NULL,
    response_text TEXT NOT NULL,
    model_used TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    expires_at TIMESTAMPTZ DEFAULT NOW() + INTERVAL '7 days',
    
    -- Ensure one cached response per query
    UNIQUE(user_id, pdf_id, query_hash)
);

-- Indexes for query cache
CREATE INDEX IF NOT EXISTS idx_query_cache_user_pdf ON query_cache(user_id, pdf_id);
CREATE INDEX IF NOT EXISTS idx_query_cache_hash ON query_cache(query_hash);
CREATE INDEX IF NOT EXISTS idx_query_cache_expires ON query_cache(expires_at);

-- 4. PDF Metadata Table (optional - to track uploaded PDFs)
CREATE TABLE IF NOT EXISTS pdf_metadata (
    id BIGSERIAL PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    pdf_id TEXT NOT NULL,
    filename TEXT NOT NULL,
    file_size BIGINT,
    total_chunks INTEGER DEFAULT 0,
    total_words INTEGER DEFAULT 0,
    uploaded_at TIMESTAMPTZ DEFAULT NOW(),
    last_accessed_at TIMESTAMPTZ DEFAULT NOW(),
    
    UNIQUE(user_id, pdf_id)
);

-- Indexes for PDF metadata
CREATE INDEX IF NOT EXISTS idx_pdf_metadata_user_id ON pdf_metadata(user_id);
CREATE INDEX IF NOT EXISTS idx_pdf_metadata_pdf_id ON pdf_metadata(pdf_id);
CREATE INDEX IF NOT EXISTS idx_pdf_metadata_last_accessed ON pdf_metadata(last_accessed_at DESC);

-- Enable Row Level Security (RLS)
ALTER TABLE pdf_chunks ENABLE ROW LEVEL SECURITY;
ALTER TABLE query_cache ENABLE ROW LEVEL SECURITY;
ALTER TABLE pdf_metadata ENABLE ROW LEVEL SECURITY;

-- RLS Policies: Users can only access their own data
CREATE POLICY "Users can only access their own PDF chunks"
    ON pdf_chunks FOR ALL
    USING (auth.uid() = user_id);

CREATE POLICY "Users can only access their own query cache"
    ON query_cache FOR ALL
    USING (auth.uid() = user_id);

CREATE POLICY "Users can only access their own PDF metadata"
    ON pdf_metadata FOR ALL
    USING (auth.uid() = user_id);

-- Function to clean up expired cache entries (run periodically)
CREATE OR REPLACE FUNCTION cleanup_expired_cache()
RETURNS void AS $$
BEGIN
    DELETE FROM query_cache WHERE expires_at < NOW();
END;
$$ LANGUAGE plpgsql;

