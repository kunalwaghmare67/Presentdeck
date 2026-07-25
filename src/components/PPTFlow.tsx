import React, { useState, useEffect, useCallback, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useDroppable, useDraggable } from '@dnd-kit/core';
import * as pdfjsLib from 'pdfjs-dist';
import { useStore } from '../store';
import { loadDecks, loadSlides } from '../db';
import type { SlideItem, Deck } from '../types';
import './PPTFlow.css';

pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.mjs`;

const SLIDE_ACCEPT = '.pptx,.ppt,.pdf,image/png,image/jpeg,image/jpg,image/webp,image/*';

function createPptxPlaceholderSlide(fileName: string): Promise<{ url: string; blob: Blob }> {
  return new Promise((resolve) => {
    const canvas = document.createElement('canvas');
    canvas.width = 1280;
    canvas.height = 720;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      const grad = ctx.createLinearGradient(0, 0, 1280, 720);
      grad.addColorStop(0, '#2b2d31');
      grad.addColorStop(1, '#1e1f22');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, 1280, 720);
      ctx.fillStyle = '#5865f2';
      ctx.font = 'bold 54px Inter, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('📊 PowerPoint Deck Loaded', 640, 260);
      ctx.fillStyle = '#f2f3f5';
      ctx.font = '600 36px Inter, sans-serif';
      ctx.fillText(fileName, 640, 340);
      ctx.fillStyle = '#b5bac1';
      ctx.font = '400 24px Inter, sans-serif';
      ctx.fillText('💡 Export as PDF in PowerPoint for full slide rendering.', 640, 440);
    }
    canvas.toBlob((blob) => {
      resolve({ url: blob ? URL.createObjectURL(blob) : '', blob: blob || new Blob() });
    }, 'image/jpeg', 0.9);
  });
}

/* ─── Slide Context Menu (Portal) ─── */
function SlideContextMenu({
  slideId,
  pos,
  copiedSlide,
  onClose,
  onDelete,
  onCopy,
  onPaste,
  onUndo,
}: {
  slideId: string;
  pos: { x: number; y: number };
  copiedSlide: SlideItem | null;
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
      {/* Invisible backdrop — closes menu on click */}
      <div
        style={{ position: 'fixed', inset: 0, zIndex: 99998 }}
        onClick={onClose}
        onContextMenu={(e) => { e.preventDefault(); onClose(); }}
      />
      {/* Actual menu */}
      <div className="ctx-menu" style={{ position: 'fixed', top, left, zIndex: 99999 }}>
        <div className="ctx-item ctx-danger" onClick={() => { onDelete(slideId); onClose(); }}>
          <span>🗑️ Delete Slide</span><span className="ctx-key">Del</span>
        </div>
        <div className="ctx-item" onClick={() => { onCopy(slideId); onClose(); }}>
          <span>📋 Copy Slide</span><span className="ctx-key">Ctrl+C</span>
        </div>
        <div className={`ctx-item ${!copiedSlide ? 'ctx-disabled' : ''}`} onClick={() => { if (copiedSlide) { onPaste(slideId); onClose(); } }}>
          <span>📑 Paste Slide</span><span className="ctx-key">Ctrl+V</span>
        </div>
        <div className="ctx-item" onClick={() => { onUndo(); onClose(); }}>
          <span>↩️ Undo</span><span className="ctx-key">Ctrl+Z</span>
        </div>
      </div>
    </>,
    document.body
  );
}

/* ─── Droppable & Draggable Slide Components ─── */
function DroppableSlideItem({
  slide,
  isSelected,
  isLive,
  onClick,
  onToggleKey,
  onOpenCtxMenu,
  setRef,
}: {
  slide: SlideItem;
  isSelected: boolean;
  isLive: boolean;
  onClick: (e: React.MouseEvent) => void;
  onToggleKey: (e: React.MouseEvent) => void;
  onOpenCtxMenu: (e: React.MouseEvent) => void;
  setRef: (el: HTMLDivElement | null) => void;
}) {
  const { setNodeRef: setDropRef, isOver } = useDroppable({ id: `slide-drop-${slide.id}` });
  const { attributes, listeners, setNodeRef: setDragRef, isDragging } = useDraggable({
    id: slide.id,
    data: { slide },
  });

  const isVideoSlide = slide.mediaType === 'video' ||
    (slide.blob && slide.blob.type.startsWith('video/')) ||
    slide.url.includes('video') ||
    slide.url.endsWith('.mp4') ||
    slide.url.endsWith('.webm') ||
    slide.url.startsWith('data:video');

  return (
    <div
      ref={el => {
        setDropRef(el);
        setDragRef(el);
        setRef(el);
      }}
      style={{ opacity: isDragging ? 0.35 : 1, cursor: 'grab' }}
      className={`slide-item ${isLive ? 'live' : ''} ${slide.isKey ? 'key-slide' : ''} ${isSelected ? 'selected' : ''} ${isOver ? 'drop-target-over' : ''}`}
      onClick={onClick}
      {...attributes}
      {...listeners}
    >
      <div className="slide-badge">{slide.pageNum}</div>
      <div className="slide-item-actions">
        <button className={`star-btn ${slide.isKey ? 'starred' : ''}`}
          onClick={onToggleKey}
          onPointerDown={e => e.stopPropagation()}
          title={slide.isKey ? 'Remove key slide' : 'Mark as key slide'}>
          {slide.isKey ? '★' : '☆'}
        </button>
        <button className="dots-btn" onClick={onOpenCtxMenu} onPointerDown={e => e.stopPropagation()} title="Slide Options">⋮</button>
      </div>
      {isVideoSlide && <div className="slide-video-badge" title="Video Slide">▶</div>}
      {isVideoSlide ? (
        <video
          src={slide.url}
          style={{ width: '100%', height: '100%', objectFit: 'cover', pointerEvents: 'none' }}
          muted
          playsInline
          onLoadedData={(e) => { (e.target as HTMLVideoElement).currentTime = 0.1; }}
        />
      ) : (
        <img src={slide.url} alt={`Slide ${slide.pageNum}`} loading="lazy" style={{ pointerEvents: 'none' }} />
      )}
    </div>
  );
}

function SlideListContainer({
  children,
  onScroll,
}: {
  children: React.ReactNode;
  onScroll: () => void;
}) {
  const { setNodeRef } = useDroppable({ id: 'ppt-list-drop' });

  return (
    <div
      ref={setNodeRef}
      className="slide-list"
      onScroll={onScroll}
    >
      {children}
    </div>
  );
}

/* ─── PPTFlow ─── */
export function PPTFlow() {
  const {
    decks, activeDeckId, slides, currentSlideIndex, selectedSlideId, selectedSlideIds, copiedSlide, liveContent, keyOnly,
    setDecks, setActiveDeckId, addDeck, renameDeck, deleteDeck, setSlides,
    setSelectedSlideId, setSelectedSlideIds, setLiveContent, setKeyOnly, toggleKeySlide, navigateSlide,
    deleteSlide, copySlide, pasteSlide, undo,
  } = useStore();

  const [isDragging, setIsDragging] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [showDeckDropdown, setShowDeckDropdown] = useState(false);
  const [renamingDeckId, setRenamingDeckId] = useState<string | null>(null);
  const [deckTitleText, setDeckTitleText] = useState('');

  // Selection anchor & cursor for symmetric Shift+Arrow range selection
  const [selectionAnchorId, setSelectionAnchorId] = useState<string | null>(null);
  const [selectionCursorId, setSelectionCursorId] = useState<string | null>(null);

  // Context menu state (clean rewrite)
  const [ctxMenu, setCtxMenu] = useState<{ slideId: string; x: number; y: number } | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const deckTitleInputRef = useRef<HTMLInputElement>(null);
  const slideRefs = useRef<Map<string, HTMLDivElement>>(new Map());

  const activeDeck = decks.find(d => d.id === activeDeckId);

  useEffect(() => {
    if (renamingDeckId && deckTitleInputRef.current) {
      deckTitleInputRef.current.focus();
      deckTitleInputRef.current.select();
    }
  }, [renamingDeckId]);

  // Close PPTs dropdown on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setShowDeckDropdown(false);
      }
    };
    window.addEventListener('mousedown', handler);
    return () => window.removeEventListener('mousedown', handler);
  }, []);

  // Load decks on mount — top deck is automatically active
  useEffect(() => {
    loadDecks().then(savedDecks => {
      if (savedDecks?.length) {
        setDecks(savedDecks);
        setActiveDeckId(savedDecks[0].id);
        if (savedDecks[0].slides?.length) {
          setLiveContent({
            type: 'slide',
            url: savedDecks[0].slides[0].url,
            mediaType: savedDecks[0].slides[0].mediaType || (savedDecks[0].slides[0].blob?.type?.startsWith('video/') ? 'video' : 'image'),
          });
        }
      } else {
        loadSlides().then(savedSlides => {
          if (savedSlides?.length) {
            const d: Deck = { id: crypto.randomUUID(), title: 'Main Deck', slides: savedSlides };
            setDecks([d]);
            setActiveDeckId(d.id);
          }
        });
      }
    });
  }, [setDecks, setActiveDeckId, setLiveContent]);

  // Keyboard shortcuts (Multi-select Shift+Arrow forward & backward, Star Key toggle, Delete, Copy, Paste, Undo)
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName?.toLowerCase();
      if (tag === 'input' || tag === 'textarea') return;
      const ctrl = e.ctrlKey || e.metaKey;

      if (ctrl && e.key.toLowerCase() === 'c') { e.preventDefault(); copySlide(); }
      else if (ctrl && e.key.toLowerCase() === 'v') { e.preventDefault(); pasteSlide(); }
      else if (ctrl && e.key.toLowerCase() === 'z') { e.preventDefault(); undo(); }
      else if ((e.key === 'Delete' || e.key === 'Backspace') && (selectedSlideId || selectedSlideIds.length)) { e.preventDefault(); deleteSlide(); }
      else if (e.key === '*' || e.key.toLowerCase() === 's') { e.preventDefault(); toggleKeySlide(); }
      else if (e.shiftKey && (e.key === 'ArrowRight' || e.key === 'ArrowDown')) {
        e.preventDefault();
        if (slides.length === 0) return;
        const anchorId = selectionAnchorId || selectedSlideId || slides[0].id;
        const cursorId = selectionCursorId || selectedSlideId || anchorId;
        const anchorIdx = Math.max(0, slides.findIndex(s => s.id === anchorId));
        const cursorIdx = Math.max(0, slides.findIndex(s => s.id === cursorId));

        if (cursorIdx < slides.length - 1) {
          const newCursorIdx = cursorIdx + 1;
          const from = Math.min(anchorIdx, newCursorIdx);
          const to = Math.max(anchorIdx, newCursorIdx);
          const range = slides.slice(from, to + 1).map(s => s.id);
          setSelectedSlideIds(range);
          setSelectionCursorId(slides[newCursorIdx].id);
          if (!selectionAnchorId) setSelectionAnchorId(anchorId);
        }
      }
      else if (e.shiftKey && (e.key === 'ArrowLeft' || e.key === 'ArrowUp')) {
        e.preventDefault();
        if (slides.length === 0) return;
        const anchorId = selectionAnchorId || selectedSlideId || slides[0].id;
        const cursorId = selectionCursorId || selectedSlideId || anchorId;
        const anchorIdx = Math.max(0, slides.findIndex(s => s.id === anchorId));
        const cursorIdx = Math.max(0, slides.findIndex(s => s.id === cursorId));

        if (cursorIdx > 0) {
          const newCursorIdx = cursorIdx - 1;
          const from = Math.min(anchorIdx, newCursorIdx);
          const to = Math.max(anchorIdx, newCursorIdx);
          const range = slides.slice(from, to + 1).map(s => s.id);
          setSelectedSlideIds(range);
          setSelectionCursorId(slides[newCursorIdx].id);
          if (!selectionAnchorId) setSelectionAnchorId(anchorId);
        }
      }
      else if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectionCursorId(null);
        setSelectionAnchorId(null);
        navigateSlide(1);
      }
      else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectionCursorId(null);
        setSelectionAnchorId(null);
        navigateSlide(-1);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [copySlide, pasteSlide, undo, deleteSlide, navigateSlide, toggleKeySlide, selectedSlideId, selectedSlideIds, slides, setSelectedSlideIds, selectionAnchorId, selectionCursorId]);

  // Unified Auto-scroll to active / selected / live slide
  useEffect(() => {
    const targetId = selectionCursorId || selectedSlideId || (liveContent.type === 'slide' ? slides.find(s => s.url === liveContent.url)?.id : null) || (slides[currentSlideIndex]?.id);
    if (!targetId) return;
    const el = slideRefs.current.get(targetId);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, [selectedSlideId, selectionCursorId, selectedSlideIds, liveContent.url, currentSlideIndex, slides]);

  const handleStartRenameDeck = (id: string, title: string) => { setRenamingDeckId(id); setDeckTitleText(title); };
  const handleFinishDeckRename = () => { if (renamingDeckId && deckTitleText.trim()) renameDeck(renamingDeckId, deckTitleText.trim()); setRenamingDeckId(null); };

  const processFiles = useCallback(async (files: FileList | File[], newDeck = true) => {
    // Filter out audio & video files from PPT file upload / drop area
    const list = Array.from(files).filter(f =>
      !f.type.startsWith('audio/') &&
      !f.type.startsWith('video/') &&
      !/\.(mp3|wav|ogg|m4a|aac|flac|wma|opus|webm|mp4|mkv|mov|avi)$/i.test(f.name)
    );
    if (list.length === 0) return;

    setIsProcessing(true);
    const title = list[0] ? list[0].name.replace(/\.[^/.]+$/, '') : `Deck ${decks.length + 1}`;
    const shouldCreateNewDeck = newDeck && decks.length === 0;
    const newSlides: SlideItem[] = shouldCreateNewDeck ? [] : [...useStore.getState().slides];

    for (const file of list) {
      const ext = file.name.split('.').pop()?.toLowerCase();
      if (file.type === 'application/pdf' || ext === 'pdf') {
        const pdf = await pdfjsLib.getDocument({ data: await file.arrayBuffer() }).promise;
        for (let i = 1; i <= pdf.numPages; i++) {
          const page = await pdf.getPage(i);
          const vp = page.getViewport({ scale: 2.0 });
          const canvas = document.createElement('canvas');
          const ctx = canvas.getContext('2d');
          if (!ctx) continue;
          canvas.width = vp.width; canvas.height = vp.height;
          await page.render({ canvasContext: ctx, canvas, viewport: vp }).promise;
          const blob = await new Promise<Blob | null>(r => canvas.toBlob(r, 'image/jpeg', 0.85));
          if (blob) newSlides.push({ id: crypto.randomUUID(), url: URL.createObjectURL(blob), blob, pageNum: newSlides.length + 1, isKey: false, mediaType: 'image' });
        }
      } else if (ext === 'pptx' || ext === 'ppt') {
        const ph = await createPptxPlaceholderSlide(file.name);
        newSlides.push({ id: crypto.randomUUID(), url: ph.url, blob: ph.blob, pageNum: newSlides.length + 1, isKey: false, mediaType: 'image' });
      } else if (file.type.startsWith('image/')) {
        newSlides.push({ id: crypto.randomUUID(), url: URL.createObjectURL(file), blob: file, pageNum: newSlides.length + 1, isKey: false, mediaType: 'image' });
      }
    }
    if (shouldCreateNewDeck) addDeck(title, newSlides); else setSlides(newSlides);
    setIsProcessing(false);
  }, [decks.length, addDeck, setSlides]);

  const onDragOver = useCallback((e: React.DragEvent) => { if (e.dataTransfer.types.includes('Files')) { e.preventDefault(); e.stopPropagation(); setIsDragging(true); } }, []);
  const onDragLeave = useCallback((e: React.DragEvent) => { e.preventDefault(); setIsDragging(false); }, []);
  const onDrop = useCallback((e: React.DragEvent) => { e.preventDefault(); e.stopPropagation(); setIsDragging(false); if (e.dataTransfer.files?.length) processFiles(e.dataTransfer.files, false); }, [processFiles]);

  const keyCount = slides.filter(s => s.isKey).length;

  // Open context menu from the ⋮ button
  const openCtxMenu = (slideId: string, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setSelectedSlideId(slideId);
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    setCtxMenu({ slideId, x: rect.left, y: rect.bottom + 4 });
  };

  const handleSlideClick = (slideId: string, e: React.MouseEvent) => {
    if (e.ctrlKey || e.metaKey) {
      const exists = selectedSlideIds.includes(slideId);
      const updated = exists ? selectedSlideIds.filter(id => id !== slideId) : [...selectedSlideIds, slideId];
      setSelectedSlideIds(updated.length ? updated : [slideId]);
      setSelectionAnchorId(slideId);
      setSelectionCursorId(slideId);
    } else if (e.shiftKey && slides.length > 0) {
      const anchorId = selectionAnchorId || selectedSlideId || slides[0].id;
      const startIdx = slides.findIndex(s => s.id === anchorId);
      const endIdx = slides.findIndex(s => s.id === slideId);
      if (startIdx >= 0 && endIdx >= 0) {
        const from = Math.min(startIdx, endIdx);
        const to = Math.max(startIdx, endIdx);
        const range = slides.slice(from, to + 1).map(s => s.id);
        setSelectedSlideIds(range);
        setSelectionAnchorId(anchorId);
        setSelectionCursorId(slideId);
      }
    } else {
      setSelectedSlideId(slideId);
      setSelectionAnchorId(slideId);
      setSelectionCursorId(slideId);
    }
    const clickedSlide = slides.find(s => s.id === slideId);
    if (clickedSlide) {
      setLiveContent({
        type: 'slide',
        url: clickedSlide.url,
        mediaType: clickedSlide.mediaType || (clickedSlide.blob?.type?.startsWith('video/') || clickedSlide.url.includes('video') ? 'video' : 'image'),
      });
    }
  };

  const [draggedDeckId, setDraggedDeckId] = useState<string | null>(null);

  const handleDeckDragStart = (id: string, e: React.DragEvent) => {
    e.stopPropagation();
    setDraggedDeckId(id);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', id);
  };

  const handleDeckDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.dropEffect = 'move';
  };

  const handleDeckDrop = (targetDeckId: string, e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!draggedDeckId || draggedDeckId === targetDeckId) {
      setDraggedDeckId(null);
      return;
    }

    const oldIdx = decks.findIndex(d => d.id === draggedDeckId);
    const newIdx = decks.findIndex(d => d.id === targetDeckId);
    if (oldIdx >= 0 && newIdx >= 0) {
      const updated = [...decks];
      const [moved] = updated.splice(oldIdx, 1);
      updated.splice(newIdx, 0, moved);
      setDecks(updated);
    }
    setDraggedDeckId(null);
  };

  return (
    <div className={`ppt-flow glass-panel ${isDragging ? 'ppt-drag-over' : ''}`} onDragOver={onDragOver} onDragLeave={onDragLeave} onDrop={onDrop}>
      {/* PPTs ▼ header */}
      <div className="ppt-main-header" ref={dropdownRef}>
        <div className="ppt-deck-selector">
          <h2 onClick={(e) => { e.stopPropagation(); setShowDeckDropdown(!showDeckDropdown); }}>
            PPTs <span className="arrow-down">▼</span>
          </h2>
          <div className="deck-title-wrapper" onDoubleClick={() => activeDeckId && activeDeck && handleStartRenameDeck(activeDeckId, activeDeck.title)}>
            {renamingDeckId === activeDeckId ? (
              <input ref={deckTitleInputRef} type="text" className="deck-rename-input" value={deckTitleText}
                onChange={e => setDeckTitleText(e.target.value)} onBlur={handleFinishDeckRename}
                onKeyDown={e => { if (e.key === 'Enter') handleFinishDeckRename(); else if (e.key === 'Escape') setRenamingDeckId(null); }} />
            ) : (
              <span className="current-deck-name" title="Double click to rename">{activeDeck ? activeDeck.title : 'No Deck'}</span>
            )}
          </div>
        </div>
        <div className="ppt-header-actions">
          <button className="add-btn" onClick={() => fileInputRef.current?.click()} title="Upload Presentation Deck">+</button>
        </div>

        {showDeckDropdown && (
          <div className="deck-dropdown-menu">
            <div className="deck-dropdown-header">Uploaded Decks (Drag ⋮⋮ to reorder)</div>
            {decks.length === 0 ? <div className="deck-dropdown-empty">No decks uploaded yet</div> : decks.map(deck => (
              <div
                key={deck.id}
                draggable
                onDragStart={(e) => handleDeckDragStart(deck.id, e)}
                onDragOver={handleDeckDragOver}
                onDrop={(e) => handleDeckDrop(deck.id, e)}
                onDragEnd={() => setDraggedDeckId(null)}
                className={`deck-dropdown-item ${deck.id === activeDeckId ? 'active' : ''} ${draggedDeckId === deck.id ? 'dragging' : ''}`}
                onClick={() => { setActiveDeckId(deck.id); setShowDeckDropdown(false); }}
                onDoubleClick={(e) => { e.stopPropagation(); handleStartRenameDeck(deck.id, deck.title); }}
              >
                <span className="deck-drag-handle" title="Drag to reorder deck">⋮⋮</span>
                <div className="deck-dropdown-info">
                  {renamingDeckId === deck.id ? (
                    <input ref={deckTitleInputRef} type="text" className="deck-rename-input dropdown-rename" value={deckTitleText}
                      onChange={e => setDeckTitleText(e.target.value)} onBlur={handleFinishDeckRename}
                      onKeyDown={e => { if (e.key === 'Enter') handleFinishDeckRename(); else if (e.key === 'Escape') setRenamingDeckId(null); }}
                      onClick={e => e.stopPropagation()} />
                  ) : (
                    <div className="deck-title-row">
                      <span className="deck-icon">📊</span>
                      <span className="deck-title" title="Double click to rename">{deck.title}</span>
                    </div>
                  )}
                  <span className="deck-slide-count">{deck.slides.length} slides</span>
                </div>
                <button className="delete-deck-btn" title="Delete deck" onClick={(e) => { e.stopPropagation(); deleteDeck(deck.id); }}>🗑️</button>
              </div>
            ))}
            <div className="deck-dropdown-add" onClick={() => { setShowDeckDropdown(false); fileInputRef.current?.click(); }}>➕ Upload New Deck</div>
          </div>
        )}

        <input type="file" ref={fileInputRef} multiple accept={SLIDE_ACCEPT} onChange={e => { if (e.target.files) { processFiles(e.target.files, false); e.target.value = ''; } }} style={{ display: 'none' }} />
      </div>

      {/* Sub-heading */}
      <div className="ppt-sub-header"><h3>Slides</h3><span className="badge">{slides.length}</span></div>

      <label className="key-only-toggle">
        <input type="checkbox" checked={keyOnly} onChange={e => setKeyOnly(e.target.checked)} />
        <span className="key-only-label">Key slides only</span>
        {keyCount > 0 && <span className="key-count">{keyCount}</span>}
      </label>

      {isProcessing && <div className="ppt-processing-banner">⏳ Processing deck...</div>}
      {slides.length === 0 && !isProcessing && (
        <div className="ppt-drop-hint" onClick={() => fileInputRef.current?.click()}>📂 Drop PPTX / PDF / images here, or click +</div>
      )}

      {/* Slide List */}
      <SlideListContainer onScroll={() => setCtxMenu(null)}>
        {slides.map(slide => {
          const isSelected = selectedSlideIds.includes(slide.id) || selectedSlideId === slide.id;
          return (
            <DroppableSlideItem
              key={slide.id}
              slide={slide}
              isSelected={isSelected}
              isLive={liveContent?.url === slide.url}
              onClick={(e) => handleSlideClick(slide.id, e)}
              onToggleKey={(e) => { e.stopPropagation(); toggleKeySlide(slide.id); }}
              onOpenCtxMenu={(e) => openCtxMenu(slide.id, e)}
              setRef={(el) => {
                if (el) slideRefs.current.set(slide.id, el);
                else slideRefs.current.delete(slide.id);
              }}
            />
          );
        })}
      </SlideListContainer>

      {/* Context menu via React Portal — no clipping, no race conditions */}
      {ctxMenu && (
        <SlideContextMenu
          slideId={ctxMenu.slideId}
          pos={{ x: ctxMenu.x, y: ctxMenu.y }}
          copiedSlide={copiedSlide}
          onClose={() => setCtxMenu(null)}
          onDelete={deleteSlide}
          onCopy={copySlide}
          onPaste={pasteSlide}
          onUndo={undo}
        />
      )}

      <div className="slide-nav-hint">← → Navigate • Click ⋮ for slide options</div>
    </div>
  );
}
