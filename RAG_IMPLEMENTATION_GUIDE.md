# PDF RAG Implementation Guide

## Overview

This guide explains how the PDF RAG (Retrieval Augmented Generation) system works to ensure accurate, non-hallucinated answers from user-uploaded PDFs using WebLLM (TinyLlama).

## Architecture

### 1. PDF Upload & Processing Flow

```
User Uploads PDF
    ↓
Extract Text (PDF.js + OCR fallback)
    ↓
Split into Chunks (1500 chars, 150 overlap)
    ↓
Store in Database (Supabase/IndexedDB)
    ↓
Store in Memory (for immediate use)
    ↓
Ready for RAG queries
```

### 2. Query Flow (When User Asks Question)

```
User Question
    ↓
Generate PDF ID (hash of filename + size)
    ↓
Search Database for Relevant Chunks
    ├─→ Strategy 1: Keyword Search (Supabase)
    ├─→ Strategy 2: Embeddings Search (semantic)
    ├─→ Strategy 3: Keyword Fallback
    └─→ Strategy 4: First N chunks (last resort)
    ↓
Retrieve Top 5 Most Relevant Chunks
    ↓
Build Strict Prompt (prevents hallucinations)
    ↓
Send to WebLLM/API
    ↓
Return Answer (only from PDF content)
```

## Key Components

### 1. PDF Chunks Service (`src/lib/pdfChunksService.js`)

**Purpose**: Handles chunking and storage of PDF text.

**Functions**:
- `splitIntoChunks(text, chunkSize, overlap)` - Splits PDF into manageable chunks
- `storePDFChunks(userId, pdfId, chunks)` - Stores chunks in Supabase/IndexedDB
- `retrievePDFChunks(userId, pdfId, limit)` - Retrieves chunks from storage
- `searchPDFChunks(userId, pdfId, query, topK)` - Keyword-based chunk search

**Chunk Strategy**:
- Size: 1500 characters per chunk
- Overlap: 150 characters between chunks (for context continuity)
- Storage: Supabase for logged-in users, IndexedDB for guests

### 2. PDF RAG Service (`src/lib/pdfRAGService.js`)

**Purpose**: Retrieves relevant chunks and builds strict prompts.

**Functions**:
- `getRelevantChunksForQuery(userId, pdfId, query, topK)` - Multi-strategy chunk retrieval
- `buildPDFPrompt(chunks, userQuery, pdfFileName, mode)` - Builds strict prompt to prevent hallucinations
- `formatChunksForWebLLM(chunks, maxTokens)` - Formats chunks for WebLLM token limits
- `validateResponseUsesChunks(response, chunks)` - Validates answer is based on PDF

**Retrieval Strategies** (tried in order):
1. **Database Keyword Search**: Fast, works for logged-in users
2. **Embeddings Search**: Better semantic matching using `@xenova/transformers`
3. **Keyword Fallback**: Simple word matching
4. **First N Chunks**: Last resort if all else fails

### 3. Prompt Engineering

The prompt is designed to **strictly prevent hallucinations**:

```
CRITICAL RULES:
1. You MUST ONLY use information from the PDF sections provided below.
2. If the answer is not in the provided sections, say "I cannot find this information in the document..."
3. DO NOT make up information, dates, numbers, or facts not explicitly stated.
4. DO NOT use general knowledge unless directly related to clarifying PDF content.
5. If asked about something not in the PDF, clearly state that it's not in the provided sections.
```

## Multi-User Setup

### User Isolation

- **Database Level**: All queries filter by `user_id`
- **PDF ID**: Generated from filename + file size (consistent per file)
- **RLS Policies**: Supabase Row Level Security ensures users only see their data

### Storage Strategy

- **Logged-in Users**: Chunks stored in Supabase (`pdf_chunks` table)
- **Guest Users**: Chunks stored in IndexedDB (browser-local)
- **Both**: Chunks also cached in memory for fast access

## Code Example: Full Query Flow

