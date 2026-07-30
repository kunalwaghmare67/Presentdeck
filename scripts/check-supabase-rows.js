import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://dkzexlpmrigmngeekdta.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRremV4bHBtcmlnbW5nZWVrZHRhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODUyNDYzMjcsImV4cCI6MjEwMDgyMjMyN30.TWklBapZCr3xcTjQ_Q95zv8D9UlVKxJmYANgnzplt88';

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

async function checkRows() {
  const { data, error } = await supabase.from('workflows').select('*');
  console.log('--- SUPABASE WORKFLOWS TABLE ROWS ---');
  console.log('Error:', error);
  console.log('Total Count:', data?.length);
  if (data) {
    data.forEach(r => {
      console.log(`ID: ${r.id} | Name: "${r.name}" | Username: "${r.username}" | SavedAt: ${r.saved_at}`);
    });
  }
}

checkRows();
