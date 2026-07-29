import { openDB, type DBSchema } from 'idb';
import type { SlideItem, Deck, AudioTrack, MediaItem, SavedWorkflow, AuthSession } from './types';
import { supabase } from './supabase';

interface PresentDeckDB extends DBSchema {
  decks: {
    key: string;
    value: {
      id: string;
      title: string;
      order: number;
      slides: { id: string; blob: Blob; pageNum: number; isKey?: boolean; order: number }[];
    };
  };
  slides: { key: string; value: { id: string; blob: Blob; pageNum: number; isKey?: boolean; order: number } };
  audio: { key: string; value: { id: string; name: string; blob: Blob; order: number } };
  photos: { key: string; value: { id: string; data: string; name: string } };
  videos: { key: string; value: { id: string; data: string; name: string } };
  workflows: { key: string; value: SavedWorkflow };
}

const dbPromise = openDB<PresentDeckDB>('presentdeck-db', 6, {
  upgrade(db) {
    if (!db.objectStoreNames.contains('decks')) db.createObjectStore('decks', { keyPath: 'id' });
    if (!db.objectStoreNames.contains('slides')) db.createObjectStore('slides', { keyPath: 'id' });
    if (!db.objectStoreNames.contains('audio')) db.createObjectStore('audio', { keyPath: 'id' });
    if (!db.objectStoreNames.contains('photos')) db.createObjectStore('photos', { keyPath: 'id' });
    if (!db.objectStoreNames.contains('videos')) db.createObjectStore('videos', { keyPath: 'id' });
    if (!db.objectStoreNames.contains('workflows')) db.createObjectStore('workflows', { keyPath: 'id' });
  },
});

async function getBlobFromUrl(url: string, existingBlob?: Blob): Promise<Blob> {
  if (existingBlob) return existingBlob;
  if (url.startsWith('data:') || url.startsWith('blob:')) {
    const res = await fetch(url);
    return await res.blob();
  }
  const res = await fetch(url);
  return await res.blob();
}

// Multi-deck Persistence
export async function saveDecks(decks: Deck[]) {
  const preparedDecks = await Promise.all(
    decks.map(async (deck, deckIdx) => {
      const preparedSlides = await Promise.all(
        deck.slides.map(async (s, sIdx) => {
          const blob = await getBlobFromUrl(s.url, s.blob);
          return {
            id: s.id,
            blob,
            pageNum: s.pageNum,
            isKey: !!s.isKey,
            order: sIdx,
          };
        })
      );
      return {
        id: deck.id,
        title: deck.title,
        order: deckIdx,
        slides: preparedSlides,
      };
    })
  );

  const db = await dbPromise;
  const tx = db.transaction('decks', 'readwrite');
  await tx.store.clear();
  for (const d of preparedDecks) {
    await tx.store.put(d);
  }
  await tx.done;
}

export async function loadDecks(): Promise<Deck[]> {
  const db = await dbPromise;
  const items = await db.getAll('decks');
  items.sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  return items.map(d => ({
    id: d.id,
    title: d.title,
    slides: d.slides.map(s => ({
      id: s.id,
      url: URL.createObjectURL(s.blob),
      blob: s.blob,
      pageNum: s.pageNum,
      isKey: !!s.isKey,
    })),
  }));
}

// Legacy single-deck fallback
export async function saveSlides(slides: SlideItem[]) {
  const preparedItems = await Promise.all(
    slides.map(async (s, i) => {
      const blob = await getBlobFromUrl(s.url, s.blob);
      return {
        id: s.id,
        blob,
        pageNum: s.pageNum,
        isKey: !!s.isKey,
        order: i,
      };
    })
  );

  const db = await dbPromise;
  const tx = db.transaction('slides', 'readwrite');
  await tx.store.clear();
  for (const item of preparedItems) {
    await tx.store.put(item);
  }
  await tx.done;
}

export async function loadSlides(): Promise<SlideItem[]> {
  const db = await dbPromise;
  const items = await db.getAll('slides');
  items.sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  return items.map(i => ({
    id: i.id,
    url: URL.createObjectURL(i.blob),
    blob: i.blob,
    pageNum: i.pageNum,
    isKey: !!i.isKey,
  }));
}

// Audio
export async function saveAudioTracks(tracks: AudioTrack[]) {
  const preparedItems = await Promise.all(
    tracks.map(async (t, i) => {
      const blob = await getBlobFromUrl(t.url, t.blob);
      return {
        id: t.id,
        name: t.name,
        blob,
        order: i,
      };
    })
  );

  const db = await dbPromise;
  const tx = db.transaction('audio', 'readwrite');
  await tx.store.clear();
  for (const item of preparedItems) {
    await tx.store.put(item);
  }
  await tx.done;
}

export async function loadAudioTracks(): Promise<AudioTrack[]> {
  const db = await dbPromise;
  const items = await db.getAll('audio');
  items.sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  return items.map(i => ({
    id: i.id,
    name: i.name,
    url: URL.createObjectURL(i.blob),
    blob: i.blob,
  }));
}

// Photos
export async function savePhoto(item: MediaItem) {
  const db = await dbPromise;
  await db.put('photos', { id: item.id, data: item.url, name: item.name });
}

export async function loadPhotos(): Promise<MediaItem[]> {
  const db = await dbPromise;
  const items = await db.getAll('photos');
  return items.map(i => ({
    id: i.id,
    url: i.data,
    type: 'image' as const,
    name: i.name,
  }));
}

// Videos
export async function saveVideo(item: MediaItem) {
  const db = await dbPromise;
  await db.put('videos', { id: item.id, data: item.url, name: item.name });
}

