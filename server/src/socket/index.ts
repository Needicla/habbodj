import { Server as HttpServer } from 'http';
import { Server } from 'socket.io';
import bcrypt from 'bcryptjs';
import { verifyToken } from '../middleware/auth';
import { User } from '../models/User';
import { Room } from '../models/Room';
import { registerRoomHandlers, clearRoomPresence } from './roomHandlers';
import { registerChatHandlers } from './chatHandlers';
import { registerQueueHandlers } from './queueHandlers';
import { advanceQueue, stopVideoTimer } from './timerService';

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
 * Moderation handlers — only room creator can use these.
 */
function registerModerationHandlers(io: Server, socket: any): void {
  // Skip (advance) the current video
  socket.on('skipVideo', async () => {
    const currentRoom = socket.data.currentRoom as string | undefined;
    if (!currentRoom) return;

    const userId = socket.data.userId as string;
    const room = await Room.findOne({ slug: currentRoom });
    if (!room) return;

    if (room.creatorId.toString() !== userId) {
      socket.emit('error', { message: 'Only the room host can skip videos' });
      return;
    }

    stopVideoTimer(currentRoom);
    await advanceQueue(io, currentRoom);
    console.log(`[Mod] ${socket.data.username} skipped video in ${currentRoom}`);
  });

  // Remove a video from the queue
  socket.on('removeVideo', async (data: { videoIndex: number }) => {
    const currentRoom = socket.data.currentRoom as string | undefined;
    if (!currentRoom) return;

    const userId = socket.data.userId as string;
    const room = await Room.findOne({ slug: currentRoom });
    if (!room) return;

    if (room.creatorId.toString() !== userId) {
      socket.emit('error', { message: 'Only the room host can remove videos' });
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

  // Kick a user from the room
  socket.on('removeUser', async (data: { userId: string }) => {
    const currentRoom = socket.data.currentRoom as string | undefined;
    if (!currentRoom) return;

    const requesterId = socket.data.userId as string;
    const room = await Room.findOne({ slug: currentRoom });
    if (!room) return;

    if (room.creatorId.toString() !== requesterId) {
      socket.emit('error', { message: 'Only the room host can remove users' });
      return;
    }

    const targetUserId = data.userId;

    // Find all sockets of the target user in this room and disconnect them
    const sockets = await io.in(currentRoom).fetchSockets();
    for (const s of sockets) {
      if ((s.data as any).userId === targetUserId) {
        s.emit('kicked', { message: 'You have been removed from the room by the host' });
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

  // Toggle room privacy (make private or public)
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

  // Delete the room entirely (host only)
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
}
