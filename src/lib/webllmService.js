// WebLLM Service - Local AI models in the browser
import * as webllm from "@mlc-ai/web-llm";

// Model configurations - Using TinyLlama as it's the most reliable and widely available
// WebLLM model names must match exactly what's in their model registry
const MODELS = {
    powerful: "TinyLlama-1.1B-Chat-v0.4-q4f32_1-MLC-1k", // Small, fast, reliable model
    default: "TinyLlama-1.1B-Chat-v0.4-q4f32_1-MLC-1k", // Default - using TinyLlama for reliability
    fallback: "TinyLlama-1.1B-Chat-v0.4-q4f32_1-MLC-1k" // Fallback - same model
};

// Note: To use larger models, you may need to check WebLLM's model registry:
// https://github.com/mlc-ai/web-llm/blob/main/src/config.ts
// Common available models include:
// - "TinyLlama-1.1B-Chat-v0.4-q4f32_1-MLC-1k" (smallest, fastest)
// - "Phi-3-mini-4k-instruct-q4f16_1-MLC" (if available in your version)

// Model size in MB (approximate)
const MODEL_SIZES = {
    powerful: 4500, // ~4.5 GB
    default: 4200,  // ~4.2 GB
    fallback: 2000  // ~2 GB
};

class WebLLMService {
    constructor() {
        this.engine = null;
        this.currentModel = null;
        this.isLoading = false;
        this.loadProgress = 0;
        this.deviceCapability = null;
        this.progressCallback = null;
    }

    /**
     * Detect WebGPU capability and device performance
     */
    async detectDeviceCapability() {
        try {
            // Check for WebGPU support
            if (!navigator.gpu) {
                console.warn("WebGPU not available, using CPU (slower)");
                return { hasWebGPU: false, capability: 'fallback' };
            }

            // Request adapter to check WebGPU availability
            const adapter = await navigator.gpu.requestAdapter();
            if (!adapter) {
                console.warn("WebGPU adapter not available");
                return { hasWebGPU: false, capability: 'fallback' };
            }

            // Get device info
            const device = await adapter.requestDevice();
            
            // Check device limits (approximate performance indicator)
            const limits = device.limits;
            
            // Estimate device capability based on available memory and compute
            // This is a rough heuristic
            let capability = 'default';
            
            // Check if device seems powerful (high limits suggest better GPU)
            if (limits.maxBufferSize >= 2147483648) { // 2GB+ buffer
                capability = 'powerful';
            } else if (limits.maxBufferSize < 536870912) { // Less than 512MB
                capability = 'fallback';
            }

            device.destroy(); // Clean up

            return {
                hasWebGPU: true,
                capability,
                limits
            };
        } catch (error) {
            console.error("Error detecting device capability:", error);
            return { hasWebGPU: false, capability: 'fallback', error: error.message };
        }
    }

    /**
     * Select appropriate model based on device capability
     */
    selectModel(capability) {
        switch (capability) {
            case 'powerful':
                return MODELS.powerful;
            case 'default':
                return MODELS.default;
            case 'fallback':
            default:
                return MODELS.fallback;
        }
    }

    /**
     * Initialize and load the model
     */
    async initialize(progressCallback = null) {
        if (this.engine && this.currentModel) {
            console.log("WebLLM already initialized with model:", this.currentModel);
            return { success: true, model: this.currentModel };
        }

        this.progressCallback = progressCallback;
        this.isLoading = true;
        this.loadProgress = 0;

        try {
            // Detect device capability
            console.log("Detecting device capability...");
            this.deviceCapability = await this.detectDeviceCapability();
            console.log("Device capability:", this.deviceCapability);

            // Select appropriate model
            const selectedModel = this.selectModel(this.deviceCapability.capability);
            console.log("Selected model:", selectedModel);

            // Create engine
            if (!this.engine) {
                this.engine = new webllm.MLCEngine({
                    initProgressCallback: (report) => {
                        this.loadProgress = report.progress;
                        if (this.progressCallback) {
                            this.progressCallback(report);
                        }
                        console.log(`Loading ${selectedModel}: ${(report.progress * 100).toFixed(1)}%`);
                    }
                });
            }

            // Load model with better error handling
            console.log(`Loading model: ${selectedModel}...`);
            console.log(`This may take 1-3 minutes on first load. Model will be cached after download.`);
            
            try {
                await this.engine.reload(selectedModel);
            } catch (reloadError) {
                console.error(`Model reload error:`, reloadError);
                // Provide more helpful error message
                if (reloadError.message && reloadError.message.includes('fetch')) {
                    throw new Error(`Failed to download model: Network error. Check your internet connection. If using incognito mode, try regular browser mode. Model: ${selectedModel}`);
                }
                throw reloadError;
            }
            
            this.currentModel = selectedModel;
            this.isLoading = false;
            this.loadProgress = 1;

            console.log(`✅ Model ${selectedModel} loaded successfully!`);

            return {
                success: true,
                model: selectedModel,
                capability: this.deviceCapability
            };
        } catch (error) {
            console.error("Error initializing WebLLM:", error);
            this.isLoading = false;
            return {
                success: false,
                error: error.message
            };
        }
    }

