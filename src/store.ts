import { create } from 'zustand';
import type { SlideItem, Deck, AudioTrack, MediaItem, LiveContent, SavedWorkflow, WorkflowDeck, WorkflowAudioTrack, WorkflowMediaItem, AuthSession } from './types';
import { saveSlides, saveDecks, syncPhotos, syncVideos, saveAudioTracks, saveWorkflowToDB, loadWorkflowsFromDB, deleteWorkflowFromDB, renameWorkflowInDB } from './db';
import { authenticateUser } from './config/authConfig';
import {
  syncDeckUpsert,
  syncDeckDelete,
  syncSlideUpsert,
  syncTrackUpsert,
  syncMediaAssetUpsert,
} from './lib/sync';

function getWorkspaceCode(): string | null {
  try {
    return localStorage.getItem('presentdeck_workspace_code') || null;
  } catch {
    return null;
  }
}

interface AppState {
  decks: Deck[];
  activeDeckId: string | null;
  slides: SlideItem[];
  currentSlideIndex: number;
  selectedSlideId: string | null;
  selectedSlideIds: string[];
  copiedSlide: SlideItem | null;
  undoHistory: SlideItem[][];
  keyOnly: boolean;

  audioTracks: AudioTrack[];
  playingTrackId: string | null;
  selectedAudioId: string | null;
  selectedAudioIds: string[];
  copiedAudioTracks: AudioTrack[] | null;
  audioUndoHistory: AudioTrack[][];

  photos: MediaItem[];
  videos: MediaItem[];
  photoUndoHistory: MediaItem[][];
  videoUndoHistory: MediaItem[][];
  selectedMediaId: string | null;
  copiedMedia: MediaItem | null;
  liveContent: LiveContent;

  setDecks: (decks: Deck[]) => void;
  setActiveDeckId: (id: string) => void;
  addDeck: (title: string, newSlides: SlideItem[]) => void;
  renameDeck: (id: string, newTitle: string) => void;
  deleteDeck: (id: string) => void;
  setSlides: (slides: SlideItem[]) => void;
  setSelectedSlideId: (id: string | null) => void;
  setSelectedSlideIds: (ids: string[]) => void;
  setSelectedAudioId: (id: string | null) => void;
  setSelectedAudioIds: (ids: string[]) => void;
  setSelectedMediaId: (id: string | null) => void;
  setCurrentSlideIndex: (index: number) => void;
  setKeyOnly: (v: boolean) => void;
  toggleKeySlide: (id?: string) => void;

  deleteSlide: (id?: string) => void;
  copySlide: (id?: string) => void;
  pasteSlide: (targetId?: string) => void;
  insertSlides: (newSlides: SlideItem[], targetIndex?: number) => void;
  undo: () => void;

  deleteAudioTrack: (id?: string) => void;
  copyAudioTrack: (id?: string) => void;
  pasteAudioTrack: (targetId?: string) => void;
  undoAudioTrack: () => void;

  copyMedia: (id?: string) => void;
  deletePhotoItem: (id: string) => void;
  deleteVideoItem: (id: string) => void;
  undoPhoto: () => void;
  undoVideo: () => void;

  setAudioTracks: (tracks: AudioTrack[]) => void;
  setPlayingTrackId: (id: string | null) => void;
  setPhotos: (photos: MediaItem[]) => void;
  setVideos: (videos: MediaItem[]) => void;
  setLiveContent: (content: LiveContent) => void;
  navigateSlide: (direction: 1 | -1) => void;

  workflows: SavedWorkflow[];
  setWorkflows: (workflows: SavedWorkflow[]) => void;
  saveCurrentWorkflow: (name: string) => Promise<SavedWorkflow>;
  loadWorkflowState: (workflow: SavedWorkflow) => Promise<void>;
  renameWorkflow: (id: string, newName: string) => Promise<void>;
  deleteWorkflow: (id: string) => Promise<void>;
  exportWorkflowFile: (workflow: SavedWorkflow) => void;
  importWorkflowFile: (file: File) => Promise<SavedWorkflow>;
  clearCurrentSession: () => Promise<void>;

  currentUser: AuthSession | null;
  login: (username: string, passwordAttempt: string) => Promise<boolean>;
  logout: () => void;
}

const channel = new BroadcastChannel('presentdeck-sync');

