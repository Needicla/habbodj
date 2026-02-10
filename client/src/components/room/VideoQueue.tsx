import type { VideoItem } from '../../hooks/useRoom';
import VoteControls from './VoteControls';
import Button from '../ui/Button';

interface VideoQueueProps {
  queue: VideoItem[];
  userId: string;
  canModerate: boolean;
  onVote: (videoIndex: number, type: 'up' | 'down') => void;
  onRemove: (videoIndex: number) => void;
}

export default function VideoQueue({ queue, userId, canModerate, onVote, onRemove }: VideoQueueProps) {
  return (
    <div className="card flex flex-col h-full">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wider">
          Queue
        </h3>
        <span className="text-xs text-gray-500">{queue.length} videos</span>
      </div>

      <div className="flex-1 overflow-y-auto space-y-2 min-h-0">
        {queue.length === 0 && (
          <p className="text-gray-600 text-sm text-center py-8">
            Queue is empty. Add a video to get started!
          </p>
        )}
        {queue.map((video, index) => (
          <div
            key={video._id || index}
            className="bg-gray-800/50 rounded-lg p-3 border border-gray-700/50 group"
          >
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium truncate">{video.title}</p>
                <p className="text-xs text-gray-500 mt-0.5">
                  Added by {video.addedBy.username}
                </p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <VoteControls
                  upvotes={video.upvotes}
                  downvotes={video.downvotes}
                  userId={userId}
                  onVote={(type) => onVote(index, type)}
                />
                {canModerate && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => onRemove(index)}
                    className="opacity-0 group-hover:opacity-100 text-red-400 hover:text-red-300"
                  >
                    ✕
                  </Button>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
