/**
 * Structured Chunking Service
 * Creates chunks that preserve document structure: sections, page numbers, references
 */

/**
 * Split PDF into structured chunks with context preservation
 * @param {Object} structuredData - Output from structuredPDFExtractor
 * @param {number} chunkSize - Target chunk size in characters
 * @param {number} overlap - Overlap between chunks
 * @returns {Array} Array of structured chunks
 */
export function createStructuredChunks(structuredData, chunkSize = 1500, overlap = 150) {
    const chunks = [];
    const { pages, sections, figures, tables } = structuredData;
    
    // Strategy 1: Chunk by sections (preferred)
    if (sections.length > 0) {
        return chunkBySections(structuredData, chunkSize, overlap);
    }
    
    // Strategy 2: Chunk by pages (fallback)
    return chunkByPages(structuredData, chunkSize, overlap);
}

/**
 * Chunk by document sections (best for structured documents)
 */
function chunkBySections(structuredData, chunkSize, overlap) {
    const chunks = [];
    const { pages, sections, figures, tables } = structuredData;
    
    for (const section of sections) {
        // Get all pages in this section
        const sectionPages = pages.filter(p => 
            p.pageNumber >= section.pageStart && p.pageNumber <= section.pageEnd
        );
        
        // Get section text
        const sectionText = sectionPages.map(p => p.mainText).join('\n\n');
        
        // Find figures/tables in this section
        const sectionFigures = figures.filter(f => 
            f.pageNumber >= section.pageStart && f.pageNumber <= section.pageEnd
        );
        const sectionTables = tables.filter(t => 
            t.pageNumber >= section.pageStart && t.pageNumber <= section.pageEnd
        );
        
        // Split section into chunks if it's too long
        const sectionChunks = splitTextWithContext(
            sectionText,
            section.title,
            section.level,
            section.pageStart,
            section.pageEnd,
            sectionFigures,
            sectionTables,
            chunkSize,
            overlap
        );
        
        chunks.push(...sectionChunks);
    }
    
    return chunks;
}

/**
 * Chunk by pages (fallback for unstructured documents)
 */
function chunkByPages(structuredData, chunkSize, overlap) {
    const chunks = [];
    const { pages, figures, tables } = structuredData;
    
    let currentChunk = {
        chunkId: 0,
        text: '',
        sectionTitle: null,
        sectionLevel: 0,
        pageStart: pages[0]?.pageNumber || 1,
        pageEnd: pages[0]?.pageNumber || 1,
        figureReferences: [],
        tableReferences: [],
    };
    
    for (const page of pages) {
        const pageText = page.mainText;
        const pageFigures = figures.filter(f => f.pageNumber === page.pageNumber);
        const pageTables = tables.filter(t => t.pageNumber === page.pageNumber);
        
        // Check if adding this page would exceed chunk size
        const potentialText = currentChunk.text + '\n\n' + pageText;
        
        if (potentialText.length > chunkSize && currentChunk.text.length > 0) {
            // Save current chunk and start new one
            currentChunk.wordCount = currentChunk.text.split(/\s+/).length;
            chunks.push({ ...currentChunk });
            
            // Start new chunk with overlap
            const overlapText = getOverlapText(currentChunk.text, overlap);
            currentChunk = {
                chunkId: chunks.length,
                text: overlapText + '\n\n' + pageText,
                sectionTitle: page.headers[0]?.text || currentChunk.sectionTitle,
                sectionLevel: page.headers[0]?.level || currentChunk.sectionLevel,
                pageStart: page.pageNumber,
                pageEnd: page.pageNumber,
                figureReferences: [],
                tableReferences: [],
            };
        } else {
            // Add page to current chunk
            currentChunk.text += (currentChunk.text ? '\n\n' : '') + pageText;
            currentChunk.pageEnd = page.pageNumber;
        }
        
        // Add figure/table references
        currentChunk.figureReferences.push(...pageFigures.map(f => f.figureId));
        currentChunk.tableReferences.push(...pageTables.map(t => t.tableId));
    }
    
    // Add last chunk
    if (currentChunk.text.length > 0) {
        currentChunk.wordCount = currentChunk.text.split(/\s+/).length;
        chunks.push(currentChunk);
    }
    
    return chunks;
}

