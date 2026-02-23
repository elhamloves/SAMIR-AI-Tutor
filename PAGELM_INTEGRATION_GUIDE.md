# PageLM Integration Guide for Samir

## ✅ What's Been Integrated

I've created an **Enhanced PDF Processor** that integrates PageLM-style features into Samir:

### 1. ✅ PDF Parsing
- **Title Extraction**: Automatically extracts document title from first page
- **Author Extraction**: Detects author names using pattern matching
- **Metadata Extraction**: Extracts abstract, keywords, DOI, publication date
- **Sections/Paragraphs/Headings**: Identifies document structure with heading levels
- **Tables Detection**: Finds and extracts table captions and data
- **Lists Detection**: Identifies bullet points and numbered lists
- **Footnotes Extraction**: Extracts footnote references and text

### 2. ✅ OCR for Images
- **Automatic Detection**: Detects scanned/image-based PDFs (pages with few text items)
- **Tesseract.js Integration**: Uses existing Tesseract.js for OCR
- **Multi-language Support**: Supports English + Arabic (configurable)
- **Smart Processing**: Only processes pages that need OCR

### 3. ✅ Layout Understanding
- **Title Recognition**: Identifies main titles vs subtitles based on font size
- **Section Hierarchy**: Detects heading levels (H1, H2, H3) from font size and position
- **Page Structure**: Separates headers, footers, and body content
- **Text Positioning**: Uses Y-position to identify document structure

### 4. ✅ Smart Chunking (PageLM-style)
- **RecursiveCharacterTextSplitter**: Similar to PageLM's chunking approach
- **Configurable**: Chunk size (default 512) and overlap (default 30)
- **Natural Boundaries**: Breaks at paragraph, sentence, or word boundaries
- **RAG-Ready**: Chunks include metadata for RAG processing

## 📁 New Files Created

1. **`src/lib/enhancedPDFProcessor.js`** - Main PDF processor with all features
2. **`src/lib/pdfOCRHelper.js`** - OCR helper functions

## 🚀 How to Use

### Basic Usage

```javascript
import { extractEnhancedPDF, getPDFSummary } from './lib/enhancedPDFProcessor.js';

// Process PDF file
const file = // ... your PDF file
const result = await extractEnhancedPDF(file, {
    enableOCR: true,        // Enable OCR for scanned PDFs
    ocrLanguages: 'eng+ara', // OCR languages
    maxPages: 100,          // Maximum pages to process
    chunkSize: 512,         // Chunk size for RAG
    chunkOverlap: 30        // Overlap between chunks
});

// Get summary
const summary = getPDFSummary(result);
console.log('PDF Summary:', summary);

// Access extracted data
console.log('Title:', result.metadata.title);
console.log('Authors:', result.metadata.authors);
console.log('Sections:', result.sections);
console.log('Chunks:', result.chunks);
```

### Integration with Your App

Update your `app.jsx` to use the new processor:

```javascript
import { extractEnhancedPDF, getPDFSummary } from './lib/enhancedPDFProcessor.js';

// In your PDF upload handler
const handlePDFUpload = async (file) => {
    try {
        // Use enhanced processor
        const structuredData = await extractEnhancedPDF(file, {
            enableOCR: true,
            ocrLanguages: 'eng+ara',
            chunkSize: 512,
            chunkOverlap: 30
        });
        
        // Get summary for display
        const summary = getPDFSummary(structuredData);
        
        // Store structured data
        setFileContent({
            name: file.name,
            text: structuredData.fullText,
            metadata: structuredData.metadata,
            sections: structuredData.sections,
            chunks: structuredData.chunks,
            // ... other data
        });
        
        // Process for RAG using chunks
        await processPDFForRAG(structuredData.chunks, file.name);
        
    } catch (error) {
        console.error('PDF processing error:', error);
    }
};
```

## 📊 Extracted Data Structure

The processor returns a comprehensive structure:

