import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://dkzexlpmrigmngeekdta.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRremV4bHBtcmlnbW5nZWVrZHRhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODUyNDYzMjcsImV4cCI6MjEwMDgyMjMyN30.TWklBapZCr3xcTjQ_Q95zv8D9UlVKxJmYANgnzplt88';

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

async function testTables() {
  console.log('--- TESTING WORKSPACES TABLE ---');
  const wsRes = await supabase.from('workspaces').select('*');
  console.log('Workspaces Select -> Data:', wsRes.data, 'Error:', wsRes.error);

  console.log('--- TESTING DECKS TABLE ---');
  const decksRes = await supabase.from('decks').select('*');
  console.log('Decks Select -> Data:', decksRes.data, 'Error:', decksRes.error);

  console.log('--- TESTING SLIDES TABLE ---');
  const slidesRes = await supabase.from('slides').select('*');
  console.log('Slides Select -> Data:', slidesRes.data, 'Error:', slidesRes.error);

  console.log('--- TESTING TRACKS TABLE ---');
  const tracksRes = await supabase.from('tracks').select('*');
  console.log('Tracks Select -> Data:', tracksRes.data, 'Error:', tracksRes.error);

  console.log('--- TESTING MEDIA ASSETS TABLE ---');
  const mediaRes = await supabase.from('media_assets').select('*');
  console.log('Media Assets Select -> Data:', mediaRes.data, 'Error:', mediaRes.error);
}

testTables();
