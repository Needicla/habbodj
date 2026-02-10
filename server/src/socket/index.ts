import { Server as HttpServer } from 'http';
import { Server } from 'socket.io';
import bcrypt from 'bcryptjs';
import { verifyToken } from '../middleware/auth';
import { User } from '../models/User';
import { Room } from '../models/Room';
import { registerRoomHandlers, clearRoomPresence } from './roomHandlers';
import { registerChatHandlers } from './chatHandlers';
import { registerQueueHandlers } from './queueHandlers';
import { advanceQueue, stopVideoTimer, handleHostMediaUpdate } from './timerService';

export function initSocket(httpServer: HttpServer): Server {
  const io = new Server(httpServer, {
    cors: {
      origin: (origin, callback) => {
        callback(null, true);
      },
      methods: ['GET', 'POST'],
      credentials: true,
    },
  });

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

    registerRoomHandlers(io, socket);
    registerChatHandlers(io, socket);
    registerQueueHandlers(io, socket);
    registerModerationHandlers(io, socket);
  });

  return io;
}

function isHostOrMod(room: any, userId: string): boolean {
  return (
    room.creatorId.toString() === userId ||
    (room.moderators && room.moderators.includes(userId))
  );
}

function registerModerationHandlers(io: Server, socket: any): void {
  // Skip video
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

  // Remove video from queue
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

  // Kick user
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

    if (targetUserId === room.creatorId.toString() && !isRequesterHost) {
      socket.emit('error', { message: 'Moderators cannot kick the host' });
      return;
    }

    if (room.moderators.includes(targetUserId) && !isRequesterHost) {
      socket.emit('error', { message: 'Only the host can remove moderators' });
      return;
    }

    const sockets = await io.in(currentRoom).fetchSockets();
    for (const s of sockets) {
      if ((s.data as any).userId === targetUserId) {
        s.emit('kicked', { message: 'You have been removed from the room' });
        s.leave(currentRoom);
        (s.data as any).currentRoom = undefined;
      }
    }

    io.to(currentRoom).emit('userLeft', {
      user: { _id: targetUserId, username: 'removed user', avatarColor: '#666' },
    });

    console.log(`[Mod] ${socket.data.username} kicked user ${targetUserId} from ${currentRoom}`);
  });

  // Toggle privacy
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
    io.to(currentRoom).emit('privacyUpdated', { isPrivate });
    console.log(`[Mod] ${socket.data.username} set room ${currentRoom} to ${isPrivate ? 'private' : 'public'}`);
  });

  // Delete room
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

    io.to(currentRoom).emit('roomDeleted', { message: 'This room has been deleted by the host' });

    const sockets = await io.in(currentRoom).fetchSockets();
    for (const s of sockets) {
      s.leave(currentRoom);
      (s.data as any).currentRoom = undefined;
    }

    stopVideoTimer(currentRoom);
    clearRoomPresence(currentRoom);
    await Room.deleteOne({ slug: currentRoom });
    console.log(`[Mod] ${socket.data.username} deleted room ${currentRoom}`);
  });

  // =====================================================================
  // CyTube-style mediaUpdate: ONE endpoint for all playback control.
  // Host/mod sends { currentTime, paused }, server rebroadcasts to room.
  // =====================================================================
  socket.on('mediaUpdate', async (data: { currentTime: number; paused: boolean }) => {
    const currentRoom = socket.data.currentRoom as string | undefined;
    if (!currentRoom) return;

    const userId = socket.data.userId as string;
    const room = await Room.findOne({ slug: currentRoom });
    if (!room) return;

    // Only host/mod can send updates (like CyTube's leader check)
    if (!isHostOrMod(room, userId)) return;

    const { currentTime, paused } = data;
    if (typeof currentTime !== 'number' || isNaN(currentTime)) return;

    await handleHostMediaUpdate(io, currentRoom, currentTime, Boolean(paused));
  });

  // Promote mod
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

    if (targetUserId === room.creatorId.toString()) {
      socket.emit('error', { message: 'The host is already the owner' });
      return;
    }

    if (room.moderators.includes(targetUserId)) {
      socket.emit('error', { message: 'User is already a moderator' });
      return;
    }

    room.moderators.push(targetUserId);
    await room.save();

    io.to(currentRoom).emit('moderatorsUpdated', { moderators: room.moderators });
    console.log(`[Mod] ${socket.data.username} promoted ${targetUserId} to moderator in ${currentRoom}`);
  });

  // Demote mod
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
