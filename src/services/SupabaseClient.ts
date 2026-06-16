import { createClient } from '@supabase/supabase-js';
import AsyncStorage from '@react-native-async-storage/async-storage';

// ⚠️ PLACEHOLDERS: User needs to replace these with their actual Supabase Project URL and Anon Key.
// We will store them in AsyncStorage for dynamic pairing, but provide fallbacks here if hardcoded.
export let SUPABASE_URL = 'https://clrmmppalwrdcqdqtqss.supabase.co';
export let SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNscm1tcHBhbHdyZGNxZHF0cXNzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODE1OTA4NDksImV4cCI6MjA5NzE2Njg0OX0.N9nCZYUZxqKI8BR4rlw38ESrdrLFvrakShzH9D-5WkA';

export let supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});

export const initSupabase = async (url: string, key: string) => {
  SUPABASE_URL = url;
  SUPABASE_ANON_KEY = key;
  supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: {
      storage: AsyncStorage,
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: false,
    },
  });
};
