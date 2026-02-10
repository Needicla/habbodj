import type { RoomUser } from '../../hooks/useRoom';
import Avatar from '../ui/Avatar';
import Button from '../ui/Button';

interface UserListProps {
  users: RoomUser[];
  hostId: string;
  currentUserId: string;
  moderators: string[];
  isHost: boolean;
  canModerate: boolean;
  onRemoveUser: (userId: string) => void;
  onPromoteMod: (userId: string) => void;
  onDemoteMod: (userId: string) => void;
}

export default function UserList({
  users,
  hostId,
  currentUserId,
  moderators,
  isHost,
  canModerate,
  onRemoveUser,
  onPromoteMod,
  onDemoteMod,
}: UserListProps) {
  return (
    <div className="card">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wider">
          Users
        </h3>
        <span className="text-xs text-gray-500">{users.length} online</span>
      </div>

      <div className="space-y-2 max-h-48 overflow-y-auto">
        {users.map((user) => {
          const isUserHost = user._id === hostId;
          const isUserMod = moderators.includes(user._id);
          const isSelf = user._id === currentUserId;

          // Determine if current user can kick this user
          // Host can kick anyone except themselves
          // Moderators can kick regular users (not host, not other mods)
          const canKick =
            !isSelf &&
            ((isHost && !isUserHost) ||
              (canModerate && !isHost && !isUserHost && !isUserMod));

          return (
            <div key={user._id} className="flex items-center gap-2 group">
              <Avatar username={user.username} color={user.avatarColor} size="sm" />
              <span className="text-sm flex-1 truncate">
                {user.username}
                {isUserHost && (
                  <span className="ml-1.5 text-[10px] bg-purple-500/20 text-purple-400 px-1.5 py-0.5 rounded-full font-medium">
                    HOST
                  </span>
                )}
                {isUserMod && !isUserHost && (
                  <span className="ml-1.5 text-[10px] bg-blue-500/20 text-blue-400 px-1.5 py-0.5 rounded-full font-medium">
                    MOD
                  </span>
                )}
                {user.isAnonymous && (
                  <span className="ml-1.5 text-[10px] bg-gray-700 text-gray-400 px-1.5 py-0.5 rounded-full font-medium">
                    GUEST
                  </span>
                )}
              </span>
              <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100">
                {/* Host can promote/demote moderators */}
                {isHost && !isSelf && !isUserHost && (
                  isUserMod ? (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => onDemoteMod(user._id)}
                      className="text-blue-400 hover:text-blue-300 text-xs"
                      title="Remove moderator"
                    >
                      Unmod
                    </Button>
                  ) : (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => onPromoteMod(user._id)}
                      className="text-blue-400 hover:text-blue-300 text-xs"
                      title="Make moderator"
                    >
                      Mod
                    </Button>
                  )
                )}
                {canKick && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => onRemoveUser(user._id)}
                    className="text-red-400 hover:text-red-300 text-xs"
                  >
                    Kick
                  </Button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
