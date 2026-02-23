/**
 * Enhanced RAG Service
 * Retrieves relevant chunks with full document context (metadata, figures, tables, references)
 */

import { supabase } from './supabaseClient';
import { retrievePDFChunks } from './pdfChunksService';
import { embeddingsService } from './embeddingsService';

/**
 * Get enhanced context for a query including metadata, relevant chunks, figures, tables
 */
export async function getEnhancedContextForQuery(userId, pdfId, query, topK = 5) {
    try {
        // 1. Get PDF metadata
        const metadata = await getPDFMetadata(userId, pdfId);
        
        // 2. Get relevant chunks
        const chunks = await getRelevantChunks(userId, pdfId, query, topK);
        
        // 3. Extract figure/table references from query and chunks
        const figureRefs = extractReferences(query, 'figure');
        const tableRefs = extractReferences(query, 'table');
        
        // Get referenced figures/tables
        const figures = figureRefs.length > 0 
            ? await getReferencedFigures(userId, pdfId, figureRefs)
            : [];
        const tables = tableRefs.length > 0
            ? await getReferencedTables(userId, pdfId, tableRefs)
            : [];
        
        // Get figures/tables from chunks
        const chunkFigures = await getChunkFigures(userId, pdfId, chunks);
        const chunkTables = await getChunkTables(userId, pdfId, chunks);
        
        // 4. Build enhanced context
        return {
            metadata,
            chunks,
            figures: [...new Set([...figures, ...chunkFigures])],
            tables: [...new Set([...tables, ...chunkTables])],
        };
    } catch (error) {
        console.error('Error getting enhanced context:', error);
        throw error;
    }
}

/**
 * Build prompt with enhanced context
 */
export function buildEnhancedPrompt(context, userQuery) {
    const { metadata, chunks, figures, tables } = context;
    
    let prompt = '';
    
    // Add document metadata
    if (metadata) {
        prompt += `DOCUMENT: ${metadata.title || 'Unknown Title'}\n`;
        
        if (metadata.authors && metadata.authors.length > 0) {
            prompt += `AUTHORS: ${metadata.authors.join(', ')}\n`;
        }
        
        if (metadata.abstract) {
            prompt += `\nABSTRACT:\n${metadata.abstract.substring(0, 500)}...\n`;
        }
        
        if (metadata.keywords && metadata.keywords.length > 0) {
            prompt += `KEYWORDS: ${metadata.keywords.join(', ')}\n`;
        }
        
        prompt += '\n';
    }
    
    // Add relevant sections
    prompt += 'RELEVANT DOCUMENT SECTIONS:\n';
    prompt += '='.repeat(50) + '\n';
    
    for (let i = 0; i < chunks.length; i++) {
        const chunk = chunks[i];
        prompt += `\n[Section ${i + 1}]`;
        
        if (chunk.section_title) {
            prompt += ` ${chunk.section_title}`;
        }
        
        if (chunk.page_start) {
            prompt += ` (Page ${chunk.page_start}`;
            if (chunk.page_end && chunk.page_end !== chunk.page_start) {
                prompt += `-${chunk.page_end}`;
            }
            prompt += ')';
        }
        
        prompt += '\n';
        
        // Add figure/table references if available
        if (chunk.figure_references && chunk.figure_references.length > 0) {
            prompt += `[Referenced Figures: ${chunk.figure_references.join(', ')}]\n`;
        }
        if (chunk.table_references && chunk.table_references.length > 0) {
            prompt += `[Referenced Tables: ${chunk.table_references.join(', ')}]\n`;
        }
        
        prompt += chunk.chunk_text + '\n';
        prompt += '-'.repeat(50) + '\n';
    }
    
    // Add figures if available
    if (figures.length > 0) {
        prompt += '\n\nREFERENCED FIGURES:\n';
        prompt += '='.repeat(50) + '\n';
        for (const figure of figures) {
            prompt += `\n${figure.figure_id}: ${figure.caption || 'No caption'}\n`;
            prompt += `(Page ${figure.page_number})\n`;
            if (figure.alt_text) {
                prompt += `Alt text: ${figure.alt_text}\n`;
            }
        }
    }
    
    // Add tables if available
    if (tables.length > 0) {
        prompt += '\n\nREFERENCED TABLES:\n';
        prompt += '='.repeat(50) + '\n';
        for (const table of tables) {
            prompt += `\n${table.table_id}: ${table.caption || 'No caption'}\n`;
            prompt += `(Page ${table.page_number})\n`;
            if (table.table_text) {
                prompt += `Table data:\n${table.table_text.substring(0, 500)}...\n`;
            }
        }
    }
    
    prompt += `\n\nUSER QUESTION: ${userQuery}\n`;
    prompt += '\nINSTRUCTIONS: Answer the user\'s question using ONLY the information from the document sections, figures, and tables provided above. ';
    prompt += 'If the information is not in the provided content, state that clearly. ';
    prompt += 'When referencing figures or tables, use their exact labels (e.g., "Figure 1", "Table 2").';
    
    return prompt;
}

/**
 * Get PDF metadata
 */
async function getPDFMetadata(userId, pdfId) {
    if (!userId || userId.startsWith('guest-')) {
        // For guest users, try IndexedDB or return null
        return null;
    }
    
    try {
        const { data, error } = await supabase
            .from('pdf_metadata')
            .select('*')
            .eq('user_id', userId)
            .eq('pdf_id', pdfId)
            .single();
        
        if (error) throw error;
        return data;
    } catch (error) {
        console.warn('Could not retrieve PDF metadata:', error);
        return null;
    }
}

