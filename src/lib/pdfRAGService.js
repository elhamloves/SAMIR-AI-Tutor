/**
 * PDF RAG Service - Retrieves and formats PDF chunks for LLM prompts
 * Ensures accurate, non-hallucinated responses by using only PDF content
 */

import { retrievePDFChunks, searchPDFChunks } from './pdfChunksService';
import { embeddingsService } from './embeddingsService';

/**
 * Retrieve relevant PDF chunks for a user query
 * Tries multiple strategies: database keyword search → embeddings → keyword fallback
 * ALWAYS includes the first chunk (metadata + page 1) for metadata queries
 */
export async function getRelevantChunksForQuery(userId, pdfId, query, topK = 5) {
    if (!userId || !pdfId || !query) {
        console.warn('Missing required parameters for chunk retrieval');
        return [];
    }
    
    let chunks = [];
    let firstChunk = null;
    
    // Always retrieve the first chunk (chunkId 0) which contains metadata + page 1
    try {
        const allChunks = await retrievePDFChunks(userId, pdfId, 1);
        if (allChunks && allChunks.length > 0 && (allChunks[0].chunkId === 0 || allChunks[0].chunk_id === 0)) {
            firstChunk = {
                text: allChunks[0].text || allChunks[0].chunk_text || '',
                chunkId: allChunks[0].chunkId || allChunks[0].chunk_id || 0
            };
            console.log('📄 First chunk (metadata + page 1) retrieved for metadata queries');
        }
    } catch (error) {
        console.warn('Could not retrieve first chunk:', error);
    }
    
    // Strategy 1: Try database keyword search (fast, works for logged-in users)
    if (userId && !userId.startsWith('guest-')) {
        try {
            chunks = await searchPDFChunks(userId, pdfId, query, topK);
            if (chunks && chunks.length > 0) {
                console.log(`✅ Retrieved ${chunks.length} chunks from database (keyword search)`);
                // Ensure first chunk is included if not already present
                const hasFirstChunk = chunks.some(c => (c.chunkId === 0 || c.chunk_id === 0));
                if (!hasFirstChunk && firstChunk) {
                    chunks = [firstChunk, ...chunks];
                }
                return chunks;
            }
        } catch (dbError) {
            console.warn('Database search failed, trying embeddings:', dbError);
        }
    }
    
    // Strategy 2: Try embeddings-based search (better semantic matching)
    try {
        await embeddingsService.initialize();
        const allChunks = await retrievePDFChunks(userId, pdfId, 100); // Get more chunks for embedding search
        
        if (allChunks && allChunks.length > 0) {
            const relevantChunks = await embeddingsService.findSimilarChunks(query, allChunks, topK);
            if (relevantChunks && relevantChunks.length > 0) {
                console.log(`✅ Retrieved ${relevantChunks.length} chunks using embeddings`);
                const result = relevantChunks.map(c => ({ 
                    text: c.text || c.chunk_text || '', 
                    chunkId: c.chunkId || c.chunk_id || 0 
                }));
                // Ensure first chunk is included
                const hasFirstChunk = result.some(c => c.chunkId === 0);
                if (!hasFirstChunk && firstChunk) {
                    return [firstChunk, ...result];
                }
                return result;
            }
        }
    } catch (embedError) {
        console.warn('Embeddings search failed, using keyword fallback:', embedError);
    }
    
    // Strategy 3: Simple keyword matching fallback
    try {
        const allChunks = await retrievePDFChunks(userId, pdfId, 50);
        if (allChunks && allChunks.length > 0) {
            const queryWords = query.toLowerCase().split(/\s+/).filter(w => w.length > 2);
            const scored = allChunks.map(chunk => {
                const chunkText = (chunk.text || chunk.chunk_text || '').toLowerCase();
                const score = queryWords.reduce((sum, word) => {
                    return sum + (chunkText.match(new RegExp(word, 'g')) || []).length;
                }, 0);
                return { ...chunk, score };
            });
            
            const topChunks = scored
                .filter(c => c.score > 0)
                .sort((a, b) => b.score - a.score)
                .slice(0, topK)
                .map(c => ({ 
                    text: c.text || c.chunk_text || '', 
                    chunkId: c.chunkId || c.chunk_id || 0 
                }));
            
            if (topChunks.length > 0) {
                console.log(`✅ Retrieved ${topChunks.length} chunks using keyword matching`);
                // Ensure first chunk is included
                const hasFirstChunk = topChunks.some(c => c.chunkId === 0);
                if (!hasFirstChunk && firstChunk) {
                    return [firstChunk, ...topChunks];
                }
                return topChunks;
            }
        }
    } catch (error) {
        console.error('Keyword fallback failed:', error);
    }
    
    // Strategy 4: Return first few chunks if all else fails (at least provide some context)
    try {
        const allChunks = await retrievePDFChunks(userId, pdfId, topK);
        if (allChunks && allChunks.length > 0) {
            console.warn(`⚠️ No relevant chunks found, returning first ${allChunks.length} chunks as fallback`);
            return allChunks.map(c => ({ 
                text: c.text || c.chunk_text || '', 
                chunkId: c.chunkId || c.chunk_id || 0 
            }));
        }
    } catch (error) {
        console.error('Final fallback failed:', error);
    }
    
    // If we have at least the first chunk, return it
    if (firstChunk) {
        console.log('⚠️ Only returning first chunk (metadata + page 1)');
        return [firstChunk];
    }
    
    // If we have at least the first chunk, return it
    if (firstChunk) {
        console.log('⚠️ Only returning first chunk (metadata + page 1)');
        return [firstChunk];
    }
    
    console.warn('⚠️ No PDF chunks available for query');
    return [];
}

