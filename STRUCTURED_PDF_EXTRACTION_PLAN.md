# Structured PDF Extraction & RAG Implementation Plan

## Overview
Transform Samir to extract and store all structural elements of PDFs for intelligent, context-aware responses.

---

## 📋 Step 1: Enhanced Database Schema

### New/Updated Tables

#### 1. PDF Metadata Table (Enhanced)
```sql
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
    extracted_at TIMESTAMPTZ,
    uploaded_at TIMESTAMPTZ DEFAULT NOW(),
    last_accessed_at TIMESTAMPTZ DEFAULT NOW(),
    
    UNIQUE(user_id, pdf_id)
);
```

#### 2. PDF Chunks Table (Enhanced)
```sql
CREATE TABLE IF NOT EXISTS pdf_chunks (
    id BIGSERIAL PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    pdf_id TEXT NOT NULL,
    chunk_id INTEGER NOT NULL,
    chunk_text TEXT NOT NULL,
    
    -- Structural information
    section_title TEXT, -- "Introduction", "Methodology", etc.
    section_level INTEGER DEFAULT 0, -- 1=h1, 2=h2, etc.
    page_start INTEGER NOT NULL,
    page_end INTEGER NOT NULL,
    
    -- References to figures/tables in this chunk
    figure_references TEXT[], -- ["Figure 1", "Figure 2"]
    table_references TEXT[], -- ["Table 1", "Table 2"]
    
    -- Metadata
    word_count INTEGER DEFAULT 0,
    start_index INTEGER DEFAULT 0,
    end_index INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    
    UNIQUE(user_id, pdf_id, chunk_id)
);
```

#### 3. PDF Figures Table
```sql
CREATE TABLE IF NOT EXISTS pdf_figures (
    id BIGSERIAL PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    pdf_id TEXT NOT NULL,
    figure_id TEXT NOT NULL, -- "Figure 1", "Fig. 2.1", etc.
    caption TEXT,
    page_number INTEGER NOT NULL,
    alt_text TEXT, -- For accessibility
    image_data TEXT, -- Base64 encoded thumbnail (optional)
    created_at TIMESTAMPTZ DEFAULT NOW(),
    
    UNIQUE(user_id, pdf_id, figure_id)
);
```

#### 4. PDF Tables Table
```sql
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
```

#### 5. PDF References Table
```sql
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
```

#### 6. PDF Table of Contents Table
```sql
CREATE TABLE IF NOT EXISTS pdf_toc (
    id BIGSERIAL PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    pdf_id TEXT NOT NULL,
    entry_title TEXT NOT NULL,
    entry_level INTEGER NOT NULL, -- 1, 2, 3 for nesting
    page_number INTEGER NOT NULL,
    entry_order INTEGER NOT NULL, -- Order in TOC
    parent_entry_id BIGINT, -- For nested entries
    created_at TIMESTAMPTZ DEFAULT NOW(),
    
    FOREIGN KEY (parent_entry_id) REFERENCES pdf_toc(id) ON DELETE CASCADE
);
```

### Indexes
```sql
-- Indexes for fast queries
CREATE INDEX IF NOT EXISTS idx_pdf_chunks_section ON pdf_chunks(user_id, pdf_id, section_title);
CREATE INDEX IF NOT EXISTS idx_pdf_chunks_page ON pdf_chunks(user_id, pdf_id, page_start, page_end);
CREATE INDEX IF NOT EXISTS idx_pdf_figures_pdf ON pdf_figures(user_id, pdf_id);
CREATE INDEX IF NOT EXISTS idx_pdf_tables_pdf ON pdf_tables(user_id, pdf_id);
CREATE INDEX IF NOT EXISTS idx_pdf_references_pdf ON pdf_references(user_id, pdf_id);
CREATE INDEX IF NOT EXISTS idx_pdf_toc_pdf ON pdf_toc(user_id, pdf_id);
```

---

## 📦 Step 2: Recommended Libraries

### Core Libraries (Already Using)
- ✅ `pdfjs-dist` - PDF parsing (currently used)
- ✅ `tesseract.js` - OCR (currently used)

### New Libraries Needed
```bash
npm install pdf-parse          # Better structured extraction
npm install mammoth            # For DOCX (optional)
npm install @xenova/transformers # Already have for embeddings
```

### Alternative: Use PDF.js with Enhanced Parsing
Keep using `pdfjs-dist` but enhance extraction logic (recommended approach).

---

## 🔧 Step 3: Structured PDF Extraction Service

### Implementation: `src/lib/structuredPDFExtractor.js`

Key features:
1. Extract title, authors, abstract from first pages
2. Parse table of contents
3. Extract headers/footers with page numbers
4. Identify figures/tables with captions
5. Extract references/bibliography
6. Track section titles throughout document
7. Maintain page numbers in all chunks

---

## 📝 Step 4: Smart Chunking Service

### Implementation: `src/lib/structuredChunking.js`

Key features:
1. Chunk by sections (respect document structure)
2. Keep page numbers with each chunk
3. Track section titles
4. Include figure/table references
5. Smart overlap at section boundaries

---

## 🔍 Step 5: Enhanced RAG Query Service

### Implementation: `src/lib/enhancedRAGService.js`

Key features:
1. Query with metadata context (title, authors, abstract)
2. Retrieve relevant chunks with section context
3. Include related figures/tables when mentioned
4. Add references when cited
5. Use TOC for document structure awareness

---

## 🚀 Implementation Steps

### Phase 1: Database Setup
1. Run SQL schema updates
2. Test table creation
3. Verify RLS policies

### Phase 2: Extraction Service
1. Build structured extractor
2. Test on sample PDFs
3. Handle edge cases

### Phase 3: Chunking Service
1. Implement smart chunking
2. Test section preservation
3. Verify page numbers

### Phase 4: Storage Service
1. Store metadata
2. Store structured chunks
3. Store figures/tables/references

### Phase 5: RAG Enhancement
1. Update query logic
2. Include metadata in prompts
3. Test accuracy

---

## 📊 Example: Query Flow

```
User: "What methods did the authors use?"

1. Extract metadata → Get title, authors, abstract
2. Retrieve relevant chunks → "Methodology" section chunks
3. Get related tables/figures → Tables/figures in methodology
4. Build prompt:
   - Title: "Machine Learning in Healthcare"
   - Authors: ["Smith, J.", "Doe, A."]
   - Abstract: "..."
   - Relevant sections: [Chunk 5: Methodology, Chunk 6: Methods...]
   - Related tables: [Table 1: Dataset Statistics]
5. Send to LLM
6. Return response
```

---

## ✅ Success Criteria

- ✅ All structural elements extracted
- ✅ Chunks preserve context (sections, pages)
- ✅ Figures/tables linked to chunks
- ✅ References extracted and searchable
- ✅ Queries use full document context
- ✅ Works for any user-uploaded PDF

---

## 📄 Next: Code Implementation

See companion files:
- `structured_pdf_extractor.js` - Extraction service
- `structured_chunking.js` - Smart chunking
- `enhanced_rag_service.js` - Enhanced RAG
- `enhanced_database_schema.sql` - Complete schema

