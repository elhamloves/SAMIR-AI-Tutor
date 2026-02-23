/**
 * Strict PDF Chat Service with Arabic/English Support
 * Implements mega-prompt requirements: strict anti-hallucination, language detection
 */

import { getRelevantChunksForQuery } from './pdfRAGService';
import { retrievePDFChunks } from './pdfChunksService';
import { trimChunksToTokenLimit, estimateTokens, getTokenLimit } from './tokenCounter';
import { detectLanguage } from './languageDetector';

/**
 * Get strict PDF prompt with Arabic/English support
 * Prevents ALL hallucinations per mega-prompt requirements
 */
export async function getStrictPDFPrompt(userId, pdfId, pdfFileName, userQuery, useChunks = true, modelType = 'webllm') {
    // Detect user language
    const userLang = detectLanguage(userQuery);
    const isArabic = userLang === 'ar';
    
    // Check if it's a summary request
    const isSummaryRequest = userQuery.toLowerCase().includes('summar') || 
                            userQuery.toLowerCase().includes('main idea') ||
                            userQuery.toLowerCase().includes('overview') ||
                            userQuery.toLowerCase().includes('what is this about') ||
                            userQuery.includes('تلخيص') ||
                            userQuery.includes('ملخص');
    
    // Get relevant chunks
    let chunks = [];
    
    if (useChunks) {
        if (isSummaryRequest && (userQuery.toLowerCase().includes('entire') || userQuery.toLowerCase().includes('full'))) {
            chunks = await retrievePDFChunks(userId, pdfId, 100);
        } else {
            chunks = await getRelevantChunksForQuery(userId, pdfId, userQuery, isSummaryRequest ? 10 : 5);
        }
    }
    
    // Fallback if no chunks
    if (chunks.length === 0) {
        console.warn('No relevant chunks found, trying to get any chunks...');
        chunks = await retrievePDFChunks(userId, pdfId, 5);
    }
    
    // Get token limit
    const maxTokens = getTokenLimit(modelType);
    console.log(`📊 Token limit for ${modelType}: ${maxTokens} tokens`);
    
    // Estimate tokens and trim if needed
    const chunkTokens = chunks.reduce((sum, c) => sum + estimateTokens(c.text || c.chunk_text || ''), 0);
    const queryTokens = estimateTokens(userQuery);
    const totalTokens = chunkTokens + queryTokens + 500;
    
    console.log(`📊 Estimated tokens: chunks=${chunkTokens}, query=${queryTokens}, total=${totalTokens}`);
    
    if (totalTokens > maxTokens) {
        console.warn(`⚠️ Total tokens (${totalTokens}) exceeds limit (${maxTokens}), trimming chunks...`);
        const availableTokens = maxTokens - queryTokens - 500 - 1000;
        chunks = trimChunksToTokenLimit(chunks, availableTokens, queryTokens);
    }
    
    // Build prompt based on language and request type
    if (isSummaryRequest) {
        return buildSummaryPrompt(chunks, pdfFileName, maxTokens, isArabic);
    } else {
        return buildStrictPDFPrompt(chunks, userQuery, pdfFileName, maxTokens, isArabic);
    }
}

/**
 * Build strict prompt with anti-hallucination rules
 */
function buildStrictPDFPrompt(chunks, userQuery, pdfFileName, maxTokens, isArabic) {
    if (!chunks || chunks.length === 0) {
        if (isArabic) {
            return {
                system: `أنت مساعد ذكي. يجب أن تخبر المستخدم أنك لا تجد معلومات ذات صلة في الوثيقة "${pdfFileName}". لا تخترع معلومات.`,
                user: userQuery
            };
        }
        return {
            system: `You are an AI tutor. You MUST tell the user that you cannot find relevant information in their uploaded document "${pdfFileName}". Do not make up information.`,
            user: userQuery
        };
    }
    
    // Format chunks
    const chunksText = chunks.map((chunk, idx) => {
        let chunkText = `=== SECTION ${idx + 1} ===\n`;
        if (chunk.page_start) {
            chunkText += `[Page ${chunk.page_start}`;
            if (chunk.page_end && chunk.page_end !== chunk.page_start) {
                chunkText += `-${chunk.page_end}`;
            }
            chunkText += ']\n';
        }
        if (chunk.section_title) {
            chunkText += `[Section: ${chunk.section_title}]\n`;
        }
        chunkText += `${(chunk.text || chunk.chunk_text || '').trim()}\n`;
        return chunkText;
    }).join('\n');
    
    // Build strict system prompt (Arabic or English)
    let systemPrompt;
    
    if (isArabic) {
        systemPrompt = `أنت مساعد ذكي يساعد طالبًا في فهم وثيقة PDF المرفوعة: "${pdfFileName}".

قواعد حرجة - يجب اتباعها بدقة:

1. يمكنك استخدام المعلومات من المقاطع المرفوعة أدناه فقط
2. لا تستخدم أي معرفة عامة أو حقائق غير موجودة في المقاطع المرفوعة
3. لا تخترع تواريخ أو أرقام أو أسماء أو حقائق
4. إذا لم تكن الإجابة في المقاطع المرفوعة، يجب أن تقول بوضوح: "غير موجود داخل ملف الـPDF"
5. عند الإجابة، اقتبس أو أشر إلى أجزاء محددة من المقاطع أدناه
6. كن دقيقًا وواقعيًا - استند إلى محتوى PDF فقط

مقاطع PDF من "${pdfFileName}":
${chunksText}
نهاية مقاطع PDF

تذكر: استخدم المعلومات من المقاطع أعلاه فقط. لا تستخدم معرفة عامة.`;
    } else {
        systemPrompt = `You are an AI tutor helping a student understand their uploaded PDF document: "${pdfFileName}".

CRITICAL RULES - YOU MUST FOLLOW THESE EXACTLY:

1. YOU CAN ONLY USE INFORMATION FROM THE PDF SECTIONS PROVIDED BELOW
2. DO NOT use any general knowledge, facts, or information not explicitly stated in the PDF sections
3. DO NOT make up dates, numbers, names, or facts
4. If the answer is NOT in the provided PDF sections, you MUST say: "I cannot find this information in the uploaded document. Please try rephrasing your question or check if the document contains this information."
5. When you answer, quote or reference specific parts from the PDF sections below
6. Be factual and accurate - base everything on the PDF content only

PDF SECTIONS FROM "${pdfFileName}":
${chunksText}
END OF PDF SECTIONS

Remember: ONLY use information from the sections above. Do not use general knowledge.`;
    }
    
    return {
        system: systemPrompt,
        user: userQuery
    };
}

