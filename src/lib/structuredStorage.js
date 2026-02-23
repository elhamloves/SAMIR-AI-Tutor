/**
 * Structured PDF Storage Service
 * Stores all structured PDF data in Supabase: metadata, chunks, figures, tables, references, TOC
 */

import { supabase } from './supabaseClient';
import { storePDFChunks } from './pdfChunksService';

/**
 * Store all structured PDF data
 */
export async function storeStructuredPDFData(userId, pdfId, structuredData, chunks) {
    if (!userId || userId.startsWith('guest-')) {
        // For guest users, store in IndexedDB (simplified)
        return storeStructuredPDFDataLocal(pdfId, structuredData, chunks);
    }
    
    try {
        // Update extraction status
        await updateExtractionStatus(userId, pdfId, 'processing');
        
        // 1. Store metadata
        await storePDFMetadata(userId, pdfId, structuredData.metadata, chunks.length);
        
        // 2. Store chunks
        await storeStructuredChunks(userId, pdfId, chunks);
        
        // 3. Store TOC
        if (structuredData.tableOfContents && structuredData.tableOfContents.length > 0) {
            await storeTableOfContents(userId, pdfId, structuredData.tableOfContents);
        }
        
        // 4. Store figures
        if (structuredData.figures && structuredData.figures.length > 0) {
            await storeFigures(userId, pdfId, structuredData.figures);
        }
        
        // 5. Store tables
        if (structuredData.tables && structuredData.tables.length > 0) {
            await storeTables(userId, pdfId, structuredData.tables);
        }
        
        // 6. Store references
        if (structuredData.references && structuredData.references.length > 0) {
            await storeReferences(userId, pdfId, structuredData.references);
        }
        
        // Update extraction status to completed
        await updateExtractionStatus(userId, pdfId, 'completed');
        
        return { success: true };
    } catch (error) {
        console.error('Error storing structured PDF data:', error);
        await updateExtractionStatus(userId, pdfId, 'failed', error.message);
        throw error;
    }
}

/**
 * Store PDF metadata
 */
async function storePDFMetadata(userId, pdfId, metadata, totalChunks) {
    const { data: existing } = await supabase
        .from('pdf_metadata')
        .select('id')
        .eq('user_id', userId)
        .eq('pdf_id', pdfId)
        .single();
    
    const metadataData = {
        user_id: userId,
        pdf_id: pdfId,
        filename: metadata.filename || 'unknown.pdf',
        file_size: metadata.fileSize || 0,
        title: metadata.title || null,
        authors: metadata.authors && metadata.authors.length > 0 ? metadata.authors : null,
        affiliations: metadata.affiliations && metadata.affiliations.length > 0 ? metadata.affiliations : null,
        abstract: metadata.abstract || null,
        keywords: metadata.keywords && metadata.keywords.length > 0 ? metadata.keywords : null,
        publication_date: metadata.publicationDate || null,
        doi: metadata.doi || null,
        has_table_of_contents: metadata.hasTableOfContents || false,
        total_pages: metadata.totalPages || 0,
        language: metadata.language || 'en',
        total_chunks: totalChunks,
        total_words: metadata.totalWords || 0,
        extraction_status: 'completed',
        extracted_at: new Date().toISOString(),
    };
    
    if (existing) {
        // Update existing
        const { error } = await supabase
            .from('pdf_metadata')
            .update(metadataData)
            .eq('id', existing.id);
        
        if (error) throw error;
    } else {
        // Insert new
        const { error } = await supabase
            .from('pdf_metadata')
            .insert(metadataData);
        
        if (error) throw error;
    }
}

/**
 * Store structured chunks
 */
async function storeStructuredChunks(userId, pdfId, chunks) {
    // First, delete old chunks for this PDF
    await supabase
        .from('pdf_chunks')
        .delete()
        .eq('user_id', userId)
        .eq('pdf_id', pdfId);
    
    // Prepare chunks for insertion
    const chunksToInsert = chunks.map(chunk => ({
        user_id: userId,
        pdf_id: pdfId,
        chunk_id: chunk.chunkId,
        chunk_text: chunk.text,
        section_title: chunk.sectionTitle || null,
        section_level: chunk.sectionLevel || 0,
        page_start: chunk.pageStart || 1,
        page_end: chunk.pageEnd || chunk.pageStart || 1,
        figure_references: chunk.figureReferences && chunk.figureReferences.length > 0 
            ? chunk.figureReferences 
            : null,
        table_references: chunk.tableReferences && chunk.tableReferences.length > 0
            ? chunk.tableReferences
            : null,
        word_count: chunk.wordCount || 0,
        start_index: chunk.startIndex || 0,
        end_index: chunk.endIndex || 0,
    }));
    
    // Insert in batches of 100
    const batchSize = 100;
    for (let i = 0; i < chunksToInsert.length; i += batchSize) {
        const batch = chunksToInsert.slice(i, i + batchSize);
        const { error } = await supabase
            .from('pdf_chunks')
            .insert(batch);
        
        if (error) {
            console.error(`Error inserting chunk batch ${i / batchSize + 1}:`, error);
            throw error;
        }
    }
}

