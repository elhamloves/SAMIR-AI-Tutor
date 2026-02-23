/**
 * WebLLM RAG Service - Optimized for Small Models
 * Handles chunking and retrieval specifically for WebLLM/TinyLlama
 * Uses smaller chunks (500-1000 chars) and strict context enforcement
 */

import { retrievePDFChunks, searchPDFChunks } from './pdfChunksService';
import { embeddingsService } from './embeddingsService';
import { estimateTokens, trimChunksToTokenLimit, getTokenLimit } from './tokenCounter';

/**
 * Get optimized chunks for WebLLM/TinyLlama (smaller, more focused)
 */
export async function getWebLLMChunks(userId, pdfId, query, modelType = 'webllm') {
    // WebLLM models need smaller chunks
    const maxChunkSize = 800; // ~800 characters = ~200 tokens (smaller for TinyLlama)
    const topK = 3; // Get only top 3 most relevant chunks (TinyLlama has limited context)
    
    console.log(`🔍 Retrieving chunks for WebLLM (max ${maxChunkSize} chars, top ${topK})`);
    
    // Step 1: Try embeddings-based retrieval (best quality)
    let chunks = [];
    try {
        await embeddingsService.initialize();
        
        // Get more chunks initially for better selection
        const allChunks = await retrievePDFChunks(userId, pdfId, 50);
        
        if (allChunks.length > 0) {
            // Use embeddings to find most relevant chunks
            const relevantChunks = await embeddingsService.findSimilarChunks(query, allChunks, topK * 2);
            
            if (relevantChunks && relevantChunks.length > 0) {
                // Truncate chunks to max size
                chunks = relevantChunks.slice(0, topK).map(chunk => ({
                    ...chunk,
                    text: chunk.text?.substring(0, maxChunkSize) || chunk.text || ''
                }));
                console.log(`✅ Retrieved ${chunks.length} chunks using embeddings`);
            }
        }
    } catch (embedError) {
        console.warn('Embeddings retrieval failed, using keyword search:', embedError);
    }
    
    // Step 2: Fallback to keyword search
    if (chunks.length === 0) {
        try {
            chunks = await searchPDFChunks(userId, pdfId, query, topK);
            
            // Truncate chunks to max size
            chunks = chunks.map(chunk => ({
                ...chunk,
                text: chunk.text?.substring(0, maxChunkSize) || chunk.text || ''
            }));
            console.log(`✅ Retrieved ${chunks.length} chunks using keyword search`);
        } catch (searchError) {
            console.warn('Keyword search failed, getting any chunks:', searchError);
        }
    }
    
    // Step 3: Final fallback - get any chunks
    if (chunks.length === 0) {
        const allChunks = await retrievePDFChunks(userId, pdfId, topK);
        chunks = allChunks.map(chunk => ({
            ...chunk,
            text: chunk.text?.substring(0, maxChunkSize) || chunk.text || ''
        }));
        console.log(`✅ Retrieved ${chunks.length} chunks (fallback)`);
    }
    
    return chunks;
}

/**
 * Build strict prompt for WebLLM/TinyLlama with retrieved chunks
 * Very explicit instructions to prevent hallucination
 */