/**
 * Get relevant chunks (with embeddings or keyword search)
 */
async function getRelevantChunks(userId, pdfId, query, topK) {
    // Try embeddings-based search first
    try {
        await embeddingsService.initialize();
        
        // Get all chunks for this PDF
        const allChunks = await retrievePDFChunks(userId, pdfId, 200);
        
        if (allChunks.length === 0) return [];
        
        // Use embeddings to find similar chunks
        const relevantChunks = await embeddingsService.findSimilarChunks(query, allChunks, topK);
        
        if (relevantChunks && relevantChunks.length > 0) {
            // Get full chunk data from database
            return await getChunkDetails(userId, pdfId, relevantChunks.map(c => c.chunkId));
        }
    } catch (error) {
        console.warn('Embeddings search failed, using keyword search:', error);
    }
    
    // Fallback to keyword search
    return await keywordSearchChunks(userId, pdfId, query, topK);
}

/**
 * Get detailed chunk information
 */
async function getChunkDetails(userId, pdfId, chunkIds) {
    if (!userId || userId.startsWith('guest-')) {
        return [];
    }
    
    try {
        const { data, error } = await supabase
            .from('pdf_chunks')
            .select('*')
            .eq('user_id', userId)
            .eq('pdf_id', pdfId)
            .in('chunk_id', chunkIds)
            .order('chunk_id', { ascending: true });
        
        if (error) throw error;
        return data || [];
    } catch (error) {
        console.error('Error getting chunk details:', error);
        return [];
    }
}

/**
 * Keyword search for chunks
 */
async function keywordSearchChunks(userId, pdfId, query, topK) {
    try {
        const { data, error } = await supabase
            .from('pdf_chunks')
            .select('*')
            .eq('user_id', userId)
            .eq('pdf_id', pdfId)
            .textSearch('chunk_text', query.split(' ').join(' | '))
            .limit(topK);
        
        if (error) throw error;
        return data || [];
    } catch (error) {
        // Fallback to simple substring search
        return await simpleSearchChunks(userId, pdfId, query, topK);
    }
}

/**
 * Simple substring search for chunks
 */
async function simpleSearchChunks(userId, pdfId, query, topK) {
    const allChunks = await retrievePDFChunks(userId, pdfId, 100);
    const queryWords = query.toLowerCase().split(/\s+/).filter(w => w.length > 2);
    
    const scored = allChunks.map(chunk => {
        const chunkText = chunk.text.toLowerCase();
        const score = queryWords.reduce((sum, word) => {
            return sum + (chunkText.match(new RegExp(word, 'g')) || []).length;
        }, 0);
        return { ...chunk, score };
    });
    
    return scored
        .filter(c => c.score > 0)
        .sort((a, b) => b.score - a.score)
        .slice(0, topK);
}

/**
 * Extract references from query (e.g., "Figure 1", "Table 2")
 */
function extractReferences(query, type) {
    const pattern = type === 'figure' 
        ? /(?:figure|fig\.?)\s+(\d+(?:\.\d+)*)/gi
        : /(?:table|tab\.?)\s+(\d+(?:\.\d+)*)/gi;
    
    const matches = [...query.matchAll(pattern)];
    const prefix = type === 'figure' ? 'Figure' : 'Table';
    
    return matches.map(match => `${prefix} ${match[1]}`);
}

/**
 * Get referenced figures
 */
async function getReferencedFigures(userId, pdfId, figureIds) {
    if (!userId || userId.startsWith('guest-')) {
        return [];
    }
    
    try {
        const { data, error } = await supabase
            .from('pdf_figures')
            .select('*')
            .eq('user_id', userId)
            .eq('pdf_id', pdfId)
            .in('figure_id', figureIds);
        
        if (error) throw error;
        return data || [];
    } catch (error) {
        console.error('Error getting referenced figures:', error);
        return [];
    }
}

/**
 * Get referenced tables
 */
async function getReferencedTables(userId, pdfId, tableIds) {
    if (!userId || userId.startsWith('guest-')) {
        return [];
    }
    
    try {
        const { data, error } = await supabase
            .from('pdf_tables')
            .select('*')
            .eq('user_id', userId)
            .eq('pdf_id', pdfId)
            .in('table_id', tableIds);
        
        if (error) throw error;
        return data || [];
    } catch (error) {
        console.error('Error getting referenced tables:', error);
        return [];
    }
}

/**
 * Get figures referenced in chunks
 */
async function getChunkFigures(userId, pdfId, chunks) {
    const figureRefs = new Set();
    
    for (const chunk of chunks) {
        if (chunk.figure_references && Array.isArray(chunk.figure_references)) {
            chunk.figure_references.forEach(ref => figureRefs.add(ref));
        }
    }
    
    if (figureRefs.size === 0) return [];
    
    return await getReferencedFigures(userId, pdfId, Array.from(figureRefs));
}

/**
 * Get tables referenced in chunks
 */
async function getChunkTables(userId, pdfId, chunks) {
    const tableRefs = new Set();
    
    for (const chunk of chunks) {
        if (chunk.table_references && Array.isArray(chunk.table_references)) {
            chunk.table_references.forEach(ref => tableRefs.add(ref));
        }
    }
    
    if (tableRefs.size === 0) return [];
    
    return await getReferencedTables(userId, pdfId, Array.from(tableRefs));
}

