import React, { useState, useRef, useEffect } from 'react';

function isArabic(text) {
    if (!text || typeof text !== 'string') return false;
    return /[\u0600-\u06FF]/.test(text.trim());
}

const ChatInterface = ({ 
    chatTitle, 
    detectiveMode = false,
    chatContainerRef,
    fileContent,
    handleChatFileUpload,
    uploadFile,
    isLoading,
    isChatLoaded,
    chatHistory,
    profile,
    handleSendMessage,
    chatInputRef,
    input,
    setInput,
    chatEndRef
}) => {
    const [isDragging, setIsDragging] = useState(false);
    const [isInputFocused, setIsInputFocused] = useState(false);
    const fileInputRef = useRef(null);
    
    useEffect(() => {
        if (!chatContainerRef?.current) return;
        const container = chatContainerRef.current;
        const isAtBottom = 
            container.scrollHeight - container.scrollTop - container.clientHeight < 100;
        if (isAtBottom && chatHistory.length > 0) {
            requestAnimationFrame(() => {
                if (chatEndRef?.current) {
                    chatEndRef.current.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
                }
            });
        }
    }, [chatHistory, isLoading, chatContainerRef, chatEndRef]);
    
    const handleDragOver = (e) => {
        e.preventDefault();
        setIsDragging(true);
    };
    
    const handleDragLeave = (e) => {
        e.preventDefault();
        setIsDragging(false);
    };
    
    const handleDrop = async (e) => {
        e.preventDefault();
        setIsDragging(false);
        const file = e.dataTransfer.files?.[0];
        if (file) {
            try {
                await uploadFile({ target: { files: [file] } });
            } catch (error) {
                console.error('Drag and drop upload error:', error);
            }
        }
    };
    
    return (
        <div className="relative w-full mx-auto">
            <div className="flex flex-col h-full w-full mx-auto rounded-2xl overflow-hidden relative z-0 bg-white/[0.03] shadow-2xl" style={{ boxShadow: '0 25px 50px -12px rgba(0,0,0,0.4)' }}>
            {/* Minimal Header Strip */}
            <div className={`px-6 py-2 flex-shrink-0 ${detectiveMode 
                ? 'bg-gradient-to-r from-rose-600/10 via-pink-500/10 to-violet-600/10' 
                : 'bg-gradient-to-r from-[#7c3aed]/10 via-violet-500/10 to-[#2563eb]/10'} backdrop-blur-sm`}>
            </div>
            
            {/* Chat Messages Area */}
            <div 
                ref={chatContainerRef}
                className="flex-1 overflow-y-auto p-6 chat-scroll-area"
                style={{ 
                    scrollBehavior: 'smooth',
                    minHeight: 0,
                    overscrollBehavior: 'contain',
                    maxHeight: 'calc(100vh - 280px)',
                    background: 'transparent'
                }}
            >
                {/* Upload Zone - lighter blue (twilight), white on hover */}
                {!fileContent && (
                    <div 
                        className="mb-8 p-12 rounded-2xl transition-all duration-300 border border-dashed border-[#3b82f6]/20 hover:border-[#3b82f6]/40 group"
                        style={{ background: isDragging ? 'rgba(30, 58, 138, 0.25)' : 'rgba(30, 58, 138, 0.15)' }}
                        onDragOver={handleDragOver}
                        onDragLeave={handleDragLeave}
                        onDrop={handleDrop}
                    >
                        <input
                            ref={fileInputRef}
                            type="file"
                            className="hidden"
                            accept=".pdf,.txt,.md,.csv,.markdown,.png,.jpg,.jpeg,.gif"
                            onChange={handleChatFileUpload}
                            disabled={isLoading}
                        />
                        <button type="button" onClick={() => fileInputRef.current?.click()} disabled={isLoading} className="w-full text-center focus:outline-none group-hover:text-white text-sky-200/90 transition-colors">
                            <div className="mb-4 inline-flex items-center justify-center w-16 h-16 rounded-2xl border border-dashed border-sky-400/30 group-hover:border-white/40 text-sky-300/80 group-hover:text-white transition-all">
                                <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                                </svg>
                            </div>
                            <p className="text-sm text-sky-200/90 group-hover:text-white mb-1 transition-colors">Drag & drop or click to upload</p>
                            <p className="text-xs text-sky-300/70 group-hover:text-white/80 transition-colors">PDF, TXT, MD, Images</p>
                        </button>
                    </div>
                )}
                
                {/* File Preview */}
                {fileContent && (
                    <div className="mb-6 p-5 rounded-2xl flex items-center justify-between" style={{ background: 'rgba(16,185,129,0.1)' }}>
                        <div className="flex items-center space-x-3">
                            <svg className="h-6 w-6 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
                            </svg>
                            <div>
                                <p className="text-sm font-medium text-white">{fileContent.name}</p>
                                <p className="text-xs text-[#94a3b8]">{Math.round(fileContent.size / 1024)} KB</p>
                            </div>
                        </div>
                        <button
                            onClick={() => fileInputRef.current?.click()}
                            className="text-xs text-[#94a3b8] hover:text-white font-medium transition-colors"
                        >
                            Replace File
                        </button>
                    </div>
                )}
                
                {isChatLoaded && chatHistory.length === 0 && !fileContent && (
                    <div className="text-center py-16 text-[#94a3b8]">
                        <p className="text-lg">Upload a document to start chatting with Samir</p>
                    </div>
                )}
                
                {/* Chat Bubbles - واسعة مع مساحة تنفس */}
                <div className="flex flex-col gap-10">
                    {isChatLoaded && chatHistory.map((msg, index) => (
                        <div 
                            key={index} 
                            className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'} w-full`}
                        >
                            <div 
                                className={`min-w-0 p-6 ${
                                    msg.role === 'user' 
                                        ? 'max-w-[95%] md:max-w-[90%] rounded-[20px] rounded-tr-none bg-gradient-to-br from-[#6366f1] to-[#a855f7] text-white shadow-[0_10px_30px_-10px_rgba(99,102,241,0.5)]' 
                                        : 'max-w-[90%] md:max-w-[85%] rounded-[20px] rounded-tl-none bg-slate-900/60 backdrop-blur-md border border-white/[0.03] shadow-2xl'
                                }`}
                            >
                                {msg.role !== 'user' && (
                                    <p className="text-xs font-semibold mb-2 opacity-90 text-[#94a3b8]">
                                        {detectiveMode ? 'Case Handler' : 'Samir'}
                                    </p>
                                )}
                                <p className="chat-bubble whitespace-pre-wrap text-[16px] leading-relaxed" style={{ color: '#ffffff' }} dir="auto">
                                    {msg.parts[0]?.text}
                                </p>
                            </div>
                        </div>
                    ))}
                </div>
                
                {isLoading && (
                    <div className="flex justify-start w-full mb-8">
                        <div className="max-w-[90%] md:max-w-[85%] rounded-[20px] rounded-tl-none p-6 bg-slate-900/60 backdrop-blur-md border border-white/[0.03] shadow-2xl">
                            <p className="text-xs font-semibold mb-2 text-[#94a3b8] opacity-90">{detectiveMode ? 'Case Handler' : 'Samir'}</p>
                            <div className="flex space-x-1">
                                <div className="w-2 h-2 bg-purple-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }}></div>
                                <div className="w-2 h-2 bg-violet-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }}></div>
                                <div className="w-2 h-2 bg-purple-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }}></div>
                            </div>
                        </div>
                    </div>
                )}
                <div ref={chatEndRef} />
            </div>

            {/* Input Bar - soft depth, no harsh borders */}
            <div className="p-4 flex-shrink-0 z-10 rounded-b-2xl bg-white/[0.03] shadow-[0_-4px_24px_rgba(0,0,0,0.2)]">
                <form onSubmit={handleSendMessage} className="flex items-center gap-3">
                    <div className="flex-1 relative">
                        <input
                            ref={chatInputRef}
                            type="text"
                            value={input}
                            dir={isArabic(input) ? 'rtl' : 'ltr'}
                            onChange={(e) => {
                                const v = e.target.value;
                                setInput(v);
                                if (chatContainerRef?.current) {
                                    const container = chatContainerRef.current;
                                    const scrollTop = container.scrollTop;
                                    const scrollHeight = container.scrollHeight;
                                    requestAnimationFrame(() => {
                                        if (container.scrollHeight === scrollHeight) {
                                            container.scrollTop = scrollTop;
                                        }
                                    });
                                }
                            }}
                            onFocus={() => setIsInputFocused(true)}
                            onBlur={() => setIsInputFocused(false)}
                            autoFocus={false}
                            placeholder={fileContent ? "اكتب رسالتك... / Type your message..." : "Upload a file to begin..."}
                            className="w-full py-3 px-4 text-base text-white placeholder-[#64748b] bg-transparent disabled:opacity-50 transition-all duration-300 rounded-lg"
                            style={{
                                border: 'none',
                                borderBottom: isInputFocused ? '2px solid rgba(124, 58, 237, 0.8)' : '1px solid rgba(255,255,255,0.06)',
                                boxShadow: 'none'
                            }}
                            disabled={!fileContent || isLoading}
                            readOnly={!fileContent || isLoading}
                        />
                    </div>
                    <button
                        type="submit"
                        className="flex-shrink-0 w-12 h-12 flex items-center justify-center rounded-full transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed"
                        style={{
                            background: 'linear-gradient(135deg, #7c3aed 0%, #38bdf8 100%)',
                            boxShadow: '0 0 25px rgba(124, 58, 237, 0.5)'
                        }}
                        disabled={isLoading || !input.trim() || !fileContent}
                        title="Send"
                    >
                        <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                        </svg>
                    </button>
                </form>
            </div>
        </div>
        </div>
    );
};

export default ChatInterface;
