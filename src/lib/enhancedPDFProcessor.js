/**
 * Enhanced PDF Processor
 * Integrates PageLM-style processing with advanced features:
 * - PDF Parsing (Title, Author, Metadata, Sections, Tables, Lists, Footnotes)
 * - OCR for images inside PDFs
 * - Layout Understanding (Titles, Subtitles, Structure)
 * - Smart Chunking for RAG
 */

import { performPageOCR, needsOCR } from './pdfOCRHelper.js';

/**
 * Main function: Extract structured PDF data with all features
 * @param {File} file - PDF file
 * @param {Object} options - Processing options
 * @returns {Promise<Object>} Structured PDF data
 */
export async function extractEnhancedPDF(file, options = {}) {
    const {
        enableOCR = true,
        ocrLanguages = 'eng+ara',
        maxPages = 100,
        chunkSize = 512,
        chunkOverlap = 30
    } = options;

    const arrayBuffer = await file.arrayBuffer();
    
    // Dynamically import PDF.js
    const pdfjsLib = await import('pdfjs-dist');
    
    // Create worker as blob URL
    const pdfjsVersion = pdfjsLib.version || '4.4.168';
    const workerCode = await fetch(`https://unpkg.com/pdfjs-dist@${pdfjsVersion}/build/pdf.worker.min.mjs`).then(r => r.text());
    const workerBlob = new Blob([workerCode], { type: 'application/javascript' });
    const workerUrl = URL.createObjectURL(workerBlob);
    pdfjsLib.GlobalWorkerOptions.workerSrc = workerUrl;
    
    // Load PDF
    const loadingTask = pdfjsLib.getDocument({
        data: arrayBuffer,
        verbosity: 0,
    });
    
    const pdf = await loadingTask.promise;
    const totalPages = Math.min(pdf.numPages, maxPages);
    
    // Extract structured data
    const structuredData = {
        metadata: {
            totalPages: pdf.numPages,
            title: null,
            authors: [],
            affiliations: [],
            abstract: null,
            keywords: [],
            publicationDate: null,
            doi: null,
            subject: null,
            creator: null,
        },
        tableOfContents: [],
        sections: [], // Array of {title, level, pageStart, pageEnd, content}
        pages: [], // Array of page data
        paragraphs: [], // All paragraphs with metadata
        headings: [], // All headings with levels
        figures: [], // Array of {id, caption, pageNumber, ocrText}
        tables: [], // Array of {id, caption, pageNumber, data}
        lists: [], // Array of {type, items, pageNumber}
        footnotes: [], // Array of {id, text, pageNumber}
        references: [], // Array of {id, citationText, authors, title, year}
        images: [], // Array of {pageNumber, ocrText, hasText}
        fullText: '', // Complete extracted text
        chunks: [], // Pre-chunked text for RAG
    };
    
    // Process each page
    for (let pageNum = 1; pageNum <= totalPages; pageNum++) {
        console.log(`Processing page ${pageNum}/${totalPages}...`);
        const page = await pdf.getPage(pageNum);
        const pageData = await extractPageStructure(page, pageNum, enableOCR, ocrLanguages);
        structuredData.pages.push(pageData);
        
        // Extract metadata from first few pages
        if (pageNum <= 3) {
            extractMetadata(pageData, structuredData.metadata, pageNum);
        }
        
        // Extract TOC (usually on pages 1-3)
        if (pageNum <= 3) {
            extractTableOfContents(pageData, structuredData.tableOfContents, pageNum);
        }
        
        // Extract structural elements
        extractHeadings(pageData, structuredData.headings, pageNum);
        extractParagraphs(pageData, structuredData.paragraphs, pageNum);
        extractFigures(pageData, structuredData.figures, pageNum);
        extractTables(pageData, structuredData.tables, pageNum);
        extractLists(pageData, structuredData.lists, pageNum);
        extractFootnotes(pageData, structuredData.footnotes, pageNum);
        
        // Mark pages that might need OCR
        if (enableOCR && needsOCR(pageData)) {
            structuredData.images.push({
                pageNumber: pageNum,
                hasText: true,
                needsOCR: true
            });
        }
        
        // Accumulate full text
        structuredData.fullText += pageData.mainText + '\n\n';
    }
    
    // Extract references (usually at the end)
    extractReferences(structuredData.pages, structuredData.references);
    
    // Identify sections throughout document
    identifySections(structuredData.pages, structuredData.headings, structuredData.sections);
    
    // Perform OCR on pages that need it
    if (enableOCR) {
        console.log('Checking pages for OCR...');
        for (const pageData of structuredData.pages) {
            if (needsOCR(pageData)) {
                try {
                    console.log(`Performing OCR on page ${pageData.pageNumber}...`);
                    const page = await pdf.getPage(pageData.pageNumber);
                    const ocrText = await performPageOCR(page, pageData.viewport, ocrLanguages);
                    
                    if (ocrText && ocrText.length > 0) {
                        // Add OCR text to page data
                        pageData.ocrText = ocrText;
                        // Append OCR text to main text
                        pageData.mainText += '\n\n[OCR Text]\n' + ocrText;
                        // Update full text
                        structuredData.fullText += '\n\n[OCR from page ' + pageData.pageNumber + ']\n' + ocrText;
                        
                        // Update images array
                        structuredData.images.push({
                            pageNumber: pageData.pageNumber,
                            ocrText: ocrText,
                            hasText: true
                        });
                    }
                } catch (error) {
                    console.warn(`OCR failed for page ${pageData.pageNumber}:`, error);
                }
            }
        }
    }
    
    // Chunk text for RAG (PageLM-style)
    structuredData.chunks = chunkText(structuredData.fullText, chunkSize, chunkOverlap);
    
    // Cleanup
    URL.revokeObjectURL(workerUrl);
    
    return structuredData;
}