/**
 * Build summary prompt with anti-hallucination
 */
function buildSummaryPrompt(chunks, pdfFileName, maxTokens, isArabic) {
    if (!chunks || chunks.length === 0) {
        if (isArabic) {
            return {
                system: `أنت مساعد ذكي. لا يمكنك تلخيص لأنه لم يتم العثور على محتوى في "${pdfFileName}".`,
                user: "الرجاء تلخيص الوثيقة."
            };
        }
        return {
            system: `You are an AI tutor. You cannot summarize because no content was found in "${pdfFileName}".`,
            user: "Please summarize the document."
        };
    }
    
    // Format chunks
    const chunksText = chunks.map((chunk, idx) => {
        let chunkText = `=== SECTION ${idx + 1} ===\n`;
        if (chunk.page_start) chunkText += `[Page ${chunk.page_start}]\n`;
        if (chunk.section_title) chunkText += `[Section: ${chunk.section_title}]\n`;
        chunkText += `${(chunk.text || chunk.chunk_text || '').trim()}\n`;
        return chunkText;
    }).join('\n');
    
    let systemPrompt;
    
    if (isArabic) {
        systemPrompt = `المطلوب: تلخيص ملف PDF بدقة اعتمادًا فقط على المقاطع المسترجعة.

قواعد مهمة:
- استخدم اللغة العربية
- التزم تمامًا بنص المقاطع المسترجعة
- امنع اختراع أو تخمين أي معلومة غير موجودة
- حافظ على أسماء المؤلفين كما هي
- وضّح رقم الصفحة لكل معلومة مهمة إن كانت موجودة
- اذكر الأقسام الرئيسية، الجداول، الأشكال، النتائج، المناهج، الخاتمة

إذا كانت المعلومة غير موجودة في المقاطع المسترجعة، قل: "غير موجود داخل ملف الـPDF"

محتوى PDF من "${pdfFileName}":
${chunksText}

قم بتلخيص المحتوى أعلاه بدقة، مع التركيز على النقاط الرئيسية فقط من المقاطع المرفوعة.`;
    } else {
        systemPrompt = `You are an AI tutor. Summarize the following content from the PDF "${pdfFileName}".

IMPORTANT:
- Only summarize what is in the sections below
- Do not add information that is not in the sections
- Create a clear, structured summary with main points
- Use bullet points for clarity
- Preserve author names, page numbers, and citations exactly as in the PDF

If information is not in the retrieved sections, say: "I cannot find this information in the uploaded document."

PDF CONTENT:
${chunksText}
END OF PDF CONTENT

Provide a summary of the content above, focusing only on main points from the provided sections.`;
    }
    
    return {
        system: systemPrompt,
        user: isArabic ? "الرجاء تلخيص هذا المستند مع الأفكار الرئيسية والنقاط الأساسية." : "Please provide a summary of this document with main ideas and bullet points."
    };
}

/**
 * Format prompt for WebLLM message format
 */
export function formatForWebLLM(strictPrompt) {
    if (!strictPrompt || !strictPrompt.system) {
        return [
            { role: 'system', content: 'You are an AI tutor. You must only use information from the provided PDF.' },
            { role: 'user', content: 'Please help me.' }
        ];
    }
    
    return [
        { role: 'system', content: strictPrompt.system },
        { role: 'user', content: strictPrompt.user || 'Please answer my question.' }
    ];
}

/**
 * Validate that chunks exist before proceeding
 */
export async function validatePDFChunksExist(userId, pdfId) {
    try {
        const chunks = await retrievePDFChunks(userId, pdfId, 1);
        return chunks && chunks.length > 0;
    } catch (error) {
        console.error('Error validating PDF chunks:', error);
        return false;
    }
}

