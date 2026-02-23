// PDF Chunks Service - Handles PDF chunking and storage in Supabase
import { supabase } from './supabaseClient';

// Chunk size: Smaller for WebLLM/TinyLlama compatibility
// Default: 1000 chars (~250 tokens) - good balance for small models
// WebLLM/TinyLlama needs smaller chunks, API models can handle larger
const CHUNK_SIZE = 800; // Reduced from 1500 for better WebLLM support (800 chars ≈ 200 tokens)
const CHUNK_OVERLAP = 100; // Overlap between chunks for better context

/**
 * Split PDF text into chunks optimized for RAG
 */
export function splitIntoChunks(text, chunkSize = CHUNK_SIZE, overlap = CHUNK_OVERLAP) {
    const chunks = [];
    const words = text.split(/\s+/);
    
    for (let i = 0; i < words.length; i += chunkSize - overlap) {
        const chunk = words.slice(i, i + chunkSize).join(' ').trim();
        if (chunk.length > 0) {
            chunks.push({
                chunkId: chunks.length,
                text: chunk,
                startIndex: i,
                endIndex: Math.min(i + chunkSize, words.length),
                wordCount: chunk.split(/\s+/).length
            });
        }
    }
    
    return chunks;
}

/**
 * Store PDF chunks in Supabase
 */
export async function storePDFChunks(userId, pdfId, chunks) {
    if (!userId || userId.startsWith('guest-')) {
        // Store in IndexedDB for guest users
        return storePDFChunksLocal(pdfId, chunks);
    }
    
    try {
        const chunksToInsert = chunks.map(chunk => ({
            user_id: userId,
            pdf_id: pdfId,
            chunk_id: chunk.chunkId,
            chunk_text: chunk.text,
            word_count: chunk.wordCount,
            start_index: chunk.startIndex,
            end_index: chunk.endIndex,
            created_at: new Date().toISOString()
        }));
        
        // Insert in batches of 100 to avoid Supabase limits
        const batchSize = 100;
        for (let i = 0; i < chunksToInsert.length; i += batchSize) {
            const batch = chunksToInsert.slice(i, i + batchSize);
            const { error } = await supabase
                .from('pdf_chunks')
                .insert(batch);
            
            if (error) {
                console.error(`Error inserting chunk batch ${i / batchSize + 1}:`, error);
                // Continue with next batch even if one fails
            }
        }
        
        return { success: true, chunksCount: chunks.length };
    } catch (error) {
        console.error('Error storing PDF chunks:', error);
        // Fallback to local storage
        return storePDFChunksLocal(pdfId, chunks);
    }
}

/**
 * Store PDF chunks in IndexedDB (for guest users or fallback)
 */
async function storePDFChunksLocal(pdfId, chunks) {
    try {
        const dbName = 'samir_pdf_chunks';
        const request = indexedDB.open(dbName, 1);
        
        request.onupgradeneeded = (event) => {
            const db = event.target.result;
            if (!db.objectStoreNames.contains('chunks')) {
                const objectStore = db.createObjectStore('chunks', { keyPath: ['pdfId', 'chunkId'] });
                objectStore.createIndex('pdfId', 'pdfId', { unique: false });
            }
        };
        
        return new Promise((resolve, reject) => {
            request.onsuccess = (event) => {
                const db = event.target.result;
                const transaction = db.transaction(['chunks'], 'readwrite');
                const store = transaction.objectStore('chunks');
                
                chunks.forEach(chunk => {
                    store.put({
                        pdfId,
                        chunkId: chunk.chunkId,
                        text: chunk.text,
                        wordCount: chunk.wordCount,
                        startIndex: chunk.startIndex,
                        endIndex: chunk.endIndex
                    });
                });
                
                transaction.oncomplete = () => resolve({ success: true, chunksCount: chunks.length });
                transaction.onerror = () => reject(transaction.error);
            };
            
            request.onerror = () => reject(request.error);
        });
    } catch (error) {
        console.error('Error storing PDF chunks locally:', error);
        return { success: false, error: error.message };
    }
}

/**
 * Retrieve PDF chunks from Supabase (for RAG)
 */
export async function retrievePDFChunks(userId, pdfId, limit = 50) {
    if (!userId || userId.startsWith('guest-')) {
        // Retrieve from IndexedDB for guest users
        return retrievePDFChunksLocal(pdfId, limit);
    }
    
    try {
        const { data, error } = await supabase
            .from('pdf_chunks')
            .select('chunk_id, chunk_text, word_count')
            .eq('user_id', userId)
            .eq('pdf_id', pdfId)
            .order('chunk_id', { ascending: true })
            .limit(limit);
        
        if (error) throw error;
        
        return data.map(chunk => ({
            chunkId: chunk.chunk_id,
            text: chunk.chunk_text,
            wordCount: chunk.word_count
        }));
    } catch (error) {
        console.error('Error retrieving PDF chunks:', error);
        // Fallback to local storage
        return retrievePDFChunksLocal(pdfId, limit);
    }
}

/**
 * Retrieve PDF chunks from IndexedDB
 */
async function retrievePDFChunksLocal(pdfId, limit) {
    try {
        const dbName = 'samir_pdf_chunks';
        const request = indexedDB.open(dbName, 1);
        
        return new Promise((resolve, reject) => {
            request.onsuccess = (event) => {
                const db = event.target.result;
                const transaction = db.transaction(['chunks'], 'readonly');
                const store = transaction.objectStore('chunks');
                const index = store.index('pdfId');
                const query = index.getAll(pdfId);
                
                query.onsuccess = () => {
                    const chunks = query.result
                        .slice(0, limit)
                        .map(chunk => ({
                            chunkId: chunk.chunkId,
                            text: chunk.text,
                            wordCount: chunk.wordCount
                        }));
                    resolve(chunks);
                };
                
                query.onerror = () => reject(query.error);
            };
            
            request.onerror = () => reject(request.error);
        });
    } catch (error) {
        console.error('Error retrieving PDF chunks locally:', error);
        return [];
    }
}

/**
 * Search PDF chunks by keywords (simple keyword matching for RAG)
 */
export async function searchPDFChunks(userId, pdfId, query, topK = 5) {
    const chunks = await retrievePDFChunks(userId, pdfId, 100); // Get more chunks for search
    
    if (chunks.length === 0) return [];
    
    // Simple keyword matching (can be improved with embeddings later)
    const queryWords = query.toLowerCase().split(/\s+/).filter(w => w.length > 2);
    
    const scoredChunks = chunks.map(chunk => {
        const chunkText = chunk.text.toLowerCase();
        let score = 0;
        
        queryWords.forEach(word => {
            const matches = (chunkText.match(new RegExp(word, 'g')) || []).length;
            score += matches;
        });
        
        return { ...chunk, score };
    });
    
    // Sort by score and return top K
    return scoredChunks
        .filter(c => c.score > 0)
        .sort((a, b) => b.score - a.score)
        .slice(0, topK)
        .map(c => ({ text: c.text, chunkId: c.chunkId }));
}