/**
 * Extract structure from a single page with OCR support
 */
async function extractPageStructure(page, pageNumber, enableOCR, ocrLanguages) {
    const viewport = page.getViewport({ scale: 2.0 }); // Higher scale for better OCR
    const textContent = await page.getTextContent();
    
    // Group text items by position
    const textItems = textContent.items.map(item => ({
        text: item.str,
        x: item.transform[4],
        y: item.transform[5],
        fontSize: item.transform[0],
        fontName: item.fontName,
        width: item.width,
        height: item.height,
    }));
    
    // Identify header (usually top 10% of page)
    const headerThreshold = viewport.height * 0.9;
    const footerThreshold = viewport.height * 0.1;
    
    const headerItems = textItems.filter(item => item.y > headerThreshold);
    const footerItems = textItems.filter(item => item.y < footerThreshold);
    const bodyItems = textItems.filter(item => 
        item.y <= headerThreshold && item.y >= footerThreshold
    );
    
    // Extract main text
    const mainText = bodyItems
        .sort((a, b) => {
            // Sort by Y position (top to bottom), then X (left to right)
            if (Math.abs(a.y - b.y) > 5) return b.y - a.y;
            return a.x - b.x;
        })
        .map(item => item.text)
        .join(' ')
        .replace(/\s+/g, ' ')
        .trim();
    
    // Extract headers (section titles)
    const headers = identifyHeaders(bodyItems, viewport);
    
    // Extract images if OCR is enabled
    // Note: Canvas rendering for OCR will be done separately if needed
    const images = [];
    if (enableOCR && textItems.length < 50) {
        // If few text items, might be scanned/image-based PDF
        // Mark for OCR processing later
        images.push({
            pageNumber,
            hasText: true, // Likely scanned if few text items
            needsOCR: true
        });
    }
    
    return {
        pageNumber,
        header: headerItems.map(item => item.text).join(' ').trim(),
        footer: footerItems.map(item => item.text).join(' ').trim(),
        mainText,
        headers,
        textItems: bodyItems,
        images,
        viewport,
    };
}

/**
 * Extract metadata from first pages
 */
