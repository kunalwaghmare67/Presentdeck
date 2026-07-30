import { useRef, useState, useEffect, useCallback } from 'react';
import { useDroppable } from '@dnd-kit/core';
import { useStore } from '../store';
import { useAuth } from '../context/AuthContext';
import { WorkflowManager } from './WorkflowManager';
import './PresentationArea.css';

function formatTime(seconds: number): string {
  if (isNaN(seconds) || seconds < 0) return '0:00';
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
}

/** Convert a blob: URL to a data: URL so it can cross window boundaries */
async function blobUrlToDataUrl(blobUrl: string): Promise<string> {
  if (!blobUrl || !blobUrl.startsWith('blob:')) return blobUrl;
  try {
    const res = await fetch(blobUrl);
    const blob = await res.blob();
    return new Promise<string>((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve((reader.result as string) || blobUrl);
      reader.onerror = () => resolve(blobUrl);
      reader.readAsDataURL(blob);
    });
  } catch {
    return blobUrl;
  }
}

export function PresentationArea() {
  const { liveContent } = useStore();
  const { isOver, setNodeRef } = useDroppable({ id: 'presentation-drop' });
  const videoRef = useRef<HTMLVideoElement>(null);
  const presentingRef = useRef<Window | null>(null);

  // ── Refs for stable access inside channel handlers ──
  const channelRef = useRef<BroadcastChannel | null>(null);
  const liveContentRef = useRef(liveContent);
  const isPlayingRef = useRef(false);
  const isMutedRef = useRef(false);
  const isLiveWindowOpenRef = useRef(false);
  const lastTimeSyncRef = useRef(0); // throttle timeupdate broadcasts

  const isLiveVideo = liveContent.type === 'video' ||
    (liveContent.type === 'slide' && (
      liveContent.mediaType === 'video' ||
      liveContent.url.includes('video') ||
      liveContent.url.includes('.mp4') ||
      liveContent.url.includes('.webm') ||
      liveContent.url.startsWith('data:video')
    ));

  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [isMuted, setIsMuted] = useState(false);
  const [isLiveWindowOpen, setIsLiveWindowOpen] = useState(false);

  // ── Keep refs in sync with state ──
  useEffect(() => { liveContentRef.current = liveContent; }, [liveContent]);
  useEffect(() => { isPlayingRef.current = isPlaying; }, [isPlaying]);
  useEffect(() => { isMutedRef.current = isMuted; }, [isMuted]);
  useEffect(() => { isLiveWindowOpenRef.current = isLiveWindowOpen; }, [isLiveWindowOpen]);

  // ── Helper: send a sync message to the live window ──
  const broadcastSync = useCallback((overrides?: Record<string, any>) => {
    const ch = channelRef.current;
    if (!ch) return;
    const video = videoRef.current;
    const content = liveContentRef.current;
    ch.postMessage({
      action: 'SYNC_STATE',
      type: content.type,
      url: content.url,
      mediaType: content.mediaType,
      currentTime: video ? video.currentTime : 0,
      isPlaying: isPlayingRef.current,
      isMuted: isMutedRef.current,
      ...overrides,
    });
  }, []);

  // ── Core actions (ref-safe) ──
  const togglePlay = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;
    if (video.paused) {
      video.play().catch(console.error);
    } else {
      video.pause();
    }
  }, []);

  const toggleMute = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;
    const newMuted = !isMutedRef.current;
    isMutedRef.current = newMuted;
    setIsMuted(newMuted);

    // If live window is open, audio plays there — send mute command
    if (isLiveWindowOpenRef.current) {
      broadcastSync({ isMuted: newMuted });
    } else {
      video.muted = newMuted;
    }
  }, [broadcastSync]);

  const skipTime = useCallback((seconds: number) => {
    const video = videoRef.current;
    if (!video) return;
    const newTime = Math.max(0, Math.min(video.duration || 0, video.currentTime + seconds));
    video.currentTime = newTime;
    setCurrentTime(newTime);
    broadcastSync({ currentTime: newTime });
  }, [broadcastSync]);

  // ── Single persistent BroadcastChannel ──
  useEffect(() => {
    const channel = new BroadcastChannel('presentdeck-sync');
    channelRef.current = channel;

    channel.onmessage = (e) => {
      if (!e.data) return;
      const { action } = e.data;

      if (action === 'REQUEST_SYNC') {
        isLiveWindowOpenRef.current = true;
        setIsLiveWindowOpen(true);

        // Send full state to newly opened live window instantly
        const content = liveContentRef.current;
        if (content.type !== 'none') {
          const video = videoRef.current;
          channel.postMessage({
            action: 'CONTENT_UPDATE',
            type: content.type,
            url: content.url,
            mediaType: content.mediaType,
            currentTime: video ? video.currentTime : 0,
            isPlaying: isPlayingRef.current,
            isMuted: isMutedRef.current,
          });
        }
      } else if (action === 'LIVE_WINDOW_ACTIVE') {
        isLiveWindowOpenRef.current = true;
        setIsLiveWindowOpen(true);
      } else if (action === 'LIVE_WINDOW_CLOSED') {
        isLiveWindowOpenRef.current = false;
        setIsLiveWindowOpen(false);
      } else if (action === 'KEY_COMMAND') {
        if (e.data.key === 'Space') {
          togglePlay();
        } else if (e.data.key === 'ArrowLeft') {
          skipTime(-5);
        } else if (e.data.key === 'ArrowRight') {
          skipTime(5);
        } else if (e.data.key === 'm') {
          toggleMute();
        }
      }
    };

    return () => {
      channel.close();
      channelRef.current = null;
    };
  }, []); // Mount once, never re-subscribe

  // ── Audio routing: mute local when live window is open ──
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    if (isLiveWindowOpen) {
      // Audio plays in the live window; mute local preview
      video.muted = true;
    } else {
      // No live window; local preview gets audio
      video.muted = isMuted;
    }
  }, [isLiveWindowOpen, isMuted, liveContent.url]);

  // ── Video element event wiring ──
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    // Reset for new content
    video.currentTime = 0;
    setCurrentTime(0);
    setIsPlaying(false);

    // Try autoplay
    const playPromise = video.play();
    if (playPromise !== undefined) {
      playPromise.catch(() => {
        // Autoplay blocked — try muted
        video.muted = true;
        video.play().catch(() => {});
      });
    }

    const handleTimeUpdate = () => {
      const t = video.currentTime;
      setCurrentTime(t);

      // Throttle sync broadcasts to ~10Hz (100ms) for frame-accurate 0-delay sync
      const now = Date.now();
      if (now - lastTimeSyncRef.current > 100) {
        lastTimeSyncRef.current = now;
        broadcastSync({ currentTime: t, isPlaying: !video.paused });
      }
    };

    const handleLoadedMetadata = () => {
      setDuration(video.duration || 0);
    };

    const handlePlay = () => {
      isPlayingRef.current = true;
      setIsPlaying(true);
      broadcastSync({ isPlaying: true, currentTime: video.currentTime });
    };

    const handlePause = () => {
      isPlayingRef.current = false;
      setIsPlaying(false);
      broadcastSync({ isPlaying: false, currentTime: video.currentTime });
    };

    const handleSeeked = () => {
      broadcastSync({ currentTime: video.currentTime, isPlaying: !video.paused });
    };

    video.addEventListener('timeupdate', handleTimeUpdate);
    video.addEventListener('loadedmetadata', handleLoadedMetadata);
    video.addEventListener('play', handlePlay);
    video.addEventListener('pause', handlePause);
    video.addEventListener('seeked', handleSeeked);

    return () => {
      video.removeEventListener('timeupdate', handleTimeUpdate);
      video.removeEventListener('loadedmetadata', handleLoadedMetadata);
      video.removeEventListener('play', handlePlay);
      video.removeEventListener('pause', handlePause);
      video.removeEventListener('seeked', handleSeeked);
    };
  }, [liveContent.url, isLiveVideo, broadcastSync]);

  // ── Broadcast content updates when live content changes (INSTANT 0ms) ──
  useEffect(() => {
    if (liveContent.type === 'none') return;
    const ch = channelRef.current;
    if (!ch) return;

    ch.postMessage({
      action: 'CONTENT_UPDATE',
      type: liveContent.type,
      url: liveContent.url,
      mediaType: liveContent.mediaType,
      currentTime: 0,
      isPlaying: false,
      isMuted: isMutedRef.current,
    });

    try {
      localStorage.setItem('presentdeck_live_cache', JSON.stringify(liveContent));
    } catch {}
  }, [liveContent.url, liveContent.type]);

  const handleGoLive = () => {
    // Synchronous call to window.open prevents browser popup blocker (about:blank#blocked)
    const currentLive = useStore.getState().liveContent;
    // Uses #presenting hash navigation or presenting.html multi-entry routing
    const liveUrl = `${window.location.origin}${window.location.pathname}#presenting`;

    const win = window.open(
      liveUrl,
      'PresentDeck-Live',
      'width=960,height=540,menubar=no,toolbar=no,location=no,status=no'
    );

    if (win) {
      try {
        (win as any).LIVE_CONTENT = currentLive;
      } catch {}
      presentingRef.current = win;
    }

    // Send content to live window immediately when opened
    if (currentLive.type !== 'none') {
      const ch = channelRef.current;
      if (ch) {
        [20, 100, 300].forEach(delay => {
          setTimeout(() => {
            if (win) {
              try { (win as any).LIVE_CONTENT = currentLive; } catch {}
            }
            ch.postMessage({
              action: 'CONTENT_UPDATE',
              type: currentLive.type,
              url: currentLive.url,
              mediaType: currentLive.mediaType,
              currentTime: videoRef.current?.currentTime || 0,
              isPlaying: isPlayingRef.current,
              isMuted: isMutedRef.current,
            });
          }, delay);
        });
      }
      try {
        localStorage.setItem('presentdeck_live_cache', JSON.stringify(currentLive));
      } catch {}
    }
  };

  // ── Keyboard shortcuts ──
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const activeTag = (document.activeElement?.tagName || '').toLowerCase();
      if (activeTag === 'input' || activeTag === 'textarea' || activeTag === 'select') {
        return;
      }

      if (e.key === ' ' || e.code === 'Space') {
        e.preventDefault();
        togglePlay();
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        skipTime(-5);
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        skipTime(5);
      } else if (e.key.toLowerCase() === 'm') {
        e.preventDefault();
        toggleMute();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [togglePlay, skipTime, toggleMute]);

  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    const seekTime = parseFloat(e.target.value);
    setCurrentTime(seekTime);
    if (videoRef.current) {
      videoRef.current.currentTime = seekTime;
      // seeked event handler will broadcast
    }
  };

  const { currentUser, logout } = useAuth();

  return (
    <div className={`presentation-area glass-panel ${isOver ? 'drag-over' : ''}`}>
      <div className="presentation-header">
        <div className="status-indicator">
          <span className={`status-dot ${liveContent.type !== 'none' ? 'live' : ''}`} />
          <span className="status-label">{liveContent.type !== 'none' ? 'LIVE' : 'Standby'}</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          {currentUser && (
            <div className="user-session-badge" style={{ display: 'flex', alignItems: 'center', gap: '6px', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)', padding: '4px 10px', borderRadius: 'var(--radius-md)', fontSize: '0.78rem' }}>
              <span style={{ color: currentUser.role === 'master' ? '#fbbf24' : '#818cf8', fontWeight: 600 }}>
                {currentUser.role === 'master' ? '👑 Master' : 'Operator'}
              </span>
              <span style={{ color: 'var(--text-secondary)' }}>({currentUser.username})</span>
              <button
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  logout();
                }}
                title="Logout"
                style={{ background: 'rgba(239,68,68,0.15)', border: 'none', color: '#ef4444', cursor: 'pointer', padding: '2px 6px', borderRadius: '4px', fontSize: '0.75rem', marginLeft: '4px' }}
              >
                Logout ➔
              </button>
            </div>
          )}
          <WorkflowManager />
          <button className="go-live-btn" onClick={handleGoLive}>
            🖥 Go Live
          </button>
        </div>
      </div>

      <div ref={setNodeRef} className="preview-container">
        {liveContent.type === 'none' && (
          <div className="placeholder">
            <span className="placeholder-icon">🎬</span>
            <span>Drag media here or click a slide</span>
          </div>
        )}

        {liveContent.type !== 'none' && !isLiveVideo && (
          <img src={liveContent.url} className="preview-media" alt="Live" />
        )}

        {liveContent.type !== 'none' && isLiveVideo && (
          <div className="video-wrapper">
            <video
              ref={videoRef}
              src={liveContent.url}
              className="preview-media"
              autoPlay
              loop
              playsInline
              onClick={togglePlay}
            />

            {/* Video Playback Widget */}
            <div className="video-playback-widget">
              <div className="video-time-row">
                <span className="video-time-text">{formatTime(currentTime)}</span>
                <input
                  type="range"
                  className="video-seek-slider"
                  min={0}
                  max={duration || 100}
                  step={0.1}
                  value={currentTime}
                  onChange={handleSeek}
                />
                <span className="video-time-text">{formatTime(duration)}</span>
              </div>

              <div className="video-controls-row">
                <button className="v-btn" onClick={() => skipTime(-5)} title="Rewind 5s">
                  ⏪ -5s
                </button>
                <button className="v-btn v-play-main" onClick={togglePlay} title={isPlaying ? "Pause" : "Play"}>
                  {isPlaying ? '⏸' : '▶'}
                </button>
                <button className="v-btn" onClick={() => skipTime(5)} title="Forward 5s">
                  +5s ⏩
                </button>
                <button className="v-btn" onClick={toggleMute} title={isMuted ? "Unmute" : "Mute"}>
                  {isMuted ? '🔇 Muted' : '🔊 Sound On'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      <p className="help-text">💡 Drag the Live window onto your projector, then press F11 for full screen</p>
    </div>
  );
}
