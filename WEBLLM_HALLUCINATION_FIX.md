# WebLLM Hallucination Fix - Implementation Guide

## Problem Identified

WebLLM (TinyLlama 1.1B) is hallucinating because:
1. **Chunks too large** - 1500 chars is too big for 1.1B model
2. **No proper RAG** - Not retrieving relevant chunks before sending
3. **Limited context** - TinyLlama can't handle long PDFs
4. **No embeddings** - Model guesses instead of using actual content

## Solution Implemented

### 1. **Reduced Chunk Size** ✅
- Changed from 1500 → 800 characters (~200 tokens)
- Better fit for TinyLlama's limited context
- Updated in `src/lib/pdfChunksService.js`

### 2. **Created WebLLM-Specific RAG Service** ✅
- New file: `src/lib/webllmRAGService.js`
- Retrieves only top 3 most relevant chunks
- Uses embeddings for better retrieval
- Truncates chunks to 800 chars max

### 3. **Enhanced Logging** ✅
- Logs chunk retrieval process
- Shows how many chunks retrieved
- Logs token counts
- Helps debug RAG issues

## How It Works Now

### For WebLLM (TinyLlama):

1. **Query comes in** → "summarize this PDF"
2. **RAG Retrieval**:
   - Uses embeddings to find top 3 relevant chunks
   - Falls back to keyword search
   - Falls back to any chunks if needed
3. **Chunk Processing**:
   - Each chunk max 800 characters
   - Includes page numbers, section titles
   - Token count checked before sending
4. **Prompt Building**:
   - Very strict instructions
   - "ONLY use information from chunks below"
   - "DO NOT make up information"
5. **Sent to WebLLM**:
   - Only retrieved chunks (not whole PDF)
   - Fits within token limit
   - Model can actually read the content

### For API Models (HuggingFace):

- Uses larger chunks (1000 chars)
- Can handle more context
- Still uses RAG retrieval

## Files Changed

1. ✅ `src/lib/pdfChunksService.js` - Reduced chunk size to 800
2. ✅ `src/lib/webllmRAGService.js` - NEW: WebLLM-specific RAG
3. ✅ `src/lib/strictPDFChat.js` - Enhanced logging
4. ⚠️ `src/App.jsx` - Needs update to use webllmRAGService

## Next Step: Update App.jsx

You need to update `src/App.jsx` to use the new WebLLM RAG service:

```javascript
// Import the new service
import { getWebLLMPromptForQuery } from './lib/webllmRAGService';

// In handleSendMessage, when using WebLLM:
if (shouldUseWebLLM && fileContent && fileContent.pdfId) {
    const webllmPrompt = await getWebLLMPromptForQuery(
        userId,
        fileContent.pdfId,
        fileContent.name,
        currentInput,
        'webllm'
    );
    
    messages = formatForWebLLM(webllmPrompt);
    useStrictPDFMode = true;
}
```

## Testing

After updating:

1. **Upload a PDF** - Should chunk into 800-char pieces
2. **Ask a question** - Check console for:
   - "Retrieving chunks for WebLLM"
   - "Retrieved X chunks using embeddings"
   - "WebLLM prompt tokens: ..."
3. **Verify response** - Should use actual PDF content, not hallucinate

## Expected Behavior

### ✅ Good (After Fix):
```
User: "What methods did the authors use?"
→ Retrieves 3 relevant chunks from Methodology section
→ Shows: "Retrieved 3 chunks using embeddings"
→ WebLLM reads actual chunks
→ Response: "Based on the document, the authors used... [actual content]"
```

### ❌ Bad (Before Fix):
```
User: "What methods did the authors use?"
→ Sends whole PDF or random chunks
→ WebLLM can't read properly
→ Response: "The authors used machine learning..." [hallucinated]
```

## Additional Recommendations

1. **Consider Larger Model**: TinyLlama 1.1B is very limited
   - Try Llama 3.1 3B or 7B if possible
   - Much better at understanding context

2. **Test with Structured PDFs**:
   - Academic papers with clear sections
   - Books with TOC
   - Documents with headers/footers

3. **Monitor Token Usage**:
   - Check console logs for token counts
   - Ensure chunks fit within limits
   - Adjust chunk size if needed

---

**The fix is ready! Just update App.jsx to use the new webllmRAGService.** ✅

