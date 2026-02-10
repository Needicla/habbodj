import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../lib/api';
import { useAuth } from '../contexts/AuthContext';

interface RoomInfo {
  _id: string;
  name: string;
  slug: string;
  creatorId: string;
  isPrivate: boolean;
  queueLength: number;
  currentVideo: { title: string } | null;
  createdAt: string;
}

export default function HomePage() {
  const [rooms, setRooms] = useState<RoomInfo[]>([]);
  const [roomCounts, setRoomCounts] = useState<Record<string, number>>({});
  const [newRoomName, setNewRoomName] = useState('');
  const [isPrivate, setIsPrivate] = useState(false);
  const [roomPassword, setRoomPassword] = useState('');
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState('');
  const [showCreate, setShowCreate] = useState(false);

  const { user } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    loadRooms();
    const interval = setInterval(loadRooms, 10000);
    return () => clearInterval(interval);
  }, []);

  async function loadRooms() {
    try {
      const [roomsRes, countsRes] = await Promise.all([
        api.get('/rooms'),
        api.get('/room-counts'),
      ]);
      setRooms(roomsRes.data);
      setRoomCounts(countsRes.data);
    } catch (err) {
      console.error('Failed to load rooms:', err);
    }
  }

  async function handleCreateRoom(e: React.FormEvent) {
    e.preventDefault();
    if (!newRoomName.trim()) return;
    setCreating(true);
    setError('');

    try {
      const payload: Record<string, any> = { name: newRoomName.trim() };
      if (isPrivate) {
        payload.isPrivate = true;
        payload.password = roomPassword;
      }
      const { data } = await api.post('/rooms', payload);
      navigate(`/room/${data.slug}`);
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to create room');
    } finally {
      setCreating(false);
    }
  }

  return (
    <div className="max-w-4xl mx-auto px-4 py-8">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold">Rooms</h1>
          <p className="text-gray-400 mt-1">Join a room or create your own</p>
        </div>
        <button
          onClick={() => setShowCreate(!showCreate)}
          className="btn-primary"
        >
          {showCreate ? 'Cancel' : '+ Create Room'}
        </button>
      </div>

      {showCreate && (
        <div className="card mb-6">
          <h2 className="text-lg font-semibold mb-3">Create a New Room</h2>
          {error && (
            <div className="bg-red-500/10 border border-red-500/20 rounded-lg px-4 py-2 mb-3 text-red-400 text-sm">
              {error}
            </div>
          )}
          <form onSubmit={handleCreateRoom} className="space-y-3">
            <div className="flex gap-3">
              <input
                type="text"
                value={newRoomName}
                onChange={(e) => setNewRoomName(e.target.value)}
                className="input-field flex-1"
                placeholder="Room name (e.g. Chill Vibes)"
                minLength={2}
                maxLength={50}
                required
              />
              <button type="submit" disabled={creating} className="btn-primary whitespace-nowrap">
                {creating ? 'Creating...' : 'Create'}
              </button>
            </div>
            <div className="flex items-center gap-3">
              <label className="flex items-center gap-2 cursor-pointer select-none text-sm text-gray-300">
                <input
                  type="checkbox"
                  checked={isPrivate}
                  onChange={(e) => {
                    setIsPrivate(e.target.checked);
                    if (!e.target.checked) setRoomPassword('');
                  }}
                  className="w-4 h-4 rounded border-gray-600 bg-gray-800 text-purple-500 focus:ring-purple-500"
                />
                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 text-gray-400" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M5 9V7a5 5 0 0110 0v2a2 2 0 012 2v5a2 2 0 01-2 2H5a2 2 0 01-2-2v-5a2 2 0 012-2zm8-2v2H7V7a3 3 0 016 0z" clipRule="evenodd" />
                </svg>
                Private room
              </label>
              {isPrivate && (
                <input
                  type="password"
                  value={roomPassword}
                  onChange={(e) => setRoomPassword(e.target.value)}
                  className="input-field flex-1"
                  placeholder="Room password"
                  required
                />
              )}
            </div>
          </form>
        </div>
      )}

      {rooms.length === 0 ? (
        <div className="text-center py-16">
          <div className="text-6xl mb-4 opacity-30">🎵</div>
          <h2 className="text-xl font-semibold text-gray-400 mb-2">No rooms yet</h2>
          <p className="text-gray-500">Be the first to create a room!</p>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {rooms.map((room) => {
            const userCount = roomCounts[room.slug] || 0;
            return (
              <button
                key={room._id}
                onClick={() => navigate(`/room/${room.slug}`)}
                className="card text-left hover:border-purple-500/50 transition-all duration-200 group cursor-pointer"
              >
                <div className="flex items-start justify-between mb-3">
                  <h3 className="text-lg font-semibold group-hover:text-purple-400 transition-colors flex items-center gap-2">
                    {room.isPrivate && (
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 text-yellow-500 shrink-0" viewBox="0 0 20 20" fill="currentColor" title="Private room">
                        <path fillRule="evenodd" d="M5 9V7a5 5 0 0110 0v2a2 2 0 012 2v5a2 2 0 01-2 2H5a2 2 0 01-2-2v-5a2 2 0 012-2zm8-2v2H7V7a3 3 0 016 0z" clipRule="evenodd" />
                      </svg>
                    )}
                    {room.name}
                  </h3>
                  <span className="text-xs bg-gray-800 px-2 py-1 rounded-full text-gray-400">
                    {userCount} online
                  </span>
                </div>

                {room.currentVideo ? (
                  <p className="text-sm text-gray-400 truncate mb-2">
                    Now playing: {room.currentVideo.title}
                  </p>
                ) : (
                  <p className="text-sm text-gray-500 mb-2">No video playing</p>
                )}

                <div className="flex items-center gap-3 text-xs text-gray-500">
                  <span>{room.queueLength} in queue</span>
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
