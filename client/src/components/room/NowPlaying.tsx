import type { CurrentVideo } from '../../hooks/useRoom';
import Button from '../ui/Button';

interface NowPlayingProps {
  currentVideo: CurrentVideo | null;
  isHost: boolean;
  onSkip: () => void;
}

export default function NowPlaying({ currentVideo, isHost, onSkip }: NowPlayingProps) {
  if (!currentVideo) return null;

  return (
    <div className="bg-gray-900/50 border border-gray-800 rounded-lg px-4 py-3 flex items-center justify-between">
      <div className="min-w-0 flex-1">
        <p className="text-xs text-purple-400 font-semibold uppercase tracking-wider mb-0.5">
          Now Playing
        </p>
        <p className="text-sm font-medium truncate">{currentVideo.title}</p>
        <p className="text-xs text-gray-500">Added by {currentVideo.addedBy.username}</p>
      </div>
      {isHost && (
        <Button variant="ghost" size="sm" onClick={onSkip} className="ml-3 shrink-0">
          Skip ⏭
        </Button>
      )}
    </div>
  );
}
