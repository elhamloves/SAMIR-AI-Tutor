// Local Embeddings Service using @xenova/transformers
import { pipeline } from "@xenova/transformers";

class EmbeddingsService {
    constructor() {
        this.embedder = null;
        this.isLoading = false;
        this.modelName = "Xenova/all-MiniLM-L6-v2"; // Lightweight embedding model
    }

    /**
     * Initialize the embedding model
     */
    async initialize() {
        if (this.embedder) {
            console.log("Embeddings model already loaded");
            return { success: true };
        }

        // If previous initialization failed, don't retry immediately
        if (this.initFailed) {
            console.warn("Embeddings model initialization previously failed, skipping");
            return { success: false, error: "Previous initialization failed" };
        }

        this.isLoading = true;

        try {
            console.log("Loading embeddings model:", this.modelName);
            
            // Load the embedding pipeline with timeout
            const timeoutPromise = new Promise((_, reject) => 
                setTimeout(() => reject(new Error('Model loading timeout')), 30000)
            );
            
            const loadPromise = pipeline(
                "feature-extraction",
                this.modelName,
                {
                    quantized: true,
                    // Add error handling for model loading
                    progress_callback: (progress) => {
                        if (progress.status === 'error') {
                            throw new Error('Model loading error: ' + progress.message);
                        }
                    }
                }
            );
            
            this.embedder = await Promise.race([loadPromise, timeoutPromise]);

            this.isLoading = false;
            console.log("✅ Embeddings model loaded successfully");
            
            return { success: true };
        } catch (error) {
            console.error("❌ Error loading embeddings model:", error);
            console.warn("⚠️ Falling back to keyword-based search (embeddings disabled)");
            this.isLoading = false;
            this.initFailed = true; // Mark as failed to prevent retries
            this.embedder = null; // Ensure embedder is null
            return { success: false, error: error.message };
        }
    }

    /**
     * Generate embeddings for text
     */
    async embed(text) {
        // If embedder is not available or failed to initialize, throw error
        if (!this.embedder) {
            const initResult = await this.initialize();
            if (!initResult.success || !this.embedder) {
                throw new Error("Embeddings model not available. Using keyword search fallback.");
            }
        }

        // Verify embedder is a function
        if (typeof this.embedder !== 'function') {
            throw new Error("Embedder is not a function. Using keyword search fallback.");
        }

        try {
            const output = await this.embedder(text, {
                pooling: "mean",
                normalize: true
            });

            // Extract the embedding vector
            const embedding = Array.from(output.data);
            return embedding;
        } catch (error) {
            console.error("Error generating embedding:", error);
            // Reset embedder on error to allow retry
            this.embedder = null;
            throw error;
        }
    }

    /**
     * Generate embeddings for multiple texts (batch)
     */
    async embedBatch(texts) {
        if (!this.embedder) {
            await this.initialize();
        }

        try {
            const embeddings = await Promise.all(
                texts.map(text => this.embed(text))
            );
            return embeddings;
        } catch (error) {
            console.error("Error generating batch embeddings:", error);
            throw error;
        }
    }

    /**
     * Split text into chunks for RAG
     */
    splitIntoChunks(text, chunkSize = 500, overlap = 50) {
        const chunks = [];
        const words = text.split(/\s+/);
        
        for (let i = 0; i < words.length; i += chunkSize - overlap) {
            const chunk = words.slice(i, i + chunkSize).join(' ');
            if (chunk.trim().length > 0) {
                chunks.push({
                    text: chunk.trim(),
                    startIndex: i,
                    endIndex: Math.min(i + chunkSize, words.length)
                });
            }
        }
        
        return chunks;
    }

    /**
     * Calculate cosine similarity between two vectors
     */
    cosineSimilarity(vecA, vecB) {
        if (vecA.length !== vecB.length) {
            throw new Error("Vectors must have the same length");
        }

        let dotProduct = 0;
        let normA = 0;
        let normB = 0;

        for (let i = 0; i < vecA.length; i++) {
            dotProduct += vecA[i] * vecB[i];
            normA += vecA[i] * vecA[i];
            normB += vecB[i] * vecB[i];
        }

        return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
    }

    /**
     * Find most similar chunks for a query
     */
    async findSimilarChunks(query, chunks, topK = 3) {
        try {
            // Check if embedder is available
            if (!this.embedder) {
                const initResult = await this.initialize();
                if (!initResult.success || !this.embedder) {
                    throw new Error("Embeddings not available");
                }
            }
            
            // Verify embedder is a function
            if (typeof this.embedder !== 'function') {
                throw new Error("Embedder is not a function");
            }

            // Generate embedding for query
            const queryEmbedding = await this.embed(query);

            // Generate embeddings for all chunks (in batches to avoid memory issues)
            const chunkEmbeddings = await this.embedBatch(chunks.map(chunk => chunk.text));

            // Calculate similarities
            const similarities = chunkEmbeddings.map((chunkEmbedding, index) => ({
                chunk: chunks[index],
                similarity: this.cosineSimilarity(queryEmbedding, chunkEmbedding)
            }));

            // Sort by similarity and return top K
            similarities.sort((a, b) => b.similarity - a.similarity);
            
            return similarities.slice(0, topK).map(item => item.chunk);
        } catch (error) {
            console.error("Error finding similar chunks:", error);
            // Don't throw - let caller handle fallback
            throw error;
        }
    }
}

// Export singleton instance
export const embeddingsService = new EmbeddingsService();

