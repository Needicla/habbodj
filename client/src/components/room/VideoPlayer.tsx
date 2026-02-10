import { useRef, useCallback, useEffect, useState } from 'react';
import ReactPlayer from 'react-player';
import type { CurrentVideo, PlaybackSeekEvent } from '../../hooks/useRoom';

interface VideoPlayerProps {
  currentVideo: CurrentVideo | null;
  canControl: boolean; // true for host and moderators
  isPaused: boolean;
  seekEvent: PlaybackSeekEvent | null;
  onDuration: (duration: number) => void;
  onHostPause: () => void;
  onHostResume: () => void;
  onHostSeek: (position: number) => void;
}

export default function VideoPlayer({
  currentVideo,
  canControl,
  isPaused,
  seekEvent,
  onDuration,
  onHostPause,
  onHostResume,
  onHostSeek,
}: VideoPlayerProps) {
  const playerRef = useRef<ReactPlayer>(null);
  const [ready, setReady] = useState(false);
  const durationReported = useRef(false);

  // Local volume state (personal per user, not synced)
  const [volume, setVolume] = useState(0.8);
  const [muted, setMuted] = useState(false);
  const [showVolume, setShowVolume] = useState(false);

  // Track whether we're programmatically seeking (to ignore onSeek/onPause/onPlay callbacks)
  const isSyncing = useRef(false);
  // Track the last seek event timestamp we processed
  const lastSeekTimestamp = useRef(0);
  // Track last known progress for seek detection (host only)
  const lastProgress = useRef(0);

  // Seek to correct position for late joiners
  useEffect(() => {
    if (ready && currentVideo?.startedAt && playerRef.current) {
      // If paused, seek will be handled by the seekEvent effect
      if (!isPaused) {
        const elapsed = (Date.now() - new Date(currentVideo.startedAt).getTime()) / 1000;
        if (elapsed > 2) {
          isSyncing.current = true;
          playerRef.current.seekTo(elapsed, 'seconds');
          setTimeout(() => {
            isSyncing.current = false;
          }, 500);
        }
      }
    }
    durationReported.current = false;
  }, [currentVideo?.url, ready]);

  // Handle seek events from the server (for all users including host)
  useEffect(() => {
    if (
      seekEvent &&
      seekEvent.timestamp !== lastSeekTimestamp.current &&
      playerRef.current &&
      ready
    ) {
      lastSeekTimestamp.current = seekEvent.timestamp;
      isSyncing.current = true;
      playerRef.current.seekTo(seekEvent.position, 'seconds');
      lastProgress.current = seekEvent.position;
      setTimeout(() => {
        isSyncing.current = false;
      }, 500);
    }
  }, [seekEvent, ready]);

  const handleDuration = useCallback(
    (dur: number) => {
      if (!durationReported.current && dur > 0) {
        durationReported.current = true;
        onDuration(dur);
      }
    },
    [onDuration]
  );

  // Controller (host/mod): detect pause via onPause callback
  const handlePause = useCallback(() => {
    if (isSyncing.current) return;
    if (canControl) {
      onHostPause();
    }
    // Regular users: the playing prop will force it back to playing
  }, [canControl, onHostPause]);

  // Controller (host/mod): detect play/resume via onPlay callback
  const handlePlay = useCallback(() => {
    if (isSyncing.current) return;
    if (canControl) {
      onHostResume();
    }
    // Regular users: the playing prop will keep it in sync
  }, [canControl, onHostResume]);

  // Track progress for seek detection (controller only)
  const handleProgress = useCallback(
    (state: { playedSeconds: number }) => {
      if (!canControl || isSyncing.current) {
        lastProgress.current = state.playedSeconds;
        return;
      }

      const diff = Math.abs(state.playedSeconds - lastProgress.current);

      // If the position jumped by more than 3 seconds, the controller likely seeked
      if (diff > 3 && lastProgress.current > 0) {
        onHostSeek(state.playedSeconds);
      }

      lastProgress.current = state.playedSeconds;
    },
    [canControl, onHostSeek]
  );

  // Regular user: when they somehow interact (e.g. keyboard shortcuts), force sync back
  const handleSeek = useCallback(
    (seconds: number) => {
      if (isSyncing.current) return;
      if (!canControl && currentVideo?.startedAt && playerRef.current) {
        // Regular user tried to seek: snap back to the live position
        isSyncing.current = true;
        if (isPaused && seekEvent) {
          playerRef.current.seekTo(seekEvent.position, 'seconds');
        } else {
          const elapsed = (Date.now() - new Date(currentVideo.startedAt).getTime()) / 1000;
          playerRef.current.seekTo(elapsed, 'seconds');
        }
        setTimeout(() => {
          isSyncing.current = false;
        }, 500);
      }
    },
    [canControl, currentVideo?.startedAt, isPaused, seekEvent]
  );

  if (!currentVideo) {
    return (
      <div className="aspect-video bg-gray-900 rounded-xl flex items-center justify-center border border-gray-800">
        <div className="text-center">
          <div className="text-4xl mb-3 opacity-30">🎵</div>
          <p className="text-gray-500 text-lg">No video playing</p>
          <p className="text-gray-600 text-sm mt-1">Add a video to the queue to get started</p>
        </div>
      </div>
    );
  }

  return (
    <div className="aspect-video bg-black rounded-xl overflow-hidden border border-gray-800 relative group">
      <ReactPlayer
        ref={playerRef}
        url={currentVideo.url}
        playing={!isPaused}
        controls={canControl}
        volume={volume}
        muted={muted}
        width="100%"
        height="100%"
        onReady={() => setReady(true)}
        onDuration={handleDuration}
        onPause={handlePause}
        onPlay={handlePlay}
        onProgress={handleProgress}
        onSeek={handleSeek}
        progressInterval={1000}
        config={{
          youtube: {
            playerVars: {
              autoplay: 1,
              modestbranding: 1,
              disablekb: canControl ? 0 : 1,
            },
          },
        }}
      />
      {/* Regular user overlay: prevents clicking on player controls */}
      {!canControl && (
        <div className="absolute inset-0 z-10" />
      )}
      {/* Volume control for non-controller users (sits above the overlay) */}
      {!canControl && (
        <div
          className="absolute bottom-3 left-3 z-30 flex items-center gap-2"
          onMouseEnter={() => setShowVolume(true)}
          onMouseLeave={() => setShowVolume(false)}
        >
          <button
            onClick={() => setMuted((m) => !m)}
            className="w-9 h-9 flex items-center justify-center rounded-full bg-black/60 hover:bg-black/80 text-white transition-colors"
            title={muted ? 'Unmute' : 'Mute'}
          >
            {muted || volume === 0 ? (
              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 24 24" fill="currentColor">
                <path d="M3.63 3.63a.75.75 0 0 1 1.06 0L21 19.32a.75.75 0 0 1-1.06 1.06l-3.32-3.32A7.97 7.97 0 0 1 12 18.75V21a.75.75 0 0 1-1.28.53L6.22 17H3.75A.75.75 0 0 1 3 16.25v-8.5a.75.75 0 0 1 .75-.75h2.47l.91-.91L3.63 2.57a.75.75 0 0 1 0-1.06ZM9 8.12 7.28 9.84a.75.75 0 0 1-.53.22H4.5v3.88h2.25c.2 0 .39.08.53.22L10.5 17.4v-3.52L9 12.37V8.12Zm1.5-3.52v3.02l1.5 1.5V5.6L10.5 4.6Zm5.03 8.55 1.1 1.1a6 6 0 0 0 .87-3.25c0-2.35-1.36-4.39-3.33-5.37a.75.75 0 1 0-.67 1.34 4.5 4.5 0 0 1 2.5 4.03c0 .96-.3 1.85-.82 2.58l.35.57ZM15.75 12c0-.93-.37-1.78-.97-2.4l1.1 1.1c.23.39.37.84.37 1.3 0 .23-.03.46-.09.67l1.08 1.08c.32-.53.51-1.14.51-1.75 0-1.7-1-3.17-2.45-3.84a.75.75 0 0 0-.65 1.35A2.75 2.75 0 0 1 15.75 12Z" />
              </svg>
            ) : volume < 0.5 ? (
              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 24 24" fill="currentColor">
                <path d="M13.5 4.06c0-1.336-1.616-2.005-2.56-1.06l-4.5 4.5H4.508c-1.141 0-2.318.664-2.66 1.905A9.76 9.76 0 0 0 1.5 12c0 .898.121 1.768.35 2.595.341 1.24 1.518 1.905 2.659 1.905h1.93l4.5 4.5c.945.945 2.561.276 2.561-1.06V4.06ZM18.584 5.106a.75.75 0 0 1 1.06 0c3.808 3.807 3.808 9.98 0 13.788a.75.75 0 0 1-1.06-1.06 8.25 8.25 0 0 0 0-11.668.75.75 0 0 1 0-1.06Z" />
              </svg>
            ) : (
              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 24 24" fill="currentColor">
                <path d="M13.5 4.06c0-1.336-1.616-2.005-2.56-1.06l-4.5 4.5H4.508c-1.141 0-2.318.664-2.66 1.905A9.76 9.76 0 0 0 1.5 12c0 .898.121 1.768.35 2.595.341 1.24 1.518 1.905 2.659 1.905h1.93l4.5 4.5c.945.945 2.561.276 2.561-1.06V4.06ZM18.584 5.106a.75.75 0 0 1 1.06 0c3.808 3.807 3.808 9.98 0 13.788a.75.75 0 0 1-1.06-1.06 8.25 8.25 0 0 0 0-11.668.75.75 0 0 1 0-1.06Z" />
                <path d="M15.932 7.757a.75.75 0 0 1 1.061 0 6 6 0 0 1 0 8.486.75.75 0 0 1-1.06-1.061 4.5 4.5 0 0 0 0-6.364.75.75 0 0 1 0-1.06Z" />
              </svg>
            )}
          </button>
          {showVolume && (
            <div className="flex items-center bg-black/60 rounded-full px-3 py-1.5">
              <input
                type="range"
                min={0}
                max={1}
                step={0.05}
                value={muted ? 0 : volume}
                onChange={(e) => {
                  const v = parseFloat(e.target.value);
                  setVolume(v);
                  if (v > 0) setMuted(false);
                }}
                className="w-20 h-1 accent-purple-500 cursor-pointer"
              />
            </div>
          )}
        </div>
      )}
      {/* Pause indicator for regular users */}
      {!canControl && isPaused && (
        <div className="absolute inset-0 z-20 flex items-center justify-center bg-black/40 pointer-events-none">
          <div className="bg-black/70 rounded-full p-4">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-12 w-12 text-white" viewBox="0 0 24 24" fill="currentColor">
              <path d="M6 4h4v16H6V4zm8 0h4v16h-4V4z" />
            </svg>
          </div>
          <p className="absolute bottom-4 text-white/70 text-sm font-medium">
            Host has paused playback
          </p>
        </div>
      )}
    </div>
  );
}
