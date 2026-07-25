import React, { useEffect, useRef, useState, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { DndContext, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors, DragEndEvent } from '@dnd-kit/core';
import { SortableContext, useSortable, verticalListSortingStrategy, arrayMove } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { useStore } from '../store';
import { saveAudioTracks, loadAudioTracks } from '../db';
import type { AudioTrack } from '../types';
import './MusicFlow.css';

/* ─── Audio Context Menu (Portal) ─── */
function AudioContextMenu({
  trackId,
  pos,
  hasCopiedTracks,
  onClose,
  onDelete,
  onCopy,
  onPaste,
  onUndo,
}: {
  trackId: string;
  pos: { x: number; y: number };
  hasCopiedTracks: boolean;
  onClose: () => void;
  onDelete: (id: string) => void;
  onCopy: (id: string) => void;
  onPaste: (id: string) => void;
  onUndo: () => void;
}) {
  const menuHeight = 168;
  const menuWidth = 185;
  const top = pos.y + menuHeight > window.innerHeight ? Math.max(8, pos.y - menuHeight) : pos.y;
  const left = pos.x + menuWidth > window.innerWidth ? Math.max(8, pos.x - menuWidth) : pos.x;

  return createPortal(
    <>
      <div
        style={{ position: 'fixed', inset: 0, zIndex: 99998 }}
        onClick={onClose}
        onContextMenu={(e) => { e.preventDefault(); onClose(); }}
      />
      <div className="ctx-menu" style={{ position: 'fixed', top, left, zIndex: 99999 }}>
        <div className="ctx-item ctx-danger" onClick={() => { onDelete(trackId); onClose(); }}>
          <span>🗑️ Delete Track</span><span className="ctx-key">Del</span>
        </div>
        <div className="ctx-item" onClick={() => { onCopy(trackId); onClose(); }}>
          <span>📋 Copy Track</span><span className="ctx-key">Ctrl+C</span>
        </div>
        <div className={`ctx-item ${!hasCopiedTracks ? 'ctx-disabled' : ''}`} onClick={() => { if (hasCopiedTracks) { onPaste(trackId); onClose(); } }}>
          <span>📑 Paste Track</span><span className="ctx-key">Ctrl+V</span>
        </div>
        <div className="ctx-item" onClick={() => { onUndo(); onClose(); }}>
          <span>↩️ Undo</span><span className="ctx-key">Ctrl+Z</span>
        </div>
      </div>
    </>,
    document.body
  );
}

interface SortableTrackItemProps {
  track: AudioTrack;
  isPlaying: boolean;
  isSelected: boolean;
  onToggle: (track: AudioTrack) => void;
  onRename: (id: string, newName: string) => void;
  onClick: (e: React.MouseEvent) => void;
  onOpenCtxMenu: (e: React.MouseEvent) => void;
  setRef: (el: HTMLDivElement | null) => void;
}

function SortableTrackItem({ track, isPlaying, isSelected, onToggle, onRename, onClick, onOpenCtxMenu, setRef }: SortableTrackItemProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: track.id });
  const [isEditing, setIsEditing] = useState(false);
  const [nameText, setNameText] = useState(track.name);
  const inputRef = useRef<HTMLInputElement>(null);

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
  };

  useEffect(() => {
    setNameText(track.name);
  }, [track.name]);

  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [isEditing]);

  const handleFinishRename = () => {
    setIsEditing(false);
    const trimmed = nameText.trim();
    if (trimmed && trimmed !== track.name) {
      onRename(track.id, trimmed);
    } else {
      setNameText(track.name);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleFinishRename();
    } else if (e.key === 'Escape') {
      setIsEditing(false);
      setNameText(track.name);
    }
  };

  return (
    <div
      ref={el => {
        setNodeRef(el);
        setRef(el);
      }}
      style={style}
      className={`track-item ${isPlaying ? 'playing' : ''} ${isSelected ? 'selected' : ''}`}
      onClick={onClick}
    >
      <div className="drag-handle" {...attributes} {...listeners} title="Drag to reorder">☰</div>
      <div className="track-info" onDoubleClick={() => setIsEditing(true)}>
        {isEditing ? (
          <input
            ref={inputRef}
            type="text"
            className="track-rename-input"
            value={nameText}
            onChange={(e) => setNameText(e.target.value)}
            onBlur={handleFinishRename}
            onKeyDown={handleKeyDown}
            onClick={e => e.stopPropagation()}
          />
        ) : (
          <span className="track-name" title="Double click to rename">{track.name}</span>
        )}
      </div>
      <div className="track-actions">
        <button onClick={(e) => { e.stopPropagation(); onToggle(track); }} className="play-btn" title={isPlaying ? "Pause" : "Play"}>
          {isPlaying ? '⏸' : '▶'}
        </button>
        <button onClick={onOpenCtxMenu} className="dots-btn" title="Audio Options">⋮</button>
      </div>
    </div>
  );
}

