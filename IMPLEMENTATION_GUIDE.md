# Structured PDF Extraction - Implementation Guide

## Quick Start

### Step 1: Update Database Schema

1. Open Supabase SQL Editor
2. Run `enhanced_database_schema.sql`
3. Verify all tables are created

### Step 2: Install Dependencies (if needed)

```bash
# Already have pdfjs-dist and tesseract.js
# No additional packages needed for basic implementation
```

### Step 3: Integration Points

#### A. Update File Upload Handler (`src/App.jsx`)

Replace current PDF extraction with structured extraction:

```javascript
import { extractStructuredPDF } from './lib/structuredPDFExtractor';
import { createStructuredChunks } from './lib/structuredChunking';
import { storeStructuredPDFData } from './lib/structuredStorage';

// In uploadFile function:
const structuredData = await extractStructuredPDF(file);
const chunks = createStructuredChunks(structuredData);
await storeStructuredPDFData(userId, pdfId, structuredData, chunks);
```

#### B. Update Chat Handler

Use enhanced RAG service:

```javascript
import { getEnhancedContextForQuery, buildEnhancedPrompt } from './lib/enhancedRAGService';

// In handleSendMessage:
const context = await getEnhancedContextForQuery(userId, pdfId, query, 5);
const prompt = buildEnhancedPrompt(context, query);
// Send prompt to LLM
```

---

## Implementation Checklist

### Phase 1: Database & Storage ✅
- [x] Enhanced database schema created
- [ ] Run SQL schema in Supabase
- [ ] Test table creation
- [ ] Verify RLS policies

### Phase 2: Extraction Service
- [ ] Create `structuredPDFExtractor.js` ✅
- [ ] Test on sample academic PDF
- [ ] Test on sample book PDF
- [ ] Handle edge cases (no TOC, no figures, etc.)

### Phase 3: Chunking Service
- [ ] Create `structuredChunking.js` ✅
- [ ] Test section-based chunking
- [ ] Test page-based chunking (fallback)
- [ ] Verify page numbers preserved

### Phase 4: Storage Service
- [ ] Create `structuredStorage.js` (to be created)
- [ ] Store metadata
- [ ] Store chunks with structure
- [ ] Store figures/tables/references

### Phase 5: Enhanced RAG
- [ ] Create `enhancedRAGService.js` ✅
- [ ] Test metadata retrieval
- [ ] Test chunk retrieval with context
- [ ] Test figure/table inclusion

### Phase 6: Integration
- [ ] Update `App.jsx` upload handler
- [ ] Update `App.jsx` chat handler
- [ ] Test end-to-end flow
- [ ] Handle errors gracefully

---

## Testing Strategy

### Test Cases

1. **Academic Paper**
   - Has abstract, keywords, references
   - Multiple figures and tables
   - Clear sections

2. **Book Chapter**
   - Has TOC
   - Long sections
   - Few figures

3. **Simple Document**
   - No structure
   - Plain text
   - Should fallback gracefully

4. **Scanned PDF**
   - Image-based
   - Needs OCR
   - May miss structure

---

## Performance Considerations

1. **Large PDFs (100+ pages)**
   - Process in batches
   - Show progress indicator
   - Use background workers

2. **Storage Limits**
   - Compress image data
   - Limit stored figures (thumbnails only)
   - Clean up old data

3. **Query Speed**
   - Use indexes
   - Cache metadata
   - Limit chunk retrieval

---

## Next Steps

1. **Create Storage Service** (`structuredStorage.js`)
   - Functions to store all structured data
   - Batch inserts for performance
   - Error handling

2. **Update App.jsx**
   - Integrate structured extraction
   - Use enhanced RAG
   - Update UI to show structure

3. **Add UI Elements**
   - Show document structure
   - Display figures/tables
   - TOC navigation

4. **Advanced Features**
   - Citation linking
   - Cross-references
   - Multi-PDF search

---

## Troubleshooting

### Issue: Extracted structure is inaccurate
- **Solution**: Adjust regex patterns
- **Solution**: Add manual review step
- **Solution**: Use ML-based extraction (future)

### Issue: Chunks are too long/short
- **Solution**: Adjust chunk size based on document type
- **Solution**: Dynamic chunking based on sections

### Issue: Storage fails
- **Solution**: Check Supabase limits
- **Solution**: Implement retry logic
- **Solution**: Fallback to IndexedDB

