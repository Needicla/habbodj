import { useRef, useCallback, useEffect, useState } from 'react';
import ReactPlayer from 'react-player';
import type { CurrentVideo } from '../../hooks/useRoom';

interface VideoPlayerProps {
  currentVideo: CurrentVideo | null;
  onDuration: (duration: number) => void;
}

export default function VideoPlayer({ currentVideo, onDuration }: VideoPlayerProps) {
  const playerRef = useRef<ReactPlayer>(null);
  const [ready, setReady] = useState(false);
  const durationReported = useRef(false);

  // Seek to correct position for late joiners
  useEffect(() => {
    if (ready && currentVideo?.startedAt && playerRef.current) {
      const elapsed = (Date.now() - new Date(currentVideo.startedAt).getTime()) / 1000;
      if (elapsed > 2) {
        playerRef.current.seekTo(elapsed, 'seconds');
      }
    }
    durationReported.current = false;
  }, [currentVideo?.url, ready]);

  const handleDuration = useCallback(
    (dur: number) => {
      if (!durationReported.current && dur > 0) {
        durationReported.current = true;
        onDuration(dur);
      }
    },
    [onDuration]
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
    <div className="aspect-video bg-black rounded-xl overflow-hidden border border-gray-800">
      <ReactPlayer
        ref={playerRef}
        url={currentVideo.url}
        playing={true}
        controls={true}
        width="100%"
        height="100%"
        onReady={() => setReady(true)}
        onDuration={handleDuration}
        config={{
          youtube: {
            playerVars: {
              autoplay: 1,
              modestbranding: 1,
            },
          },
        }}
      />
    </div>
  );
}
