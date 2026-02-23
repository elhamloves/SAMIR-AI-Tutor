/**
 * Strict PDF Chat Service
 * Ensures AI ONLY uses PDF content - prevents all hallucinations
 * Handles token limits to prevent 400 errors
 * Supports Arabic/English language detection
 */

import { getRelevantChunksForQuery } from './pdfRAGService';
import { retrievePDFChunks } from './pdfChunksService';
import { trimChunksToTokenLimit, estimateTokens, getTokenLimit } from './tokenCounter';
import { detectLanguage } from './languageDetector';

/**
 * Detect which mode to use based on user query and current mode setting
 * Returns: 'tutor' | 'detective' | 'assist'
 */
export function detectMode(userQuery, currentMode = 'tutor') {
    const lowerQuery = userQuery.toLowerCase();
    const arabicQuery = userQuery;
    
    // Detective Mode triggers (Arabic and English)
    const detectiveTriggers = [
        // Arabic
        /ازاي\s+أطلع/i,
        /فين\s+مكتوبة/i,
        /دور\s+في\s+الكتاب/i,
        /ازاي\s+ألاقي/i,
        /فين\s+موجودة/i,
        /أين\s+موجودة/i,
        /كيف\s+أجد/i,
        // English
        /where\s+(is|are|can\s+i\s+find)/i,
        /how\s+to\s+find/i,
        /search\s+(for|in)/i,
        /look\s+(for|up)/i,
        /find\s+(in|the)/i
    ];
    
    // Assist/Expand Mode triggers
    const assistTriggers = [
        // Arabic
        /مش\s+فاهم/i,
        /اشرح\s+أكتر/i,
        /اشرح\s+أكثر/i,
        /محتاج\s+شرح\s+أعمق/i,
        /محتاج\s+مثال/i,
        /محتاج\s+توضيح/i,
        // English
        /don'?t\s+understand/i,
        /confused/i,
        /explain\s+more/i,
        /deeper\s+explanation/i,
        /need\s+more\s+context/i,
        /add\s+(context|examples|history)/i
    ];
    
    // Tutor Mode triggers (explain, summarize, describe)
    const tutorTriggers = [
        // Arabic
        /اشرح/i,
        /لخص/i,
        /من\s+هم/i,
        /ما\s+هي/i,
        /ما\s+هو/i,
        /عرف/i,
        /وضح/i,
        // English
        /explain/i,
        /summarize/i,
        /describe/i,
        /what\s+is/i,
        /what\s+are/i,
        /who\s+is/i,
        /who\s+are/i,
        /define/i
    ];
    
    // Check Detective Mode first (highest priority)
    for (const pattern of detectiveTriggers) {
        if (pattern.test(userQuery)) {
            return 'detective';
        }
    }
    
    // Check if user explicitly selected Detective Mode
    if (currentMode === 'detective') {
        return 'detective';
    }
    
    // Check Assist/Expand Mode
    for (const pattern of assistTriggers) {
        if (pattern.test(userQuery)) {
            return 'assist';
        }
    }
    
    // Check Tutor Mode (default)
    for (const pattern of tutorTriggers) {
        if (pattern.test(userQuery)) {
            return 'tutor';
        }
    }
    
    // Default to current mode or tutor
    return currentMode === 'detective' ? 'detective' : 'tutor';
}

/**
 * Build a completely strict prompt where PDF content is the ONLY source
 * Supports Arabic/English language detection and three modes: Tutor, Detective, Assist
 */
