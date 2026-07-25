import { DndContext, DragEndEvent, DragOverlay, pointerWithin, useSensor, useSensors, PointerSensor } from '@dnd-kit/core';
import { arrayMove } from '@dnd-kit/sortable';
import { useStore } from './store';
import { useAuth } from './context/AuthContext';
import { PPTFlow } from './components/PPTFlow';
import { MusicFlow } from './components/MusicFlow';
import { PresentationArea } from './components/PresentationArea';
import { PhotoArea } from './components/PhotoArea';
import { VideoArea } from './components/VideoArea';
import { LoginPage } from './components/LoginPage';
import { useState } from 'react';
import type { MediaItem, SlideItem } from './types';

export default function App() {
  const { currentUser } = useAuth();
  const setLiveContent = useStore(state => state.setLiveContent);
  const [activeItem, setActiveItem] = useState<MediaItem | null>(null);

  if (!currentUser) {
    return <LoginPage />;
  }

  // Zero-distance constraint so grabbing video/photo/slide is 100% instant
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 4,
      },
    })
  );

  const handleDragStart = (event: any) => {
    const data = event.active.data.current;
    if (data?.item) {
      setActiveItem({ id: String(event.active.id), url: data.item.url, type: data.item.type, name: data.item.name || '' });
    } else if (data?.slide) {
      setActiveItem({ id: String(event.active.id), url: data.slide.url, type: data.slide.mediaType || 'image', name: `Slide ${data.slide.pageNum}` });
    } else if (data) {
      setActiveItem({ id: String(event.active.id), url: data.url, type: data.type || 'image', name: data.name || '' });
    }
  };

  const handleDragEnd = (event: DragEndEvent) => {
    setActiveItem(null);
    const { over, active } = event;
    if (!over) return;

    const slides = useStore.getState().slides;
    const isSlideDragging = slides.some(s => s.id === active.id);

    if (isSlideDragging) {
      const oldIndex = slides.findIndex(s => s.id === active.id);
      const targetSlideId = String(over.id).replace('slide-drop-', '');
      const newIndex = slides.findIndex(s => s.id === targetSlideId || s.id === over.id);
      if (oldIndex >= 0 && newIndex >= 0 && oldIndex !== newIndex) {
        const updated = arrayMove(slides, oldIndex, newIndex);
        const reindexed = updated.map((s, i) => ({ ...s, pageNum: i + 1 }));
        useStore.getState().setSlides(reindexed);
      }
      return;
    }

    const data = active.data.current as any;
    const mediaUrl = data?.url || data?.item?.url;
    const mediaType = data?.type || data?.item?.type || 'image';
    if (!mediaUrl) return;

    if (over.id === 'presentation-drop') {
      setLiveContent({ type: mediaType, url: mediaUrl });
    } else if (over.id === 'ppt-list-drop' || String(over.id).startsWith('slide-drop-')) {
      const newSlide: SlideItem = {
        id: crypto.randomUUID(),
        url: mediaUrl,
        pageNum: 0,
        isKey: false,
        mediaType: mediaType === 'video' ? 'video' : 'image',
      };
      if (over.id === 'ppt-list-drop') {
        useStore.getState().insertSlides([newSlide]);
      } else {
        const targetSlideId = String(over.id).replace('slide-drop-', '');
        const targetIdx = slides.findIndex(s => s.id === targetSlideId);
        const insertAt = targetIdx >= 0 ? targetIdx + 1 : slides.length;
        useStore.getState().insertSlides([newSlide], insertAt);
      }
    }
  };

  return (
    <DndContext
      sensors={sensors}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      collisionDetection={pointerWithin}
    >
      <div className="layout-container">
        <aside className="col-ppt">
          <PPTFlow />
        </aside>
        <aside className="col-music">
          <MusicFlow />
        </aside>
        <main className="col-main">
          <div className="presentation-wrapper">
            <PresentationArea />
          </div>
          <div className="media-wrapper">
            <PhotoArea />
            <VideoArea />
          </div>
        </main>
      </div>

      <DragOverlay dropAnimation={null}>
        {activeItem && (
          <div style={{ width: 120, height: 68, borderRadius: 8, overflow: 'hidden', border: '2px solid #00a8fc', boxShadow: '0 10px 30px rgba(0,0,0,0.8)', background: '#1e1f22', pointerEvents: 'none' }}>
            {activeItem.type === 'image' ? (
              <img src={activeItem.url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', pointerEvents: 'none' }} />
            ) : (
              <video src={activeItem.url} muted style={{ width: '100%', height: '100%', objectFit: 'cover', pointerEvents: 'none' }} />
            )}
          </div>
        )}
      </DragOverlay>
    </DndContext>
  );
}
