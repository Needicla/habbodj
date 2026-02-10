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

  // Track whether we're programmatically seeking/correcting (to ignore callbacks)
  const isSyncing = useRef(false);
  // Track the last seek event timestamp we processed
  const lastSeekTimestamp = useRef(0);
  // Track last known progress for seek detection
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

  // Handle seek events from the server (for all users)
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

  // Helper: snap a regular user back to the correct position
  const snapToLive = useCallback(() => {
    if (!playerRef.current || !currentVideo?.startedAt) return;
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
  }, [currentVideo?.startedAt, isPaused, seekEvent]);

  // Pause callback
  const handlePause = useCallback(() => {
    if (isSyncing.current) return;
    if (canControl) {
      // Host/mod pauses for everyone
      onHostPause();
    } else if (!isPaused) {
      // Regular user tried to pause while video should be playing: force unpause
      isSyncing.current = true;
      const internal = playerRef.current?.getInternalPlayer();
      if (internal?.playVideo) {
        internal.playVideo();
      }
      setTimeout(() => {
        isSyncing.current = false;
      }, 500);
    }
    // If isPaused is true, playing={false} keeps it paused — nothing to revert
  }, [canControl, onHostPause, isPaused]);

  // Play callback
  const handlePlay = useCallback(() => {
    if (isSyncing.current) return;
    if (canControl) {
      // Host/mod resumes for everyone
      onHostResume();
    } else if (isPaused) {
      // Regular user tried to play while host has paused: force re-pause
      isSyncing.current = true;
      const internal = playerRef.current?.getInternalPlayer();
      if (internal?.pauseVideo) {
        internal.pauseVideo();
      }
      setTimeout(() => {
        isSyncing.current = false;
      }, 500);
    }
    // If isPaused is false, playing={true} keeps it going — nothing to revert
  }, [canControl, onHostResume, isPaused]);

  // Progress callback — detect seeks for controllers, snap back for regular users
  const handleProgress = useCallback(
    (state: { playedSeconds: number }) => {
      if (isSyncing.current) {
        lastProgress.current = state.playedSeconds;
        return;
      }

      const diff = Math.abs(state.playedSeconds - lastProgress.current);

      if (canControl) {
        // Controller: if position jumped, broadcast the seek
        if (diff > 3 && lastProgress.current > 0) {
          onHostSeek(state.playedSeconds);
        }
      } else if (diff > 3 && lastProgress.current > 0) {
        // Regular user's position jumped (keyboard seek, drag, etc.): snap back
        snapToLive();
      }

      lastProgress.current = state.playedSeconds;
    },
    [canControl, onHostSeek, snapToLive]
  );

  // onSeek callback — additional snap-back for regular users
  const handleSeek = useCallback(
    (seconds: number) => {
      if (isSyncing.current) return;
      if (!canControl) {
        snapToLive();
      }
    },
    [canControl, snapToLive]
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
        onSeek={handleSeek}
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
      {/* Pause indicator for regular users when host/mod has paused */}
      {!canControl && isPaused && (
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
