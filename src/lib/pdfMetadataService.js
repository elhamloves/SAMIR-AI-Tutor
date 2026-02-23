/**
 * PDF Metadata Service
 * Stores processed PDF data in Supabase before Samir replies
 */

import { supabase } from './supabaseClient';

/**
 * Store PDF metadata in Supabase
 * @param {string} userId - User ID
 * @param {Object} processedData - Processed PDF data from backend
 * @returns {Promise<Object>} Stored metadata
 */
export async function storePDFMetadata(userId, processedData) {
    if (!userId || userId.startsWith('guest-')) {
        // Store in localStorage for guest users
        return storePDFMetadataLocal(processedData);
    }

    try {
        const { pdf_id, filename, file_size, metadata, total_pages, chunks, full_text } = processedData;

        // Prepare metadata for storage
        const metadataToStore = {
            user_id: userId,
            pdf_id: pdf_id,
            filename: filename,
            file_size: file_size,
            processed_title: metadata.detected_title || metadata.title || null,
            processed_author: metadata.detected_authors?.join(', ') || metadata.author || null,
            detected_title: metadata.detected_title || null,
            detected_authors: metadata.detected_authors || [],
            detected_logo: metadata.detected_logo || false,
            total_pages: total_pages || 0,
            total_chunks: chunks?.length || 0,
            total_text_length: full_text?.length || 0,
            sections_count: processedData.sections?.length || 0,
            headings_count: processedData.headings?.length || 0,
            tables_count: processedData.tables?.length || 0,
            figures_count: processedData.figures?.length || 0,
            images_count: processedData.images?.length || 0,
            ocr_performed: processedData.pages?.some(p => p.needs_ocr) || false,
            processing_status: 'completed',
            processed_at: new Date().toISOString(),
            full_text_preview: full_text?.substring(0, 5000) || null,
            last_accessed_at: new Date().toISOString()
        };

        // Upsert metadata (insert or update if exists)
        const { data, error } = await supabase
            .from('pdf_metadata')
            .upsert(metadataToStore, {
                onConflict: 'user_id,pdf_id'
            })
            .select()
            .single();

        if (error) {
            console.error('Error storing PDF metadata:', error);
            throw error;
        }

        console.log('✅ PDF metadata stored in Supabase:', pdf_id);
        return data;
    } catch (error) {
        console.error('Error storing PDF metadata:', error);
        // Fallback to local storage
        return storePDFMetadataLocal(processedData);
    }
}

/**
 * Store PDF metadata in localStorage (for guest users)
 */
function storePDFMetadataLocal(processedData) {
    try {
        const key = `pdf_metadata_${processedData.pdf_id}`;
        localStorage.setItem(key, JSON.stringify(processedData));
        console.log('✅ PDF metadata stored locally:', processedData.pdf_id);
        return processedData;
    } catch (error) {
        console.error('Error storing PDF metadata locally:', error);
        return processedData;
    }
}

/**
 * Get PDF metadata from Supabase
 * @param {string} userId - User ID
 * @param {string} pdfId - PDF ID
 * @returns {Promise<Object|null>} PDF metadata
 */
export async function getPDFMetadata(userId, pdfId) {
    if (!userId || userId.startsWith('guest-')) {
        // Get from localStorage for guest users
        const key = `pdf_metadata_${pdfId}`;
        const stored = localStorage.getItem(key);
        return stored ? JSON.parse(stored) : null;
    }

    try {
        const { data, error } = await supabase
            .from('pdf_metadata')
            .select('*')
            .eq('user_id', userId)
            .eq('pdf_id', pdfId)
            .single();

        if (error) {
            if (error.code === 'PGRST116') {
                // Not found
                return null;
            }
            throw error;
        }

        return data;
    } catch (error) {
        console.error('Error getting PDF metadata:', error);
        return null;
    }
}

/**
 * Update last accessed time
 */
export async function updateLastAccessed(userId, pdfId) {
    if (!userId || userId.startsWith('guest-')) {
        return;
    }

    try {
        await supabase
            .from('pdf_metadata')
            .update({ last_accessed_at: new Date().toISOString() })
            .eq('user_id', userId)
            .eq('pdf_id', pdfId);
    } catch (error) {
        console.error('Error updating last accessed:', error);
    }
}