/**
 * Store table of contents
 */
async function storeTableOfContents(userId, pdfId, tocEntries) {
    // Delete old TOC
    await supabase
        .from('pdf_toc')
        .delete()
        .eq('user_id', userId)
        .eq('pdf_id', pdfId);
    
    // Insert TOC entries
    const tocToInsert = tocEntries.map(entry => ({
        user_id: userId,
        pdf_id: pdfId,
        entry_title: entry.entryTitle,
        entry_level: entry.entryLevel || 1,
        page_number: entry.pageNumber,
        entry_order: entry.entryOrder,
        parent_entry_id: entry.parentEntryId || null,
    }));
    
    const { error } = await supabase
        .from('pdf_toc')
        .insert(tocToInsert);
    
    if (error) throw error;
}

/**
 * Store figures
 */
async function storeFigures(userId, pdfId, figures) {
    // Delete old figures
    await supabase
        .from('pdf_figures')
        .delete()
        .eq('user_id', userId)
        .eq('pdf_id', pdfId);
    
    // Insert figures
    const figuresToInsert = figures.map(figure => ({
        user_id: userId,
        pdf_id: pdfId,
        figure_id: figure.figureId,
        caption: figure.caption || null,
        page_number: figure.pageNumber,
        alt_text: figure.altText || null,
        image_data: figure.imageData || null, // Optional: store thumbnail
    }));
    
    const { error } = await supabase
        .from('pdf_figures')
        .insert(figuresToInsert);
    
    if (error) throw error;
}

/**
 * Store tables
 */
async function storeTables(userId, pdfId, tables) {
    // Delete old tables
    await supabase
        .from('pdf_tables')
        .delete()
        .eq('user_id', userId)
        .eq('pdf_id', pdfId);
    
    // Insert tables
    const tablesToInsert = tables.map(table => ({
        user_id: userId,
        pdf_id: pdfId,
        table_id: table.tableId,
        caption: table.caption || null,
        page_number: table.pageNumber,
        table_data: table.tableData || null, // JSONB structured data
        table_text: table.tableText || null, // Plain text representation
    }));
    
    const { error } = await supabase
        .from('pdf_tables')
        .insert(tablesToInsert);
    
    if (error) throw error;
}

/**
 * Store references
 */
async function storeReferences(userId, pdfId, references) {
    // Delete old references
    await supabase
        .from('pdf_references')
        .delete()
        .eq('user_id', userId)
        .eq('pdf_id', pdfId);
    
    // Insert references
    const refsToInsert = references.map(ref => ({
        user_id: userId,
        pdf_id: pdfId,
        reference_id: ref.referenceId,
        citation_text: ref.citationText,
        authors: ref.authors && ref.authors.length > 0 ? ref.authors : null,
        title: ref.title || null,
        journal: ref.journal || null,
        year: ref.year || null,
        doi: ref.doi || null,
        url: ref.url || null,
    }));
    
    const { error } = await supabase
        .from('pdf_references')
        .insert(refsToInsert);
    
    if (error) throw error;
}

/**
 * Update extraction status
 */
async function updateExtractionStatus(userId, pdfId, status, errorMessage = null) {
    try {
        const { data: existing } = await supabase
            .from('pdf_metadata')
            .select('id')
            .eq('user_id', userId)
            .eq('pdf_id', pdfId)
            .single();
        
        if (existing) {
            await supabase
                .from('pdf_metadata')
                .update({
                    extraction_status: status,
                    extraction_error: errorMessage,
                    extracted_at: status === 'completed' ? new Date().toISOString() : null,
                })
                .eq('id', existing.id);
        }
    } catch (error) {
        console.warn('Could not update extraction status:', error);
    }
}

/**
 * Store structured data locally (for guest users)
 */
async function storeStructuredPDFDataLocal(pdfId, structuredData, chunks) {
    // Simplified local storage for guest users
    // Store in IndexedDB or localStorage
    try {
        const dbName = 'samir_structured_pdfs';
        const request = indexedDB.open(dbName, 1);
        
        request.onupgradeneeded = (event) => {
            const db = event.target.result;
            if (!db.objectStoreNames.contains('pdfs')) {
                db.createObjectStore('pdfs', { keyPath: 'pdfId' });
            }
        };
        
        return new Promise((resolve, reject) => {
            request.onsuccess = (event) => {
                const db = event.target.result;
                const transaction = db.transaction(['pdfs'], 'readwrite');
                const store = transaction.objectStore('pdfs');
                
                store.put({
                    pdfId,
                    metadata: structuredData.metadata,
                    chunks,
                    figures: structuredData.figures || [],
                    tables: structuredData.tables || [],
                    references: structuredData.references || [],
                    toc: structuredData.tableOfContents || [],
                });
                
                transaction.oncomplete = () => resolve({ success: true });
                transaction.onerror = () => reject(transaction.error);
            };
            
            request.onerror = () => reject(request.error);
        });
    } catch (error) {
        console.error('Error storing structured PDF data locally:', error);
        return { success: false, error: error.message };
    }
}

