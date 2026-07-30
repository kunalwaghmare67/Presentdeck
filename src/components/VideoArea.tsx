import { useEffect, useRef, useState, useCallback } from 'react';
import { useDraggable } from '@dnd-kit/core';
import { useStore } from '../store';
import { saveVideo, loadVideos, deleteVideo } from '../db';
import type { MediaItem } from '../types';
import './VideoArea.css';

function VideoItem({ item, isSelected, onSelect, onDelete }: { item: MediaItem; isSelected: boolean; onSelect: (id: string) => void; onDelete: (id: string) => void }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `video-${item.id}`,
    data: { type: 'video', url: item.url, id: item.id, name: item.name },
  });

  const videoRef = useRef<HTMLVideoElement>(null);

  const handleLoadedMetadata = () => {
    if (videoRef.current) {
      videoRef.current.currentTime = 0.1;
    }
  };

  return (
    <div
      ref={setNodeRef}
      style={{ opacity: isDragging ? 0.3 : 1 }}
      {...listeners}
      {...attributes}
      className={`video-item ${isSelected ? 'selected' : ''}`}
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
      <video
        ref={videoRef}
        src={item.url}
        muted
        preload="metadata"
        onLoadedMetadata={handleLoadedMetadata}
      />
      <div className="video-play-badge" title="Video file">▶</div>
      <button
        className="delete-media-btn"
        title="Delete Video"
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

export function VideoArea() {
  const { videos, setVideos, selectedMediaId, setSelectedMediaId, deleteVideoItem, copyMedia, undoVideo } = useStore();
  const fileRef = useRef<HTMLInputElement>(null);
  const [isDraggingOver, setIsDraggingOver] = useState(false);

  useEffect(() => {
    loadVideos().then(data => { if (data.length) setVideos(data); });
  }, [setVideos]);

  // Key shortcuts (Delete/Backspace, Ctrl+C, Ctrl+Z)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName?.toLowerCase();
      if (tag === 'input' || tag === 'textarea') return;

      const isCtrlOrCmd = e.ctrlKey || e.metaKey;

      if (isCtrlOrCmd && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        undoVideo();
        return;
      }

      if (!selectedMediaId) return;
      const isVideoSelected = videos.some(v => v.id === selectedMediaId);
      if (!isVideoSelected) return;

      if (isCtrlOrCmd && e.key.toLowerCase() === 'c') {
        e.preventDefault();
        copyMedia(selectedMediaId);
      } else if (e.key === 'Delete' || e.key === 'Backspace') {
        e.preventDefault();
        handleDeleteVideo(selectedMediaId);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedMediaId, videos, copyMedia, undoVideo]);

  const handleDeleteVideo = (id: string) => {
    deleteVideoItem(id);
    deleteVideo(id).catch(console.error);
  };

  const processFileList = useCallback((files: FileList | File[]) => {
    Array.from(files).forEach(file => {
      if (!file.type.startsWith('video/')) return;
      const url = URL.createObjectURL(file);
      const item: MediaItem = { id: crypto.randomUUID(), url, type: 'video', name: file.name, blob: file };
      const updated = [...useStore.getState().videos, item];
      setVideos(updated);
      saveVideo(item).catch(console.error);
    });
  }, [setVideos]);

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
          <h3>Videos</h3>
          <span className="badge">{videos.length}</span>
        </div>
        <button onClick={() => fileRef.current?.click()} className="add-btn">+</button>
        <input type="file" ref={fileRef} hidden accept="video/*" multiple onChange={handleUpload} />
      </div>
      <div className="media-grid">
        {videos.map(v => (
          <VideoItem
            key={v.id}
            item={v}
            isSelected={selectedMediaId === v.id}
            onSelect={setSelectedMediaId}
            onDelete={handleDeleteVideo}
          />
        ))}
      </div>
    </div>
  );
}
