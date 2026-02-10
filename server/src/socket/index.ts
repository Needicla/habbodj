import { Server as HttpServer } from 'http';
import { Server } from 'socket.io';
import bcrypt from 'bcryptjs';
import { verifyToken } from '../middleware/auth';
import { User } from '../models/User';
import { Room } from '../models/Room';
import { registerRoomHandlers, clearRoomPresence } from './roomHandlers';
import { registerChatHandlers } from './chatHandlers';
import { registerQueueHandlers } from './queueHandlers';
import { advanceQueue, stopVideoTimer, pausePlayback, resumePlayback, seekPlayback } from './timerService';

export function initSocket(httpServer: HttpServer): Server {
  const io = new Server(httpServer, {
    cors: {
      origin: (origin, callback) => {
        callback(null, true); // Allow all origins; tighten for production if needed
      },
      methods: ['GET', 'POST'],
      credentials: true,
    },
  });

  // JWT authentication middleware for Socket.io
  io.use(async (socket, next) => {
    try {
      const token = socket.handshake.auth.token as string;
      if (!token) {
        return next(new Error('Authentication required'));
      }

      const payload = verifyToken(token);
      const user = await User.findById(payload.userId);
      if (!user) {
        return next(new Error('User not found'));
      }

      // Attach user data to socket
      socket.data.userId = user._id.toString();
      socket.data.username = user.username;
      socket.data.avatarColor = user.avatarColor;
      socket.data.isAnonymous = user.isAnonymous;

      next();
    } catch (error) {
      next(new Error('Invalid token'));
    }
  });

  io.on('connection', (socket) => {
    console.log(`[Socket] Connected: ${socket.data.username} (${socket.id})`);

    // Register all handlers
    registerRoomHandlers(io, socket);
    registerChatHandlers(io, socket);
    registerQueueHandlers(io, socket);
    registerModerationHandlers(io, socket);
  });

  return io;
}

/**
 * Helper: check if user is the room host or a moderator.
 */
function isHostOrMod(room: any, userId: string): boolean {
  return (
    room.creatorId.toString() === userId ||
    (room.moderators && room.moderators.includes(userId))
  );
}

/**
 * Moderation handlers — host + moderators can use most of these.
 * Only the host can: togglePrivacy, deleteRoom, promoteMod, demoteMod.
 */
