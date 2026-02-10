import { useState, useRef, useEffect } from 'react';
import type { ChatMessage } from '../../hooks/useRoom';
import Avatar from '../ui/Avatar';

interface ChatPanelProps {
  messages: ChatMessage[];
  onSend: (message: string) => void;
}

export default function ChatPanel({ messages, onSend }: ChatPanelProps) {
  const [input, setInput] = useState('');
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const msg = input.trim();
    if (!msg) return;
    onSend(msg);
    setInput('');
  };

  return (
    <div className="card flex flex-col h-full">
      <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-3">Chat</h3>

      <div className="flex-1 overflow-y-auto space-y-2 mb-3 min-h-0">
        {messages.length === 0 && (
          <p className="text-gray-600 text-sm text-center py-8">No messages yet. Say hello!</p>
        )}
        {messages.map((msg, i) => (
          <div key={i} className="flex items-start gap-2 group">
            <Avatar
              username={msg.user.username}
              color={msg.user.avatarColor}
              size="sm"
            />
            <div className="min-w-0">
              <span className="text-xs font-semibold" style={{ color: msg.user.avatarColor }}>
                {msg.user.username}
              </span>
              <p className="text-sm text-gray-300 break-words">{msg.message}</p>
            </div>
            <span className="text-[10px] text-gray-600 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity ml-auto">
              {new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </span>
          </div>
        ))}
        <div ref={bottomRef} />
      </div>

      <form onSubmit={handleSubmit} className="flex gap-2">
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          className="input-field flex-1 text-sm py-1.5"
          placeholder="Type a message..."
          maxLength={500}
        />
        <button type="submit" className="btn-primary py-1.5 px-3 text-sm">
          Send
        </button>
      </form>
    </div>
  );
}
