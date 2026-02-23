"""
Flask API for PDF processing
Similar to PageLM's backend but focused on PDF preprocessing
"""

from flask import Flask, request, jsonify
from flask_cors import CORS
import logging
from pdf_processor import PDFProcessor, generate_pdf_id
import os
from dotenv import load_dotenv

load_dotenv()

app = Flask(__name__)
CORS(app)  # Enable CORS for frontend

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Initialize PDF processor
# Set TESSERACT_CMD in .env if tesseract is not in PATH
tesseract_cmd = os.getenv('TESSERACT_CMD')
processor = PDFProcessor(tesseract_cmd=tesseract_cmd)


@app.route('/health', methods=['GET'])
def health():
    """Health check endpoint"""
    return jsonify({"status": "ok", "service": "pdf-processor"})


@app.route('/process-pdf', methods=['POST'])
def process_pdf():
    """
    Process PDF file
    
    Expects:
    - multipart/form-data with 'file' field
    - Optional 'filename' field
    
    Returns:
    - JSON with extracted PDF data
    """
    try:
        if 'file' not in request.files:
            return jsonify({"error": "No file provided"}), 400
        
        file = request.files['file']
        
        if not file:
            return jsonify({"error": "File object is None"}), 400
        
        filename = request.form.get('filename', file.filename or 'document.pdf')
        
        if not filename:
            return jsonify({"error": "Filename is required"}), 400
        
        if not filename.lower().endswith('.pdf'):
            return jsonify({"error": "File must be a PDF"}), 400
        
        # Read PDF bytes
        pdf_bytes = file.read()
        
        if not pdf_bytes:
            return jsonify({"error": "Failed to read file content"}), 400
        
        if len(pdf_bytes) == 0:
            return jsonify({"error": "Empty file"}), 400
        
        # Generate PDF ID
        pdf_id = generate_pdf_id(filename, len(pdf_bytes))
        
        logger.info(f"Processing PDF: {filename} (ID: {pdf_id}, Size: {len(pdf_bytes)} bytes)")
        
        # Validate file content before processing
        if not pdf_bytes or len(pdf_bytes) < 100:  # PDFs should be at least 100 bytes
            return jsonify({"error": "Invalid PDF file: file too small or corrupted"}), 400
        
        # Process PDF
        result = processor.process_pdf(pdf_bytes, filename)
        
        if not result:
            return jsonify({"error": "PDF processing returned no result"}), 500
        
        # Add PDF ID to result
        result["pdf_id"] = pdf_id
        result["filename"] = filename
        result["file_size"] = len(pdf_bytes)
        
        logger.info(f"PDF processed successfully: {filename}")
        logger.info(f"  - Pages: {result['total_pages']}")
        logger.info(f"  - Title: {result['metadata'].get('detected_title') or result['metadata'].get('title')}")
        logger.info(f"  - Authors: {result['metadata'].get('detected_authors') or [result['metadata'].get('author')]}")
        logger.info(f"  - Chunks: {len(result['chunks'])}")
        logger.info(f"  - Text length: {len(result['full_text'])}")
        
        return jsonify({
            "success": True,
            "data": result
        })
    
    except Exception as e:
        logger.error(f"Error processing PDF: {str(e)}", exc_info=True)
        return jsonify({
            "success": False,
            "error": str(e)
        }), 500


@app.route('/process-pdf-bytes', methods=['POST'])
def process_pdf_bytes():
    """
    Process PDF from bytes (for direct API calls)
    
    Expects:
    - JSON with 'pdf_bytes' (base64 encoded) and 'filename'
    
    Returns:
    - JSON with extracted PDF data
    """
    try:
        data = request.get_json()
        
        if not data or 'pdf_bytes' not in data:
            return jsonify({"error": "No PDF bytes provided"}), 400
        
        import base64
        pdf_bytes = base64.b64decode(data['pdf_bytes'])
        filename = data.get('filename', 'document.pdf')
        
        # Generate PDF ID
        pdf_id = generate_pdf_id(filename, len(pdf_bytes))
        
        # Process PDF
        result = processor.process_pdf(pdf_bytes, filename)
        result["pdf_id"] = pdf_id
        result["filename"] = filename
        result["file_size"] = len(pdf_bytes)
        
        return jsonify({
            "success": True,
            "data": result
        })
    
    except Exception as e:
        logger.error(f"Error processing PDF bytes: {str(e)}", exc_info=True)
        return jsonify({
            "success": False,
            "error": str(e)
        }), 500


if __name__ == '__main__':
    port = int(os.getenv('PORT', 5001))
    debug = os.getenv('DEBUG', 'False').lower() == 'true'
    
    logger.info(f"Starting PDF processor server on port {port}")
    app.run(host='0.0.0.0', port=port, debug=debug)

