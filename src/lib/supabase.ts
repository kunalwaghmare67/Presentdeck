import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://dkzexlpmrigmngeekdta.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRremV4bHBtcmlnbW5nZWVrZHRhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODUyNDYzMjcsImV4cCI6MjEwMDgyMjMyN30.TWklBapZCr3xcTjQ_Q95zv8D9UlVKxJmYANgnzplt88';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
});
