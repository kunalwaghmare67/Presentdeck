import { useEffect, useRef, useState, useCallback } from 'react';
import { useDraggable } from '@dnd-kit/core';
import { useStore } from '../store';
import { savePhoto, loadPhotos, deletePhoto } from '../db';
import type { MediaItem } from '../types';
import './PhotoArea.css';

function PhotoItem({ item, isSelected, onSelect, onDelete }: { item: MediaItem; isSelected: boolean; onSelect: (id: string) => void; onDelete: (id: string) => void }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: `photo-${item.id}`,
    data: { type: 'image', url: item.url, id: item.id, name: item.name },
  });

  const style = {
    opacity: isDragging ? 0.3 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...listeners}
      {...attributes}
      className={`photo-item ${isSelected ? 'selected' : ''}`}
      onClick={(e) => {
        e.stopPropagation();
        onSelect(item.id);
      }}
      onKeyDown={(e) => {
        if (e.key === ' ' || e.code === 'Space') {
          e.preventDefault();
        }
      }}
    >
      <img src={item.url} alt={item.name} />
      <button
        className="delete-media-btn"
        title="Delete Photo"
        onClick={(e) => {
          e.stopPropagation();
          onDelete(item.id);
        }}
      >
        🗑️
      </button>
    </div>
  );
}

export function PhotoArea() {
  const { photos, setPhotos, selectedMediaId, setSelectedMediaId, deletePhotoItem, copyMedia, undoPhoto } = useStore();
  const fileRef = useRef<HTMLInputElement>(null);
  const [isDraggingOver, setIsDraggingOver] = useState(false);

  useEffect(() => {
    loadPhotos().then(data => { if (data.length) setPhotos(data); });
  }, [setPhotos]);

  // Key shortcuts (Delete/Backspace, Ctrl+C, Ctrl+Z)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName?.toLowerCase();
      if (tag === 'input' || tag === 'textarea') return;

      const isCtrlOrCmd = e.ctrlKey || e.metaKey;

      if (isCtrlOrCmd && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        undoPhoto();
        return;
      }

      if (!selectedMediaId) return;
      const isPhotoSelected = photos.some(p => p.id === selectedMediaId);
      if (!isPhotoSelected) return;

      if (isCtrlOrCmd && e.key.toLowerCase() === 'c') {
        e.preventDefault();
        copyMedia(selectedMediaId);
      } else if (e.key === 'Delete' || e.key === 'Backspace') {
        e.preventDefault();
        handleDeletePhoto(selectedMediaId);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedMediaId, photos, copyMedia, undoPhoto]);

  const handleDeletePhoto = (id: string) => {
    deletePhotoItem(id);
    deletePhoto(id).catch(console.error);
  };

  const processFileList = useCallback((files: FileList | File[]) => {
    Array.from(files).forEach(file => {
      if (!file.type.startsWith('image/')) return;
      const reader = new FileReader();
      reader.onload = (ev) => {
        const url = ev.target?.result as string;
        const item: MediaItem = { id: crypto.randomUUID(), url, type: 'image', name: file.name };
        const updated = [...useStore.getState().photos, item];
        setPhotos(updated);
        savePhoto(item);
      };
      reader.readAsDataURL(file);
    });
  }, [setPhotos]);

  const handleUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      processFileList(e.target.files);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    if (e.dataTransfer.types.includes('Files')) {
      e.preventDefault();
      e.stopPropagation();
      setIsDraggingOver(true);
    }
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDraggingOver(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDraggingOver(false);
    if (e.dataTransfer.files?.length > 0) {
      processFileList(e.dataTransfer.files);
    }
  };

  return (
    <div
      className={`media-area glass-panel ${isDraggingOver ? 'media-drag-over' : ''}`}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      onClick={() => setSelectedMediaId(null)}
    >
      <div className="area-header">
        <div className="header-title-group">
          <h3>Photos</h3>
          <span className="badge">{photos.length}</span>
        </div>
        <button onClick={() => fileRef.current?.click()} className="add-btn">+</button>
        <input type="file" ref={fileRef} hidden accept="image/*" multiple onChange={handleUpload} />
      </div>
      <div className="media-grid">
        {photos.map(p => (
          <PhotoItem
            key={p.id}
            item={p}
            isSelected={selectedMediaId === p.id}
            onSelect={setSelectedMediaId}
            onDelete={handleDeletePhoto}
          />
        ))}
      </div>
    </div>
  );
}
