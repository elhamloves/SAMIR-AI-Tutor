"""
PDF Processor using PyMuPDF and pytesseract
Extracts text, images, metadata, and performs OCR
Similar to PageLM's approach but with Python backend
"""

import fitz  # PyMuPDF
import pytesseract
from PIL import Image
import io
import re
import hashlib
from typing import Dict, List, Optional, Tuple
import logging

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


class PDFProcessor:
    """Process PDFs with PyMuPDF and OCR capabilities"""
    
    def __init__(self, tesseract_cmd: Optional[str] = None):
        """
        Initialize PDF processor
        
        Args:
            tesseract_cmd: Path to tesseract executable (if not in PATH)
        """
        if tesseract_cmd:
            pytesseract.pytesseract.tesseract_cmd = tesseract_cmd
    
    def process_pdf(self, pdf_bytes: bytes, filename: str = "document.pdf") -> Dict:
        """
        Process PDF and extract all information
        
        Args:
            pdf_bytes: PDF file as bytes
            filename: Original filename
            
        Returns:
            Dictionary with extracted data
        """
        # Validate input
        if not pdf_bytes:
            raise ValueError("PDF bytes cannot be None or empty")
        
        if not isinstance(pdf_bytes, bytes):
            raise TypeError(f"Expected bytes, got {type(pdf_bytes)}")
        
        if len(pdf_bytes) == 0:
            raise ValueError("PDF bytes cannot be empty")
        
        try:
            doc = fitz.open(stream=pdf_bytes, filetype="pdf")
        except Exception as e:
            raise ValueError(f"Failed to open PDF: {str(e)}")
        
        result = {
            "metadata": self._extract_metadata(doc, filename),
            "pages": [],
            "full_text": "",
            "sections": [],
            "headings": [],
            "paragraphs": [],
            "tables": [],
            "figures": [],
            "images": [],
            "chunks": [],
            "total_pages": len(doc)
        }
        
        # Process each page
        for page_num in range(len(doc)):
            logger.info(f"Processing page {page_num + 1}/{len(doc)}")
            page_data = self._process_page(doc[page_num], page_num + 1)
            result["pages"].append(page_data)
            result["full_text"] += page_data["text"] + "\n\n"
        
        # Post-process: extract structure
        result["sections"] = self._identify_sections(result["pages"])
        result["headings"] = self._extract_headings(result["pages"])
        result["paragraphs"] = self._extract_paragraphs(result["pages"])
        result["tables"] = self._extract_tables(result["pages"])
        result["figures"] = self._extract_figures(result["pages"])
        
        # Extract title and author using heuristics
        result["metadata"].update(self._detect_title_author(result))
        
        # Chunk text for RAG (PageLM-style)
        result["chunks"] = self._chunk_text(result["full_text"])
        
        doc.close()
        return result
    
    def _extract_metadata(self, doc: fitz.Document, filename: str) -> Dict:
        """Extract PDF metadata"""
        metadata = doc.metadata
        return {
            "title": metadata.get("title", "").strip() or None,
            "author": metadata.get("author", "").strip() or None,
            "subject": metadata.get("subject", "").strip() or None,
            "creator": metadata.get("creator", "").strip() or None,
            "producer": metadata.get("producer", "").strip() or None,
            "creation_date": metadata.get("creationDate", "").strip() or None,
            "modification_date": metadata.get("modDate", "").strip() or None,
            "filename": filename,
            "total_pages": len(doc)
        }
    
    def _process_page(self, page: fitz.Page, page_num: int) -> Dict:
        """Process a single page"""
        # Extract text
        text = page.get_text("text")
        
        # Extract text blocks with position info
        blocks = page.get_text("dict")
        
        # Extract images
        images = []
        image_list = page.get_images()
        
        for img_index, img in enumerate(image_list):
            try:
                xref = img[0]
                base_image = page.parent.extract_image(xref)
                image_bytes = base_image["image"]
                image_ext = base_image["ext"]
                
                # Convert to PIL Image for OCR
                pil_image = Image.open(io.BytesIO(image_bytes))
                
                # Perform OCR on image
                ocr_text = pytesseract.image_to_string(pil_image, lang='eng+ara')
                
                images.append({
                    "index": img_index,
                    "xref": xref,
                    "ext": image_ext,
                    "size": len(image_bytes),
                    "ocr_text": ocr_text.strip(),
                    "has_text": len(ocr_text.strip()) > 0
                })
            except Exception as e:
                logger.warning(f"Error processing image {img_index} on page {page_num}: {e}")
        
        # Check if page needs OCR (scanned PDF)
        needs_ocr = len(text.strip()) < 100
        
        ocr_text = ""
        if needs_ocr:
            try:
                # Render page as image and OCR
                pix = page.get_pixmap(matrix=fitz.Matrix(2, 2))  # 2x zoom for better OCR
                img_bytes = pix.tobytes("png")
                pil_image = Image.open(io.BytesIO(img_bytes))
                ocr_text = pytesseract.image_to_string(pil_image, lang='eng+ara')
                text = ocr_text  # Use OCR text if page is scanned
            except Exception as e:
                logger.warning(f"OCR failed for page {page_num}: {e}")
        
        return {
            "page_number": page_num,
            "text": text,
            "ocr_text": ocr_text,
            "needs_ocr": needs_ocr,
            "blocks": blocks,
            "images": images,
            "width": page.rect.width,
            "height": page.rect.height
        }
    
    def _detect_title_author(self, result: Dict) -> Dict:
        """Use heuristics to detect title and author"""
        detected = {
            "detected_title": None,
            "detected_authors": [],
            "detected_logo": False
        }
        
        if not result["pages"]:
            return detected
        
        first_page = result["pages"][0]
        first_page_text = first_page["text"]
        
        # Heuristic 1: Title detection
        # Title is usually:
        # - First substantial line (10-200 chars)
        # - Large font size (if available)
        # - Not common words like "Abstract", "Introduction"
        lines = [line.strip() for line in first_page_text.split('\n') if line.strip()]
        
        for line in lines[:15]:  # Check first 15 lines
            line_lower = line.lower()
            # Skip common headers
            if any(skip in line_lower for skip in ['abstract', 'keywords', 'introduction', 'doi:', 'received:', 'accepted:']):
                continue
            
            # Title candidates: 15-200 chars, not all caps (unless short), not just numbers
            if 15 <= len(line) <= 200 and not line.isdigit() and not (line.isupper() and len(line) > 50):
                detected["detected_title"] = line
                break
        
        # Heuristic 2: Author detection
        # Authors usually appear after title, before abstract
        # Patterns: "Author1, Author2", "Author1 and Author2", "Author1; Author2"
        author_patterns = [
            r'^([A-Z][a-z]+(?:\s+[A-Z]\.?)?(?:\s+[A-Z][a-z]+)*(?:,\s*[A-Z][a-z]+(?:\s+[A-Z]\.?)?(?:\s+[A-Z][a-z]+)*)*)',
            r'authors?[:\s]+([^.\n]+)',
            r'by\s+([^.\n]+)',
        ]
        
        for pattern in author_patterns:
            matches = re.finditer(pattern, first_page_text, re.IGNORECASE | re.MULTILINE)
            for match in matches:
                author_text = match.group(1) if match.lastindex else match.group(0)
                # Clean up author text
                authors = re.split(r'[,;]\s*|\s+and\s+', author_text)
                authors = [a.strip() for a in authors if a.strip() and len(a.strip()) < 100]
                
                if 1 <= len(authors) <= 20:  # Reasonable number of authors
                    detected["detected_authors"] = authors
                    break
            
            if detected["detected_authors"]:
                break
        
        # Heuristic 3: Logo detection
        # Check if first page has images (likely logo)
        if first_page.get("images"):
            # Check if images are in top portion of page (typical logo position)
            detected["detected_logo"] = True
        
        return detected
    
    def _identify_sections(self, pages: List[Dict]) -> List[Dict]:
        """Identify document sections"""
        sections = []
        current_section = None
        
        for page_data in pages:
            text = page_data["text"]
            # Look for section headers (numbered or unnumbered)
            section_pattern = r'^(\d+\.?\s+)?([A-Z][^\n]{5,100})$'
            
            for line in text.split('\n'):
                match = re.match(section_pattern, line.strip())
                if match:
                    if current_section:
                        sections.append(current_section)
                    
                    current_section = {
                        "title": match.group(2).strip(),
                        "level": len(match.group(1).split('.')) if match.group(1) else 1,
                        "page_start": page_data["page_number"],
                        "page_end": page_data["page_number"]
                    }
                elif current_section:
                    current_section["page_end"] = page_data["page_number"]
        
        if current_section:
            sections.append(current_section)
        
        return sections
    
    def _extract_headings(self, pages: List[Dict]) -> List[Dict]:
        """Extract headings from pages"""
        headings = []
        
        for page_data in pages:
            text = page_data["text"]
            # Look for headings (lines that are short, title case, or all caps)
            for line in text.split('\n'):
                line = line.strip()
                if 5 <= len(line) <= 100:
                    # Check if it looks like a heading
                    if line.isupper() or (line.istitle() and len(line.split()) <= 10):
                        headings.append({
                            "text": line,
                            "page_number": page_data["page_number"],
                            "level": 1 if line.isupper() else 2
                        })
        
        return headings
    
    def _extract_paragraphs(self, pages: List[Dict]) -> List[Dict]:
        """Extract paragraphs from pages"""
        paragraphs = []
        
        for page_data in pages:
            text = page_data["text"]
            # Split by double newlines (paragraph breaks)
            paras = [p.strip() for p in text.split('\n\n') if p.strip() and len(p.strip()) > 20]
            
            for para in paras:
                paragraphs.append({
                    "text": para,
                    "page_number": page_data["page_number"],
                    "length": len(para)
                })
        
        return paragraphs
    
    def _extract_tables(self, pages: List[Dict]) -> List[Dict]:
        """Extract tables (simplified - looks for table captions)"""
        tables = []
        
        for page_data in pages:
            text = page_data["text"]
            # Look for table captions
            table_pattern = r'(?:table|tab\.?)\s+(\d+)[:\s]+(.+?)(?:\n|$)'
            
            for match in re.finditer(table_pattern, text, re.IGNORECASE):
                tables.append({
                    "table_id": f"Table {match.group(1)}",
                    "caption": match.group(2).strip(),
                    "page_number": page_data["page_number"]
                })
        
        return tables
    
    def _extract_figures(self, pages: List[Dict]) -> List[Dict]:
        """Extract figures (simplified - looks for figure captions)"""
        figures = []
        
        for page_data in pages:
            text = page_data["text"]
            # Look for figure captions
            figure_pattern = r'(?:figure|fig\.?)\s+(\d+)[:\s]+(.+?)(?:\n|$)'
            
            for match in re.finditer(figure_pattern, text, re.IGNORECASE):
                figures.append({
                    "figure_id": f"Figure {match.group(1)}",
                    "caption": match.group(2).strip(),
                    "page_number": page_data["page_number"]
                })
        
        return figures
    
    def _chunk_text(self, text: str, chunk_size: int = 512, chunk_overlap: int = 30) -> List[Dict]:
        """
        Chunk text for RAG (PageLM-style RecursiveCharacterTextSplitter)
        """
        chunks = []
        separators = ['\n\n', '\n', '. ', ' ', '']
        
        start = 0
        chunk_index = 0
        
        while start < len(text):
            end = start + chunk_size
            
            # Try to break at a natural boundary
            if end < len(text):
                for separator in separators:
                    last_index = text.rfind(separator, start, end)
                    if last_index > start + chunk_size * 0.5:
                        end = last_index + len(separator)
                        break
            
            if end >= len(text):
                end = len(text)
            
            chunk_text = text[start:end].strip()
            
            if chunk_text:
                chunks.append({
                    "text": chunk_text,
                    "index": chunk_index,
                    "start": start,
                    "end": end,
                    "length": len(chunk_text)
                })
            
            # Move start position with overlap
            start = end - chunk_overlap
            if start >= end:
                start = end
            
            chunk_index += 1
            
            # Safety check to prevent infinite loop
            if chunk_index > 10000:
                break
        
        return chunks


def generate_pdf_id(filename: str, file_size: Optional[int] = None) -> str:
    """Generate a consistent PDF ID"""
    content = f"{filename}_{file_size or 0}"
    return hashlib.sha256(content.encode()).hexdigest()[:16]