export async function loadVideos(): Promise<MediaItem[]> {
  const db = await dbPromise;
  const items = await db.getAll('videos');
  return items.map(i => ({
    id: i.id,
    url: i.data,
    type: 'video' as const,
    name: i.name,
  }));
}

export async function deletePhoto(id: string) {
  const db = await dbPromise;
  await db.delete('photos', id);
}

export async function deleteVideo(id: string) {
  const db = await dbPromise;
  await db.delete('videos', id);
}

export async function syncPhotos(photos: MediaItem[]) {
  const db = await dbPromise;
  const tx = db.transaction('photos', 'readwrite');
  await tx.store.clear();
  for (const item of photos) {
    await tx.store.put({ id: item.id, data: item.url, name: item.name });
  }
  await tx.done;
}

export async function syncVideos(videos: MediaItem[]) {
  const db = await dbPromise;
  const tx = db.transaction('videos', 'readwrite');
  await tx.store.clear();
  for (const item of videos) {
    await tx.store.put({ id: item.id, data: item.url, name: item.name });
  }
  await tx.done;
}

export async function clearAll() {
  const db = await dbPromise;
  await db.clear('decks');
  await db.clear('slides');
  await db.clear('audio');
  await db.clear('photos');
  await db.clear('videos');
}

async function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

async function prepareStateForCloud(state: any): Promise<any> {
  if (!state) return {};

  const truncateDataUrl = (dataUrl?: string) => {
    if (!dataUrl) return undefined;
    if (dataUrl.startsWith('data:') && dataUrl.length > 512 * 1024) {
      return undefined;
    }
    return dataUrl;
  };

  const cleanedDecks = (state.decks || []).map((d: any) => ({
    ...d,
    slides: (d.slides || []).map((s: any) => {
      const { blob, ...rest } = s;
      return { ...rest, dataUrl: truncateDataUrl(s.dataUrl) };
    }),
  }));

  const cleanedAudio = (state.audioTracks || []).map((t: any) => {
    const { blob, ...rest } = t;
    return { ...rest, dataUrl: truncateDataUrl(t.dataUrl) };
  });

  const cleanedPhotos = (state.photos || []).map((p: any) => {
    const { blob, ...rest } = p;
    return { ...rest, dataUrl: truncateDataUrl(p.dataUrl) };
  });

  const cleanedVideos = (state.videos || []).map((v: any) => {
    const { blob, ...rest } = v;
    return { ...rest, dataUrl: truncateDataUrl(v.dataUrl) };
  });

  return {
    ...state,
    decks: cleanedDecks,
    audioTracks: cleanedAudio,
    photos: cleanedPhotos,
    videos: cleanedVideos,
  };
}

// Workflows
export async function saveWorkflowToDB(workflow: SavedWorkflow) {
  const db = await dbPromise;
  await db.put('workflows', workflow);

  // Cloud sync to Supabase
  try {
    const cloudState = await prepareStateForCloud(workflow.state);
    const { error } = await supabase.from('workflows').upsert({
      id: workflow.id,
      name: workflow.name,
      username: workflow.username || 'anonymous',
      saved_at: workflow.savedAt,
      state: cloudState,
    });
    if (error) console.error('Supabase save error:', error.message);
  } catch (err) {
    console.error('Supabase workflow save failed:', err);
  }
}

export async function loadWorkflowsFromDB(currentUser?: AuthSession | null): Promise<SavedWorkflow[]> {
  if (!currentUser) {
    return [];
  }

  // 1. Fetch local workflows from IndexedDB
  const db = await dbPromise;
  const localList = await db.getAll('workflows');
  let localFiltered = localList;
  if (currentUser.role !== 'master') {
    localFiltered = localList.filter(w => !w.username || w.username === currentUser.username);
  }

  // 2. Fetch cloud workflows from Supabase
  let cloudWorkflows: SavedWorkflow[] = [];
  try {
    let query = supabase.from('workflows').select('*').order('saved_at', { ascending: false });
    if (currentUser.role !== 'master') {
      query = query.eq('username', currentUser.username);
    }
    const { data, error } = await query;
    if (error) {
      console.error('Supabase load error:', error.message);
    } else if (data) {
      cloudWorkflows = data.map((row: any) => ({
        id: row.id,
        name: row.name,
        savedAt: row.saved_at || row.savedAt,
        username: row.username,
        state: row.state,
      }));
    }
  } catch (err) {
    console.warn('Could not fetch workflows from Supabase:', err);
  }

  // 3. Merge Cloud + Local workflows by ID
  const workflowMap = new Map<string, SavedWorkflow>();

  for (const wf of localFiltered) {
    workflowMap.set(wf.id, wf);
  }

  for (const wf of cloudWorkflows) {
    const existing = workflowMap.get(wf.id);
    if (!existing || new Date(wf.savedAt).getTime() >= new Date(existing.savedAt).getTime()) {
      workflowMap.set(wf.id, wf);
      await db.put('workflows', wf);
    }
  }

  const mergedList = Array.from(workflowMap.values());
  return mergedList.sort((a, b) => new Date(b.savedAt).getTime() - new Date(a.savedAt).getTime());
}

export async function deleteWorkflowFromDB(id: string) {
  const db = await dbPromise;
  await db.delete('workflows', id);

  try {
    await supabase.from('workflows').delete().eq('id', id);
  } catch (err) {
    console.error('Supabase delete error:', err);
  }
}

export async function renameWorkflowInDB(id: string, newName: string) {
  const db = await dbPromise;
  const wf = await db.get('workflows', id);
  if (wf) {
    wf.name = newName;
    await db.put('workflows', wf);
  }

  try {
    await supabase.from('workflows').update({ name: newName }).eq('id', id);
  } catch (err) {
    console.error('Supabase rename error:', err);
  }
}
