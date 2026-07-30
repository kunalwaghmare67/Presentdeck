import { useEffect, useState, useRef } from 'react';
import type { LiveContent } from '../types';
import './PresentingScreen.css';

function getURLParamsContent(): LiveContent | null {
  try {
    const hash = window.location.hash || '';
    const search = window.location.search || '';
    const targetString = hash.includes('?') ? hash.split('?')[1] : search.startsWith('?') ? search.substring(1) : '';

    if (targetString) {
      const params = new URLSearchParams(targetString);
      const url = params.get('url');
      const type = params.get('type') as any;
      const mediaType = params.get('mediaType') || undefined;

      if (url && type) {
        return { type, url: decodeURIComponent(url), mediaType };
      }
    }
  } catch {}
  return null;
}

export function PresentingScreen() {
  const [content, setContent] = useState<LiveContent>(() => {
    const urlContent = getURLParamsContent();
    if (urlContent) return urlContent;

    try {
      if ((window as any).LIVE_CONTENT?.url) {
        return (window as any).LIVE_CONTENT;
      }
      if (window.opener && (window.opener as any).LIVE_CONTENT?.url) {
        return (window.opener as any).LIVE_CONTENT;
      }
      const cached = localStorage.getItem('presentdeck_live_cache');
      return cached ? JSON.parse(cached) : { type: 'none', url: '' };
    } catch {
      return { type: 'none', url: '' };
    }
  });

  const videoRef = useRef<HTMLVideoElement>(null);

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

    // Broadcast active status & request sync
    channel.postMessage({ action: 'LIVE_WINDOW_ACTIVE' });
    channel.postMessage({ action: 'REQUEST_SYNC' });

    // Poll URL, window.opener, or global LIVE_CONTENT as fallback
    const interval = setInterval(() => {
      try {
        const urlParsed = getURLParamsContent();
        if (urlParsed && urlParsed.url && urlParsed.url !== content.url) {
          setContent(urlParsed);
          return;
        }
        const directContent = (window as any).LIVE_CONTENT || (window.opener as any)?.LIVE_CONTENT;
        if (directContent && directContent.url && directContent.url !== content.url) {
          setContent(directContent);
        }
      } catch {}
    }, 300);

    const handleUnload = () => {
      channel.postMessage({ action: 'LIVE_WINDOW_CLOSED' });
    };

    window.addEventListener('beforeunload', handleUnload);

    return () => {
      clearInterval(interval);
      window.removeEventListener('beforeunload', handleUnload);
      channel.postMessage({ action: 'LIVE_WINDOW_CLOSED' });
      channel.close();
    };
  }, [content.url]);

  // Sync video element playback time & play/pause state
  useEffect(() => {
    const video = videoRef.current;
    if (!video || !content) return;

    if (typeof content.currentTime === 'number') {
      if (Math.abs(video.currentTime - content.currentTime) > 0.5) {
        video.currentTime = content.currentTime;
      }
    }

    if (content.isPlaying === true && video.paused) {
      video.play().catch(() => {
        video.muted = true;
        video.play().catch(() => {});
      });
    } else if (content.isPlaying === false && !video.paused) {
      video.pause();
    }
  }, [content]);

  // Global Keyboard shortcuts in Live Window (Space, Left/Right arrows, M, Ctrl+L)
  useEffect(() => {
    const channel = new BroadcastChannel('presentdeck-sync');

    const handleKeyDown = (e: KeyboardEvent) => {
      // Ctrl+L for fullscreen
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'l') {
        e.preventDefault();
        if (!document.fullscreenElement) {
          document.documentElement.requestFullscreen().catch(() => {});
        } else {
          document.exitFullscreen().catch(() => {});
        }
        return;
      }

      if (e.key === ' ' || e.code === 'Space') {
        e.preventDefault();
        channel.postMessage({ action: 'KEY_COMMAND', key: 'Space' });
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        channel.postMessage({ action: 'KEY_COMMAND', key: 'ArrowLeft' });
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        channel.postMessage({ action: 'KEY_COMMAND', key: 'ArrowRight' });
      } else if (e.key.toLowerCase() === 'm') {
        e.preventDefault();
        channel.postMessage({ action: 'KEY_COMMAND', key: 'm' });
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      channel.close();
    };
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
        <img src={content.url} className="presenting-media" alt="Live View" />
      )}
      {isLiveVideo && (
        <video
          ref={videoRef}
          src={content.url}
          className="presenting-media"
          autoPlay
          loop
          playsInline
        />
      )}
    </div>
  );
}
