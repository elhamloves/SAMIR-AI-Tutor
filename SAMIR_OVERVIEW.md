# Samir - AI Tutor Overview

## 🎓 What is Samir?

**Samir** is an intelligent AI-powered tutoring application designed to help students learn effectively by interacting with their study materials. It's a comprehensive educational platform that combines document analysis, interactive learning, and progress tracking.

## 🌟 Key Features

### 1. **Multi-Mode Learning**
- **Tutor Mode (Default)**: Direct, factual explanations based on uploaded documents
  - Simple, student-friendly language
  - No page numbers or navigation guidance
  - Goal: "Student understands without opening the book"
- **Detective Mode**: Interactive "hunt" mode that teaches students how to navigate books
  - Uses metadata (Table of Contents, Index, page numbers, units, tables, etc.)
  - Teaches book literacy skills
  - Encourages student thinking
- **Assist/Expand Mode**: Deeper explanations with additional context
  - Can use general knowledge for context
  - Adds historical/educational background
  - Explains with examples and stories
  - Always relates back to the lesson
- **Quiz Mode**: Generate and take quizzes based on uploaded materials
- **Tracker Dashboard**: Analytics and progress tracking with color-coded performance levels

### 2. **Advanced Document Processing**
- **PDF Support**: Full PDF text extraction with automatic OCR for scanned documents
- **Multi-Language OCR**: Supports English and Arabic text recognition
- **Comprehensive Metadata Extraction**:
  - Title, Authors, Publisher, Publication Date
  - Table of Contents
  - Index
  - Units/Chapters with page numbers
  - Tables and structured data
  - References/Bibliography
  - Introduction sections
  - Notes, callouts, and sidebars

### 3. **Book Navigation Training**
- Teaches students how to use:
  - Table of Contents
  - Index
  - Page numbers
  - Unit/Chapter navigation
  - Tables for data lookup
  - References for further reading
- Critical for developing book literacy skills

### 4. **Progress Tracking**
- Study time tracking
- Quiz performance analytics
- Weakness/strength identification
- Color-coded performance levels:
  - **Weak**: Red (< 50%)
  - **Fair**: Yellow (50-74%)
  - **Good**: Green (75-89%)
  - **Excellent**: Blue (≥ 90%)

### 5. **Multi-Language Support**
- **English**: Full support with clear, simple language
- **Arabic (العربية)**: Full support with Modern Standard Arabic
- **Spanish (Español)**: UI translation support
- **Mixed Languages**: Allows mixed input (e.g., "explain الدرس الأول")
  - Automatically detects primary language
  - Responds in the same language as detected

### 6. **Additional Features**
- Schedule management
- Study groups
- Community features
- Chat history persistence
- Local-first architecture with Supabase backup

## 🏗️ Technical Architecture

### Frontend
- **Framework**: React 19
- **Styling**: Tailwind CSS
- **State Management**: React Hooks (useState, useEffect, useCallback)
- **Storage**: localStorage (primary) + Supabase (backup)

### AI Integration
- **Primary**: WebLLM (local AI, runs in browser)
- **Fallback**: Hugging Face API (Llama 3.1 / Jais models)
- **Embeddings**: Transformers.js for semantic search
- **RAG**: Retrieval-Augmented Generation for document-based responses

### PDF Processing
- **Client-Side**: pdfjs-dist + Tesseract.js (OCR)
- **Backend Option**: Python backend with PyMuPDF + pytesseract
- **OCR Languages**: English + Arabic (eng+ara)
- **Automatic Detection**: Scans for weak text extraction and runs OCR automatically

### Data Flow
```
PDF Upload → Text Extraction → OCR (if needed) → Chunking → Storage
                                                              ↓
User Question → RAG Search → Relevant Chunks → AI Model → Response
```

## 📊 Current Capabilities

### Document Processing
- ✅ PDF text extraction (native + OCR)
- ✅ Image OCR (Tesseract.js)
- ✅ Text files (TXT, MD, CSV, Markdown)
- ✅ Comprehensive metadata extraction
- ✅ Book structure analysis
- ✅ Multi-language support (English, Arabic)

### AI Features
- ✅ Document-based Q&A
- ✅ Three intelligent modes (Tutor, Detective, Assist/Expand)
- ✅ Automatic mode detection from user queries
- ✅ Quiz generation
- ✅ Progress tracking
- ✅ Multi-language responses (English, Arabic, Spanish)
- ✅ Mixed-language input support
- ✅ Context-aware tutoring
- ✅ Book navigation guidance
- ✅ Unicode-safe query caching (supports Arabic)

### User Experience
- ✅ Dark mode theme (deep navy #0B1521 with teal accents)
- ✅ Modern analytics dashboard
- ✅ Responsive design
- ✅ Offline-first architecture
- ✅ Guest mode support

## 🎯 Target Audience

- **Students**: Primary users learning from textbooks and study materials
- **Teachers**: Can use tracker dashboard to monitor student progress
- **Parents**: Can track their children's learning progress
- **Self-learners**: Anyone studying from PDFs or documents

## 💡 Unique Value Proposition

1. **Three Intelligent Modes**: Automatically adapts teaching style based on student needs
   - Tutor Mode for direct learning
   - Detective Mode for book literacy training
   - Assist/Expand Mode for deeper understanding
2. **Book Literacy Training**: Unlike other AI tutors, Samir specifically teaches students HOW to use books (TOC, Index, navigation)
3. **Comprehensive Analytics**: Visual progress tracking with color-coded performance
4. **Offline Capable**: Works without internet using WebLLM
5. **Multi-Language**: Full support for Arabic, English, and Spanish with mixed-language input
6. **Advanced PDF Processing**: Handles image-only PDFs, scanned documents, and Arabic text with automatic OCR

## 🔧 Technology Stack

- **Frontend**: React, Tailwind CSS, Vite
- **AI**: WebLLM, Hugging Face API, Transformers.js
- **PDF**: pdfjs-dist, Tesseract.js, pdf-lib
- **Storage**: localStorage, Supabase
- **Deployment Ready**: Can be deployed to Vercel, Netlify, or any static host

## 📈 Future Potential

- Mobile app version
- Collaborative study groups
- Advanced analytics
- Integration with learning management systems
- Voice interaction
- Video content analysis

