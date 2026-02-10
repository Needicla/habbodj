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
  isPrivate: boolean;
  currentVideo: CurrentVideo | null;
  queue: VideoItem[];
}

interface UseRoomReturn {
  room: RoomData | null;
  users: RoomUser[];
  messages: ChatMessage[];
  currentVideo: CurrentVideo | null;
  queue: VideoItem[];
  isHost: boolean;
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
  const joinedRef = useRef(false);

  const isHost = room?.creatorId === userId;

  // Submit password for private room
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

  // Join room on mount
  useEffect(() => {
    if (!socket || !slug) return;

    // Prevent double-join in strict mode
    if (joinedRef.current) return;
    joinedRef.current = true;

    socket.emit('joinRoom', { roomSlug: slug });

    // Room state on join
    const handleRoomState = (data: { room: RoomData; users: RoomUser[] }) => {
      setRoom(data.room);
      setUsers(data.users);
      setCurrentVideo(data.room.currentVideo);
      setQueue(data.room.queue);
      setError(null);
      // Request chat history
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
    };

    const handleError = (data: { message: string }) => {
      setError(data.message);
      // If wrong password, re-show the password prompt
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

  return {
    room,
    users,
    messages,
    currentVideo,
    queue,
    isHost,
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
  };
}
