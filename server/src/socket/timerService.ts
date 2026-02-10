import { Server } from 'socket.io';
import { Room, IRoom } from '../models/Room';

// Per-room timers
const roomTimers = new Map<string, NodeJS.Timeout>();

// Per-room playback state (pause/seek tracking)
interface PlaybackState {
  isPaused: boolean;
  pausedAt: number; // seconds elapsed when paused
}

const roomPlaybackState = new Map<string, PlaybackState>();

/**
 * Get the current playback state for a room.
 */
export function getPlaybackState(roomSlug: string): PlaybackState {
  return roomPlaybackState.get(roomSlug) || { isPaused: false, pausedAt: 0 };
}

/**
 * Clear playback state for a room (used on new video or room deletion).
 */
export function clearPlaybackState(roomSlug: string): void {
  roomPlaybackState.delete(roomSlug);
}

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

    // Reset playback state for the new video
    clearPlaybackState(roomSlug);

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
    const state = getPlaybackState(roomSlug);
    // Don't restart timer if paused
    if (state.isPaused) {
      Room.findOne({ slug: roomSlug }).then((room) => {
        if (!room?.currentVideo) return;
        room.currentVideo.duration = durationSeconds;
        room.save();
      });
      return;
    }

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

/**
 * Host pauses playback for everyone in the room.
 */
export async function pausePlayback(io: Server, roomSlug: string): Promise<void> {
  const room = await Room.findOne({ slug: roomSlug });
  if (!room?.currentVideo?.startedAt) return;

  const elapsed = (Date.now() - new Date(room.currentVideo.startedAt).getTime()) / 1000;

  roomPlaybackState.set(roomSlug, { isPaused: true, pausedAt: elapsed });
  stopVideoTimer(roomSlug);

  io.to(roomSlug).emit('playbackPause', { pausedAt: elapsed });
  console.log(`[Playback] Room ${roomSlug}: paused at ${elapsed.toFixed(1)}s`);
}

/**
 * Host resumes playback for everyone in the room.
 */
export async function resumePlayback(io: Server, roomSlug: string): Promise<void> {
  const state = roomPlaybackState.get(roomSlug);
  if (!state?.isPaused) return;

  const room = await Room.findOne({ slug: roomSlug });
  if (!room?.currentVideo) return;

  // Adjust startedAt so elapsed calculation works correctly going forward
  const newStartedAt = new Date(Date.now() - state.pausedAt * 1000);
  room.currentVideo.startedAt = newStartedAt;
  await room.save();

  // Restart timer with remaining time
  const remaining = Math.max(room.currentVideo.duration - state.pausedAt, 1);
  startVideoTimer(io, roomSlug, remaining);

  roomPlaybackState.set(roomSlug, { isPaused: false, pausedAt: 0 });

  io.to(roomSlug).emit('playbackResume', { startedAt: newStartedAt.toISOString() });
  console.log(`[Playback] Room ${roomSlug}: resumed from ${state.pausedAt.toFixed(1)}s`);
}

/**
 * Host seeks to a specific position for everyone in the room.
 */
export async function seekPlayback(io: Server, roomSlug: string, position: number): Promise<void> {
  const room = await Room.findOne({ slug: roomSlug });
  if (!room?.currentVideo) return;

  const state = getPlaybackState(roomSlug);

  // Clamp position to valid range
  position = Math.max(0, Math.min(position, room.currentVideo.duration || Infinity));

  if (state.isPaused) {
    // Update paused position, don't restart timer
    roomPlaybackState.set(roomSlug, { isPaused: true, pausedAt: position });
    io.to(roomSlug).emit('playbackSeek', { position, isPaused: true });
  } else {
    // Update startedAt and restart timer
    const newStartedAt = new Date(Date.now() - position * 1000);
    room.currentVideo.startedAt = newStartedAt;
    await room.save();

    const remaining = Math.max(room.currentVideo.duration - position, 1);
    stopVideoTimer(roomSlug);
    startVideoTimer(io, roomSlug, remaining);

    roomPlaybackState.set(roomSlug, { isPaused: false, pausedAt: 0 });
    io.to(roomSlug).emit('playbackSeek', {
      position,
      isPaused: false,
      startedAt: newStartedAt.toISOString(),
    });
  }

  console.log(`[Playback] Room ${roomSlug}: seeked to ${position.toFixed(1)}s (paused: ${state.isPaused})`);
}