/**
 * Build a strict prompt that uses ONLY PDF chunks
 * Designed to prevent hallucinations by explicitly restricting the LLM
 */
export function buildPDFPrompt(chunks, userQuery, pdfFileName, mode = 'tutor') {
    if (!chunks || chunks.length === 0) {
        return `I cannot answer your question because no relevant content was found in the uploaded document "${pdfFileName}". Please try rephrasing your question or upload a document that contains relevant information.`;
    }
    
    // Format chunks with clear section markers
    const chunksText = chunks.map((chunk, idx) => {
        return `[SECTION ${idx + 1}]\n${chunk.text.trim()}\n`;
    }).join('\n');
    
    // Strict instructions to prevent hallucinations
    const baseInstructions = `You are an AI assistant helping a student understand a document. 

CRITICAL RULES:
1. You MUST ONLY use information from the PDF sections provided below.
2. If the answer is not in the provided sections, say "I cannot find this information in the document. Please rephrase your question or check if the relevant section was uploaded."
3. DO NOT make up information, dates, numbers, or facts not explicitly stated in the PDF.
4. DO NOT use general knowledge unless it's directly related to clarifying the PDF content.
5. If asked about something not in the PDF, clearly state that it's not in the provided sections.

DOCUMENT: "${pdfFileName}"
USER QUESTION: "${userQuery}"

RELEVANT PDF SECTIONS:
${chunksText}

INSTRUCTIONS:
- Answer the user's question using ONLY the information from the sections above.
- Be accurate and factual.
- If the question cannot be answered from the provided sections, say so explicitly.
- Provide specific quotes or references from the sections when relevant.`;
    
    if (mode === 'detective') {
        return baseInstructions + `\n\n[GAME MODE] You are giving clues for a "Hidden Item Search" game. Guide the student to find specific information in the document without directly stating it.`;
    }
    
    return baseInstructions;
}

/**
 * Format chunks for WebLLM message format
 */
export function formatChunksForWebLLM(chunks, maxTokens = 3000) {
    if (!chunks || chunks.length === 0) return '';
    
    // Estimate tokens (roughly 4 characters per token)
    let formattedText = '';
    const maxChars = maxTokens * 4;
    
    for (const chunk of chunks) {
        const chunkText = `[Section]\n${chunk.text.trim()}\n\n`;
        if ((formattedText + chunkText).length > maxChars) {
            break; // Stop if adding this chunk would exceed token limit
        }
        formattedText += chunkText;
    }
    
    return formattedText.trim();
}

/**
 * Validate that response is based on provided chunks
 * Simple check - can be enhanced with more sophisticated validation
 */
export function validateResponseUsesChunks(response, chunks) {
    if (!chunks || chunks.length === 0) return false;
    
    // Check if response contains phrases that indicate it's not using the PDF
    const rejectionPhrases = [
        'i cannot find',
        'not in the document',
        'not provided',
        'not available in'
    ];
    
    const lowerResponse = response.toLowerCase();
    const hasRejectionPhrase = rejectionPhrases.some(phrase => 
        lowerResponse.includes(phrase)
    );
    
    // If response explicitly says it can't find info, that's actually good (honest)
    if (hasRejectionPhrase) return true;
    
    // Simple validation: Check if response contains words from chunks
    // This is a basic check - can be improved
    const chunkWords = new Set();
    chunks.forEach(chunk => {
        const words = chunk.text.toLowerCase().split(/\s+/);
        words.forEach(w => {
            if (w.length > 4) chunkWords.add(w); // Only longer words to reduce false positives
        });
    });
    
    const responseWords = new Set(response.toLowerCase().split(/\s+/));
    const overlap = Array.from(chunkWords).filter(w => responseWords.has(w));
    
    // If at least 5% of chunk words appear in response, consider it valid
    return overlap.length > chunkWords.size * 0.05;
}