const AUDIO_ACCEPT = '.mp3,.mpeg,.mpga,.wav,.ogg,.m4a,.aac,.flac,.wma,.opus,.webm,audio/*';

function isAudioFile(file: File): boolean {
  return file.type.startsWith('audio/') ||
    /\.(mp3|mpeg|mpga|wav|ogg|m4a|aac|flac|wma|opus|webm)$/i.test(file.name);
}

function formatTime(seconds: number): string {
  if (isNaN(seconds) || seconds < 0) return '0:00';
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
}

export function MusicFlow() {
  const {
    audioTracks, setAudioTracks, playingTrackId, setPlayingTrackId,
    selectedAudioId, selectedAudioIds, copiedAudioTracks,
    setSelectedAudioId, setSelectedAudioIds, deleteAudioTrack, copyAudioTrack, pasteAudioTrack, undoAudioTrack,
  } = useStore();

  const fileInputRef = useRef<HTMLInputElement>(null);
  const animFrameRef = useRef<number | null>(null);

  // Pre-warmed Audio elements map for ZERO play latency
  const audioMapRef = useRef<Map<string, HTMLAudioElement>>(new Map());
  const trackRefs = useRef<Map<string, HTMLDivElement>>(new Map());

  const [selectionAnchorAudioId, setSelectionAnchorAudioId] = useState<string | null>(null);
  const [selectionCursorAudioId, setSelectionCursorAudioId] = useState<string | null>(null);

  const [ctxMenu, setCtxMenu] = useState<{ trackId: string; x: number; y: number } | null>(null);

  const [isFileDragging, setIsFileDragging] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [isShuffle, setIsShuffle] = useState(false);
  const [isLoop, setIsLoop] = useState(false);

  const isShuffleRef = useRef(isShuffle);
  const isLoopRef = useRef(isLoop);
  isShuffleRef.current = isShuffle;
  isLoopRef.current = isLoop;

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor)
  );

  // Keyboard shortcuts (Multi-select Shift+Arrow forward & backward, Delete, Copy, Paste, Undo)
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName?.toLowerCase();
      if (tag === 'input' || tag === 'textarea') return;
      const ctrl = e.ctrlKey || e.metaKey;

      const isInsideMusic = Boolean((e.target as HTMLElement)?.closest('.music-flow'));

      if (ctrl && e.key.toLowerCase() === 'c') {
        if (!isInsideMusic && !selectedAudioId) return;
        e.preventDefault();
        copyAudioTrack(selectedAudioId || (selectedAudioIds.length ? selectedAudioIds[0] : undefined));
      } else if (ctrl && e.key.toLowerCase() === 'v') {
        if (!isInsideMusic && !selectedAudioId) return;
        e.preventDefault();
        pasteAudioTrack(selectedAudioId || (selectedAudioIds.length ? selectedAudioIds[selectedAudioIds.length - 1] : undefined));
      } else if (ctrl && e.key.toLowerCase() === 'z') {
        if (!isInsideMusic) return;
        e.preventDefault();
        undoAudioTrack();
      } else if ((e.key === 'Delete' || e.key === 'Backspace') && isInsideMusic && (selectedAudioId || selectedAudioIds.length)) {
        e.preventDefault();
        deleteAudioTrack();
      } else if (e.shiftKey && isInsideMusic && (e.key === 'ArrowRight' || e.key === 'ArrowDown')) {
        e.preventDefault();
        if (audioTracks.length === 0) return;
        const anchorId = selectionAnchorAudioId || selectedAudioId || audioTracks[0].id;
        const cursorId = selectionCursorAudioId || selectedAudioId || anchorId;
        const anchorIdx = Math.max(0, audioTracks.findIndex(t => t.id === anchorId));
        const cursorIdx = Math.max(0, audioTracks.findIndex(t => t.id === cursorId));

        if (cursorIdx < audioTracks.length - 1) {
          const newCursorIdx = cursorIdx + 1;
          const from = Math.min(anchorIdx, newCursorIdx);
          const to = Math.max(anchorIdx, newCursorIdx);
          const range = audioTracks.slice(from, to + 1).map(t => t.id);
          setSelectedAudioIds(range);
          setSelectionCursorAudioId(audioTracks[newCursorIdx].id);
          if (!selectionAnchorAudioId) setSelectionAnchorAudioId(anchorId);
        }
      } else if (e.shiftKey && isInsideMusic && (e.key === 'ArrowLeft' || e.key === 'ArrowUp')) {
        e.preventDefault();
        if (audioTracks.length === 0) return;
        const anchorId = selectionAnchorAudioId || selectedAudioId || audioTracks[0].id;
        const cursorId = selectionCursorAudioId || selectedAudioId || anchorId;
        const anchorIdx = Math.max(0, audioTracks.findIndex(t => t.id === anchorId));
        const cursorIdx = Math.max(0, audioTracks.findIndex(t => t.id === cursorId));

        if (cursorIdx > 0) {
          const newCursorIdx = cursorIdx - 1;
          const from = Math.min(anchorIdx, newCursorIdx);
          const to = Math.max(anchorIdx, newCursorIdx);
          const range = audioTracks.slice(from, to + 1).map(t => t.id);
          setSelectedAudioIds(range);
          setSelectionCursorAudioId(audioTracks[newCursorIdx].id);
          if (!selectionAnchorAudioId) setSelectionAnchorAudioId(anchorId);
        }
      } else if (!e.shiftKey && isInsideMusic && (selectedAudioId || selectedAudioIds.length > 0) && (e.key === 'ArrowRight' || e.key === 'ArrowDown')) {
        e.preventDefault();
        if (audioTracks.length === 0) return;
        const currId = selectionCursorAudioId || selectedAudioId || audioTracks[0].id;
        const idx = audioTracks.findIndex(t => t.id === currId);
        if (idx < audioTracks.length - 1) {
          const nextId = audioTracks[idx + 1].id;
          setSelectedAudioId(nextId);
          setSelectionAnchorAudioId(nextId);
          setSelectionCursorAudioId(nextId);
        }
      } else if (!e.shiftKey && isInsideMusic && (selectedAudioId || selectedAudioIds.length > 0) && (e.key === 'ArrowLeft' || e.key === 'ArrowUp')) {
        e.preventDefault();
        if (audioTracks.length === 0) return;
        const currId = selectionCursorAudioId || selectedAudioId || audioTracks[0].id;
        const idx = audioTracks.findIndex(t => t.id === currId);
        if (idx > 0) {
          const prevId = audioTracks[idx - 1].id;
          setSelectedAudioId(prevId);
          setSelectionAnchorAudioId(prevId);
          setSelectionCursorAudioId(prevId);
        }
      }
    };

    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [
    copyAudioTrack, pasteAudioTrack, undoAudioTrack, deleteAudioTrack,
    selectedAudioId, selectedAudioIds, audioTracks, setSelectedAudioId, setSelectedAudioIds,
    selectionAnchorAudioId, selectionCursorAudioId
  ]);

  // Auto-scroll to newly selected audio track cursor when selection moves
  useEffect(() => {
    const targetId = selectionCursorAudioId || (selectedAudioIds.length ? selectedAudioIds[selectedAudioIds.length - 1] : selectedAudioId);
    if (!targetId) return;
    const el = trackRefs.current.get(targetId);
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }, [selectionCursorAudioId, selectedAudioIds, selectedAudioId]);

  // Helper to get or instantiate a pre-buffered Audio element for a track
  const getAudioForTrack = useCallback((track: AudioTrack): HTMLAudioElement => {
    let audio = audioMapRef.current.get(track.id);
    if (!audio) {
      audio = new Audio(track.url);
      audio.preload = 'auto';
      audio.load();

      audio.addEventListener('play', () => setIsPlaying(true));
      audio.addEventListener('pause', () => setIsPlaying(false));
      audio.addEventListener('durationchange', () => {
        if (useStore.getState().playingTrackId === track.id) {
          setDuration(audio?.duration || 0);
        }
      });
      audio.addEventListener('ended', () => {
        setIsPlaying(false);
        const state = useStore.getState();
        const tracks = state.audioTracks;
        const currentId = state.playingTrackId;

        if (isLoopRef.current) {
          audio!.currentTime = 0;
          audio!.play().catch(() => {});
          return;
        }

        if (tracks.length === 0) {
          state.setPlayingTrackId(null);
          return;
        }

        if (isShuffleRef.current) {
          const randIdx = Math.floor(Math.random() * tracks.length);
          const nextTrack = tracks[randIdx];
          playTrack(nextTrack);
        } else {
          const idx = tracks.findIndex(t => t.id === currentId);
          if (idx >= 0 && idx < tracks.length - 1) {
            playTrack(tracks[idx + 1]);
          } else {
            state.setPlayingTrackId(null);
          }
        }
      });

      audioMapRef.current.set(track.id, audio);
    }
    return audio;
  }, []);

  // Pre-load all tracks on mount or track list updates
  useEffect(() => {
    loadAudioTracks().then((tracks: AudioTrack[]) => {
      if (tracks?.length > 0) {
        setAudioTracks(tracks);
        tracks.forEach(t => getAudioForTrack(t));
      }
    });
  }, [getAudioForTrack, setAudioTracks]);

  // Pre-warm newly added tracks
  useEffect(() => {
    audioTracks.forEach(t => {
      if (!audioMapRef.current.has(t.id)) {
        getAudioForTrack(t);
      }
    });
  }, [audioTracks, getAudioForTrack]);

  // Active audio element getter
  const getActiveAudio = useCallback((): HTMLAudioElement | null => {
    if (!playingTrackId) return null;
    const track = audioTracks.find(t => t.id === playingTrackId);
    if (!track) return null;
    return getAudioForTrack(track);
  }, [playingTrackId, audioTracks, getAudioForTrack]);

  // 60FPS progress updater
  useEffect(() => {
    if (isPlaying) {
      const updateProgress = () => {
        const activeAudio = getActiveAudio();
        if (activeAudio) {
          setCurrentTime(activeAudio.currentTime);
          setDuration(activeAudio.duration || 0);
        }
        animFrameRef.current = requestAnimationFrame(updateProgress);
      };
      animFrameRef.current = requestAnimationFrame(updateProgress);
    } else {
      if (animFrameRef.current) {
        cancelAnimationFrame(animFrameRef.current);
        animFrameRef.current = null;
      }
      const activeAudio = getActiveAudio();
      if (activeAudio) {
        setCurrentTime(activeAudio.currentTime);
        setDuration(activeAudio.duration || 0);
      }
    }

    return () => {
      if (animFrameRef.current) {
        cancelAnimationFrame(animFrameRef.current);
      }
    };
  }, [isPlaying, getActiveAudio]);

  const playTrack = useCallback((track: AudioTrack) => {
    audioMapRef.current.forEach((audio, id) => {
      if (id !== track.id) {
        audio.pause();
        audio.currentTime = 0;
      }
    });

    setPlayingTrackId(track.id);
    const audio = getAudioForTrack(track);

    setIsPlaying(true);
    const playPromise = audio.play();
    if (playPromise !== undefined) {
      playPromise.catch(console.error);
    }
  }, [setPlayingTrackId, getAudioForTrack]);

  const togglePlay = useCallback((track: AudioTrack) => {
    const audio = getAudioForTrack(track);

    if (playingTrackId === track.id) {
      if (audio.paused) {
        setIsPlaying(true);
        audio.play().catch(console.error);
      } else {
        audio.pause();
        setIsPlaying(false);
      }
    } else {
      playTrack(track);
    }
  }, [playingTrackId, getAudioForTrack, playTrack]);

  const handleGlobalPlayPause = () => {
    if (playingTrackId) {
      const track = audioTracks.find(t => t.id === playingTrackId);
      if (track) {
        togglePlay(track);
      }
    } else if (audioTracks.length > 0) {
      playTrack(audioTracks[0]);
    }
  };

  const handlePrevTrack = () => {
    if (audioTracks.length === 0) return;
    const currentIndex = audioTracks.findIndex(t => t.id === playingTrackId);
    if (currentIndex > 0) {
      playTrack(audioTracks[currentIndex - 1]);
    } else {
      playTrack(audioTracks[audioTracks.length - 1]);
    }
  };

  const handleNextTrack = () => {
    if (audioTracks.length === 0) return;
    if (isShuffle) {
      const randomIndex = Math.floor(Math.random() * audioTracks.length);
      playTrack(audioTracks[randomIndex]);
    } else {
      const currentIndex = audioTracks.findIndex(t => t.id === playingTrackId);
      if (currentIndex >= 0 && currentIndex < audioTracks.length - 1) {
        playTrack(audioTracks[currentIndex + 1]);
      } else {
        playTrack(audioTracks[0]);
      }
    }
  };

  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    const seekTime = parseFloat(e.target.value);
    setCurrentTime(seekTime);
    const activeAudio = getActiveAudio();
    if (activeAudio) {
      activeAudio.currentTime = seekTime;
    }
  };

  const handleRename = (id: string, newName: string) => {
    const updated = audioTracks.map(t => t.id === id ? { ...t, name: newName } : t);
    setAudioTracks(updated);
    saveAudioTracks(updated);
  };

  const handleTrackClick = (trackId: string, e: React.MouseEvent) => {
    if (e.ctrlKey || e.metaKey) {
      const exists = selectedAudioIds.includes(trackId);
      const updated = exists ? selectedAudioIds.filter(id => id !== trackId) : [...selectedAudioIds, trackId];
      setSelectedAudioIds(updated.length ? updated : [trackId]);
      setSelectionAnchorAudioId(trackId);
      setSelectionCursorAudioId(trackId);
    } else if (e.shiftKey && audioTracks.length > 0) {
      const anchorId = selectionAnchorAudioId || selectedAudioId || audioTracks[0].id;
      const startIdx = audioTracks.findIndex(t => t.id === anchorId);
      const endIdx = audioTracks.findIndex(t => t.id === trackId);
      if (startIdx >= 0 && endIdx >= 0) {
        const from = Math.min(startIdx, endIdx);
        const to = Math.max(startIdx, endIdx);
        const range = audioTracks.slice(from, to + 1).map(t => t.id);
        setSelectedAudioIds(range);
        setSelectionAnchorAudioId(anchorId);
        setSelectionCursorAudioId(trackId);
      }
    } else {
      setSelectedAudioId(trackId);
      setSelectionAnchorAudioId(trackId);
      setSelectionCursorAudioId(trackId);
    }
  };

  const openCtxMenu = (trackId: string, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setSelectedAudioId(trackId);
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    setCtxMenu({ trackId, x: rect.left, y: rect.bottom + 4 });
  };

  const addFiles = useCallback((files: FileList | File[]) => {
    const audioFiles = Array.from(files).filter(isAudioFile);
    if (audioFiles.length === 0) return;

    const newTracks: AudioTrack[] = audioFiles.map(file => {
      const id = crypto.randomUUID();
      const url = URL.createObjectURL(file);
      const track: AudioTrack = {
        id,
        name: file.name.replace(/\.[^/.]+$/, ''),
        url,
        file,
        blob: file,
      };
      getAudioForTrack(track);
      return track;
    });

    const updated = [...useStore.getState().audioTracks, ...newTracks];
    setAudioTracks(updated);
    saveAudioTracks(updated).catch(console.error);
  }, [setAudioTracks, getAudioForTrack]);

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      addFiles(e.target.files);
      e.target.value = '';
    }
  };

  const handleFileDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsFileDragging(false);
    if (e.dataTransfer.files?.length > 0) {
      addFiles(e.dataTransfer.files);
    }
  }, [addFiles]);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    if (e.dataTransfer.types.includes('Files')) {
      e.preventDefault();
      e.stopPropagation();
      setIsFileDragging(true);
    }
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsFileDragging(false);
  }, []);

  const handleSortEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (over && active.id !== over.id) {
      const oldIndex = audioTracks.findIndex(t => t.id === active.id);
      const newIndex = audioTracks.findIndex(t => t.id === over.id);
      const updated = arrayMove(audioTracks, oldIndex, newIndex);
      setAudioTracks(updated);
      saveAudioTracks(updated).catch(console.error);
    }
  };

  const activeTrack = audioTracks.find(t => t.id === playingTrackId);

  return (
    <div
      className={`music-flow glass-panel ${isFileDragging ? 'file-drag-over' : ''}`}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleFileDrop}
    >
      <div className="music-header">
        <h2>Audio</h2>
        <button className="add-btn" onClick={() => fileInputRef.current?.click()} title="Add Audio File">+</button>
        <input
          type="file"
          ref={fileInputRef}
          multiple
          accept={AUDIO_ACCEPT}
          onChange={handleFileUpload}
          style={{ display: 'none' }}
        />
      </div>

      {audioTracks.length === 0 && (
        <div className="audio-drop-hint">
          Drop audio files here or click +
        </div>
      )}

      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleSortEnd}>
        <SortableContext items={audioTracks.map(t => t.id)} strategy={verticalListSortingStrategy}>
          <div className="track-list" onScroll={() => setCtxMenu(null)}>
            {audioTracks.map((track) => {
              const isSelected = selectedAudioIds.includes(track.id) || selectedAudioId === track.id;
              return (
                <SortableTrackItem
                  key={track.id}
                  track={track}
                  isPlaying={playingTrackId === track.id && isPlaying}
                  isSelected={isSelected}
                  onToggle={togglePlay}
                  onRename={handleRename}
                  onClick={(e) => handleTrackClick(track.id, e)}
                  onOpenCtxMenu={(e) => openCtxMenu(track.id, e)}
                  setRef={(el) => {
                    if (el) trackRefs.current.set(track.id, el);
                    else trackRefs.current.delete(track.id);
                  }}
                />
              );
            })}
          </div>
        </SortableContext>
      </DndContext>

      {/* Audio Options Context menu via React Portal */}
      {ctxMenu && (
        <AudioContextMenu
          trackId={ctxMenu.trackId}
          pos={{ x: ctxMenu.x, y: ctxMenu.y }}
          hasCopiedTracks={Boolean(copiedAudioTracks && copiedAudioTracks.length > 0)}
          onClose={() => setCtxMenu(null)}
          onDelete={deleteAudioTrack}
          onCopy={copyAudioTrack}
          onPaste={pasteAudioTrack}
          onUndo={undoAudioTrack}
        />
      )}

      {/* Persistent Now Playing Bottom Widget */}
      <div className="now-playing-widget">
        <div className="now-playing-info">
          <span className="now-playing-title">
            {activeTrack ? activeTrack.name : 'No track playing'}
          </span>
        </div>

        {/* Seeker bar with 60fps moving dot */}
        <div className="now-playing-seeker">
          <span className="time-text">{formatTime(currentTime)}</span>
          <input
            type="range"
            className="seek-slider"
            min={0}
            max={duration || 100}
            step={0.1}
            value={currentTime}
            onChange={handleSeek}
            disabled={!activeTrack}
          />
          <span className="time-text">{formatTime(duration)}</span>
        </div>

        {/* Control buttons */}
        <div className="now-playing-controls">
          <button
            className={`np-btn ${isShuffle ? 'active' : ''}`}
            onClick={() => setIsShuffle(!isShuffle)}
            title="Shuffle"
          >
            🔀
          </button>
          <button className="np-btn" onClick={handlePrevTrack} disabled={audioTracks.length === 0} title="Previous">
            ⏮
          </button>
          <button
            className="np-btn np-play-main"
            onClick={handleGlobalPlayPause}
            disabled={audioTracks.length === 0}
            title={isPlaying ? "Pause" : "Play"}
          >
            {isPlaying ? '⏸' : '▶'}
          </button>
          <button className="np-btn" onClick={handleNextTrack} disabled={audioTracks.length === 0} title="Next">
            ⏭
          </button>
          <button
            className={`np-btn ${isLoop ? 'active' : ''}`}
            onClick={() => setIsLoop(!isLoop)}
            title="Repeat"
          >
            🔁
          </button>
        </div>
      </div>
    </div>
  );
}
