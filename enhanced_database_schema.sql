-- Enhanced Supabase Database Schema for Structured PDF Extraction
-- Run this in your Supabase SQL editor

-- ============================================================================
-- 1. ENHANCED PDF METADATA TABLE
-- ============================================================================
CREATE TABLE IF NOT EXISTS pdf_metadata (
    id BIGSERIAL PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    pdf_id TEXT NOT NULL,
    filename TEXT NOT NULL,
    file_size BIGINT,
    
    -- Structured metadata
    title TEXT,
    authors TEXT[], -- Array of author names
    affiliations TEXT[], -- Array of affiliations
    abstract TEXT,
    keywords TEXT[], -- Array of keywords
    publication_date DATE,
    doi TEXT,
    
    -- Document structure
    has_table_of_contents BOOLEAN DEFAULT FALSE,
    total_pages INTEGER DEFAULT 0,
    language TEXT DEFAULT 'en',
    
    -- Processing info
    total_chunks INTEGER DEFAULT 0,
    total_words INTEGER DEFAULT 0,
    extraction_status TEXT DEFAULT 'pending', -- pending, processing, completed, failed
    extraction_error TEXT,
    extracted_at TIMESTAMPTZ,
    uploaded_at TIMESTAMPTZ DEFAULT NOW(),
    last_accessed_at TIMESTAMPTZ DEFAULT NOW(),
    
    UNIQUE(user_id, pdf_id)
);

-- ============================================================================
-- 2. ENHANCED PDF CHUNKS TABLE
-- ============================================================================
-- Drop old table and recreate with new structure (or ALTER if data exists)
ALTER TABLE IF EXISTS pdf_chunks 
ADD COLUMN IF NOT EXISTS section_title TEXT,
ADD COLUMN IF NOT EXISTS section_level INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS page_start INTEGER,
ADD COLUMN IF NOT EXISTS page_end INTEGER,
ADD COLUMN IF NOT EXISTS figure_references TEXT[],
ADD COLUMN IF NOT EXISTS table_references TEXT[];

-- Update existing chunks to have page info if missing
UPDATE pdf_chunks 
SET page_start = 1, page_end = 1 
WHERE page_start IS NULL OR page_end IS NULL;

-- ============================================================================
-- 3. PDF FIGURES TABLE
-- ============================================================================
CREATE TABLE IF NOT EXISTS pdf_figures (
    id BIGSERIAL PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    pdf_id TEXT NOT NULL,
    figure_id TEXT NOT NULL, -- "Figure 1", "Fig. 2.1", etc.
    caption TEXT,
    page_number INTEGER NOT NULL,
    alt_text TEXT, -- For accessibility
    image_data TEXT, -- Base64 encoded thumbnail (optional, can be large)
    created_at TIMESTAMPTZ DEFAULT NOW(),
    
    UNIQUE(user_id, pdf_id, figure_id)
);

-- ============================================================================
-- 4. PDF TABLES TABLE
-- ============================================================================
CREATE TABLE IF NOT EXISTS pdf_tables (
    id BIGSERIAL PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    pdf_id TEXT NOT NULL,
    table_id TEXT NOT NULL, -- "Table 1", "Table 2.1", etc.
    caption TEXT,
    page_number INTEGER NOT NULL,
    table_data JSONB, -- Structured table data (rows/columns)
    table_text TEXT, -- Plain text representation
    created_at TIMESTAMPTZ DEFAULT NOW(),
    
    UNIQUE(user_id, pdf_id, table_id)
);

-- ============================================================================
-- 5. PDF REFERENCES TABLE
-- ============================================================================
CREATE TABLE IF NOT EXISTS pdf_references (
    id BIGSERIAL PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    pdf_id TEXT NOT NULL,
    reference_id INTEGER NOT NULL, -- [1], [2], etc.
    citation_text TEXT NOT NULL, -- Full citation text
    authors TEXT[],
    title TEXT,
    journal TEXT,
    year INTEGER,
    doi TEXT,
    url TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    
    UNIQUE(user_id, pdf_id, reference_id)
);

