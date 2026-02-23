# Bug Fix: newFileContent Undefined Variable

## Issue
The variable `newFileContent` was defined inside conditional blocks but used outside their scope, causing a runtime error: "newFileContent is not defined".

## Root Cause
1. `newFileContent` was defined inside the PDF backend processing block (line 1894)
2. `newFileContent` was also defined inside the non-PDF file processing block (line 1985)
3. But it was used outside both blocks (line 2005), causing a scope error

## Fix Applied

### Frontend (`src/app.jsx`)
1. **Replaced `newFileContent` with `fileContentToUse`** - A variable defined in accessible scope
2. **Added proper scope management** - Variable is now defined before conditional blocks
3. **Added validation** - Checks if fileContent was already set by backend processing
4. **Added guard** - Only processes RAG if not already processed by backend

### Backend (`backend/app.py`)
1. **Added file validation** - Checks if file object exists
2. **Added filename validation** - Ensures filename is not empty
3. **Added PDF bytes validation** - Validates file content before processing
4. **Added result validation** - Checks if processing returned a result

### Backend (`backend/pdf_processor.py`)
1. **Added input validation** - Validates pdf_bytes is not None or empty
2. **Added type checking** - Ensures pdf_bytes is actually bytes
3. **Added error handling** - Better error messages for PDF opening failures

## Changes Made

### Frontend Changes
```javascript
// Before (BROKEN):
if (!fileContent || fileContent.name !== file.name) {
    const newFileContent = { ... };  // Defined in if block
    setFileContent(newFileContent);
}
// ... later ...
if (newFileContent.text) {  // ERROR: newFileContent not in scope
    processPDFForRAG(...);
}

// After (FIXED):
let fileContentToUse;  // Defined in accessible scope
if (fileContent && fileContent.name === file.name && fileContent.pdfId) {
    fileContentToUse = fileContent;  // Use existing
} else {
    fileContentToUse = { ... };  // Create new
    setFileContent(fileContentToUse);
}
// ... later ...
if (fileContentToUse && fileContentToUse.text && !fileContentToUse.processedData) {
    processPDFForRAG(...);  // Works correctly
}
```

### Backend Changes
```python
# Added validation guards:
if not file:
    return jsonify({"error": "File object is None"}), 400

if not pdf_bytes:
    return jsonify({"error": "Failed to read file content"}), 400

if not pdf_bytes or len(pdf_bytes) < 100:
    return jsonify({"error": "Invalid PDF file"}), 400

if not result:
    return jsonify({"error": "PDF processing returned no result"}), 500
```

## Testing
1. ✅ Upload PDF - Should work correctly
2. ✅ Upload non-PDF file - Should work correctly
3. ✅ Backend processing - Should validate inputs
4. ✅ Frontend fallback - Should work if backend unavailable
5. ✅ RAG processing - Should only run when needed

## Result
- ✅ No more "newFileContent is not defined" errors
- ✅ Proper variable scope management
- ✅ Better error handling and validation
- ✅ Samir maintains access to file on first upload