/**
 * Split text with full context preservation
 */
function splitTextWithContext(
    text,
    sectionTitle,
    sectionLevel,
    pageStart,
    pageEnd,
    figures,
    tables,
    chunkSize,
    overlap
) {
    const chunks = [];
    const words = text.split(/\s+/);
    let currentChunk = {
        chunkId: chunks.length,
        text: '',
        sectionTitle,
        sectionLevel,
        pageStart,
        pageEnd,
        figureReferences: [],
        tableReferences: [],
    };
    
    // Estimate page distribution for this section
    const pagesInSection = pageEnd - pageStart + 1;
    const wordsPerPage = Math.ceil(words.length / pagesInSection);
    
    for (let i = 0; i < words.length; i += chunkSize - overlap) {
        const chunkWords = words.slice(i, i + chunkSize);
        const chunkText = chunkWords.join(' ');
        
        // Estimate which page this chunk is on
        const wordsBefore = i;
        const estimatedPage = Math.floor(wordsBefore / wordsPerPage) + pageStart;
        
        // Find figures/tables that might be referenced in this chunk
        const chunkFigures = figures.filter(f => 
            Math.abs(f.pageNumber - estimatedPage) <= 1
        );
        const chunkTables = tables.filter(t => 
            Math.abs(t.pageNumber - estimatedPage) <= 1
        );
        
        // Check for figure/table mentions in text
        const figureMentions = extractReferences(chunkText, /(?:figure|fig\.?)\s+(\d+(?:\.\d+)*)/gi, 'Figure');
        const tableMentions = extractReferences(chunkText, /(?:table|tab\.?)\s+(\d+(?:\.\d+)*)/gi, 'Table');
        
        currentChunk = {
            chunkId: chunks.length,
            text: chunkText,
            sectionTitle,
            sectionLevel,
            pageStart: estimatedPage,
            pageEnd: estimatedPage,
            figureReferences: [...new Set([...chunkFigures.map(f => f.figureId), ...figureMentions])],
            tableReferences: [...new Set([...chunkTables.map(t => t.tableId), ...tableMentions])],
            wordCount: chunkWords.length,
            startIndex: i,
            endIndex: Math.min(i + chunkSize, words.length),
        };
        
        chunks.push(currentChunk);
    }
    
    return chunks;
}

/**
 * Extract references from text (e.g., "Figure 1", "Table 2")
 */
function extractReferences(text, pattern, prefix) {
    const matches = [...text.matchAll(pattern)];
    return matches.map(match => {
        const id = match[1];
        return `${prefix} ${id}`;
    });
}

/**
 * Get overlap text from previous chunk
 */
function getOverlapText(text, overlapLength) {
    const words = text.split(/\s+/);
    if (words.length <= overlapLength) return text;
    
    const overlapWords = words.slice(-overlapLength);
    return overlapWords.join(' ');
}

/**
 * Create chunk with metadata prefix
 */
export function formatChunkWithMetadata(chunk, pdfMetadata) {
    let formattedText = '';
    
    // Add section context
    if (chunk.sectionTitle) {
        formattedText += `[Section: ${chunk.sectionTitle}]\n`;
    }
    
    // Add page context
    if (chunk.pageStart === chunk.pageEnd) {
        formattedText += `[Page ${chunk.pageStart}]\n`;
    } else {
        formattedText += `[Pages ${chunk.pageStart}-${chunk.pageEnd}]\n`;
    }
    
    // Add figure references
    if (chunk.figureReferences && chunk.figureReferences.length > 0) {
        formattedText += `[Figures: ${chunk.figureReferences.join(', ')}]\n`;
    }
    
    // Add table references
    if (chunk.tableReferences && chunk.tableReferences.length > 0) {
        formattedText += `[Tables: ${chunk.tableReferences.join(', ')}]\n`;
    }
    
    formattedText += '\n' + chunk.text;
    
    return formattedText;
}

