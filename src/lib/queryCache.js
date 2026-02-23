// Query Cache Service - Reduces API calls by caching Q&A results
import { supabase } from './supabaseClient';

/**
 * Generate hash for query (for cache lookup)
 * CRITICAL: Must support Unicode (Arabic, etc.) - btoa() doesn't work with non-Latin1
 */
function hashQuery(query, pdfId) {
    try {
        // Use TextEncoder + crypto.subtle for Unicode-safe hashing
        const encoder = new TextEncoder();
        const data = encoder.encode(JSON.stringify({ query, pdfId }));
        
        // Use crypto.subtle if available (modern browsers)
        if (crypto?.subtle) {
            // For synchronous hash, use a simple hash function
            let hash = 0;
            for (let i = 0; i < data.length; i++) {
                const char = data[i];
                hash = ((hash << 5) - hash) + char;
                hash = hash & hash; // Convert to 32-bit integer
            }
            return Math.abs(hash).toString(36).substring(0, 32);
        } else {
            // Fallback: Simple hash function
            let hash = 0;
            const str = JSON.stringify({ query, pdfId });
            for (let i = 0; i < str.length; i++) {
                const char = str.charCodeAt(i);
                hash = ((hash << 5) - hash) + char;
                hash = hash & hash;
            }
            return Math.abs(hash).toString(36).substring(0, 32);
        }
    } catch (error) {
        console.warn('Hash generation failed, using fallback:', error);
        // Ultimate fallback: use string hash
        let hash = 0;
        const str = JSON.stringify({ query, pdfId });
        for (let i = 0; i < str.length; i++) {
            hash = ((hash << 5) - hash) + str.charCodeAt(i);
            hash = hash & hash;
        }
        return Math.abs(hash).toString(36).substring(0, 32);
    }
}

/**
 * Check if query is cached
 */
export async function getCachedQuery(userId, pdfId, query) {
    if (!userId || userId.startsWith('guest-')) {
        // Use IndexedDB for guest users
        return getCachedQueryLocal(pdfId, query);
    }
    
    try {
        const queryHash = hashQuery(query, pdfId);
        const { data, error } = await supabase
            .from('query_cache')
            .select('response_text, model_used')
            .eq('user_id', userId)
            .eq('pdf_id', pdfId)
            .eq('query_hash', queryHash)
            .gt('expires_at', new Date().toISOString())
            .single();
        
        if (error || !data) return null;
        
        return data.response_text;
    } catch (error) {
        console.warn('Error checking query cache:', error);
        return null;
    }
}

/**
 * Cache query result
 */
export async function setCachedQuery(userId, pdfId, query, response, modelUsed = null) {
    if (!userId || userId.startsWith('guest-')) {
        // Use IndexedDB for guest users
        return setCachedQueryLocal(pdfId, query, response);
    }
    
    try {
        const queryHash = hashQuery(query, pdfId);
        const expiresAt = new Date();
        expiresAt.setDate(expiresAt.getDate() + 7); // Cache for 7 days
        
        const { error } = await supabase
            .from('query_cache')
            .upsert({
                user_id: userId,
                pdf_id: pdfId,
                query_hash: queryHash,
                query_text: query.substring(0, 500), // Store first 500 chars
                response_text: response,
                model_used: modelUsed,
                expires_at: expiresAt.toISOString()
            }, {
                onConflict: 'user_id,pdf_id,query_hash'
            });
        
        if (error) throw error;
    } catch (error) {
        console.warn('Error caching query:', error);
        // Fallback to local cache
        setCachedQueryLocal(pdfId, query, response);
    }
}

/**
 * Local cache using IndexedDB (for guest users)
 */
async function getCachedQueryLocal(pdfId, query) {
    try {
        const dbName = 'samir_query_cache';
        const request = indexedDB.open(dbName, 1);
        
        request.onupgradeneeded = (event) => {
            const db = event.target.result;
            if (!db.objectStoreNames.contains('cache')) {
                const objectStore = db.createObjectStore('cache', { keyPath: ['pdfId', 'queryHash'] });
                objectStore.createIndex('pdfId', 'pdfId', { unique: false });
                objectStore.createIndex('expiresAt', 'expiresAt', { unique: false });
            }
        };
        
        return new Promise((resolve, reject) => {
            request.onsuccess = (event) => {
                const db = event.target.result;
                const transaction = db.transaction(['cache'], 'readonly');
                const store = transaction.objectStore('cache');
                const queryHash = hashQuery(query, pdfId);
                const request = store.get([pdfId, queryHash]);
                
                request.onsuccess = () => {
                    const result = request.result;
                    if (result && new Date(result.expiresAt) > new Date()) {
                        resolve(result.response);
                    } else {
                        resolve(null);
                    }
                };
                
                request.onerror = () => resolve(null);
            };
            
            request.onerror = () => resolve(null);
        });
    } catch (error) {
        return null;
    }
}

async function setCachedQueryLocal(pdfId, query, response) {
    try {
        const dbName = 'samir_query_cache';
        const request = indexedDB.open(dbName, 1);
        
        request.onupgradeneeded = (event) => {
            const db = event.target.result;
            if (!db.objectStoreNames.contains('cache')) {
                const objectStore = db.createObjectStore('cache', { keyPath: ['pdfId', 'queryHash'] });
                objectStore.createIndex('expiresAt', 'expiresAt', { unique: false });
            }
        };
        
        return new Promise((resolve, reject) => {
            request.onsuccess = (event) => {
                const db = event.target.result;
                const transaction = db.transaction(['cache'], 'readwrite');
                const store = transaction.objectStore('cache');
                
                const expiresAt = new Date();
                expiresAt.setDate(expiresAt.getDate() + 7);
                
                const queryHash = hashQuery(query, pdfId);
                store.put({
                    pdfId,
                    queryHash,
                    query: query.substring(0, 500),
                    response,
                    expiresAt: expiresAt.toISOString()
                });
                
                transaction.oncomplete = () => resolve();
                transaction.onerror = () => resolve(); // Don't fail on cache errors
            };
            
            request.onerror = () => resolve();
        });
    } catch (error) {
        // Silent fail - caching is optional
    }
}

