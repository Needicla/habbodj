import { Server } from 'socket.io';
import { Room, IRoom } from '../models/Room';

// Per-room auto-advance timers
const roomTimers = new Map<string, NodeJS.Timeout>();

// Per-room periodic sync intervals
const roomSyncIntervals = new Map<string, NodeJS.Timeout>();

// Per-room playback state
interface PlaybackState {
  isPaused: boolean;
  pausedAt: number; // seconds elapsed when paused
}

const roomPlaybackState = new Map<string, PlaybackState>();

export function getPlaybackState(roomSlug: string): PlaybackState {
  return roomPlaybackState.get(roomSlug) || { isPaused: false, pausedAt: 0 };
}

export function clearPlaybackState(roomSlug: string): void {
  roomPlaybackState.delete(roomSlug);
  stopSyncInterval(roomSlug);
}

/**
 * CyTube-style periodic mediaUpdate broadcast.
 * Sends { currentTime, paused } to all clients every 2 seconds.
 */
export function startSyncInterval(io: Server, roomSlug: string): void {
  stopSyncInterval(roomSlug);

  const interval = setInterval(async () => {
    const state = getPlaybackState(roomSlug);
    let currentTime: number;

    if (state.isPaused) {
      currentTime = state.pausedAt;
    } else {
      const room = await Room.findOne({ slug: roomSlug });
      if (!room?.currentVideo?.startedAt) return;
      currentTime = (Date.now() - new Date(room.currentVideo.startedAt).getTime()) / 1000;
    }

    io.to(roomSlug).emit('mediaUpdate', {
      currentTime,
      paused: state.isPaused,
    });
  }, 2000);

  roomSyncIntervals.set(roomSlug, interval);
}

export function stopSyncInterval(roomSlug: string): void {
  const existing = roomSyncIntervals.get(roomSlug);
  if (existing) {
    clearInterval(existing);
    roomSyncIntervals.delete(roomSlug);
  }
}

/**
 * CyTube-style handleUpdate: host/mod sends { currentTime, paused },
 * server updates internal state and rebroadcasts to entire room.
 */
export async function handleHostMediaUpdate(
  io: Server,
  roomSlug: string,
  currentTime: number,
  paused: boolean
): Promise<void> {
  const room = await Room.findOne({ slug: roomSlug });
  if (!room?.currentVideo) return;

  if (paused) {
    // Pause: store position, stop auto-advance timer
    roomPlaybackState.set(roomSlug, { isPaused: true, pausedAt: currentTime });
    stopVideoTimer(roomSlug);
  } else {
    // Playing: update startedAt so server time tracking stays correct
    const newStartedAt = new Date(Date.now() - currentTime * 1000);
    room.currentVideo.startedAt = newStartedAt;
    await room.save();
    roomPlaybackState.set(roomSlug, { isPaused: false, pausedAt: 0 });

    // Restart auto-advance timer with remaining time
    const remaining = Math.max(room.currentVideo.duration - currentTime, 1);
    stopVideoTimer(roomSlug);
    startVideoTimer(io, roomSlug, remaining);
  }

  // Rebroadcast to all clients (exactly like CyTube)
  io.to(roomSlug).emit('mediaUpdate', { currentTime, paused });
}

// --- Auto-advance timer (unchanged) ---

export function startVideoTimer(io: Server, roomSlug: string, durationSeconds: number): void {
  stopVideoTimer(roomSlug);

  if (durationSeconds <= 0) {
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

export async function advanceQueue(io: Server, roomSlug: string): Promise<void> {
  try {
    const room = await Room.findOne({ slug: roomSlug });
    if (!room) return;

    clearPlaybackState(roomSlug);

    if (room.queue.length === 0) {
      room.currentVideo = null;
      await room.save();
      io.to(roomSlug).emit('nowPlaying', { video: null });
      io.to(roomSlug).emit('queueUpdated', { queue: room.queue });
      console.log(`[Timer] Room ${roomSlug}: queue empty`);
      return;
    }

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

    if (nextVideo.duration > 0) {
      startVideoTimer(io, roomSlug, nextVideo.duration);
    }

    startSyncInterval(io, roomSlug);

    console.log(`[Timer] Room ${roomSlug}: now playing "${nextVideo.title}"`);
  } catch (error) {
    console.error(`[Timer] advanceQueue error for ${roomSlug}:`, error);
  }
}

export function handleDurationReport(io: Server, roomSlug: string, durationSeconds: number): void {
  if (durationSeconds > 0) {
    const state = getPlaybackState(roomSlug);
    if (state.isPaused) {
      Room.findOne({ slug: roomSlug }).then((room) => {
        if (!room?.currentVideo) return;
        room.currentVideo.duration = durationSeconds;
        room.save();
      });
      return;
    }

    Room.findOne({ slug: roomSlug }).then((room) => {
      if (!room?.currentVideo?.startedAt) return;
      const elapsed = (Date.now() - new Date(room.currentVideo.startedAt).getTime()) / 1000;
      const remaining = Math.max(durationSeconds - elapsed, 1);

      room.currentVideo.duration = durationSeconds;
      room.save();

      startVideoTimer(io, roomSlug, remaining);
      startSyncInterval(io, roomSlug);
    });
  }
}
