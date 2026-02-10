interface VoteControlsProps {
  upvotes: string[];
  downvotes: string[];
  userId: string;
  onVote: (type: 'up' | 'down') => void;
}

export default function VoteControls({ upvotes, downvotes, userId, onVote }: VoteControlsProps) {
  const hasUpvoted = upvotes.includes(userId);
  const hasDownvoted = downvotes.includes(userId);

  return (
    <div className="flex items-center gap-1.5">
      <button
        onClick={() => onVote('up')}
        className={`flex items-center gap-1 px-1.5 py-0.5 rounded text-xs transition-colors ${
          hasUpvoted
            ? 'bg-green-500/20 text-green-400'
            : 'text-gray-500 hover:text-green-400 hover:bg-green-500/10'
        }`}
      >
        <span>▲</span>
        <span>{upvotes.length}</span>
      </button>
      <button
        onClick={() => onVote('down')}
        className={`flex items-center gap-1 px-1.5 py-0.5 rounded text-xs transition-colors ${
          hasDownvoted
            ? 'bg-red-500/20 text-red-400'
            : 'text-gray-500 hover:text-red-400 hover:bg-red-500/10'
        }`}
      >
        <span>▼</span>
        <span>{downvotes.length}</span>
      </button>
    </div>
  );
}
