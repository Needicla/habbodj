import { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Socket } from 'socket.io-client';

export interface RoomUser {
  _id: string;
  username: string;
  avatarColor: string;
  isAnonymous: boolean;
}

export interface VideoItem {
  _id?: string;
  url: string;
  title: string;
  duration: number;
  addedBy: { _id: string; username: string };
  upvotes: string[];
  downvotes: string[];
}

export interface CurrentVideo {
  url: string;
  title: string;
  duration: number;
  addedBy: { _id: string; username: string };
  startedAt: string;
}

export interface ChatMessage {
  user: { _id: string; username: string; avatarColor: string };
  message: string;
  timestamp: string;
}

export interface RoomData {
  _id: string;
  name: string;
  slug: string;
  creatorId: string;
  moderators: string[];
  isPrivate: boolean;
  currentVideo: CurrentVideo | null;
  queue: VideoItem[];
}

export interface MediaSync {
  currentTime: number;
  paused: boolean;
}

interface UseRoomReturn {
  room: RoomData | null;
  users: RoomUser[];
  messages: ChatMessage[];
  currentVideo: CurrentVideo | null;
  queue: VideoItem[];
  moderators: string[];
  isHost: boolean;
  isModerator: boolean;
  canModerate: boolean;
  isPaused: boolean;
  mediaSync: MediaSync | null;
  error: string | null;
  passwordRequired: boolean;
  sendChat: (message: string) => void;
  addVideo: (url: string) => void;
  vote: (videoIndex: number, type: 'up' | 'down') => void;
  skipVideo: () => void;
  removeVideo: (videoIndex: number) => void;
  removeUser: (userId: string) => void;
  reportDuration: (duration: number) => void;
  submitPassword: (password: string) => void;
  togglePrivacy: (isPrivate: boolean, password?: string) => void;
  deleteRoom: () => void;
  sendMediaUpdate: (currentTime: number, paused: boolean) => void;
  promoteMod: (userId: string) => void;
  demoteMod: (userId: string) => void;
}