export function buildWebLLMPrompt(chunks, userQuery, pdfFileName, modelType = 'webllm') {
    if (!chunks || chunks.length === 0) {
        return {
            system: `You are an AI tutor. You cannot answer because no content was found in the document "${pdfFileName}". Tell the user you cannot find relevant information.`,
            user: userQuery
        };
    }
    
    // Format chunks with clear markers
    const chunksText = chunks.map((chunk, idx) => {
        let chunkText = `[CHUNK ${idx + 1}]`;
        
        // Add section title if available
        if (chunk.section_title) {
            chunkText += ` Section: ${chunk.section_title}`;
        }
        
        // Add page numbers if available
        if (chunk.page_start) {
            chunkText += ` (Page ${chunk.page_start}`;
            if (chunk.page_end && chunk.page_end !== chunk.page_start) {
                chunkText += `-${chunk.page_end}`;
            }
            chunkText += ')';
        }
        
        chunkText += '\n' + (chunk.text || chunk.chunk_text || '').trim();
        return chunkText;
    }).join('\n\n');
    
    // Very strict system prompt for small models
    const systemPrompt = `You are an AI tutor helping a student understand a PDF document: "${pdfFileName}".

CRITICAL RULES - FOLLOW EXACTLY:
1. You MUST ONLY use information from the CHUNKS provided below
2. DO NOT make up information, facts, or details
3. If the answer is NOT in the chunks, say: "I cannot find this information in the document."
4. DO NOT use general knowledge - only use what's in the chunks
5. Quote or reference specific parts from the chunks when possible

DOCUMENT CHUNKS FROM "${pdfFileName}":
${chunksText}

Remember: ONLY use information from the chunks above. Do not guess or make up answers.`;

    return {
        system: systemPrompt,
        user: userQuery
    };
}

/**
 * Format chunks with metadata for better context
 */
export function formatChunkWithMetadata(chunk) {
    let formatted = '';
    
    if (chunk.section_title) {
        formatted += `[Section: ${chunk.section_title}]\n`;
    }
    
    if (chunk.page_start) {
        formatted += `[Page ${chunk.page_start}`;
        if (chunk.page_end && chunk.page_end !== chunk.page_start) {
            formatted += `-${chunk.page_end}`;
        }
        formatted += ']\n';
    }
    
    formatted += chunk.text || chunk.chunk_text || '';
    return formatted;
}

/**
 * Get chunks and build prompt for WebLLM in one call
 */
export async function getWebLLMPromptForQuery(userId, pdfId, pdfFileName, userQuery, modelType = 'webllm') {
    // Get optimized chunks for WebLLM
    const chunks = await getWebLLMChunks(userId, pdfId, userQuery, modelType);
    
    // Build strict prompt
    const prompt = buildWebLLMPrompt(chunks, userQuery, pdfFileName, modelType);
    
    // Get token limit for model
    const maxTokens = getTokenLimit(modelType);
    
    // Estimate tokens
    const systemTokens = estimateTokens(prompt.system);
    const userTokens = estimateTokens(prompt.user);
    const totalTokens = systemTokens + userTokens;
    
    console.log(`📊 WebLLM prompt tokens: system=${systemTokens}, user=${userTokens}, total=${totalTokens} (limit=${maxTokens})`);
    
    // Trim if needed
    if (totalTokens > maxTokens) {
        console.warn(`⚠️ Prompt too long (${totalTokens} > ${maxTokens}), trimming...`);
        // Trim system prompt (chunks)
        const availableTokens = maxTokens - userTokens - 200; // Reserve for response
        prompt.system = trimChunksToLimit(prompt.system, availableTokens);
    }
    
    return prompt;
}

/**
 * Trim chunks in prompt to fit token limit
 */
function trimChunksToLimit(systemPrompt, maxTokens) {
    // Extract chunks section
    const chunksMatch = systemPrompt.match(/DOCUMENT CHUNKS FROM[:\s\S]+?(?=Remember:)/);
    if (!chunksMatch) return systemPrompt;
    
    const chunksSection = chunksMatch[0];
    const beforeChunks = systemPrompt.substring(0, systemPrompt.indexOf('DOCUMENT CHUNKS FROM'));
    const afterChunks = systemPrompt.substring(systemPrompt.indexOf('Remember:'));
    
    // Estimate tokens and trim chunks section
    const chunksTokens = estimateTokens(chunksSection);
    if (chunksTokens <= maxTokens) return systemPrompt;
    
    // Trim chunks section proportionally
    const trimRatio = maxTokens / chunksTokens;
    const trimmedChunks = chunksSection.substring(0, Math.floor(chunksSection.length * trimRatio));
    
    return beforeChunks + trimmedChunks + '\n\n' + afterChunks;
}