function registerModerationHandlers(io: Server, socket: any): void {
  // Skip (advance) the current video — host or moderator
  socket.on('skipVideo', async () => {
    const currentRoom = socket.data.currentRoom as string | undefined;
    if (!currentRoom) return;

    const userId = socket.data.userId as string;
    const room = await Room.findOne({ slug: currentRoom });
    if (!room) return;

    if (!isHostOrMod(room, userId)) {
      socket.emit('error', { message: 'Only the host or moderators can skip videos' });
      return;
    }

    stopVideoTimer(currentRoom);
    await advanceQueue(io, currentRoom);
    console.log(`[Mod] ${socket.data.username} skipped video in ${currentRoom}`);
  });

  // Remove a video from the queue — host or moderator
  socket.on('removeVideo', async (data: { videoIndex: number }) => {
    const currentRoom = socket.data.currentRoom as string | undefined;
    if (!currentRoom) return;

    const userId = socket.data.userId as string;
    const room = await Room.findOne({ slug: currentRoom });
    if (!room) return;

    if (!isHostOrMod(room, userId)) {
      socket.emit('error', { message: 'Only the host or moderators can remove videos' });
      return;
    }

    const { videoIndex } = data;
    if (videoIndex < 0 || videoIndex >= room.queue.length) {
      socket.emit('error', { message: 'Invalid video index' });
      return;
    }

    room.queue.splice(videoIndex, 1);
    await room.save();
    io.to(currentRoom).emit('queueUpdated', { queue: room.queue });
    console.log(`[Mod] ${socket.data.username} removed video at index ${videoIndex} in ${currentRoom}`);
  });

  // Kick a user from the room — host or moderator
  // Moderators cannot kick the host or other moderators
  socket.on('removeUser', async (data: { userId: string }) => {
    const currentRoom = socket.data.currentRoom as string | undefined;
    if (!currentRoom) return;

    const requesterId = socket.data.userId as string;
    const room = await Room.findOne({ slug: currentRoom });
    if (!room) return;

    const isRequesterHost = room.creatorId.toString() === requesterId;

    if (!isHostOrMod(room, requesterId)) {
      socket.emit('error', { message: 'Only the host or moderators can remove users' });
      return;
    }

    const targetUserId = data.userId;

    // Moderators cannot kick the host
    if (targetUserId === room.creatorId.toString() && !isRequesterHost) {
      socket.emit('error', { message: 'Moderators cannot kick the host' });
      return;
    }

    // Moderators cannot kick other moderators (only host can)
    if (room.moderators.includes(targetUserId) && !isRequesterHost) {
      socket.emit('error', { message: 'Only the host can remove moderators' });
      return;
    }

    // Find all sockets of the target user in this room and disconnect them
    const sockets = await io.in(currentRoom).fetchSockets();
    for (const s of sockets) {
      if ((s.data as any).userId === targetUserId) {
        s.emit('kicked', { message: 'You have been removed from the room' });
        s.leave(currentRoom);
        (s.data as any).currentRoom = undefined;
      }
    }

    // Broadcast user left
    io.to(currentRoom).emit('userLeft', {
      user: { _id: targetUserId, username: 'removed user', avatarColor: '#666' },
    });

    console.log(`[Mod] ${socket.data.username} kicked user ${targetUserId} from ${currentRoom}`);
  });

  // Toggle room privacy — HOST ONLY
  socket.on('togglePrivacy', async (data: { isPrivate: boolean; password?: string }) => {
    const currentRoom = socket.data.currentRoom as string | undefined;
    if (!currentRoom) return;

    const userId = socket.data.userId as string;
    const room = await Room.findOne({ slug: currentRoom });
    if (!room) return;

    if (room.creatorId.toString() !== userId) {
      socket.emit('error', { message: 'Only the room host can change room privacy' });
      return;
    }

    const { isPrivate, password } = data;

    if (isPrivate && (!password || password.length < 1)) {
      socket.emit('error', { message: 'A password is required to make the room private' });
      return;
    }

    room.isPrivate = isPrivate;
    if (isPrivate && password) {
      room.password = await bcrypt.hash(password, 10);
    } else if (!isPrivate) {
      room.password = undefined;
    }

    await room.save();

    // Broadcast the privacy change to all users in the room
    io.to(currentRoom).emit('privacyUpdated', { isPrivate });

    console.log(`[Mod] ${socket.data.username} set room ${currentRoom} to ${isPrivate ? 'private' : 'public'}`);
  });

  // Delete the room entirely — HOST ONLY
  socket.on('deleteRoom', async () => {
    const currentRoom = socket.data.currentRoom as string | undefined;
    if (!currentRoom) return;

    const userId = socket.data.userId as string;
    const room = await Room.findOne({ slug: currentRoom });
    if (!room) return;

    if (room.creatorId.toString() !== userId) {
      socket.emit('error', { message: 'Only the room host can delete the room' });
      return;
    }

    // Notify all users in the room before removing them
    io.to(currentRoom).emit('roomDeleted', { message: 'This room has been deleted by the host' });

    // Disconnect all sockets from the room
    const sockets = await io.in(currentRoom).fetchSockets();
    for (const s of sockets) {
      s.leave(currentRoom);
      (s.data as any).currentRoom = undefined;
    }

    // Stop any active video timer
    stopVideoTimer(currentRoom);

    // Clear in-memory presence
    clearRoomPresence(currentRoom);

    // Delete from database
    await Room.deleteOne({ slug: currentRoom });

    console.log(`[Mod] ${socket.data.username} deleted room ${currentRoom}`);
  });

  // Pause playback for everyone — host or moderator
  socket.on('hostPause', async () => {
    const currentRoom = socket.data.currentRoom as string | undefined;
    if (!currentRoom) return;

    const userId = socket.data.userId as string;
    const room = await Room.findOne({ slug: currentRoom });
    if (!room) return;

    if (!isHostOrMod(room, userId)) {
      socket.emit('error', { message: 'Only the host or moderators can control playback' });
      return;
    }

    await pausePlayback(io, currentRoom);
    console.log(`[Mod] ${socket.data.username} paused playback in ${currentRoom}`);
  });

  // Resume playback for everyone — host or moderator
  socket.on('hostResume', async () => {
    const currentRoom = socket.data.currentRoom as string | undefined;
    if (!currentRoom) return;

    const userId = socket.data.userId as string;
    const room = await Room.findOne({ slug: currentRoom });
    if (!room) return;

    if (!isHostOrMod(room, userId)) {
      socket.emit('error', { message: 'Only the host or moderators can control playback' });
      return;
    }

    await resumePlayback(io, currentRoom);
    console.log(`[Mod] ${socket.data.username} resumed playback in ${currentRoom}`);
  });

  // Seek to a specific position for everyone — host or moderator
  socket.on('hostSeek', async (data: { position: number }) => {
    const currentRoom = socket.data.currentRoom as string | undefined;
    if (!currentRoom) return;

    const userId = socket.data.userId as string;
    const room = await Room.findOne({ slug: currentRoom });
    if (!room) return;

    if (!isHostOrMod(room, userId)) {
      socket.emit('error', { message: 'Only the host or moderators can control playback' });
      return;
    }

    const { position } = data;
    if (typeof position !== 'number' || position < 0) {
      socket.emit('error', { message: 'Invalid seek position' });
      return;
    }

    await seekPlayback(io, currentRoom, position);
    console.log(`[Mod] ${socket.data.username} seeked to ${position.toFixed(1)}s in ${currentRoom}`);
  });

  // Promote a user to moderator — HOST ONLY
  socket.on('promoteMod', async (data: { userId: string }) => {
    const currentRoom = socket.data.currentRoom as string | undefined;
    if (!currentRoom) return;

    const requesterId = socket.data.userId as string;
    const room = await Room.findOne({ slug: currentRoom });
    if (!room) return;

    if (room.creatorId.toString() !== requesterId) {
      socket.emit('error', { message: 'Only the room host can promote moderators' });
      return;
    }

    const targetUserId = data.userId;

    // Can't make yourself (the host) a mod
    if (targetUserId === room.creatorId.toString()) {
      socket.emit('error', { message: 'The host is already the owner' });
      return;
    }

    // Already a mod?
    if (room.moderators.includes(targetUserId)) {
      socket.emit('error', { message: 'User is already a moderator' });
      return;
    }

    room.moderators.push(targetUserId);
    await room.save();

    io.to(currentRoom).emit('moderatorsUpdated', { moderators: room.moderators });
    console.log(`[Mod] ${socket.data.username} promoted ${targetUserId} to moderator in ${currentRoom}`);
  });

  // Demote a moderator back to regular user — HOST ONLY
  socket.on('demoteMod', async (data: { userId: string }) => {
    const currentRoom = socket.data.currentRoom as string | undefined;
    if (!currentRoom) return;

    const requesterId = socket.data.userId as string;
    const room = await Room.findOne({ slug: currentRoom });
    if (!room) return;

    if (room.creatorId.toString() !== requesterId) {
      socket.emit('error', { message: 'Only the room host can demote moderators' });
      return;
    }

    const targetUserId = data.userId;
    const idx = room.moderators.indexOf(targetUserId);
    if (idx === -1) {
      socket.emit('error', { message: 'User is not a moderator' });
      return;
    }

    room.moderators.splice(idx, 1);
    await room.save();

    io.to(currentRoom).emit('moderatorsUpdated', { moderators: room.moderators });
    console.log(`[Mod] ${socket.data.username} demoted ${targetUserId} from moderator in ${currentRoom}`);
  });
}
