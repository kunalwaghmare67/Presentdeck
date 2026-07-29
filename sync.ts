import { supabase } from './supabase';
import type { Deck, SlideItem, AudioTrack, MediaItem } from '../types';
import { saveDecks, saveSlides, saveAudioTracks, syncPhotos, syncVideos } from '../db';

const BUCKET = 'presentdeck-media';

/**
 * Upload a media blob/file to Supabase Storage under {userId}/{uuid}-{filename}
 * Returns the storage_path string.
 */
export async function uploadMediaToStorage(userId: string, blob: Blob | File, filename: string): Promise<string> {
  const cleanName = filename.replace(/[^a-zA-Z0-9._-]/g, '_');
  const path = `${userId}/${crypto.randomUUID()}-${cleanName}`;
  const { data, error } = await supabase.storage.from(BUCKET).upload(path, blob, {
    upsert: true,
    contentType: blob.type || 'application/octet-stream',
  });
  if (error) {
    console.error('Supabase Storage upload error:', error.message);
    throw error;
  }
  return data.path;
}

/**
 * Get display URL for a storage_path (creates a signed URL valid for 24h, or public URL)
 */
export async function getStorageUrl(storagePath: string): Promise<string> {
  if (!storagePath) return '';
  if (storagePath.startsWith('http://') || storagePath.startsWith('https://') || storagePath.startsWith('blob:')) {
    return storagePath;
  }
  // Try getting signed URL first
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(storagePath, 60 * 60 * 24);
  if (!error && data?.signedUrl) {
    return data.signedUrl;
  }
  // Fallback to public URL
  const { data: pubData } = supabase.storage.from(BUCKET).getPublicUrl(storagePath);
  return pubData.publicUrl;
}

/**
 * Fetch all user cloud data from Postgres, generate signed URLs, and hydrate Zustand + IndexedDB
 */
export async function hydrateFromSupabase(userId: string, useStore: any): Promise<void> {
  try {
    // 1. Fetch decks
    const { data: dbDecks, error: decksErr } = await supabase
      .from('decks')
      .select('*')
      .eq('user_id', userId)
      .order('order_index', { ascending: true });

    if (decksErr) console.error('Error fetching decks:', decksErr.message);

    // 2. Fetch slides
    const { data: dbSlides, error: slidesErr } = await supabase
      .from('slides')
      .select('*')
      .eq('user_id', userId)
      .order('order_index', { ascending: true });

    if (slidesErr) console.error('Error fetching slides:', slidesErr.message);

    // 3. Fetch tracks
    const { data: dbTracks, error: tracksErr } = await supabase
      .from('tracks')
      .select('*')
      .eq('user_id', userId)
      .order('order_index', { ascending: true });

    if (tracksErr) console.error('Error fetching tracks:', tracksErr.message);

    // 4. Fetch media assets
    const { data: dbMedia, error: mediaErr } = await supabase
      .from('media_assets')
      .select('*')
      .eq('user_id', userId)
      .order('order_index', { ascending: true });

    if (mediaErr) console.error('Error fetching media:', mediaErr.message);

    // Process Decks & Slides
    const decksList = dbDecks || [];
    const slidesList = dbSlides || [];

    const restoredDecks: Deck[] = await Promise.all(
      decksList.map(async (d: any) => {
        const deckSlides = slidesList.filter((s: any) => s.deck_id === d.id);
        const resolvedSlides: SlideItem[] = await Promise.all(
          deckSlides.map(async (s: any, idx: number) => ({
            id: s.id,
            url: await getStorageUrl(s.storage_path),
            pageNum: idx + 1,
            isKey: !!s.is_key,
            mediaType: s.storage_path.includes('.mp4') || s.storage_path.includes('.webm') ? 'video' : 'image',
          }))
        );
        return {
          id: d.id,
          title: d.name,
          slides: resolvedSlides,
        };
      })
    );

    // Process Audio Tracks
    const tracksList = dbTracks || [];
    const restoredTracks: AudioTrack[] = await Promise.all(
      tracksList.map(async (t: any) => ({
        id: t.id,
        name: t.title,
        url: await getStorageUrl(t.storage_path),
      }))
    );

    // Process Photos & Videos
    const mediaList = dbMedia || [];
    const restoredPhotos: MediaItem[] = [];
    const restoredVideos: MediaItem[] = [];

    await Promise.all(
      mediaList.map(async (m: any) => {
        const url = await getStorageUrl(m.storage_path);
        const item: MediaItem = {
          id: m.id,
          name: m.storage_path.split('-').slice(1).join('-') || m.type,
          type: m.type as 'image' | 'video',
          url,
        };
        if (m.type === 'photo') {
          restoredPhotos.push(item);
        } else {
          restoredVideos.push(item);
        }
      })
    );

    // Hydrate Zustand Store
    const state = useStore.getState();
    const activeDeck = restoredDecks[0];
    state.setDecks(restoredDecks);
    if (activeDeck) {
      state.setActiveDeckId(activeDeck.id);
      state.setSlides(activeDeck.slides);
    }
    state.setAudioTracks(restoredTracks);
    state.setPhotos(restoredPhotos);
    state.setVideos(restoredVideos);

    // Populate local IndexedDB cache for offline buffer
    await saveDecks(restoredDecks);
    await saveAudioTracks(restoredTracks);
    await syncPhotos(restoredPhotos);
    await syncVideos(restoredVideos);
  } catch (err) {
    console.error('Failed to hydrate from Supabase:', err);
  }
}

