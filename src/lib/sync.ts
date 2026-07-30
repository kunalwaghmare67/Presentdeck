import { supabase } from './supabase';
import type { Deck, SlideItem, AudioTrack, MediaItem } from '../types';
import { saveDecks, saveAudioTracks, syncPhotos, syncVideos } from '../db';

const BUCKET = 'presentdeck-media';

/**
 * Generate a 6-character human-friendly alphanumeric workspace code
 * Excludes ambiguous characters: 0, O, 1, I, l
 */
export function generateWorkspaceCode(): string {
  const chars = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

/**
 * Ensure workspace code exists in Supabase workspaces table
 */
export async function ensureWorkspace(workspaceCode: string): Promise<boolean> {
  if (!workspaceCode) return false;
  try {
    const { error } = await supabase
      .from('workspaces')
      .upsert({ code: workspaceCode.toUpperCase() });
    if (error) {
      console.error('Failed to ensure workspace code:', error.message);
      return false;
    }
    return true;
  } catch (err) {
    console.error('ensureWorkspace exception:', err);
    return false;
  }
}

/**
 * Upload a media blob/file to Supabase Storage under {workspaceCode}/{uuid}-{filename}
 */
export async function uploadMediaToStorage(workspaceCode: string, blob: Blob | File, filename: string): Promise<string> {
  const cleanName = filename.replace(/[^a-zA-Z0-9._-]/g, '_');
  const path = `${workspaceCode.toUpperCase()}/${crypto.randomUUID()}-${cleanName}`;
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
 * Get display URL for a storage_path
 */
export async function getStorageUrl(storagePath: string): Promise<string> {
  if (!storagePath) return '';
  if (storagePath.startsWith('http://') || storagePath.startsWith('https://') || storagePath.startsWith('blob:')) {
    return storagePath;
  }
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(storagePath, 60 * 60 * 24);
  if (!error && data?.signedUrl) {
    return data.signedUrl;
  }
  const { data: pubData } = supabase.storage.from(BUCKET).getPublicUrl(storagePath);
  return pubData.publicUrl;
}

/**
 * Hydrate Zustand store & local IndexedDB cache from Supabase for a given workspaceCode
 */
export async function hydrateFromSupabase(workspaceCode: string, useStore: any): Promise<void> {
  if (!workspaceCode) return;
  const code = workspaceCode.toUpperCase();

  try {
    await ensureWorkspace(code);

    const { data: dbDecks } = await supabase
      .from('decks')
      .select('*')
      .eq('workspace_code', code)
      .order('order_index', { ascending: true });

    const { data: dbSlides } = await supabase
      .from('slides')
      .select('*')
      .eq('workspace_code', code)
      .order('order_index', { ascending: true });

    const { data: dbTracks } = await supabase
      .from('tracks')
      .select('*')
      .eq('workspace_code', code)
      .order('order_index', { ascending: true });

    const { data: dbMedia } = await supabase
      .from('media_assets')
      .select('*')
      .eq('workspace_code', code)
      .order('order_index', { ascending: true });

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

    const tracksList = dbTracks || [];
    const restoredTracks: AudioTrack[] = await Promise.all(
      tracksList.map(async (t: any) => ({
        id: t.id,
        name: t.title,
        url: await getStorageUrl(t.storage_path),
      }))
    );

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

    await saveDecks(restoredDecks);
    await saveAudioTracks(restoredTracks);
    await syncPhotos(restoredPhotos);
    await syncVideos(restoredVideos);
  } catch (err) {
    console.error('Failed to hydrate workspace from Supabase:', err);
  }
}

// ----------------------------------------------------
// Write-Through Mutation Helpers (Row update + Storage)
// ----------------------------------------------------

export async function syncDeckUpsert(workspaceCode: string, deckId: string, name: string, orderIndex: number) {
  try {
    const code = workspaceCode.toUpperCase();
    await ensureWorkspace(code);
    await supabase.from('decks').upsert({
      id: deckId,
      workspace_code: code,
      name,
      order_index: orderIndex,
      updated_at: new Date().toISOString(),
    });
  } catch (err) {
    console.error('syncDeckUpsert error:', err);
  }
}

export async function syncDeckDelete(workspaceCode: string, deckId: string) {
  try {
    await supabase.from('decks').delete().eq('id', deckId).eq('workspace_code', workspaceCode.toUpperCase());
  } catch (err) {
    console.error('syncDeckDelete error:', err);
  }
}

export async function syncSlideUpsert(
  workspaceCode: string,
  slideId: string,
  deckId: string,
  storagePath: string,
  orderIndex: number,
  isKey: boolean
) {
  try {
    const code = workspaceCode.toUpperCase();
    await ensureWorkspace(code);
    await supabase.from('slides').upsert({
      id: slideId,
      deck_id: deckId,
      workspace_code: code,
      storage_path: storagePath,
      order_index: orderIndex,
      is_key: isKey,
      updated_at: new Date().toISOString(),
    });
  } catch (err) {
    console.error('syncSlideUpsert error:', err);
  }
}

export async function syncSlideDelete(workspaceCode: string, slideId: string) {
  try {
    await supabase.from('slides').delete().eq('id', slideId).eq('workspace_code', workspaceCode.toUpperCase());
  } catch (err) {
    console.error('syncSlideDelete error:', err);
  }
}

export async function syncTrackUpsert(workspaceCode: string, trackId: string, title: string, storagePath: string, orderIndex: number) {
  try {
    const code = workspaceCode.toUpperCase();
    await ensureWorkspace(code);
    await supabase.from('tracks').upsert({
      id: trackId,
      workspace_code: code,
      title,
      storage_path: storagePath,
      order_index: orderIndex,
      updated_at: new Date().toISOString(),
    });
  } catch (err) {
    console.error('syncTrackUpsert error:', err);
  }
}

export async function syncTrackDelete(workspaceCode: string, trackId: string) {
  try {
    await supabase.from('tracks').delete().eq('id', trackId).eq('workspace_code', workspaceCode.toUpperCase());
  } catch (err) {
    console.error('syncTrackDelete error:', err);
  }
}

export async function syncMediaAssetUpsert(workspaceCode: string, assetId: string, type: 'photo' | 'video', storagePath: string, orderIndex: number) {
  try {
    const code = workspaceCode.toUpperCase();
    await ensureWorkspace(code);
    await supabase.from('media_assets').upsert({
      id: assetId,
      workspace_code: code,
      type,
      storage_path: storagePath,
      order_index: orderIndex,
      updated_at: new Date().toISOString(),
    });
  } catch (err) {
    console.error('syncMediaAssetUpsert error:', err);
  }
}

export async function syncMediaAssetDelete(workspaceCode: string, assetId: string) {
  try {
    await supabase.from('media_assets').delete().eq('id', assetId).eq('workspace_code', workspaceCode.toUpperCase());
  } catch (err) {
    console.error('syncMediaAssetDelete error:', err);
  }
}
