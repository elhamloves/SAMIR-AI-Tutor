# PDF Processor Backend

Python backend service for PDF preprocessing using PyMuPDF and pytesseract, similar to PageLM's approach.

## Features

- ✅ **Text Extraction**: Extract text from PDFs using PyMuPDF
- ✅ **OCR Support**: Automatic OCR for scanned PDFs using pytesseract
- ✅ **Image Extraction**: Extract images and perform OCR on them
- ✅ **Metadata Extraction**: Extract PDF metadata (title, author, etc.)
- ✅ **Heuristics**: Detect title, author, and logo using heuristics
- ✅ **Structure Extraction**: Identify sections, headings, paragraphs, tables, figures
- ✅ **Smart Chunking**: PageLM-style text chunking for RAG

## Installation

### Prerequisites

1. **Python 3.8+**
2. **Tesseract OCR**
   - Windows: Download from [GitHub](https://github.com/UB-Mannheim/tesseract/wiki)
   - Linux: `sudo apt-get install tesseract-ocr`
   - Mac: `brew install tesseract`

### Setup

```bash
cd backend
pip install -r requirements.txt
```

### Configuration

Copy `.env.example` to `.env` and configure:

```bash
cp .env.example .env
```

Edit `.env`:
- Set `TESSERACT_CMD` if tesseract is not in your PATH
- Configure `PORT` (default: 5001)
- Set `DEBUG=True` for development

## Usage

### Start Server

```bash
python app.py
```

Server will start on `http://localhost:5001`

### API Endpoints

#### 1. Health Check
```
GET /health
```

#### 2. Process PDF (Multipart Form)
```
POST /process-pdf
Content-Type: multipart/form-data

Form fields:
- file: PDF file
- filename: (optional) filename
```

#### 3. Process PDF (JSON with Base64)
```
POST /process-pdf-bytes
Content-Type: application/json

{
  "pdf_bytes": "base64_encoded_pdf",
  "filename": "document.pdf"
}
```

### Example Request (JavaScript)

```javascript
const formData = new FormData();
formData.append('file', pdfFile);
formData.append('filename', pdfFile.name);

const response = await fetch('http://localhost:5001/process-pdf', {
    method: 'POST',
    body: formData
});

const result = await response.json();
console.log(result.data);
```

### Response Format

```json
{
  "success": true,
  "data": {
    "pdf_id": "abc123...",
    "filename": "document.pdf",
    "file_size": 123456,
    "total_pages": 10,
    "metadata": {
      "title": "Document Title",
      "author": "Author Name",
      "detected_title": "Detected Title",
      "detected_authors": ["Author 1", "Author 2"],
      "detected_logo": true
    },
    "full_text": "Complete extracted text...",
    "chunks": [
      {
        "text": "Chunk text...",
        "index": 0,
        "start": 0,
        "end": 512,
        "length": 512
      }
    ],
    "sections": [...],
    "headings": [...],
    "paragraphs": [...],
    "tables": [...],
    "figures": [...],
    "images": [...]
  }
}
```

## Integration with Frontend

The frontend should:
1. Upload PDF to this backend
2. Receive processed data
3. Store metadata in Supabase
4. Use chunks for RAG
5. Ensure Samir always uses parsed data

## Troubleshooting

### Tesseract not found
- Install Tesseract OCR
- Set `TESSERACT_CMD` in `.env` to full path

### OCR not working
- Check Tesseract installation: `tesseract --version`
- Verify language data is installed: `tesseract --list-langs`
- For Arabic support: Install Arabic language pack

### Memory issues with large PDFs
- Process PDFs in batches
- Increase server memory
- Consider streaming for very large files

