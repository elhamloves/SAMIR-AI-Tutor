/**
 * PDF OCR Helper
 * Handles OCR processing for PDF pages that need it
 */

import Tesseract from 'tesseract.js';

/**
 * Render PDF page to canvas and perform OCR
 * @param {Object} page - PDF.js page object
 * @param {Object} viewport - PDF.js viewport
 * @param {string} languages - OCR languages (e.g., 'eng+ara')
 * @returns {Promise<string>} OCR extracted text
 */
export async function performPageOCR(page, viewport, languages = 'eng+ara') {
    try {
        // Create canvas element
        const canvas = document.createElement('canvas');
        const context = canvas.getContext('2d');
        canvas.width = viewport.width;
        canvas.height = viewport.height;
        
        // Render PDF page to canvas
        const renderContext = {
            canvasContext: context,
            viewport: viewport
        };
        
        await page.render(renderContext).promise;
        
        // Convert canvas to blob for OCR
        return new Promise((resolve, reject) => {
            canvas.toBlob(async (blob) => {
                if (!blob) {
                    reject(new Error('Failed to create blob from canvas'));
                    return;
                }
                
                try {
                    // Perform OCR
                    const { data: { text } } = await Tesseract.recognize(blob, languages, {
                        logger: (m) => {
                            // Progress updates can be logged here if needed
                        }
                    });
                    
                    resolve(text.trim());
                } catch (error) {
                    reject(error);
                }
            }, 'image/png');
        });
    } catch (error) {
        console.error('OCR error:', error);
        throw error;
    }
}

/**
 * Check if a PDF page needs OCR (scanned/image-based)
 * @param {Object} pageData - Page data from extractPageStructure
 * @returns {boolean} True if page likely needs OCR
 */
export function needsOCR(pageData) {
    // If very few text items, likely scanned
    if (pageData.textItems && pageData.textItems.length < 50) {
        return true;
    }
    
    // If main text is very short, might be image-based
    if (pageData.mainText && pageData.mainText.trim().length < 100) {
        return true;
    }
    
    return false;
}

