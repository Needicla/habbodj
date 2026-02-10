import { Server, Socket } from 'socket.io';
import { Room } from '../models/Room';
import { isValidVideoUrl, fetchVideoInfo } from '../utils/videoValidator';
import { startVideoTimer, advanceQueue } from './timerService';

export function registerQueueHandlers(io: Server, socket: Socket): void {
  // Add a video to the queue
  socket.on('addVideo', async (data: { url: string }) => {
    const currentRoom = (socket.data as any).currentRoom as string | undefined;
    if (!currentRoom) {
      socket.emit('error', { message: 'Not in a room' });
      return;
    }

    const url = data.url?.trim();
    if (!url || !isValidVideoUrl(url)) {
      socket.emit('error', { message: 'Invalid video URL. Supported: YouTube, SoundCloud' });
      return;
    }

    try {
      const videoInfo = await fetchVideoInfo(url);
      const userId = (socket.data as any).userId as string;
      const username = (socket.data as any).username as string;

      const room = await Room.findOne({ slug: currentRoom });
      if (!room) {
        socket.emit('error', { message: 'Room not found' });
        return;
      }

      const videoItem = {
        url: videoInfo.url,
        title: videoInfo.title,
        duration: videoInfo.duration,
        addedBy: { _id: userId, username },
        upvotes: [] as string[],
        downvotes: [] as string[],
      };

      room.queue.push(videoItem as any);
      await room.save();

      io.to(currentRoom).emit('queueUpdated', { queue: room.queue });

      // If nothing is currently playing, start this video
      if (!room.currentVideo) {
        await advanceQueue(io, currentRoom);
      }

      console.log(`[Queue] ${username} added "${videoInfo.title}" to ${currentRoom}`);
    } catch (error) {
      console.error('[Queue] addVideo error:', error);
      socket.emit('error', { message: 'Failed to add video' });
    }
  });

  // Vote on a video in the queue
  socket.on('vote', async (data: { videoIndex: number; type: 'up' | 'down' }) => {
    const currentRoom = (socket.data as any).currentRoom as string | undefined;
    if (!currentRoom) {
      socket.emit('error', { message: 'Not in a room' });
      return;
    }

    const { videoIndex, type } = data;
    const userId = (socket.data as any).userId as string;

    try {
      const room = await Room.findOne({ slug: currentRoom });
      if (!room) return;

      if (videoIndex < 0 || videoIndex >= room.queue.length) {
        socket.emit('error', { message: 'Invalid video index' });
        return;
      }

      const video = room.queue[videoIndex];

      // Remove user from both arrays first (toggle behavior)
      video.upvotes = video.upvotes.filter((id) => id !== userId);
      video.downvotes = video.downvotes.filter((id) => id !== userId);

      // Add to the appropriate array
      if (type === 'up') {
        video.upvotes.push(userId);
      } else {
        video.downvotes.push(userId);
      }

      await room.save();
      io.to(currentRoom).emit('queueUpdated', { queue: room.queue });
    } catch (error) {
      console.error('[Queue] vote error:', error);
      socket.emit('error', { message: 'Failed to vote' });
    }
  });

  // Report video duration from client
  socket.on('reportDuration', async (data: { duration: number }) => {
    const currentRoom = (socket.data as any).currentRoom as string | undefined;
    if (!currentRoom) return;

    const { duration } = data;
    if (typeof duration === 'number' && duration > 0) {
      const { handleDurationReport } = await import('./timerService');
      handleDurationReport(io, currentRoom, duration);
    }
  });
}