export const useStore = create<AppState>((set, get) => ({
  decks: [],
  activeDeckId: null,
  slides: [],
  currentSlideIndex: 0,
  selectedSlideId: null,
  selectedSlideIds: [],
  copiedSlide: null,
  undoHistory: [],
  photoUndoHistory: [],
  videoUndoHistory: [],
  keyOnly: false,

  audioTracks: [],
  playingTrackId: null,
  selectedAudioId: null,
  selectedAudioIds: [],
  copiedAudioTracks: null,
  audioUndoHistory: [],
  photos: [],
  videos: [],
  liveContent: { type: 'none', url: '' },

  setDecks: (decks) => {
    const topDeck = decks[0];
    if (topDeck) {
      set({ decks, activeDeckId: topDeck.id, slides: topDeck.slides });
      saveSlides(topDeck.slides).catch(console.error);
    } else {
      set({ decks });
    }
    saveDecks(decks).catch(console.error);

    const code = getWorkspaceCode();
    if (code) {
      decks.forEach((d, idx) => syncDeckUpsert(code, d.id, d.title, idx));
    }
  },

  setActiveDeckId: (id) => {
    const deck = get().decks.find(d => d.id === id);
    if (deck) {
      set({ activeDeckId: id, slides: deck.slides, selectedSlideId: null, selectedSlideIds: [] });
      saveSlides(deck.slides).catch(console.error);
    }
  },

  addDeck: (title, newSlides) => {
    const deckId = crypto.randomUUID();
    const newDeck: Deck = { id: deckId, title, slides: newSlides };
    const updatedDecks = [...get().decks, newDeck];
    set({ decks: updatedDecks, activeDeckId: deckId, slides: newSlides, selectedSlideId: null, selectedSlideIds: [] });
    saveDecks(updatedDecks).catch(console.error);
    saveSlides(newSlides).catch(console.error);

    const code = getWorkspaceCode();
    if (code) {
      syncDeckUpsert(code, newDeck.id, newDeck.title, updatedDecks.length - 1);
    }
  },

  renameDeck: (id, newTitle) => {
    const updatedDecks = get().decks.map(d => d.id === id ? { ...d, title: newTitle } : d);
    set({ decks: updatedDecks });
    saveDecks(updatedDecks).catch(console.error);

    const code = getWorkspaceCode();
    if (code) {
      const idx = updatedDecks.findIndex(x => x.id === id);
      if (idx >= 0) syncDeckUpsert(code, id, newTitle, idx);
    }
  },

  deleteDeck: (id) => {
    const updatedDecks = get().decks.filter(d => d.id !== id);
    let nextActiveId = get().activeDeckId;
    let nextSlides = get().slides;

    if (get().activeDeckId === id) {
      if (updatedDecks.length > 0) {
        nextActiveId = updatedDecks[0].id;
        nextSlides = updatedDecks[0].slides;
      } else {
        nextActiveId = null;
        nextSlides = [];
      }
    }

    set({ decks: updatedDecks, activeDeckId: nextActiveId, slides: nextSlides, selectedSlideId: null, selectedSlideIds: [] });
    saveDecks(updatedDecks).catch(console.error);
    saveSlides(nextSlides).catch(console.error);

    const code = getWorkspaceCode();
    if (code) {
      syncDeckDelete(code, id);
    }
  },

  setSlides: (slides) => {
    set({ slides });
    saveSlides(slides).catch(console.error);
    const { activeDeckId, decks } = get();
    if (activeDeckId) {
      const updatedDecks = decks.map(d => d.id === activeDeckId ? { ...d, slides } : d);
      set({ decks: updatedDecks });
      saveDecks(updatedDecks).catch(console.error);

      const code = getWorkspaceCode();
      if (code) {
        slides.forEach((s, idx) => syncSlideUpsert(code, s.id, activeDeckId, s.url, idx, !!s.isKey));
      }
    }
  },

  setSelectedSlideId: (selectedSlideId) => set({ selectedSlideId, selectedSlideIds: selectedSlideId ? [selectedSlideId] : [] }),
  setSelectedSlideIds: (selectedSlideIds) => set({ selectedSlideIds, selectedSlideId: selectedSlideIds.length ? selectedSlideIds[selectedSlideIds.length - 1] : null }),
  setCurrentSlideIndex: (currentSlideIndex) => set({ currentSlideIndex }),
  setKeyOnly: (keyOnly) => set({ keyOnly }),

  toggleKeySlide: (targetId) => {
    const { slides, selectedSlideIds, selectedSlideId, undoHistory } = get();
    let idsToToggle: string[] = [];
    if (targetId) {
      if (selectedSlideIds.length > 1 && selectedSlideIds.includes(targetId)) {
        idsToToggle = selectedSlideIds;
      } else {
        idsToToggle = [targetId];
      }
    } else if (selectedSlideIds.length > 0) {
      idsToToggle = selectedSlideIds;
    } else if (selectedSlideId) {
      idsToToggle = [selectedSlideId];
    }

    if (idsToToggle.length === 0) return;

    const targetSlides = slides.filter(s => idsToToggle.includes(s.id));
    const allStarred = targetSlides.every(s => s.isKey);

    const history = [...undoHistory, slides];

    const updated = slides.map(s => {
      if (idsToToggle.includes(s.id)) {
        return { ...s, isKey: !allStarred };
      }
      return s;
    });

    get().setSlides(updated);
    set({ undoHistory: history, selectedSlideIds: [], selectedSlideId: null });
  },

  deleteSlide: (idToDelete) => {
    const { slides, selectedSlideId, selectedSlideIds, undoHistory } = get();
    let idsToDelete: string[] = [];
    if (idToDelete) {
      if (selectedSlideIds.length > 1 && selectedSlideIds.includes(idToDelete)) {
        idsToDelete = selectedSlideIds;
      } else {
        idsToDelete = [idToDelete];
      }
    } else if (selectedSlideIds.length > 0) {
      idsToDelete = selectedSlideIds;
    } else if (selectedSlideId) {
      idsToDelete = [selectedSlideId];
    }

    if (idsToDelete.length === 0) return;

    const history = [...undoHistory, slides];
    const updated = slides.filter(s => !idsToDelete.includes(s.id));
    const reindexed = updated.map((s, i) => ({ ...s, pageNum: i + 1 }));

    set({
      undoHistory: history,
      selectedSlideId: null,
      selectedSlideIds: [],
    });
    get().setSlides(reindexed);
  },

  copySlide: (idToCopy) => {
    const targetId = idToCopy || get().selectedSlideId;
    if (!targetId) return;
    const slide = get().slides.find(s => s.id === targetId);
    if (slide) {
      set({ copiedSlide: slide });
    }
  },

  pasteSlide: (targetId) => {
    const { copiedSlide, slides, selectedSlideId, undoHistory } = get();
    if (!copiedSlide) return;

    const pasteAfterId = targetId || selectedSlideId;
    const history = [...undoHistory, slides];

    const newSlide: SlideItem = {
      ...copiedSlide,
      id: crypto.randomUUID(),
    };

    let updated: SlideItem[];
    if (pasteAfterId) {
      const idx = slides.findIndex(s => s.id === pasteAfterId);
      if (idx >= 0) {
        updated = [...slides.slice(0, idx + 1), newSlide, ...slides.slice(idx + 1)];
      } else {
        updated = [...slides, newSlide];
      }
    } else {
      updated = [...slides, newSlide];
    }

    const reindexed = updated.map((s, i) => ({ ...s, pageNum: i + 1 }));

    set({
      undoHistory: history,
      selectedSlideId: newSlide.id,
    });
    get().setSlides(reindexed);
  },

  insertSlides: (newSlides, targetIndex) => {
    const { slides, undoHistory } = get();
    if (!newSlides.length) return;
    const history = [...undoHistory, slides];

    let updated: SlideItem[];
    if (typeof targetIndex === 'number' && targetIndex >= 0 && targetIndex <= slides.length) {
      updated = [...slides.slice(0, targetIndex), ...newSlides, ...slides.slice(targetIndex)];
    } else {
      updated = [...slides, ...newSlides];
    }

    const reindexed = updated.map((s, i) => ({ ...s, pageNum: i + 1 }));
    set({
      undoHistory: history,
      selectedSlideId: newSlides[newSlides.length - 1].id,
      selectedSlideIds: newSlides.map(s => s.id),
    });
    get().setSlides(reindexed);
  },

  undo: () => {
    const history = get().undoHistory;
    if (history.length === 0) return;
    const previousSlides = history[history.length - 1];
    const newHistory = history.slice(0, -1);

    set({ undoHistory: newHistory, selectedSlideId: null, selectedSlideIds: [] });
    get().setSlides(previousSlides);
  },

  setSelectedAudioId: (selectedAudioId) => set({ selectedAudioId, selectedAudioIds: selectedAudioId ? [selectedAudioId] : [] }),
  setSelectedAudioIds: (selectedAudioIds) => set({ selectedAudioIds, selectedAudioId: selectedAudioIds.length ? selectedAudioIds[selectedAudioIds.length - 1] : null }),

  deleteAudioTrack: (idToDelete) => {
    const { audioTracks, selectedAudioId, selectedAudioIds, audioUndoHistory } = get();
    let idsToDelete: string[] = [];
    if (idToDelete) {
      if (selectedAudioIds.length > 1 && selectedAudioIds.includes(idToDelete)) {
        idsToDelete = selectedAudioIds;
      } else {
        idsToDelete = [idToDelete];
      }
    } else if (selectedAudioIds.length > 0) {
      idsToDelete = selectedAudioIds;
    } else if (selectedAudioId) {
      idsToDelete = [selectedAudioId];
    }

    if (idsToDelete.length === 0) return;

    const history = [...audioUndoHistory, audioTracks];
    const updated = audioTracks.filter(t => !idsToDelete.includes(t.id));

    set({
      audioUndoHistory: history,
      audioTracks: updated,
      selectedAudioId: null,
      selectedAudioIds: [],
    });
    saveAudioTracks(updated).catch(console.error);
  },

  copyAudioTrack: (idToCopy) => {
    const { audioTracks, selectedAudioId, selectedAudioIds } = get();
    let idsToCopy: string[] = [];
    if (idToCopy) {
      if (selectedAudioIds.length > 1 && selectedAudioIds.includes(idToCopy)) {
        idsToCopy = selectedAudioIds;
      } else {
        idsToCopy = [idToCopy];
      }
    } else if (selectedAudioIds.length > 0) {
      idsToCopy = selectedAudioIds;
    } else if (selectedAudioId) {
      idsToCopy = [selectedAudioId];
    }

    const matches = audioTracks.filter(t => idsToCopy.includes(t.id));
    if (matches.length > 0) {
      set({ copiedAudioTracks: matches });
    }
  },

  pasteAudioTrack: (targetId) => {
    const { copiedAudioTracks, audioTracks, selectedAudioId, audioUndoHistory } = get();
    if (!copiedAudioTracks || copiedAudioTracks.length === 0) return;

    const pasteAfterId = targetId || selectedAudioId;
    const history = [...audioUndoHistory, audioTracks];

    const newTracks: AudioTrack[] = copiedAudioTracks.map(t => ({
      ...t,
      id: crypto.randomUUID(),
      name: `${t.name} (Copy)`,
    }));

    let updated: AudioTrack[];
    if (pasteAfterId) {
      const idx = audioTracks.findIndex(t => t.id === pasteAfterId);
      if (idx >= 0) {
        updated = [...audioTracks.slice(0, idx + 1), ...newTracks, ...audioTracks.slice(idx + 1)];
      } else {
        updated = [...audioTracks, ...newTracks];
      }
    } else {
      updated = [...audioTracks, ...newTracks];
    }

    set({
      audioUndoHistory: history,
      audioTracks: updated,
      selectedAudioId: newTracks[newTracks.length - 1].id,
      selectedAudioIds: newTracks.map(t => t.id),
    });
    saveAudioTracks(updated).catch(console.error);
  },

  undoAudioTrack: () => {
    const history = get().audioUndoHistory;
    if (history.length === 0) return;
    const previous = history[history.length - 1];
    set({
      audioTracks: previous,
      audioUndoHistory: history.slice(0, -1),
      selectedAudioId: null,
      selectedAudioIds: [],
    });
    saveAudioTracks(previous).catch(console.error);
  },

  setAudioTracks: (audioTracks) => set({ audioTracks }),
  setPlayingTrackId: (playingTrackId) => set({ playingTrackId }),
  setPhotos: (photos) => set({ photos }),
  setVideos: (videos) => set({ videos }),
  selectedMediaId: null,
  copiedMedia: null,
  setSelectedMediaId: (selectedMediaId) => set({ selectedMediaId }),

  copyMedia: (idToCopy) => {
    const targetId = idToCopy || get().selectedMediaId;
    if (!targetId) return;
    const photo = get().photos.find(p => p.id === targetId);
    if (photo) {
      set({ copiedMedia: photo });
      return;
    }
    const video = get().videos.find(v => v.id === targetId);
    if (video) {
      set({ copiedMedia: video });
    }
  },

  deletePhotoItem: (id) => {
    const current = get().photos;
    const history = [...get().photoUndoHistory, current];
    const updated = current.filter(p => p.id !== id);
    set({ photos: updated, photoUndoHistory: history, selectedMediaId: get().selectedMediaId === id ? null : get().selectedMediaId });
  },

  deleteVideoItem: (id) => {
    const current = get().videos;
    const history = [...get().videoUndoHistory, current];
    const updated = current.filter(v => v.id !== id);
    set({ videos: updated, videoUndoHistory: history, selectedMediaId: get().selectedMediaId === id ? null : get().selectedMediaId });
  },

  undoPhoto: () => {
    const history = get().photoUndoHistory;
    if (history.length === 0) return;
    const previous = history[history.length - 1];
    set({ photos: previous, photoUndoHistory: history.slice(0, -1) });
    syncPhotos(previous).catch(console.error);
  },

  undoVideo: () => {
    const history = get().videoUndoHistory;
    if (history.length === 0) return;
    const previous = history[history.length - 1];
    set({ videos: previous, videoUndoHistory: history.slice(0, -1) });
    syncVideos(previous).catch(console.error);
  },

  setLiveContent: (content) => {
    let resolved = content;
    let rawBlob: Blob | undefined = undefined;

    if (content.url) {
      const targetSlide = get().slides.find(s => s.url === content.url);
      if (targetSlide) {
        rawBlob = targetSlide.blob;
        resolved = {
          ...content,
          mediaType: targetSlide.mediaType || (targetSlide.blob?.type?.startsWith('video/') ? 'video' : 'image'),
        };
      } else {
        const targetVideo = get().videos.find(v => v.url === content.url);
        if (targetVideo) rawBlob = targetVideo.blob;
        const targetPhoto = get().photos.find(p => p.url === content.url);
        if (targetPhoto) rawBlob = targetPhoto.blob;
      }
    }

    set({ liveContent: resolved });
    try {
      localStorage.setItem('presentdeck_live_cache', JSON.stringify(resolved));
    } catch {}

    channel.postMessage({
      ...resolved,
      rawBlob: rawBlob || undefined,
    });

    if (resolved.type === 'slide') {
      const idx = get().slides.findIndex(s => s.url === resolved.url);
      if (idx >= 0) set({ currentSlideIndex: idx, selectedSlideId: get().slides[idx].id });
    }
  },

  navigateSlide: (direction) => {
    const { slides, keyOnly, liveContent } = get();
    if (slides.length === 0) return;
    if (liveContent.type !== 'slide' && liveContent.type !== 'none') return;

    const pool = keyOnly ? slides.filter(s => s.isKey) : slides;
    if (pool.length === 0) return;

    let currentPoolIdx = pool.findIndex(s => s.url === liveContent.url);
    if (currentPoolIdx < 0) currentPoolIdx = direction === 1 ? -1 : pool.length;

    let nextPoolIdx = currentPoolIdx + direction;
    if (nextPoolIdx < 0) nextPoolIdx = 0;
    if (nextPoolIdx >= pool.length) nextPoolIdx = pool.length - 1;

    const nextSlide = pool[nextPoolIdx];
    const globalIdx = slides.findIndex(s => s.id === nextSlide.id);
    const mediaType = nextSlide.mediaType || (nextSlide.blob?.type?.startsWith('video/') ? 'video' : 'image');

    const newLiveContent: LiveContent = {
      type: 'slide',
      url: nextSlide.url,
      mediaType,
    };

    set({ currentSlideIndex: globalIdx, selectedSlideId: nextSlide.id, liveContent: newLiveContent });
    channel.postMessage(newLiveContent);
  },

  workflows: [],
  setWorkflows: (workflows) => set({ workflows }),

  saveCurrentWorkflow: async (name: string) => {
    const { decks, activeDeckId, audioTracks, photos, videos, liveContent, selectedSlideId, keyOnly, workflows } = get();

    const serialDecks: WorkflowDeck[] = await Promise.all(
      decks.map(async d => ({
        id: d.id,
        title: d.title,
        slides: await Promise.all(
          d.slides.map(async s => {
            let blob = s.blob;
            if (!blob && s.url.startsWith('blob:')) {
              try { const r = await fetch(s.url); blob = await r.blob(); } catch {}
            }
            const dataUrl = await urlToDataUrl(s.url, blob);
            return {
              id: s.id,
              pageNum: s.pageNum,
              isKey: !!s.isKey,
              mediaType: s.mediaType || (blob?.type?.startsWith('video/') ? 'video' : 'image'),
              blob,
              dataUrl: dataUrl.startsWith('data:') ? dataUrl : (s.url.startsWith('data:') ? s.url : undefined),
            };
          })
        ),
      }))
    );

    const serialAudio: WorkflowAudioTrack[] = await Promise.all(
      audioTracks.map(async t => {
        let blob = t.blob;
        if (!blob && t.url.startsWith('blob:')) {
          try { const r = await fetch(t.url); blob = await r.blob(); } catch {}
        }
        const dataUrl = await urlToDataUrl(t.url, blob);
        return {
          id: t.id,
          name: t.name,
          blob,
          dataUrl: dataUrl.startsWith('data:') ? dataUrl : (t.url.startsWith('data:') ? t.url : undefined),
        };
      })
    );

    const serialPhotos: WorkflowMediaItem[] = await Promise.all(
      photos.map(async p => {
        let blob = p.blob;
        if (!blob && p.url.startsWith('blob:')) {
          try { const r = await fetch(p.url); blob = await r.blob(); } catch {}
        }
        const dataUrl = await urlToDataUrl(p.url, blob);
        return {
          id: p.id,
          name: p.name,
          type: 'image' as const,
          blob,
          dataUrl: dataUrl.startsWith('data:') ? dataUrl : (p.url.startsWith('data:') ? p.url : undefined),
        };
      })
    );

    const serialVideos: WorkflowMediaItem[] = await Promise.all(
      videos.map(async v => {
        let blob = v.blob;
        if (!blob && v.url.startsWith('blob:')) {
          try { const r = await fetch(v.url); blob = await r.blob(); } catch {}
        }
        const dataUrl = await urlToDataUrl(v.url, blob);
        return {
          id: v.id,
          name: v.name,
          type: 'video' as const,
          blob,
          dataUrl: dataUrl.startsWith('data:') ? dataUrl : (v.url.startsWith('data:') ? v.url : undefined),
        };
      })
    );

    const currentUser = get().currentUser;
    const currentUsername = currentUser?.username || 'anonymous';

    const existingIdx = workflows.findIndex(
      w => w.name.toLowerCase() === name.toLowerCase() && w.username === currentUsername
    );
    const existingWf = existingIdx >= 0 ? workflows[existingIdx] : null;

    const workflow: SavedWorkflow = {
      id: existingWf ? existingWf.id : crypto.randomUUID(),
      name,
      savedAt: new Date().toISOString(),
      username: currentUsername,
      state: {
        decks: serialDecks,
        activeDeckId,
        audioTracks: serialAudio,
        photos: serialPhotos,
        videos: serialVideos,
        liveContent,
        selectedSlideId,
        keyOnly,
      },
    };

    let updatedWorkflows: SavedWorkflow[];
    if (existingIdx >= 0) {
      updatedWorkflows = [...workflows];
      updatedWorkflows[existingIdx] = workflow;
    } else {
      updatedWorkflows = [workflow, ...workflows];
    }

    set({ workflows: updatedWorkflows });
    await saveWorkflowToDB(workflow);
    return workflow;
  },

  loadWorkflowState: async (workflow: SavedWorkflow) => {
    const currentUser = get().currentUser;
    if (currentUser?.role !== 'master' && workflow.username !== currentUser?.username) {
      throw new Error('Unauthorized: You do not have permission to load this workflow.');
    }

    const state = workflow.state || {};
    const decks = state.decks || [];
    const audioTracks = state.audioTracks || [];
    const photos = state.photos || [];
    const videos = state.videos || [];

    const restoredDecks: Deck[] = await Promise.all(
      decks.map(async d => ({
        id: d.id,
        title: d.title,
        slides: await Promise.all(
          (d.slides || []).map(async s => {
            let blob = s.blob;
            if (!blob && s.dataUrl) {
              blob = await dataUrlToBlob(s.dataUrl);
            }
            const url = blob && blob.size > 0 ? URL.createObjectURL(blob) : (s.dataUrl || '');
            return {
              id: s.id,
              url,
              blob,
              pageNum: s.pageNum,
              isKey: !!s.isKey,
              mediaType: s.mediaType || (blob?.type?.startsWith('video/') ? 'video' : 'image'),
            };
          })
        ),
      }))
    );

    const restoredAudio: AudioTrack[] = await Promise.all(
      audioTracks.map(async t => {
        let blob = t.blob;
        if (!blob && t.dataUrl) {
          blob = await dataUrlToBlob(t.dataUrl);
        }
        const url = blob && blob.size > 0 ? URL.createObjectURL(blob) : (t.dataUrl || '');
        return {
          id: t.id,
          name: t.name,
          url,
          blob,
        };
      })
    );

    const restoredPhotos: MediaItem[] = await Promise.all(
      photos.map(async p => {
        let blob = p.blob;
        if (!blob && p.dataUrl) {
          blob = await dataUrlToBlob(p.dataUrl);
        }
        const url = blob && blob.size > 0 ? URL.createObjectURL(blob) : (p.dataUrl || '');
        return {
          id: p.id,
          name: p.name,
          type: 'image' as const,
          url,
          blob,
        };
      })
    );

    const restoredVideos: MediaItem[] = await Promise.all(
      videos.map(async v => {
        let blob = v.blob;
        if (!blob && v.dataUrl) {
          blob = await dataUrlToBlob(v.dataUrl);
        }
        const url = blob && blob.size > 0 ? URL.createObjectURL(blob) : (v.dataUrl || '');
        return {
          id: v.id,
          name: v.name,
          type: 'video' as const,
          url,
          blob,
        };
      })
    );

    const activeDeck = restoredDecks.find(d => d.id === state.activeDeckId) || restoredDecks[0];
    const activeSlides = activeDeck ? activeDeck.slides : [];

    set({
      decks: restoredDecks,
      activeDeckId: activeDeck ? activeDeck.id : null,
      slides: activeSlides,
      audioTracks: restoredAudio,
      photos: restoredPhotos,
      videos: restoredVideos,
      selectedSlideId: state.selectedSlideId || (activeSlides[0]?.id || null),
      selectedSlideIds: state.selectedSlideId ? [state.selectedSlideId] : [],
      keyOnly: !!state.keyOnly,
    });

    if (state.liveContent && state.liveContent.type !== 'none') {
      get().setLiveContent(state.liveContent);
    } else if (activeSlides.length > 0) {
      get().setLiveContent({ type: 'slide', url: activeSlides[0].url, mediaType: activeSlides[0].mediaType || 'image' });
    } else {
      get().setLiveContent({ type: 'none', url: '' });
    }

    await saveDecks(restoredDecks);
    await saveAudioTracks(restoredAudio);
    await syncPhotos(restoredPhotos);
    await syncVideos(restoredVideos);
  },

  renameWorkflow: async (id, newName) => {
    const currentUser = get().currentUser;
    const target = get().workflows.find(w => w.id === id);
    if (currentUser?.role !== 'master' && target?.username !== currentUser?.username) {
      throw new Error('Unauthorized: You do not have permission to rename this workflow.');
    }
    const updated = get().workflows.map(w => w.id === id ? { ...w, name: newName } : w);
    set({ workflows: updated });
    await renameWorkflowInDB(id, newName);
  },

  deleteWorkflow: async (id) => {
    const currentUser = get().currentUser;
    const target = get().workflows.find(w => w.id === id);
    if (currentUser?.role !== 'master' && target?.username !== currentUser?.username) {
      throw new Error('Unauthorized: You do not have permission to delete this workflow.');
    }
    const updated = get().workflows.filter(w => w.id !== id);
    set({ workflows: updated });
    await deleteWorkflowFromDB(id);
  },

  exportWorkflowFile: async (workflow) => {
    const state = workflow.state || {};
    const serialDecks = await Promise.all(
      (state.decks || []).map(async d => ({
        ...d,
        slides: await Promise.all(
          (d.slides || []).map(async s => ({
            id: s.id,
            pageNum: s.pageNum,
            isKey: s.isKey,
            mediaType: s.mediaType,
            dataUrl: s.dataUrl || (s.blob ? await urlToDataUrl('', s.blob) : ''),
          }))
        ),
      }))
    );

    const serialAudio = await Promise.all(
      (state.audioTracks || []).map(async t => ({
        id: t.id,
        name: t.name,
        dataUrl: t.dataUrl || (t.blob ? await urlToDataUrl('', t.blob) : ''),
      }))
    );

    const serialPhotos = await Promise.all(
      (state.photos || []).map(async p => ({
        id: p.id,
        name: p.name,
        type: p.type,
        dataUrl: p.dataUrl || (p.blob ? await urlToDataUrl('', p.blob) : ''),
      }))
    );

    const serialVideos = await Promise.all(
      (state.videos || []).map(async v => ({
        id: v.id,
        name: v.name,
        type: v.type,
        dataUrl: v.dataUrl || (v.blob ? await urlToDataUrl('', v.blob) : ''),
      }))
    );

    const exportObject = {
      ...workflow,
      state: {
        ...state,
        decks: serialDecks,
        audioTracks: serialAudio,
        photos: serialPhotos,
        videos: serialVideos,
      },
    };

    const jsonStr = JSON.stringify(exportObject, null, 2); // JSON.stringify(workflow, null, 2)
    const blob = new Blob([jsonStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${workflow.name.replace(/[^a-z0-9_-]/gi, '_')}.presentdeck.json`;
    a.click();
    URL.revokeObjectURL(url);
  },

  importWorkflowFile: async (file: File) => {
    const text = await file.text();
    const data = JSON.parse(text) as SavedWorkflow;
    if (!data || !data.name || !data.state) {
      throw new Error('Invalid workflow file format.');
    }
    const currentUser = get().currentUser;
    const imported: SavedWorkflow = {
      ...data,
      id: crypto.randomUUID(),
      savedAt: new Date().toISOString(),
      username: currentUser?.username || 'anonymous',
    };
    const updated = [imported, ...get().workflows];
    set({ workflows: updated });
    await saveWorkflowToDB(imported);
    return imported;
  },

  clearCurrentSession: async () => {
    set({
      decks: [],
      activeDeckId: null,
      slides: [],
      currentSlideIndex: 0,
      selectedSlideId: null,
      selectedSlideIds: [],
      copiedSlide: null,
      undoHistory: [],
      photoUndoHistory: [],
      videoUndoHistory: [],
      keyOnly: false,
      audioTracks: [],
      playingTrackId: null,
      selectedAudioId: null,
      selectedAudioIds: [],
      copiedAudioTracks: null,
      audioUndoHistory: [],
      photos: [],
      videos: [],
      liveContent: { type: 'none', url: '' },
    });
    await Promise.all([
      saveDecks([]),
      saveSlides([]),
      saveAudioTracks([]),
      syncPhotos([]),
      syncVideos([]),
    ]);
  },

  currentUser: (() => {
    try {
      const saved = localStorage.getItem('presentdeck_session');
      return saved ? JSON.parse(saved) : null;
    } catch {
      return null;
    }
  })(),

  login: async (username: string, passwordAttempt: string) => {
    const session = await authenticateUser(username, passwordAttempt);
    if (session) {
      localStorage.setItem('presentdeck_session', JSON.stringify(session));
      set({ currentUser: session });
      return true;
    }
    return false;
  },

  logout: () => {
    localStorage.removeItem('presentdeck_session');
    set({ currentUser: null });
  },
}));

async function urlToDataUrl(url: string, blob?: Blob): Promise<string> {
  if (!url) return '';
  if (url.startsWith('data:')) return url;
  let b = blob;
  if (!b) {
    try {
      const res = await fetch(url);
      b = await res.blob();
    } catch {
      return url;
    }
  }
  return new Promise<string>((resolve) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve((reader.result as string) || url);
    reader.onerror = () => resolve(url);
    reader.readAsDataURL(b!);
  });
}

async function dataUrlToBlob(dataUrl: string): Promise<Blob> {
  if (!dataUrl) return new Blob([], { type: 'application/octet-stream' });
  if (dataUrl.startsWith('blob:') || dataUrl.startsWith('http://') || dataUrl.startsWith('https://') || dataUrl.startsWith('data:')) {
    try {
      const res = await fetch(dataUrl);
      return await res.blob();
    } catch {
      // Fallback to manual decode below if fetch fails
    }
  }
  if (!dataUrl.startsWith('data:')) {
    return new Blob([], { type: 'application/octet-stream' });
  }
  const arr = dataUrl.split(',');
  const mimeMatch = arr[0].match(/:(.*?);/);
  const mime = mimeMatch ? mimeMatch[1] : 'application/octet-stream';
  const bstr = atob(arr[1]);
  let n = bstr.length;
  const u8arr = new Uint8Array(n);
  while (n--) {
    u8arr[n] = bstr.charCodeAt(n);
  }
  return new Blob([u8arr], { type: mime });
}
