import { useEffect, useState } from 'react';
import type { LiveContent } from '../types';
import './PresentingScreen.css';

export function PresentingScreen() {
  const [content, setContent] = useState<LiveContent>(() => {
    try {
      const cached = localStorage.getItem('presentdeck_live_cache');
      return cached ? JSON.parse(cached) : { type: 'none', url: '' };
    } catch {
      return { type: 'none', url: '' };
    }
  });

  useEffect(() => {
    const channel = new BroadcastChannel('presentdeck-sync');
    channel.onmessage = (e) => {
      if (e.data && e.data.type) {
        setContent(e.data);
        try {
          localStorage.setItem('presentdeck_live_cache', JSON.stringify(e.data));
        } catch {}
      }
    };
    return () => channel.close();
  }, []);

  if (content.type === 'none' || !content.url) {
    return (
      <div className="presenting-root empty">
        <div style={{ color: '#b5bac1', fontSize: '1.1rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
          Standby — No Live Content Selected
        </div>
      </div>
    );
  }

  const isLiveVideo = content.type === 'video' ||
    (content.type === 'slide' && (
      content.mediaType === 'video' ||
      content.url.includes('video') ||
      content.url.includes('.mp4') ||
      content.url.includes('.webm') ||
      content.url.startsWith('data:video')
    ));

  return (
    <div className="presenting-root">
      {!isLiveVideo && (
        <img src={content.url} className="presenting-media" alt="" />
      )}
      {isLiveVideo && (
        <video src={content.url} className="presenting-media" autoPlay loop muted={false} />
      )}
    </div>
  );
}
