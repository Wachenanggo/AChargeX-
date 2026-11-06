const env = import.meta.env;

export const API_URL: string = (env.VITE_API_URL as string | undefined)?.replace(/\/$/, '') ?? '';
export const SUPABASE_URL = (env.VITE_SUPABASE_URL as string | undefined) || '';
export const SUPABASE_ANON_KEY = (env.VITE_SUPABASE_ANON_KEY as string | undefined) || '';
export const SUPABASE_CONFIGURED = !!(SUPABASE_URL && SUPABASE_ANON_KEY);
export const GOOGLE_OAUTH = env.VITE_GOOGLE_OAUTH === 'true';
export const APP_URL = typeof window !== 'undefined' ? window.location.origin : 'http://localhost:5173';
