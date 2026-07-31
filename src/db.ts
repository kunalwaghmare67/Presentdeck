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
  const blob = await getBlobFromUrl(item.url, item.blob);
  const db = await dbPromise;
  await db.put('photos', { id: item.id, blob, name: item.name } as any);
}

export async function loadPhotos(): Promise<MediaItem[]> {
  const db = await dbPromise;
  const items = await db.getAll('photos');
  return items.map(i => {
    const itemObj = i as any;
    const blob = itemObj.blob;
    const url = blob ? URL.createObjectURL(blob) : itemObj.data || '';
    return {
      id: i.id,
      url,
      type: 'image' as const,
      name: i.name,
      blob,
    };
  });
}

// Videos
export async function saveVideo(item: MediaItem) {
  const blob = await getBlobFromUrl(item.url, item.blob);
  const db = await dbPromise;
  await db.put('videos', { id: item.id, blob, name: item.name } as any);
}

export async function loadVideos(): Promise<MediaItem[]> {
  const db = await dbPromise;
  const items = await db.getAll('videos');
  return items.map(i => {
    const itemObj = i as any;
    const blob = itemObj.blob;
    const url = blob ? URL.createObjectURL(blob) : itemObj.data || '';
    return {
      id: i.id,
      url,
      type: 'video' as const,
      name: i.name,
      blob,
    };
  });
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
  const prepared = await Promise.all(
    photos.map(async p => ({
      id: p.id,
      blob: await getBlobFromUrl(p.url, p.blob),
      name: p.name,
    }))
  );
  const db = await dbPromise;
  const tx = db.transaction('photos', 'readwrite');
  await tx.store.clear();
  for (const item of prepared) {
    await tx.store.put(item as any);
  }
  await tx.done;
}

export async function syncVideos(videos: MediaItem[]) {
  const prepared = await Promise.all(
    videos.map(async v => ({
      id: v.id,
      blob: await getBlobFromUrl(v.url, v.blob),
      name: v.name,
    }))
  );
  const db = await dbPromise;
  const tx = db.transaction('videos', 'readwrite');
  await tx.store.clear();
  for (const item of prepared) {
    await tx.store.put(item as any);
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
  try {
    const cleanedJson = JSON.parse(
      JSON.stringify(state, (key, value) => {
        if (key === 'blob' || (value && typeof value === 'object' && value.constructor && value.constructor.name === 'Blob')) {
          return undefined;
        }
        return value;
      })
    );
    return cleanedJson;
  } catch (err) {
    console.error('prepareStateForCloud serialization error:', err);
    return {};
  }
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
    if (error) {
      console.error('Supabase save error:', error.message);
    } else {
      console.log(`Successfully synced workflow "${workflow.name}" to Supabase Cloud.`);
    }
  } catch (err) {
    console.error('Supabase workflow save failed:', err);
  }
}

export async function loadWorkflowsFromDB(currentUser?: AuthSession | null): Promise<SavedWorkflow[]> {
  if (!currentUser) {
    return [];
  }

  const db = await dbPromise;

  // 1. Fetch cloud workflows from Supabase
  let cloudWorkflows: SavedWorkflow[] = [];
  try {
    let query = supabase.from('workflows').select('*').order('saved_at', { ascending: false });
    if (currentUser.role !== 'master') {
      query = query.eq('username', currentUser.username);
    }
    const { data, error } = await query;
    if (error) {
      console.error('Supabase load error:', error.message);
    } else if (data && data.length > 0) {
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

  // 2. Fetch local workflows from IndexedDB
  const localList = await db.getAll('workflows');
  let localFiltered = localList;
  if (currentUser.role !== 'master') {
    localFiltered = localList.filter(w => !w.username || w.username === currentUser.username);
  }

  // 3. Auto-sync any local workflows missing from Cloud up to Supabase
  const cloudIdSet = new Set(cloudWorkflows.map(w => w.id));
  for (const localWf of localFiltered) {
    if (!cloudIdSet.has(localWf.id)) {
      try {
        const cloudState = await prepareStateForCloud(localWf.state);
        const { error } = await supabase.from('workflows').upsert({
          id: localWf.id,
          name: localWf.name,
          username: localWf.username || currentUser.username,
          saved_at: localWf.savedAt,
          state: cloudState,
        });
        if (!error) {
          cloudWorkflows.push(localWf);
        }
      } catch (e) {
        console.error('Failed auto-syncing local workflow to cloud:', e);
      }
    }
  }

  // 4. Merge Cloud + Local workflows by ID
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
