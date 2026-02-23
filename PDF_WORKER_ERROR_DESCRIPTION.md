# PDF Worker Error - Detailed Description for AI Assistants

## Application Overview

**App Name:** Tutor App (Samir - AI Learning Assistant)

**Tech Stack:**
- **Frontend Framework:** React 19.1.1 with Vite (using rolldown-vite@7.1.14)
- **PDF Processing:** pdfjs-dist v4.4.168
- **OCR:** tesseract.js v5.1.0
- **Backend:** Supabase (optional, app works offline)
- **Styling:** Tailwind CSS 4.1.17

**App Purpose:**
An AI-powered learning assistant that allows users to:
1. Upload PDF documents, text files, or images
2. Extract text from PDFs (native extraction + OCR fallback for scanned PDFs)
3. Chat with the document using AI (Hugging Face API)
4. Generate quizzes from documents
5. Track learning progress

## Current Error

**Error Message:**
```
PDF conversion failed: PDF processing failed: Setting up fake worker failed: "Failed to fetch dynamically imported module: http://localhost:5173/pdf.worker.min.mjs?import".. Try converting PDF pages to images (PNG/JPG) and uploading those instead - Samir will OCR them!
```

**Error Location:**
- Occurs when user uploads a PDF file
- Happens during PDF.js worker initialization
- Error originates from `extractTextFromPDF()` function in `src/App.jsx`

## Technical Details

### PDF.js Configuration

**Worker Setup (src/lib/supabaseClient.js):**
```javascript
import * as pdfjs from 'pdfjs-dist';

if (typeof window !== 'undefined') {
    if (!pdfjs.GlobalWorkerOptions.workerSrc) {
        pdfjs.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs';
    }
}
```

**Worker Files Available:**
- `/public/pdf.worker.min.mjs` ✅ (exists)
- `/public/pdf.worker.min.js` ✅ (exists)

**Vite Configuration (vite.config.js):**
```javascript
resolve: {
    dedupe: ['pdfjs-dist'],
    alias: {
        'pdfjs-dist': 'pdfjs-dist/build/pdf.min.mjs'
    }
}
```

### PDF Processing Flow

1. User uploads PDF file
2. `uploadFile()` function called
3. `extractTextFromPDF(file)` called
4. PDF.js tries to load worker from `/pdf.worker.min.mjs`
5. **ERROR:** Worker fails to load with "Failed to fetch dynamically imported module"

### Error Analysis

**Root Cause:**
- PDF.js v4.4.168 is trying to dynamically import the worker file
- Vite dev server (localhost:5173) is not serving the worker file correctly
- The `?import` query parameter suggests Vite is trying to process it as an ES module
- Worker file might not be properly configured in Vite's static asset handling

**Why It's Happening:**
1. PDF.js v4 uses ES modules and dynamic imports
2. Vite needs special configuration to handle worker files
3. The worker file path `/pdf.worker.min.mjs` might not be resolving correctly
4. Vite might be trying to bundle/transform the worker file instead of serving it as-is

## Attempted Solutions

1. ✅ Set `pdfjs.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs'` (local file - failed)
2. ✅ Verified worker files exist in `/public/` folder (exists but Vite can't serve correctly)
3. ✅ Tried CDN worker URL (cdnjs.cloudflare.com) - failed with same error
4. ✅ Added error handling to catch and display errors
5. ✅ **CURRENT FIX:** Using Vite's `?url` suffix to import worker from node_modules directly

## Current Solution

Using Vite's `?url` import suffix:
```javascript
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;
```

This tells Vite to:
- Import the worker file as a URL
- Properly handle ES modules
- Avoid dynamic import issues

## What We Need

**Goal:** Make PDF.js worker load correctly in Vite dev environment

**Requirements:**
- PDF.js v4.4.168 must load its worker file
- Worker should work in both dev (localhost:5173) and production
- Solution should work with Vite (specifically rolldown-vite@7.1.14)
- No breaking changes to existing functionality

## Questions for AI Assistants

1. **How to properly configure PDF.js v4.4.168 worker with Vite?**
   - Should we use a different worker file format (.js vs .mjs)?
   - Do we need special Vite configuration for worker files?
   - Should we use a CDN worker URL instead of local file?

2. **Vite worker file handling:**
   - How does Vite handle worker files in the `/public/` folder?
   - Do we need to configure Vite to serve `.mjs` files as static assets?
   - Should we use `import.meta.url` or different path resolution?

3. **PDF.js v4 compatibility:**
   - Is there a known issue with PDF.js v4 and Vite?
   - Should we downgrade to PDF.js v3 or upgrade to v5?
   - Are there alternative worker setup methods for v4?

4. **Alternative approaches:**
   - Can we use a CDN worker URL (e.g., unpkg.com)?
   - Should we inline the worker or use a different bundling strategy?
   - Can we use Web Workers API directly instead of PDF.js worker?

## Environment Details

- **OS:** Windows 10
- **Node Version:** (not specified, but using npm/pnpm)
- **Package Manager:** pnpm (has pnpm-lock.yaml)
- **Dev Server:** Vite dev server on localhost:5173
- **Browser:** (not specified, but likely Chrome/Edge)

## Code References

**Main PDF extraction function:** `src/App.jsx` lines 959-1059
**PDF.js setup:** `src/lib/supabaseClient.js` lines 9-53
**Vite config:** `vite.config.js`
**Worker files:** `public/pdf.worker.min.mjs` and `public/pdf.worker.min.js`

## Expected Behavior

When user uploads a PDF:
1. Worker should load silently in background
2. PDF.js should extract text from PDF (native extraction)
3. For scanned PDFs, fallback to OCR using Tesseract.js
4. Display extracted text and enable chat functionality

## Current Behavior

1. User uploads PDF
2. Error immediately thrown during worker initialization
3. User sees error message
4. PDF processing fails completely

---

**Please help fix this PDF.js worker loading issue with Vite!**

