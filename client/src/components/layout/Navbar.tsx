import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { useSocket } from '../../contexts/SocketContext';

export default function Navbar() {
  const { user, logout } = useAuth();
  const { connected } = useSocket();
  const navigate = useNavigate();

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  return (
    <nav className="bg-gray-900 border-b border-gray-800 px-4 py-3">
      <div className="max-w-7xl mx-auto flex items-center justify-between">
        <Link to="/" className="flex items-center gap-2">
          <div className="w-8 h-8 bg-purple-600 rounded-lg flex items-center justify-center font-bold text-sm">
            HD
          </div>
          <span className="text-xl font-bold bg-gradient-to-r from-purple-400 to-pink-400 bg-clip-text text-transparent">
            HabboDJ
          </span>
        </Link>

        <div className="flex items-center gap-4">
          {user && (
            <>
              <div className="flex items-center gap-2">
                <div
                  className={`w-2 h-2 rounded-full ${connected ? 'bg-green-400' : 'bg-red-400'}`}
                  title={connected ? 'Connected' : 'Disconnected'}
                />
                <div
                  className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold"
                  style={{ backgroundColor: user.avatarColor }}
                >
                  {user.username[0].toUpperCase()}
                </div>
                <span className="text-sm text-gray-300 hidden sm:inline">
                  {user.username}
                </span>
              </div>
              <button
                onClick={handleLogout}
                className="text-sm text-gray-400 hover:text-white transition-colors"
              >
                Logout
              </button>
            </>
          )}
        </div>
      </div>
    </nav>
  );
}
