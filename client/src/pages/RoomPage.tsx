import { useState } from 'react';
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
  const [passwordInput, setPasswordInput] = useState('');
  const [showPrivacyPanel, setShowPrivacyPanel] = useState(false);
  const [privacyPassword, setPrivacyPassword] = useState('');
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  const {
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

  // Password required for private room
  if (passwordRequired) {
    return (
      <div className="flex items-center justify-center h-[calc(100vh-60px)]">
        <div className="card max-w-sm w-full mx-4">
          <div className="text-center mb-4">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-12 w-12 text-yellow-500 mx-auto mb-3" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M5 9V7a5 5 0 0110 0v2a2 2 0 012 2v5a2 2 0 01-2 2H5a2 2 0 01-2-2v-5a2 2 0 012-2zm8-2v2H7V7a3 3 0 016 0z" clipRule="evenodd" />
            </svg>
            <h2 className="text-xl font-bold">Private Room</h2>
            <p className="text-gray-400 text-sm mt-1">This room requires a password to enter</p>
          </div>
          {error && (
            <div className="bg-red-500/10 border border-red-500/20 rounded-lg px-4 py-2 mb-3 text-red-400 text-sm">
              {error}
            </div>
          )}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (passwordInput.trim()) submitPassword(passwordInput);
            }}
            className="space-y-3"
          >
            <input
              type="password"
              value={passwordInput}
              onChange={(e) => setPasswordInput(e.target.value)}
              className="input-field w-full"
              placeholder="Enter room password"
              autoFocus
              required
            />
            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => navigate('/')}
                className="flex-1 px-4 py-2 rounded-lg bg-gray-700 hover:bg-gray-600 text-gray-200 transition-colors text-sm font-medium"
              >
                Back
              </button>
              <button type="submit" className="flex-1 btn-primary">
                Enter Room
              </button>
            </div>
          </form>
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
          {room.isPrivate && (
            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 text-yellow-500 shrink-0" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M5 9V7a5 5 0 0110 0v2a2 2 0 012 2v5a2 2 0 01-2 2H5a2 2 0 01-2-2v-5a2 2 0 012-2zm8-2v2H7V7a3 3 0 016 0z" clipRule="evenodd" />
            </svg>
          )}
          {isHost && (
            <span className="text-[10px] bg-purple-500/20 text-purple-400 px-2 py-0.5 rounded-full font-medium">
              HOST
            </span>
          )}
          {isModerator && !isHost && (
            <span className="text-[10px] bg-blue-500/20 text-blue-400 px-2 py-0.5 rounded-full font-medium">
              MOD
            </span>
          )}
        </div>
        <div className="flex items-center gap-3">
          {isHost && (
            <div className="relative">
              <button
                onClick={() => setShowPrivacyPanel(!showPrivacyPanel)}
                className="text-xs px-2 py-1 rounded-lg bg-gray-800 hover:bg-gray-700 text-gray-300 transition-colors flex items-center gap-1.5"
                title={room.isPrivate ? 'Room is private' : 'Room is public'}
              >
                {room.isPrivate ? (
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5 text-yellow-500" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M5 9V7a5 5 0 0110 0v2a2 2 0 012 2v5a2 2 0 01-2 2H5a2 2 0 01-2-2v-5a2 2 0 012-2zm8-2v2H7V7a3 3 0 016 0z" clipRule="evenodd" />
                  </svg>
                ) : (
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5 text-gray-400" viewBox="0 0 20 20" fill="currentColor">
                    <path d="M10 2a5 5 0 00-5 5v2a2 2 0 00-2 2v5a2 2 0 002 2h10a2 2 0 002-2v-5a2 2 0 00-2-2H7V7a3 3 0 015.905-.75 1 1 0 001.937-.5A5.002 5.002 0 0010 2z" />
                  </svg>
                )}
                {room.isPrivate ? 'Private' : 'Public'}
              </button>

              {showPrivacyPanel && (
                <div className="absolute right-0 top-full mt-2 w-64 bg-gray-800 border border-gray-700 rounded-lg shadow-xl p-3 z-50">
                  {room.isPrivate ? (
                    <>
                      <p className="text-xs text-gray-400 mb-2">This room is currently private. Make it public?</p>
                      <button
                        onClick={() => {
                          togglePrivacy(false);
                          setShowPrivacyPanel(false);
                          setPrivacyPassword('');
                        }}
                        className="w-full btn-primary text-xs py-1.5"
                      >
                        Make Public
                      </button>
                    </>
                  ) : (
                    <form
                      onSubmit={(e) => {
                        e.preventDefault();
                        if (privacyPassword.trim()) {
                          togglePrivacy(true, privacyPassword);
                          setShowPrivacyPanel(false);
                          setPrivacyPassword('');
                        }
                      }}
                    >
                      <p className="text-xs text-gray-400 mb-2">Set a password to make this room private.</p>
                      <input
                        type="password"
                        value={privacyPassword}
                        onChange={(e) => setPrivacyPassword(e.target.value)}
                        className="input-field w-full text-xs mb-2"
                        placeholder="Room password"
                        autoFocus
                        required
                      />
                      <button type="submit" className="w-full btn-primary text-xs py-1.5">
                        Make Private
                      </button>
                    </form>
                  )}
                </div>
              )}
            </div>
          )}
          {isHost && (
            <button
              onClick={() => setShowDeleteConfirm(true)}
              className="text-xs px-2 py-1 rounded-lg bg-red-500/10 hover:bg-red-500/20 text-red-400 hover:text-red-300 transition-colors flex items-center gap-1.5"
              title="Delete room"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z" clipRule="evenodd" />
              </svg>
              Delete
            </button>
          )}
          <div className="text-sm text-gray-400">
            {users.length} user{users.length !== 1 ? 's' : ''}
          </div>
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
          <VideoPlayer
            currentVideo={currentVideo}
            canControl={canModerate}
            isPaused={isPaused}
            mediaSync={mediaSync}
            onDuration={reportDuration}
            onSendMediaUpdate={sendMediaUpdate}
          />
          <NowPlaying currentVideo={currentVideo} canModerate={canModerate} onSkip={skipVideo} />
          <AddVideoForm onAdd={addVideo} />

          {/* Queue - visible on mobile, hidden on desktop (shown in right column) */}
          <div className="lg:hidden">
            <VideoQueue
              queue={queue}
              userId={user?._id || ''}
              canModerate={canModerate}
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
            moderators={moderators}
            isHost={isHost}
            canModerate={canModerate}
            onRemoveUser={removeUser}
            onPromoteMod={promoteMod}
            onDemoteMod={demoteMod}
          />

          {/* Queue - hidden on mobile, visible on desktop */}
          <div className="hidden lg:flex flex-col flex-1 min-h-0">
            <VideoQueue
              queue={queue}
              userId={user?._id || ''}
              canModerate={canModerate}
              onVote={vote}
              onRemove={removeVideo}
            />
          </div>

          <div className="flex-1 min-h-0 lg:flex-none lg:h-80">
            <ChatPanel messages={messages} onSend={sendChat} />
          </div>
        </div>
      </div>

      {/* Delete room confirmation modal */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
          <div className="bg-gray-800 border border-gray-700 rounded-xl shadow-2xl max-w-sm w-full mx-4 p-5">
            <div className="text-center mb-4">
              <div className="mx-auto w-12 h-12 rounded-full bg-red-500/10 flex items-center justify-center mb-3">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 text-red-500" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                </svg>
              </div>
              <h3 className="text-lg font-bold text-white">Delete Room</h3>
              <p className="text-sm text-gray-400 mt-1">
                Are you sure you want to delete <strong className="text-gray-200">{room.name}</strong>? All users will be removed and this action cannot be undone.
              </p>
            </div>
            <div className="flex gap-3">
              <button
                onClick={() => setShowDeleteConfirm(false)}
                className="flex-1 px-4 py-2 rounded-lg bg-gray-700 hover:bg-gray-600 text-gray-200 transition-colors text-sm font-medium"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  deleteRoom();
                  setShowDeleteConfirm(false);
                }}
                className="flex-1 px-4 py-2 rounded-lg bg-red-600 hover:bg-red-500 text-white transition-colors text-sm font-medium"
              >
                Delete Room
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
