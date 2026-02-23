import { createClient } from '@supabase/supabase-js';

// Supabase keys for free-tier cloud sync features
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || '';
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || '';

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

// PDF.js is now dynamically imported only when needed (in extractTextFromPDF)
// This avoids worker setup issues at startup
