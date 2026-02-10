import { Server, Socket } from 'socket.io';

export interface ChatMessage {
  user: {
    _id: string;
    username: string;
    avatarColor: string;
  };
  message: string;
  timestamp: string;
}

// In-memory chat history per room (last 100 messages)
const chatHistory = new Map<string, ChatMessage[]>();

const MAX_HISTORY = 100;

export function registerChatHandlers(io: Server, socket: Socket): void {
  socket.on('sendChat', (data: { message: string }) => {
    const currentRoom = (socket.data as any).currentRoom as string | undefined;
    if (!currentRoom) {
      socket.emit('error', { message: 'Not in a room' });
      return;
    }

    const message = data.message?.trim();
    if (!message || message.length === 0 || message.length > 500) {
      socket.emit('error', { message: 'Message must be 1-500 characters' });
      return;
    }

    const userId = (socket.data as any).userId as string;
    const username = (socket.data as any).username as string;
    const avatarColor = (socket.data as any).avatarColor as string;

    const chatMsg: ChatMessage = {
      user: { _id: userId, username, avatarColor },
      message,
      timestamp: new Date().toISOString(),
    };

    // Store in history
    if (!chatHistory.has(currentRoom)) {
      chatHistory.set(currentRoom, []);
    }
    const history = chatHistory.get(currentRoom)!;
    history.push(chatMsg);
    if (history.length > MAX_HISTORY) {
      history.shift();
    }

    // Broadcast to everyone in the room (including sender)
    io.to(currentRoom).emit('chatMessage', chatMsg);
  });

  socket.on('getChatHistory', () => {
    const currentRoom = (socket.data as any).currentRoom as string | undefined;
    if (!currentRoom) return;

    const history = chatHistory.get(currentRoom) || [];
    socket.emit('chatHistory', history);
  });
}
