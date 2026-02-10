import { useRef, useCallback, useEffect, useState } from 'react';
import ReactPlayer from 'react-player';
import type { CurrentVideo, MediaSync } from '../../hooks/useRoom';

interface VideoPlayerProps {
  currentVideo: CurrentVideo | null;
  canControl: boolean;
  isPaused: boolean;
  mediaSync: MediaSync | null;
  onDuration: (duration: number) => void;
  onSendMediaUpdate: (currentTime: number, paused: boolean) => void;
}

const SYNC_ACCURACY = 2;

export default function VideoPlayer({
  currentVideo,
  canControl,
  isPaused,
  mediaSync,
  onDuration,
  onSendMediaUpdate,
}: VideoPlayerProps) {
  const playerRef = useRef<ReactPlayer>(null);
  const [ready, setReady] = useState(false);
  const durationReported = useRef(false);
  const isSyncing = useRef(false);
  // Track local paused state so we only sendMediaUpdate on actual changes
  // (mirrors CyTube's @paused flag on the player)
  const localPaused = useRef(false);

  useEffect(() => {
    setReady(false);
    durationReported.current = false;
    isSyncing.current = false;
    localPaused.current = false;
  }, [currentVideo?.url]);

  // Initial seek when player becomes ready
  useEffect(() => {
    if (!ready || !playerRef.current || !currentVideo?.startedAt) return;

    if (isPaused && mediaSync) {
      isSyncing.current = true;
      playerRef.current.seekTo(mediaSync.currentTime, 'seconds');
      localPaused.current = true;
      setTimeout(() => { isSyncing.current = false; }, 500);
    } else {
      const elapsed = (Date.now() - new Date(currentVideo.startedAt).getTime()) / 1000;
      if (elapsed > 1) {
        isSyncing.current = true;
        playerRef.current.seekTo(elapsed, 'seconds');
        setTimeout(() => { isSyncing.current = false; }, 500);
      }
    }
  }, [currentVideo?.url, ready]);

  // =====================================================================
  // CyTube handleMediaUpdate — exact copy of update.coffee logic:
  //
  //   if CLIENT.leader: return
  //   if data.paused and not PLAYER.paused: seekTo + pause
  //   if PLAYER.paused and not data.paused: play
  //   PLAYER.getTime (seconds) ->
  //     diff = time - seconds
  //     if diff > accuracy: seekTo(time)
  //     if diff < -accuracy: seekTo(time + 1)
  // =====================================================================
  useEffect(() => {
    if (!mediaSync || !playerRef.current || !ready) return;
    // Leaders don't get synced — they ARE the source of truth
    if (canControl) return;

    const internal = playerRef.current.getInternalPlayer();
    if (!internal) return;

    const time = mediaSync.currentTime;
    const serverPaused = mediaSync.paused;

    // "if data.paused and not PLAYER.paused → seekTo + pause"
    if (serverPaused && !localPaused.current) {
      isSyncing.current = true;
      if (typeof internal.seekTo === 'function') {
        internal.seekTo(time, true);
      } else if (typeof internal.seekTo !== 'function' && typeof playerRef.current.seekTo === 'function') {
        playerRef.current.seekTo(time, 'seconds');
      }
      if (typeof internal.pauseVideo === 'function') {
        internal.pauseVideo();
      }
      localPaused.current = true;
      setTimeout(() => { isSyncing.current = false; }, 500);
      return;
    }

    // "if PLAYER.paused and not data.paused → play"
    if (localPaused.current && !serverPaused) {
      isSyncing.current = true;
      if (typeof internal.playVideo === 'function') {
        internal.playVideo();
      }
      localPaused.current = false;
      setTimeout(() => { isSyncing.current = false; }, 500);
    }

    // "PLAYER.getTime → compare → seekTo if off"
    if (typeof internal.getCurrentTime === 'function') {
      const seconds = internal.getCurrentTime();
      const diff = time - seconds;

      if (diff > SYNC_ACCURACY) {
        isSyncing.current = true;
        playerRef.current.seekTo(time, 'seconds');
        setTimeout(() => { isSyncing.current = false; }, 500);
      } else if (diff < -SYNC_ACCURACY) {
        isSyncing.current = true;
        playerRef.current.seekTo(time + 1, 'seconds');
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

  // =====================================================================
  // CyTube onStateChange — exact copy of youtube.coffee logic:
  //
  //   if (PAUSED and not @paused) or (PLAYING and @paused):
  //     @paused = (state == PAUSED)
  //     if CLIENT.leader: sendVideoUpdate()
  //
  // Only the leader/host sends updates. Non-leaders do nothing.
  // =====================================================================
  const handlePause = useCallback(() => {
    if (isSyncing.current) return;

    // Only send if state actually changed (CyTube: "PAUSED and not @paused")
    if (canControl && !localPaused.current) {
      localPaused.current = true;
      const internal = playerRef.current?.getInternalPlayer();
      const currentTime = (typeof internal?.getCurrentTime === 'function')
        ? internal.getCurrentTime()
        : 0;
      onSendMediaUpdate(currentTime, true);
    }
  }, [canControl, onSendMediaUpdate]);

  const handlePlay = useCallback(() => {
    if (isSyncing.current) return;

    // Only send if state actually changed (CyTube: "PLAYING and @paused")
    if (canControl && localPaused.current) {
      localPaused.current = false;
      const internal = playerRef.current?.getInternalPlayer();
      const currentTime = (typeof internal?.getCurrentTime === 'function')
        ? internal.getCurrentTime()
        : 0;
      onSendMediaUpdate(currentTime, false);
    }
  }, [canControl, onSendMediaUpdate]);

  const handleSeek = useCallback(
    (seconds: number) => {
      if (isSyncing.current) return;

      // Leader seeked — send update with current pause state
      if (canControl) {
        onSendMediaUpdate(seconds, localPaused.current);
      }
    },
    [canControl, onSendMediaUpdate]
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
        onSeek={handleSeek}
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