-- ============================================================================
-- 6. PDF TABLE OF CONTENTS TABLE
-- ============================================================================
CREATE TABLE IF NOT EXISTS pdf_toc (
    id BIGSERIAL PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    pdf_id TEXT NOT NULL,
    entry_title TEXT NOT NULL,
    entry_level INTEGER NOT NULL, -- 1, 2, 3 for nesting
    page_number INTEGER NOT NULL,
    entry_order INTEGER NOT NULL, -- Order in TOC
    parent_entry_id BIGINT, -- For nested entries (self-reference)
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Add self-referencing foreign key for nested TOC entries
ALTER TABLE pdf_toc 
ADD CONSTRAINT fk_pdf_toc_parent 
FOREIGN KEY (parent_entry_id) 
REFERENCES pdf_toc(id) 
ON DELETE CASCADE;

-- ============================================================================
-- INDEXES FOR PERFORMANCE
-- ============================================================================
-- PDF Metadata
CREATE INDEX IF NOT EXISTS idx_pdf_metadata_user_id ON pdf_metadata(user_id);
CREATE INDEX IF NOT EXISTS idx_pdf_metadata_pdf_id ON pdf_metadata(pdf_id);
CREATE INDEX IF NOT EXISTS idx_pdf_metadata_extraction_status ON pdf_metadata(extraction_status);

-- PDF Chunks
CREATE INDEX IF NOT EXISTS idx_pdf_chunks_section ON pdf_chunks(user_id, pdf_id, section_title);
CREATE INDEX IF NOT EXISTS idx_pdf_chunks_page ON pdf_chunks(user_id, pdf_id, page_start, page_end);
CREATE INDEX IF NOT EXISTS idx_pdf_chunks_user_pdf ON pdf_chunks(user_id, pdf_id);

-- PDF Figures
CREATE INDEX IF NOT EXISTS idx_pdf_figures_pdf ON pdf_figures(user_id, pdf_id);
CREATE INDEX IF NOT EXISTS idx_pdf_figures_page ON pdf_figures(page_number);

-- PDF Tables
CREATE INDEX IF NOT EXISTS idx_pdf_tables_pdf ON pdf_tables(user_id, pdf_id);
CREATE INDEX IF NOT EXISTS idx_pdf_tables_page ON pdf_tables(page_number);

-- PDF References
CREATE INDEX IF NOT EXISTS idx_pdf_references_pdf ON pdf_references(user_id, pdf_id);

-- PDF TOC
CREATE INDEX IF NOT EXISTS idx_pdf_toc_pdf ON pdf_toc(user_id, pdf_id);
CREATE INDEX IF NOT EXISTS idx_pdf_toc_order ON pdf_toc(user_id, pdf_id, entry_order);

-- ============================================================================
-- ROW LEVEL SECURITY (RLS)
-- ============================================================================
ALTER TABLE pdf_metadata ENABLE ROW LEVEL SECURITY;
ALTER TABLE pdf_figures ENABLE ROW LEVEL SECURITY;
ALTER TABLE pdf_tables ENABLE ROW LEVEL SECURITY;
ALTER TABLE pdf_references ENABLE ROW LEVEL SECURITY;
ALTER TABLE pdf_toc ENABLE ROW LEVEL SECURITY;

-- RLS Policies: Users can only access their own data
-- Drop existing policies if they exist, then create new ones
DROP POLICY IF EXISTS "Users can only access their own PDF metadata" ON pdf_metadata;
CREATE POLICY "Users can only access their own PDF metadata"
    ON pdf_metadata FOR ALL
    USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can only access their own PDF figures" ON pdf_figures;
CREATE POLICY "Users can only access their own PDF figures"
    ON pdf_figures FOR ALL
    USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can only access their own PDF tables" ON pdf_tables;
CREATE POLICY "Users can only access their own PDF tables"
    ON pdf_tables FOR ALL
    USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can only access their own PDF references" ON pdf_references;
CREATE POLICY "Users can only access their own PDF references"
    ON pdf_references FOR ALL
    USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can only access their own PDF TOC" ON pdf_toc;
CREATE POLICY "Users can only access their own PDF TOC"
    ON pdf_toc FOR ALL
    USING (auth.uid() = user_id);

-- Note: pdf_chunks, query_cache, and pdf_metadata policies already exist from original schema
-- They don't need to be recreated here

-- ============================================================================
-- HELPER FUNCTIONS
-- ============================================================================

-- Function to update PDF metadata extraction status
CREATE OR REPLACE FUNCTION update_pdf_extraction_status(
    p_user_id UUID,
    p_pdf_id TEXT,
    p_status TEXT,
    p_error TEXT DEFAULT NULL
)
RETURNS void AS $$
BEGIN
    UPDATE pdf_metadata
    SET extraction_status = p_status,
        extraction_error = p_error,
        extracted_at = CASE WHEN p_status = 'completed' THEN NOW() ELSE extracted_at END
    WHERE user_id = p_user_id AND pdf_id = p_pdf_id;
END;
$$ LANGUAGE plpgsql;

-- Function to get PDF structure summary
CREATE OR REPLACE FUNCTION get_pdf_structure_summary(
    p_user_id UUID,
    p_pdf_id TEXT
)
RETURNS JSON AS $$
DECLARE
    result JSON;
BEGIN
    SELECT json_build_object(
        'metadata', (SELECT row_to_json(m) FROM pdf_metadata m WHERE m.user_id = p_user_id AND m.pdf_id = p_pdf_id),
        'chunks_count', (SELECT COUNT(*) FROM pdf_chunks WHERE user_id = p_user_id AND pdf_id = p_pdf_id),
        'figures_count', (SELECT COUNT(*) FROM pdf_figures WHERE user_id = p_user_id AND pdf_id = p_pdf_id),
        'tables_count', (SELECT COUNT(*) FROM pdf_tables WHERE user_id = p_user_id AND pdf_id = p_pdf_id),
        'references_count', (SELECT COUNT(*) FROM pdf_references WHERE user_id = p_user_id AND pdf_id = p_pdf_id),
        'toc_entries_count', (SELECT COUNT(*) FROM pdf_toc WHERE user_id = p_user_id AND pdf_id = p_pdf_id)
    ) INTO result;
    
    RETURN result;
END;
$$ LANGUAGE plpgsql;