```javascript
// 1. User uploads PDF
const pdfText = await extractTextFromPDF(file);
const pdfId = await generatePDFId(file.name);

// 2. Process and store chunks
const chunks = splitIntoChunks(pdfText, 1500, 150);
await storePDFChunks(userId, pdfId, chunks);

// 3. User asks question
const userQuestion = "What is the main topic of chapter 3?";

// 4. Retrieve relevant chunks
const relevantChunks = await getRelevantChunksForQuery(
    userId, 
    pdfId, 
    userQuestion, 
    5 // Top 5 chunks
);

// 5. Build strict prompt
const prompt = buildPDFPrompt(
    relevantChunks, 
    userQuestion, 
    file.name, 
    'tutor'
);

// 6. Send to WebLLM
const messages = [
    { role: 'system', content: prompt },
    { role: 'user', content: userQuestion }
];

const response = await webllmService.chat(messages);
```

## Handling Long PDFs

### Chunked Summarization

For very long PDFs (>100 pages), the system uses:

1. **Top-K Retrieval**: Only retrieves 5 most relevant chunks per query
2. **Token Limits**: Max ~3000 tokens (~12000 chars) per request
3. **Progressive Summarization**: For summary requests, can process in batches

### Example: Summary of Long PDF

```javascript
// Get all chunks
const allChunks = await retrievePDFChunks(userId, pdfId, 200);

// Split into batches for summarization
const batchSize = 10;
for (let i = 0; i < allChunks.length; i += batchSize) {
    const batch = allChunks.slice(i, i + batchSize);
    const summaryPrompt = `Summarize these sections: ${formatChunks(batch)}`;
    // Process batch...
}
```

## Database Schema

### PDF Chunks Table

```sql
CREATE TABLE pdf_chunks (
    id BIGSERIAL PRIMARY KEY,
    user_id UUID NOT NULL, -- Ensures multi-user isolation
    pdf_id TEXT NOT NULL,  -- PDF identifier (hash)
    chunk_id INTEGER NOT NULL,
    chunk_text TEXT NOT NULL,
    word_count INTEGER,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(user_id, pdf_id, chunk_id)
);

-- Index for fast retrieval
CREATE INDEX idx_pdf_chunks_user_pdf ON pdf_chunks(user_id, pdf_id);
```

## Error Handling

### Fallback Strategy

1. **No chunks found**: Tell user to rephrase or check document
2. **Database error**: Fallback to IndexedDB or memory chunks
3. **Embeddings fail**: Fallback to keyword matching
4. **All fail**: Use first N chunks from document

### Validation

The system validates responses to ensure they use PDF content:
- Checks for rejection phrases ("I cannot find...")
- Validates word overlap between response and chunks
- Warns if response seems to use general knowledge

## Performance Optimization

### Caching

- **Query Cache**: Caches Q&A pairs for 7 days (reduces API calls)
- **Chunk Cache**: Chunks cached in memory after first retrieval
- **Embeddings Cache**: Embeddings cached per chunk

### Indexes

- `(user_id, pdf_id)` - Fast chunk retrieval
- `pdf_id` - Fast PDF lookups
- `created_at DESC` - For recent chunks first

## Testing

### Test Scenarios

1. **Upload PDF**: Verify chunks are created and stored
2. **Ask Question**: Verify relevant chunks are retrieved
3. **Ask Irrelevant Question**: Verify system says "not found"
4. **Multi-User**: Verify users only see their PDFs
5. **Long PDF**: Verify only relevant chunks are sent

### Debug Logs

Enable console logging to see:
- `🔍 Retrieving relevant PDF chunks...`
- `✅ Retrieved N relevant chunks`
- `⚠️ No relevant chunks found`

## Troubleshooting

### Issue: AI still hallucinates

**Solution**: Check prompt is using `buildPDFPrompt()` with strict instructions.

### Issue: No chunks found

**Solution**: 
1. Verify PDF was processed (`processPDFForRAG` was called)
2. Check database has chunks for this user_id + pdf_id
3. Try simpler query (single keyword)

### Issue: Slow chunk retrieval

**Solution**:
1. Check database indexes exist
2. Reduce `topK` parameter
3. Use embeddings cache

## Next Steps (Optional Improvements)

1. **Better Embeddings**: Use larger embedding model for better semantic search
2. **Chunk Re-ranking**: Re-rank chunks using cross-encoder
3. **Hybrid Search**: Combine keyword + semantic search
4. **Chunk Metadata**: Store page numbers, sections for better context
5. **Multi-PDF Support**: Support querying across multiple PDFs

