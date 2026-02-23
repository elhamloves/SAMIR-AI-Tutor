-- Safe Migration Script: Enhanced PDF Structure Support
-- This script safely adds new columns and tables WITHOUT dropping anything
-- Safe to run even if some parts already exist

-- ============================================================================
-- 1. ENHANCE EXISTING pdf_chunks TABLE (Add columns only)
-- ============================================================================
-- Add new columns if they don't exist (no data loss, safe)
DO $$ 
BEGIN
    -- Add section_title column
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'pdf_chunks' AND column_name = 'section_title') THEN
        ALTER TABLE pdf_chunks ADD COLUMN section_title TEXT;
    END IF;
    
    -- Add section_level column
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'pdf_chunks' AND column_name = 'section_level') THEN
        ALTER TABLE pdf_chunks ADD COLUMN section_level INTEGER DEFAULT 0;
    END IF;
    
    -- Add page_start column
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'pdf_chunks' AND column_name = 'page_start') THEN
        ALTER TABLE pdf_chunks ADD COLUMN page_start INTEGER;
    END IF;
    
    -- Add page_end column
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'pdf_chunks' AND column_name = 'page_end') THEN
        ALTER TABLE pdf_chunks ADD COLUMN page_end INTEGER;
    END IF;
    
    -- Add figure_references column
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'pdf_chunks' AND column_name = 'figure_references') THEN
        ALTER TABLE pdf_chunks ADD COLUMN figure_references TEXT[];
    END IF;
    
    -- Add table_references column
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'pdf_chunks' AND column_name = 'table_references') THEN
        ALTER TABLE pdf_chunks ADD COLUMN table_references TEXT[];
    END IF;
    
    -- Update existing chunks to have default page info (safe update)
    UPDATE pdf_chunks 
    SET page_start = 1, page_end = 1 
    WHERE (page_start IS NULL OR page_end IS NULL) 
      AND (page_start IS DISTINCT FROM 1 OR page_end IS DISTINCT FROM 1);
END $$;

-- ============================================================================
-- 2. ENHANCE EXISTING pdf_metadata TABLE (Add columns only)
-- ============================================================================
DO $$ 
BEGIN
    -- Add title column
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'pdf_metadata' AND column_name = 'title') THEN
        ALTER TABLE pdf_metadata ADD COLUMN title TEXT;
    END IF;
    
    -- Add authors column
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'pdf_metadata' AND column_name = 'authors') THEN
        ALTER TABLE pdf_metadata ADD COLUMN authors TEXT[];
    END IF;
    
    -- Add affiliations column
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'pdf_metadata' AND column_name = 'affiliations') THEN
        ALTER TABLE pdf_metadata ADD COLUMN affiliations TEXT[];
    END IF;
    
    -- Add abstract column
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'pdf_metadata' AND column_name = 'abstract') THEN
        ALTER TABLE pdf_metadata ADD COLUMN abstract TEXT;
    END IF;
    
    -- Add keywords column
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'pdf_metadata' AND column_name = 'keywords') THEN
        ALTER TABLE pdf_metadata ADD COLUMN keywords TEXT[];
    END IF;
    
    -- Add publication_date column
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'pdf_metadata' AND column_name = 'publication_date') THEN
        ALTER TABLE pdf_metadata ADD COLUMN publication_date DATE;
    END IF;
    
    -- Add doi column
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'pdf_metadata' AND column_name = 'doi') THEN
        ALTER TABLE pdf_metadata ADD COLUMN doi TEXT;
    END IF;
    
    -- Add has_table_of_contents column
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'pdf_metadata' AND column_name = 'has_table_of_contents') THEN
        ALTER TABLE pdf_metadata ADD COLUMN has_table_of_contents BOOLEAN DEFAULT FALSE;
    END IF;
    
    -- Add language column
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'pdf_metadata' AND column_name = 'language') THEN
        ALTER TABLE pdf_metadata ADD COLUMN language TEXT DEFAULT 'en';
    END IF;
    
    -- Add extraction_status column
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'pdf_metadata' AND column_name = 'extraction_status') THEN
        ALTER TABLE pdf_metadata ADD COLUMN extraction_status TEXT DEFAULT 'pending';
    END IF;
    
    -- Add extraction_error column
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'pdf_metadata' AND column_name = 'extraction_error') THEN
        ALTER TABLE pdf_metadata ADD COLUMN extraction_error TEXT;
    END IF;
    
    -- Add extracted_at column
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'pdf_metadata' AND column_name = 'extracted_at') THEN
        ALTER TABLE pdf_metadata ADD COLUMN extracted_at TIMESTAMPTZ;
    END IF;
END $$;

