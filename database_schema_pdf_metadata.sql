-- Enhanced PDF Metadata Table
-- Stores processed PDF data from Python backend

-- Update pdf_metadata table to include processed data
ALTER TABLE pdf_metadata 
ADD COLUMN IF NOT EXISTS processed_title TEXT,
ADD COLUMN IF NOT EXISTS processed_author TEXT,
ADD COLUMN IF NOT EXISTS detected_title TEXT,
ADD COLUMN IF NOT EXISTS detected_authors TEXT[], -- Array of author names
ADD COLUMN IF NOT EXISTS detected_logo BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS total_pages INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS total_chunks INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS total_text_length INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS sections_count INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS headings_count INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS tables_count INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS figures_count INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS images_count INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS ocr_performed BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS processing_status TEXT DEFAULT 'pending', -- pending, processing, completed, failed
ADD COLUMN IF NOT EXISTS processing_error TEXT,
ADD COLUMN IF NOT EXISTS processed_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS full_text_preview TEXT; -- First 5000 chars for preview

-- Index for faster queries
CREATE INDEX IF NOT EXISTS idx_pdf_metadata_processing_status ON pdf_metadata(processing_status);
CREATE INDEX IF NOT EXISTS idx_pdf_metadata_processed_at ON pdf_metadata(processed_at DESC);

-- Function to update PDF metadata after processing
CREATE OR REPLACE FUNCTION update_pdf_metadata_after_processing(
    p_user_id UUID,
    p_pdf_id TEXT,
    p_processed_data JSONB
)
RETURNS void AS $$
BEGIN
    UPDATE pdf_metadata
    SET
        processed_title = p_processed_data->>'title',
        processed_author = p_processed_data->>'author',
        detected_title = p_processed_data->'metadata'->>'detected_title',
        detected_authors = ARRAY(SELECT jsonb_array_elements_text(p_processed_data->'metadata'->'detected_authors')),
        detected_logo = (p_processed_data->'metadata'->>'detected_logo')::boolean,
        total_pages = (p_processed_data->>'total_pages')::integer,
        total_chunks = jsonb_array_length(p_processed_data->'chunks'),
        total_text_length = length(p_processed_data->>'full_text'),
        sections_count = jsonb_array_length(p_processed_data->'sections'),
        headings_count = jsonb_array_length(p_processed_data->'headings'),
        tables_count = jsonb_array_length(p_processed_data->'tables'),
        figures_count = jsonb_array_length(p_processed_data->'figures'),
        images_count = jsonb_array_length(p_processed_data->'images'),
        ocr_performed = EXISTS(
            SELECT 1 FROM jsonb_array_elements(p_processed_data->'pages') AS page
            WHERE (page->>'needs_ocr')::boolean = true
        ),
        processing_status = 'completed',
        processed_at = NOW(),
        full_text_preview = LEFT(p_processed_data->>'full_text', 5000),
        last_accessed_at = NOW()
    WHERE user_id = p_user_id AND pdf_id = p_pdf_id;
END;
$$ LANGUAGE plpgsql;