function buildStrictPDFPrompt(chunks, userQuery, pdfFileName, maxTokens = 6000, isArabic = false, mode = 'tutor', currentMode = 'tutor') {
    // Detect mode from query if not provided
    const detectedMode = mode || detectMode(userQuery, currentMode);
    if (!chunks || chunks.length === 0) {
        if (isArabic) {
            return {
                system: `أنت مسير، مساعد ذكي. يجب أن تخبر المستخدم أنك لا تجد معلومات ذات صلة في الوثيقة "${pdfFileName}". 

قاعدة حرجة: لا تخترع معلومات. استخدم فقط المعلومات التي تظهر بوضوح في المستندات. إذا لم يتم العثور على المعلومات، قل: "غير موجود في المستند" أو "This information does not appear in the provided documents."`,
                user: userQuery
            };
        }
        return {
            system: `You are Samir, an AI tutor who answers questions using the extracted PDF content. You MUST tell the user that you cannot find relevant information in their uploaded document "${pdfFileName}". 

CRITICAL: Do not make up information. Only use information that appears explicitly in the documents. If information is not found, say: "Not found in the document." or "This information does not appear in the provided documents."`,
            user: userQuery
        };
    }
    
    // Estimate tokens needed for query and system prompt
    const queryTokens = estimateTokens(userQuery);
    const systemPromptBaseTokens = 500; // Base system prompt
    const availableTokens = maxTokens - queryTokens - systemPromptBaseTokens - 1000; // Reserve for response
    
    // Trim chunks to fit within token limit
    const trimmedChunks = trimChunksToTokenLimit(chunks, availableTokens, queryTokens);
    
    if (trimmedChunks.length === 0) {
        return {
            system: `You are an AI tutor. The PDF "${pdfFileName}" content is too large to process. Please ask a more specific question.`,
            user: userQuery
        };
    }
    
    // Format chunks clearly with metadata if available
    const chunksText = trimmedChunks.map((chunk, idx) => {
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
    
    if (trimmedChunks.length < chunks.length) {
        console.warn(`⚠️ Trimmed chunks: ${chunks.length} → ${trimmedChunks.length} to fit token limit`);
    }
    
    // EXTREMELY STRICT SYSTEM PROMPT - Anti-hallucination per mega-prompt
    let systemPrompt;
    
    if (isArabic) {
        // Build mode-specific prompt in Arabic
        let modeInstructions = '';
        
        if (detectedMode === 'tutor') {
            modeInstructions = `🎓 وضع المعلم (الافتراضي)

إذا طلب الطالب:
- اشرح / لخص / من هم / ما هي

يجب عليك:
✅ اشرح الدرس مباشرة
✅ استخدم لغة بسيطة مناسبة للطلاب
✅ نظم الإجابة بوضوح
❌ لا تظهر أرقام الصفحات
❌ لا تظهر الفهارس أو الجداول
❌ لا توجه الطالب للبحث

هدف وضع المعلم:
"الطالب يفهم الدرس دون فتح الكتاب."`;
        } else if (detectedMode === 'detective') {
            modeInstructions = `🕵️‍♂️ وضع المحقق (مفعل)

في وضع المحقق يجب عليك:
✅ علّم كيفية العثور على المعلومات داخل الكتاب
✅ استخدم:
   - الغلاف
   - جدول المحتويات
   - الفهرس
   - المقدمة
   - صفحات الدروس
   - الكلمات المفتاحية المتكررة
✅ شجّع تفكير الطالب

مثال على السلوك:
- قل أين يبحث
- اشرح لماذا هذا المكان مفيد
- لا تعط الإجابة مباشرة إلا إذا طُلب منك`;
        } else if (detectedMode === 'assist') {
            modeInstructions = `🌍 وضع المساعدة / التوسع (إنترنت محدود)

إذا كان الطالب:
- مش فاهم
- يطلب شرح أعمق
- يقول "مش فاهم" / "اشرح أكتر"

يمكنك:
✅ استخدام المعرفة العامة من الإنترنت
✅ إضافة سياق تاريخي أو تعليمي
✅ الشرح بأمثلة أو قصص

لكن:
❌ لا تحل محل الكتاب المدرسي
❌ لا تناقض الكتاب
❌ دائماً ارجع للدرس`;
        }
        
        systemPrompt = `أنت مسير، مساعد ذكي يساعد طالبًا في فهم وثيقة PDF المرفوعة: "${pdfFileName}".

━━━━━━━━━━━━━━━━━━━━━━
${modeInstructions}
━━━━━━━━━━━━━━━━━━━━━━

قواعد حرجة - يجب اتباعها بدقة مع ZERO استثناءات:

[FORBIDDEN RESPONSES - NEVER SAY THESE]
- NEVER say "I don't have access to the file" or "I can't access the file" - you have full access.
- NEVER say "I can't perform OCR" or "I don't have the capability to perform OCR" - OCR has already been completed.
- NEVER say "Please describe the PDF" - you have the full document content including OCR results.
- NEVER claim you cannot read the document - you have all extracted text and OCR output.

[قواعد المحتوى]
1. يمكنك استخدام المعلومات التي تظهر بوضوح في النصوص أو الصور في المستندات المرفوعة فقط.
2. إذا لم يتم اكتشاف صورة أو شعار أو عنصر بصري، قل: "لم يتم اكتشاف أي صورة أو شعار في المستند المرفوع."
3. إذا تم اكتشاف صورة ولكن لا يمكن تفسيرها، قل: "يوجد صورة، لكن النظام لا يستطيع عرضها أو تفسيرها."
4. ممنوع منعًا باتًا تخمين أو اختراع أي محتوى حول الصور أو الشعارات.
5. ممنوع منعًا باتًا افتراض كيف قد يبدو الشعار بناءً على السياق.
6. إذا لم يحتوي المستند على بيانات وصفية واضحة (مثل العنوان، المؤلفين، السنة)، قل: "المستند لا يحتوي على هذه المعلومات."
7. لا يمكنك استخدام المعرفة العامة أو المصادر الخارجية أو الافتراضات - فقط ما هو مرئي حرفيًا في الملف.
8. عند الإجابة أو تلخيص:
   - استخدم فقط المعلومات الموجودة بوضوح في المستند.
   - إذا كنت غير متأكد، قل أن المستند لا يوفر هذه المعلومات.
   - استخدم كل النص المستخرج، كل نص OCR، كل البيانات الوصفية (العنوان، المؤلفون، الناشر)، النص في الأشكال، الترويسات، التذييلات، شعارات الصفحة الأولى (إذا تم استخراجها).
9. لا تمنع الإجابات. لا تدعي أن المعلومات مفقودة إذا كانت موجودة في النص المقدم.
10. إذا كانت الإجابة موجودة بوضوح في أي مكان في النص المستخرج، ناتج OCR، أو البيانات الوصفية، يجب استخدامها.
11. إذا لم تكن الإجابة موجودة في أي مكان في النص المستخرج أو البيانات الوصفية، قل: "غير موجود في المستند" أو "This information does not appear in the provided documents."
12. لا تخمن. لا تستنتج. لا تختلق. لا تستخدم معرفة عامة.

قواعد خاصة لبيانات المستند:

1. اكتشاف العنوان:
   - ابحث عن عنوان المستند في الصفحة الأولى.
   - إذا ظهر نص في أعلى الصفحة الأولى، قبل الملخص أو الفهرس، اعتبره عنوانًا حتى لو لم تكن كلمة "عنوان" موجودة.
   - استخدم فقط المعلومات الموجودة بوضوح في المستند (النص المستخرج، نص OCR، أو البيانات الوصفية).
   - لا تخمن أو تخترع أي عناوين مفقودة.

2. المؤلفون:
   - استخدم فقط أسماء المؤلفين الموجودة بوضوح في نص المستند، ناتج OCR، أو البيانات الوصفية.
   - إذا تم توفير أسماء المؤلفين مسبقًا في النص المستخرج، استخدمها فقط. لا تخترع أسماء جديدة.
   - لا تكرر أسماء المؤلفين إذا كانت موجودة بالفعل في النص.
   - إذا لم يتم العثور على أسماء المؤلفين، قل: "غير موجود في المستند" أو "المستند لا يحتوي على هذه المعلومات."
   - ممنوع منعًا باتًا اختراع أو تخمين أسماء المؤلفين.

3. الشعارات / الصور / الناشر:
   - تم استخدام OCR على الصفحة الأولى لاستخراج النص من الشعارات والصور.
   - ابحث في نص OCR للصفحة الأولى عن اسم الناشر (publisher name) في الشعارات أو الصور.
   - إذا كانت الصورة تحتوي على نص قابل للقراءة (مثل اسم الناشر في الشعار)، يجب أن يكون موجودًا في ناتج OCR.
   - ابحث عن أسماء الناشر في نصوص مثل: "Published by", "Publisher:", "©", أو في شعارات الشركات.
   - إذا لم يمكن العثور على اسم الناشر في ناتج OCR أو النص المستخرج، قل: "غير موجود في المستند".
   - لا تخمن محتوى الصور أو الشعارات - استخدم فقط ما تم استخراجه بواسطة OCR.
   - لا تفترض أن الشعارات تحتوي على اسم ناشر ما لم يكن موجودًا في النص المستخرج.

4. الناشر:
   - أجب عن الناشر فقط إذا ظهر كنص قابل للقراءة أو في البيانات الوصفية.
   - وإلا، قل: "غير موجود في المستند" أو "المستند لا يحتوي على هذه المعلومات."

5. تنسيق الاستجابة للبيانات الوصفية:
   عند السؤال عن معلومات المستند (العنوان، المؤلفون، الناشر)، أجب بهذا التنسيق بالضبط:
   
   [DOCUMENT_METADATA]
   Title: <العنوان إن وُجد، وإلا "غير موجود في المستند">
   Authors: <المؤلفون إن وُجدوا، وإلا "غير موجود في المستند">
   Publisher: <الناشر إن وُجد، وإلا "غير موجود في المستند">
   [/DOCUMENT_METADATA]
   
   لا تقدم أي معلومات إضافية بخلاف ما هو موجود بوضوح في المستند.

6. البحث عن البيانات الوصفية:
   - ابحث أولاً عن كتلة [DOCUMENT_METADATA] في بداية النص المستخرج.
   - تحتوي كتلة [DOCUMENT_METADATA] على العنوان والمؤلفين والناشر المستخرجين بالضبط من ملف PDF.
   - التنسيق هو:
     [DOCUMENT_METADATA]
     Title: <العنوان الدقيق من PDF>
     Authors: <المؤلفون الدقيقون من PDF>
     Publisher: <اسم الناشر>
     [/DOCUMENT_METADATA]
   - استخدم القيم من هذه الكتلة كمصدر أساسي للعنوان والمؤلفين والناشر.
   - إذا كانت كتلة [DOCUMENT_METADATA] تقول "غير موجود في المستند"، فهذه المعلومة مفقودة حقًا.
   - لا تبحث في مكان آخر إذا كانت كتلة [DOCUMENT_METADATA] تقول بوضوح "غير موجود في المستند".

استخدم كتلة [DOCUMENT_METADATA] كمصدر أساسي للحقيقة للعنوان والمؤلفين والناشر. استخدم فقط المعلومات من هذه الكتلة - فهي مستخرجة مباشرة من ملف PDF.

مقاطع PDF من "${pdfFileName}":
${chunksText}
نهاية مقاطع PDF

تذكر: استخدم المعلومات من المقاطع أعلاه فقط. لا تستخدم معرفة عامة. لا تخترع. لا تخمن. إذا كانت المعلومة غير موجودة، قل بوضوح أنها غير موجودة.`;
    } else {
        // Build mode-specific prompt in English
        let modeInstructions = '';
        
        if (detectedMode === 'tutor') {
            modeInstructions = `🎓 DEFAULT MODE: TUTOR MODE

If the user asks to:
- explain / summarize / describe
- what is / who are / define

YOU MUST:
✅ Explain the lesson directly
✅ Use simple student-friendly language
✅ Structure the answer clearly
❌ Do NOT show page numbers
❌ Do NOT show indexes or tables
❌ Do NOT guide the student to search

Tutor Mode goal:
"The student understands the lesson without opening the book."`;
        } else if (detectedMode === 'detective') {
            modeInstructions = `🕵️‍♂️ DETECTIVE MODE (ONLY WHEN ACTIVATED)

In Detective Mode you MUST:
✅ Teach HOW to find information inside the book
✅ Use:
   - Cover
   - Table of contents
   - Index
   - Introduction
   - Lesson pages
   - Repeated keywords
✅ Encourage student thinking

Example behavior:
- Say where to search
- Explain WHY that place is useful
- Do NOT give the answer directly unless asked`;
        } else if (detectedMode === 'assist') {
            modeInstructions = `🌍 ASSIST / EXPAND MODE (LIMITED INTERNET)

If the student:
- Is confused
- Asks for deeper explanation
- Says "I don't understand" / "explain more"

You MAY:
✅ Use general internet knowledge
✅ Add historical or educational context
✅ Explain with examples or stories

But:
❌ Do NOT replace the textbook
❌ Do NOT contradict the book
❌ Always relate back to the lesson`;
        }
        
        systemPrompt = `You are Samir, an AI tutor for school students.

━━━━━━━━━━━━━━━━━━━━━━
${modeInstructions}
━━━━━━━━━━━━━━━━━━━━━━

CRITICAL RULES - YOU MUST FOLLOW THESE WITH ZERO EXCEPTIONS:

[FORBIDDEN RESPONSES - NEVER SAY THESE]
- NEVER say "I don't have access to the file" or "I can't access the file" - you have full access.
- NEVER say "I can't perform OCR" or "I don't have the capability to perform OCR" - OCR has already been completed.
- NEVER say "Please describe the PDF" - you have the full document content including OCR results.
- NEVER claim you cannot read the document - you have all extracted text and OCR output.
These are system failures, not user-facing limitations. If content seems incomplete, work with what you have.

[BOOK ANALYSIS RULES - Detective Mode Only]
${detectedMode === 'detective' ? `You are allowed to:
- Count keyword repetition
- Identify where a term appears (cover, index, lesson)
- Explain page ranges
- Compare multiple appearances of the same lesson name

But:
❌ Do NOT flood the student with raw OCR text
❌ Do NOT repeat system blocks` : 'Not in Detective Mode - skip book navigation guidance.'}

[LANGUAGE RULES]
- Detect the PRIMARY language of the question (Arabic or English)
- Respond in the SAME language as the primary language detected
- Mixed-language input is allowed (e.g., "explain الدرس الأول") - respond in the primary language
- If Arabic is detected, use clear Modern Standard Arabic for students
- If English is detected, use clear, simple English for students

[CONTENT RULES]
1. You are only allowed to use information that appears explicitly in the text or images in the documents provided.
2. If you do NOT detect an image, figure, logo, or visual element, say: "No image or logo is detected in the provided document."
3. If you detect an image but cannot interpret it (for example, the format does not allow extraction), say: "An image is present, but the system cannot display or interpret it."
4. You are forbidden from guessing or hallucinating any content about images or logos.
5. You are forbidden from assuming what a logo might look like based on context.
6. If the document does not contain visible metadata (e.g., title, authors, year), reply: "The document does not contain this information." or "This information does not appear in the provided documents."
7. You may NOT use general knowledge, outside sources, or assumptions—only what is literally visible in the file.
8. When summarizing or answering questions:
   - Use ONLY information explicitly present in the document.
   - If unsure, state that the document does not provide that information.
   - You are allowed to read ALL extracted text, ALL OCR text, ALL metadata (title, authors, publisher), text in figures, headers, footers, page 1 logos (if extracted).
9. You are NOT allowed to hallucinate or invent missing information.
10. If an answer is NOT found anywhere in the extracted text or metadata, say: "Not found in the document." or "This information does not appear in the provided documents."
11. Do NOT block answers. Do NOT claim information is missing if it exists in the provided text.
12. Always answer directly and truthfully. If information clearly appears anywhere in the extracted text, OCR output, or metadata, you MUST use it.
13. Do NOT guess. Do NOT infer. Do NOT fill gaps. If a question cannot be answered solely from the document, refuse politely.

SPECIFIC RULES FOR DOCUMENT METADATA:

1. TITLE DETECTION:
   - Look for the document title in the first page.
   - If a block of text appears at the very top of the first page, before the abstract or table of contents, treat it as the title, even if the word "title" is not present.
   - Only use information explicitly in the document (extracted text, OCR text, or metadata).
   - Do NOT hallucinate or guess any missing titles.

2. AUTHORS:
   - Use ONLY author names explicitly found in the document text, OCR output, or metadata.
   - If author names are already provided in the extracted text, use ONLY those. Do NOT invent new author names.
   - Do NOT repeat author names if they are already mentioned in the text.
   - If author names are not found, respond: "Not found in the document." or "The document does not contain this information."
   - STRICTLY FORBIDDEN: Do NOT invent, guess, or hallucinate author names.

3. LOGOS / IMAGES / PUBLISHER:
   - OCR has been performed on Page 1 to extract text from logos and images.
   - Search the Page 1 OCR output for publisher names in logos or images.
   - If an image contains readable text (e.g., a publisher name in a logo), it should be in the OCR output.
   - Look for publisher names in texts like: "Published by", "Publisher:", "©", or in company logos.
   - If the publisher name cannot be found in the OCR output or extracted text, respond: "Not found in the document."
   - Do NOT guess the content of images or logos - use ONLY what was extracted by OCR.
   - Do NOT assume logos contain a publisher name unless it appears in the extracted text.

4. PUBLISHER:
   - Only answer the publisher if it appears as readable text or in metadata.
   - Otherwise, respond: "Not found in the document." or "The document does not contain this information."

5. METADATA RESPONSE FORMAT:
   When asked for document information (title, authors, publisher), respond in this exact format:
   
   [DOCUMENT_METADATA]
   Title: <title if detected, else "Not found in the document">
   Authors: <authors if detected, else "Not found in the document">
   Publisher: <publisher if detected, else "Not found in the document">
   [/DOCUMENT_METADATA]
   
   Do NOT provide any additional information beyond what is explicitly in the document.

6. METADATA SEARCH INSTRUCTIONS:
   - FIRST, look for the [DOCUMENT_METADATA] block at the VERY BEGINNING of the extracted text.
   - The [DOCUMENT_METADATA] block contains the exact Title, Authors, and Publisher extracted from the PDF.
   - The format is:
     [DOCUMENT_METADATA]
     Title: <exact title from PDF>
     Authors: <exact authors from PDF>
     Publisher: <publisher name>
     [/DOCUMENT_METADATA]
   - Use the values from this block as the PRIMARY source for title, authors, and publisher.
   - If the [DOCUMENT_METADATA] block says "Not found in the document", then that information is truly missing.
   - Do NOT search elsewhere if the [DOCUMENT_METADATA] block explicitly states "Not found in the document".

Use the [DOCUMENT_METADATA] block as the PRIMARY source of truth for title, authors, and publisher. Only use information from this block - it is extracted directly from the PDF. Return the exact values as they appear in the [DOCUMENT_METADATA] block.

PDF SECTIONS FROM "${pdfFileName}":
${chunksText}
END OF PDF SECTIONS

Remember: ONLY use information from the sections above. Do not use general knowledge. Do not make up information. Do not guess. Do not hallucinate. If information is not found, clearly state it is not found.`;
    }
    
    // User message is just the question
    const userMessage = userQuery;
    
    return { system: systemPrompt, user: userMessage };
}

/**
 * Build prompt for summarization requests
 * Handles token limits for large PDFs
 */
function buildSummaryPrompt(chunks, pdfFileName, maxTokens = 6000, isArabic = false) {
    if (!chunks || chunks.length === 0) {
        if (isArabic) {
            return {
                system: `أنت مسير، مساعد ذكي. لا يمكنك تلخيص لأنه لم يتم العثور على محتوى في "${pdfFileName}". 

قاعدة حرجة: لا تخترع معلومات. استخدم فقط المعلومات التي تظهر بوضوح في المستندات. إذا لم يتم العثور على المعلومات، قل: "غير موجود في المستند".`,
                user: "الرجاء تلخيص الوثيقة."
            };
        }
        return {
            system: `You are Samir, an AI tutor who answers questions using the extracted PDF content. You cannot summarize because no content was found in "${pdfFileName}".

CRITICAL: Do not make up information. Only use information that appears explicitly in the documents. If information is not found, say: "Not found in the document." or "This information does not appear in the provided documents."`,
            user: "Please summarize the document."
        };
    }
    
    // Trim chunks to fit within token limit
    const availableTokens = maxTokens - 800; // Reserve for prompt and response
    const trimmedChunks = trimChunksToTokenLimit(chunks, availableTokens, 300);
    
    if (trimmedChunks.length === 0) {
        return {
            system: `You are an AI tutor. The PDF "${pdfFileName}" content is too large to summarize in one request.`,
            user: "Please summarize the document."
        };
    }
    
    // Format chunks with metadata if available
    const chunksText = trimmedChunks.map((chunk, idx) => {
        let chunkText = `=== SECTION ${idx + 1} ===\n`;
        if (chunk.page_start) chunkText += `[Page ${chunk.page_start}]\n`;
        if (chunk.section_title) chunkText += `[Section: ${chunk.section_title}]\n`;
        chunkText += `${(chunk.text || chunk.chunk_text || '').trim()}\n`;
        return chunkText;
    }).join('\n');
    
    if (trimmedChunks.length < chunks.length) {
        console.warn(`⚠️ Summary: Trimmed chunks ${chunks.length} → ${trimmedChunks.length} to fit token limit`);
    }
    
    let systemPrompt;
    let userMessage;
    
    if (isArabic) {
        systemPrompt = `أنت مسير، مساعد ذكي يساعد طالبًا في فهم وثيقة PDF المرفوعة: "${pdfFileName}".

قواعد حرجة - يجب اتباعها بدقة مع ZERO استثناءات:

1. يمكنك استخدام المعلومات التي تظهر بوضوح في النصوص أو الصور في المستندات المرفوعة فقط.
2. إذا لم يتم اكتشاف صورة أو شعار أو عنصر بصري، قل: "لم يتم اكتشاف أي صورة أو شعار في المستند المرفوع."
3. إذا تم اكتشاف صورة ولكن لا يمكن تفسيرها، قل: "يوجد صورة، لكن النظام لا يستطيع عرضها أو تفسيرها."
4. ممنوع منعًا باتًا تخمين أو اختراع أي محتوى حول الصور أو الشعارات.
5. ممنوع منعًا باتًا افتراض كيف قد يبدو الشعار بناءً على السياق.
6. إذا لم يحتوي المستند على بيانات وصفية واضحة (مثل العنوان، المؤلفين، السنة)، قل: "المستند لا يحتوي على هذه المعلومات."
7. لا يمكنك استخدام المعرفة العامة أو المصادر الخارجية أو الافتراضات - فقط ما هو مرئي حرفيًا في الملف.
8. عند التلخيص:
   - استخدم فقط المعلومات الموجودة بوضوح في المستند.
   - استخدم كل النص المستخرج، كل نص OCR، كل البيانات الوصفية (العنوان، المؤلفون، الناشر)، النص في الأشكال، الترويسات، التذييلات، شعارات الصفحة الأولى (إذا تم استخراجها).
   - التزم تمامًا بنص المقاطع المسترجعة
   - امنع اختراع أو تخمين أي معلومة غير موجودة
   - حافظ على أسماء المؤلفين كما هي
   - وضّح رقم الصفحة لكل معلومة مهمة إن كانت موجودة
   - اذكر الأقسام الرئيسية، الجداول، الأشكال، النتائج، المناهج، الخاتمة
9. لا تمنع الإجابات. لا تدعي أن المعلومات مفقودة إذا كانت موجودة في النص المقدم.
10. إذا كانت المعلومة موجودة بوضوح في أي مكان في النص المستخرج، ناتج OCR، أو البيانات الوصفية، يجب استخدامها.
11. إذا لم تكن المعلومة موجودة في المقاطع المسترجعة، قل: "غير موجود في المستند"

محتوى PDF من "${pdfFileName}":
${chunksText}
نهاية محتوى PDF

قم بتلخيص المحتوى أعلاه بدقة، مع التركيز على النقاط الرئيسية فقط من المقاطع المرفوعة. لا تضيف معلومات غير موجودة.`;
        userMessage = "الرجاء تلخيص هذا المستند مع الأفكار الرئيسية والنقاط الأساسية.";
    } else {
        systemPrompt = `You are Samir, an AI tutor who answers questions using the extracted PDF content.

CRITICAL RULES - YOU MUST FOLLOW THESE WITH ZERO EXCEPTIONS:

1. You are only allowed to use information that appears explicitly in the text or images in the documents provided.
2. If you do NOT detect an image, figure, logo, or visual element, say: "No image or logo is detected in the provided document."
3. If you detect an image but cannot interpret it, say: "An image is present, but the system cannot display or interpret it."
4. You are forbidden from guessing or hallucinating any content about images or logos.
5. You are forbidden from assuming what a logo might look like based on context.
6. If the document does not contain visible metadata (e.g., title, authors, year), reply: "The document does not contain this information." or "This information does not appear in the provided documents."
7. You may NOT use general knowledge, outside sources, or assumptions—only what is literally visible in the file.
8. When summarizing:
   - Use ONLY information explicitly present in the document.
   - You are allowed to read ALL extracted text, ALL OCR text, ALL metadata (title, authors, publisher), text in figures, headers, footers, page 1 logos (if extracted).
   - Create a clear, structured summary with main points
   - Use bullet points for clarity
   - Preserve author names, page numbers, and citations exactly as in the PDF
9. You are NOT allowed to hallucinate or invent missing information.
10. If information is not in the retrieved sections, say: "Not found in the document." or "This information does not appear in the provided documents."
11. Do NOT block answers. Do NOT claim information is missing if it exists in the provided text.
12. Always answer directly and truthfully.

Use the extracted text as the PRIMARY source of truth. However, if the answer clearly appears anywhere in the extracted text, OCR output, or metadata, you MUST use it.

PDF CONTENT FROM "${pdfFileName}":
${chunksText}
END OF PDF CONTENT

Provide a summary of the content above, focusing only on main points from the provided sections. Do not add information that is not in the sections.`;
        userMessage = "Please provide a summary of this document with main ideas and bullet points.";
    }
    
    return { system: systemPrompt, user: userMessage };
}

/**
 * Handle large PDFs by processing chunks incrementally
 */
async function summarizeLargePDF(userId, pdfId, pdfFileName) {
    // Get all chunks
    const allChunks = await retrievePDFChunks(userId, pdfId, 200); // Get up to 200 chunks
    
    if (!allChunks || allChunks.length === 0) {
        return "I cannot summarize because no content was found in the document.";
    }
    
    // If PDF is small (< 20 chunks), summarize all at once
    if (allChunks.length <= 20) {
        const prompt = buildSummaryPrompt(allChunks, pdfFileName);
        return prompt;
    }
    
    // For large PDFs, process in batches
    const batchSize = 15; // Process 15 chunks at a time
    const batches = [];
    
    for (let i = 0; i < allChunks.length; i += batchSize) {
        batches.push(allChunks.slice(i, i + batchSize));
    }
    
    // Return instruction to summarize in batches
    return {
        system: `You are summarizing a large PDF "${pdfFileName}". Process the content in batches and provide a comprehensive summary.`,
        chunks: batches,
        fileName: pdfFileName
    };
}

/**
 * Main function: Get strict PDF-based prompt for WebLLM
 * This ensures the AI ONLY uses PDF content
 */
/**
 * Get strict PDF prompt - ALWAYS uses parsed data from Supabase
 * Ensures Samir never claims PDF is missing
 */
export async function getStrictPDFPrompt(userId, pdfId, pdfFileName, userQuery, useChunks = true, modelType = 'webllm', currentMode = 'tutor') {
    // CRITICAL: Validate PDF chunks exist before proceeding
    const chunksExist = await validatePDFChunksExist(userId, pdfId);
    if (!chunksExist) {
        console.error(`❌ No PDF chunks found for PDF ID: ${pdfId}. PDF must be processed first.`);
        throw new Error(`PDF "${pdfFileName}" has not been processed yet. Please upload and process the PDF first.`);
    }
    // Ensure modelType is defined (fallback safety)
    const effectiveModelType = modelType || 'webllm';
    
    // Detect language from user query
    const userLang = detectLanguage(userQuery);
    const isArabic = userLang === 'ar';
    
    // Detect which mode to use
    const detectedMode = detectMode(userQuery, currentMode);
    console.log(`🎯 Detected mode: ${detectedMode} (current: ${currentMode}, query: ${userQuery.substring(0, 50)}...)`);
    
    // Check if it's a summary request (English or Arabic)
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
            // User wants full document summary - get all chunks
            chunks = await retrievePDFChunks(userId, pdfId, 100);
        } else {
            // Get relevant chunks for the query
            chunks = await getRelevantChunksForQuery(userId, pdfId, userQuery, isSummaryRequest ? 10 : 5);
        }
    }
    
    // If no chunks found, try to get any chunks as fallback
    if (chunks.length === 0) {
        console.warn('No relevant chunks found, trying to get any chunks...');
        chunks = await retrievePDFChunks(userId, pdfId, 5);
    }
    
    // Get token limit for the model
    const maxTokens = getTokenLimit(effectiveModelType);
    console.log(`📊 Token limit for ${effectiveModelType}: ${maxTokens} tokens`);
    
    // Estimate current chunk tokens
    const chunkTokens = chunks.reduce((sum, c) => sum + estimateTokens(c.text || ''), 0);
    const queryTokens = estimateTokens(userQuery);
    const totalTokens = chunkTokens + queryTokens + 500; // +500 for system prompt
    
    console.log(`📊 Estimated tokens: chunks=${chunkTokens}, query=${queryTokens}, total=${totalTokens}`);
    
    if (totalTokens > maxTokens) {
        console.warn(`⚠️ Total tokens (${totalTokens}) exceeds limit (${maxTokens}), trimming chunks...`);
    }
    
    // Build appropriate prompt (with token limits, language support, and mode)
    if (isSummaryRequest) {
        return buildSummaryPrompt(chunks, pdfFileName, maxTokens, isArabic);
    } else {
        return buildStrictPDFPrompt(chunks, userQuery, pdfFileName, maxTokens, isArabic, detectedMode, currentMode);
    }
}

/**
 * Format prompt for WebLLM message format
 */
export function formatForWebLLM(strictPrompt) {
    if (!strictPrompt || !strictPrompt.system) {
        return [
            { role: 'system', content: 'You are Samir, an AI tutor who answers questions using the extracted PDF content. You must only use information that appears explicitly in the provided PDF. Do not hallucinate or invent information. If information is not found, say: "Not found in the document."' },
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

