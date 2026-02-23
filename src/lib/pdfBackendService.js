/**
 * PDF Backend Service
 * Communicates with Python backend for PDF processing
 */

const PDF_BACKEND_URL = import.meta.env.VITE_PDF_BACKEND_URL || 'http://localhost:5001';

/**
 * Process PDF using Python backend
 * @param {File} file - PDF file
 * @returns {Promise<Object>} Processed PDF data
 */
export async function processPDFWithBackend(file) {
    try {
        const formData = new FormData();
        formData.append('file', file);
        formData.append('filename', file.name);

        console.log(`📤 Sending PDF to backend: ${file.name} (${file.size} bytes)`);

        const response = await fetch(`${PDF_BACKEND_URL}/process-pdf`, {
            method: 'POST',
            body: formData
        });

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
            throw new Error(errorData.error || `HTTP ${response.status}: ${response.statusText}`);
        }

        const result = await response.json();

        if (!result.success) {
            throw new Error(result.error || 'PDF processing failed');
        }

        console.log('✅ PDF processed successfully by backend');
        console.log(`  - PDF ID: ${result.data.pdf_id}`);
        console.log(`  - Pages: ${result.data.total_pages}`);
        console.log(`  - Title: ${result.data.metadata.detected_title || result.data.metadata.title || 'N/A'}`);
        console.log(`  - Authors: ${result.data.metadata.detected_authors?.join(', ') || result.data.metadata.author || 'N/A'}`);
        console.log(`  - Chunks: ${result.data.chunks.length}`);
        console.log(`  - Text length: ${result.data.full_text.length}`);

        return result.data;
    } catch (error) {
        console.error('❌ Error processing PDF with backend:', error);
        throw error;
    }
}

/**
 * Check if backend is available
 * @returns {Promise<boolean>}
 */
export async function checkBackendHealth() {
    try {
        const response = await fetch(`${PDF_BACKEND_URL}/health`, {
            method: 'GET',
            signal: AbortSignal.timeout(3000) // 3 second timeout
        });
        return response.ok;
    } catch (error) {
        console.warn('Backend health check failed:', error);
        return false;
    }
}