-- ============================================================================
-- 3. CREATE NEW TABLES (only if they don't exist - safe)
-- ============================================================================

-- PDF Figures Table
CREATE TABLE IF NOT EXISTS pdf_figures (
    id BIGSERIAL PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    pdf_id TEXT NOT NULL,
    figure_id TEXT NOT NULL,
    caption TEXT,
    page_number INTEGER NOT NULL,
    alt_text TEXT,
    image_data TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(user_id, pdf_id, figure_id)
);

-- PDF Tables Table
CREATE TABLE IF NOT EXISTS pdf_tables (
    id BIGSERIAL PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    pdf_id TEXT NOT NULL,
    table_id TEXT NOT NULL,
    caption TEXT,
    page_number INTEGER NOT NULL,
    table_data JSONB,
    table_text TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(user_id, pdf_id, table_id)
);

-- PDF References Table
CREATE TABLE IF NOT EXISTS pdf_references (
    id BIGSERIAL PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    pdf_id TEXT NOT NULL,
    reference_id INTEGER NOT NULL,
    citation_text TEXT NOT NULL,
    authors TEXT[],
    title TEXT,
    journal TEXT,
    year INTEGER,
    doi TEXT,
    url TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(user_id, pdf_id, reference_id)
);

-- PDF Table of Contents Table
CREATE TABLE IF NOT EXISTS pdf_toc (
    id BIGSERIAL PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    pdf_id TEXT NOT NULL,
    entry_title TEXT NOT NULL,
    entry_level INTEGER NOT NULL,
    page_number INTEGER NOT NULL,
    entry_order INTEGER NOT NULL,
    parent_entry_id BIGINT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Add self-referencing foreign key for nested TOC entries (only if not exists)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints 
        WHERE constraint_name = 'fk_pdf_toc_parent'
    ) THEN
        ALTER TABLE pdf_toc 
        ADD CONSTRAINT fk_pdf_toc_parent 
        FOREIGN KEY (parent_entry_id) 
        REFERENCES pdf_toc(id) 
        ON DELETE CASCADE;
    END IF;
END $$;

-- ============================================================================
-- 4. CREATE INDEXES (only if they don't exist - safe)
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_pdf_chunks_section ON pdf_chunks(user_id, pdf_id, section_title);
CREATE INDEX IF NOT EXISTS idx_pdf_chunks_page ON pdf_chunks(user_id, pdf_id, page_start, page_end);
CREATE INDEX IF NOT EXISTS idx_pdf_figures_pdf ON pdf_figures(user_id, pdf_id);
CREATE INDEX IF NOT EXISTS idx_pdf_figures_page ON pdf_figures(page_number);
CREATE INDEX IF NOT EXISTS idx_pdf_tables_pdf ON pdf_tables(user_id, pdf_id);
CREATE INDEX IF NOT EXISTS idx_pdf_tables_page ON pdf_tables(page_number);
CREATE INDEX IF NOT EXISTS idx_pdf_references_pdf ON pdf_references(user_id, pdf_id);
CREATE INDEX IF NOT EXISTS idx_pdf_toc_pdf ON pdf_toc(user_id, pdf_id);
CREATE INDEX IF NOT EXISTS idx_pdf_toc_order ON pdf_toc(user_id, pdf_id, entry_order);
CREATE INDEX IF NOT EXISTS idx_pdf_metadata_extraction_status ON pdf_metadata(extraction_status);

-- ============================================================================
-- 5. ENABLE RLS AND CREATE POLICIES (safe - only creates if doesn't exist)
-- ============================================================================

ALTER TABLE pdf_figures ENABLE ROW LEVEL SECURITY;
ALTER TABLE pdf_tables ENABLE ROW LEVEL SECURITY;
ALTER TABLE pdf_references ENABLE ROW LEVEL SECURITY;
ALTER TABLE pdf_toc ENABLE ROW LEVEL SECURITY;

-- Create policies only if they don't exist (no DROP needed)
DO $$
BEGIN
    -- PDF Figures policy
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE schemaname = 'public' 
        AND tablename = 'pdf_figures' 
        AND policyname = 'Users can only access their own PDF figures'
    ) THEN
        CREATE POLICY "Users can only access their own PDF figures"
            ON pdf_figures FOR ALL
            USING (auth.uid() = user_id);
    END IF;
    
    -- PDF Tables policy
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE schemaname = 'public' 
        AND tablename = 'pdf_tables' 
        AND policyname = 'Users can only access their own PDF tables'
    ) THEN
        CREATE POLICY "Users can only access their own PDF tables"
            ON pdf_tables FOR ALL
            USING (auth.uid() = user_id);
    END IF;
    
    -- PDF References policy
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE schemaname = 'public' 
        AND tablename = 'pdf_references' 
        AND policyname = 'Users can only access their own PDF references'
    ) THEN
        CREATE POLICY "Users can only access their own PDF references"
            ON pdf_references FOR ALL
            USING (auth.uid() = user_id);
    END IF;
    
    -- PDF TOC policy
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE schemaname = 'public' 
        AND tablename = 'pdf_toc' 
        AND policyname = 'Users can only access their own PDF TOC'
    ) THEN
        CREATE POLICY "Users can only access their own PDF TOC"
            ON pdf_toc FOR ALL
            USING (auth.uid() = user_id);
    END IF;
END $$;

-- ============================================================================
-- 6. HELPER FUNCTIONS (safe - CREATE OR REPLACE)
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