```javascript
{
    metadata: {
        title: "Document Title",
        authors: ["Author 1", "Author 2"],
        abstract: "...",
        keywords: ["keyword1", "keyword2"],
        doi: "10.1234/example",
        totalPages: 50
    },
    sections: [
        {
            title: "Introduction",
            level: 1,
            pageStart: 1,
            pageEnd: 3,
            content: "..."
        }
    ],
    headings: [
        { text: "Main Title", level: 1, pageNumber: 1 },
        { text: "Subtitle", level: 2, pageNumber: 2 }
    ],
    paragraphs: [
        { text: "...", pageNumber: 1, length: 200 }
    ],
    tables: [
        { tableId: "Table 1", caption: "...", pageNumber: 5, data: "..." }
    ],
    lists: [
        { type: "bullet", items: ["item1", "item2"], pageNumber: 3 }
    ],
    footnotes: [
        { id: "1", text: "...", pageNumber: 2 }
    ],
    figures: [
        { figureId: "Figure 1", caption: "...", pageNumber: 4 }
    ],
    references: [
        { referenceId: 1, citationText: "...", authors: [...], year: 2023 }
    ],
    images: [
        { pageNumber: 10, ocrText: "...", hasText: true }
    ],
    fullText: "Complete extracted text...",
    chunks: [
        { text: "...", index: 0, start: 0, end: 512, length: 512 }
    ]
}
```

## 🔧 Configuration Options

### OCR Settings
- `enableOCR`: Enable/disable OCR (default: `true`)
- `ocrLanguages`: Language codes for OCR (default: `'eng+ara'`)
  - Options: `'eng'`, `'ara'`, `'eng+ara'`, etc.

### Processing Limits
- `maxPages`: Maximum pages to process (default: `100`)
- Set to `null` to process all pages

### Chunking Settings
- `chunkSize`: Size of each chunk in characters (default: `512`)
- `chunkOverlap`: Overlap between chunks (default: `30`)
- PageLM uses: `chunkSize: 512, chunkOverlap: 30`

## 🎯 Key Features

### 1. Smart Title Detection
- Checks first page headers
- Looks for large font sizes
- Validates title length and format

### 2. Author Extraction
- Pattern matching for author names
- Handles multiple formats (comma-separated, "and" separated)
- Extracts affiliations

### 3. Section Identification
- Uses font size to determine heading levels
- Tracks section boundaries across pages
- Maintains document hierarchy

### 4. OCR Integration
- Automatically detects scanned PDFs
- Only processes pages that need OCR
- Integrates OCR text into document structure

### 5. RAG-Ready Chunking
- PageLM-style recursive character splitting
- Maintains context with overlap
- Preserves document structure in chunks

## 🔄 Migration Steps

1. **Test the new processor** with a sample PDF
2. **Compare results** with your current implementation
3. **Update your PDF upload handler** to use `extractEnhancedPDF`
4. **Update RAG processing** to use the new chunks
5. **Remove old PDF processing code** once verified

## 📝 Example Integration

Here's a complete example of integrating into your existing code:

```javascript
// In app.jsx
import { extractEnhancedPDF, getPDFSummary } from './lib/enhancedPDFProcessor.js';

const extractTextFromPDF = async (file) => {
    try {
        // Use enhanced processor
        const structuredData = await extractEnhancedPDF(file, {
            enableOCR: true,
            ocrLanguages: 'eng+ara',
            maxPages: 50, // Limit for testing
            chunkSize: 512,
            chunkOverlap: 30
        });
        
        // Get summary
        const summary = getPDFSummary(structuredData);
        console.log('PDF processed:', summary);
        
        // Return in format your app expects
        return {
            text: structuredData.fullText,
            metadata: structuredData.metadata,
            title: structuredData.metadata.title || file.name,
            authors: structuredData.metadata.authors.join(', ') || '',
            chunks: structuredData.chunks.map(c => c.text),
            sections: structuredData.sections,
            // ... other fields
        };
    } catch (error) {
        console.error('Enhanced PDF processing failed:', error);
        // Fallback to old method if needed
        throw error;
    }
};
```

## ⚠️ Notes

1. **OCR Performance**: OCR can be slow for large PDFs. Consider processing in background or showing progress.

2. **Memory Usage**: Large PDFs may use significant memory. Consider processing in batches.

3. **Browser Compatibility**: Uses modern browser APIs. Test in target browsers.

4. **Error Handling**: The processor includes error handling, but you should wrap calls in try-catch.

## 🎉 Benefits

✅ **Better Structure Extraction**: More accurate title, author, and metadata detection  
✅ **OCR Support**: Handles scanned PDFs automatically  
✅ **Layout Understanding**: Better document structure recognition  
✅ **RAG-Ready**: Pre-chunked text optimized for retrieval  
✅ **No Paid APIs**: All processing is client-side  
✅ **PageLM-Style**: Uses proven chunking strategies from PageLM  

## 🚀 Next Steps

1. Test with your PDFs
2. Integrate into your upload flow
3. Update RAG to use new chunks
4. Add progress indicators for OCR
5. Optimize for your use case

The enhanced processor is ready to use! Let me know if you need any adjustments or have questions.

