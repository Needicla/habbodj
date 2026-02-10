import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useSocket } from '../contexts/SocketContext';
import { useRoom } from '../hooks/useRoom';
import VideoPlayer from '../components/room/VideoPlayer';
import NowPlaying from '../components/room/NowPlaying';
import ChatPanel from '../components/room/ChatPanel';
import VideoQueue from '../components/room/VideoQueue';
import UserList from '../components/room/UserList';
import AddVideoForm from '../components/room/AddVideoForm';

export default function RoomPage() {
  const { slug } = useParams<{ slug: string }>();
  const { user } = useAuth();
  const { socket, connected } = useSocket();
  const navigate = useNavigate();

  const {
    room,
    users,
    messages,
    currentVideo,
    queue,
    isHost,
    error,
    sendChat,
    addVideo,
    vote,
    skipVideo,
    removeVideo,
    removeUser,
    reportDuration,
  } = useRoom(socket, slug || '', user?._id || '');

  if (!connected) {
    return (
      <div className="flex items-center justify-center h-[calc(100vh-60px)]">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-purple-500 mx-auto mb-4"></div>
          <p className="text-gray-400">Connecting...</p>
        </div>
      </div>
    );
  }

  // If kicked or room not found
  if (error && !room) {
    return (
      <div className="flex items-center justify-center h-[calc(100vh-60px)]">
        <div className="text-center">
          <p className="text-red-400 text-lg mb-4">{error}</p>
          <button onClick={() => navigate('/')} className="btn-primary">
            Back to Rooms
          </button>
        </div>
      </div>
    );
  }

  if (!room) {
    return (
      <div className="flex items-center justify-center h-[calc(100vh-60px)]">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-purple-500 mx-auto mb-4"></div>
          <p className="text-gray-400">Joining room...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-[calc(100vh-60px)] flex flex-col overflow-hidden">
      {/* Room header */}
      <div className="px-4 py-2 bg-gray-900/50 border-b border-gray-800 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate('/')}
            className="text-gray-400 hover:text-white transition-colors text-sm"
          >
            &larr; Back
          </button>
          <h1 className="text-lg font-bold">{room.name}</h1>
          {isHost && (
            <span className="text-[10px] bg-purple-500/20 text-purple-400 px-2 py-0.5 rounded-full font-medium">
              HOST
            </span>
          )}
        </div>
        <div className="text-sm text-gray-400">
          {users.length} user{users.length !== 1 ? 's' : ''}
        </div>
      </div>

      {/* Error toast */}
      {error && room && (
        <div className="mx-4 mt-2 bg-red-500/10 border border-red-500/20 rounded-lg px-4 py-2 text-red-400 text-sm shrink-0">
          {error}
        </div>
      )}

      {/* Main content: responsive grid */}
      <div className="flex-1 min-h-0 grid grid-cols-1 lg:grid-cols-3 gap-4 p-4 overflow-hidden">
        {/* Left column: Video + Now Playing + Add Video */}
        <div className="lg:col-span-2 flex flex-col gap-4 min-h-0 overflow-y-auto">
          <VideoPlayer currentVideo={currentVideo} onDuration={reportDuration} />
          <NowPlaying currentVideo={currentVideo} isHost={isHost} onSkip={skipVideo} />
          <AddVideoForm onAdd={addVideo} />

          {/* Queue - visible on mobile, hidden on desktop (shown in right column) */}
          <div className="lg:hidden">
            <VideoQueue
              queue={queue}
              userId={user?._id || ''}
              isHost={isHost}
              onVote={vote}
              onRemove={removeVideo}
            />
          </div>
        </div>

        {/* Right column: Chat + Users + Queue (desktop) */}
        <div className="flex flex-col gap-4 min-h-0 overflow-hidden">
          <UserList
            users={users}
            hostId={room.creatorId}
            currentUserId={user?._id || ''}
            isHost={isHost}
            onRemoveUser={removeUser}
          />

          {/* Queue - hidden on mobile, visible on desktop */}
          <div className="hidden lg:flex flex-col flex-1 min-h-0">
            <VideoQueue
              queue={queue}
              userId={user?._id || ''}
              isHost={isHost}
              onVote={vote}
              onRemove={removeVideo}
            />
          </div>

          <div className="flex-1 min-h-0 lg:flex-none lg:h-80">
            <ChatPanel messages={messages} onSend={sendChat} />
          </div>
        </div>
      </div>
    </div>
  );
}
