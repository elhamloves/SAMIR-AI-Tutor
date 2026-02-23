import React, { useState, useEffect, useCallback, useRef, Component } from 'react';
import { supabase } from './lib/supabaseClient';
import { webllmService } from './lib/webllmService';
import { embeddingsService } from './lib/embeddingsService';
import { splitIntoChunks, storePDFChunks, searchPDFChunks } from './lib/pdfChunksService';
import { getCachedQuery, setCachedQuery } from './lib/queryCache';
import { getRelevantChunksForQuery, buildPDFPrompt } from './lib/pdfRAGService';
import { getStrictPDFPrompt, formatForWebLLM, validatePDFChunksExist, detectMode } from './lib/strictPDFChat';
import { detectLanguage } from './lib/languageDetector';
import Tesseract from 'tesseract.js';
import { processPDFWithBackend, checkBackendHealth } from './lib/pdfBackendService';
import { storePDFMetadata, getPDFMetadata } from './lib/pdfMetadataService';
import LoadingState from './components/LoadingState';
import StatCard from './components/StatCard';
import SummaryCard from './components/SummaryCard';
import AboutMode from './components/AboutMode';
import ChatInterface from './components/ChatInterface';

// --- GLOBAL ERROR HANDLERS (Force all errors to show in console) ---
window.onerror = function (msg, url, line, col, error) {
    console.error("🚨🚨🚨 GLOBAL ERROR 🚨🚨🚨");
    console.error("Message:", msg);
    console.error("URL:", url);
    console.error("Line:", line, "Col:", col);
    console.error("Error object:", error);
    console.error("Stack:", error?.stack);
    alert("GLOBAL ERROR: " + msg + "\nCheck console for details (F12)");
    return false; // Allow default error handling to continue
};

window.onunhandledrejection = function (e) {
    console.error("🚨🚨🚨 UNHANDLED PROMISE REJECTION 🚨🚨🚨");
    console.error("Reason:", e.reason);
    console.error("Promise:", e.promise);
    if (e.reason) {
        console.error("Error message:", e.reason?.message);
        console.error("Error stack:", e.reason?.stack);
        console.error("Full error:", e.reason);
        alert("UNHANDLED PROMISE REJECTION: " + (e.reason?.message || String(e.reason)) + "\nCheck console for details (F12)");
    }
    // Prevent default browser error handling
    e.preventDefault();
};

// --- Global Environment Variables ---

// Firebase removed for local-first fallback

// Ollama Model and Host (set VITE_OLLAMA_MODEL and VITE_OLLAMA_HOST in .env)
const HF_API_KEY = import.meta.env.VITE_HF_API_KEY;
// Default model: meta-llama/Llama-3.1-8B-Instruct (note: lowercase 'llama' matches router endpoint format)
// Support both Meta-Llama-3-8B-Instruct (Llama 3) and Llama-3.1-8B-Instruct (Llama 3.1)
const HF_LLAMA3_MODEL = import.meta.env.VITE_HF_LLAMA3_MODEL || 'meta-llama/Llama-3.1-8B-Instruct';
const HF_JAIS_MODEL = import.meta.env.VITE_HF_JAIS_MODEL || 'jais-ai/jais-30b-chat-v3';

// --- Ollama API Configuration ---
// GEMINI_MODEL is no longer used
// API_URL is no longer used, we will use specific Ollama endpoints

// --- Multilingual Support ---
const translations = {
        en: {
            app_title: "Samir",
            tab_tutor: "Tutor",
            tab_quiz: "Quiz",
            tab_tracker: "Tracker",
            tab_schedule: "Schedule",
            tab_groups: "Groups",
            tab_community: "Community",
            sign_out: "Sign Out",
            welcome_message: "Hello! I am Samir, your AI Tutor. Upload a PDF or document to begin an interactive learning session.",
            upload_file: "Upload PDF/Document",
            generate_quiz: "Generate Quiz",
            enter_message: "Enter your message...",
            loading: "Loading...",
            error_prefix: "Error:",
            success_prefix: "Success:",
            profile_editor_title: "Update Profile",
            name_label: "Name",
            detective_id_label: "Detective ID",
            save_profile: "Save Profile",
            reset_local_data: "Reset Local Data",
            quiz_title: "Quiz",
            quiz_question: "Question",
            quiz_submit: "Submit Answer",
            quiz_next: "Next Question",
            quiz_finish: "Finish Quiz",
            quiz_results: "Quiz Results",
            quiz_score: "Score",
            quiz_time: "Time Taken",
            quiz_correct: "Correct",
            quiz_incorrect: "Incorrect",
            tracker_title: "Tracker",
            tracker_last_quiz: "Last Quiz",
            tracker_weaknesses: "Top Weaknesses",
            tracker_strengths: "Top Strengths",
            schedule_title: "Schedule",
            groups_title: "Groups",
            community_title: "Community",
            language_select: "Language",
            mode_tutor: "Tutor Mode",
            mode_detective: "Hunt Mode",
            send: "Send",
            of: "of",
            quiz_ready_message: "A new structured quiz is ready! Head over to the **Quiz** tab to begin your test.",
            error_ai_communication: "Error communicating with the AI. Please ensure your Hugging Face API key is correct.",
            error_quiz_json_fail: "Quiz generation failed: Invalid JSON structure returned by AI. Raw text: ",
            error_quiz_empty: "Quiz generation failed: AI returned an empty or unexpected JSON array.",
            error_quiz_invalid_response: "Failed to generate quiz: The AI returned an invalid response. Please try again or simplify your document content.",
            error_file_processing: "Error processing file: {error}",
            error_unsupported_file: "Unsupported file type. Please upload a PDF or text file.",
            error_empty_file: "The uploaded file appears to be empty.",
            error_file_too_large: "File is too large. Maximum file size is 60 MB. Please use a smaller file or compress your PDF.",
            file_processed_success: "File '{fileName}' processed successfully!",
            file_loaded_message: "File '{fileName}' ({fileSize} KB) has been loaded. You can now ask questions about it.",
            mode_label: "Mode",
        },
        ar: {
            app_title: "سمير: معلم الذكاء الاصطناعي المجاني وغير المتصل",
            tab_tutor: "معلم الذكاء الاصطناعي",
            tab_quiz: "اختبار منظم",
            tab_tracker: "متتبع التقدم",
            tab_schedule: "الجدول الزمني",
            tab_groups: "المجموعات",
            tab_community: "المجتمع",
            sign_out: "تسجيل الخروج",
            welcome_message: "مرحباً! أنا سمير، معلمك بالذكاء الاصطناعي. قم بتحميل ملف PDF أو مستند لبدء جلسة تعلم تفاعلية.",
            upload_file: "تحميل ملف PDF/مستند",
            generate_quiz: "إنشاء اختبار",
            enter_message: "أدخل رسالتك...",
            loading: "جارٍ التحميل...",
            error_prefix: "خطأ:",
            success_prefix: "نجاح:",
            profile_editor_title: "تحديث الملف الشخصي",
            name_label: "الاسم",
            detective_id_label: "معرف المحقق",
            save_profile: "حفظ الملف الشخصي",
            reset_local_data: "إعادة تعيين البيانات المحلية",
            quiz_title: "اختبار منظم",
            quiz_question: "سؤال",
            quiz_submit: "إرسال الإجابة",
            quiz_next: "السؤال التالي",
            quiz_finish: "إنهاء الاختبار",
            quiz_results: "نتائج الاختبار",
            quiz_score: "النتيجة",
            quiz_time: "الوقت المستغرق",
            quiz_correct: "صحيح",
            quiz_incorrect: "غير صحيح",
            tracker_title: "متتبع التقدم",
            tracker_last_quiz: "آخر اختبار",
            tracker_weaknesses: "نقاط الضعف الرئيسية",
            tracker_strengths: "نقاط القوة الرئيسية",
            schedule_title: "الجدول الزمني",
            groups_title: "المجموعات",
            community_title: "المجتمع",
            language_select: "اللغة",
            mode_tutor: "وضع المعلم",
            mode_detective: "وضع البحث",
            send: "إرسال",
            of: "من",
            quiz_ready_message: "اختبار منظم جديد جاهز! انتقل إلى علامة التبويب **الاختبار المنظم** لبدء الاختبار.",
            error_ai_communication: "خطأ في الاتصال بالذكاء الاصطناعي. يرجى التأكد من صحة مفتاح API الخاص بـ Hugging Face.",
            error_quiz_json_fail: "فشل إنشاء الاختبار: هيكل JSON غير صالح تم إرجاعه بواسطة الذكاء الاصطناعي. النص الخام: ",
            error_quiz_empty: "فشل إنشاء الاختبار: أرجع الذكاء الاصطناعي مصفوفة JSON فارغة أو غير متوقعة.",
            error_quiz_invalid_response: "فشل إنشاء الاختبار: أرجع الذكاء الاصطناعي استجابة غير صالحة. يرجى المحاولة مرة أخرى أو تبسيط محتوى المستند.",
            error_file_processing: "خطأ في معالجة الملف: {error}",
            error_unsupported_file: "نوع الملف غير مدعوم. يرجى تحميل ملف PDF أو ملف نصي.",
            error_empty_file: "يبدو أن الملف المرفوع فارغ.",
            error_file_too_large: "الملف كبير جداً. الحد الأقصى لحجم الملف هو 60 ميجابايت. يرجى استخدام ملف أصغر أو ضغط ملف PDF الخاص بك.",
            file_processed_success: "تم معالجة الملف '{fileName}' بنجاح!",
            file_loaded_message: "تم تحميل الملف '{fileName}' ({fileSize} KB). يمكنك الآن طرح الأسئلة حوله.",
            mode_label: "الوضع",
        },
        es: {
            app_title: "Samir: El Tutor de IA Gratuito y sin Conexión",
            tab_tutor: "Tutor de IA",
            tab_quiz: "Cuestionario Estructurado",
            tab_tracker: "Seguimiento de Progreso",
            tab_schedule: "Horario",
            tab_groups: "Grupos",
            tab_community: "Comunidad",
            sign_out: "Cerrar Sesión",
            welcome_message: "¡Hola! Soy Samir, tu Tutor de IA. Sube un PDF o documento para comenzar una sesión de aprendizaje interactiva.",
            upload_file: "Subir PDF/Documento",
            generate_quiz: "Generar Cuestionario",
            enter_message: "Escribe tu mensaje...",
            loading: "Cargando...",
            error_prefix: "Error:",
            success_prefix: "Éxito:",
            profile_editor_title: "Actualizar Perfil",
            name_label: "Nombre",
            detective_id_label: "ID de Detective",
            save_profile: "Guardar Perfil",
            reset_local_data: "Restablecer Datos Locales",
            quiz_title: "Cuestionario Estructurado",
            quiz_question: "Pregunta",
            quiz_submit: "Enviar Respuesta",
            quiz_next: "Siguiente Pregunta",
            quiz_finish: "Finalizar Cuestionario",
            quiz_results: "Resultados del Cuestionario",
            quiz_score: "Puntuación",
            quiz_time: "Tiempo Empleado",
            quiz_correct: "Correcto",
            quiz_incorrect: "Incorrecto",
            tracker_title: "Seguimiento de Progreso",
            tracker_last_quiz: "Último Cuestionario",
            tracker_weaknesses: "Principales Debilidades",
            tracker_strengths: "Principales Fortalezas",
            schedule_title: "Horario",
            groups_title: "Grupos",
            community_title: "Comunidad",
            language_select: "Idioma",
            mode_tutor: "Modo Tutor",
            mode_detective: "Modo Caza",
            send: "Enviar",
            of: "de",
            quiz_ready_message: "¡Un nuevo cuestionario estructurado está listo! Dirígete a la pestaña **Cuestionario Estructurado** para comenzar tu prueba.",
            error_ai_communication: "Error de comunicación con la IA. Asegúrate de que tu clave API de Hugging Face sea correcta.",
            error_quiz_json_fail: "Fallo en la generación del cuestionario: la IA devolvió una estructura JSON no válida. Texto sin procesar: ",
            error_quiz_empty: "Fallo en la generación del cuestionario: la IA devolvió una matriz JSON vacía o inesperada.",
            error_quiz_invalid_response: "Fallo en la generación del cuestionario: la IA devolvió una respuesta no válida. Inténtalo de nuevo o simplifica el contenido de tu documento.",
            error_file_processing: "Error al procesar el archivo: {error}",
            error_unsupported_file: "Tipo de archivo no compatible. Por favor, sube un archivo PDF o de texto.",
            error_empty_file: "El archivo subido parece estar vacío.",
            error_file_too_large: "El archivo es demasiado grande. El tamaño máximo del archivo es de 60 MB. Por favor, usa un archivo más pequeño o comprime tu PDF.",
            file_processed_success: "¡Archivo '{fileName}' procesado con éxito!",
            file_loaded_message: "El archivo '{fileName}' ({fileSize} KB) ha sido cargado. Ahora puedes hacer preguntas sobre él.",
            mode_label: "Modo",
        }
};

// --- Utility Functions ---

/** Converts file data to base64 for use in the Gemini API. */
const fileToGenerativePart = (file) => {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
            const base64Data = reader.result.split(',')[1];
            resolve({
                inlineData: {
                    data: base64Data,
                    mimeType: file.type,
                },
            });
        };
        reader.onerror = (error) => reject(error);
        reader.readAsDataURL(file);
    });
};