function extractMetadata(pageData, metadata, pageNum) {
    const text = pageData.mainText;
    const lowerText = text.toLowerCase();
    
    // Extract title (usually first page, large font, centered)
    if (pageNum === 1 && !metadata.title) {
        // Try to find title from headers
        const titleHeader = pageData.headers.find(h => h.level === 1);
        if (titleHeader && titleHeader.text.length > 10 && titleHeader.text.length < 200) {
            metadata.title = titleHeader.text.trim();
        } else {
            // Try to extract from first substantial line
            const lines = text.split('\n').filter(line => line.trim().length > 0);
            for (const line of lines.slice(0, 10)) {
                const trimmed = line.trim();
                if (trimmed.length > 15 && trimmed.length < 200 &&
                    !trimmed.toLowerCase().includes('abstract') &&
                    !trimmed.toLowerCase().includes('keywords') &&
                    !trimmed.toLowerCase().includes('introduction') &&
                    !trimmed.match(/^\d+$/)) {
                    metadata.title = trimmed;
                    break;
                }
            }
        }
    }
    
    // Extract authors (patterns like "Author1, Author2" or "Author1 and Author2")
    if (pageNum === 1 && metadata.authors.length === 0) {
        const authorPatterns = [
            /authors?[:\s]+([^.\n]+)/i,
            /^([A-Z][a-z]+(?:\s+[A-Z]\.?)?(?:\s+[A-Z][a-z]+)*(?:,\s*[A-Z][a-z]+(?:\s+[A-Z]\.?)?(?:\s+[A-Z][a-z]+)*)*)/m,
        ];
        
        for (const pattern of authorPatterns) {
            const match = text.match(pattern);
            if (match && match[1]) {
                const authors = match[1]
                    .split(/[,\n]/)
                    .map(a => a.trim())
                    .filter(a => a.length > 0 && a.length < 100);
                if (authors.length > 0 && authors.length < 20) {
                    metadata.authors = authors;
                    break;
                }
            }
        }
    }
    
    // Extract abstract
    if (pageNum <= 2 && !metadata.abstract) {
        const abstractMatch = text.match(/abstract[:\s]+([\s\S]+?)(?:keywords|introduction|background|1\.)/i);
        if (abstractMatch && abstractMatch[1]) {
            metadata.abstract = abstractMatch[1].trim().substring(0, 2000);
        }
    }
    
    // Extract keywords
    if (pageNum <= 2 && metadata.keywords.length === 0) {
        const keywordsMatch = text.match(/keywords?[:\s]+([^\n]+)/i);
        if (keywordsMatch && keywordsMatch[1]) {
            metadata.keywords = keywordsMatch[1]
                .split(/[;,\n]/)
                .map(k => k.trim())
                .filter(k => k.length > 0);
        }
    }
    
    // Extract DOI
    if (!metadata.doi) {
        const doiMatch = text.match(/doi[:\s]+([\d.\/]+[^\s]+)/i);
        if (doiMatch && doiMatch[1]) {
            metadata.doi = doiMatch[1].trim();
        }
    }
}

/**
 * Extract table of contents
 */
function extractTableOfContents(pageData, toc, pageNum) {
    const lines = pageData.mainText.split('\n').filter(line => line.trim().length > 0);
    
    // TOC usually has patterns like "1. Section Title ........... 5"
    const tocPattern = /^(\d+(?:\.\d+)*)\s+(.+?)\s+(?:\.{2,}|\s+)(\d+)$/;
    
    for (const line of lines) {
        const match = line.match(tocPattern);
        if (match) {
            const level = match[1].split('.').length;
            const title = match[2].trim();
            const targetPage = parseInt(match[3]);
            
            toc.push({
                entryTitle: title,
                entryLevel: level,
                pageNumber: targetPage,
                entryOrder: toc.length + 1,
            });
        }
    }
}

/**
 * Extract headings from page
 */
function extractHeadings(pageData, headings, pageNum) {
    for (const header of pageData.headers) {
        headings.push({
            text: header.text,
            level: header.level,
            pageNumber: pageNum,
            fontSize: header.fontSize,
        });
    }
}

/**
 * Extract paragraphs from page
 */
function extractParagraphs(pageData, paragraphs, pageNum) {
    // Split text into paragraphs
    const paraTexts = pageData.mainText
        .split(/\n\s*\n/)
        .map(p => p.trim())
        .filter(p => p.length > 0);
    
    for (const paraText of paraTexts) {
        if (paraText.length > 20) { // Minimum paragraph length
            paragraphs.push({
                text: paraText,
                pageNumber: pageNum,
                length: paraText.length,
            });
        }
    }
}

/**
 * Extract figures from page
 */
function extractFigures(pageData, figures, pageNum) {
    // Look for figure captions (usually "Figure 1", "Fig. 2", etc.)
    const figurePattern = /(?:figure|fig\.?)\s+(\d+(?:\.\d+)*)[:\s]+(.+?)(?:\n|$)/gi;
    const matches = [...pageData.mainText.matchAll(figurePattern)];
    
    for (const match of matches) {
        const figureId = `Figure ${match[1]}`;
        const caption = match[2].trim();
        
        figures.push({
            figureId,
            caption,
            pageNumber: pageNum,
            ocrText: null, // Will be filled if OCR is performed
        });
    }
}

