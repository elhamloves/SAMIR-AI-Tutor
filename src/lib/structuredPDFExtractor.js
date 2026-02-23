/**
 * Structured PDF Extractor
 * Extracts all structural elements from PDFs: metadata, TOC, figures, tables, references
 */

/**
 * Extract structured information from PDF
 * @param {File} file - PDF file
 * @returns {Promise<Object>} Structured PDF data
 */
export async function extractStructuredPDF(file) {
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
    const totalPages = pdf.numPages;
    
    // Extract structured data
    const structuredData = {
        metadata: {
            totalPages,
            title: null,
            authors: [],
            affiliations: [],
            abstract: null,
            keywords: [],
            publicationDate: null,
            doi: null,
        },
        tableOfContents: [],
        sections: [], // Array of {title, level, pageStart, pageEnd}
        pages: [], // Array of page data with text, headers, footers
        figures: [], // Array of {id, caption, pageNumber}
        tables: [], // Array of {id, caption, pageNumber, data}
        references: [], // Array of {id, citationText, authors, title, year}
    };
    
    // Process each page
    for (let pageNum = 1; pageNum <= totalPages; pageNum++) {
        const page = await pdf.getPage(pageNum);
        const pageData = await extractPageStructure(page, pageNum);
        structuredData.pages.push(pageData);
        
        // Extract metadata from first few pages
        if (pageNum <= 3) {
            extractMetadata(pageData, structuredData.metadata, pageNum);
        }
        
        // Extract TOC (usually on pages 1-3)
        if (pageNum <= 3) {
            extractTableOfContents(pageData, structuredData.tableOfContents, pageNum);
        }
        
        // Extract figures and tables
        extractFigures(pageData, structuredData.figures, pageNum);
        extractTables(pageData, structuredData.tables, pageNum);
    }
    
    // Extract references (usually at the end)
    extractReferences(structuredData.pages, structuredData.references);
    
    // Identify sections throughout document
    identifySections(structuredData.pages, structuredData.sections);
    
    // Cleanup
    URL.revokeObjectURL(workerUrl);
    
    return structuredData;
}

/**
 * Extract structure from a single page
 */
async function extractPageStructure(page, pageNumber) {
    const viewport = page.getViewport({ scale: 1.0 });
    const textContent = await page.getTextContent();
    
    // Group text items by position (to identify headers/footers)
    const textItems = textContent.items.map(item => ({
        text: item.str,
        x: item.transform[4],
        y: item.transform[5],
        fontSize: item.transform[0],
        fontName: item.fontName,
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
        .map(item => item.text)
        .join(' ')
        .replace(/\s+/g, ' ')
        .trim();
    
    // Extract headers (likely section titles - large font, centered)
    const headers = identifyHeaders(bodyItems, viewport);
    
    return {
        pageNumber,
        header: headerItems.map(item => item.text).join(' ').trim(),
        footer: footerItems.map(item => item.text).join(' ').trim(),
        pageNumber: extractPageNumber(footerItems),
        mainText,
        headers,
        textItems,
        viewport,
    };
}

/**
 * Extract metadata from first pages
 */
function extractMetadata(pageData, metadata, pageNum) {
    const text = pageData.mainText.toLowerCase();
    
    // Extract title (usually first page, large font, centered)
    if (pageNum === 1 && !metadata.title) {
        const titleMatch = pageData.headers.find(h => h.level === 1);
        if (titleMatch) {
            metadata.title = titleMatch.text;
        } else {
            // Try to extract from first line
            const firstLine = pageData.mainText.split('\n')[0];
            if (firstLine.length > 10 && firstLine.length < 200) {
                metadata.title = firstLine.trim();
            }
        }
    }
    
    // Extract authors (patterns like "Author1, Author2" or "Author1 and Author2")
    if (pageNum === 1) {
        const authorPatterns = [
            /^([A-Z][a-z]+(?:\s+[A-Z]\.?)?(?:\s+[A-Z][a-z]+)*(?:,\s*[A-Z][a-z]+(?:\s+[A-Z]\.?)?(?:\s+[A-Z][a-z]+)*)*)/,
            /authors?[:\s]+([^.\n]+)/i,
        ];
        
        for (const pattern of authorPatterns) {
            const match = pageData.mainText.match(pattern);
            if (match && match[1]) {
                const authors = match[1].split(/[,\n]/).map(a => a.trim()).filter(a => a.length > 0);
                if (authors.length > 0 && authors.length < 20) {
                    metadata.authors = authors;
                    break;
                }
            }
        }
    }
    
    // Extract abstract
    if (pageNum <= 2) {
        const abstractMatch = pageData.mainText.match(/abstract[:\s]+([\s\S]+?)(?:keywords|introduction|background)/i);
        if (abstractMatch && abstractMatch[1]) {
            metadata.abstract = abstractMatch[1].trim().substring(0, 2000);
        }
    }
    
    // Extract keywords
    if (pageNum <= 2) {
        const keywordsMatch = pageData.mainText.match(/keywords?[:\s]+([^\n]+)/i);
        if (keywordsMatch && keywordsMatch[1]) {
            metadata.keywords = keywordsMatch[1]
                .split(/[;,\n]/)
                .map(k => k.trim())
                .filter(k => k.length > 0);
        }
    }
    
    // Extract DOI
    const doiMatch = pageData.mainText.match(/doi[:\s]+([\d.\/]+[^\s]+)/i);
    if (doiMatch && doiMatch[1]) {
        metadata.doi = doiMatch[1].trim();
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
        
        // Try to extract table data (simplified - would need more sophisticated parsing)
        const tableText = extractTableText(pageData.textItems, match.index);
        
        tables.push({
            tableId,
            caption,
            pageNumber: pageNum,
            tableText,
        });
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
function identifySections(pages, sections) {
    let currentSection = null;
    
    for (const pageData of pages) {
        // Check for section headers
        for (const header of pageData.headers) {
            if (header.level <= 2) { // Main sections are usually level 1-2
                if (currentSection) {
                    currentSection.pageEnd = pageData.pageNumber - 1;
                    sections.push(currentSection);
                }
                
                currentSection = {
                    title: header.text,
                    level: header.level,
                    pageStart: pageData.pageNumber,
                    pageEnd: pageData.pageNumber,
                };
            }
        }
    }
    
    // Close last section
    if (currentSection) {
        currentSection.pageEnd = pages[pages.length - 1].pageNumber;
        sections.push(currentSection);
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
        const avgFontSize = lineItems.reduce((sum, item) => sum + item.fontSize, 0) / lineItems.length;
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
 * Extract page number from footer
 */
function extractPageNumber(footerItems) {
    const footerText = footerItems.map(item => item.text).join(' ');
    const pageMatch = footerText.match(/\b(\d+)\b/);
    return pageMatch ? parseInt(pageMatch[1]) : null;
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