// Safe ID generator (fallback if crypto.randomUUID is unavailable)
const generateId = () => {
    try { return crypto?.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2,10)}`; } catch { return `${Date.now()}-${Math.random().toString(36).slice(2,10)}`; }
};

// Simple i18n strings (en, ar, es)
const tDict = {
    en: {
        tabs: { tutor: 'Tutor Mode', detective: 'Detective Clue Chat', quiz: 'Quiz', tracker: 'Tracker Dashboard', chats: 'Chats', schedule: 'Schedule', groups: 'Groups', community: 'Community', about: 'About/Contact' },
        schedule: { date: 'Date', importPhoto: 'Import (Photo)', subject: 'Subject', task: 'Task', start: 'Start', end: 'End', add: 'Add', checklistFor: 'Checklist for', noItems: 'No items yet.', remove: 'Remove', dailyReport: 'Daily Report', copyReport: 'Copy Report', importing: 'Importing from image...' },
        settings: { title: 'Study Preferences', schoolEnd: 'School ends at', sleepAt: 'Sleep at', save: 'Save', generate: 'Generate Plan' },
        gen: { created: 'Created', enterGroup: 'Enter a group name' }
    },
    ar: {
        tabs: { tutor: 'وضع المعلم', detective: 'دردشة الأدلة', quiz: 'اختبار منظم', tracker: 'لوحة التتبع', chats: 'الدردشات', schedule: 'الجدول', groups: 'المجموعات', community: 'المجتمع', about: 'من نحن/اتصل بنا' },
        schedule: { date: 'التاريخ', importPhoto: 'استيراد (صورة)', subject: 'المادة', task: 'المهمة', start: 'البدء', end: 'الانتهاء', add: 'إضافة', checklistFor: 'قائمة المهام لـ', noItems: 'لا توجد عناصر.', remove: 'حذف', dailyReport: 'تقرير يومي', copyReport: 'نسخ التقرير', importing: 'جارٍ الاستيراد من الصورة...' },
        settings: { title: 'تفضيلات الدراسة', schoolEnd: 'نهاية المدرسة الساعة', sleepAt: 'النوم الساعة', save: 'حفظ', generate: 'إنشاء خطة' },
        gen: { created: 'تم الإنشاء', enterGroup: 'أدخل اسم المجموعة' }
    },
    es: {
        tabs: { tutor: 'Modo Tutor', detective: 'Chat de Pistas', quiz: 'Cuestionario', tracker: 'Panel de Seguimiento', chats: 'Chats', schedule: 'Horario', groups: 'Grupos', community: 'Comunidad', about: 'Acerca de/Contacto' },
        schedule: { date: 'Fecha', importPhoto: 'Importar (Foto)', subject: 'Materia', task: 'Tarea', start: 'Inicio', end: 'Fin', add: 'Agregar', checklistFor: 'Lista para', noItems: 'Sin elementos.', remove: 'Eliminar', dailyReport: 'Informe Diario', copyReport: 'Copiar Informe', importing: 'Importando desde imagen...' },
        settings: { title: 'Preferencias de Estudio', schoolEnd: 'Termina la escuela a las', sleepAt: 'Dormir a las', save: 'Guardar', generate: 'Generar Plan' },
        gen: { created: 'Creado', enterGroup: 'Ingrese un nombre de grupo' }
    }
};

/** Retries a function with exponential backoff */
const retryFetch = async (url, options, retries = 3) => {
    for (let i = 0; i < retries; i++) {
        try {
            const response = await fetch(url, options);
            if (!response.ok) throw new Error(`HTTP error! status: ${response.status}. Response: ${await response.text()}`);
            return response;
        } catch (error) {
            if (i === retries - 1) throw error;
            const delay = Math.pow(2, i) * 1000;
            await new Promise(resolve => setTimeout(resolve, delay));
        }
    }
};

// Firestore path helper removed

// --- Standalone Component for Profile Editor ---

const ProfileEditorModal = ({ 
    show, 
    tempProfile, 
    setTempProfile, 
    handleSaveProfile, 
    setShowProfileEditor, 
    profile, 
    isLoading,
    localError
}) => {
    if (!show) return null;

    const isNewUser = !profile?.name || !profile?.detectiveId;

    return (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
            <div className="bg-white rounded-xl shadow-2xl p-6 w-full max-w-md">
                <h2 className="text-2xl font-bold text-blue-700 mb-6 text-center">
                    {isNewUser ? "Agent Registration" : "Manage Profile"}
                </h2>
                
                {localError && (
                    <div className="mb-4 p-3 bg-red-100 border border-red-400 text-red-700 rounded-lg text-sm">
                        {localError}
                    </div>
                )}

                <div className="space-y-4">
                    <div>
                        <label htmlFor="tempName" className="block text-sm font-medium text-gray-700">Name:</label>
                        <input
                            id="tempName"
                            type="text"
                            value={tempProfile.name}
                            onChange={(e) => setTempProfile(p => ({ ...p, name: e.target.value }))}
                            className="mt-1 block w-full p-3 border border-gray-300 rounded-lg shadow-sm focus:ring-indigo-500 focus:border-indigo-500"
                            placeholder="e.g., Elham"
                            autoFocus 
                        />
                    </div>
                    <div>
                        <label htmlFor="tempDetectiveId" className="block text-sm font-medium text-gray-700">Detective ID (Required for Tracker):</label>
                        <input
                            id="tempDetectiveId"
                            type="text"
                            value={tempProfile.detectiveId}
                            onChange={(e) => setTempProfile(p => ({ ...p, detectiveId: e.target.value }))}
                            className="mt-1 block w-full p-3 border border-gray-300 rounded-lg shadow-sm focus:ring-indigo-500 focus:border-indigo-500"
                            placeholder="e.g., Super1"
                        />
                    </div>
                </div>
                
                <div className="mt-6 flex justify-end space-x-3">
                    {!isNewUser && (
                        <button
                            onClick={() => setShowProfileEditor(false)}
                            className="px-4 py-2 text-gray-700 bg-gray-200 hover:bg-gray-300 rounded-lg font-medium transition duration-150"
                            disabled={isLoading}
                        >
                            Cancel
                        </button>
                    )}
                    <button
                        onClick={handleSaveProfile}
                        className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition duration-150 shadow-md"
                        disabled={isLoading || !tempProfile.name || !tempProfile.detectiveId}
                    >
                        {isLoading ? 'Saving...' : 'Save Profile'}
                    </button>
                </div>
            </div>
        </div>
    );
};

// --- Authentication Screen Component (Supabase) ---

const AuthScreen = ({ setIsAuthReady, setLoading, setUserId }) => {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [isRegistering, setIsRegistering] = useState(true);
    const [localLoading, setLocalLoading] = useState(false);
    const [authError, setAuthError] = useState('');
    const [successMessage, setSuccessMessage] = useState('');

    const handleSubmit = async (e) => {
        e.preventDefault();
        setLocalLoading(true);
        setAuthError('');
        setSuccessMessage('');
        setLoading(true);
        try {
            if (isRegistering) {
                const { error } = await supabase.auth.signUp({ email, password });
                if (error) throw error;
                setSuccessMessage('Registration successful. Check your email to confirm.');
                setIsRegistering(false);
                setEmail('');
                setPassword('');
            } else {
                const { data, error } = await supabase.auth.signInWithPassword({ email, password });
                if (error) throw error;
                setUserId(data.user?.id || null);
                setIsAuthReady(true);
            }
        } catch (error) {
            setAuthError(error.message || 'Authentication failed.');
        } finally {
            setLocalLoading(false);
            setLoading(false);
        }
    };

    return (
        <div className="min-h-screen flex items-center justify-center bg-gray-100 p-4" style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, overflow: 'auto', zIndex: 9999 }}>
            <div className="bg-white p-8 rounded-xl shadow-2xl w-full max-w-md mx-auto" style={{ maxHeight: '90vh', overflow: 'auto' }}>
                <h2 className="text-3xl font-extrabold text-blue-700 text-center mb-6">
                    {isRegistering ? 'Agent Sign Up' : 'Agent Sign In'}
                </h2>
                {authError && (
                    <div className="mb-4 p-3 bg-red-100 border border-red-400 text-red-700 rounded-lg text-sm">{authError}</div>
                )}
                {successMessage && (
                    <div className="mb-4 p-3 bg-green-100 border border-green-400 text-green-700 rounded-lg text-sm">{successMessage}</div>
                )}
                <form onSubmit={handleSubmit} className="space-y-5">
                    <div>
                        <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-1">Email Address</label>
                        <input 
                            id="email" 
                            type="email" 
                            value={email} 
                            onChange={(e) => setEmail(e.target.value)} 
                            required 
                            className="block w-full p-3 border border-gray-300 rounded-lg shadow-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none" 
                            placeholder="your.email@example.com"
                            autoComplete="email"
                        />
                    </div>
                    <div>
                        <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-1">Password</label>
                        <input 
                            id="password" 
                            type="password" 
                            value={password} 
                            onChange={(e) => setPassword(e.target.value)} 
                            required 
                            minLength={6} 
                            className="block w-full p-3 border border-gray-300 rounded-lg shadow-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none" 
                            placeholder="Min 6 characters"
                            autoComplete="current-password"
                        />
                    </div>
                    <button 
                        type="submit" 
                        className="w-full py-3 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-lg shadow-lg transition duration-150 disabled:bg-blue-300 disabled:cursor-not-allowed" 
                        disabled={localLoading || !email || !password}
                    >
                        {localLoading ? 'Processing...' : isRegistering ? 'Sign Up' : 'Sign In'}
                    </button>
                </form>
                <div className="mt-6 text-center">
                    <button 
                        onClick={() => { setIsRegistering(prev => !prev); setAuthError(''); setSuccessMessage(''); }} 
                        className="text-sm font-medium text-blue-600 hover:text-blue-800 underline"
                        type="button"
                    >
                        {isRegistering ? 'Already have an account? Sign In' : 'Need an account? Sign Up'}
                    </button>
                </div>
            </div>
        </div>
    );
};


// --- Error Boundary Component ---
class ErrorBoundary extends Component {
    constructor(props) {
        super(props);
        this.state = { hasError: false, error: null };
    }

    static getDerivedStateFromError(error) {
        return { hasError: true, error };
    }

    componentDidCatch(error, errorInfo) {
        console.error('Error caught by boundary:', error, errorInfo);
    }

    render() {
        if (this.state.hasError) {
            return (
                <div className="min-h-screen bg-gray-100 flex items-center justify-center p-4">
                    <div className="bg-white p-8 rounded-xl shadow-2xl w-full max-w-md text-center">
                        <h2 className="text-2xl font-bold text-red-600 mb-4">Something went wrong</h2>
                        <p className="text-gray-600 mb-6">
                            The app encountered an error. Please refresh the page to try again.
                        </p>
                        <button
                            onClick={() => window.location.reload()}
                            className="px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition duration-150"
                        >
                            Refresh Page
                        </button>
                    </div>
                </div>
            );
        }

        return this.props.children;
    }
}

// --- Main Application Component ---
const App = () => {
    // --- Supabase Auth State ---
    // Initialize as ready immediately - no auth blocking
    const [userId, setUserId] = useState(() => {
        const guestId = localStorage.getItem('samir_guest_id') || `guest-${Date.now()}`;
        localStorage.setItem('samir_guest_id', guestId);
        return guestId;
    });
    const [isAuthReady, setIsAuthReady] = useState(true); // Start ready
    const [loading, setLoading] = useState(false); // Start not loading 

    // --- Core App State ---
    const [mode, setMode] = useState('tutor');
    const [navDropdownOpen, setNavDropdownOpen] = useState(false); 
    const [input, setInput] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState('');
    const [successMessage, setSuccessMessage] = useState('');
    
    // --- WebLLM State ---
    const [webllmReady, setWebllmReady] = useState(false);
    const [webllmLoading, setWebllmLoading] = useState(false);
    const [webllmProgress, setWebllmProgress] = useState(0);
    const [webllmModel, setWebllmModel] = useState(null);
    const [useWebLLM, setUseWebLLM] = useState(true); // Enable WebLLM (local AI) - more stable than API
    
    // --- PDF Chunks for RAG ---
    const [pdfChunks, setPdfChunks] = useState([]);
    const [pdfChunkEmbeddings, setPdfChunkEmbeddings] = useState([]);
    const [lang, setLang] = useState(() => localStorage.getItem('samir_lang') || 'en');
    const tr = tDict[lang] || tDict.en;
    const isRTL = lang === 'ar';
    
    // Translation function
    const t = (key, params = {}) => {
        let text = translations[lang]?.[key] || translations.en?.[key] || key;
        // Simple parameter replacement
        Object.keys(params).forEach(paramKey => {
            text = text.replace(`{${paramKey}}`, params[paramKey]);
        });
        return text;
    };

    // --- User Profile State ---
    const [profile, setProfile] = useState(null);
    const [showProfileEditor, setShowProfileEditor] = useState(false);
    const [tempProfile, setTempProfile] = useState({ name: '', detectiveId: '' });
    const [profileEditorError, setProfileEditorError] = useState('');
    
    // --- PDF Conversion State ---
    const [extractedText, setExtractedText] = useState(null);

    // --- Document & Chat State (Session Persistence) ---
    // Per-chat file storage: each chat session has its own file
    const [chatSessions, setChatSessions] = useState(() => {
        try {
            const stored = sessionStorage.getItem('chatSessions');
            return stored ? JSON.parse(stored) : {};
        } catch (error) {
            console.warn('Failed to parse chat sessions:', error);
            return {};
        }
    });
    const [currentChatId, setCurrentChatId] = useState(() => {
        return sessionStorage.getItem('currentChatId') || `chat-${Date.now()}`;
    });
    
    // Get current chat's file and messages
    const currentChat = chatSessions[currentChatId] || { messages: [], file: null, extractedContent: null };
    const fileContent = currentChat.file;
    
    // Chat history state - synced with current chat session
    const [chatHistory, setChatHistory] = useState(() => {
        const chat = chatSessions[currentChatId];
        return chat?.messages || [];
    });
    
    // Enable chat immediately - no waiting
    const [isChatLoaded, setIsChatLoaded] = useState(true); // Always enabled
    
    // Update chat session helper
    const updateChatSession = useCallback((chatId, updates) => {
        setChatSessions(prev => {
            const updated = {
                ...prev,
                [chatId]: {
                    ...(prev[chatId] || { messages: [], file: null, extractedContent: null }),
                    ...updates
                }
            };
            sessionStorage.setItem('chatSessions', JSON.stringify(updated));
            return updated;
        });
    }, []);
    
    // Create new chat session
    const createNewChat = useCallback(() => {
        const newChatId = `chat-${Date.now()}`;
        setCurrentChatId(newChatId);
        sessionStorage.setItem('currentChatId', newChatId);
        updateChatSession(newChatId, { messages: [], file: null, extractedContent: null });
        setChatHistory([]);
    }, [updateChatSession]); 

    // --- Tracker Memory State ---
    const [trackerSummary, setTrackerSummary] = useState(null); 

    // --- Offline State ---
    const [isOnline, setIsOnline] = useState(navigator.onLine);

    // --- Samir Coins (rewards: +5 per quiz finish, +5 per study message) ---
    const [samirCoins, setSamirCoins] = useState(() => parseInt(localStorage.getItem('samir_coins')) || 0);
    const addCoins = useCallback((amount) => {
        setSamirCoins(prev => {
            const next = prev + amount;
            localStorage.setItem('samir_coins', String(next));
            return next;
        });
    }, []);

    // --- Tracker State (Time & Quiz) ---
    const chatEndRef = useRef(null);
    const chatInputRef = useRef(null);
    const chatContainerRef = useRef(null); // For scroll management
    const [totalStudyTime, setTotalStudyTime] = useState(() => parseInt(localStorage.getItem('totalStudyTime')) || 0);
    const [prefs, setPrefs] = useState(() => {
        try { return JSON.parse(localStorage.getItem('samir_prefs') || '{"schoolEnd":"16:00","sleep":"22:00"}'); } catch { return { schoolEnd: '16:00', sleep: '22:00' }; }
    });

    // --- Local-only Features State (no API needed) ---
    // Chats (threads) stored as: [{id, title, fileName, createdAt, messages:[{role,text,timestamp}]}]
    const [threads, setThreads] = useState(() => {
        try { return JSON.parse(localStorage.getItem('samir_threads') || '[]'); } catch { return []; }
    });
    const [activeThreadId, setActiveThreadId] = useState(() => localStorage.getItem('samir_active_thread') || null);
    
    // {t('tab_schedule')} with checklist
    // scheduleDays: { yyyy-mm-dd: [{id, subject, start, end, task, done:boolean}] }
    const [scheduleDays, setScheduleDays] = useState(() => {
        try { return JSON.parse(localStorage.getItem('samir_schedule_days') || '{}'); } catch { return {}; }
    });
    const [selectedDate, setSelectedDate] = useState(() => new Date().toISOString().slice(0,10));

    // Study groups and community
    // groups: [{id, name, grade, subject, members:[names], messages:[{author,text,ts}]}]
    const [groups, setGroups] = useState(() => {
        try { return JSON.parse(localStorage.getItem('samir_groups') || '[]'); } catch { return []; }
    });
    const [activeGroupId, setActiveGroupId] = useState(() => localStorage.getItem('samir_active_group') || null);
    // posts: [{id, title, body, author, ts, isAnnouncement:boolean}]
    const [posts, setPosts] = useState(() => {
        try { return JSON.parse(localStorage.getItem('samir_posts') || '[]'); } catch { return []; }
    });

    // --- Quiz State (For Quiz Mode) ---
    const [quizState, setQuizState] = useState({
        isActive: false,
        questions: [],
        currentQuestionIndex: 0,
        results: [], 
        timeStart: null,
        userAnswers: {},
        quizFinished: false,
    });
    
    // --- Logout Function ---
    const handleLogout = async () => {
        try {
            await supabase.auth.signOut();
            setUserId(null);
            setProfile(null);
            setChatHistory([]);
            setChatSessions({});
            sessionStorage.removeItem('chatSessions');
            sessionStorage.removeItem('fileContent');
            setIsChatLoaded(false);
            setMode('tutor');
        } catch (e) {
            console.error('Sign out failed:', e);
            setError('Failed to sign out.');
        }
    };


    // --- useEffect: File Content Session Storage Sync ---
    useEffect(() => {
        sessionStorage.setItem('fileContent', JSON.stringify(fileContent));
    }, [fileContent]);
    useEffect(()=>{ localStorage.setItem('samir_lang', lang); document.documentElement.dir = (lang==='ar'?'rtl':'ltr'); },[lang]);
    useEffect(()=>{ localStorage.setItem('samir_prefs', JSON.stringify(prefs)); },[prefs]);

    // Persist local-only features
    useEffect(() => { localStorage.setItem('samir_threads', JSON.stringify(threads)); }, [threads]);
    useEffect(() => { if (activeThreadId) localStorage.setItem('samir_active_thread', activeThreadId); }, [activeThreadId]);
    useEffect(() => { localStorage.setItem('samir_schedule_days', JSON.stringify(scheduleDays)); }, [scheduleDays]);
    useEffect(() => { localStorage.setItem('samir_groups', JSON.stringify(groups)); }, [groups]);
    useEffect(() => { localStorage.setItem('samir_posts', JSON.stringify(posts)); }, [posts]);

    // --- useEffect: Network Status Tracking ---
    useEffect(() => {
        const handleOnline = () => setIsOnline(true);
        const handleOffline = () => setIsOnline(false);
        window.addEventListener('online', handleOnline);
        window.addEventListener('offline', handleOffline);
        return () => {
            window.removeEventListener('online', handleOnline);
            window.removeEventListener('offline', handleOffline);
        };
    }, []);

    // --- useEffect: Study Time Tracker ---
    useEffect(() => {
        if (!localStorage.getItem('studyStartTime')) {
            localStorage.setItem('studyStartTime', Date.now());
        }
        
        const interval = setInterval(() => {
            if (isOnline) {
                const now = Date.now();
                const lastStartTime = parseInt(localStorage.getItem('studyStartTime') || now);
                
                // Only add the interval duration (10 seconds), not the full elapsed time
                setTotalStudyTime(prevTotal => {
                    const newTotal = prevTotal + 10000; // Add 10 seconds per interval
                    localStorage.setItem('totalStudyTime', newTotal);
                    return newTotal;
                });
                
                localStorage.setItem('studyStartTime', now);
            }
        }, 10000); 

        return () => clearInterval(interval);
    }, [isOnline]);

    // Scroll management is now handled in ChatInterface component
    
    // Auto-focus chat input when file is loaded
    useEffect(() => {
        if (fileContent && chatInputRef.current && !isLoading) {
            setTimeout(() => {
                chatInputRef.current?.focus();
            }, 100);
        }
    }, [fileContent, isLoading]);

    // --- WebLLM Initialization (On App Load) - OPTIONAL, non-blocking ---
    useEffect(() => {
        const initWebLLM = async () => {
            if (webllmReady || webllmLoading) return;
            
            // Only try WebLLM if explicitly enabled and we have a good connection
            // Make it truly optional - don't block the app
            setWebllmLoading(true);
            
            // Don't show error message immediately - try silently first
            // Only show success message if it works
            
            try {
                // Add timeout for model loading (5 minutes max)
                const timeoutPromise = new Promise((_, reject) => 
                    setTimeout(() => reject(new Error('Model download timeout after 5 minutes')), 300000)
                );
                
                const initPromise = webllmService.initialize((report) => {
                    setWebllmProgress(report.progress || 0);
                    if (report.progress >= 1) {
                        setSuccessMessage('✅ Local AI model loaded! Chat is now fully offline.');
                        setTimeout(() => setSuccessMessage(''), 4000);
                    }
                });
                
                const result = await Promise.race([initPromise, timeoutPromise]);
                
                if (result.success) {
                    setWebllmReady(true);
                    setWebllmModel(result.model);
                    console.log('✅ WebLLM initialized successfully:', result);
                } else {
                    console.warn('⚠️ WebLLM initialization failed (non-critical):', result.error);
                    // Don't show error - just silently fallback to API
                    setUseWebLLM(false);
                }
            } catch (error) {
                console.warn('⚠️ WebLLM initialization error (non-critical):', error.message);
                // Silently fallback - don't show error to user
                setUseWebLLM(false);
            } finally {
                setWebllmLoading(false);
            }
        };
        
        // Initialize WebLLM in background (truly optional, won't block app)
        if (useWebLLM) {
            // Delay initialization slightly to not slow down app startup
            setTimeout(() => {
                initWebLLM().catch(err => {
                    console.warn('WebLLM init failed (non-critical):', err?.message || String(err));
                    console.log('WEBLLM_INIT_ERROR:', err?.message || String(err));
                    setUseWebLLM(false);
                });
            }, 2000); // Wait 2 seconds after app loads
        }
    }, []); // Only run once on mount
    
    // --- Supabase Auth Init & Listener ---
    // COMPLETELY SKIP AUTH - App works immediately, no waiting
    // Auth is completely optional and non-blocking
    useEffect(() => {
        // Ensure userId is always set (should already be from initial state, but double-check)
        if (!userId) {
            const guestId = localStorage.getItem('samir_guest_id') || `guest-${Date.now()}`;
            localStorage.setItem('samir_guest_id', guestId);
            setUserId(guestId);
        }
        
        // Try to get real user in background (completely non-blocking, silent)
        supabase.auth.getUser().then(({ data }) => {
            if (data?.user?.id) {
                setUserId(data.user.id);
            }
        }).catch(() => {
            // Silent - continue with guest
        });
        
        // Listen for auth changes (non-blocking)
        const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
            if (session?.user?.id) {
                setUserId(session.user.id);
            }
        });
        
        return () => {
            sub?.subscription?.unsubscribe?.();
        };
    }, []); // Only run once on mount - userId set in initial state
    
    // --- Supabase Data Helpers ---
    // Lazy-load: Fetch only last 50 messages to reduce Supabase load
    const fetchMessages = useCallback(async (uid, limit = 50) => {
        // Skip Supabase queries for guest users (they don't have valid UUIDs)
        if (uid && typeof uid === 'string' && uid.startsWith('guest-')) {
            console.log('Skipping Supabase query for guest user');
            return [];
        }
        
        try {
            const { data, error } = await supabase
                .from('messages')
                .select('role,text,created_at')
                .eq('user_id', uid)
                .order('created_at', { ascending: false }) // Get newest first
                .limit(limit); // Only fetch last 50 messages
            
            if (error) throw error;
            
            // Reverse to get chronological order
            return (data || []).reverse();
        } catch (error) {
            console.warn('Error fetching messages:', error);
            return [];
        }
    }, []);

    // ENABLED: Supabase message insertion for multi-user support
    const insertMessage = useCallback(async (uid, role, text) => {
        if (!uid) return Promise.resolve(); // Skip if no user ID
        try {
            const { error } = await supabase
                .from('messages')
                .insert([{ user_id: uid, role, text }]);
            if (error) throw error;
        } catch (e) {
            console.warn('Could not save message to Supabase (falling back to localStorage):', e);
            // Fallback: save to localStorage with user prefix
            const localKey = `samir_history_${uid}`;
            try {
                const existing = JSON.parse(localStorage.getItem(localKey) || '[]');
                existing.push({ role, parts: [{ text }] });
                localStorage.setItem(localKey, JSON.stringify(existing));
            } catch (localError) {
                console.warn('Failed to save to localStorage:', localError);
            }
        }
        return Promise.resolve();
    }, []);


    // --- Profile & Data Persistence Functions ---

    const handleSaveProfile = useCallback(async (data) => {
        // Keep profile local for now; Supabase schema not enforced here
        // Use user-specific localStorage for multi-user support
        setLoading(true);
        setProfileEditorError('');
        try {
            const newProfile = { ...data, memberSince: data?.memberSince || Date.now() };
            const profileKey = `samir_profile_${userId}`;
            localStorage.setItem(profileKey, JSON.stringify(newProfile));
            setProfile(newProfile);
            setTempProfile({ name: newProfile.name, detectiveId: newProfile.detectiveId });
            setShowProfileEditor(false);
            setSuccessMessage('Profile updated successfully!');
            setTimeout(() => setSuccessMessage(''), 5000);
        } catch (e) {
            console.error('Error saving profile locally:', e);
            setProfileEditorError(`Error saving profile: ${e.message}`);
        } finally {
            setLoading(false);
        }
    }, [userId]);
    
    /** Loads user profile, chat history, and the tracker summary (memory) in one go. */
    const loadUserData = useCallback(async () => {
        if (!userId) {
            setIsChatLoaded(false);
            return;
        }
        
        // Enable chat IMMEDIATELY - don't wait for anything
        setIsChatLoaded(true);
        
        // Don't set loading - app should stay responsive
        setProfileEditorError('');
        
        // Set default profile immediately (non-blocking)
        const profileKey = `samir_profile_${userId}`;
        const storedProfile = JSON.parse(localStorage.getItem(profileKey) || 'null');
        if (storedProfile?.name) {
            setProfile(storedProfile);
            setTempProfile({ name: storedProfile.name, detectiveId: storedProfile.detectiveId || '' });
            setShowProfileEditor(false);
        } else {
            // Don't force profile - make it optional
            setShowProfileEditor(false);
            const defaultProfile = { name: 'Guest', detectiveId: '', memberSince: Date.now() };
            setProfile(defaultProfile);
            setTempProfile({ name: 'Guest', detectiveId: '' });
        }
        
        try {
            
            // Load chat from Supabase messages (with error handling and timeout)
            const localHistoryKey = `samir_history_${userId}`;
            
            // Set initial chat history from localStorage immediately (fast)
            const localHistory = localStorage.getItem(localHistoryKey);
            let initialHistory;
            if (localHistory) {
                try {
                    initialHistory = JSON.parse(localHistory);
                } catch (e) {
                    initialHistory = [{ role: 'model', parts: [{ text: t('welcome_message') }] }];
                }
            } else {
                initialHistory = [{ role: 'model', parts: [{ text: t('welcome_message') }] }];
            }
            
            // Get current chat ID (use state getter to ensure we have latest)
            const chatId = currentChatId || `chat-${Date.now()}`;
            
            // Update both state and chat session
            setChatHistory(initialHistory);
            updateChatSession(chatId, {
                messages: initialHistory
            });
            
            // Then try to sync from Supabase in background (with timeout)
            try {
                const timeoutPromise = new Promise((_, reject) => 
                    setTimeout(() => reject(new Error('Supabase timeout')), 5000)
                );
                const messages = await Promise.race([
                    fetchMessages(userId),
                    timeoutPromise
                ]);
                
                if (messages.length === 0) {
                    // insert welcome message once
                    try {
                        if (userId && !userId.startsWith('guest-')) {
                            insertMessage(userId, 'model', t('welcome_message')).catch((err) => {
                                console.warn('Insert welcome message error (non-critical):', err?.message || String(err));
                                console.log('INSERT_MESSAGE_ERROR:', err?.message || String(err));
                            });
                        }
                    } catch (e) {
                        console.warn('Could not insert welcome message to Supabase (using localStorage fallback):', e);
                    }
                } else {
                    const formattedHistory = messages.map(m => ({ role: m.role, parts: [{ text: m.text }] }));
                    
                    // Get current chat ID
                    const chatId = currentChatId || `chat-${Date.now()}`;
                    
                    // Update both state and chat session
                    setChatHistory(formattedHistory);
                    updateChatSession(chatId, {
                        messages: formattedHistory
                    });
                    
                    // Also save to localStorage as backup
                    localStorage.setItem(localHistoryKey, JSON.stringify(formattedHistory));
                }
            } catch (error) {
                console.warn('Could not load messages from Supabase (using local storage):', error.message);
                // Already loaded from localStorage above, so continue
            }
            
            // Tracker summary from Supabase quiz_results (with error handling and timeout)
            // Load in background - don't block the UI
            (async () => {
                let timeoutId = null;
                try {
                    // Skip Supabase queries for guest users (they don't have valid UUIDs)
                    if (userId && typeof userId === 'string' && userId.startsWith('guest-')) {
                        console.log('Skipping quiz_results query for guest user');
                        setTrackerSummary(null);
                        return;
                    }
                    
                    const timeoutPromise = new Promise((_, reject) => {
                        timeoutId = setTimeout(() => {
                            reject(new Error('Tracker timeout after 5 seconds'));
                        }, 5000);
                    });
                    
                    const supabasePromise = supabase
                        .from('quiz_results')
                        .select('score,total_questions,time_taken_ms,detailed_results,timestamp')
                        .eq('user_id', userId)
                        .then(res => {
                            // Clear timeout if request succeeds
                            if (timeoutId) clearTimeout(timeoutId);
                            if (res.error) throw res.error;
                            return res;
                        });
                    
                    const result = await Promise.race([supabasePromise, timeoutPromise]);
                    
                    // Clear timeout if we got here
                    if (timeoutId) clearTimeout(timeoutId);
                    
                    // Handle timeout rejection
                    if (result instanceof Error && result.message.includes('Tracker timeout')) {
                        throw result;
                    }
                    
                    const { data: results, error } = result;
                    if (error) throw error;
                    
                    let weaknessPoints = {};
                    let strengthPoints = {};
                    let quizCount = 0;
                    (results || []).forEach(result => {
                        quizCount++;
                        if (result.detailed_results) {
                            result.detailed_results.forEach(item => {
                                const key = item.question.substring(0, 50) + '...';
                                if (item.isCorrect) {
                                    strengthPoints[key] = (strengthPoints[key] || 0) + 1;
                                } else {
                                    weaknessPoints[key] = (weaknessPoints[key] || 0) + 1;
                                }
                            });
                        }
                    });
                    if (quizCount > 0) {
                        const getTop = (obj, n) => Object.entries(obj)
                            .sort(([,a], [,b]) => b - a)
                            .slice(0, n)
                            .map(([key, count]) => ({ topic: key, count }));
                        setTrackerSummary({
                            lastQuizCount: quizCount,
                            topWeaknesses: getTop(weaknessPoints, 3),
                            topStrengths: getTop(strengthPoints, 3)
                        });
                    } else {
                        setTrackerSummary(null);
                    }
                } catch (trackerError) {
                    // Clear timeout if still set
                    if (timeoutId) clearTimeout(timeoutId);
                    
                    // Log error properly (not silently)
                    console.warn('Could not load tracker summary from Supabase (this is OK):', trackerError.message || trackerError);
                    console.log('TRACKER_ERROR:', trackerError?.message || String(trackerError));
                    
                    // Handle timeout specifically to prevent unhandled rejection
                    if (trackerError?.message?.includes('Tracker timeout')) {
                        console.log('Tracker query timed out (non-critical - continuing without tracker summary)');
                    }
                    
                    setTrackerSummary(null); // Continue without tracker summary
                }
            })().catch(err => {
                // Final catch to prevent unhandled promise rejection
                console.warn('Tracker summary async function error (non-critical):', err?.message || String(err));
                console.log('TRACKER_ASYNC_ERROR:', err?.message || String(err));
                setTrackerSummary(null);
            });
        } catch (e) {
            console.error('[CONSOLE_ERROR] Error loading user data:', e);
            setError(`Error loading user data: ${e.message}.`);
            // Even on error, make sure chat is enabled
            setIsChatLoaded(true);
        } finally {
            // Never set loading to true in loadUserData - keep app responsive
            setIsChatLoaded(true);
        }
    }, [userId, currentChatId, updateChatSession, setChatHistory, t]); // Include all dependencies

    // Data Loading Effect (Profile, Tracker Summary) - Triggered when userId changes
    // Make it non-blocking - don't wait for it
    useEffect(() => {
        if (userId) {
            // Load in background - don't block UI
            loadUserData().catch(() => {
                // Silent fail - app continues
            });
        }
    }, [userId]);
    
    // Message Listener Effect - Triggered when userId or db changes
    // Message listener removed; localStorage is the source of truth


    const handleSaveProfileClick = useCallback(() => {
        if (!tempProfile.name || !tempProfile.detectiveId) {
            setProfileEditorError('Both name and Detective ID are required.');
            return;
        }
        const newProfile = {
            ...profile,
            name: tempProfile.name, 
            detectiveId: tempProfile.detectiveId, 
            memberSince: profile?.memberSince || Date.now()
        };
        handleSaveProfile(newProfile);
    }, [tempProfile, profile, handleSaveProfile]);

    // --- Core AI Functions ---

    // Caching mechanism for AI responses
    const getCachedResponse = async (key) => {
        try {
            const cache = await caches.open('samir-ai-cache');
            const response = await cache.match(key);
            if (response) {
                console.log('Cache hit for:', key);
                return await response.json();
            }
        } catch (e) {
            console.error('Error reading from cache:', e);
        }
        return null;
    };

    const setCachedResponse = async (key, data) => {
        try {
            const cache = await caches.open('samir-ai-cache');
            const response = new Response(JSON.stringify(data), {
                headers: { 'Content-Type': 'application/json' }
            });
            await cache.put(key, response);
        } catch (e) {
            console.error('Error writing to cache:', e);
        }
    };
    
    // Generate PDF ID from filename and file size (hash for consistent ID per file)
    // IMPORTANT: This should be called with the actual file name and size, not from fileContent state
    const generatePDFId = useCallback(async (fileName, fileSize = null) => {
        if (!fileName) return 'unknown-' + Date.now();
        try {
            // Use provided fileSize, or fallback to fileContent, or use 0
            const size = fileSize !== null ? fileSize : (fileContent?.size || 0);
            const encoder = new TextEncoder();
            // Include filename + size for uniqueness (same filename different size = different file)
            // DO NOT include Date.now() - we want consistent ID for same file
            const data = encoder.encode(fileName + '-' + size);
            
            // Check if crypto.subtle is available
            if (!crypto?.subtle) {
                throw new Error('crypto.subtle not available');
            }
            
            const hashBuffer = await crypto.subtle.digest('SHA-256', data);
            const hashArray = Array.from(new Uint8Array(hashBuffer));
            return hashArray.map(b => b.toString(16).padStart(2, '0')).join('').substring(0, 16);
        } catch (error) {
            console.warn('Failed to generate PDF ID with crypto, using fallback:', error);
            // Fallback to simple hash
            const size = fileSize !== null ? fileSize : (fileContent?.size || 0);
            const simpleHash = (fileName + '-' + size).split('').reduce((acc, char) => {
                const hash = ((acc << 5) - acc) + char.charCodeAt(0);
                return hash & hash;
            }, 0);
            return Math.abs(simpleHash).toString(36).substring(0, 16);
        }
    }, [fileContent]);
    
    // --- RAG: Process PDF text into chunks and store in Supabase/IndexedDB ---
    const processPDFForRAG = useCallback(async (pdfText, fileName, fileSize = null, pdfIdOverride = null) => {
        try {
            console.log(`📚 Processing PDF for RAG: ${fileName} (${fileSize || 'unknown'} bytes)`);
            
            // Use provided PDF ID or generate one (use provided to ensure consistency)
            const pdfId = pdfIdOverride || await generatePDFId(fileName, fileSize);
            console.log(`📄 Using PDF ID: ${pdfId} for file: ${fileName}`);
            
            // Clear any old chunks first (safety check - already cleared before this is called)
            setPdfChunks([]);
            
            // Split PDF into smaller chunks (800 chars with 100 overlap) - optimized for WebLLM/TinyLlama
            // Smaller chunks work better with small models and ensure context fits within token limits
            const chunks = splitIntoChunks(pdfText, 800, 100);
            console.log(`✅ Split PDF into ${chunks.length} chunks for RAG (PDF ID: ${pdfId})`);
            
            // Store chunks in memory for immediate use (linked to this PDF ID)
            setPdfChunks(chunks.map(c => ({ 
                text: c.text, 
                chunkId: c.chunkId,
                pdfId: pdfId // Store PDF ID with each chunk for verification
            })));
            
            // Store chunks in Supabase/IndexedDB (async, non-blocking)
            if (userId) {
                storePDFChunks(userId, pdfId, chunks).then(result => {
                    if (result.success) {
                        console.log(`💾 Stored ${result.chunksCount} chunks in database`);
                    }
                }).catch(err => {
                    console.warn('Failed to store chunks in database (non-critical):', err);
                });
            }
            
            // Initialize embeddings service in background for better search later
            embeddingsService.initialize().catch(() => {
                console.warn('Embeddings service init failed - using keyword search only');
            });
            
            console.log('📊 PDF chunks ready for RAG.');
            
        } catch (error) {
            console.error('❌ Error processing PDF for RAG:', error);
        }
    }, [userId, generatePDFId]);
    
    // --- Retrieve relevant PDF chunks for a query (Lightweight RAG) ---
    const retrieveRelevantChunks = useCallback(async (query, topK = 5) => {
        if (!fileContent) return [];
        
        try {
            // Use stored PDF ID from fileContent (if available), otherwise generate
            // CRITICAL: Use stored PDF ID to ensure we get chunks from the CURRENT PDF only
            const pdfId = fileContent.pdfId || await generatePDFId(fileName || fileContent.name, fileContent.size);
            console.log(`📄 Using PDF ID: ${pdfId} for chunk retrieval (file: ${fileContent.name})`);
            
            // Try to use Supabase-stored chunks first (better for large PDFs)
            if (userId && !userId.startsWith('guest-')) {
                try {
                    const chunks = await searchPDFChunks(userId, pdfId, query, topK);
                    if (chunks && chunks.length > 0) {
                        console.log(`🔍 Retrieved ${chunks.length} relevant chunks from database`);
                        return chunks;
                    }
                } catch (dbError) {
                    console.warn('Database chunk search failed, using memory chunks:', dbError);
                }
            }
            
            // Fallback: Use in-memory chunks ONLY if they match current PDF ID
            if (pdfChunks && pdfChunks.length > 0) {
                // CRITICAL: Filter chunks by PDF ID to prevent mixing files
                // Use stored PDF ID from fileContent (if available) to ensure consistency
                const currentPdfId = fileContent.pdfId || await generatePDFId(fileContent.name, fileContent.size);
                const chunksForThisPdf = pdfChunks.filter(c => {
                    // Only include chunks that match the current PDF ID
                    if (c.pdfId) {
                        return c.pdfId === currentPdfId;
                    }
                    // If chunk doesn't have PDF ID, it might be from old code - exclude it to be safe
                    return false;
                });
                
                if (chunksForThisPdf.length === 0) {
                    console.warn('⚠️ In-memory chunks exist but don\'t match current PDF ID. Ignoring old chunks.');
                    return [];
                }
                
                console.log(`🔍 Using ${chunksForThisPdf.length} in-memory chunks for PDF ID: ${currentPdfId}`);
                
                // Try embeddings-based search first
                try {
                    await embeddingsService.initialize();
                    const relevantChunks = await embeddingsService.findSimilarChunks(query, chunksForThisPdf, topK);
                    if (relevantChunks && relevantChunks.length > 0) {
                        console.log(`🔍 Retrieved ${relevantChunks.length} chunks using embeddings`);
                        return relevantChunks.map(c => ({ text: c.text, chunkId: c.chunkId }));
                    }
                } catch (embedError) {
                    console.warn('Embeddings search failed, using keyword search:', embedError);
                }
                
                // Fallback to simple keyword matching
                const queryWords = query.toLowerCase().split(/\s+/).filter(w => w.length > 2);
                const scored = chunksForThisPdf.map(chunk => {
                    const chunkText = chunk.text.toLowerCase();
                    const score = queryWords.reduce((sum, word) => {
                        return sum + (chunkText.match(new RegExp(word, 'g')) || []).length;
                    }, 0);
                    return { ...chunk, score };
                });
                
                return scored
                    .filter(c => c.score > 0)
                    .sort((a, b) => b.score - a.score)
                    .slice(0, topK)
                    .map(c => ({ text: c.text, chunkId: c.chunkId || 0 }));
            }
            
            return [];
        } catch (error) {
            console.error('❌ Error retrieving relevant chunks:', error);
            return [];
        }
    }, [pdfChunks, fileContent, userId, generatePDFId]);

    // Helper function to check if text looks like a title page (has title-like structure)
    const hasTitleLikeStructure = (text) => {
        if (!text || text.length < 10) return false;
        
        const lines = text.split('\n').filter(line => line.trim().length > 0);
        if (lines.length < 2) return false;
        
        // Check for uppercase lines (common in academic papers)
        const hasUppercaseLine = lines.some(line => {
            const trimmed = line.trim();
            return trimmed.length > 5 && trimmed === trimmed.toUpperCase() && /[A-Z]/.test(trimmed);
        });
        
        // Check for common academic paper patterns
        const hasAcademicPatterns = /(abstract|introduction|keywords|author|affiliation|university|department)/i.test(text);
        
        // Check for title-like formatting (short lines at the top)
        const topLines = lines.slice(0, 5);
        const hasShortTitleLines = topLines.some(line => line.trim().length > 10 && line.trim().length < 100);
        
        return hasUppercaseLine || hasAcademicPatterns || hasShortTitleLines;
    };

    // PDF to Text - Enhanced with metadata extraction and improved page 1 handling
    // Uses pdf-lib for metadata and pdfjs-dist for text extraction
    // CRITICAL: For image-only PDFs, runs OCR FIRST
    const extractTextFromPDF = async (file) => {
        try {
            const arrayBuffer = await file.arrayBuffer();
            
            // CRITICAL: For image-only PDFs, detect and run OCR FIRST
            // This ensures we extract lesson pages and structure even from scanned PDFs
            console.log('📄 Starting PDF extraction - will detect if image-only and run OCR first if needed');
            
            // Step 1: Quick check - try to load PDF and check if it has text layers
            let pdfjsLib = await import('pdfjs-dist');
            const pdfjsVersion = pdfjsLib.version || '4.4.168';
            
            // Fetch worker with error handling
            let workerCode;
            let workerUrl = null;
            try {
                const response = await fetch(`https://unpkg.com/pdfjs-dist@${pdfjsVersion}/build/pdf.worker.min.mjs`, {
                    signal: AbortSignal.timeout(10000)
                });
                if (response.ok) {
                    workerCode = await response.text();
                } else {
                    throw new Error(`Worker fetch failed: ${response.status}`);
                }
            } catch (error) {
                console.warn('Worker fetch failed, using fallback:', error);
                try {
                    const fallbackResponse = await fetch(`https://cdn.jsdelivr.net/npm/pdfjs-dist@${pdfjsVersion}/build/pdf.worker.min.mjs`, {
                        signal: AbortSignal.timeout(10000)
                    });
                    if (fallbackResponse.ok) {
                        workerCode = await fallbackResponse.text();
                    }
                } catch (fallbackError) {
                    console.error('All worker fetch attempts failed');
                    pdfjsLib.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjsVersion}/build/pdf.worker.min.mjs`;
                }
            }
            
            if (workerCode) {
                const workerBlob = new Blob([workerCode], { type: 'application/javascript' });
                workerUrl = URL.createObjectURL(workerBlob);
                pdfjsLib.GlobalWorkerOptions.workerSrc = workerUrl;
            }
            
            // Load PDF to check if it's image-only
            const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer, verbosity: 0 });
            const pdf = await loadingTask.promise;
            const totalPages = Math.min(pdf.numPages, 50);
            
            // Quick check: Try to extract text from first 3 pages
            let hasTextLayer = false;
            let totalTextLength = 0;
            
            for (let i = 1; i <= Math.min(3, totalPages); i++) {
                try {
                    const page = await pdf.getPage(i);
                    const textContent = await page.getTextContent();
                    const pageText = textContent.items.map(item => item.str).join(' ').trim();
                    totalTextLength += pageText.length;
                    if (pageText.length > 50) {
                        hasTextLayer = true;
                        break;
                    }
                    page.cleanup();
                } catch (e) {
                    console.warn(`Page ${i} check failed:`, e);
                }
            }
            
            // If very little text (< 50 chars per page on average), it's likely image-only
            const avgTextPerPage = totalTextLength / Math.min(3, totalPages);
            const isImageOnlyPDF = avgTextPerPage < 50;
            
            if (isImageOnlyPDF) {
                console.log('📸 Detected image-only PDF. Running OCR on all pages FIRST...');
                setSuccessMessage('Detected scanned PDF. Running OCR on all pages (this may take several minutes)...');
                
                // Run OCR on ALL pages first
                let ocrFullText = '';
                const lessonPages = []; // Store lesson page numbers
                const pageStructure = []; // Store page structure info
                
                for (let i = 1; i <= totalPages; i++) {
                    try {
                        const page = await pdf.getPage(i);
                        const viewport = page.getViewport({ scale: 3.0 }); // High quality for OCR
                        const canvas = document.createElement('canvas');
                        const context = canvas.getContext('2d');
                        canvas.height = viewport.height;
                        canvas.width = viewport.width;
                        
                        await page.render({ canvasContext: context, viewport: viewport }).promise;
                        const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
                        
                        if (blob) {
                            try {
                                const { data: { text: ocrText } } = await Tesseract.recognize(blob, 'eng+ara', {
                                    logger: () => {}
                                });
                                
                                if (ocrText && ocrText.trim().length > 0) {
                                    ocrFullText += `--- Page ${i} (OCR) ---\n${ocrText.trim()}\n\n`;
                                    
                                    // Detect lesson markers on this page
                                    const lessonPatterns = [
                                        /الدرس\s*(?:الأول|الثاني|الثالث|الرابع|الخامس|\d+)/i,
                                        /الوحدة\s*(?:الأولى|الثانية|الثالثة|الرابعة|الخامسة|\d+)/i,
                                        /Unit\s+\d+/i,
                                        /Chapter\s+\d+/i,
                                        /Lesson\s+\d+/i
                                    ];
                                    
                                    for (const pattern of lessonPatterns) {
                                        if (pattern.test(ocrText)) {
                                            const match = ocrText.match(pattern);
                                            lessonPages.push({ page: i, marker: match[0], text: ocrText.substring(0, 200) });
                                            console.log(`📌 Found lesson marker on page ${i}:`, match[0]);
                                            break;
                                        }
                                    }
                                    
                                    // Store page structure
                                    pageStructure.push({
                                        page: i,
                                        hasText: true,
                                        textLength: ocrText.length,
                                        preview: ocrText.substring(0, 100)
                                    });
                                }
                            } catch (ocrError) {
                                console.warn(`OCR failed for page ${i}:`, ocrError);
                            }
                        }
                        
                        canvas.width = 0;
                        canvas.height = 0;
                        page.cleanup();
                    } catch (pageError) {
                        console.warn(`Page ${i} OCR failed:`, pageError);
                    }
                }
                
                // Cleanup worker URL
                if (workerUrl) {
                    URL.revokeObjectURL(workerUrl);
                }
                
                if (ocrFullText.length > 100) {
                    console.log(`✅ OCR extraction complete: ${ocrFullText.length} characters from ${totalPages} pages`);
                    console.log(`📌 Found ${lessonPages.length} lesson markers:`, lessonPages);
                    
                    // Build metadata with lesson pages info
                    const metadataBlock = `[DOCUMENT_METADATA]
Title: Extracted via OCR
Authors: Not found
Publisher: Not found
Total Pages: ${totalPages}
[/DOCUMENT_METADATA]

[LESSON_PAGES]
${lessonPages.length > 0 ? lessonPages.map(lp => `Page ${lp.page}: ${lp.marker}`).join('\n') : 'No lesson markers found'}
[/LESSON_PAGES]

[PAGE_STRUCTURE]
${pageStructure.map(ps => `Page ${ps.page}: ${ps.textLength} chars`).join('\n')}
[/PAGE_STRUCTURE]

${ocrFullText}`;
                    
                    return metadataBlock.trim();
                } else {
                    throw new Error('OCR extraction returned insufficient text');
                }
            }
            
            // If PDF has text layer, continue with normal extraction
            console.log('✅ PDF has text layer, using normal extraction');
            
            // Step 1: Extract metadata using pdf-lib
            let metadata = {
                title: '',
                author: '',
                subject: '',
                keywords: ''
            };
            
            try {
                const { PDFDocument } = await import('pdf-lib');
                const pdfDoc = await PDFDocument.load(arrayBuffer);
                
                metadata.title = pdfDoc.getTitle() || '';
                metadata.author = pdfDoc.getAuthor() || '';
                metadata.subject = pdfDoc.getSubject() || '';
                metadata.keywords = pdfDoc.getKeywords() || '';
                
                console.log('📄 PDF Metadata extracted:', metadata);
            } catch (metadataError) {
                console.warn('Could not extract metadata with pdf-lib, trying pdfjs-dist:', metadataError);
                // Fallback: Try pdfjs-dist metadata
                try {
                    const pdfjsLib = await import('pdfjs-dist');
                    const pdfjsVersion = pdfjsLib.version || '4.4.168';
                    
                    // Fetch worker with error handling
                    let workerCode;
                    try {
                        const response = await fetch(`https://unpkg.com/pdfjs-dist@${pdfjsVersion}/build/pdf.worker.min.mjs`, {
                            signal: AbortSignal.timeout(10000)
                        });
                        if (response.ok) {
                            workerCode = await response.text();
                        } else {
                            throw new Error(`Worker fetch failed: ${response.status}`);
                        }
                    } catch (error) {
                        console.warn('Worker fetch failed, using fallback:', error);
                        try {
                            const fallbackResponse = await fetch(`https://cdn.jsdelivr.net/npm/pdfjs-dist@${pdfjsVersion}/build/pdf.worker.min.mjs`, {
                                signal: AbortSignal.timeout(10000)
                            });
                            if (fallbackResponse.ok) {
                                workerCode = await fallbackResponse.text();
                            }
                        } catch (fallbackError) {
                            console.error('All worker fetch attempts failed');
                            pdfjsLib.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjsVersion}/build/pdf.worker.min.mjs`;
                        }
                    }
                    
                    if (workerCode) {
                        const metadataWorkerBlob = new Blob([workerCode], { type: 'application/javascript' });
                        const metadataWorkerUrl = URL.createObjectURL(metadataWorkerBlob);
                        pdfjsLib.GlobalWorkerOptions.workerSrc = metadataWorkerUrl;
                        
                        const metadataLoadingTask = pdfjsLib.getDocument({ data: arrayBuffer, verbosity: 0 });
                        const metadataPdf = await metadataLoadingTask.promise;
                        const pdfMetadata = await metadataPdf.getMetadata();
                    
                    if (pdfMetadata?.info) {
                        metadata.title = pdfMetadata.info.Title || '';
                        metadata.author = pdfMetadata.info.Author || '';
                        metadata.subject = pdfMetadata.info.Subject || '';
                        metadata.keywords = pdfMetadata.info.Keywords || '';
                    }
                    
                        URL.revokeObjectURL(metadataWorkerUrl);
                    }
                } catch (fallbackError) {
                    console.warn('Could not extract metadata:', fallbackError);
                }
            }
            
            // Step 2: Extract text using pdfjs-dist (reuse if already loaded)
            // If we already loaded PDF for metadata, reuse it; otherwise load it
            let textPdfjsLib, textPdf, textWorkerUrl = null;
            
            if (!pdf) {
                // Need to load PDF for text extraction
                textPdfjsLib = await import('pdfjs-dist');
                const textPdfjsVersion = textPdfjsLib.version || '4.4.168';
                
                // Fetch worker with retry logic and error handling
                let textWorkerCode;
                try {
                    const textWorkerUrlStr = `https://unpkg.com/pdfjs-dist@${textPdfjsVersion}/build/pdf.worker.min.mjs`;
                    const response = await fetch(textWorkerUrlStr, {
                        method: 'GET',
                        cache: 'default',
                        signal: AbortSignal.timeout(10000)
                    });
                    
                    if (!response.ok) {
                        throw new Error(`Worker fetch failed: ${response.status}`);
                    }
                    
                    textWorkerCode = await response.text();
                } catch (fetchError) {
                    console.warn('Worker fetch failed, using fallback:', fetchError);
                    try {
                        const fallbackResponse = await fetch(`https://cdn.jsdelivr.net/npm/pdfjs-dist@${textPdfjsVersion}/build/pdf.worker.min.mjs`, {
                            signal: AbortSignal.timeout(10000)
                        });
                        if (fallbackResponse.ok) {
                            textWorkerCode = await fallbackResponse.text();
                        }
                    } catch (fallbackError) {
                        console.error('All worker fetch attempts failed');
                        textPdfjsLib.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${textPdfjsVersion}/build/pdf.worker.min.mjs`;
                    }
                }
                
                if (textWorkerCode) {
                    const textWorkerBlob = new Blob([textWorkerCode], { type: 'application/javascript' });
                    textWorkerUrl = URL.createObjectURL(textWorkerBlob);
                    textPdfjsLib.GlobalWorkerOptions.workerSrc = textWorkerUrl;
                }
                
                const textLoadingTask = textPdfjsLib.getDocument({ data: arrayBuffer, verbosity: 0 });
                textPdf = await textLoadingTask.promise;
            } else {
                // Reuse the PDF we already loaded
                textPdf = pdf;
            }
            
            const maxPages = Math.min(textPdf.numPages, 30);
            
            let page1Text = '';
            let restOfDocumentText = '';
            let extractedTitle = '';
            let extractedAuthors = '';
            let extractedPublisher = '';
            
            // Process each page
            for (let i = 1; i <= maxPages; i++) {
                try {
                    const page = await pdf.getPage(i);
                    
                    // Try native text extraction first (fast)
                    const textContent = await page.getTextContent();
                    const items = textContent.items; // Available for all pages
                    
                    if (i === 1) {
                        // Special handling for page 1 - Extract title, authors, and publisher
                        console.log('📄 Processing Page 1 - extracting title, authors, publisher, and full text...');
                        
                        // Extract structured information from page 1 using text positioning
                        const viewport = page.getViewport({ scale: 1.0 });
                        
                        // Group text items by Y position (lines) to identify title and authors
                        const linesByY = {};
                        items.forEach(item => {
                            const y = Math.round(item.transform[5]); // Y position
                            if (!linesByY[y]) {
                                linesByY[y] = [];
                            }
                            linesByY[y].push(item);
                        });
                        
                        // Sort lines by Y position (top to bottom)
                        const sortedLines = Object.keys(linesByY)
                            .map(y => ({
                                y: parseFloat(y),
                                items: linesByY[y].sort((a, b) => a.transform[4] - b.transform[4]) // Sort by X position
                            }))
                            .sort((a, b) => b.y - a.y); // Top to bottom
                        
                        // Extract title: First significant text block (usually at top, before authors)
                        if (sortedLines.length > 0) {
                            // Find the first substantial line (title candidates)
                            // Titles are usually at the top, before authors/abstract
                            for (let lineIdx = 0; lineIdx < Math.min(8, sortedLines.length); lineIdx++) {
                                const line = sortedLines[lineIdx];
                                const lineText = line.items.map(item => item.str).join('').trim();
                                
                                // Skip headers, page numbers, dates, empty lines
                                if (lineText.length > 8 && 
                                    !/^(page|p\.|pp\.|\d{1,2}\/\d{1,2}\/\d{4}|\d{4})$/i.test(lineText) &&
                                    !lineText.match(/^\d+$/) &&
                                    !lineText.match(/^[A-Z]{2,}$/)) { // Skip all-caps headers like "JOURNAL"
                                    
                                    // Check if this looks like a title (not author line, not abstract/keywords)
                                    const lowerText = lineText.toLowerCase();
                                    if (!lowerText.includes('abstract') &&
                                        !lowerText.includes('keywords') &&
                                        !lowerText.includes('introduction') &&
                                        !lowerText.startsWith('doi:') &&
                                        !lowerText.startsWith('received:') &&
                                        !lowerText.startsWith('accepted:')) {
                                        
                                        // Title should be substantial and not just a single name
                                        // Allow titles that are longer or have multiple words
                                        if (lineText.length > 20 || lineText.split(/\s+/).length >= 3) {
                                            extractedTitle = lineText;
                                            console.log('📌 Extracted title:', extractedTitle);
                                            break;
                                        }
                                    }
                                }
                            }
                            
                            // Extract authors: Look for lines with author patterns (names, affiliations, superscripts)
                            // Authors usually appear after title, before abstract
                            // Capture full author block including superscripts, accents, and affiliations
                            let authorLines = [];
                            for (let lineIdx = 0; lineIdx < Math.min(20, sortedLines.length); lineIdx++) {
                                const line = sortedLines[lineIdx];
                                const lineText = line.items.map(item => {
                                    // Preserve superscripts, accents, and special characters exactly as they appear
                                    return item.str;
                                }).join('').trim();
                                
                                // Skip if too short or empty
                                if (lineText.length < 3) continue;
                                
                                const lowerText = lineText.toLowerCase();
                                
                                // Stop if we hit abstract/keywords/introduction
                                if (lowerText.includes('abstract') ||
                                    lowerText.includes('keywords') ||
                                    lowerText.includes('introduction') ||
                                    lowerText.startsWith('doi:')) {
                                    break;
                                }
                                
                                // Look for author patterns: names with superscripts, affiliations, "and", commas
                                const hasAuthorPattern = 
                                    lineText.match(/[A-Z][a-z]+\s+[A-Z][a-z]+/) || // Name pattern: "John Smith"
                                    lineText.match(/[A-Z][a-z]+\s+[A-Z]\./) || // Initial pattern: "John A."
                                    lineText.match(/[A-Z][a-z]+\s+[A-Z][a-z]+\s+[A-Z][a-z]+/) || // Full name: "John A. Smith"
                                    (lineText.match(/\d+/) && lineText.match(/[A-Z][a-z]+/)) || // Superscript numbers with names
                                    lineText.includes('*') || // Affiliations
                                    lineText.includes('and') ||
                                    lineText.includes(',');
                                
                                if (hasAuthorPattern) {
                                    authorLines.push(lineText);
                                    console.log('👤 Found author line:', lineText);
                                } else if (authorLines.length > 0) {
                                    // If we already found authors, this might be an affiliation line
                                    // Include it if it contains affiliation keywords
                                    if (lowerText.includes('university') ||
                                        lowerText.includes('department') ||
                                        lowerText.includes('institute') ||
                                        lowerText.includes('college') ||
                                        lowerText.includes('@') || // Email
                                        lineText.match(/\d+/)) { // Numbers (affiliation IDs)
                                        authorLines.push(lineText);
                                    } else {
                                        // Stop if we hit non-author content after authors
                                        break;
                                    }
                                }
                            }
                            
                            // Combine all author lines, preserving formatting
                            if (authorLines.length > 0) {
                                extractedAuthors = authorLines.join(' ');
                                console.log('👤 Extracted full authors block:', extractedAuthors);
                            }
                        }
                        
                        // Build full page 1 text from native extraction
                        const pageText = items
                            .map(item => item.str)
                            .join(' ')
                            .trim();
                        page1Text = pageText;
                        
                        // ALWAYS perform OCR on page 1 to capture:
                        // - Publisher names in logos
                        // - Text in headers/footers
                        // - Any text missed by native extraction
                        const viewportOCR = page.getViewport({ scale: 2.5 }); // Higher scale for better OCR quality
                        const canvas = document.createElement('canvas');
                        const context = canvas.getContext('2d');
                        canvas.height = viewportOCR.height;
                        canvas.width = viewportOCR.width;
                        
                        await page.render({ canvasContext: context, viewport: viewportOCR }).promise;
                        
                        const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
                        if (blob) {
                            try {
                                // OCR with English + Arabic language support for better publisher name detection
                                const { data: { text: ocrText } } = await Tesseract.recognize(blob, 'eng+ara', {
                                    logger: () => {} // Silent OCR
                                });
                                
                                if (ocrText && ocrText.trim().length > 0) {
                                    // Extract publisher from OCR (look for publisher patterns)
                                    const publisherPatterns = [
                                        /published\s+by\s+([A-Z][A-Za-z\s&]+)/i,
                                        /publisher[:\s]+([A-Z][A-Za-z\s&]+)/i,
                                        /©\s+(\d{4})\s+([A-Z][A-Za-z\s&]+)/i,
                                        /(MDPI|Springer|Elsevier|IEEE|ACM|Wiley|Taylor\s+&\s+Francis|Oxford|Cambridge)/i
                                    ];
                                    
                                    for (const pattern of publisherPatterns) {
                                        const match = ocrText.match(pattern);
                                        if (match) {
                                            extractedPublisher = match[1] || match[2] || match[0];
                                            console.log('🏢 Extracted publisher from OCR:', extractedPublisher);
                                            break;
                                        }
                                    }
                                    
                                    // Combine both native text extraction and OCR for maximum coverage
                                    const combinedText = [pageText, ocrText].filter(t => t && t.trim()).join('\n\n');
                                    
                                    // Remove exact duplicates while preserving order
                                    const allLines = combinedText.split('\n');
                                    const seen = new Set();
                                    const uniqueLines = [];
                                    
                                    for (const line of allLines) {
                                        const trimmed = line.trim();
                                        const normalized = trimmed.toLowerCase();
                                        
                                        // Skip empty lines and exact duplicates
                                        if (trimmed.length > 2 && !seen.has(normalized)) {
                                            seen.add(normalized);
                                            uniqueLines.push(line);
                                        }
                                    }
                                    
                                    page1Text = uniqueLines.join('\n');
                                    console.log('✅ Page 1 text combined from native extraction + OCR (includes logos/publisher names)');
                                    
                                    if (ocrText.trim().length > pageText.length * 1.5) {
                                        console.log('📸 OCR found significantly more text - likely captured logos/images');
                                    }
                                } else {
                                    console.log('⚠️ OCR returned no text for page 1, using native extraction only');
                                }
                            } catch (ocrError) {
                                console.warn('OCR failed for page 1, using native extraction:', ocrError);
                                // Keep the native extracted text if OCR fails
                            }
                        }
                        
                        // Cleanup canvas
                        canvas.width = 0;
                        canvas.height = 0;
                    } else {
                        // Regular processing for other pages
                        const pageText = items.map(item => item.str).join(' ').trim();
                        if (pageText && pageText.length > 50) {
                            // Good text extraction - use it!
                            restOfDocumentText += `\n--- Page ${i} ---\n${pageText}\n`;
                        } else {
                            // Too little text - likely scanned image, use OCR with Arabic support
                            const viewport = page.getViewport({ scale: 2.5 }); // Higher scale for better OCR
                            const canvas = document.createElement('canvas');
                            const context = canvas.getContext('2d');
                            canvas.height = viewport.height;
                            canvas.width = viewport.width;
                            
                            await page.render({ canvasContext: context, viewport: viewport }).promise;
                            
                            const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
                            if (blob) {
                                try {
                                    // Use Arabic + English OCR for all pages (scanned PDFs often contain Arabic)
                                    const { data: { text: ocrText } } = await Tesseract.recognize(blob, 'eng+ara', {
                                    logger: () => {} // Silent OCR
                                });
                                if (ocrText && ocrText.trim().length > 10) {
                                    restOfDocumentText += `\n--- Page ${i} (OCR) ---\n${ocrText.trim()}\n`;
                                    } else if (pageText && pageText.trim().length > 0) {
                                        // Fallback to native extraction if OCR fails
                                        restOfDocumentText += `\n--- Page ${i} ---\n${pageText}\n`;
                                    }
                                } catch (ocrError) {
                                    console.warn(`OCR failed for page ${i}, using native extraction:`, ocrError);
                                    // Fallback to native extraction if OCR fails
                                    if (pageText && pageText.trim().length > 0) {
                                        restOfDocumentText += `\n--- Page ${i} ---\n${pageText}\n`;
                                    }
                                }
                            }
                            
                            // Cleanup canvas
                            canvas.width = 0;
                            canvas.height = 0;
                        }
                    }
                    
                    page.cleanup();
                } catch (pageError) {
                    console.warn(`Page ${i} failed:`, pageError);
                    // Continue with next page
                }
            }
            
            // Cleanup worker blob URL
            URL.revokeObjectURL(workerUrl);
            
            // CRITICAL: Check if document has weak text extraction overall
            // If average text per page is very low, this is likely a scanned PDF
            // Run OCR on ALL pages automatically
            const totalExtractedText = (page1Text || '') + restOfDocumentText;
            const avgCharsPerPage = totalExtractedText.length / maxPages;
            const WEAK_TEXT_THRESHOLD = 100; // If average < 100 chars per page, likely scanned
            
            if (avgCharsPerPage < WEAK_TEXT_THRESHOLD && maxPages > 0) {
                console.log(`⚠️ Weak text extraction detected (${avgCharsPerPage.toFixed(0)} chars/page). Running OCR on all pages...`);
                setSuccessMessage('Detected scanned PDF. Performing OCR on all pages (this may take a minute)...');
                
                // Re-process all pages with OCR
                const pdfjsLib2 = await import('pdfjs-dist');
                const pdfjsVersion2 = pdfjsLib2.version || '4.4.168';
                
                // Fetch worker with error handling
                let workerCode2;
                try {
                    const response = await fetch(`https://unpkg.com/pdfjs-dist@${pdfjsVersion2}/build/pdf.worker.min.mjs`, {
                        signal: AbortSignal.timeout(10000)
                    });
                    if (response.ok) {
                        workerCode2 = await response.text();
                    } else {
                        throw new Error(`Worker fetch failed: ${response.status}`);
                    }
                } catch (error) {
                    console.warn('Worker fetch failed, using fallback:', error);
                    try {
                        const fallbackResponse = await fetch(`https://cdn.jsdelivr.net/npm/pdfjs-dist@${pdfjsVersion2}/build/pdf.worker.min.mjs`, {
                            signal: AbortSignal.timeout(10000)
                        });
                        if (fallbackResponse.ok) {
                            workerCode2 = await fallbackResponse.text();
                        }
                    } catch (fallbackError) {
                        console.error('All worker fetch attempts failed');
                        pdfjsLib2.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjsVersion2}/build/pdf.worker.min.mjs`;
                    }
                }
                
                if (workerCode2) {
                    const workerBlob2 = new Blob([workerCode2], { type: 'application/javascript' });
                    const workerUrl2 = URL.createObjectURL(workerBlob2);
                    pdfjsLib2.GlobalWorkerOptions.workerSrc = workerUrl2;
                }
                
                const loadingTask2 = pdfjsLib2.getDocument({ data: arrayBuffer, verbosity: 0 });
                const pdf2 = await loadingTask2.promise;
                
                let ocrFullText = '';
                for (let i = 1; i <= Math.min(pdf2.numPages, 30); i++) {
                    try {
                        const page = await pdf2.getPage(i);
                        const viewport = page.getViewport({ scale: 2.5 });
                        const canvas = document.createElement('canvas');
                        const context = canvas.getContext('2d');
                        canvas.height = viewport.height;
                        canvas.width = viewport.width;
                        
                        await page.render({ canvasContext: context, viewport: viewport }).promise;
                        const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
                        
                        if (blob) {
                            try {
                                // Use Arabic + English OCR for scanned PDFs
                                const { data: { text: ocrText } } = await Tesseract.recognize(blob, 'eng+ara', {
                                    logger: () => {}
                                });
                                
                                if (ocrText && ocrText.trim().length > 0) {
                                    ocrFullText += `\n--- Page ${i} (OCR) ---\n${ocrText.trim()}\n`;
                                }
                            } catch (ocrError) {
                                console.warn(`OCR failed for page ${i}:`, ocrError);
                            }
                        }
                        
                        // Cleanup
                        canvas.width = 0;
                        canvas.height = 0;
                        page.cleanup();
                    } catch (pageError) {
                        console.warn(`Page ${i} OCR failed:`, pageError);
                    }
                }
                
                URL.revokeObjectURL(workerUrl2);
                
                // Replace text with OCR results if OCR found more content
                if (ocrFullText.trim().length > totalExtractedText.length) {
                    console.log('✅ OCR found more text than native extraction. Using OCR results.');
                    restOfDocumentText = ocrFullText;
                    // Also update page1Text if OCR found content for page 1
                    const page1OcrMatch = ocrFullText.match(/--- Page 1 \(OCR\) ---\n([\s\S]*?)(?=\n--- Page 2|$)/);
                    if (page1OcrMatch) {
                        page1Text = page1OcrMatch[1].trim();
                    }
                }
            }
            
            // Step 3: Extract comprehensive book structure and metadata
            // Analyze full text to identify structural elements
            const fullTextForAnalysis = (page1Text || '') + '\n\n' + (restOfDocumentText || '');
            
            // Extract comprehensive book metadata
            const extractBookStructure = (text) => {
                const structure = {
                    tableOfContents: [],
                    index: [],
                    introduction: '',
                    units: [],
                    chapters: [],
                    tables: [],
                    references: [],
                    pageNumbers: [],
                    publicationDate: '',
                    shapesAndBubbles: []
                };
                
                const lines = text.split('\n');
                let currentSection = '';
                let tocStart = false;
                let indexStart = false;
                let introStart = false;
                let refStart = false;
                
                lines.forEach((line, idx) => {
                    const trimmed = line.trim();
                    const lower = trimmed.toLowerCase();
                    
                    // Detect Table of Contents
                    if (/(table\s+of\s+contents|محتويات|فهرس|المحتويات)/i.test(trimmed)) {
                        tocStart = true;
                        structure.tableOfContents.push({ type: 'header', text: trimmed, page: idx });
                    } else if (tocStart && (/(introduction|chapter|unit|chapter|unit|chapter|unit)/i.test(lower) || /^\d+/.test(trimmed))) {
                        if (trimmed.length > 0 && trimmed.length < 200) {
                            structure.tableOfContents.push({ text: trimmed, page: idx });
                        }
                        if (/(chapter|unit|introduction)/i.test(lower) && idx > 10) {
                            tocStart = false; // End of TOC
                        }
                    }
                    
                    // Detect Index
                    if (/(^index$|^الفهرس$|^المسرد$)/i.test(trimmed)) {
                        indexStart = true;
                    } else if (indexStart && trimmed.length > 0 && trimmed.length < 150) {
                        structure.index.push({ text: trimmed, page: idx });
                        if (idx > 20 && !/([a-z]+\s+\d+|\d+\s+[a-z]+)/i.test(trimmed)) {
                            indexStart = false;
                        }
                    }
                    
                    // Detect Introduction
                    if (/(^introduction|^مقدمة|^تمهيد)/i.test(trimmed)) {
                        introStart = true;
                        structure.introduction = trimmed;
                    } else if (introStart && trimmed.length > 0) {
                        if (!structure.introduction.includes(trimmed.substring(0, 100))) {
                            structure.introduction += '\n' + trimmed;
                        }
                        if (/(^chapter|^unit|^chapter|^unit|^الفصل|^الوحدة)/i.test(trimmed)) {
                            introStart = false;
                        }
                    }
                    
                    // Detect Units/Chapters (Arabic and English)
                    const unitPattern = /(unit\s+\d+|الوحدة\s+\d+|chapter\s+\d+|الفصل\s+\d+|الدرس\s+\d+)/i;
                    if (unitPattern.test(trimmed)) {
                        const match = trimmed.match(unitPattern);
                        structure.units.push({ 
                            name: trimmed, 
                            number: match[0], 
                            page: idx,
                            fullText: lines.slice(idx, Math.min(idx + 50, lines.length)).join('\n').substring(0, 500)
                        });
                    }
                    
                    // Detect Tables (look for patterns like "Table 1", "جدول 1", or structured data)
                    if (/(table\s+\d+|جدول\s+\d+|^[\s]*\|.*\|[\s]*$)/i.test(trimmed)) {
                        structure.tables.push({ text: trimmed, page: idx });
                    }
                    
                    // Detect References/Bibliography
                    if (/(references|bibliography|مراجع|المصادر)/i.test(trimmed)) {
                        refStart = true;
                    } else if (refStart && trimmed.length > 0) {
                        if (/^\d+\.|^\[/.test(trimmed) || /^\w+,\s+\w+/.test(trimmed)) {
                            structure.references.push({ text: trimmed, page: idx });
                        }
                    }
                    
                    // Detect Page Numbers
                    const pageNumMatch = trimmed.match(/(?:page|صفحة|ص)\s*(\d+)/i);
                    if (pageNumMatch) {
                        structure.pageNumbers.push({ number: pageNumMatch[1], context: trimmed, page: idx });
                    }
                    
                    // Detect Shapes/Bubbles (callouts, notes, sidebars)
                    if (/(note|ملاحظة|نص|callout|sidebar|معلومة|تذكر)/i.test(trimmed) && trimmed.length < 200) {
                        structure.shapesAndBubbles.push({ text: trimmed, page: idx, type: 'note' });
                    }
                    
                    // Detect Publication Date
                    const datePattern = /(\d{4}|\d{1,2}\/\d{1,2}\/\d{4})/;
                    if (datePattern.test(trimmed) && (lower.includes('copyright') || lower.includes('©') || lower.includes('تاريخ'))) {
                        const dateMatch = trimmed.match(datePattern);
                        if (dateMatch) structure.publicationDate = dateMatch[0];
                    }
                });
                
                return structure;
            };
            
            const bookStructure = extractBookStructure(fullTextForAnalysis);
            
            // Step 4: Combine metadata + page 1 + rest of document
            // Use extracted title/authors/publisher from page 1, fallback to embedded metadata
            const title = extractedTitle || metadata.title || '';
            const authors = extractedAuthors || metadata.author || '';
            const publisher = extractedPublisher || metadata.subject || ''; // Use subject as publisher fallback
            
            // Build full text from all pages
            let fullTextFromPDF = '';
            if (page1Text) {
                fullTextFromPDF += `--- Page 1 ---\n${page1Text}\n\n`;
            }
            if (restOfDocumentText) {
                fullTextFromPDF += restOfDocumentText;
            }
            
            // Build comprehensive metadata block
            const metadataBlock = `
[DOCUMENT_METADATA]
Title: ${title || "Not found in the document"}
Authors: ${authors || "Not found in the document"}
Publisher: ${publisher || "Not found in the document"}
Publication Date: ${bookStructure.publicationDate || metadata.keywords?.match(/\d{4}/)?.[0] || "Not found in the document"}
Total Pages: ${maxPages}
[/DOCUMENT_METADATA]

[BOOK_STRUCTURE]
Table of Contents: ${bookStructure.tableOfContents.length > 0 ? bookStructure.tableOfContents.slice(0, 20).map(t => t.text || t).join(' | ') : "Not found"}
Index: ${bookStructure.index.length > 0 ? bookStructure.index.slice(0, 30).map(i => i.text).join(' | ') : "Not found"}
Introduction: ${bookStructure.introduction ? bookStructure.introduction.substring(0, 500) + '...' : "Not found"}
Units/Chapters Found: ${bookStructure.units.length} units
${bookStructure.units.length > 0 ? bookStructure.units.map(u => `  - ${u.name} (Page ${u.page})`).join('\n') : ''}
Tables Found: ${bookStructure.tables.length} tables
References Found: ${bookStructure.references.length} references
Page Numbers: ${bookStructure.pageNumbers.length > 0 ? 'Yes, page numbers detected' : 'Not explicitly marked'}
Notes/Callouts: ${bookStructure.shapesAndBubbles.length} found
[/BOOK_STRUCTURE]

[NAVIGATION_GUIDE]
This document contains:
- ${bookStructure.units.length} units/chapters that students can navigate to
- ${bookStructure.tables.length} tables for reference
- ${bookStructure.references.length} references for further reading
- Table of Contents: ${bookStructure.tableOfContents.length > 0 ? 'Available' : 'Not found'}
- Index: ${bookStructure.index.length > 0 ? 'Available' : 'Not found'}
Students should learn to use these elements to navigate the book effectively.
[/NAVIGATION_GUIDE]

${fullTextFromPDF}
`.trim();
            
            const finalExtractedText = metadataBlock;
            
            // CRITICAL: If no text extracted or very little text, run OCR on ALL pages as last resort
            // This ensures we ALWAYS have text - matching the user's example pattern exactly
            if (!finalExtractedText.trim() || finalExtractedText.length < 100) {
                console.warn('⚠️ No text extracted or very little text. Running full OCR on all pages as last resort...');
                console.log('🔄 Following pattern: extractPDFText() → if empty → performOCR()');
                setSuccessMessage('Running OCR on all pages (this may take a few minutes)...');
                
                // Re-process with OCR on ALL pages
                const pdfjsLib3 = await import('pdfjs-dist');
                const pdfjsVersion3 = pdfjsLib3.version || '4.4.168';
                // Fetch worker with error handling
                let workerCode3;
                try {
                    const response = await fetch(`https://unpkg.com/pdfjs-dist@${pdfjsVersion3}/build/pdf.worker.min.mjs`, {
                        signal: AbortSignal.timeout(10000)
                    });
                    if (response.ok) {
                        workerCode3 = await response.text();
                    } else {
                        throw new Error(`Worker fetch failed: ${response.status}`);
                    }
                } catch (error) {
                    console.warn('Worker fetch failed, using fallback:', error);
                    try {
                        const fallbackResponse = await fetch(`https://cdn.jsdelivr.net/npm/pdfjs-dist@${pdfjsVersion3}/build/pdf.worker.min.mjs`, {
                            signal: AbortSignal.timeout(10000)
                        });
                        if (fallbackResponse.ok) {
                            workerCode3 = await fallbackResponse.text();
                        }
                    } catch (fallbackError) {
                        console.error('All worker fetch attempts failed');
                        pdfjsLib3.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjsVersion3}/build/pdf.worker.min.mjs`;
                    }
                }
                
                if (workerCode3) {
                    const workerBlob3 = new Blob([workerCode3], { type: 'application/javascript' });
                    const workerUrl3 = URL.createObjectURL(workerBlob3);
                    pdfjsLib3.GlobalWorkerOptions.workerSrc = workerUrl3;
                }
                
                const loadingTask3 = pdfjsLib3.getDocument({ data: arrayBuffer, verbosity: 0 });
                const pdf3 = await loadingTask3.promise;
                const totalPages = Math.min(pdf3.numPages, 50); // Limit to 50 pages for performance
                
                let ocrFinalText = '[DOCUMENT_METADATA]\nTitle: Extracted via OCR\nAuthors: Not found\nPublisher: Not found\n[/DOCUMENT_METADATA]\n\n[BOOK_STRUCTURE]\nNote: Full OCR extraction performed\n[/BOOK_STRUCTURE]\n\n';
                
                for (let i = 1; i <= totalPages; i++) {
                    try {
                        const page = await pdf3.getPage(i);
                        const viewport = page.getViewport({ scale: 3.0 }); // High quality
                        const canvas = document.createElement('canvas');
                        const context = canvas.getContext('2d');
                        canvas.height = viewport.height;
                        canvas.width = viewport.width;
                        
                        await page.render({ canvasContext: context, viewport: viewport }).promise;
                        const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
                        
                        if (blob) {
                            try {
                                const { data: { text: ocrPageText } } = await Tesseract.recognize(blob, 'eng+ara', {
                                    logger: () => {}
                                });
                                
                                if (ocrPageText && ocrPageText.trim().length > 0) {
                                    ocrFinalText += `--- Page ${i} (OCR) ---\n${ocrPageText.trim()}\n\n`;
                                }
                            } catch (ocrError) {
                                console.warn(`OCR failed for page ${i}:`, ocrError);
                            }
                        }
                        
                        canvas.width = 0;
                        canvas.height = 0;
                        page.cleanup();
                    } catch (pageError) {
                        console.warn(`Page ${i} failed:`, pageError);
                    }
                }
                
                URL.revokeObjectURL(workerUrl3);
                
                if (ocrFinalText.length > 200) {
                    console.log('✅ OCR extraction successful. Text length:', ocrFinalText.length);
                    return ocrFinalText.trim();
                }
            }
            
            // FINAL VERIFICATION: Ensure we ALWAYS return text (never empty)
            // This matches the user's example: if extractPDFText is empty, performOCR must succeed
            if (!finalExtractedText.trim() || finalExtractedText.length < 50) {
                console.error('❌ CRITICAL: Still no text after all extraction attempts!');
                throw new Error('No text extracted from PDF even after OCR. The PDF might be corrupted, password-protected, or contain only images.');
            }
            
            console.log('✅ PDF extraction SUCCESS - Text length:', finalExtractedText.length);
            return finalExtractedText.trim();
        } catch (error) {
            // Better error handling
            const errorMsg = error?.message || error?.toString() || 'Unknown error occurred';
            const detailedError = `PDF processing failed: ${errorMsg}`;
            console.error('PDF extraction error:', error);
            throw new Error(detailedError);
        }
    };
    
    // --- Parse User Question to Detect Lesson Number or Topic ---
    const parseUserQuestion = (question) => {
        if (!question) return { type: 'general', lessonNumber: null, topic: null };
        
        const lowerQuestion = question.toLowerCase();
        const arabicQuestion = question;
        
        // Detect lesson number (Arabic and English)
        const lessonNumberPatterns = [
            // English
            /(?:first|1st|one)\s+(?:lesson|unit|chapter)/i,
            /(?:second|2nd|two)\s+(?:lesson|unit|chapter)/i,
            /(?:third|3rd|three)\s+(?:lesson|unit|chapter)/i,
            /(?:fourth|4th|four)\s+(?:lesson|unit|chapter)/i,
            /(?:fifth|5th|five)\s+(?:lesson|unit|chapter)/i,
            /lesson\s+(?:1|one|first)/i,
            /lesson\s+(?:2|two|second)/i,
            /lesson\s+(?:3|three|third)/i,
            /lesson\s+(?:4|four|fourth)/i,
            /lesson\s+(?:5|five|fifth)/i,
            /unit\s+(?:1|one|first)/i,
            /unit\s+(?:2|two|second)/i,
            /unit\s+(?:3|three|third)/i,
            /unit\s+(?:4|four|fourth)/i,
            /unit\s+(?:5|five|fifth)/i,
            /chapter\s+(?:1|one|first)/i,
            /chapter\s+(?:2|two|second)/i,
            /chapter\s+(?:3|three|third)/i,
            /chapter\s+(?:4|four|fourth)/i,
            /chapter\s+(?:5|five|fifth)/i,
            // Arabic
            /الدرس\s*(?:الأول|1|واحد)/i,
            /الدرس\s*(?:الثاني|2|اثنين)/i,
            /الدرس\s*(?:الثالث|3|ثلاثة)/i,
            /الدرس\s*(?:الرابع|4|أربعة)/i,
            /الدرس\s*(?:الخامس|5|خمسة)/i,
            /الوحدة\s*(?:الأولى|1|واحد)/i,
            /الوحدة\s*(?:الثانية|2|اثنين)/i,
            /الوحدة\s*(?:الثالثة|3|ثلاثة)/i,
            /الوحدة\s*(?:الرابعة|4|أربعة)/i,
            /الوحدة\s*(?:الخامسة|5|خمسة)/i,
        ];
        
        // Extract lesson number
        let lessonNumber = null;
        for (const pattern of lessonNumberPatterns) {
            const match = question.match(pattern);
            if (match) {
                // Extract number from match
                const numMatch = match[0].match(/(\d+)|(?:first|one|الأول|واحد)|(?:second|two|الثاني|اثنين)|(?:third|three|الثالث|ثلاثة)|(?:fourth|four|الرابع|أربعة)|(?:fifth|five|الخامس|خمسة)/i);
                if (numMatch) {
                    if (numMatch[1]) {
                        lessonNumber = parseInt(numMatch[1]);
                    } else {
                        const word = numMatch[0].toLowerCase();
                        if (word.includes('first') || word.includes('one') || word.includes('الأول') || word.includes('واحد')) lessonNumber = 1;
                        else if (word.includes('second') || word.includes('two') || word.includes('الثاني') || word.includes('اثنين')) lessonNumber = 2;
                        else if (word.includes('third') || word.includes('three') || word.includes('الثالث') || word.includes('ثلاثة')) lessonNumber = 3;
                        else if (word.includes('fourth') || word.includes('four') || word.includes('الرابع') || word.includes('أربعة')) lessonNumber = 4;
                        else if (word.includes('fifth') || word.includes('five') || word.includes('الخامس') || word.includes('خمسة')) lessonNumber = 5;
                    }
                }
                if (lessonNumber) break;
            }
        }
        
        // If no lesson number detected, try to extract topic/term
        let topic = null;
        if (!lessonNumber) {
            // Look for "what is", "explain", "tell me about" patterns
            const topicPatterns = [
                /(?:what is|what's|explain|tell me about|define|ما هو|ما هي|اشرح|عرف)\s+([^?.,!]+)/i,
                /(?:overview|summary|ملخص|نظرة عامة)\s+(?:of|about|عن)\s+([^?.,!]+)/i,
            ];
            
            for (const pattern of topicPatterns) {
                const match = question.match(pattern);
                if (match && match[1]) {
                    topic = match[1].trim();
                    // Clean up topic (remove common words)
                    topic = topic.replace(/^(the|a|an|about|of|عن|في|من)\s+/i, '').trim();
                    if (topic.length > 2) break;
                }
            }
        }
        
        return {
            type: lessonNumber ? 'lesson' : (topic ? 'topic' : 'general'),
            lessonNumber: lessonNumber,
            topic: topic
        };
    };
    
    // --- Extract Specific Lesson by Number ---
    const extractLessonByNumber = (text, lessonNumber) => {
        if (!text || !lessonNumber || lessonNumber < 1) return null;
        
        // Arabic number words
        const arabicNumbers = {
            1: ['الأول', 'الأولى', 'واحد', 'واحدة'],
            2: ['الثاني', 'الثانية', 'اثنين', 'اثنتين'],
            3: ['الثالث', 'الثالثة', 'ثلاثة', 'ثلاث'],
            4: ['الرابع', 'الرابعة', 'أربعة', 'أربع'],
            5: ['الخامس', 'الخامسة', 'خمسة', 'خمس']
        };
        
        // Build patterns for this lesson number
        const lessonStartPatterns = [
            new RegExp(`الدرس\\s*(?:${arabicNumbers[lessonNumber]?.join('|') || ''}|${lessonNumber})`, 'i'),
            new RegExp(`الوحدة\\s*(?:${arabicNumbers[lessonNumber]?.join('|') || ''}|${lessonNumber})`, 'i'),
            new RegExp(`Unit\\s+${lessonNumber}`, 'i'),
            new RegExp(`Chapter\\s+${lessonNumber}`, 'i'),
            new RegExp(`Lesson\\s+${lessonNumber}`, 'i'),
        ];
        
        // Build patterns for next lesson (end marker)
        const nextLessonNumber = lessonNumber + 1;
        const lessonEndPatterns = [
            new RegExp(`الدرس\\s*(?:${arabicNumbers[nextLessonNumber]?.join('|') || ''}|${nextLessonNumber})`, 'i'),
            new RegExp(`الوحدة\\s*(?:${arabicNumbers[nextLessonNumber]?.join('|') || ''}|${nextLessonNumber})`, 'i'),
            new RegExp(`Unit\\s+${nextLessonNumber}`, 'i'),
            new RegExp(`Chapter\\s+${nextLessonNumber}`, 'i'),
            new RegExp(`Lesson\\s+${nextLessonNumber}`, 'i'),
        ];
        
        let startIndex = -1;
        let endIndex = text.length;
        
        // Find start
        for (const pattern of lessonStartPatterns) {
            const match = text.match(pattern);
            if (match) {
                startIndex = match.index;
                console.log(`✅ Found lesson ${lessonNumber} start:`, match[0]);
                break;
            }
        }
        
        // Find end
        if (startIndex !== -1) {
            for (const pattern of lessonEndPatterns) {
                const match = text.match(pattern);
                if (match && match.index > startIndex) {
                    endIndex = match.index;
                    console.log(`✅ Found lesson ${lessonNumber} end:`, match[0]);
                    break;
                }
            }
        }
        
        if (startIndex === -1) {
            console.log(`⚠️ Lesson ${lessonNumber} not found`);
            return null;
        }
        
        const lessonText = text.slice(startIndex, endIndex);
        console.log(`✅ Extracted lesson ${lessonNumber}: ${lessonText.length} characters`);
        return lessonText;
    };
    
    // --- Extract Sections Containing a Specific Topic/Term ---
    const extractTopicSections = (text, topic) => {
        if (!text || !topic || topic.length < 2) return null;
        
        const lowerTopic = topic.toLowerCase();
        const topicWords = lowerTopic.split(/\s+/).filter(w => w.length > 2);
        
        // Split text into paragraphs/sections
        const sections = text.split(/\n\n+/).filter(s => s.trim().length > 50);
        
        // Find sections containing the topic
        const relevantSections = sections.filter(section => {
            const lowerSection = section.toLowerCase();
            // Check if section contains any of the topic words
            return topicWords.some(word => lowerSection.includes(word));
        });
        
        if (relevantSections.length === 0) {
            console.log(`⚠️ No sections found containing topic: ${topic}`);
            return null;
        }
        
        // Combine relevant sections with context (add surrounding paragraphs)
        let result = '';
        const sectionIndices = new Set();
        sections.forEach((section, idx) => {
            if (relevantSections.includes(section)) {
                sectionIndices.add(idx);
                // Include previous and next section for context
                if (idx > 0) sectionIndices.add(idx - 1);
                if (idx < sections.length - 1) sectionIndices.add(idx + 1);
            }
        });
        
        Array.from(sectionIndices).sort((a, b) => a - b).forEach(idx => {
            result += sections[idx] + '\n\n';
        });
        
        console.log(`✅ Extracted ${relevantSections.length} sections containing topic "${topic}": ${result.length} characters`);
        return result.trim();
    };
    
    // --- Smart Content Extraction Based on User Question ---
    const extractRelevantContent = (text, userQuestion) => {
        if (!text || !userQuestion) return null;
        
        const parsed = parseUserQuestion(userQuestion);
        console.log('🔍 Parsed question:', parsed);
        
        if (parsed.type === 'lesson' && parsed.lessonNumber) {
            return extractLessonByNumber(text, parsed.lessonNumber);
        } else if (parsed.type === 'topic' && parsed.topic) {
            return extractTopicSections(text, parsed.topic);
        }
        
        return null; // Return null to use full text or other extraction
    };
    
    // --- Chunk Text to Respect Token Limits (helper function) ---
    const chunkTextHelper = (text, maxChars = 2000) => {
        if (!text || text.length <= maxChars) {
            return [text];
        }
        
        const chunks = [];
        // Try to split at sentence boundaries first
        const sentences = text.match(/[^.!?]+[.!?]+/g) || [text];
        let currentChunk = '';
        
        for (const sentence of sentences) {
            if ((currentChunk + sentence).length <= maxChars) {
                currentChunk += sentence;
            } else {
                if (currentChunk) {
                    chunks.push(currentChunk.trim());
                }
                // If single sentence is too long, split it
                if (sentence.length > maxChars) {
                    for (let i = 0; i < sentence.length; i += maxChars) {
                        chunks.push(sentence.slice(i, i + maxChars).trim());
                    }
                } else {
                    currentChunk = sentence;
                }
            }
        }
        
        if (currentChunk) {
            chunks.push(currentChunk.trim());
        }
        
        return chunks.filter(chunk => chunk.length > 0);
    };
    
    // Store in component for use in hfFetch
    const chunkText = chunkTextHelper;
    
    // --- Estimate Token Count (rough: 1 token ≈ 4 chars for English, 2-3 for Arabic) ---
    const estimateTokensHelper = (text) => {
        if (!text) return 0;
        // Rough estimation: English ~4 chars/token, Arabic ~2.5 chars/token
        // Use average of 3.5 chars per token for mixed content
        return Math.ceil(text.length / 3.5);
    };
    
    // Store in component
    const estimateTokens = estimateTokensHelper;
    
    // --- Convert Text to CSV/MD/TXT Format ---
    const convertTextToFormat = (text, format = 'txt') => {
        if (format === 'csv') {
            // Simple CSV conversion - split by lines and wrap in quotes
            const lines = text.split('\n').filter(line => line.trim());
            return lines.map(line => `"${line.replace(/"/g, '""')}"`).join('\n');
        } else if (format === 'md') {
            // Markdown format - add some structure
            return `# Document Content\n\n${text.split('\n').map(line => line.trim() ? line : '').join('\n')}`;
        } else {
            // Plain text
            return text;
        }
    };
    
    // --- Download Converted File ---
    const downloadConvertedFile = (text, originalFileName, format = 'txt') => {
        const convertedText = convertTextToFormat(text, format);
        const blob = new Blob([convertedText], { type: format === 'csv' ? 'text/csv' : format === 'md' ? 'text/markdown' : 'text/plain' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = originalFileName.replace(/\.pdf$/i, `.${format}`);
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        setSuccessMessage(`File downloaded as ${format.toUpperCase()}!`);
        setTimeout(() => setSuccessMessage(''), 3000);
    };

/** Fetches from Hugging Face API using OpenAI-compatible router endpoint. */
const hfFetch = async (model, messages, retries = 3, extractRelevantContentFn = null, parseUserQuestionFn = null) => {
        if (!HF_API_KEY) {
        throw new Error("Hugging Face API Key is not configured. Please set VITE_HF_API_KEY in your .env file.");
    }
    
    // CRITICAL: Ensure messages is always an array in the correct format
    if (!Array.isArray(messages)) {
        throw new Error(`HuggingFace API Error: messages must be an array. Received: ${typeof messages}. Expected format: [{ role: "system", content: "..." }, { role: "user", content: "..." }]`);
    }
    
    // Validate message format
    const validMessages = messages.map((msg, idx) => {
        if (typeof msg === 'string') {
            // Convert string to user message
            return { role: 'user', content: msg };
        } else if (msg && typeof msg === 'object') {
            // Ensure role and content exist
            if (!msg.role || !msg.content) {
                throw new Error(`HuggingFace API Error: Invalid message format at index ${idx}. Each message must have 'role' and 'content' properties.`);
            }
            return { role: msg.role, content: String(msg.content) };
        } else {
            throw new Error(`HuggingFace API Error: Invalid message type at index ${idx}. Expected string or object with role/content.`);
        }
    });
    
    if (validMessages.length === 0) {
        throw new Error("HuggingFace API Error: messages array is empty. At least one message is required.");
    }
    
    // Use OpenAI-compatible format: router.huggingface.co/v1/chat/completions
    // Model format: meta-llama/Llama-3.1-8B-Instruct (optional provider like :novita)
    // Option 1: Use Hugging Face default (FREE) - just use model name
    // Option 2: Use provider (may have cost) - add :provider suffix
    // Set USE_PROVIDER=false in .env to disable provider and use free Hugging Face inference
    const useProvider = import.meta.env.VITE_USE_HF_PROVIDER !== 'false';
    const modelWithProvider = model.includes(':') 
        ? model 
        : (useProvider ? `${model}:novita` : model);
    // Dev: use Vite proxy. Prod: call HuggingFace directly (works on Vercel, Hostinger, etc.)
    const apiUrl = import.meta.env.DEV
        ? `/hf-api/chat/completions`
        : `https://router.huggingface.co/v1/chat/completions`;
    
    // Determine max_tokens based on request type
    // For summaries and complex requests, allow longer responses
    const lastMessage = validMessages[validMessages.length - 1]?.content || '';
    const isComplexRequest = lastMessage.toLowerCase().includes('summar') || 
                           lastMessage.toLowerCase().includes('explain') ||
                           lastMessage.toLowerCase().includes('overview') ||
                           lastMessage.toLowerCase().includes('detail');
    const maxTokens = isComplexRequest ? 2048 : 1024; // More tokens for summaries
    
    // CRITICAL: Check token limit (8192 tokens max for most models)
    // Estimate tokens: roughly 1 token = 3.5 characters
    const MAX_CONTEXT_TOKENS = 7000; // Leave room for response (8192 - 1000 for response)
    const totalEstimatedTokens = validMessages.reduce((sum, msg) => {
        return sum + Math.ceil((msg.content?.length || 0) / 3.5);
    }, 0);
    
    // If exceeding limit, chunk the largest message
    if (totalEstimatedTokens > MAX_CONTEXT_TOKENS) {
        console.warn(`⚠️ Token limit exceeded (${totalEstimatedTokens} > ${MAX_CONTEXT_TOKENS}). Chunking content...`);
        
        // Find the largest message (usually the system prompt with PDF content)
        let largestMsgIndex = 0;
        let largestSize = 0;
        validMessages.forEach((msg, idx) => {
            const size = msg.content?.length || 0;
            if (size > largestSize) {
                largestSize = size;
                largestMsgIndex = idx;
            }
        });
        
        // Chunk the largest message
        const largestMsg = validMessages[largestMsgIndex];
        const maxCharsPerChunk = MAX_CONTEXT_TOKENS * 3.5; // Rough conversion
        
        // SMART EXTRACTION: Extract relevant content based on user's question
        let textToChunk = largestMsg.content;
        if (largestMsg.content.includes('[DOCUMENT_METADATA]') || largestMsg.content.includes('--- Page')) {
            // Get the user's question from the last message
            const userQuestion = validMessages[validMessages.length - 1]?.content || '';
            
            // Try to extract relevant content (lesson or topic)
            const relevantContent = extractRelevantContent(textToChunk, userQuestion);
            
            if (relevantContent && relevantContent.length > 0) {
                console.log('✅ Extracted relevant content based on user question');
                textToChunk = relevantContent;
            } else {
                console.log('⚠️ Could not extract specific content, using intelligent chunking');
            }
        }
        
        // Chunk the text intelligently
        const sentences = textToChunk.match(/[^.!?]+[.!?]+/g) || [textToChunk];
        let currentChunk = '';
        const chunks = [];
        
        for (const sentence of sentences) {
            if ((currentChunk + sentence).length <= maxCharsPerChunk) {
                currentChunk += sentence;
            } else {
                if (currentChunk) chunks.push(currentChunk.trim());
                if (sentence.length > maxCharsPerChunk) {
                    // Split very long sentence
                    for (let i = 0; i < sentence.length; i += maxCharsPerChunk) {
                        chunks.push(sentence.slice(i, i + maxCharsPerChunk).trim());
                    }
                    currentChunk = '';
                } else {
                    currentChunk = sentence;
                }
            }
        }
        if (currentChunk) chunks.push(currentChunk.trim());
        
        if (chunks.length > 1) {
            console.log(`📦 Split into ${chunks.length} chunks to respect token limit`);
            // Use only the first chunk for now
            validMessages[largestMsgIndex] = {
                ...largestMsg,
                content: chunks[0] + (chunks.length > 1 ? `\n\n[Note: Content truncated. Showing first chunk of ${chunks.length} total chunks to fit token limit.]` : '')
            };
        } else if (textToChunk.length > maxCharsPerChunk) {
            // Single chunk but still too large - truncate
            validMessages[largestMsgIndex] = {
                ...largestMsg,
                content: textToChunk.substring(0, maxCharsPerChunk) + '\n\n[Note: Content truncated to fit token limit.]'
            };
        } else {
            // Use the extracted first lesson
            validMessages[largestMsgIndex] = {
                ...largestMsg,
                content: textToChunk
            };
        }
        
        console.log(`✅ Reduced token count from ~${totalEstimatedTokens} to ~${Math.ceil(validMessages.reduce((sum, msg) => sum + (msg.content?.length || 0), 0) / 3.5)}`);
    }
    
    // CRITICAL: Final validation - ensure messages is definitely an array
    if (!Array.isArray(validMessages)) {
        throw new Error(`HuggingFace API Error: validMessages must be an array. Got: ${typeof validMessages}`);
    }
    
    // Ensure messages array contains valid objects
    const finalMessages = validMessages.map((msg, idx) => {
        if (!msg || typeof msg !== 'object') {
            throw new Error(`HuggingFace API Error: Message at index ${idx} is not an object: ${typeof msg}`);
        }
        if (!msg.role || typeof msg.content === 'undefined') {
            throw new Error(`HuggingFace API Error: Message at index ${idx} missing role or content: ${JSON.stringify(msg)}`);
        }
        return {
            role: String(msg.role),
            content: String(msg.content)
        };
    });
    
    if (finalMessages.length === 0) {
        throw new Error("HuggingFace API Error: No valid messages after final validation.");
    }
    
    const payload = {
        model: modelWithProvider,
        messages: finalMessages, // Always an array in OpenAI format: [{role, content}]
        max_tokens: maxTokens,
        temperature: 0.7,
    };
    
    // Final validation before sending
    if (!Array.isArray(payload.messages)) {
        throw new Error(`HuggingFace API Error: payload.messages is not an array! Type: ${typeof payload.messages}`);
    }
    
    console.log(`📤 HuggingFace API Request:`, {
        model: payload.model,
        messagesCount: payload.messages.length,
        messageRoles: payload.messages.map(m => m.role),
        maxTokens: payload.max_tokens
    });
    
    for (let i = 0; i < retries; i++) {
        try {
            const response = await fetch(apiUrl, {
                method: 'POST',
                headers: { 
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${HF_API_KEY}`
                },
                body: JSON.stringify(payload)
            });
            
            if (!response.ok) {
                const errorText = await response.text();
                let errorMessage = '';
                
                try {
                    const errorJson = JSON.parse(errorText);
                    errorMessage = errorJson.error?.message || errorJson.error || errorText;
                } catch {
                    errorMessage = errorText;
                }
                
                // More detailed error handling
                if (response.status === 401) {
                    throw new Error(`Unauthorized (401): Invalid API key. Please check your VITE_HF_API_KEY in .env file.`);
                } else if (response.status === 403) {
                    throw new Error(`Forbidden (403): Access denied. Make sure your API token has permission to use this model.`);
                } else if (response.status === 404) {
                    // Check if this is a Meta Llama model that requires license agreement
                    const isLlamaModel = model.toLowerCase().includes('llama') || model.toLowerCase().includes('meta-llama');
                    const licenseNote = isLlamaModel 
                        ? `\n\n⚠️ IMPORTANT: Meta Llama models require license agreement acceptance!` +
                          `\n1. Visit: https://huggingface.co/${model}` +
                          `\n2. Click "Agree and access repository"` +
                          `\n3. Accept the Llama Community License Agreement` +
                          `\n4. Wait for approval (may take time)` +
                          `\n5. Make sure your API token is from the account that accepted the license` +
                          `\n\n💡 Alternative: Try a different model like "mistralai/Mistral-7B-Instruct-v0.2" (no license required)`
                        : '';
                    
                    throw new Error(
                        `Model "${model}" not found (404).` +
                        `\n\nError details: ${errorMessage}` +
                        `\n\n💡 Possible fixes:` +
                        `\n- Check if model name is correct: ${model}` +
                        `\n- Try: "meta-llama/Llama-3.1-8B-Instruct" or "mistralai/Mistral-7B-Instruct-v0.2"` +
                        licenseNote
                    );
                } else if (response.status === 429) {
                    throw new Error(`Rate limit exceeded (429). Please wait a moment and try again.`);
                } else if (response.status >= 500) {
                    throw new Error(`HuggingFace server error (${response.status}): ${errorMessage}. Please try again later.`);
                }
                throw new Error(`Hugging Face API Error (${response.status}): ${errorMessage}`);
            }
            return response;
        } catch (error) {
            if (i === retries - 1) throw error;
            await new Promise(resolve => setTimeout(resolve, Math.pow(2, i) * 1000));
        }
    }
};

    const uploadFile = useCallback(async (event) => {
        // This now uploads to the current chat session
        const file = event.target.files[0];
        if (!file) return;

        // File size validation (60 MB limit for better performance)
        const MAX_FILE_SIZE = 60 * 1024 * 1024; // 60 MB in bytes
        if (file.size > MAX_FILE_SIZE) {
            setError(t('error_file_too_large'));
            return;
        }

        setLoading(true);
        setError('');
        // Clear file from current chat session
        updateChatSession(currentChatId, { file: null });
        
        try {
            let text = '';
            const fileName = file.name.toLowerCase();
            
            // REMOVED PDF SUPPORT - Too many worker errors
            // Users should convert PDFs to CSV/MD/TXT first
            
            if (file.type === 'application/pdf') {
                // PDF Processing - Use Python backend (PyMuPDF + pytesseract)
                try {
                    setError('');
                    setSuccessMessage('Processing PDF with backend... Extracting text, metadata, and performing OCR (this may take a minute for large files).');
                    
                    // Check if backend is available
                    const backendAvailable = await checkBackendHealth();
                    if (!backendAvailable) {
                        console.warn('Backend not available, falling back to client-side processing');
                        // Fallback to client-side processing
                        // FOLLOWING USER'S PATTERN: extractPDFText() → if empty → performOCR()
                        text = await extractTextFromPDF(file);
                        
                        // CRITICAL: Verify text was extracted (extractTextFromPDF should never return empty)
                        if (!text || text.trim().length === 0) {
                            console.error('❌ CRITICAL: extractTextFromPDF returned empty! This should never happen - OCR should have run.');
                            throw new Error('PDF text extraction failed. OCR should have run automatically, but no text was extracted.');
                        }
                        
                        setExtractedText(text);
                        
                        // CRITICAL: Create fileContent object immediately
                        let pdfId;
                        try {
                            pdfId = await generatePDFId(file.name, file.size);
                        } catch (idError) {
                            console.warn('Failed to generate PDF ID, using fallback:', idError);
                            pdfId = `pdf-${Date.now()}-${Math.random().toString(36).substring(7)}`;
                        }
                        
                        const processedFileContent = {
                            name: file.name,
                            size: file.size,
                            text: text, // CRITICAL: This is what Samir needs!
                            type: file.type,
                            pdfId: pdfId
                        };
                        
                        console.log('✅ Client-side PDF processing complete:');
                        console.log(`  - File: ${file.name}`);
                        console.log(`  - Text length: ${text.length} characters`);
                        console.log(`  - PDF ID: ${pdfId}`);
                        console.log(`  - First 200 chars: ${text.substring(0, 200)}...`);
                        
                        // Update chat session immediately
                        updateChatSession(currentChatId, { file: processedFileContent });
                        
                        // Process chunks for RAG (non-blocking)
                        processPDFForRAG(text, file.name, file.size, pdfId).catch(err => {
                            console.warn('Failed to process PDF for RAG:', err);
                        });
                        
                        const pageCount = (text.match(/--- Page \d+/g) || []).length;
                        setSuccessMessage(`PDF processed successfully! Extracted ${text.length.toLocaleString()} characters from ${pageCount} page(s).`);
                        setTimeout(() => setSuccessMessage(''), 5000);
                    } else {
                        // Use Python backend for processing
                        try {
                            const processedData = await processPDFWithBackend(file);
                            
                            // Extract text from processed data
                            text = processedData.full_text || '';
                            setExtractedText(text);
                            
                            // Generate PDF ID
                            let pdfId;
                            try {
                                pdfId = processedData.pdf_id || await generatePDFId(file.name, file.size);
                            } catch (idError) {
                                console.warn('Failed to generate PDF ID, using fallback:', idError);
                                pdfId = `pdf-${Date.now()}-${Math.random().toString(36).substring(7)}`;
                            }
                            
                            // Store metadata in Supabase BEFORE Samir replies (non-blocking)
                            if (userId) {
                                storePDFMetadata(userId, processedData).catch(err => {
                                    console.warn('Failed to store PDF metadata:', err);
                                });
                            }
                            
                            // Store processed data in fileContent for later use
                            const processedFileContent = {
                                name: file.name,
                                size: file.size,
                                text: text,
                                type: file.type,
                                pdfId: pdfId,
                                metadata: processedData.metadata,
                                processedData: processedData // Store full processed data
                            };
                            // Update chat session with processed file
                            updateChatSession(currentChatId, { file: processedFileContent });
                            
                            // Process chunks from backend (already chunked)
                            if (processedData.chunks && processedData.chunks.length > 0) {
                                const chunks = processedData.chunks.map((chunk, idx) => ({
                                    chunkId: idx,
                                    text: chunk.text,
                                    pdfId: pdfId
                                }));
                                setPdfChunks(chunks);
                                
                                // Store chunks in Supabase (non-blocking)
                                if (userId) {
                                    storePDFChunks(userId, pdfId, chunks).catch(err => {
                                        console.warn('Failed to store chunks:', err);
                                    });
                                }
                            }
                            
                            const title = processedData.metadata?.detected_title || processedData.metadata?.title || file.name;
                            const authors = processedData.metadata?.detected_authors?.join(', ') || processedData.metadata?.author || 'Unknown';
                            const pageCount = processedData.total_pages || 0;
                            
                            setSuccessMessage(`PDF processed successfully! Title: "${title}" by ${authors}. Extracted ${text.length.toLocaleString()} characters from ${pageCount} page(s).`);
                            setTimeout(() => setSuccessMessage(''), 8000);
                        } catch (backendError) {
                            console.error('Backend processing error:', backendError);
                            // Fallback to client-side processing
                            console.warn('Falling back to client-side PDF processing');
                            // FOLLOWING USER'S PATTERN: extractPDFText() → if empty → performOCR()
                            text = await extractTextFromPDF(file);
                            
                            // CRITICAL: Verify text was extracted
                            if (!text || text.trim().length === 0) {
                                console.error('❌ CRITICAL: extractTextFromPDF returned empty! This should never happen.');
                                throw new Error('PDF text extraction failed. OCR should have run automatically.');
                            }
                            
                            setExtractedText(text);
                            
                            // CRITICAL: Create fileContent object for client-side processing
                            // Generate PDF ID
                            let pdfId;
                            try {
                                pdfId = await generatePDFId(file.name, file.size);
                            } catch (idError) {
                                console.warn('Failed to generate PDF ID, using fallback:', idError);
                                pdfId = `pdf-${Date.now()}-${Math.random().toString(36).substring(7)}`;
                            }
                            
                            // Create fileContent object (same structure as backend processing)
                            const processedFileContent = {
                                name: file.name,
                                size: file.size,
                                text: text, // CRITICAL: This is what Samir needs to read!
                                type: file.type,
                                pdfId: pdfId
                            };
                            
                            // Update chat session with processed file
                            updateChatSession(currentChatId, { file: processedFileContent });
                            
                            // Process chunks for RAG (non-blocking)
                            processPDFForRAG(text, file.name, file.size, pdfId).catch(err => {
                                console.warn('Failed to process PDF for RAG:', err);
                            });
                            
                            const pageCount = (text.match(/--- Page \d+/g) || []).length;
                            setSuccessMessage(`PDF processed successfully! Extracted ${text.length.toLocaleString()} characters from ${pageCount} page(s).`);
                            setTimeout(() => setSuccessMessage(''), 5000);
                        }
                    }
                } catch (pdfError) {
                    console.error('❌ PDF processing error:', pdfError);
                    const errorMsg = pdfError?.message || pdfError?.toString() || 'Unknown error occurred';
                    
                    // LAST RESORT: Try one more time with forced OCR
                    console.warn('⚠️ Attempting last-resort OCR extraction...');
                    try {
                        setSuccessMessage('Attempting final OCR extraction (this may take several minutes)...');
                        
                        // Force OCR extraction
                        const arrayBuffer = await file.arrayBuffer();
                        const pdfjsLib = await import('pdfjs-dist');
                        const pdfjsVersion = pdfjsLib.version || '4.4.168';
                        
                        // Fetch worker with error handling
                        let workerCode;
                        try {
                            const response = await fetch(`https://unpkg.com/pdfjs-dist@${pdfjsVersion}/build/pdf.worker.min.mjs`, {
                                signal: AbortSignal.timeout(10000)
                            });
                            if (response.ok) {
                                workerCode = await response.text();
                            } else {
                                throw new Error(`Worker fetch failed: ${response.status}`);
                            }
                        } catch (error) {
                            console.warn('Worker fetch failed, using fallback:', error);
                            try {
                                const fallbackResponse = await fetch(`https://cdn.jsdelivr.net/npm/pdfjs-dist@${pdfjsVersion}/build/pdf.worker.min.mjs`, {
                                    signal: AbortSignal.timeout(10000)
                                });
                                if (fallbackResponse.ok) {
                                    workerCode = await fallbackResponse.text();
                                }
                            } catch (fallbackError) {
                                console.error('All worker fetch attempts failed');
                                pdfjsLib.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjsVersion}/build/pdf.worker.min.mjs`;
                            }
                        }
                        
                        if (workerCode) {
                            const workerBlob = new Blob([workerCode], { type: 'application/javascript' });
                            const workerUrl = URL.createObjectURL(workerBlob);
                            pdfjsLib.GlobalWorkerOptions.workerSrc = workerUrl;
                        }
                        
                        const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer, verbosity: 0 });
                        const pdf = await loadingTask.promise;
                        const maxPages = Math.min(pdf.numPages, 30);
                        
                        let forcedOcrText = '[DOCUMENT_METADATA]\nTitle: Extracted via OCR\nAuthors: Not found\nPublisher: Not found\n[/DOCUMENT_METADATA]\n\n';
                        
                        for (let i = 1; i <= maxPages; i++) {
                            try {
                                const page = await pdf.getPage(i);
                                const viewport = page.getViewport({ scale: 3.0 });
                                const canvas = document.createElement('canvas');
                                const context = canvas.getContext('2d');
                                canvas.height = viewport.height;
                                canvas.width = viewport.width;
                                
                                await page.render({ canvasContext: context, viewport: viewport }).promise;
                                const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
                                
                                if (blob) {
                                    const { data: { text: ocrText } } = await Tesseract.recognize(blob, 'eng+ara', {
                                        logger: () => {}
                                    });
                                    
                                    if (ocrText && ocrText.trim().length > 0) {
                                        forcedOcrText += `--- Page ${i} (OCR) ---\n${ocrText.trim()}\n\n`;
                                    }
                                }
                                
                                canvas.width = 0;
                                canvas.height = 0;
                                page.cleanup();
                            } catch (pageErr) {
                                console.warn(`Page ${i} OCR failed:`, pageErr);
                            }
                        }
                        
                        URL.revokeObjectURL(workerUrl);
                        
                        if (forcedOcrText.length > 200) {
                            text = forcedOcrText;
                            setExtractedText(text);
                            
                            // Create fileContent
                            let pdfId;
                            try {
                                pdfId = await generatePDFId(file.name, file.size);
                            } catch (idError) {
                                pdfId = `pdf-${Date.now()}-${Math.random().toString(36).substring(7)}`;
                            }
                            
                            const processedFileContent = {
                                name: file.name,
                                size: file.size,
                                text: text, // CRITICAL: Always store text
                                type: file.type,
                                pdfId: pdfId
                            };
                            
                            console.log('✅ Last-resort OCR successful:');
                            console.log(`  - Text length: ${text.length} characters`);
                            console.log(`  - First 500 chars: ${text.substring(0, 500)}...`);
                            
                            updateChatSession(currentChatId, { file: processedFileContent });
                            processPDFForRAG(text, file.name, file.size, pdfId).catch(() => {});
                            
                            setSuccessMessage(`PDF processed via OCR! Extracted ${text.length.toLocaleString()} characters.`);
                            setTimeout(() => setSuccessMessage(''), 5000);
                        } else {
                            throw new Error('OCR extraction also failed. PDF may be corrupted or password-protected.');
                        }
                    } catch (lastResortError) {
                        console.error('❌ Last resort OCR also failed:', lastResortError);
                        setError(`PDF processing failed completely: ${errorMsg}. The PDF might be corrupted, password-protected, or contain only images.`);
                    setLoading(false);
                    return;
                    }
                }
            } else if (file.type.startsWith('text/') || 
                       fileName.endsWith('.txt') || 
                       fileName.endsWith('.md') || 
                       fileName.endsWith('.csv') ||
                       fileName.endsWith('.markdown')) {
                // Support TXT, MD, CSV, Markdown files
                text = await file.text();
            } else if (file.type.startsWith('image/')) {
                // OCR for images using Tesseract.js
                setLoading(true);
                setError('');
                try {
                    const { data: { text: ocrText } } = await Tesseract.recognize(file, 'eng', {
                        logger: (m) => {
                            if (m.status === 'recognizing text') {
                                // Optional: show progress
                            }
                        }
                    });
                    text = ocrText;
                    if (!text.trim()) {
                        setError('Could not extract text from image. Please ensure the image contains clear, readable text.');
                        setLoading(false);
                        return;
                    }
                } catch (ocrError) {
                    setError(`OCR failed: ${ocrError.message}. Please try a clearer image or convert to text format.`);
                    setLoading(false);
                    return;
                }
            } else {
                // Unsupported file type
                setError(`Unsupported file type: ${file.type}. Please use CSV, MD, TXT, or image files.`);
                setLoading(false);
                return;
            }

            if (text.trim().length === 0) {
                setError(t('error_empty_file'));
                setLoading(false);
                return;
            }
            
            // Generate PDF ID BEFORE creating fileContent (critical for consistency)
            // Only if not already set by backend processing
            let pdfId;
            try {
                pdfId = fileContent?.pdfId || await generatePDFId(file.name, file.size);
            } catch (idError) {
                console.warn('Failed to generate PDF ID, using fallback:', idError);
                pdfId = `file-${Date.now()}-${Math.random().toString(36).substring(7)}`;
            }
            
            // Create fileContent object - ensure it's always defined in accessible scope
            let fileContentToUse;
            
            // CRITICAL: Verify text exists before proceeding
            if (!text || text.trim().length === 0) {
                console.error('❌ CRITICAL ERROR: No text extracted from file!');
                setError('Failed to extract text from file. Please try a different file or ensure the file is not corrupted.');
                setLoading(false);
                return;
            }
            
            // Check if fileContent was already set by backend processing
            if (fileContent && fileContent.name === file.name && fileContent.pdfId && fileContent.text && fileContent.text.trim().length > 0) {
                // Use existing fileContent from backend processing (verify it has text)
                fileContentToUse = fileContent;
                console.log('✅ Using existing fileContent with text length:', fileContentToUse.text.length);
            } else {
                // Create new fileContent for non-PDF files or fallback cases
                // FOLLOWING USER'S PATTERN: text MUST exist here (extractPDFText → performOCR if needed)
                fileContentToUse = {
                    name: file.name,
                    size: file.size,
                    text: text, // CRITICAL: Always include extracted text - this is what Samir needs!
                    type: file.type,
                    pdfId: pdfId // Store PDF ID with fileContent to prevent regeneration
                };
                console.log('✅ Created new fileContent with text length:', fileContentToUse.text.length);
                console.log('✅ Text preview (first 200 chars):', fileContentToUse.text.substring(0, 200));
                
                // CRITICAL: Update chat session with fileContent to ensure Samir can access it
                updateChatSession(currentChatId, { file: fileContentToUse });
            }
            
            // FINAL VERIFICATION: Ensure fileContent has text - this should NEVER fail
            // Following user's pattern: extractPDFText() → if empty → performOCR()
            // By this point, text MUST exist
            if (!fileContentToUse.text || fileContentToUse.text.trim().length === 0) {
                console.error('❌ CRITICAL: fileContentToUse has no text! This should never happen.');
                console.error('This means extractTextFromPDF failed AND OCR failed - this is a system error.');
                setError('Critical error: Text was not properly stored. Please try uploading the file again.');
                setLoading(false);
                return;
            }
            
            console.log('✅ FINAL VERIFICATION PASSED: fileContent.text exists, length:', fileContentToUse.text.length);
            
            setSuccessMessage(t('file_processed_success', { fileName: file.name }));
            
            // CRITICAL: Clear old chunks when a new PDF is uploaded
            setPdfChunks([]);
            
            // CRITICAL: Enable chat IMMEDIATELY - don't wait for anything!
            setIsChatLoaded(true);
            setLoading(false); // Make sure loading is off
            
            // Process PDF for RAG: Split into chunks (in background, non-blocking)
            // Pass PDF ID to ensure consistency
            // Only process if not already processed by backend (backend sets processedData)
            if (fileContentToUse && fileContentToUse.text && !fileContentToUse.processedData) {
                processPDFForRAG(fileContentToUse.text, file.name, file.size, pdfId).catch(err => {
                    console.warn('RAG processing failed (non-critical):', err);
                });
            }
            
            // Update current chat session with file
            const fileLoadMessage = { 
                role: 'model', 
                parts: [{ text: t('file_loaded_message', { fileName: file.name, fileSize: Math.round(file.size / 1024) }) }]
            };
            
            // Update chat session with file and welcome message
            updateChatSession(currentChatId, {
                file: fileContentToUse,
                extractedContent: text,
                messages: [fileLoadMessage]
            });
            
            // Update local state (this will trigger useEffect to sync)
            setChatHistory([fileLoadMessage]);
            setIsChatLoaded(true);
            
            // Save to user-specific localStorage
            const localHistoryKey = userId ? `samir_history_${userId}` : 'samir_history_guest';
            localStorage.setItem(localHistoryKey, JSON.stringify([fileLoadMessage]));
            
            // Also save to Supabase (non-blocking, only if real user)
            if (userId && !userId.startsWith('guest-')) {
                insertMessage(userId, 'model', fileLoadMessage.parts[0].text).catch(() => {
                    // Silent fail - localStorage backup already saved
                });
            }


        } catch (e) {
            console.error('File processing error:', e);
            setError(t('error_file_processing', { error: e.message }));
        } finally {
            setLoading(false); // Always reset loading state
            setIsChatLoaded(true); // Ensure chat is enabled even on error
        }
    }, [currentChatId, updateChatSession, fileContent, userId, generatePDFId, processPDFForRAG, setLoading, setError, setSuccessMessage, setExtractedText, setPdfChunks, setIsChatLoaded, setChatHistory, insertMessage, t]); 
    
    const handleSendMessage = async (e) => {
        e.preventDefault();
        const HF_MODEL = lang === 'ar' ? HF_JAIS_MODEL : HF_LLAMA3_MODEL; // Re-define model based on current lang
        if (!input.trim() || isLoading || !isChatLoaded) return; // Removed isOnline check for local-first app

        // Use WebLLM if ready, otherwise fallback to API
        const shouldUseWebLLM = useWebLLM && webllmReady;
        
        // If WebLLM is not ready, check if we have API fallback
        if (!shouldUseWebLLM && !HF_API_KEY) {
            setIsLoading(false);
            if (webllmLoading) {
                setError('⏳ Local AI model is still loading... Please wait (this happens once on first load).');
            } else {
                setError('⚠️ No AI available. WebLLM failed to load and no API key configured. Please wait for WebLLM to load or set VITE_HF_API_KEY in .env for API fallback.');
            }
            return;
        }

        const currentInput = input;
        setInput('');
        setIsLoading(true);
        setError('');
        
        console.log('Sending message:', currentInput, 'Model:', HF_MODEL, 'Has API Key:', !!HF_API_KEY);

        const userMessage = { role: 'user', parts: [{ text: currentInput }] };
        const updatedHistory = [...chatHistory, userMessage];
        
        // Update both state and chat session
        setChatHistory(updatedHistory);
        addCoins(5); // +5 Samir coins reward for studying (sending a message)
        updateChatSession(currentChatId, {
            messages: updatedHistory
        });
        // Save to user-specific localStorage as backup  
        const localHistoryKey = `samir_history_${userId}`;
        localStorage.setItem(localHistoryKey, JSON.stringify(updatedHistory));
        
        // Save to Supabase (with localStorage fallback)
        await insertMessage(userId, 'user', currentInput);

        // --- 1. Prepare Memory Context for AI ---
        let memoryContext = '';
        // Only consider it a returning session if there are actual user messages (not just the welcome message)
        const userMessages = chatHistory.filter(msg => msg.role === 'user');
        if (userMessages.length > 0) { 
            memoryContext += `The student is returning to a previous session and is ready to continue. `;
        }
        
        if (trackerSummary) {
            const weak = trackerSummary.topWeaknesses.map(w => `${w.topic} (Missed ${w.count} times)`).join('; ');
            
            memoryContext += `
                Based on ${trackerSummary.lastQuizCount} previous quizzes, the student recently struggled with: ${weak || 'None recorded yet.'}
                Use this context to tailor your current response or clue.
            `.trim();
        }

        // --- 2. STRICT PDF-FIRST APPROACH - Prevent hallucinations ---
        // If PDF exists, use STRICT PDF-only mode (no generic prompts)
        let messages = [];
        let useStrictPDFMode = false;
        
        // CRITICAL: Verify fileContent has text before proceeding
        if (fileContent) {
            if (!fileContent.text || fileContent.text.trim().length === 0) {
                console.error('❌ CRITICAL: fileContent exists but has no text!');
                console.error('FileContent object:', JSON.stringify(fileContent, null, 2));
                setError('Critical error: The uploaded file has no text content. Please try uploading the file again.');
                setIsLoading(false);
                return;
            }
            
            console.log(`✅ FileContent verified:`);
            console.log(`  - File: ${fileContent.name}`);
            console.log(`  - Text length: ${fileContent.text.length} characters`);
            console.log(`  - First 500 chars: ${fileContent.text.substring(0, 500)}...`);
        }
        
        if (fileContent && fileContent.text && fileContent.text.trim().length > 0) {
            // STRICT MODE: PDF content is the ONLY source
            try {
                console.log(`🔍 STRICT MODE: Retrieving PDF chunks for: ${fileContent.name} (${fileContent.size} bytes)`);
                console.log(`📄 FileContent text length: ${fileContent.text.length} characters`);
                console.log(`📄 FileContent text preview (first 500 chars): ${fileContent.text.substring(0, 500)}...`);
                
                // Use stored PDF ID from fileContent (if available), otherwise generate
                // CRITICAL: Use stored PDF ID to ensure we get chunks from the CURRENT PDF only
                const pdfId = fileContent.pdfId || await generatePDFId(fileContent.name, fileContent.size);
                console.log(`📄 Using PDF ID: ${pdfId} for current file: ${fileContent.name}`);
                
                if (!fileContent.pdfId) {
                    console.warn('⚠️ No PDF ID stored in fileContent. PDF ID was generated. Ensure PDF ID is stored on upload.');
                }
                
                // Validate chunks exist for THIS specific PDF
                const chunksExist = await validatePDFChunksExist(userId, pdfId);
                console.log(`🔍 Chunks exist for PDF ID ${pdfId}: ${chunksExist}`);
                
                if (!chunksExist) {
                    console.warn(`⚠️ No chunks found in database for PDF ID ${pdfId}, processing now...`);
                    // Process PDF if chunks don't exist (pass file size for unique ID)
                    await processPDFForRAG(fileContent.text, fileContent.name, fileContent.size);
                    // Wait a moment for chunks to be stored
                    await new Promise(resolve => setTimeout(resolve, 1000));
                    
                    // Re-validate after processing
                    const chunksExistAfter = await validatePDFChunksExist(userId, pdfId);
                    console.log(`🔍 Chunks exist after processing: ${chunksExistAfter}`);
                }
                
                // Get strict PDF prompt (PDF content is PRIMARY and ONLY source)
                // Determine model type for token limits
                const modelType = shouldUseWebLLM ? 'webllm' : 'huggingface';
                
                const strictPrompt = await getStrictPDFPrompt(
                    userId,
                    pdfId,
                    fileContent.name,
                    currentInput,
                    true, // Use chunks
                    modelType, // Pass model type for token limit calculation
                    mode // Pass current mode (tutor/detective/assist)
                );
                
                if (strictPrompt && strictPrompt.system) {
                    // Use STRICT PDF mode - format for WebLLM
                    messages = formatForWebLLM(strictPrompt);
                    useStrictPDFMode = true;
                    
                    // For WebLLM: Limit message history to prevent context window exceeded
                    // Only use the current prompt (system + user), don't include full chat history
                    if (shouldUseWebLLM) {
                        // WebLLM messages are already formatted correctly (just system + user)
                        // No need to add full chat history - prevents context overflow
                        console.log(`✅ STRICT MODE: Using PDF-only prompt for WebLLM (${strictPrompt.system.length} chars, ${messages.length} messages)`);
                    } else {
                        console.log(`✅ STRICT MODE: Using PDF-only prompt (${strictPrompt.system.length} chars)`);
                    }
                } else {
                    throw new Error('Failed to build strict PDF prompt');
                }
            } catch (strictError) {
                console.error('❌ STRICT PDF mode failed, falling back:', strictError);
                useStrictPDFMode = false;
            }
        }
        
        // Fallback: If no PDF or strict mode failed, use regular mode
        if (!useStrictPDFMode) {
            // Detect mode from query
            const detectedMode = detectMode(currentInput, mode);
            console.log(`🎯 Fallback mode detected: ${detectedMode}`);
            
            // Build System Prompt based on Mode
            const userLang = detectLanguage(currentInput);
            let systemPrompt = `You are Samir, an AI tutor for school students. You are BILINGUAL (Arabic + English).
CRITICAL: Respond in the SAME language as the user. If the user writes in Arabic, reply in Arabic. If in English, reply in English.`;
            
            // Add mode-specific instructions
            if (detectedMode === 'tutor') {
                systemPrompt += `\n\n🎓 TUTOR MODE (Default)
If the user asks to: explain / summarize / describe / what is / who are
YOU MUST:
✅ Explain the lesson directly
✅ Use simple student-friendly language
✅ Structure the answer clearly
❌ Do NOT show page numbers
❌ Do NOT show indexes or tables
❌ Do NOT guide the student to search
Goal: "The student understands the lesson without opening the book."`;
            } else if (detectedMode === 'detective') {
                systemPrompt += `\n\n🕵️‍♂️ DETECTIVE MODE
You MUST:
✅ Teach HOW to find information inside the book
✅ Use: Cover, Table of contents, Index, Introduction, Lesson pages, Repeated keywords
✅ Encourage student thinking
Example: Say where to search, explain WHY that place is useful
❌ Do NOT give the answer directly unless asked`;
            } else if (detectedMode === 'assist') {
                systemPrompt += `\n\n🌍 ASSIST / EXPAND MODE
If the student is confused or asks for deeper explanation:
You MAY:
✅ Use general internet knowledge
✅ Add historical or educational context
✅ Explain with examples or stories
But:
❌ Do NOT replace the textbook
❌ Do NOT contradict the book
❌ Always relate back to the lesson`;
            }
            
            // CRITICAL: If we have fileContent with text, include it in the fallback prompt
            if (fileContent && fileContent.text && fileContent.text.trim().length > 0) {
                console.log('⚠️ Strict mode failed, but including PDF text in fallback mode');
                try {
                    // Use RAG to get relevant chunks for the query
                    const relevantChunks = await getRelevantChunksForQuery(
                        currentInput,
                        fileContent.text,
                        fileContent.name,
                        5 // top 5 chunks
                    );
                    
                    if (relevantChunks && relevantChunks.length > 0) {
                        const chunksText = relevantChunks.map((chunk, idx) => 
                            `=== SECTION ${idx + 1} ===\n${chunk.text}\n`
                        ).join('\n');
                        
                        systemPrompt += `\n\n[UPLOADED DOCUMENT CONTENT]\nThe user has uploaded: "${fileContent.name}"\n\nRelevant sections from the document:\n${chunksText}\n\nUse ONLY information from these sections to answer questions.`;
            } else {
                        // Fallback: Include first 3000 characters of the document
                        const docPreview = fileContent.text.substring(0, 3000);
                        systemPrompt += `\n\n[UPLOADED DOCUMENT CONTENT]\nThe user has uploaded: "${fileContent.name}"\n\nDocument content (first 3000 chars):\n${docPreview}...\n\nUse this document content to answer questions.`;
                    }
                } catch (ragError) {
                    console.warn('RAG search failed in fallback, using document preview:', ragError);
                    // Include document preview as fallback
                    const docPreview = fileContent.text.substring(0, 3000);
                    systemPrompt += `\n\n[UPLOADED DOCUMENT CONTENT]\nThe user has uploaded: "${fileContent.name}"\n\nDocument content (first 3000 chars):\n${docPreview}...\n\nUse this document content to answer questions.`;
                }
            }
            
            // CRITICAL: Prevent forbidden error messages
            systemPrompt += `\n\n[CRITICAL RULES]
- You have full access to the uploaded document. The document has been processed and OCR has been performed.
- NEVER say "I don't have access to the file" or "I can't access the file" - this is false.
- NEVER say "I can't perform OCR" or "I don't have the capability to perform OCR" - OCR has already been done.
- NEVER say "Please describe the PDF" - you have the full document content.
- If document content seems incomplete, work with what you have and answer based on the available text.
- Always assume the document has been fully processed and you have access to all extracted text (including OCR results).
[/CRITICAL RULES]`;
            
            if (memoryContext) {
                systemPrompt += `\n\n[MEMORY CONTEXT]\n${memoryContext}\n[END MEMORY CONTEXT]`;
            }
            
            // Build messages array in OpenAI-compatible format
            let historyMessages = updatedHistory.map(msg => ({
                role: msg.role === 'model' ? 'assistant' : 'user',
                content: msg.parts[0]?.text || ''
            }));
            
            // For WebLLM: Limit message history to prevent context window exceeded
            // Only keep last 2-3 messages (current query + last response)
            if (shouldUseWebLLM && historyMessages.length > 3) {
                console.log(`⚠️ Limiting WebLLM message history: ${historyMessages.length} → 3 messages`);
                historyMessages = historyMessages.slice(-3); // Keep last 3 messages
            }
            
            // Add system prompt as the first message
            messages = [{ role: 'system', content: systemPrompt }, ...historyMessages];
        }

        // --- 3. Prepare Payload and Call API ---
        try {
            let text = '';
            const startTime = Date.now();
            
            // Check query cache first (reduces API calls for repeated queries)
            if (fileContent) {
                try {
                    const pdfId = await generatePDFId(fileContent.name);
                    const cachedResponse = await getCachedQuery(userId, pdfId, currentInput);
                    if (cachedResponse) {
                        console.log('✅ Using cached query response');
                        text = cachedResponse;
                        const modelMessage = { role: 'model', parts: [{ text }] };
                        const finalHistory = [...updatedHistory, modelMessage];
                        
                        // Update both state and chat session
                        setChatHistory(finalHistory);
                        updateChatSession(currentChatId, {
                            messages: finalHistory
                        });
                        localStorage.setItem(`samir_history_${userId}`, JSON.stringify(finalHistory));
                        if (userId && !userId.startsWith('guest-')) {
                            insertMessage(userId, 'model', text).catch((err) => {
                                console.warn('Insert message error (non-critical):', err?.message || String(err));
                                console.log('INSERT_MESSAGE_ERROR:', err?.message || String(err));
                            });
                        }
                        setIsLoading(false);
                        return;
                    }
                } catch (cacheError) {
                    console.warn('Cache check failed (non-critical):', cacheError);
                    // Continue with normal flow
                }
            }
            
            // Check browser cache (for API responses)
            if (!shouldUseWebLLM) {
                const cacheKey = JSON.stringify({ model: HF_MODEL, messages, fileContent: fileContent?.name });
                const cached = await getCachedResponse(cacheKey);
                if (cached) {
                    text = cached.choices?.[0]?.message?.content?.trim() || 
                           cached[0]?.generated_text?.trim() || 
                           t('error_ai_communication');
                    const modelMessage = { role: 'model', parts: [{ text }] };
                    const finalHistory = [...updatedHistory, modelMessage];
                    
                    // Update chat session
                    updateChatSession(currentChatId, {
                        messages: finalHistory
                    });
                    
                    setChatHistory(finalHistory);
                    localStorage.setItem(`samir_history_${userId}`, JSON.stringify(finalHistory));
                    if (userId && !userId.startsWith('guest-')) {
                        insertMessage(userId, 'model', text).catch(() => {});
                    }
                    setIsLoading(false);
                    return;
                }
            }
            
            // USE WELLM FIRST, THEN FALLBACK TO API
            let useWebLLMSuccess = false;
            
            // Try WebLLM first (local AI - more stable)
            if (shouldUseWebLLM) {
                // Use WebLLM - local AI in browser
                console.log('🤖 Using WebLLM (local AI) with', messages.length, 'messages');
                setSuccessMessage('Processing with local AI...');
                
                try {
                    const response = await webllmService.chat(messages);
                    
                    // WebLLM returns the response text directly
                    if (typeof response === 'string') {
                        text = response.trim();
                    } else if (response?.text) {
                        text = response.text.trim();
                    } else {
                        text = String(response).trim();
                    }
                    
                    if (!text || text.length === 0) {
                        throw new Error('WebLLM returned empty response');
                    }
                    
                    const elapsedTime = ((Date.now() - startTime) / 1000).toFixed(1);
                    console.log(`✅ WebLLM response completed in ${elapsedTime} seconds`);
                    console.log("Response length:", text.length);
                    useWebLLMSuccess = true;
                    
                } catch (webllmError) {
                    console.error('❌ WebLLM error:', webllmError);
                    
                    // If WebLLM fails and we have API key, fallback to API
                    if (HF_API_KEY) {
                        console.log('⚠️ WebLLM failed, falling back to HuggingFace API...');
                        setUseWebLLM(false); // Disable WebLLM for future requests
                        // Continue with API fallback below - don't return, let it fall through
                    } else {
                        // No API key, show error
                        setIsLoading(false);
                        setError(`Local AI error: ${webllmError.message}. Please configure VITE_HF_API_KEY for API fallback.`);
                        return;
                    }
                }
            }
            
            // USE HUGGINGFACE API
            if (!useWebLLMSuccess && HF_API_KEY) {
                // CRITICAL: Validate messages is an array before calling API
                if (!Array.isArray(messages)) {
                    console.error('❌ ERROR: messages is not an array!', typeof messages, messages);
                    setIsLoading(false);
                    setError('Internal error: Message format invalid. Please try again.');
                    return;
                }
                
                // Ensure messages array is not empty
                if (messages.length === 0) {
                    console.error('❌ ERROR: messages array is empty!');
                    setIsLoading(false);
                    setError('Internal error: No messages to send. Please try again.');
                    return;
                }
                
                // Validate and normalize each message to ensure correct format
                const validMessages = messages
                    .filter(msg => {
                        if (!msg || typeof msg !== 'object') {
                            console.warn('⚠️ Invalid message: not an object', msg);
                            return false;
                        }
                        if (!msg.role || typeof msg.content === 'undefined') {
                            console.warn('⚠️ Invalid message format: missing role or content', msg);
                            return false;
                        }
                        return true;
                    })
                    .map(msg => ({
                        role: String(msg.role),
                        content: String(msg.content)
                    }));
                
                if (validMessages.length === 0) {
                    console.error('❌ ERROR: No valid messages after validation!', messages);
                    setIsLoading(false);
                    setError('Internal error: Invalid message format. Please try again.');
                    return;
                }
                
                // Final check: ensure validMessages is an array
                if (!Array.isArray(validMessages)) {
                    console.error('❌ CRITICAL ERROR: validMessages is not an array!', typeof validMessages, validMessages);
                    setIsLoading(false);
                    setError('Internal error: Message validation failed. Please try again.');
                    return;
                }
                
                // Use HuggingFace API
                setSuccessMessage(`🔄 Processing with ${HF_MODEL}... This may take 10-30 seconds.`);
                setTimeout(() => setSuccessMessage(''), 3000);
                
                const timeoutDuration = 90000; // 90 seconds
                
                // Add UI feedback
                setSuccessMessage(`📡 Connecting to HuggingFace API...`);
                
                // Log messages format for debugging
                console.log(`📤 Sending to HuggingFace API: ${validMessages.length} messages`, validMessages.map(m => ({ role: m.role, contentLength: m.content?.length || 0 })));
                
                const fetchPromise = hfFetch(HF_MODEL, validMessages, 3, extractRelevantContent, parseUserQuestion);
                const timeoutPromise = new Promise((_, reject) => 
                    setTimeout(() => reject(new Error(`API request timed out after ${timeoutDuration/1000} seconds.`)), timeoutDuration)
                );
                
                const response = await Promise.race([fetchPromise, timeoutPromise]);
                const elapsedTime = ((Date.now() - startTime) / 1000).toFixed(1);
                console.log(`API call completed in ${elapsedTime} seconds`);
                
                const result = await response.json();
                
                // Extract text from API response
                if (result.choices?.[0]?.message?.content) {
                    text = result.choices[0].message.content.trim();
                } else if (result[0]?.generated_text) {
                    text = result[0].generated_text.trim();
                } else if (typeof result === 'string') {
                    text = result.trim();
                } else if (result.message || result.text) {
                    text = (result.message || result.text).trim();
                }
                
                if (!text || text.length === 0) {
                    console.error("No valid response text found. Full API result:", result);
                    throw new Error(`No response from AI. API returned: ${JSON.stringify(result).substring(0, 300)}`);
                }
                
                // Cache the API response
                const cacheKey = JSON.stringify({ model: HF_MODEL, messages, fileContent: fileContent?.name });
                await setCachedResponse(cacheKey, result);
            }

            // Ensure we have a response before creating message
            if (!text || text.length === 0) {
                throw new Error('No response received from AI. Please check your API key or try again.');
            }
            
            const modelMessage = { role: 'model', parts: [{ text }] };
            const finalHistory = [...updatedHistory, modelMessage];
            
            // Update both state and chat session
            setChatHistory(finalHistory);
            updateChatSession(currentChatId, {
                messages: finalHistory
            });
            // Save to user-specific localStorage as backup
            const localHistoryKey = `samir_history_${userId}`;
            localStorage.setItem(localHistoryKey, JSON.stringify(finalHistory));
            
            // Save to Supabase (non-blocking)
            if (userId && !userId.startsWith('guest-')) {
                insertMessage(userId, 'model', text).catch(() => {});
            }

        } catch (e) {
            const errorMessage = e?.message || e?.toString() || t('error_ai_communication');
            
            // Show detailed error message to user (visible in UI)
            let userMessage = errorMessage;
            
            // Add helpful hints based on error type
            if (errorMessage.includes('API Key')) {
                userMessage = `❌ ${errorMessage}\n\n💡 Solution: Create a .env file in the project root with:\nVITE_HF_API_KEY=your_api_key_here\n\nGet your API key from: https://huggingface.co/settings/tokens`;
            } else if (errorMessage.includes('404') || errorMessage.includes('not found')) {
                userMessage = `❌ Model not found: ${HF_MODEL}\n\n💡 Solution:\n1. Check if the model name is correct\n2. Make sure you've accepted the license at https://huggingface.co/${HF_MODEL}\n3. Use a different model or check your API key`;
            } else if (errorMessage.includes('timeout')) {
                userMessage = `❌ Request timed out. The API is slow or unavailable.\n\n💡 Solution: Try again in a few moments or check your internet connection.`;
            } else {
                userMessage = `❌ Error: ${errorMessage}\n\n💡 Check:\n1. Your API key is correct (VITE_HF_API_KEY in .env)\n2. Your internet connection\n3. The HuggingFace API is accessible`;
            }
            
            setError(userMessage);
            setIsLoading(false);
            
            console.error("Chat Error:", {
                message: errorMessage,
                error: e,
                hasApiKey: !!HF_API_KEY,
                model: HF_MODEL,
                apiKeyLength: HF_API_KEY ? HF_API_KEY.length : 0
            });
            
            // If API fails, remove the loading state and show error
            // Also remove the user's message from history since it failed
            setChatHistory(chatHistory); // Keep only previous history
            
            // If API fails, we don't save the response, and the user's last message remains in the collection.
        } finally {
            setIsLoading(false);
        }
    };

    // --- Local-only: Chats (threads) helpers ---
    const addNewChatForCurrentFile = () => {
        if (!fileContent) { setError('Upload a file first to start a chat for it.'); return; }
        const t = {
            id: generateId(),
            title: `Chat - ${fileContent.name}`,
            fileName: fileContent.name,
            createdAt: Date.now(),
            messages: []
        };
        setThreads(prev => [t, ...prev]);
        setActiveThreadId(t.id);
        setSuccessMessage('New chat created for current file.');
        setTimeout(() => setSuccessMessage(''), 3000);
    };
    const appendMessageToThread = (threadId, role, text) => {
        setThreads(prev => prev.map(t => t.id === threadId ? ({ ...t, messages: [...t.messages, { role, text, timestamp: Date.now() }] }) : t));
    };

    // --- Local-only: schedule helpers ---
    const addScheduleItem = (dateStr, item) => {
        setScheduleDays(prev => ({ ...prev, [dateStr]: [ ...(prev[dateStr]||[]), { id: generateId(), ...item, done: false } ] }));
    };
    const toggleScheduleDone = (dateStr, id) => {
        setScheduleDays(prev => ({ ...prev, [dateStr]: (prev[dateStr]||[]).map(i => i.id===id? { ...i, done: !i.done }: i) }));
    };
    const removeScheduleItem = (dateStr, id) => {
        setScheduleDays(prev => ({ ...prev, [dateStr]: (prev[dateStr]||[]).filter(i => i.id!==id) }));
    };
    const requestNotify = async () => {
        try { 
            if ('Notification' in window && Notification.permission === 'default') {
                await Notification.requestPermission();
            }
        } catch (err) {
            console.log('NOTIFICATION_PERMISSION_ERROR (non-critical):', err?.message || String(err));
        }
    };
    const scheduleAlarm = (dateStr, id, whenTs, title) => {
        const delay = Math.max(0, whenTs - Date.now());
        setTimeout(() => {
            try { 
                if ('Notification' in window && Notification.permission === 'granted') {
                    new Notification(title);
                }
            } catch (err) {
                console.log('NOTIFICATION_ERROR (non-critical):', err?.message || String(err));
            }
        }, delay);
    };

    // --- Local-only: groups helpers ---
    const createGroup = (name, gradeSubject) => {
        const g = { id: generateId(), name, grade: gradeSubject, members: [], messages: [] };
        setGroups(prev => [g, ...prev]);
        setActiveGroupId(g.id);
    };
    const joinGroup = (groupId, memberName) => {
        setGroups(prev => prev.map(g => g.id===groupId ? ({ ...g, members: g.members.length<5 && !g.members.includes(memberName) ? [...g.members, memberName] : g.members }) : g));
    };
    const sendGroupMessage = (groupId, author, text) => {
        setGroups(prev => prev.map(g => g.id===groupId ? ({ ...g, messages: [...g.messages, { author, text, ts: Date.now() }] }) : g));
    };

    // --- Local-only: {t('tab_community')} helpers ---
    const addPost = (title, body, author, isAnnouncement=false) => {
        const p = { id: generateId(), title, body, author, isAnnouncement, ts: Date.now() };
        setPosts(prev => [p, ...prev]);
    };
    
    // --- Quiz Generation and Handling (Supabase persistence) ---

    const generateQuiz = async () => {
        const HF_MODEL = lang === 'ar' ? HF_JAIS_MODEL : HF_LLAMA3_MODEL; // Re-define model based on current lang
        if (!fileContent || isLoading) return; // Removed isOnline check
        
        // Check if API key is available
        if (!HF_API_KEY) {
            const errorMsg = '❌ HuggingFace API Key is not configured. Quiz generation requires an API key.\n\n💡 Solution: Create a .env file in the project root with:\nVITE_HF_API_KEY=your_api_key_here\n\nGet your API key from: https://huggingface.co/settings/tokens';
            console.error('❌ QUIZ GENERATION FAILED: No API Key');
            console.error('❌ HF_API_KEY value:', HF_API_KEY);
            console.error(errorMsg);
            setError(errorMsg);
            setIsLoading(false);
            return;
        }
        
        // Check if app is offline
        if (!isOnline) {
            const errorMsg = '❌ App is running in offline mode. Quiz generation requires an internet connection.\n\n💡 Solution: Please check your internet connection and try again.';
            console.error('❌ QUIZ GENERATION FAILED: App is offline');
            console.error('❌ isOnline status:', isOnline);
            console.error(errorMsg);
            setError(errorMsg);
            setIsLoading(false);
            return;
        }
        
        setIsLoading(true);
        setError('');

        try {
            console.log('🎯 Starting quiz generation...');
            console.log('📄 File:', fileContent.name, 'Size:', fileContent.text?.length || 0, 'chars');
            console.log('🔑 API Key configured:', !!HF_API_KEY, 'Length:', HF_API_KEY?.length || 0);
            console.log('🌐 Online status:', isOnline);
            
            // Include actual document content in quiz generation
            const maxDocLength = 8000;
            const documentText = fileContent.text.length > maxDocLength 
                ? fileContent.text.substring(0, maxDocLength) + '\n\n[Document truncated...]' 
                : fileContent.text;
            
            console.log('📝 Document text length:', documentText.length);
            
            // Format messages correctly for OpenAI-compatible HuggingFace API
            const systemPrompt = `You are a quiz generator. Based *only* on the provided document content below, generate a short, fun, 3-question multiple-choice quiz about the core concepts. The output must be a valid JSON array of objects. The quiz questions and options should be in ${lang === 'ar' ? 'Arabic' : lang === 'es' ? 'Spanish' : 'English'}.

[DOCUMENT CONTENT]
${documentText}

[END DOCUMENT CONTENT]`;
            
            const userPrompt = `Generate the quiz now. The JSON structure must be: [{"question": "...", "options": ["...", "...", "..."], "correctAnswer": "..."}]`;
            
            // Format messages as array for OpenAI-compatible API
            const messages = [
                { role: "system", content: systemPrompt },
                { role: "user", content: userPrompt }
            ];

            console.log('📤 Sending quiz request to HuggingFace API...');
            console.log('🤖 Model:', HF_MODEL, 'Language:', lang);
            console.log('📨 Messages count:', messages.length);
            console.log('📨 Messages structure:', JSON.stringify(messages.map(m => ({ role: m.role, contentLength: m.content?.length || 0 })), null, 2));
            
            let response;
            try {
                response = await hfFetch(lang === 'ar' ? HF_JAIS_MODEL : HF_LLAMA3_MODEL, messages, 3, extractRelevantContent, parseUserQuestion);
                console.log('✅ Received response from API. Status:', response.status, response.statusText);
            } catch (fetchError) {
                console.error('❌❌❌ HF_FETCH ERROR ❌❌❌');
                console.error('❌ Error type:', fetchError.constructor.name);
                console.error('❌ Error message:', fetchError.message);
                console.error('❌ Error stack:', fetchError.stack);
                console.error('❌ Full error:', fetchError);
                throw fetchError; // Re-throw to be caught by outer catch
            }
            
            // Parse JSON response with error handling - ALWAYS read as text first
            let result;
            let responseText;
            try {
                // ALWAYS read as text first to preserve response content
                responseText = await response.text();
                console.log('📦 Raw response text (first 2000 chars):', responseText.substring(0, 2000));
                console.log('📦 Full response text length:', responseText.length);
                console.log('📦 Response status:', response.status);
                console.log('📦 Response statusText:', response.statusText);
                
                // Try to parse as JSON
                if (!responseText || responseText.trim().length === 0) {
                    throw new Error('Response text is empty');
                }
                
                result = JSON.parse(responseText);
            } catch (jsonError) {
                console.error('🔥🔥🔥 JSON PARSE ERROR (Response) 🔥🔥🔥');
                console.error('❌ JSON Error Name:', jsonError?.name);
                console.error('❌ JSON Error Message:', jsonError?.message);
                console.error('❌ JSON Error Stack:', jsonError?.stack);
                console.error('❌ Response status:', response.status);
                console.error('❌ Response statusText:', response.statusText);
                console.error('❌ Response text (FULL):', responseText || 'NO RESPONSE TEXT');
                alert('JSON PARSE ERROR!\n\nError: ' + jsonError.message + '\n\nResponse: ' + (responseText?.substring(0, 500) || 'NO RESPONSE'));
                throw new Error(`Failed to parse API response as JSON: ${jsonError.message}. Response: ${(responseText || 'NO RESPONSE').substring(0, 500)}`);
            }
            
            // 🔥 STEP 2: LOG THE RAW AI OUTPUT BEFORE PARSING
            console.log('🔥🔥🔥 QUIZ RAW OUTPUT (BEFORE PARSING) 🔥🔥🔥');
            console.log('📦 Full result object:', JSON.stringify(result, null, 2));
            console.log('📦 Response JSON structure:', {
                hasChoices: !!result.choices,
                choicesLength: result.choices?.length || 0,
                hasGeneratedText: !!result[0]?.generated_text,
                keys: Object.keys(result),
                firstLevelKeys: result.choices?.[0] ? Object.keys(result.choices[0]) : 'N/A'
            });
            
            // Extract text from HuggingFace OpenAI-compatible response
            const text = result.choices?.[0]?.message?.content?.trim() || 
                        result[0]?.generated_text?.trim() || 
                        result.generated_text?.trim() ||
                        null;
            
            console.log('🔥🔥🔥 QUIZ RAW TEXT OUTPUT 🔥🔥🔥');
            console.log('📝 Extracted text length:', text?.length || 0);
            console.log('📝 Extracted text (FULL):', text);
            console.log('📝 Extracted text preview (first 1000 chars):', text?.substring(0, 1000) || 'NULL/TEXT NOT FOUND');
            
            if (!text || text === t('error_ai_communication')) {
                console.error('❌ ERROR: No valid text extracted from API response');
                console.error('❌ Full response object:', JSON.stringify(result, null, 2));
                throw new Error(`Failed to extract quiz content from API response. Response structure: ${JSON.stringify(result).substring(0, 500)}`);
            }
            
            let questions;
            try {
                // Step 1: Remove markdown code fences
                let cleanedJsonText = text.replace(/```json\n?|```/g, '').trim();
                console.log('🧹 Step 1 - Removed markdown fences. Length:', cleanedJsonText.length);
                
                // Step 2: Extract FIRST complete JSON array (handle multiple arrays or text after)
                // Use bracket matching to find where the FIRST array ends
                if (cleanedJsonText.includes('[') && cleanedJsonText.includes(']')) {
                    const jsonStart = cleanedJsonText.indexOf('[');
                    
                    // Find the matching closing bracket for the first array
                    let bracketCount = 0;
                    let jsonEnd = jsonStart;
                    let inString = false;
                    let escapeNext = false;
                    
                    for (let i = jsonStart; i < cleanedJsonText.length; i++) {
                        const char = cleanedJsonText[i];
                        
                        if (escapeNext) {
                            escapeNext = false;
                            continue;
                        }
                        
                        if (char === '\\') {
                            escapeNext = true;
                            continue;
                        }
                        
                        if (char === '"' && !escapeNext) {
                            inString = !inString;
                            continue;
                        }
                        
                        if (!inString) {
                            if (char === '[') {
                                bracketCount++;
                            } else if (char === ']') {
                                bracketCount--;
                                if (bracketCount === 0) {
                                    // Found the matching closing bracket
                                    jsonEnd = i + 1;
                                    break;
                                }
                            }
                        }
                    }
                    
                    // Extract only the first complete JSON array
                    if (jsonEnd > jsonStart) {
                        console.log('🧹 Step 2 - Extracting FIRST complete JSON array. Start:', jsonStart, 'End:', jsonEnd);
                        const extractedJson = cleanedJsonText.substring(jsonStart, jsonEnd);
                        console.log('🧹 Extracted JSON length:', extractedJson.length);
                        console.log('🧹 Extracted JSON preview (first 500 chars):', extractedJson.substring(0, 500));
                        cleanedJsonText = extractedJson.trim();
                    } else {
                        console.warn('⚠️ Could not find matching closing bracket, using fallback extraction');
                        // Fallback: use first [ to last ]
                        const fallbackEnd = cleanedJsonText.lastIndexOf(']') + 1;
                        if (fallbackEnd > jsonStart) {
                            cleanedJsonText = cleanedJsonText.substring(jsonStart, fallbackEnd).trim();
                        }
                    }
                }
                
                console.log('🧹 Final cleaned JSON text length:', cleanedJsonText.length);
                console.log('🧹 Final cleaned JSON text (FULL):', cleanedJsonText);
                console.log('🧹 Final cleaned JSON preview (first 1000 chars):', cleanedJsonText.substring(0, 1000));
                
                console.log('🔥🔥🔥 ATTEMPTING JSON PARSE 🔥🔥🔥');
                
                // Try parsing
                questions = JSON.parse(cleanedJsonText);
                console.log('✅ JSON parsed successfully!');
                console.log('✅ Questions count:', questions?.length || 0);
                console.log('✅ Questions (FULL):', JSON.stringify(questions, null, 2));
            } catch (parseError) {
                // Enhanced error logging - FORCE VISIBILITY
                console.error('🔥🔥🔥 JSON PARSE ERROR 🔥🔥🔥');
                console.error('❌ JSON ERROR:', parseError);
                console.error('❌ Parse Error Name:', parseError?.name);
                console.error('❌ Parse Error Message:', parseError?.message);
                console.error('❌ Parse Error Stack:', parseError?.stack);
                console.error('❌ Raw Text (FULL):', text);
                console.error('❌ Raw Text length:', text?.length || 0);
                console.error('❌ Raw Text (first 2000 chars):', text?.substring(0, 2000));
                
                // Try to extract JSON one more time as fallback
                let extractedJson = text;
                if (text.includes('[') && text.includes(']')) {
                    const jsonStart = text.indexOf('[');
                    const jsonEnd = text.lastIndexOf(']') + 1;
                    extractedJson = text.substring(jsonStart, jsonEnd);
                    console.error('❌ Attempting fallback JSON extraction:', extractedJson.substring(0, 500));
                    
                    // Try parsing the extracted JSON one more time
                    try {
                        questions = JSON.parse(extractedJson);
                        console.log('✅ Fallback JSON extraction successful!');
                    } catch (fallbackError) {
                        console.error('❌ Fallback JSON parse also failed:', fallbackError);
                    }
                }
                
                // Only throw if we still don't have questions
                if (!questions) {
                    console.error('🔥🔥🔥 BAD MODEL OUTPUT 🔥🔥🔥');
                    console.error(extractedJson);
                    
                    // FORCE ERROR VISIBILITY - Log to console.table and alert
                    console.table({
                        error: parseError.message,
                        rawTextPreview: text.substring(0, 200),
                        extractedJsonPreview: extractedJson.substring(0, 200)
                    });
                    
                    alert('JSON PARSE ERROR!\n\nError: ' + parseError.message + '\n\nRaw text preview: ' + text.substring(0, 200));
                    
                    throw new Error(`INVALID_JSON: Quiz generation failed: Invalid JSON structure returned by AI. Error: ${parseError.message}. Raw text (first 500 chars): ${text?.substring(0, 500) || 'EMPTY'}`);
                }
            }
            
            if (!Array.isArray(questions)) {
                console.error('❌ ERROR: Questions is not an array. Type:', typeof questions);
                console.error('❌ Questions value:', questions);
                throw new Error(`Quiz generation failed: AI returned non-array result. Got: ${typeof questions}`);
            }
            
            if (questions.length === 0) {
                console.error('❌ ERROR: Questions array is empty');
                throw new Error("Quiz generation failed: AI returned an empty quiz array.");
            }
            
            console.log('✅ Valid quiz generated with', questions.length, 'questions');
            console.log('🔥🔥🔥 QUIZ SUCCESS 🔥🔥🔥');
            console.log('✅ Questions:', JSON.stringify(questions, null, 2));

            setQuizState({
                isActive: true,
                questions: questions,
                currentQuestionIndex: 0,
                results: [],
                timeStart: Date.now(),
                userAnswers: {},
                quizFinished: false,
            });
            setMode('quiz'); 
            
            const quizMessage = { role: 'model', parts: [{ text: t('quiz_ready_message') }] };
            const newHistory = [...chatHistory, quizMessage];
            
            // Update both state and chat session
            setChatHistory(newHistory);
            updateChatSession(currentChatId, {
                messages: newHistory
            });
            // Supabase is removed in a later step, so we comment out the insert message for now
            // try { await insertMessage(userId, 'model', quizMessage.parts[0].text); } catch (e) { console.error('Insert quiz msg failed:', e); }

        } catch (e) {
            // FORCE ERROR TO BE VISIBLE - USE ALL POSSIBLE METHODS
            const errorDetails = {
                name: e?.name,
                message: e?.message,
                stack: e?.stack,
                toString: e?.toString(),
                constructor: e?.constructor?.name,
                type: typeof e,
                fullError: e
            };
            
            const errorMsg = e?.message || String(e) || 'Unknown error';
            
            // Method 1: console.error multiple times with UNIQUE MARKERS (harder to filter)
            console.error('QUIZ_ERROR_START_MARKER');
            console.error('❌❌❌ QUIZ GENERATION FAILED ❌❌❌');
            console.error('QUIZ_ERROR_MESSAGE:', errorMsg);
            console.error('❌ Error Details:', errorDetails);
            console.error('❌ Error type:', e?.constructor?.name || typeof e);
            console.error('❌ Error message:', errorMsg);
            console.error('❌ Error stack:', e?.stack || 'No stack trace');
            console.error('❌ Error name:', e?.name);
            console.error('❌ Error toString:', e?.toString());
            console.error('QUIZ_ERROR_END_MARKER');
            
            // Method 2: console.log with styles (harder to filter)
            console.log('%cQUIZ_ERROR_START', 'color: red; font-size: 20px; font-weight: bold; background: yellow; padding: 10px;');
            console.log('%c❌❌❌ QUIZ GENERATION FAILED ❌❌❌', 'color: red; font-size: 18px; font-weight: bold;');
            console.log('Error:', errorMsg);
            console.log('Full error object:', errorDetails);
            console.log('%cQUIZ_ERROR_END', 'color: red; font-size: 20px; font-weight: bold; background: yellow; padding: 10px;');
            
            // Method 3: console.group for better visibility
            console.group('%c🚨🚨🚨 QUIZ GENERATION ERROR DETAILS 🚨🚨🚨', 'color: red; font-size: 16px; font-weight: bold;');
            console.error('Error object:', e);
            console.error('Error message:', e?.message);
            console.error('Error stack:', e?.stack);
            console.error('Error name:', e?.name);
            console.error('Error toString:', e?.toString());
            console.error('Error details JSON:', JSON.stringify(errorDetails, null, 2));
            console.groupEnd();
            
            // Method 4: console.warn as backup
            console.warn('QUIZ_ERROR_WARNING:', e);
            console.warn('⚠️⚠️⚠️ QUIZ ERROR ⚠️⚠️⚠️', e);
            
            // Method 5: console.table if available (always visible)
            if (console.table) {
                console.table({
                    'QUIZ_ERROR': 'QUIZ GENERATION FAILED',
                    'Error Type': e?.constructor?.name || typeof e,
                    'Error Message': errorMsg,
                    'Error Name': e?.name || 'N/A',
                    'Has Stack': !!e?.stack
                });
            }
            
            // Method 6: Alert (most visible - user can't miss it)
            alert('QUIZ GENERATION FAILED!\n\nError: ' + errorMsg + '\n\n⚠️ IMPORTANT: If console errors are hidden, clear console filters (click filter icon in console)');
            
            // Method 6: Set error in UI
            let errorMessage = errorMsg || t('error_ai_communication');
            
            if (errorMessage.includes("Invalid JSON structure") || errorMessage.includes("unexpected JSON array") || errorMessage.includes("Invalid JSON") || errorMessage.includes("INVALID_JSON")) {
                console.error('❌ Error type: JSON parsing error');
                setError(t('error_quiz_invalid_response') + '\n\nFull error: ' + errorMessage);
            } else if (errorMessage.includes("Failed to extract quiz content") || errorMessage.includes("API response") || errorMessage.includes("parse API response")) {
                console.error('❌ Error type: API response extraction error');
                setError(`Failed to generate quiz: The API response format was unexpected.\n\n${errorMessage}`);
            } else if (errorMessage.includes("API Key") || errorMessage.includes("not configured")) {
                console.error('❌ Error type: API key error');
                setError(`❌ ${errorMessage}\n\n💡 Solution: Create a .env file with:\nVITE_HF_API_KEY=your_api_key_here\n\nGet your key from: https://huggingface.co/settings/tokens`);
            } else {
                console.error('❌ Error type: Other error');
                setError(`Failed to generate quiz: ${errorMessage}\n\nCheck console (F12) for full error details.`);
            }
        } finally {
            setIsLoading(false);
        }
    };
    
    const handleQuizAnswer = (selectedOption) => {
        const currentQ = quizState.questions[quizState.currentQuestionIndex];
        const isCorrect = selectedOption === currentQ.correctAnswer;

        const updatedAnswers = {
            ...quizState.userAnswers,
            [quizState.currentQuestionIndex]: { 
                selected: selectedOption, 
                correct: isCorrect,
                questionText: currentQ.question,
                correctAnswer: currentQ.correctAnswer
            }
        };

        const updatedResults = [...quizState.results, { 
            question: currentQ.question, 
            correct: isCorrect 
        }];

        const nextIndex = quizState.currentQuestionIndex + 1;

        if (nextIndex < quizState.questions.length) {
            setQuizState(prev => ({
                ...prev,
                userAnswers: updatedAnswers,
                results: updatedResults,
                currentQuestionIndex: nextIndex,
            }));
        } else {
            // Quiz finished
            const timeTaken = Date.now() - quizState.timeStart;
            
            // FIX: Ensure the final state used for saving is explicitly constructed 
            // from the calculated updated results to prevent the blank review bug.
            const finalState = {
                ...quizState,
                userAnswers: updatedAnswers, // Crucial for review data
                results: updatedResults,     // Crucial for saving the results
                quizFinished: true,
                timeTaken: timeTaken,
            };
            
            setQuizState(finalState);
            saveQuizResult(finalState, timeTaken);
        }
    };
    
    // --- Supabase Tracker Save ---

    const saveQuizResult = (finalState, timeTaken) => {
        const score = finalState.results.filter(r => r.correct).length;
        try {
            const detailedResults = Object.values(finalState.userAnswers).map(item => ({
                question: item.questionText,
                correct: item.correct, // Use 'correct' for consistency
                selected: item.selected,
                correctAnswer: item.correctAnswer
            }));
            
            const newResult = {
                user_id: userId,
                timestamp: new Date().toISOString(),
                score: score,
                total_questions: finalState.questions.length,
                time_taken_ms: timeTaken,
                detailed_results: detailedResults,
                tags: fileContent?.name || 'General Study',
            };
            
            const existingResults = JSON.parse(localStorage.getItem('samir_quiz_results') || '[]');
            localStorage.setItem('samir_quiz_results', JSON.stringify([newResult, ...existingResults]));

            addCoins(5); // +5 Samir coins reward for completing quiz
            setSuccessMessage(`Quiz results saved! Score: ${score}/${finalState.questions.length} (+5 Samir coins)`);
            setTimeout(() => setSuccessMessage(''), 5000);
            // Manually trigger data reload for the tracker
            loadUserData(); 
        } catch (e) {
            console.error('Error saving quiz results locally:', e);
            setError(`Failed to save quiz results locally: ${e.message}`);
        }
    };
    
    // --- Tracker Mode Logic (Unchanged) ---
    
    const useTrackerData = () => {
        const [trackerData, setTrackerData] = useState(null);
        const [isTrackerLoading, setIsTrackerLoading] = useState(false);
        
        // eslint-disable-next-line react-hooks/exhaustive-deps
        const fetchTrackerData = useCallback(async () => {
            if (!userId) return;
            setIsTrackerLoading(true);
            try {
                // Fetch all quiz results for the user from local storage
                const quizResults = JSON.parse(localStorage.getItem('samir_quiz_results') || '[]');
                let totalCorrect = 0;
                let totalQuestions = 0;
                let totalTime = 0;
                let weaknessPoints = {};
                let strengthPoints = {};
                quizResults.forEach(result => {
                    totalCorrect += result.score;
                    totalQuestions += result.total_questions;
                    totalTime += result.time_taken_ms;
                    if (result.detailed_results) {
                        result.detailed_results.forEach(item => {
                            const key = item.question; 
                            if (item.correct) {
                                strengthPoints[key] = (strengthPoints[key] || 0) + 1;
                            } else {
                                weaknessPoints[key] = (weaknessPoints[key] || 0) + 1;
                            }
                        });
                    }
                });
                const latestResult = quizResults.length > 0 ? quizResults[0] : null;
                setTrackerData({
                    totalStudyTime: totalStudyTime,
                    quizResults: quizResults,
                    overallAccuracy: totalQuestions > 0 ? (totalCorrect / totalQuestions) : 0,
                    avgTimePerQuiz: quizResults.length > 0 ? totalTime / quizResults.length : 0,
                    latestScore: latestResult ? `${latestResult.score}/${latestResult.total_questions}` : 'N/A',
                    weaknessSummary: weaknessPoints,
                    strengthSummary: strengthPoints,
                });
            } catch (e) {
                console.error('[CONSOLE_ERROR] Error fetching tracker data:', e);
                setError(`Failed to load tracker data locally: ${e.message}`);
            } finally {
                setIsTrackerLoading(false);
            }
        }, [userId, totalStudyTime]);
        
        return { trackerData, isTrackerLoading, fetchTrackerData };
    };

    const { trackerData, isTrackerLoading, fetchTrackerData } = useTrackerData();
    
    // Fetch data only when switching to tracker mode
    useEffect(() => {
        if (mode === 'tracker') {
            fetchTrackerData();
        }
    }, [mode, fetchTrackerData]);


    // --- UI Components and Rendering ---

    

    // Per-chat file upload handler
    const handleChatFileUpload = useCallback(async (event) => {
        const file = event.target.files?.[0];
        if (!file) return;
        
        try {
            // Create a synthetic event object for uploadFile
            const syntheticEvent = { target: { files: [file] } };
            await uploadFile(syntheticEvent);
        } catch (error) {
            console.error('File upload error:', error);
            const errorMessage = error?.message || String(error);
            // Check if error mentions setFileContent and provide helpful message
            if (errorMessage.includes('setFileContent')) {
                setError('File upload failed. Please refresh the page and try again.');
            } else {
                setError(`Failed to upload file: ${errorMessage}. Please try again.`);
            }
            setLoading(false);
        }
    }, [uploadFile, setError, setLoading]);
    
    
    const QuizInterface = () => {
        const q = quizState.questions[quizState.currentQuestionIndex];
        
        const formatTime = (ms) => {
            const seconds = Math.floor((ms / 1000) % 60);
            const minutes = Math.floor((ms / (1000 * 60)) % 60);
            return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
        };
        
        const startNewQuiz = () => {
            setQuizState({
                isActive: false,
                questions: [],
                currentQuestionIndex: 0,
                results: [], 
                timeStart: null,
                userAnswers: {},
                quizFinished: false,
            });
            setMode('quiz'); // Stay in quiz mode to show the quiz generator
        };


        if (quizState.isActive && !quizState.quizFinished) {
            return (
                <div className="p-6 space-y-6 bg-gray-800 rounded-xl shadow-lg border border-teal-500 text-white">
                    <h2 className="text-3xl font-extrabold text-teal-400 text-center">
                        Quiz - Q{quizState.currentQuestionIndex + 1}/{quizState.questions.length}
                    </h2>
                    
                    <p className="text-lg font-medium text-gray-100 p-4 border-l-4 border-teal-400 bg-gray-700 rounded-lg shadow-inner">
                        {q.question}
                    </p>

                    <div className="space-y-3">
                        {q.options.map((option, index) => (
                            <button
                                key={index}
                                onClick={() => handleQuizAnswer(option)}
                                className="w-full text-left p-4 border border-gray-600 rounded-xl hover:bg-teal-500/20 hover:border-teal-400 transition duration-150 shadow-md font-medium text-gray-100 active:scale-[0.99]"
                            >
                                {option}
                            </button>
                        ))}
                    </div>
                </div>
            );
        }
        
        if (quizState.quizFinished) {
            const correctCount = quizState.results.filter(r => r.correct).length;
            const total = quizState.results.length;
            const percentage = (correctCount / total) * 100;
            
            // Performance level determination with color coding
            const getPerformanceLevel = (accuracy) => {
                if (accuracy >= 0.9) return { level: 'excellent', color: 'blue', textColor: 'text-blue-600', bgColor: 'bg-blue-100', borderColor: 'border-blue-500' };
                if (accuracy >= 0.75) return { level: 'good', color: 'green', textColor: 'text-green-600', bgColor: 'bg-green-100', borderColor: 'border-green-500' };
                if (accuracy >= 0.5) return { level: 'fair', color: 'yellow', textColor: 'text-yellow-600', bgColor: 'bg-yellow-100', borderColor: 'border-yellow-500' };
                return { level: 'weak', color: 'red', textColor: 'text-red-600', bgColor: 'bg-red-100', borderColor: 'border-red-500' };
            };

            const performance = getPerformanceLevel(percentage / 100);
            
            return (
                <div className="p-6 space-y-6 bg-gray-800 rounded-xl shadow-lg border border-teal-500 text-center text-white">
                    <h2 className="text-4xl font-extrabold text-white">
                        Quiz Complete!
                    </h2>
                    <p className="text-xl text-gray-200">
                        Agent {profile?.name || 'Unknown'}, your score is:
                    </p>
                    <div className={`text-6xl font-black ${performance.textColor}`}>
                        {correctCount} / {total}
                    </div>
                    <div className={`inline-block px-6 py-2 rounded-full ${performance.bgColor} ${performance.borderColor} border-2`}>
                        <span className={`font-bold ${performance.textColor} capitalize`}>
                            {performance.level} Performance
                        </span>
                    </div>
                    <p className="text-lg text-gray-300">
                        Time Taken: {formatTime(quizState.timeTaken)}
                    </p>
                    
                    {/* FIX: Changed button behavior to reset the quiz state */}
                    <button
                        onClick={startNewQuiz}
                        className="mt-6 px-6 py-3 bg-teal-500 hover:bg-teal-600 text-white rounded-full font-bold shadow-lg transition duration-150 transform hover:scale-[1.03]"
                    >
                        Start New Quiz
                    </button>
                    
                    <div className="text-left mt-8 p-4 bg-gray-700 border border-gray-600 rounded-lg">
                        <h3 className="text-lg font-semibold text-white mb-2">Detailed Review</h3>
                        {/* FIX: Ensure userAnswers is populated before mapping */}
                        {Object.values(quizState.userAnswers).length === 0 ? (
                            <p className="text-gray-400">Review data is not available. Please try the quiz again.</p>
                        ) : (
                            Object.values(quizState.userAnswers).map((item, index) => (
                                <div key={index} className={`mb-3 p-3 rounded-lg ${item.correct ? 'bg-green-900/30 border-l-4 border-green-400' : 'bg-red-900/30 border-l-4 border-red-400'}`}>
                                    <p className="font-medium text-gray-100">{index + 1}. {item.questionText}</p>
                                    <p className={`text-sm ${item.correct ? 'text-green-300' : 'text-red-300'}`}>
                                        Your Answer: 
                                        <span className="font-bold ml-1">{item.selected}</span>
                                    </p>
                                    {!item.correct && (
                                        <p className="text-sm text-green-300">Correct: <span className="font-bold">{item.correctAnswer}</span></p>
                                    )}
                                </div>
                            ))
                        )}
                    </div>
                </div>
            );
        }
        
        return (
            <div className="p-6 space-y-6 bg-gray-800 rounded-xl shadow-lg border border-teal-500 text-center text-white">
                <h2 className="text-3xl font-extrabold text-teal-400">Quiz Creator</h2>
                <p className="text-lg text-gray-200">
                    Generate a formal, score-tracked multiple-choice quiz based on your uploaded document.
                </p>
                <button
                    onClick={async () => {
                        try {
                            console.log('🔥🔥🔥 QUIZ GENERATION CALLED (from button click) 🔥🔥🔥');
                            await generateQuiz();
                            console.log('🔥🔥🔥 QUIZ GENERATION SUCCESS (from button click) 🔥🔥🔥');
                        } catch (e) {
                            console.error('🔥🔥🔥 QUIZ FAIL ERROR (from button click) 🔥🔥🔥');
                            console.error('Error:', e);
                            console.error('Error message:', e?.message);
                            console.error('Error stack:', e?.stack);
                            console.error('Full error object:', e);
                            setError("Failed to generate quiz: " + (e?.message || String(e)));
                        }
                    }}
                    className="mt-4 px-8 py-4 bg-yellow-500 hover:bg-yellow-600 text-white font-bold rounded-full shadow-xl transition duration-150 transform hover:scale-[1.05] active:scale-[0.98] disabled:bg-gray-400"
                    disabled={!fileContent || isLoading}
                >
                    {isLoading ? 'Generating Quiz...' : 'Generate New Quiz'}
                </button>
                {!fileContent && <p className="text-red-500 text-sm mt-3">Please upload a document first to generate a quiz.</p>}
            </div>
        );
    };

    const TrackerMode = () => {
        // Don't block - show empty state instead if not ready
        if (isTrackerLoading) return <LoadingState />;
        // Don't check isChatLoaded - it's always enabled now
        if (!trackerData || trackerData.quizResults.length === 0) return (
            <div className="p-6 text-center space-y-4 bg-gradient-to-br from-blue-900 via-blue-800 to-blue-900 rounded-xl shadow-2xl h-full flex flex-col items-center justify-center text-white">
                <h2 className="text-3xl font-bold">No Tracking Data</h2>
                <p className="text-lg text-blue-200">
                    Complete a **Quiz** to start seeing your progress here!
                </p>
            </div>
        );

        const formatTime = (ms) => {
            const totalSeconds = Math.floor(ms / 1000);
            const hours = Math.floor(totalSeconds / 3600);
            const minutes = Math.floor((totalSeconds % 3600) / 60);
            const seconds = totalSeconds % 60;
            if (hours > 0) return `${hours}h ${minutes}m`;
            return `${minutes}m ${seconds}s`;
        };
        
        // Performance level determination with color coding
        const getPerformanceLevel = (accuracy) => {
            if (accuracy >= 0.9) return { level: 'excellent', color: 'blue', bgColor: 'bg-blue-500', textColor: 'text-blue-400' };
            if (accuracy >= 0.75) return { level: 'good', color: 'green', bgColor: 'bg-green-500', textColor: 'text-green-400' };
            if (accuracy >= 0.5) return { level: 'fair', color: 'yellow', bgColor: 'bg-yellow-500', textColor: 'text-yellow-400' };
            return { level: 'weak', color: 'red', bgColor: 'bg-red-500', textColor: 'text-red-400' };
        };

        const performance = getPerformanceLevel(trackerData.overallAccuracy);
        
        // Simple Top 3 logic for Strengths/Weaknesses
        const getTopN = (obj, n) => 
            Object.entries(obj)
                .sort(([,a], [,b]) => b - a)
                .slice(0, n)
                .map(([key, count]) => ({ topic: key.substring(0, 50), count }));

        const getTopS = (obj, n) => 
            Object.entries(obj)
                .sort(([,a], [,b]) => b - a)
                .slice(0, n)
                .map(([key, count]) => ({ topic: key.substring(0, 50), count }));

        const topWeaknesses = getTopN(trackerData.weaknessSummary, 4);
        const topStrengths = getTopS(trackerData.strengthSummary, 4);

        // Calculate max count for bar chart scaling
        const maxWeaknessCount = topWeaknesses.length > 0 ? Math.max(...topWeaknesses.map(w => w.count)) : 1;
        const maxStrengthCount = topStrengths.length > 0 ? Math.max(...topStrengths.map(s => s.count)) : 1;

        // Get quiz results for line chart (last 7 quizzes)
        const recentQuizzes = trackerData.quizResults.slice(0, 7).reverse();
        const maxQuizScore = recentQuizzes.length > 0 ? Math.max(...recentQuizzes.map(q => q.score)) : 1;

        // Calculate accuracy distribution for donut chart
        const totalQuizzes = trackerData.quizResults.length;
        const excellentQuizzes = trackerData.quizResults.filter(q => (q.score / q.total_questions) >= 0.9).length;
        const goodQuizzes = trackerData.quizResults.filter(q => {
            const acc = q.score / q.total_questions;
            return acc >= 0.75 && acc < 0.9;
        }).length;
        const fairQuizzes = trackerData.quizResults.filter(q => {
            const acc = q.score / q.total_questions;
            return acc >= 0.5 && acc < 0.75;
        }).length;
        const weakQuizzes = trackerData.quizResults.filter(q => (q.score / q.total_questions) < 0.5).length;

        const recommendation = trackerData.overallAccuracy < 0.7 
            ? `Focus on reviewing the topics where you missed questions, specifically: ${topWeaknesses.map(w => w.topic).join(', ')}. Try the **Detective Clue Chat** to work through these weak areas interactively.`
            : `Great progress! Your strengths are solid. Challenge yourself with a new **Quiz** on a different subject, or upload new material.`;

        return (
            <div className="p-6 space-y-6 bg-gradient-to-br from-blue-900 via-blue-800 to-blue-900 rounded-xl shadow-2xl text-white min-h-full w-full">
                {/* Header */}
                <div className="flex items-center justify-between mb-6">
                    <h2 className="text-3xl font-extrabold text-white">
                        ANALYTICS
                </h2>
                    <div className="flex gap-2">
                        <button className="px-4 py-2 bg-blue-700 hover:bg-blue-600 rounded-full text-sm font-medium transition">Week</button>
                        <button className="px-4 py-2 bg-blue-700 hover:bg-blue-600 rounded-full text-sm font-medium transition">Month</button>
                        <button className="px-4 py-2 bg-teal-500 hover:bg-teal-400 rounded-full text-sm font-medium transition">Year</button>
                    </div>
                </div>
                
                <p className="text-lg text-center text-blue-200 mb-6">
                    Tracking Agent <span className="font-bold text-white">{profile?.name || '...'}</span> (ID: {profile?.detectiveId || '...'})
                </p>
                
                {/* Key Metrics */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
                    <div className={`p-4 rounded-xl ${performance.bgColor} shadow-lg text-white`}>
                        <p className="text-sm opacity-90">Performance Level</p>
                        <p className="text-2xl font-bold mt-1 capitalize">{performance.level}</p>
                        <p className="text-sm opacity-80 mt-1">{`${(trackerData.overallAccuracy * 100).toFixed(1)}% Accuracy`}</p>
                    </div>
                    <div className="p-4 rounded-xl bg-teal-500 shadow-lg text-white">
                        <p className="text-sm opacity-90">Total Study Time</p>
                        <p className="text-2xl font-bold mt-1">{formatTime(trackerData.totalStudyTime)}</p>
                    </div>
                    <div className="p-4 rounded-xl bg-yellow-500 shadow-lg text-white">
                        <p className="text-sm opacity-90">Latest Quiz Score</p>
                        <p className="text-2xl font-bold mt-1">{trackerData.latestScore}</p>
                    </div>
                </div>
                
                {/* Performance Overview Section */}
                <div className="bg-blue-800/50 rounded-lg p-4 mb-6">
                    <div className="flex items-center gap-2 mb-4">
                        <div className="w-1 h-6 bg-teal-400 rounded"></div>
                        <h3 className="text-lg font-bold text-white">PERFORMANCE OVERVIEW</h3>
                    </div>
                    <div className="space-y-3">
                        {['People', 'Likes', 'Shares', 'Comments'].map((label, idx) => {
                            const values = [
                                topWeaknesses.length + topStrengths.length,
                                topStrengths.length,
                                totalQuizzes,
                                topWeaknesses.length
                            ];
                            const value = values[idx];
                            const maxValue = 500;
                            const percentage = Math.min((value / maxValue) * 100, 100);
                            return (
                                <div key={label} className="flex items-center gap-4">
                                    <span className="text-sm text-blue-200 w-20">{label}</span>
                                    <div className="flex-1 bg-blue-700 rounded-full h-6 relative overflow-hidden">
                                        <div 
                                            className="h-full bg-teal-500 rounded-full transition-all"
                                            style={{ width: `${percentage}%` }}
                                        ></div>
                                    </div>
                                    <span className="text-sm text-white font-bold w-12 text-right">{value}</span>
                                </div>
                            );
                        })}
                    </div>
                    <div className="flex justify-between text-xs text-blue-300 mt-2 px-1">
                        <span>0</span>
                        <span>100</span>
                        <span>200</span>
                        <span>300</span>
                        <span>400</span>
                        <span>500</span>
                    </div>
                </div>
                
                {/* Quiz Performance Distribution */}
                <div className="bg-blue-800/50 rounded-lg p-4 mb-6">
                    <div className="flex items-center gap-2 mb-4">
                        <div className="w-1 h-6 bg-yellow-400 rounded"></div>
                        <h3 className="text-lg font-bold text-white">QUIZ PERFORMANCE</h3>
                    </div>
                    <div className="flex items-center justify-center gap-8">
                        <div className="text-center">
                            <div className="text-2xl font-bold text-yellow-400">{weakQuizzes}</div>
                            <div className="text-sm text-blue-200">Weak</div>
                        </div>
                        <div className="relative w-32 h-32">
                            <svg className="transform -rotate-90 w-32 h-32">
                                <circle
                                    cx="64"
                                    cy="64"
                                    r="56"
                                    stroke="currentColor"
                                    strokeWidth="12"
                                    fill="transparent"
                                    className="text-blue-700"
                                />
                                <circle
                                    cx="64"
                                    cy="64"
                                    r="56"
                                    stroke="currentColor"
                                    strokeWidth="12"
                                    fill="transparent"
                                    strokeDasharray={`${(weakQuizzes / totalQuizzes) * 352} 352`}
                                    className="text-red-500"
                                />
                                <circle
                                    cx="64"
                                    cy="64"
                                    r="56"
                                    stroke="currentColor"
                                    strokeWidth="12"
                                    fill="transparent"
                                    strokeDasharray={`${(fairQuizzes / totalQuizzes) * 352} 352`}
                                    strokeDashoffset={`-${(weakQuizzes / totalQuizzes) * 352}`}
                                    className="text-yellow-500"
                                />
                                <circle
                                    cx="64"
                                    cy="64"
                                    r="56"
                                    stroke="currentColor"
                                    strokeWidth="12"
                                    fill="transparent"
                                    strokeDasharray={`${(goodQuizzes / totalQuizzes) * 352} 352`}
                                    strokeDashoffset={`-${((weakQuizzes + fairQuizzes) / totalQuizzes) * 352}`}
                                    className="text-green-500"
                                />
                                <circle
                                    cx="64"
                                    cy="64"
                                    r="56"
                                    stroke="currentColor"
                                    strokeWidth="12"
                                    fill="transparent"
                                    strokeDasharray={`${(excellentQuizzes / totalQuizzes) * 352} 352`}
                                    strokeDashoffset={`-${((weakQuizzes + fairQuizzes + goodQuizzes) / totalQuizzes) * 352}`}
                                    className="text-blue-500"
                                />
                            </svg>
                        </div>
                        <div className="text-center">
                            <div className="text-2xl font-bold text-blue-400">{excellentQuizzes}</div>
                            <div className="text-sm text-blue-200">Excellent</div>
                        </div>
                    </div>
                    <div className="flex justify-center gap-6 mt-4 text-sm">
                        <div className="flex items-center gap-2">
                            <div className="w-3 h-3 rounded-full bg-red-500"></div>
                            <span className="text-blue-200">{weakQuizzes} Weak</span>
                        </div>
                        <div className="flex items-center gap-2">
                            <div className="w-3 h-3 rounded-full bg-yellow-500"></div>
                            <span className="text-blue-200">{fairQuizzes} Fair</span>
                        </div>
                        <div className="flex items-center gap-2">
                            <div className="w-3 h-3 rounded-full bg-green-500"></div>
                            <span className="text-blue-200">{goodQuizzes} Good</span>
                        </div>
                        <div className="flex items-center gap-2">
                            <div className="w-3 h-3 rounded-full bg-blue-500"></div>
                            <span className="text-blue-200">{excellentQuizzes} Excellent</span>
                        </div>
                    </div>
                </div>

                {/* Recent Quiz Trends */}
                <div className="bg-blue-800/50 rounded-lg p-4 mb-6">
                    <div className="flex items-center gap-2 mb-4">
                        <div className="w-1 h-6 bg-red-400 rounded"></div>
                        <h3 className="text-lg font-bold text-white">RECENT QUIZ TRENDS</h3>
                    </div>
                    <div className="h-48 flex items-end justify-between gap-2">
                        {recentQuizzes.map((quiz, idx) => {
                            const score = quiz.score;
                            const height = (score / maxQuizScore) * 100;
                            const quizPerformance = getPerformanceLevel(score / quiz.total_questions);
                            return (
                                <div key={idx} className="flex-1 flex flex-col items-center gap-2">
                                    <div className="relative w-full flex items-end justify-center" style={{ height: '120px' }}>
                                        <div 
                                            className={`w-full ${quizPerformance.bgColor} rounded-t transition-all`}
                                            style={{ height: `${Math.max(height, 5)}%` }}
                                        ></div>
                                    </div>
                                    <div className="text-xs text-blue-200">{quiz.score}/{quiz.total_questions}</div>
                                </div>
                            );
                        })}
                    </div>
                </div>

                {/* Weaknesses and Strengths */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
                    <div className="bg-blue-800/50 rounded-lg p-4 border-l-4 border-red-500">
                        <h4 className="text-lg font-bold text-white mb-3">Top Weakness Areas</h4>
                        <div className="space-y-3">
                            {topWeaknesses.length > 0 ? (
                                topWeaknesses.map((item, index) => {
                                    const percentage = (item.count / maxWeaknessCount) * 100;
                                    return (
                                        <div key={index} className="space-y-1">
                                            <div className="flex justify-between text-sm">
                                                <span className="text-blue-200">{item.topic}</span>
                                                <span className="text-red-400 font-bold">{item.count}</span>
                                            </div>
                                            <div className="w-full bg-blue-700 rounded-full h-2">
                                                <div 
                                                    className="bg-red-500 h-2 rounded-full transition-all"
                                                    style={{ width: `${percentage}%` }}
                                                ></div>
                                            </div>
                                        </div>
                                    );
                                })
                            ) : (
                                <p className="text-blue-300 text-sm">No weaknesses recorded yet.</p>
                            )}
                        </div>
                    </div>
                    <div className="bg-blue-800/50 rounded-lg p-4 border-l-4 border-green-500">
                        <h4 className="text-lg font-bold text-white mb-3">Top Strength Areas</h4>
                        <div className="space-y-3">
                            {topStrengths.length > 0 ? (
                                topStrengths.map((item, index) => {
                                    const percentage = (item.count / maxStrengthCount) * 100;
                                    return (
                                        <div key={index} className="space-y-1">
                                            <div className="flex justify-between text-sm">
                                                <span className="text-blue-200">{item.topic}</span>
                                                <span className="text-green-400 font-bold">{item.count}</span>
                                            </div>
                                            <div className="w-full bg-blue-700 rounded-full h-2">
                                                <div 
                                                    className="bg-green-500 h-2 rounded-full transition-all"
                                                    style={{ width: `${percentage}%` }}
                                                ></div>
                                            </div>
                                        </div>
                                    );
                                })
                            ) : (
                                <p className="text-blue-300 text-sm">No strengths recorded yet.</p>
                            )}
                        </div>
                    </div>
                </div>
                
                {/* Recommendation */}
                <div className="p-4 bg-blue-800/70 border-l-4 border-teal-400 rounded-lg">
                    <h3 className="font-bold text-teal-300 mb-2">Recommendation:</h3>
                    <p className="text-blue-100">{recommendation}</p>
                </div>
            </div>
        );
    };

    // --- Local-only UI Modes ---
    const ChatsMode = () => {
        const active = threads.find(t => t.id === activeThreadId) || null;
        const [msg, setMsg] = useState('');
        return (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 h-full">
                <div className="bg-white rounded-xl shadow p-3 md:col-span-1 flex flex-col">
                    <div className="flex items-center justify-between mb-2">
                        <h3 className="font-bold text-gray-700">Chats</h3>
                        <button onClick={addNewChatForCurrentFile} className="px-3 py-1 bg-blue-600 text-white rounded shadow-md">+ New Chat</button>
                    </div>
                    <div className="overflow-y-auto space-y-2">
                        {threads.length===0 && <p className="text-sm text-gray-500">No chats yet. Upload a file and click + New Chat.</p>}
                        {threads.map(t => (
                            <button key={t.id} onClick={()=>setActiveThreadId(t.id)} className={`w-full text-left p-2 rounded border ${activeThreadId===t.id? 'border-indigo-400 bg-indigo-50':'border-gray-200'}`}>
                                <div className="text-sm font-medium">{t.title}</div>
                                <div className="text-xs text-gray-500">{t.fileName}</div>
                            </button>
                        ))}
                    </div>
                </div>
                <div className="bg-white rounded-xl shadow p-3 md:col-span-2 flex flex-col">
                    {!active ? (
                        <div className="text-gray-500 m-auto">Select or create a chat.</div>
                    ) : (
                        <>
                            <div className="font-semibold text-gray-700 mb-2">{active.title}</div>
                            <div className="flex-1 overflow-y-auto space-y-2 border rounded p-2 bg-gray-50">
                                {active.messages.map((m, i) => (
                                    <div key={i} className={`flex ${m.role==='user'?'justify-end':'justify-start'}`}>
                                        <div className={`px-3 py-2 rounded ${m.role==='user'?'bg-blue-600 text-white':'bg-white border'}`}>{m.text}</div>
                                    </div>
                                ))}
                            </div>
                            <form onSubmit={(e)=>{e.preventDefault(); if(!msg.trim()) return; appendMessageToThread(active.id,'user',msg); setMsg('');}} className="mt-2 flex gap-2">
                                <input className="flex-1 p-2 border rounded" value={msg} onChange={e=>setMsg(e.target.value)} placeholder="Type a message..." />
                                <button type="submit" className="px-4 py-2 bg-indigo-600 text-white rounded">Send</button>
                            </form>
                        </>
                    )}
                </div>
            </div>
        );
    };

    const ScheduleMode = () => {
        const [subject, setSubject] = useState('');
        const [task, setTask] = useState('');
        const [start, setStart] = useState('');
        const [end, setEnd] = useState('');
        const [ocrLoading, setOcrLoading] = useState(false);
        const items = scheduleDays[selectedDate] || [];
        const makeAlarm = (label, timeStr) => {
            if (!timeStr) return;
            const ts = new Date(`${selectedDate}T${timeStr}:00`).getTime();
            scheduleAlarm(selectedDate, 'alarm', ts, label);
        };
        const weekdayAbbrev = (dateStr) => ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'][new Date(dateStr).getDay()];
        const parseTime = (str) => {
            const m = str.match(/(\d{1,2})[:\.](\d{2})/);
            if (!m) return '';
            const hh = String(Math.max(0, Math.min(23, parseInt(m[1],10)))).padStart(2,'0');
            const mm = String(Math.max(0, Math.min(59, parseInt(m[2],10)))).padStart(2,'0');
            return `${hh}:${mm}`;
        };
        const parseHhMmToMinutes = (hhmm) => {
            const [h,m] = (hhmm||'').split(':').map(n=>parseInt(n||'0',10));
            return (isNaN(h)?0:h)*60 + (isNaN(m)?0:m);
        };
        const minutesToHhMm = (mins) => {
            const h = Math.floor(mins/60)%24; const m = mins%60;
            return `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}`;
        };
        const importFromImage = async (file) => {
            if (!file) return;
            setOcrLoading(true);
            setError('');
            try {
                const { data: { text } } = await Tesseract.recognize(file, 'eng', { logger:()=>{} });
                const lines = text.split(/\r?\n/).map(l=>l.trim()).filter(Boolean);
                const todayAbbrev = weekdayAbbrev(selectedDate);
                const dayTokens = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
                for (const line of lines) {
                    // Heuristic: look for time and subject in same line
                    const timeMatches = line.match(/(\d{1,2}[:\.]\d{2})\s*-?\s*(\d{1,2}[:\.]\d{2})?/);
                    if (!timeMatches) continue;
                    const startT = parseTime(timeMatches[1]||'');
                    const endT = parseTime(timeMatches[2]||'');
                    let remaining = line.replace(timeMatches[0], '').trim();
                    // Check if line mentions specific days, otherwise assume applies to selected day
                    const mentionedDays = dayTokens.filter(d => new RegExp(`\\b${d}\\b`, 'i').test(line));
                    if (mentionedDays.length>0 && !mentionedDays.includes(todayAbbrev)) continue;
                    // Subject/task split heuristic
                    const parts = remaining.split(/\s{2,}|\t|\s-\s/).filter(Boolean);
                    const subj = parts[0] || 'Class';
                    const tsk = parts[1] || 'Study';
                    addScheduleItem(selectedDate, { subject: subj, task: tsk, start: startT, end: endT });
                }
                setSuccessMessage('Schedule imported from image.');
                setTimeout(()=>setSuccessMessage(''), 3000);
            } catch (e) {
                console.error('OCR import failed:', e);
                setError('Failed to import from image. Try a clearer photo or higher contrast.');
            } finally {
                setOcrLoading(false);
            }
        };
        const generateAuto = () => {
            setError('');
            const startM = parseHhMmToMinutes(prefs.schoolEnd || '16:00');
            const endM = parseHhMmToMinutes(prefs.sleep || '22:00');
            if (endM - startM < 30) { setError('Not enough time window between school end and sleep.'); return; }
            const plan = [
                { subject: 'Rest', task: 'Break', dur: 20 },
                { subject: 'Homework', task: 'Complete tasks', dur: 60 },
                { subject: 'Review', task: 'Today\'s lessons', dur: 45 },
                { subject: 'Reading', task: 'Reading', dur: 30 },
                { subject: 'Practice', task: 'Quiz practice', dur: 30 },
            ];
            let cursor = startM;
            const itemsToAdd = [];
            let idx = 0;
            while (cursor < endM - 15) {
                const block = plan[idx % plan.length];
                const bStart = minutesToHhMm(cursor);
                const next = cursor + block.dur;
                const bEnd = minutesToHhMm(Math.min(next, endM));
                itemsToAdd.push({ subject: block.subject, task: block.task, start: bStart, end: bEnd });
                cursor = next + 10; // add small break
                idx++;
            }
            setScheduleDays(prev => ({ ...prev, [selectedDate]: [] }));
            for (const it of itemsToAdd) addScheduleItem(selectedDate, it);
            setSuccessMessage('Plan generated'); setTimeout(()=>setSuccessMessage(''),2000);
        };
        return (
            <div className="space-y-4">
                <div className="flex flex-wrap gap-3 items-end">
                    <div>
                        <label className="block text-sm">Date</label>
                        <input type="date" className="border p-2 rounded" value={selectedDate} onChange={e=>setSelectedDate(e.target.value)} />
                    </div>
                    <div>
                        <label className="block text-sm">Import (Photo)</label>
                        <input type="file" accept="image/*" onChange={(e)=>importFromImage(e.target.files?.[0])} className="border p-2 rounded" />
                    </div>
                    <div className="flex items-end gap-2">
                        <div>
                            <label className="block text-sm">School ends at</label>
                            <input type="time" className="border p-2 rounded" value={prefs.schoolEnd} onChange={e=>setPrefs(p=>({...p, schoolEnd: e.target.value}))} />
                        </div>
                        <div>
                            <label className="block text-sm">Sleep at</label>
                            <input type="time" className="border p-2 rounded" value={prefs.sleep} onChange={e=>setPrefs(p=>({...p, sleep: e.target.value}))} />
                        </div>
                        <button onClick={generateAuto} className="px-4 py-2 bg-indigo-600 text-white rounded">Generate Plan</button>
                    </div>
                    <div>
                        <label className="block text-sm">Subject</label>
                        <input className="border p-2 rounded" value={subject} onChange={e=>setSubject(e.target.value)} />
                    </div>
                    <div>
                        <label className="block text-sm">Task</label>
                        <input className="border p-2 rounded" value={task} onChange={e=>setTask(e.target.value)} placeholder="e.g., Daily quiz" />
                    </div>
                    <div>
                        <label className="block text-sm">Start</label>
                        <input type="time" className="border p-2 rounded" value={start} onChange={e=>setStart(e.target.value)} />
                    </div>
                    <div>
                        <label className="block text-sm">End</label>
                        <input type="time" className="border p-2 rounded" value={end} onChange={e=>setEnd(e.target.value)} />
                    </div>
                    <button onClick={()=>{ if(!subject||!task) return; addScheduleItem(selectedDate,{subject,task,start,end}); requestNotify(); makeAlarm(`Start ${subject}`, start); makeAlarm(`Finish ${subject}`, end); setSubject(''); setTask(''); setStart(''); setEnd(''); }} className="px-4 py-2 bg-green-600 text-white rounded">Add</button>
                </div>
                <div className="bg-white rounded-xl shadow p-3">
                    <h3 className="font-bold mb-2">Checklist for {selectedDate}</h3>
                    {ocrLoading && <p className="text-sm text-indigo-600">Importing from image...</p>}
                    {items.length===0 && <p className="text-sm text-gray-500">No items yet.</p>}
                    <ul className="space-y-2">
                        {items.map(i=> (
                            <li key={i.id} className="flex items-center gap-2">
                                <input type="checkbox" checked={i.done} onChange={()=>toggleScheduleDone(selectedDate,i.id)} />
                                <span className={`${i.done?'line-through text-gray-400':''}`}>{i.subject} — {i.task} {i.start&&`(${i.start}-${i.end||''})`}</span>
                                <button onClick={()=>removeScheduleItem(selectedDate,i.id)} className="ml-auto text-red-600 text-sm">Remove</button>
                            </li>
                        ))}
                    </ul>
                </div>
                <div className="bg-white rounded-xl shadow p-3">
                    <h3 className="font-bold mb-2">Daily Report</h3>
                    <button onClick={()=>{
                        const done = items.filter(i=>i.done).length; const total = items.length; const report = `Report for ${selectedDate}: Completed ${done}/${total}. Tasks: ` + items.map(i=>`${i.subject}-${i.task}[${i.done?'done':'pending'}]`).join(', ');
                        navigator.clipboard?.writeText(report);
                        setSuccessMessage('Daily report copied to clipboard.'); setTimeout(()=>setSuccessMessage(''),3000);
                    }} className="px-4 py-2 bg-indigo-600 text-white rounded">Copy Report</button>
                </div>
            </div>
        );
    };

    const GroupsMode = () => {
        const [name, setName] = useState('');
        const [grade, setGrade] = useState('4th Grade Science');
        const [memberName, setMemberName] = useState(profile?.name || 'Me');
        const g = groups.find(x=>x.id===activeGroupId) || null;
        const [msg, setMsg] = useState('');
        return (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 h-full">
                <div className="bg-white rounded-xl shadow p-3 md:col-span-1 space-y-3">
                    <div className="space-y-2">
                        <input className="w-full border p-2 rounded" placeholder="Group name" value={name} onChange={e=>setName(e.target.value)} />
                        <input className="w-full border p-2 rounded" placeholder="Grade/Subject" value={grade} onChange={e=>setGrade(e.target.value)} />
                        <button type="button" onClick={()=>{ const trimmed = name.trim(); if(!trimmed) { setError('Enter a group name'); setTimeout(()=>setError(''),2000); return; } createGroup(trimmed, grade.trim()); setName(''); setSuccessMessage('Group created'); setTimeout(()=>setSuccessMessage(''),2000); }} className="w-full px-3 py-2 bg-indigo-600 text-white rounded">Create Group</button>
                    </div>
                    <div className="overflow-y-auto space-y-2">
                        {groups.length===0 && <div className="text-sm text-gray-500">No groups yet.</div>}
                        {groups.map(gr=> (
                            <button key={gr.id} onClick={()=>setActiveGroupId(gr.id)} className={`w-full text-left p-2 rounded border ${activeGroupId===gr.id? 'border-indigo-400 bg-indigo-50':'border-gray-200'}`}>
                                <div className="text-sm font-medium">{gr.name}</div>
                                <div className="text-xs text-gray-500">{gr.grade} • {gr.members.length}/5</div>
                            </button>
                        ))}
                    </div>
                </div>
                <div className="bg-white rounded-xl shadow p-3 md:col-span-2 flex flex-col">
                    {!g ? (
                        <div className="text-gray-500 m-auto">Select or create a group.</div>
                    ) : (
                        <>
                            <div className="flex items-center gap-2 mb-2">
                                <div className="font-semibold text-gray-700">{g.name}</div>
                                <button onClick={()=>joinGroup(g.id, memberName)} className="ml-auto px-3 py-1 bg-green-600 text-white rounded">Join</button>
                            </div>
                            <div className="text-xs text-gray-500 mb-2">Members: {g.members.join(', ')||'None'}</div>
                            <div className="flex-1 overflow-y-auto space-y-2 border rounded p-2 bg-gray-50">
                                {g.messages.map((m,i)=>(
                                    <div key={i} className="text-sm"><span className="font-semibold">{m.author}:</span> {m.text}</div>
                                ))}
                            </div>
                            <form onSubmit={(e)=>{e.preventDefault(); if(!msg.trim()) return; if(!g.members.includes(memberName)) joinGroup(g.id, memberName); sendGroupMessage(g.id, memberName, msg); setMsg('');}} className="mt-2 flex gap-2">
                                <input className="flex-1 p-2 border rounded" value={msg} onChange={e=>setMsg(e.target.value)} placeholder="Message" />
                                <button type="submit" className="px-4 py-2 bg-indigo-600 text-white rounded">Send</button>
                            </form>
                        </>
                    )}
                </div>
            </div>
        );
    };

    const CommunityMode = () => {
        const [title, setTitle] = useState('');
        const [body, setBody] = useState('');
        const [announce, setAnnounce] = useState(false);
        return (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="bg-white rounded-xl shadow p-3 space-y-2">
                    <h3 className="font-bold">New {announce?'Announcement':'Post'}</h3>
                    <input className="w-full border p-2 rounded" placeholder="Title" value={title} onChange={e=>setTitle(e.target.value)} />
                    <textarea className="w-full border p-2 rounded" rows={5} placeholder="Write something..." value={body} onChange={e=>setBody(e.target.value)} />
                    <label className="text-sm inline-flex items-center gap-2"><input type="checkbox" checked={announce} onChange={e=>setAnnounce(e.target.checked)} /> Announcement</label>
                    <button onClick={()=>{ if(!title||!body) return; addPost(title, body, profile?.name||'Agent', announce); setTitle(''); setBody(''); setAnnounce(false); }} className="px-4 py-2 bg-indigo-600 text-white rounded">Publish</button>
                </div>
                <div className="md:col-span-2 space-y-3">
                    {posts.length===0 && <div className="bg-white rounded-xl shadow p-3 text-sm text-gray-500">No posts yet.</div>}
                    {posts.map(p=> (
                        <div key={p.id} className={`bg-white rounded-xl shadow p-3 border-l-4 ${p.isAnnouncement?'border-indigo-500':'border-gray-200'}`}>
                            <div className="font-semibold">{p.title}</div>
                            <div className="text-xs text-gray-500 mb-1">by {p.author} • {new Date(p.ts).toLocaleString()}</div>
                            <div className="text-sm whitespace-pre-wrap">{p.body}</div>
                        </div>
                    ))}
                </div>
            </div>
        );
    };




    const renderModeContent = () => {
        switch (mode) {
            case 'home':
                return <ChatInterface 
                    chatTitle="Home: AI Tutor" 
                    detectiveMode={false}
                    chatContainerRef={chatContainerRef}
                    fileContent={fileContent}
                    handleChatFileUpload={handleChatFileUpload}
                    uploadFile={uploadFile}
                    isLoading={isLoading}
                    isChatLoaded={isChatLoaded}
                    chatHistory={chatHistory}
                    profile={profile}
                    handleSendMessage={handleSendMessage}
                    chatInputRef={chatInputRef}
                    input={input}
                    setInput={setInput}
                    chatEndRef={chatEndRef}
                />;
            case 'tutor':
                return <ChatInterface 
                    chatTitle="Tutor Mode: Factual Explanations" 
                    detectiveMode={false}
                    chatContainerRef={chatContainerRef}
                    fileContent={fileContent}
                    handleChatFileUpload={handleChatFileUpload}
                    uploadFile={uploadFile}
                    isLoading={isLoading}
                    isChatLoaded={isChatLoaded}
                    chatHistory={chatHistory}
                    profile={profile}
                    handleSendMessage={handleSendMessage}
                    chatInputRef={chatInputRef}
                    input={input}
                    setInput={setInput}
                    chatEndRef={chatEndRef}
                />;
            case 'detective':
                return <ChatInterface 
                    chatTitle="Detective Clue Chat: Hidden Item Search" 
                    detectiveMode={true}
                    chatContainerRef={chatContainerRef}
                    fileContent={fileContent}
                    handleChatFileUpload={handleChatFileUpload}
                    uploadFile={uploadFile}
                    isLoading={isLoading}
                    isChatLoaded={isChatLoaded}
                    chatHistory={chatHistory}
                    profile={profile}
                    handleSendMessage={handleSendMessage}
                    chatInputRef={chatInputRef}
                    input={input}
                    setInput={setInput}
                    chatEndRef={chatEndRef}
                />;
            case 'quiz':
                return <QuizInterface />;
            case 'tracker':
                return <TrackerMode />;
            case 'chats':
                return <ChatsMode />;
            case 'schedule':
                return <ScheduleMode />;
            case 'groups':
                return <GroupsMode />;
            case 'community':
                return <CommunityMode />;
            case 'about':
                return <AboutMode />;
            default:
                return <ChatInterface 
                    chatTitle="Tutor Mode: Factual Explanations" 
                    detectiveMode={false}
                    chatContainerRef={chatContainerRef}
                    fileContent={fileContent}
                    handleChatFileUpload={handleChatFileUpload}
                    uploadFile={uploadFile}
                    isLoading={isLoading}
                    isChatLoaded={isChatLoaded}
                    chatHistory={chatHistory}
                    profile={profile}
                    handleSendMessage={handleSendMessage}
                    chatInputRef={chatInputRef}
                    input={input}
                    setInput={setInput}
                    chatEndRef={chatEndRef}
                />;
        }
    };


    // --- Main Render Logic ---

    // App is always ready now - no blocking checks
    
    // Optional: Show auth screen if user wants to sign in (but don't block)
    // Uncomment below to require authentication:
    /*
    if (isAuthReady && !userId) {
        return (
            <div className="min-h-screen">
                <AuthScreen setIsAuthReady={setIsAuthReady} setLoading={setLoading} setUserId={setUserId} />
            </div>
        );
    }
    */
    
    // Profile editor is optional - don't block the app
    // User can set profile later if they want


    // 3. Main Application Interface
    return (
        <div className="min-h-screen flex flex-col bg-[#020617] text-white font-['Cairo',sans-serif] selection:bg-purple-500/30 relative overflow-x-hidden" style={{ flexDirection: 'column' }}>
            {/* --- Global Status Messages --- */}
            
            {successMessage && (
                <div className="fixed top-4 left-1/2 transform -translate-x-1/2 bg-green-100 border border-green-400 text-green-700 px-6 py-3 rounded-lg shadow-xl transition duration-500 z-50">
                    <strong className="font-bold">Success!</strong>
                    <span className="block sm:inline ml-2">{successMessage}</span>
                </div>
            )}
            
            {error && (
                <div className="fixed top-4 left-1/2 transform -translate-x-1/2 bg-red-100 border border-red-400 text-red-700 px-6 py-3 rounded-lg shadow-xl transition duration-500 z-50" role="alert">
                    <strong className="font-bold">Error!</strong>
                    <span className="block sm:inline ml-2">{error}</span>
                </div>
            )}
            
            <ProfileEditorModal 
                show={showProfileEditor}
                tempProfile={tempProfile}
                setTempProfile={setTempProfile}
                handleSaveProfile={handleSaveProfileClick}
                setShowProfileEditor={setShowProfileEditor}
                profile={profile}
                isLoading={loading}
                localError={profileEditorError}
            />

            {/* --- Header --- ترتيب 1 */}
            <header className="order-1 sticky top-0 z-[9999] w-full border-b border-white/5 bg-[#020617]/95 backdrop-blur-xl flex-shrink-0 shrink-0" style={{ pointerEvents: 'auto' }}>
                <div className="max-w-7xl mx-auto px-4 md:px-6 h-16 md:h-20 flex justify-between items-center flex-nowrap gap-4" style={{ pointerEvents: 'auto' }}>
                    <div className="flex items-center gap-4 lg:gap-6 min-w-0 flex-shrink">
                        <h1 className="text-xl md:text-2xl font-black tracking-tighter" style={{ color: '#a855f7' }}>SAMIR</h1>
                        <nav className="hidden md:flex items-center gap-3 lg:gap-5 text-sm font-medium text-white/60 flex-shrink-0" style={{ pointerEvents: 'auto' }}>
                    {[
                        { key: 'home', label: 'Home' },
                        { key: 'tutor', label: 'Tutor Mode' },
                        { key: 'detective', label: 'Detective Clue Chat' },
                        { key: 'quiz', label: t('tab_quiz') },
                        { key: 'tracker', label: 'Tracker Dashboard' },
                        { key: 'chats', label: 'Chats' },
                        { key: 'schedule', label: t('tab_schedule') },
                        { key: 'groups', label: t('tab_groups') },
                        { key: 'community', label: t('tab_community') },
                        { key: 'about', label: 'About Us' },
                    ].map(item => (
                        <button
                            type="button"
                            key={item.key}
                            onClick={(e) => { e.preventDefault(); e.stopPropagation(); setMode(item.key); setNavDropdownOpen(false); }}
                            style={{ pointerEvents: 'auto' }}
                            className={`text-sm font-medium transition-all duration-200 cursor-pointer
                                ${mode === item.key 
                                    ? 'text-white'
                                    : 'text-white/70 hover:text-white hover:drop-shadow-[0_0_8px_rgba(255,255,255,0.5)]'
                                }
                            `}
                        >
                            {item.label}
                        </button>
                    ))}
                        </nav>
                        {/* More dropdown - Home & About Us */}
                        <div className="relative hidden md:block">
                            <button 
                                type="button"
                                onClick={() => setNavDropdownOpen(!navDropdownOpen)}
                                className="text-sm font-medium text-white/60 hover:text-white transition-colors flex items-center gap-1"
                            >
                                More ▾
                            </button>
                            {navDropdownOpen && (
                                <div className="absolute top-full right-0 mt-2 py-2 w-40 bg-[#0f172a]/95 backdrop-blur-xl border border-white/10 rounded-lg shadow-xl z-50">
                                    <button type="button" onClick={() => { setMode('home'); setNavDropdownOpen(false); }} className="block w-full text-left px-4 py-2 text-sm text-white/80 hover:text-white hover:bg-white/5">Home</button>
                                    <button type="button" onClick={() => { setMode('about'); setNavDropdownOpen(false); }} className="block w-full text-left px-4 py-2 text-sm text-white/80 hover:text-white hover:bg-white/5">About Us</button>
                                </div>
                            )}
                        </div>
                    </div>

                    {/* User controls - Samir coins ثم مسافة ثم EA */}
                    <div className="flex items-center flex-shrink-0">
                        <div className="flex flex-col items-end pr-4 mr-4 border-r border-white/20">
                            <span className="text-xs text-amber-400/90 whitespace-nowrap">🪙 {samirCoins} Samir coins</span>
                        </div>
                        <div className="w-9 h-9 md:w-10 md:h-10 rounded-full bg-gradient-to-tr from-purple-600 to-blue-600 flex items-center justify-center border border-white/10 flex-shrink-0">
                            <span className="text-xs font-bold text-white">EA</span>
                        </div>
                        <select value={lang} onChange={(e)=>setLang(e.target.value)} className="bg-transparent text-white/90 p-2 rounded-lg text-sm backdrop-blur-sm focus:outline-none border border-white/10">
                            <option value="en" className="bg-slate-900">English</option>
                            <option value="ar" className="bg-slate-900">العربية</option>
                            <option value="es" className="bg-slate-900">Español</option>
                        </select>
                    <button type="button"
                        onClick={() => { setTempProfile({ name: profile?.name || '', detectiveId: profile?.detectiveId || '' }); setProfileEditorError(''); setShowProfileEditor(true); }}
                        className="text-white/60 hover:text-white px-2 py-1 text-sm font-medium transition-colors"
                        title="Settings"
                    >
                        Settings
                    </button>
                    <button type="button"
                        onClick={handleLogout}
                        className="text-sm font-semibold bg-white text-black px-5 py-2 rounded-full hover:bg-white/90 transition-all"
                    >
                        {t('sign_out')}
                    </button>
                    </div>
                </div>
            </header>

            {/* --- Nav bar (mobile only) --- ترتيب 2 */}
            <nav className="order-2 flex md:hidden justify-center p-4 sticky top-14 z-30 bg-transparent backdrop-blur-sm" style={{ pointerEvents: 'auto' }}>
                <div className="flex flex-wrap justify-center gap-2">
                    {[
                        { key: 'home', label: 'Home' },
                        { key: 'tutor', label: 'Tutor' },
                        { key: 'detective', label: 'Detective' },
                        { key: 'quiz', label: t('tab_quiz') },
                        { key: 'tracker', label: 'Tracker' },
                        { key: 'chats', label: 'Chats' },
                        { key: 'schedule', label: t('tab_schedule') },
                        { key: 'groups', label: t('tab_groups') },
                        { key: 'community', label: t('tab_community') },
                        { key: 'about', label: 'About' },
                    ].map(item => (
                        <button type="button" key={item.key} onClick={() => setMode(item.key)}
                            className={`text-xs font-medium px-2 py-1 rounded-lg transition-all ${mode === item.key ? 'text-white' : 'text-white/70 hover:text-white'}`}>
                            {item.label}
                        </button>
                    ))}
                </div>
            </nav>

            {/* --- Main Content --- ترتيب 3 */}
            <main className={`order-3 flex-1 min-h-0 relative z-10 flex flex-col ${mode === 'tracker' ? 'p-0' : 'p-4 md:p-6 py-8'}`}>
                <div className={`mx-auto flex-1 flex flex-col w-full min-h-0 ${mode === 'tutor' || mode === 'detective' ? 'max-w-5xl' : mode === 'tracker' ? 'w-full' : 'max-w-5xl'} ${mode === 'tracker' ? 'p-4 md:p-6' : ''}`}>
                    {renderModeContent()}
                </div>
            </main>

            {/* --- Footer - ترتيب 4 - أسفل الصفحة فقط --- */}
            <footer className="order-[999] flex-shrink-0 w-full mt-auto py-6 text-center border-t border-white/5" style={{ pointerEvents: 'auto', position: 'relative' }}>
                <div className="max-w-4xl mx-auto px-4 space-y-2 text-white/40 text-sm">
                    <p>© {new Date().getFullYear()} Elham Abdelbary. All rights reserved.</p>
                    <p>Contact: <a href="tel:+201098899101" className="hover:text-white transition-colors">+20 109 889 9101</a></p>
                    <div className="flex justify-center gap-6 text-xs">
                        <a href="#" className="hover:text-white transition-colors">Privacy Policy</a>
                        <span>|</span>
                        <a href="#" className="hover:text-white transition-colors">Terms of Service</a>
                    </div>
                </div>
            </footer>
        </div>
    );
};

// --- Main App Wrapper with Error Boundary ---
const AppWithErrorBoundary = () => (
    <ErrorBoundary>
        <App />
    </ErrorBoundary>
);

export default AppWithErrorBoundary;