    /**
     * Chat with the model
     * WebLLM uses generate() method that accepts messages array or chat completions format
     */
    async chat(messages, options = {}) {
        if (!this.engine) {
            throw new Error("WebLLM engine not initialized. Call initialize() first.");
        }

        try {
            // WebLLM supports OpenAI-compatible chat completions format
            // Convert to format expected by WebLLM
            let chatMessages = [];
            
            if (typeof messages === 'string') {
                chatMessages = [{ role: 'user', content: messages }];
            } else if (Array.isArray(messages)) {
                // Filter out system messages and convert to user/assistant format
                // System messages are typically prepended to the first user message
                let systemContent = '';
                chatMessages = messages
                    .filter(msg => {
                        if (msg.role === 'system') {
                            systemContent += msg.content + '\n\n';
                            return false;
                        }
                        return true;
                    })
                    .map(msg => ({
                        role: msg.role === 'assistant' ? 'assistant' : 'user',
                        content: msg.content
                    }));
                
                // Prepend system content to first user message if exists
                if (systemContent && chatMessages.length > 0 && chatMessages[0].role === 'user') {
                    chatMessages[0].content = systemContent + chatMessages[0].content;
                }
            } else {
                throw new Error("Invalid messages format. Expected string or array of messages.");
            }

            // WebLLM's chat API - check if it supports chat.completions or direct chat method
            let response;
            
            // Try chat.completions format first (OpenAI-compatible)
            if (this.engine.chat?.completions?.create) {
                response = await this.engine.chat.completions.create({
                    messages: chatMessages,
                    ...options
                });
                
                if (response?.choices?.[0]?.message?.content) {
                    return response.choices[0].message.content;
                }
            }
            
            // Fallback: try direct chat method
            if (this.engine.chat) {
                response = await this.engine.chat({
                    messages: chatMessages,
                    ...options
                });
                
                if (typeof response === 'string') {
                    return response;
                } else if (response?.text) {
                    return response.text;
                } else if (response?.content) {
                    return response.content;
                }
            }
            
            // Last fallback: build prompt and use generate
            let prompt = '';
            for (const msg of chatMessages) {
                if (msg.role === 'user') {
                    prompt += `User: ${msg.content}\n\n`;
                } else if (msg.role === 'assistant') {
                    prompt += `Assistant: ${msg.content}\n\n`;
                }
            }
            prompt += 'Assistant: ';
            
            response = await this.engine.generate(prompt, options);
            
            return typeof response === 'string' ? response : String(response);
        } catch (error) {
            console.error("Error in WebLLM chat:", error);
            throw error;
        }
    }

    /**
     * Check if model is loaded
     */
    isReady() {
        return this.engine !== null && this.currentModel !== null;
    }

    /**
     * Get current model info
     */
    getModelInfo() {
        return {
            model: this.currentModel,
            capability: this.deviceCapability?.capability || 'unknown',
            hasWebGPU: this.deviceCapability?.hasWebGPU || false,
            isLoading: this.isLoading,
            progress: this.loadProgress
        };
    }
}

// Export singleton instance
export const webllmService = new WebLLMService();