export function useRoom(socket: Socket | null, slug: string, userId: string): UseRoomReturn {
  const navigate = useNavigate();
  const [room, setRoom] = useState<RoomData | null>(null);
  const [users, setUsers] = useState<RoomUser[]>([]);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [currentVideo, setCurrentVideo] = useState<CurrentVideo | null>(null);
  const [queue, setQueue] = useState<VideoItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [passwordRequired, setPasswordRequired] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [moderators, setModerators] = useState<string[]>([]);
  const [mediaSync, setMediaSync] = useState<MediaSync | null>(null);
  const joinedRef = useRef(false);

  const isHost = room?.creatorId === userId;
  const isModerator = moderators.includes(userId);
  const canModerate = isHost || isModerator;

  const submitPassword = useCallback(
    (password: string) => {
      if (socket && slug) {
        setPasswordRequired(false);
        setError(null);
        socket.emit('joinRoom', { roomSlug: slug, password });
      }
    },
    [socket, slug]
  );

  useEffect(() => {
    if (!socket || !slug) return;

    if (joinedRef.current) return;
    joinedRef.current = true;

    socket.emit('joinRoom', { roomSlug: slug });

    const handleRoomState = (data: {
      room: RoomData;
      users: RoomUser[];
      playbackState?: { isPaused: boolean; pausedAt: number };
    }) => {
      setRoom(data.room);
      setUsers(data.users);
      setCurrentVideo(data.room.currentVideo);
      setQueue(data.room.queue);
      setModerators(data.room.moderators || []);
      setError(null);
      if (data.playbackState) {
        setIsPaused(data.playbackState.isPaused);
        if (data.playbackState.isPaused && data.playbackState.pausedAt > 0) {
          // Seed initial mediaSync so VideoPlayer can sync on join
          setMediaSync({
            currentTime: data.playbackState.pausedAt,
            paused: true,
          });
        }
      } else {
        setIsPaused(false);
      }
      socket.emit('getChatHistory');
    };

    const handleChatHistory = (history: ChatMessage[]) => {
      setMessages(history);
    };

    const handleUserJoined = (data: { user: RoomUser }) => {
      setUsers((prev) => {
        if (prev.find((u) => u._id === data.user._id)) return prev;
        return [...prev, data.user];
      });
    };

    const handleUserLeft = (data: { user: RoomUser }) => {
      setUsers((prev) => prev.filter((u) => u._id !== data.user._id));
    };

    const handleChatMessage = (msg: ChatMessage) => {
      setMessages((prev) => [...prev, msg]);
    };

    const handleQueueUpdated = (data: { queue: VideoItem[] }) => {
      setQueue(data.queue);
    };

    const handleNowPlaying = (data: { video: CurrentVideo | null }) => {
      setCurrentVideo(data.video);
      setIsPaused(false);
      setMediaSync(null);
    };

    const handleError = (data: { message: string }) => {
      setError(data.message);
      if (data.message === 'Incorrect room password') {
        setPasswordRequired(true);
      } else {
        setTimeout(() => setError(null), 5000);
      }
    };

    const handleKicked = (data: { message: string }) => {
      setError(data.message);
      setRoom(null);
    };

    const handlePasswordRequired = () => {
      setPasswordRequired(true);
    };

    const handlePrivacyUpdated = (data: { isPrivate: boolean }) => {
      setRoom((prev) => (prev ? { ...prev, isPrivate: data.isPrivate } : prev));
    };

    const handleRoomDeleted = () => {
      setRoom(null);
      navigate('/', { replace: true });
    };

    const handleModeratorsUpdated = (data: { moderators: string[] }) => {
      setModerators(data.moderators);
    };

    // CyTube-style: ONE event for all playback sync
    const handleMediaUpdate = (data: { currentTime: number; paused: boolean }) => {
      setMediaSync(data);
      setIsPaused(data.paused);
    };

    socket.on('roomState', handleRoomState);
    socket.on('chatHistory', handleChatHistory);
    socket.on('userJoined', handleUserJoined);
    socket.on('userLeft', handleUserLeft);
    socket.on('chatMessage', handleChatMessage);
    socket.on('queueUpdated', handleQueueUpdated);
    socket.on('nowPlaying', handleNowPlaying);
    socket.on('error', handleError);
    socket.on('kicked', handleKicked);
    socket.on('passwordRequired', handlePasswordRequired);
    socket.on('privacyUpdated', handlePrivacyUpdated);
    socket.on('roomDeleted', handleRoomDeleted);
    socket.on('moderatorsUpdated', handleModeratorsUpdated);
    socket.on('mediaUpdate', handleMediaUpdate);

    return () => {
      joinedRef.current = false;
      socket.emit('leaveRoom');
      socket.off('roomState', handleRoomState);
      socket.off('chatHistory', handleChatHistory);
      socket.off('userJoined', handleUserJoined);
      socket.off('userLeft', handleUserLeft);
      socket.off('chatMessage', handleChatMessage);
      socket.off('queueUpdated', handleQueueUpdated);
      socket.off('nowPlaying', handleNowPlaying);
      socket.off('error', handleError);
      socket.off('kicked', handleKicked);
      socket.off('passwordRequired', handlePasswordRequired);
      socket.off('privacyUpdated', handlePrivacyUpdated);
      socket.off('roomDeleted', handleRoomDeleted);
      socket.off('moderatorsUpdated', handleModeratorsUpdated);
      socket.off('mediaUpdate', handleMediaUpdate);
    };
  }, [socket, slug, navigate]);

  const sendChat = useCallback(
    (message: string) => {
      if (socket) socket.emit('sendChat', { message });
    },
    [socket]
  );

  const addVideo = useCallback(
    (url: string) => {
      if (socket) socket.emit('addVideo', { url });
    },
    [socket]
  );

  const vote = useCallback(
    (videoIndex: number, type: 'up' | 'down') => {
      if (socket) socket.emit('vote', { videoIndex, type });
    },
    [socket]
  );

  const skipVideo = useCallback(() => {
    if (socket) socket.emit('skipVideo');
  }, [socket]);

  const removeVideo = useCallback(
    (videoIndex: number) => {
      if (socket) socket.emit('removeVideo', { videoIndex });
    },
    [socket]
  );

  const removeUser = useCallback(
    (targetUserId: string) => {
      if (socket) socket.emit('removeUser', { userId: targetUserId });
    },
    [socket]
  );

  const reportDuration = useCallback(
    (duration: number) => {
      if (socket) socket.emit('reportDuration', { duration });
    },
    [socket]
  );

  const togglePrivacy = useCallback(
    (isPrivate: boolean, password?: string) => {
      if (socket) socket.emit('togglePrivacy', { isPrivate, password });
    },
    [socket]
  );

  const deleteRoom = useCallback(() => {
    if (socket) socket.emit('deleteRoom');
  }, [socket]);

  // CyTube-style: host sends mediaUpdate with { currentTime, paused }
  const sendMediaUpdate = useCallback(
    (currentTime: number, paused: boolean) => {
      if (socket) socket.emit('mediaUpdate', { currentTime, paused });
    },
    [socket]
  );

  const promoteMod = useCallback(
    (targetUserId: string) => {
      if (socket) socket.emit('promoteMod', { userId: targetUserId });
    },
    [socket]
  );

  const demoteMod = useCallback(
    (targetUserId: string) => {
      if (socket) socket.emit('demoteMod', { userId: targetUserId });
    },
    [socket]
  );

  return {
    room,
    users,
    messages,
    currentVideo,
    queue,
    moderators,
    isHost,
    isModerator,
    canModerate,
    isPaused,
    mediaSync,
    error,
    passwordRequired,
    sendChat,
    addVideo,
    vote,
    skipVideo,
    removeVideo,
    removeUser,
    reportDuration,
    submitPassword,
    togglePrivacy,
    deleteRoom,
    sendMediaUpdate,
    promoteMod,
    demoteMod,
  };
}
