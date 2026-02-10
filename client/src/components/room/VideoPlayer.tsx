import { useRef, useCallback, useEffect, useState } from 'react';
import ReactPlayer from 'react-player';
import type { CurrentVideo, PlaybackSeekEvent, MediaSync } from '../../hooks/useRoom';

interface VideoPlayerProps {
  currentVideo: CurrentVideo | null;
  canControl: boolean; // true for host and moderators
  isPaused: boolean;
  seekEvent: PlaybackSeekEvent | null;
  mediaSync: MediaSync | null;
  onDuration: (duration: number) => void;
  onHostPause: () => void;
  onHostResume: () => void;
  onHostSeek: (position: number) => void;
}

// How far off (in seconds) the client can be before we force-seek.
const SYNC_ACCURACY = 2;

export default function VideoPlayer({
  currentVideo,
  canControl,
  isPaused,
  seekEvent,
  mediaSync,
  onDuration,
  onHostPause,
  onHostResume,
  onHostSeek,
}: VideoPlayerProps) {
  const playerRef = useRef<ReactPlayer>(null);
  const [ready, setReady] = useState(false);
  const durationReported = useRef(false);

  // Track whether we're programmatically seeking (to ignore callbacks)
  const isSyncing = useRef(false);
  // Track the last seek event timestamp we processed
  const lastSeekTimestamp = useRef(0);
  // Track last known progress for host seek detection
  const lastProgress = useRef(0);

  // Reset ready state when the video URL changes
  useEffect(() => {
    setReady(false);
    durationReported.current = false;
    isSyncing.current = false;
    lastProgress.current = 0;
  }, [currentVideo?.url]);

  // Once the player is ready, seek to the correct position
  useEffect(() => {
    if (ready && currentVideo?.startedAt && playerRef.current) {
      if (isPaused && seekEvent) {
        isSyncing.current = true;
        playerRef.current.seekTo(seekEvent.position, 'seconds');
        lastProgress.current = seekEvent.position;
        setTimeout(() => { isSyncing.current = false; }, 500);
      } else {
        const elapsed = (Date.now() - new Date(currentVideo.startedAt).getTime()) / 1000;
        if (elapsed > 1) {
          isSyncing.current = true;
          playerRef.current.seekTo(elapsed, 'seconds');
          lastProgress.current = elapsed;
          setTimeout(() => { isSyncing.current = false; }, 500);
        }
      }
    }
  }, [currentVideo?.url, ready]);

  // Handle seek events from the server (host seek broadcast)
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
      setTimeout(() => { isSyncing.current = false; }, 500);
    }
  }, [seekEvent, ready]);

  // =====================================================================
  // CyTube-style periodic sync (every 500ms from server).
  // For non-controllers: enforce both position AND pause/play state.
  // This is the ONLY correction mechanism — no client-side guessing.
  // =====================================================================
  useEffect(() => {
    if (!mediaSync || !playerRef.current || !ready) return;
    if (canControl) return;

    const player = playerRef.current;
    const internal = player.getInternalPlayer();
    if (!internal) return;

    const serverTime = mediaSync.currentTime;
    const serverPaused = mediaSync.paused;

    // Enforce pause/play state
    if (serverPaused) {
      if (typeof internal.pauseVideo === 'function') {
        internal.pauseVideo();
      }
    } else {
      if (typeof internal.playVideo === 'function') {
        internal.playVideo();
      }
    }

    // Enforce position
    if (typeof internal.getCurrentTime === 'function') {
      const clientTime = internal.getCurrentTime();
      const diff = serverTime - clientTime;

      if (Math.abs(diff) > SYNC_ACCURACY) {
        isSyncing.current = true;
        const seekTarget = diff < 0 ? serverTime + 1 : serverTime;
        player.seekTo(seekTarget, 'seconds');
        lastProgress.current = seekTarget;
        setTimeout(() => { isSyncing.current = false; }, 500);
      }
    }
  }, [mediaSync, ready, canControl]);

  const handleDuration = useCallback(
    (dur: number) => {
      if (!durationReported.current && dur > 0) {
        durationReported.current = true;
        onDuration(dur);
      }
    },
    [onDuration]
  );

  // Pause/play callbacks — only controllers act on these
  const handlePause = useCallback(() => {
    if (isSyncing.current) return;
    if (canControl) {
      onHostPause();
    }
    // Non-controllers: do nothing — server mediaUpdate will correct state
  }, [canControl, onHostPause]);

  const handlePlay = useCallback(() => {
    if (isSyncing.current) return;
    if (canControl) {
      onHostResume();
    }
    // Non-controllers: do nothing — server mediaUpdate will correct state
  }, [canControl, onHostResume]);

  // Progress callback — only controllers use this for seek detection
  const handleProgress = useCallback(
    (state: { playedSeconds: number }) => {
      if (isSyncing.current) {
        lastProgress.current = state.playedSeconds;
        return;
      }

      if (canControl) {
        const diff = Math.abs(state.playedSeconds - lastProgress.current);
        if (diff > 3 && lastProgress.current > 0) {
          onHostSeek(state.playedSeconds);
        }
      }

      lastProgress.current = state.playedSeconds;
    },
    [canControl, onHostSeek]
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
        controls={true}
        width="100%"
        height="100%"
        onReady={() => setReady(true)}
        onDuration={handleDuration}
        onPause={handlePause}
        onPlay={handlePlay}
        onProgress={handleProgress}
        progressInterval={1000}
        config={{
          youtube: {
            playerVars: {
              autoplay: 1,
              modestbranding: 1,
            },
          },
        }}
      />
      {isPaused && (
        <div className="absolute inset-0 z-20 flex items-center justify-center bg-black/40 pointer-events-none">
          <div className="bg-black/70 rounded-full p-4">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-12 w-12 text-white" viewBox="0 0 24 24" fill="currentColor">
              <path d="M6 4h4v16H6V4zm8 0h4v16h-4V4z" />
            </svg>
          </div>
          <p className="absolute bottom-4 text-white/70 text-sm font-medium">
            Playback paused
          </p>
        </div>
      )}
    </div>
  );
}
