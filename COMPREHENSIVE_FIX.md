# Comprehensive Fix Plan for All Issues

## Critical Bugs Identified

1. ❌ `ReferenceError: modelType is not defined` - Missing parameter
2. ❌ PDF ID not stored with fileContent - causing regeneration
3. ❌ Guest user UUID errors - Supabase rejects non-UUID format
4. ❌ Context window exceeded - WebLLM can't handle long message history
5. ❌ Hallucination - AI making up author names not in PDF
6. ❌ No Arabic/English language detection
7. ❌ Missing strict anti-hallucination prompts per mega-prompt

## Fixes Required

### 1. Fix modelType Bug ✅
- Add `modelType` parameter to `getStrictPDFPrompt` function
- Default to 'webllm' if not provided

### 2. Store PDF ID with fileContent ✅
- Generate PDF ID before creating newFileContent
- Store pdfId in fileContent object
- Pass pdfId to processPDFForRAG

### 3. Fix Guest User UUID Issues ✅
- Skip Supabase queries for guest users (userId.startsWith('guest-'))
- Return empty arrays instead of querying
- Only use IndexedDB/localStorage for guests

### 4. Fix Context Window Exceeded ✅
- Limit message history for WebLLM (last 3-5 messages max)
- Don't send full chat history to WebLLM
- Only send current query + retrieved chunks

### 5. Add Arabic/English Detection ✅
- Create languageDetector.js
- Detect language from user query
- Build prompts in detected language

### 6. Implement Strict Anti-Hallucination ✅
- Use mega-prompt rules exactly
- Arabic: "غير موجود داخل ملف الـPDF"
- English: "I cannot find this information in the uploaded document"
- NO guessing, NO inferring, NO fabricating

### 7. Improve Prompt Structure ✅
- Very explicit instructions
- Clear chunk boundaries
- Page number references
- Section titles when available

