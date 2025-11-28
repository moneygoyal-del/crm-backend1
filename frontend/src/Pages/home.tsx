import { Link } from 'react-router-dom';

function Home() {
  const userString = localStorage.getItem('user');
  const user = userString ? JSON.parse(userString) : { name: 'User', role: '' };

  const handleLogout = () => {
    localStorage.removeItem('authToken');
    localStorage.removeItem('user');
    window.location.href = '/login';
  };


  const canUpdateDisposition = user.role === 'operations' || user.role === 'super_admin';

  return (
    <div className="min-h-screen w-full bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900 flex flex-col">

      <header className="bg-gray-800/50 backdrop-blur-sm border-b border-gray-700 sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
        
          <div className="flex items-center justify-between">
            {/* 1. New Title on the left */}
            <div>
              <h1 className="text-xl font-bold text-white">Medpho CRM</h1>
            </div>

            {/* 2. User name and Logout on the right */}
            <div className="flex items-center space-x-4">
              <span className="text-white font-medium capitalize">
                {user.name.split(' ')[0]} <span className="text-xs text-gray-500">({user.role})</span>
              </span>
              <button
                onClick={handleLogout}
                className="flex items-center space-x-1 text-red-400 rounded-lg transition-colors cursor-pointer"
              >
                <svg
                  className="w-7 h-7"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"
                  />
                </svg>
                <span className="hidden md:inline">Logout</span>
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-12 flex-grow">
        
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {/* 1. Book OPD Card */}
          <Link to="/book-opd" className="group">
            <div className="bg-gray-800 rounded-2xl p-6 border border-gray-700 hover:border-cyan-500 transition-all duration-300 transform hover:scale-[1.02] hover:shadow-2xl hover:shadow-cyan-500/20">
              <h3 className="text-xl font-bold text-white mb-2">
                Book OPD Appointment
              </h3>           
             </div>
          </Link>

          {/* 2. Log Meeting Card */}
          <Link to="/log-meeting" className="group">
            <div className="bg-gray-800 rounded-2xl p-6 border border-gray-700 hover:border-blue-500 transition-all duration-300 transform hover:scale-[1.02] hover:shadow-2xl hover:shadow-blue-500/20">
              <h3 className="text-xl font-bold text-white mb-2">
                Log Doctor Meeting
              </h3>
            </div>
          </Link>

          {/* 3. "Update Patient Phone" CARD */}
          <Link to="/update-patient-phone" className="group">
            <div className="bg-gray-800 rounded-2xl p-6 border border-gray-700 hover:border-yellow-500 transition-all duration-300 transform hover:scale-[1.02] hover:shadow-2xl hover:shadow-yellow-500/20">
              <h3 className="text-xl font-bold text-white mb-2">
                Update Patient Phone
              </h3>
            </div>
          </Link>

          {/* 4. --- Disposition Update (CONDITIONAL) --- */}
          {canUpdateDisposition && (
            <Link to="/update-disposition" className="group">
              <div className="bg-gray-800 rounded-2xl p-6 border border-gray-700 hover:border-purple-500 transition-all duration-300 transform hover:scale-[1.02] hover:shadow-2xl hover:shadow-purple-500/20">
                <h3 className="text-xl font-bold text-white mb-2">Update Disposition</h3>
              </div>
            </Link>
          )}
        </div>

      </main>

      <footer className="bg-gray-800/30 border-t border-gray-700">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 text-center text-sm text-gray-400">
          <p>© 2025 Medpho CRM. All rights reserved.</p>
        </div>
      </footer>
    </div>
  );
}

export default Home;