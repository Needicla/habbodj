import type { RoomUser } from '../../hooks/useRoom';
import Avatar from '../ui/Avatar';
import Button from '../ui/Button';

interface UserListProps {
  users: RoomUser[];
  hostId: string;
  currentUserId: string;
  isHost: boolean;
  onRemoveUser: (userId: string) => void;
}

export default function UserList({ users, hostId, currentUserId, isHost, onRemoveUser }: UserListProps) {
  return (
    <div className="card">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wider">
          Users
        </h3>
        <span className="text-xs text-gray-500">{users.length} online</span>
      </div>

      <div className="space-y-2 max-h-48 overflow-y-auto">
        {users.map((user) => (
          <div key={user._id} className="flex items-center gap-2 group">
            <Avatar username={user.username} color={user.avatarColor} size="sm" />
            <span className="text-sm flex-1 truncate">
              {user.username}
              {user._id === hostId && (
                <span className="ml-1.5 text-[10px] bg-purple-500/20 text-purple-400 px-1.5 py-0.5 rounded-full font-medium">
                  HOST
                </span>
              )}
              {user.isAnonymous && (
                <span className="ml-1.5 text-[10px] bg-gray-700 text-gray-400 px-1.5 py-0.5 rounded-full font-medium">
                  GUEST
                </span>
              )}
            </span>
            {isHost && user._id !== currentUserId && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => onRemoveUser(user._id)}
                className="opacity-0 group-hover:opacity-100 text-red-400 hover:text-red-300 text-xs"
              >
                Kick
              </Button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
