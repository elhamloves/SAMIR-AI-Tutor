# PDF Pre-processing Integration Guide

## Overview

This integration adds Python backend PDF processing using PyMuPDF and pytesseract, similar to PageLM's approach. The backend extracts text, metadata, performs OCR, and stores everything in Supabase **before** Samir replies, ensuring Samir always uses the parsed data.

## Architecture

```
Frontend (React) → Python Backend (Flask) → Supabase
     ↓                    ↓                      ↓
  PDF Upload      PyMuPDF + pytesseract    Store Metadata
     ↓                    ↓                      ↓
  Display         Extract & OCR            Chunks + Metadata
     ↓                    ↓                      ↓
  Samir Chat      Return Processed Data    Always Use Parsed Data
```

## Setup

### 1. Install Python Backend

```bash
cd backend
pip install -r requirements.txt
```

### 2. Install Tesseract OCR

**Windows:**
- Download from [GitHub](https://github.com/UB-Mannheim/tesseract/wiki)
- Add to PATH or set `TESSERACT_CMD` in `.env`

**Linux:**
```bash
sudo apt-get install tesseract-ocr
sudo apt-get install tesseract-ocr-ara  # For Arabic support
```

**Mac:**
```bash
brew install tesseract
brew install tesseract-lang  # For language packs
```

### 3. Configure Backend

Create `backend/.env`:
```env
TESSERACT_CMD=  # Leave empty if in PATH, or set full path
PORT=5001
DEBUG=False
```

### 4. Update Supabase Schema

Run `database_schema_pdf_metadata.sql` in Supabase SQL editor to add metadata columns.

### 5. Configure Frontend

Add to `.env`:
```env
VITE_PDF_BACKEND_URL=http://localhost:5001
```

## Usage

### Start Backend

```bash
cd backend
python app.py
```

Backend runs on `http://localhost:5001`

### Frontend Integration

The frontend automatically:
1. Checks if backend is available
2. Sends PDF to backend for processing
3. Receives processed data (text, metadata, chunks)
4. Stores metadata in Supabase
5. Uses processed data for Samir

### Fallback

If backend is unavailable, frontend falls back to client-side processing.

## Features

### ✅ PDF Parsing
- Text extraction using PyMuPDF
- Metadata extraction (title, author, etc.)
- Structure detection (sections, headings, paragraphs)

### ✅ OCR Support
- Automatic detection of scanned PDFs
- OCR using pytesseract
- Multi-language support (English + Arabic)

### ✅ Heuristics
- **Title Detection**: First substantial line, not common headers
- **Author Detection**: Pattern matching for author names
- **Logo Detection**: Checks for images on first page

### ✅ Smart Chunking
- PageLM-style RecursiveCharacterTextSplitter
- 512 char chunks with 30 char overlap
- RAG-ready format

### ✅ Metadata Storage
- Stored in Supabase before Samir replies
- Includes detected title, authors, logo status
- Processing status tracking

## Data Flow

1. **User uploads PDF** → Frontend
2. **Frontend sends to backend** → Python service
3. **Backend processes PDF**:
   - Extract text with PyMuPDF
   - Perform OCR if needed
   - Detect title/author/logo
   - Chunk text for RAG
4. **Backend returns data** → Frontend
5. **Frontend stores metadata** → Supabase
6. **Frontend stores chunks** → Supabase
7. **Samir uses parsed data** → Always from stored metadata

## Ensuring Samir Uses Parsed Data

The system ensures Samir always uses parsed data by:

1. **Metadata stored first**: Metadata is stored in Supabase before any chat
2. **Chunks stored**: All chunks are stored with PDF ID
3. **Strict PDF mode**: `getStrictPDFPrompt` always uses stored chunks
4. **Validation**: `validatePDFChunksExist` checks data exists before chat
5. **No fallback to generic**: If PDF data missing, error instead of hallucination

## API Endpoints

### POST /process-pdf
Process PDF file (multipart/form-data)

**Request:**
```
Content-Type: multipart/form-data
- file: PDF file
- filename: (optional) filename
```

**Response:**
```json
{
  "success": true,
  "data": {
    "pdf_id": "abc123...",
    "filename": "document.pdf",
    "metadata": {...},
    "full_text": "...",
    "chunks": [...],
    "sections": [...],
    ...
  }
}
```

### GET /health
Health check endpoint

## Troubleshooting

### Backend not starting
- Check Python version (3.8+)
- Install dependencies: `pip install -r requirements.txt`
- Check port 5001 is available

### OCR not working
- Verify Tesseract installation: `tesseract --version`
- Check language packs installed
- Set `TESSERACT_CMD` in `.env` if not in PATH

### Metadata not storing
- Check Supabase connection
- Verify schema updated
- Check RLS policies allow user access

### Samir not using parsed data
- Verify chunks stored in Supabase
- Check `pdfId` matches between upload and chat
- Ensure `validatePDFChunksExist` passes

## Testing

1. Start backend: `python backend/app.py`
2. Upload PDF in frontend
3. Check console for processing logs
4. Verify metadata in Supabase `pdf_metadata` table
5. Verify chunks in Supabase `pdf_chunks` table
6. Ask Samir a question - should use parsed data

## Next Steps

- [ ] Add progress indicators for OCR
- [ ] Support more file formats
- [ ] Add batch processing
- [ ] Improve title/author detection heuristics
- [ ] Add table extraction
- [ ] Add figure extraction

