import { useRef, useState, useEffect } from 'react';
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

export function PresentationArea() {
  const { liveContent } = useStore();
  const { isOver, setNodeRef } = useDroppable({ id: 'presentation-drop' });
  const videoRef = useRef<HTMLVideoElement>(null);
  const presentingRef = useRef<Window | null>(null);

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

  // Handshake & command listener for BroadcastChannel
  useEffect(() => {
    const channel = new BroadcastChannel('presentdeck-sync');
    channel.onmessage = (e) => {
      if (!e.data) return;
      if (e.data.action === 'REQUEST_SYNC') {
        setIsLiveWindowOpen(true);
        const currentLive = useStore.getState().liveContent;
        if (currentLive.type !== 'none') {
          channel.postMessage(currentLive);
        }
      } else if (e.data.action === 'LIVE_WINDOW_ACTIVE') {
        setIsLiveWindowOpen(true);
      } else if (e.data.action === 'LIVE_WINDOW_CLOSED') {
        setIsLiveWindowOpen(false);
      } else if (e.data.action === 'KEY_COMMAND') {
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
    return () => channel.close();
  }, [liveContent, isPlaying, isMuted, isLiveWindowOpen]);

  // Dynamic Audio Routing: Mute local video when Live window is open; play local sound when not live!
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    if (isLiveWindowOpen) {
      video.muted = true;
    } else {
      video.muted = isMuted;
    }
  }, [isLiveWindowOpen, isMuted, liveContent.url]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    video.currentTime = 0;
    const playPromise = video.play();
    if (playPromise !== undefined) {
      playPromise.catch(() => {
        video.muted = true;
        video.play().catch(() => {});
      });
    }

    const channel = new BroadcastChannel('presentdeck-sync');

    const handleTimeUpdate = () => {
      setCurrentTime(video.currentTime);
    };

    const handleLoadedMetadata = () => {
      setDuration(video.duration || 0);
      if (video.paused) {
        video.currentTime = 0.1;
      }
    };

    const handlePlay = () => {
      setIsPlaying(true);
      if (liveContent.type !== 'none') {
        channel.postMessage({
          ...liveContent,
          currentTime: video.currentTime,
          isPlaying: true,
        });
      }
    };

    const handlePause = () => {
      setIsPlaying(false);
      if (liveContent.type !== 'none') {
        channel.postMessage({
          ...liveContent,
          currentTime: video.currentTime,
          isPlaying: false,
        });
      }
    };

    video.addEventListener('timeupdate', handleTimeUpdate);
    video.addEventListener('loadedmetadata', handleLoadedMetadata);
    video.addEventListener('play', handlePlay);
    video.addEventListener('pause', handlePause);

    return () => {
      video.removeEventListener('timeupdate', handleTimeUpdate);
      video.removeEventListener('loadedmetadata', handleLoadedMetadata);
      video.removeEventListener('play', handlePlay);
      video.removeEventListener('pause', handlePause);
      channel.close();
    };
  }, [liveContent.url, isLiveVideo]);

  const handleGoLive = async () => {
    try {
      if ('getScreenDetails' in window) {
        await (window as any).getScreenDetails();
      }
    } catch { /* unsupported */ }

    const liveUrl = `${window.location.origin}${window.location.pathname}#presenting`;

    if (presentingRef.current && !presentingRef.current.closed) {
      presentingRef.current.focus();
    } else {
      presentingRef.current = window.open(
        liveUrl,
        'PresentDeck-Live',
        'width=960,height=540,menubar=no,toolbar=no,location=no,status=no'
      );
    }

    const currentLive = useStore.getState().liveContent;
    if (currentLive.type !== 'none') {
      const channel = new BroadcastChannel('presentdeck-sync');
      [50, 150, 350, 750].forEach(delay => {
        setTimeout(() => {
          channel.postMessage(currentLive);
          try {
            localStorage.setItem('presentdeck_live_cache', JSON.stringify(currentLive));
          } catch {}
        }, delay);
      });
    }
  };

  // Keyboard shortcuts: Space (Play/Pause), Left Arrow (-5s), Right Arrow (+5s), M (Mute)
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
  }, [liveContent, isPlaying, isMuted]);

  const togglePlay = () => {
    if (!videoRef.current) return;
    if (videoRef.current.paused) {
      videoRef.current.play().catch(console.error);
    } else {
      videoRef.current.pause();
    }
  };

  const toggleMute = () => {
    if (!videoRef.current) return;
    const newMuted = !isMuted;
    setIsMuted(newMuted);
    videoRef.current.muted = newMuted;
  };

  const skipTime = (seconds: number) => {
    if (!videoRef.current) return;
    const newTime = Math.max(0, Math.min(videoRef.current.duration || 0, videoRef.current.currentTime + seconds));
    videoRef.current.currentTime = newTime;
    const channel = new BroadcastChannel('presentdeck-sync');
    channel.postMessage({
      ...liveContent,
      currentTime: newTime,
      isPlaying: !videoRef.current.paused,
    });
    channel.close();
  };

  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    const seekTime = parseFloat(e.target.value);
    setCurrentTime(seekTime);
    if (videoRef.current) {
      videoRef.current.currentTime = seekTime;
      const channel = new BroadcastChannel('presentdeck-sync');
      channel.postMessage({
        ...liveContent,
        currentTime: seekTime,
        isPlaying: !videoRef.current.paused,
      });
      channel.close();
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
              muted
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
