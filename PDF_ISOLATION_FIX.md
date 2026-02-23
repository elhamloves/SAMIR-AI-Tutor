# PDF Isolation Fix - Preventing File Mixing

## Problem
Samir is mixing chunks from previously uploaded PDFs with the current uploaded PDF.

## Root Cause
1. **PDF ID includes Date.now()** - generates different ID each time
2. **Old chunks not cleared** - chunks from previous PDFs remain in memory
3. **No PDF ID stored** - PDF ID is regenerated each time, causing mismatches

## Solution

### 1. Store PDF ID with File Content
When a PDF is uploaded, generate and store the PDF ID with the file content.

### 2. Clear Old Chunks
Clear `pdfChunks` state when a new PDF is uploaded.

### 3. Use Stored PDF ID
Always use the stored PDF ID from `fileContent.pdfId`, don't regenerate.

### 4. Consistent PDF ID Generation
Remove `Date.now()` from PDF ID generation - use only filename + size.

## Implementation

### Step 1: Generate PDF ID on Upload
```javascript
const pdfId = await generatePDFId(file.name, file.size);
const newFileContent = {
    name: file.name,
    size: file.size,
    text: text,
    type: file.type,
    pdfId: pdfId  // Store PDF ID
};
```

### Step 2: Clear Old Chunks
```javascript
// Clear old chunks BEFORE setting new file
setPdfChunks([]);
setFileContent(newFileContent);
```

### Step 3: Always Use Stored PDF ID
```javascript
// Use stored PDF ID, don't regenerate
const pdfId = fileContent.pdfId || await generatePDFId(...);
```

### Step 4: Remove Date.now() from PDF ID
```javascript
// Before: fileName + size + Date.now() ❌
// After: fileName + size ✅
const data = encoder.encode(fileName + '-' + size);
```