/**
 * Extract tables from page
 */
function extractTables(pageData, tables, pageNum) {
    // Look for table captions (usually "Table 1", "Tab. 2", etc.)
    const tablePattern = /(?:table|tab\.?)\s+(\d+(?:\.\d+)*)[:\s]+(.+?)(?:\n|$)/gi;
    const matches = [...pageData.mainText.matchAll(tablePattern)];
    
    for (const match of matches) {
        const tableId = `Table ${match[1]}`;
        const caption = match[2].trim();
        
        // Try to extract table data (simplified)
        const tableText = extractTableText(pageData.textItems, match.index);
        
        tables.push({
            tableId,
            caption,
            pageNumber: pageNum,
            data: tableText,
        });
    }
}

/**
 * Extract lists from page
 */
function extractLists(pageData, lists, pageNum) {
    const lines = pageData.mainText.split('\n');
    const listItems = [];
    let currentList = null;
    
    for (const line of lines) {
        const trimmed = line.trim();
        
        // Detect list items (bullet points, numbered, etc.)
        const bulletMatch = trimmed.match(/^[•\-\*]\s+(.+)$/);
        const numberedMatch = trimmed.match(/^\d+[\.\)]\s+(.+)$/);
        
        if (bulletMatch || numberedMatch) {
            const itemText = (bulletMatch || numberedMatch)[1];
            if (!currentList) {
                currentList = {
                    type: bulletMatch ? 'bullet' : 'numbered',
                    items: [],
                    pageNumber: pageNum,
                };
            }
            currentList.items.push(itemText);
        } else if (currentList && trimmed.length === 0) {
            // End of list
            if (currentList.items.length > 0) {
                lists.push(currentList);
            }
            currentList = null;
        }
    }
    
    if (currentList && currentList.items.length > 0) {
        lists.push(currentList);
    }
}

/**
 * Extract footnotes from page
 */
function extractFootnotes(pageData, footnotes, pageNum) {
    // Look for footnote patterns (usually at bottom of page)
    const footnotePattern = /(?:^|\n)(\d+)[\.\)]\s+(.+?)(?=\n\d+[\.\)]|\n\n|$)/g;
    const matches = [...pageData.mainText.matchAll(footnotePattern)];
    
    // Check if these are actually footnotes (usually in footer area)
    const footerText = pageData.footer;
    
    for (const match of matches) {
        const footnoteId = match[1];
        const footnoteText = match[2].trim();
        
        // Verify it's in footer area or has footnote characteristics
        if (footerText.includes(footnoteId) || footnoteText.length < 200) {
            footnotes.push({
                id: footnoteId,
                text: footnoteText,
                pageNumber: pageNum,
            });
        }
    }
}

/**
 * Extract references from pages (usually at the end)
 */
function extractReferences(pages, references) {
    // References usually start with "[1]", "[2]", etc.
    const referencePattern = /\[(\d+)\]\s+(.+?)(?=\[\d+\]|$)/gs;
    
    // Check last 20% of pages
    const startPage = Math.floor(pages.length * 0.8);
    const referencePages = pages.slice(startPage);
    
    for (const pageData of referencePages) {
        const matches = [...pageData.mainText.matchAll(referencePattern)];
        
        for (const match of matches) {
            const refId = parseInt(match[1]);
            const citationText = match[2].trim();
            
            // Parse citation components
            const authors = extractAuthorsFromCitation(citationText);
            const year = extractYearFromCitation(citationText);
            
            references.push({
                referenceId: refId,
                citationText,
                authors,
                year,
            });
        }
    }
}

/**
 * Identify sections throughout document
 */
function identifySections(pages, headings, sections) {
    let currentSection = null;
    
    for (const heading of headings) {
        if (heading.level <= 2) { // Main sections are usually level 1-2
            if (currentSection) {
                currentSection.pageEnd = heading.pageNumber - 1;
                sections.push(currentSection);
            }
            
            currentSection = {
                title: heading.text,
                level: heading.level,
                pageStart: heading.pageNumber,
                pageEnd: heading.pageNumber,
                content: '', // Will be populated with section content
            };
        }
    }
    
    // Close last section
    if (currentSection) {
        const lastPage = pages[pages.length - 1];
        currentSection.pageEnd = lastPage ? lastPage.pageNumber : currentSection.pageStart;
        sections.push(currentSection);
    }
    
    // Populate section content
    for (const section of sections) {
        const sectionPages = pages.filter(p => 
            p.pageNumber >= section.pageStart && p.pageNumber <= section.pageEnd
        );
        section.content = sectionPages.map(p => p.mainText).join('\n\n');
    }
}

