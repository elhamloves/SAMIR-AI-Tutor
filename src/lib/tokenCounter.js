/**
 * Token Counter Utility
 * Estimates tokens to ensure we stay within model limits
 */

/**
 * Rough estimate: ~4 characters per token (conservative estimate)
 * Actual ratio varies but this ensures we stay under limits
 */
const CHARS_PER_TOKEN = 4;

/**
 * Estimate token count from text
 */
export function estimateTokens(text) {
    if (!text) return 0;
    return Math.ceil(text.length / CHARS_PER_TOKEN);
}

/**
 * Get safe token limits for different models
 */
export function getTokenLimit(model = 'default') {
    const limits = {
        'default': 6000,        // Safe default (well under 8192)
        'huggingface': 6000,    // HuggingFace models typically 8192
        'webllm': 3000,         // WebLLM/TinyLlama typically 4096
        'openai-gpt4': 7000,    // GPT-4 typically 8192
        'llama': 6000,          // Llama models typically 4096-8192
    };
    
    return limits[model] || limits.default;
}

/**
 * Trim text to fit within token limit
 */
export function trimToTokenLimit(text, maxTokens, suffix = '...') {
    if (!text) return '';
    
    const estimatedTokens = estimateTokens(text);
    if (estimatedTokens <= maxTokens) {
        return text;
    }
    
    // Calculate how many characters we can use
    const maxChars = maxTokens * CHARS_PER_TOKEN - suffix.length;
    return text.substring(0, maxChars) + suffix;
}

/**
 * Calculate how many chunks can fit within token limit
 */
export function calculateMaxChunks(chunks, maxTokens, queryTokens = 500) {
    const availableTokens = maxTokens - queryTokens - 500; // Reserve for system prompt and response
    let totalTokens = 0;
    let maxChunks = 0;
    
    for (const chunk of chunks) {
        const chunkTokens = estimateTokens(chunk.text || '');
        if (totalTokens + chunkTokens > availableTokens) {
            break;
        }
        totalTokens += chunkTokens;
        maxChunks++;
    }
    
    return maxChunks;
}

/**
 * Trim chunks to fit within token limit
 */
export function trimChunksToTokenLimit(chunks, maxTokens, queryTokens = 500) {
    if (!chunks || chunks.length === 0) return [];
    
    const availableTokens = maxTokens - queryTokens - 500; // Reserve for system prompt and response
    const trimmedChunks = [];
    let totalTokens = 0;
    
    for (const chunk of chunks) {
        const chunkText = chunk.text || '';
        const chunkTokens = estimateTokens(chunkText);
        
        if (totalTokens + chunkTokens > availableTokens) {
            // Try to fit partial chunk
            const remainingTokens = availableTokens - totalTokens;
            if (remainingTokens > 100) { // Only if significant space left
                const trimmedText = trimToTokenLimit(chunkText, remainingTokens);
                trimmedChunks.push({
                    ...chunk,
                    text: trimmedText,
                    truncated: true
                });
            }
            break;
        }
        
        trimmedChunks.push(chunk);
        totalTokens += chunkTokens;
    }
    
    return trimmedChunks;
}

