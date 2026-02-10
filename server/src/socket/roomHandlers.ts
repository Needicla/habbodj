import { Server, Socket } from 'socket.io';
import bcrypt from 'bcryptjs';
import { Room } from '../models/Room';
import { User } from '../models/User';

export interface RoomUser {
  _id: string;
  username: string;
  avatarColor: string;
  isAnonymous: boolean;
}

// In-memory presence: roomSlug -> Map<socketId, RoomUser>
const roomPresence = new Map<string, Map<string, RoomUser>>();

export function getRoomUsers(slug: string): RoomUser[] {
  const users = roomPresence.get(slug);
  if (!users) return [];
  // Deduplicate by userId (a user may have multiple tabs)
  const unique = new Map<string, RoomUser>();
  users.forEach((u) => unique.set(u._id, u));
  return Array.from(unique.values());
}

export function getRoomUserCount(slug: string): number {
  return getRoomUsers(slug).length;
}

export function getAllRoomCounts(): Record<string, number> {
  const counts: Record<string, number> = {};
  roomPresence.forEach((_users, slug) => {
    counts[slug] = getRoomUserCount(slug);
  });
  return counts;
}

export function isUserInRoom(slug: string, userId: string): boolean {
  const users = roomPresence.get(slug);
  if (!users) return false;
  for (const u of users.values()) {
    if (u._id === userId) return true;
  }
  return false;
}

/** Remove all presence data for a room (used when room is deleted). */
export function clearRoomPresence(slug: string): void {
  roomPresence.delete(slug);
}

export function registerRoomHandlers(io: Server, socket: Socket): void {
  socket.on('joinRoom', async (data: { roomSlug: string; password?: string }) => {
    try {
      const { roomSlug, password } = data;
      const userId = (socket.data as any).userId as string;

      // Leave any previous room
      const prevRoom = (socket.data as any).currentRoom as string | undefined;
      if (prevRoom) {
        leaveRoom(io, socket, prevRoom);
      }

      // Verify room exists (include password field for comparison)
      const room = await Room.findOne({ slug: roomSlug }).select('+password');
      if (!room) {
        socket.emit('error', { message: 'Room not found' });
        return;
      }

      // If room is private and user is not the host, verify password
      const isHost = room.creatorId.toString() === userId;
      if (room.isPrivate && !isHost) {
        if (!password) {
          socket.emit('passwordRequired', { roomSlug });
          return;
        }
        const valid = await bcrypt.compare(password, room.password || '');
        if (!valid) {
          socket.emit('error', { message: 'Incorrect room password' });
          return;
        }
      }

      // Load user info
      const user = await User.findById(userId);
      if (!user) {
        socket.emit('error', { message: 'User not found' });
        return;
      }

      // Join socket.io room
      socket.join(roomSlug);
      (socket.data as any).currentRoom = roomSlug;

      // Add to presence
      if (!roomPresence.has(roomSlug)) {
        roomPresence.set(roomSlug, new Map());
      }

      const roomUser: RoomUser = {
        _id: user._id.toString(),
        username: user.username,
        avatarColor: user.avatarColor,
        isAnonymous: user.isAnonymous,
      };

      roomPresence.get(roomSlug)!.set(socket.id, roomUser);

      // Send full room state to joining user
      socket.emit('roomState', {
        room: room.toJSON(),
        users: getRoomUsers(roomSlug),
      });

      // Broadcast to others
      socket.to(roomSlug).emit('userJoined', { user: roomUser });

      console.log(`[Socket] ${user.username} joined room ${roomSlug}`);
    } catch (error) {
      console.error('[Socket] joinRoom error:', error);
      socket.emit('error', { message: 'Failed to join room' });
    }
  });

  socket.on('leaveRoom', () => {
    const currentRoom = (socket.data as any).currentRoom as string | undefined;
    if (currentRoom) {
      leaveRoom(io, socket, currentRoom);
    }
  });

  socket.on('disconnect', () => {
    const currentRoom = (socket.data as any).currentRoom as string | undefined;
    if (currentRoom) {
      leaveRoom(io, socket, currentRoom);
    }
  });
}

function leaveRoom(io: Server, socket: Socket, slug: string): void {
  const users = roomPresence.get(slug);
  if (!users) return;

  const user = users.get(socket.id);
  users.delete(socket.id);

  // Clean up empty rooms
  if (users.size === 0) {
    roomPresence.delete(slug);
  }

  socket.leave(slug);
  (socket.data as any).currentRoom = undefined;

  if (user) {
    // Only broadcast if user has no other tabs in this room
    const stillPresent = isUserInRoom(slug, user._id);
    if (!stillPresent) {
      io.to(slug).emit('userLeft', { user });
    }
    console.log(`[Socket] ${user.username} left room ${slug}`);
  }
}
