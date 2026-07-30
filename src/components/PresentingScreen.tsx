import { useEffect, useState, useRef, useCallback } from 'react';
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
  const channelRef = useRef<BroadcastChannel | null>(null);
  const contentRef = useRef(content);

  // Keep content ref in sync
  useEffect(() => { contentRef.current = content; }, [content]);

  // ── Single persistent BroadcastChannel ──
  useEffect(() => {
    const channel = new BroadcastChannel('presentdeck-sync');
    channelRef.current = channel;

    channel.onmessage = (e) => {
      if (!e.data) return;
      const msg = e.data;

      if (msg.action === 'CONTENT_UPDATE') {
        // New content — update URL and playback state
        const newContent: LiveContent = {
          type: msg.type,
          url: msg.url,
          mediaType: msg.mediaType,
          isPlaying: msg.isPlaying,
          currentTime: msg.currentTime,
          isMuted: msg.isMuted,
        };
        setContent(newContent);
        try {
          localStorage.setItem('presentdeck_live_cache', JSON.stringify(newContent));
        } catch {}
      } else if (msg.action === 'SYNC_STATE') {
        // Playback sync — frame-accurate zero-delay state update
        const video = videoRef.current;
        if (!video) return;

        // Tight sync tolerance (80ms) to keep both screens frame-locked
        if (typeof msg.currentTime === 'number') {
          if (Math.abs(video.currentTime - msg.currentTime) > 0.08) {
            video.currentTime = msg.currentTime;
          }
        }

        // Sync play/pause
        if (msg.isPlaying === true) {
          if (video.paused) {
            if (typeof msg.currentTime === 'number') video.currentTime = msg.currentTime;
            video.play().catch(() => {
              video.muted = true;
              video.play().catch(() => {});
            });
          }
        } else if (msg.isPlaying === false && !video.paused) {
          if (typeof msg.currentTime === 'number') video.currentTime = msg.currentTime;
          video.pause();
        }

        // Sync mute
        if (typeof msg.isMuted === 'boolean') {
          video.muted = msg.isMuted;
        }
      } else if (msg.type && msg.url) {
        // Direct content message (from store.ts setLiveContent broadcast)
        const current = contentRef.current;
        if (msg.url !== current.url || msg.type !== current.type) {
          const newContent: LiveContent = {
            type: msg.type,
            url: msg.url,
            mediaType: msg.mediaType,
            isPlaying: msg.isPlaying,
            currentTime: msg.currentTime,
            isMuted: msg.isMuted,
          };
          setContent(newContent);
          try {
            localStorage.setItem('presentdeck_live_cache', JSON.stringify(newContent));
          } catch {}
        } else {
          // Same URL — just sync playback with 80ms tolerance
          const video = videoRef.current;
          if (video) {
            if (typeof msg.currentTime === 'number' && Math.abs(video.currentTime - msg.currentTime) > 0.08) {
              video.currentTime = msg.currentTime;
            }
            if (msg.isPlaying === true && video.paused) {
              if (typeof msg.currentTime === 'number') video.currentTime = msg.currentTime;
              video.play().catch(() => {
                video.muted = true;
                video.play().catch(() => {});
              });
            } else if (msg.isPlaying === false && !video.paused) {
              if (typeof msg.currentTime === 'number') video.currentTime = msg.currentTime;
              video.pause();
            }
            if (typeof msg.isMuted === 'boolean') {
              video.muted = msg.isMuted;
            }
          }
        }
      }
    };

    // Announce presence & request initial content
    channel.postMessage({ action: 'LIVE_WINDOW_ACTIVE' });
    channel.postMessage({ action: 'REQUEST_SYNC' });

    const handleUnload = () => {
      channel.postMessage({ action: 'LIVE_WINDOW_CLOSED' });
    };

    window.addEventListener('beforeunload', handleUnload);

    return () => {
      window.removeEventListener('beforeunload', handleUnload);
      channel.postMessage({ action: 'LIVE_WINDOW_CLOSED' });
      channel.close();
      channelRef.current = null;
    };
  }, []); // Mount once — never re-subscribe

  // ── Sync video on content state change (new URL) ──
  useEffect(() => {
    const video = videoRef.current;
    if (!video || !content || content.type === 'none') return;

    // Apply initial playback state from the content message
    const applyState = () => {
      if (typeof content.currentTime === 'number') {
        video.currentTime = content.currentTime;
      }

      if (typeof content.isMuted === 'boolean') {
        video.muted = content.isMuted;
      }

      if (content.isPlaying === true) {
        video.play().catch(() => {
          video.muted = true;
          video.play().catch(() => {});
        });
      } else if (content.isPlaying === false) {
        video.pause();
      }
    };

    // If metadata is already loaded, apply immediately; otherwise wait
    if (video.readyState >= 1) {
      applyState();
    } else {
      video.addEventListener('loadedmetadata', applyState, { once: true });
    }
  }, [content.url]); // Only when URL changes

  // ── Keyboard shortcuts in Live Window ──
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const ch = channelRef.current;
      if (!ch) return;

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
        ch.postMessage({ action: 'KEY_COMMAND', key: 'Space' });
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        ch.postMessage({ action: 'KEY_COMMAND', key: 'ArrowLeft' });
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        ch.postMessage({ action: 'KEY_COMMAND', key: 'ArrowRight' });
      } else if (e.key.toLowerCase() === 'm') {
        e.preventDefault();
        ch.postMessage({ action: 'KEY_COMMAND', key: 'm' });
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
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
