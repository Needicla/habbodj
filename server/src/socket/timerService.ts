import { Server } from 'socket.io';
import { Room, IRoom } from '../models/Room';

// Per-room timers
const roomTimers = new Map<string, NodeJS.Timeout>();

/**
 * Start the auto-advance timer for a room.
 * When the current video duration elapses, advance to the next video in queue.
 */
export function startVideoTimer(io: Server, roomSlug: string, durationSeconds: number): void {
  // Clear any existing timer for this room
  stopVideoTimer(roomSlug);

  if (durationSeconds <= 0) {
    // If no duration known, default to 4 minutes
    durationSeconds = 240;
  }

  const timer = setTimeout(async () => {
    roomTimers.delete(roomSlug);
    await advanceQueue(io, roomSlug);
  }, durationSeconds * 1000);

  roomTimers.set(roomSlug, timer);
  console.log(`[Timer] Started ${durationSeconds}s timer for room ${roomSlug}`);
}

export function stopVideoTimer(roomSlug: string): void {
  const existing = roomTimers.get(roomSlug);
  if (existing) {
    clearTimeout(existing);
    roomTimers.delete(roomSlug);
  }
}

/**
 * Advance to the next video in the queue. If queue is empty, set currentVideo to null.
 */
export async function advanceQueue(io: Server, roomSlug: string): Promise<void> {
  try {
    const room = await Room.findOne({ slug: roomSlug });
    if (!room) return;

    if (room.queue.length === 0) {
      // No more videos
      room.currentVideo = null;
      await room.save();
      io.to(roomSlug).emit('nowPlaying', { video: null });
      io.to(roomSlug).emit('queueUpdated', { queue: room.queue });
      console.log(`[Timer] Room ${roomSlug}: queue empty`);
      return;
    }

    // Pop the first item from the queue
    const nextVideo = room.queue.shift()!;
    room.currentVideo = {
      url: nextVideo.url,
      title: nextVideo.title,
      duration: nextVideo.duration,
      addedBy: nextVideo.addedBy,
      startedAt: new Date(),
    };
    await room.save();

    io.to(roomSlug).emit('nowPlaying', { video: room.currentVideo });
    io.to(roomSlug).emit('queueUpdated', { queue: room.queue });

    // Start timer for the new video
    if (nextVideo.duration > 0) {
      startVideoTimer(io, roomSlug, nextVideo.duration);
    }

    console.log(`[Timer] Room ${roomSlug}: now playing "${nextVideo.title}"`);
  } catch (error) {
    console.error(`[Timer] advanceQueue error for ${roomSlug}:`, error);
  }
}

/**
 * Called when a client reports the actual video duration (useful since oEmbed doesn't provide it).
 */
export function handleDurationReport(io: Server, roomSlug: string, durationSeconds: number): void {
  if (durationSeconds > 0) {
    // Restart the timer with the actual duration
    // Account for time already elapsed
    Room.findOne({ slug: roomSlug }).then((room) => {
      if (!room?.currentVideo?.startedAt) return;
      const elapsed = (Date.now() - new Date(room.currentVideo.startedAt).getTime()) / 1000;
      const remaining = Math.max(durationSeconds - elapsed, 1);

      // Update stored duration
      room.currentVideo.duration = durationSeconds;
      room.save();

      startVideoTimer(io, roomSlug, remaining);
    });
  }
}