/**
 * Identify headers (section titles) based on font size and position
 */
function identifyHeaders(textItems, viewport) {
    const headers = [];
    
    // Group items by similar y-position (same line)
    const lines = {};
    for (const item of textItems) {
        const yKey = Math.round(item.y / 10) * 10; // Round to nearest 10
        if (!lines[yKey]) lines[yKey] = [];
        lines[yKey].push(item);
    }
    
    // Identify headers (larger font, centered, all caps or title case)
    for (const lineItems of Object.values(lines)) {
        const avgFontSize = lineItems.reduce((sum, item) => sum + (item.fontSize || 12), 0) / lineItems.length;
        const text = lineItems.map(item => item.text).join(' ').trim();
        
        if (text.length > 5 && text.length < 200 && avgFontSize > 12) {
            // Determine level based on font size
            let level = 1;
            if (avgFontSize > 16) level = 1;
            else if (avgFontSize > 14) level = 2;
            else if (avgFontSize > 12) level = 3;
            
            headers.push({
                text,
                level,
                fontSize: avgFontSize,
            });
        }
    }
    
    return headers;
}

/**
 * Extract table text (simplified)
 */
function extractTableText(textItems, startIndex) {
    // Simplified table extraction - would need more sophisticated parsing
    const relevantItems = textItems.slice(startIndex, startIndex + 100);
    return relevantItems.map(item => item.text).join(' ').trim();
}

/**
 * Extract authors from citation
 */
function extractAuthorsFromCitation(citation) {
    // Pattern: "Author1, Author2, & Author3 (2023) Title..."
    const authorMatch = citation.match(/^(.+?)\s*\(\d{4}\)/);
    if (authorMatch) {
        return authorMatch[1].split(/[,&]/).map(a => a.trim()).filter(a => a.length > 0);
    }
    return [];
}

/**
 * Extract year from citation
 */
function extractYearFromCitation(citation) {
    const yearMatch = citation.match(/\((\d{4})\)/);
    return yearMatch ? parseInt(yearMatch[1]) : null;
}


/**
 * Chunk text for RAG (PageLM-style RecursiveCharacterTextSplitter)
 * @param {string} text - Text to chunk
 * @param {number} chunkSize - Size of each chunk
 * @param {number} chunkOverlap - Overlap between chunks
 * @returns {Array} Array of chunks with metadata
 */
function chunkText(text, chunkSize = 512, chunkOverlap = 30) {
    const chunks = [];
    const separators = ['\n\n', '\n', '. ', ' ', ''];
    
    let start = 0;
    let chunkIndex = 0;
    
    while (start < text.length) {
        let end = start + chunkSize;
        
        // Try to break at a natural boundary
        if (end < text.length) {
            for (const separator of separators) {
                const lastIndex = text.lastIndexOf(separator, end);
                if (lastIndex > start + chunkSize * 0.5) {
                    end = lastIndex + separator.length;
                    break;
                }
            }
        } else {
            end = text.length;
        }
        
        const chunkText = text.slice(start, end).trim();
        
        if (chunkText.length > 0) {
            chunks.push({
                text: chunkText,
                index: chunkIndex,
                start,
                end,
                length: chunkText.length,
            });
        }
        
        // Move start position with overlap
        start = end - chunkOverlap;
        if (start >= end) start = end; // Prevent infinite loop
        chunkIndex++;
    }
    
    return chunks;
}

/**
 * Get summary of extracted PDF data
 */
export function getPDFSummary(structuredData) {
    return {
        title: structuredData.metadata.title || 'Untitled',
        authors: structuredData.metadata.authors.join(', ') || 'Unknown',
        totalPages: structuredData.metadata.totalPages,
        sections: structuredData.sections.length,
        paragraphs: structuredData.paragraphs.length,
        headings: structuredData.headings.length,
        figures: structuredData.figures.length,
        tables: structuredData.tables.length,
        lists: structuredData.lists.length,
        footnotes: structuredData.footnotes.length,
        references: structuredData.references.length,
        imagesWithOCR: structuredData.images.filter(img => img.ocrText).length,
        totalChunks: structuredData.chunks.length,
        totalTextLength: structuredData.fullText.length,
    };
}

