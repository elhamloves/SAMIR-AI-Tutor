/**
 * Language Detection Utility
 * Detects if user message is in Arabic or English
 */

/**
 * Detect language from text
 * Returns 'ar' for Arabic, 'en' for English (default)
 */
export function detectLanguage(text) {
    if (!text || typeof text !== 'string') return 'en';
    
    const trimmed = text.trim();
    if (trimmed.length === 0) return 'en';
    
    // Arabic Unicode range: U+0600 to U+06FF
    const arabicRegex = /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF]/;
    
    // Check if text contains Arabic characters
    const hasArabic = arabicRegex.test(trimmed);
    
    // Count Arabic vs English characters
    const arabicChars = (trimmed.match(/[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF]/g) || []).length;
    const englishChars = (trimmed.match(/[a-zA-Z]/g) || []).length;
    
    // If significant Arabic content, return Arabic
    if (hasArabic && arabicChars > 2) {
        return 'ar';
    }
    
    // Default to English
    return 'en';
}

/**
 * Get response language based on user query
 */
export function getResponseLanguage(userQuery) {
    return detectLanguage(userQuery);
}