// ----------------------------------------------------
// Write-Through Mutation Helpers (Row update + Storage)
// ----------------------------------------------------

export async function syncDeckUpsert(userId: string, deckId: string, name: string, orderIndex: number) {
  try {
    await supabase.from('decks').upsert({
      id: deckId,
      user_id: userId,
      name,
      order_index: orderIndex,
      updated_at: new Date().toISOString(),
    });
  } catch (err) {
    console.error('syncDeckUpsert error:', err);
  }
}

export async function syncDeckDelete(userId: string, deckId: string) {
  try {
    await supabase.from('decks').delete().eq('id', deckId).eq('user_id', userId);
  } catch (err) {
    console.error('syncDeckDelete error:', err);
  }
}

export async function syncSlideUpsert(
  userId: string,
  slideId: string,
  deckId: string,
  storagePath: string,
  orderIndex: number,
  isKey: boolean
) {
  try {
    await supabase.from('slides').upsert({
      id: slideId,
      deck_id: deckId,
      user_id: userId,
      storage_path: storagePath,
      order_index: orderIndex,
      is_key: isKey,
      updated_at: new Date().toISOString(),
    });
  } catch (err) {
    console.error('syncSlideUpsert error:', err);
  }
}

export async function syncSlideDelete(userId: string, slideId: string) {
  try {
    await supabase.from('slides').delete().eq('id', slideId).eq('user_id', userId);
  } catch (err) {
    console.error('syncSlideDelete error:', err);
  }
}

export async function syncTrackUpsert(userId: string, trackId: string, title: string, storagePath: string, orderIndex: number) {
  try {
    await supabase.from('tracks').upsert({
      id: trackId,
      user_id: userId,
      title,
      storage_path: storagePath,
      order_index: orderIndex,
      updated_at: new Date().toISOString(),
    });
  } catch (err) {
    console.error('syncTrackUpsert error:', err);
  }
}

export async function syncTrackDelete(userId: string, trackId: string) {
  try {
    await supabase.from('tracks').delete().eq('id', trackId).eq('user_id', userId);
  } catch (err) {
    console.error('syncTrackDelete error:', err);
  }
}

export async function syncMediaAssetUpsert(userId: string, assetId: string, type: 'photo' | 'video', storagePath: string, orderIndex: number) {
  try {
    await supabase.from('media_assets').upsert({
      id: assetId,
      user_id: userId,
      type,
      storage_path: storagePath,
      order_index: orderIndex,
      updated_at: new Date().toISOString(),
    });
  } catch (err) {
    console.error('syncMediaAssetUpsert error:', err);
  }
}

export async function syncMediaAssetDelete(userId: string, assetId: string) {
  try {
    await supabase.from('media_assets').delete().eq('id', assetId).eq('user_id', userId);
  } catch (err) {
    console.error('syncMediaAssetDelete error:', err);
  }
}
