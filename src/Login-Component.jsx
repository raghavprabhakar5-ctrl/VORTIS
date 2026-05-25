// ADD THIS TO THE BEGINNING OF YOUR APP.JSX, INSIDE THE COMPONENT

// Add these states at the top with other useState declarations:
const [isAuthenticated, setIsAuthenticated] = useState(false);
const [showLoginModal, setShowLoginModal] = useState(true);

// Add this function to handle OAuth login (mock for now - integrate with real OAuth later):
const handleOAuthLogin = (provider) => {
  // Mock login - in production, integrate with Firebase Auth or Auth0
  setUserProfile({
    name: `${provider} User`,
    email: `user@${provider}.com`,
    avatar: provider === 'google' ? '🔵' : provider === 'microsoft' ? '🔷' : '🐙',
    provider: provider
  });
  setIsAuthenticated(true);
  setShowLoginModal(false);
  
  // Save to localStorage
  localStorage.setItem('vortis_user', JSON.stringify({
    name: `${provider} User`,
    email: `user@${provider}.com`,
    provider: provider
  }));
};

// Add logout function:
const handleLogout = () => {
  if (window.confirm('Are you sure you want to log out?')) {
    setIsAuthenticated(false);
    setShowLoginModal(true);
    setUserProfile({ name: 'Guest User', email: 'user@example.com', avatar: '👤', provider: 'none' });
    localStorage.removeItem('vortis_user');
  }
};

// Check if user is already logged in (add to useEffect):
useEffect(() => {
  const savedUser = localStorage.getItem('vortis_user');
  if (savedUser) {
    const user = JSON.parse(savedUser);
    setUserProfile({
      ...user,
      avatar: user.provider === 'google' ? '🔵' : user.provider === 'microsoft' ? '🔷' : user.provider === 'github' ? '🐙' : '👤'
    });
    setIsAuthenticated(true);
    setShowLoginModal(false);
  }
}, []);


// ADD THIS LOGIN MODAL BEFORE YOUR MAIN APP CONTENT (after the bgClass line):

{!isAuthenticated && showLoginModal && (
  <div className="fixed inset-0 bg-black/90 backdrop-blur-md flex items-center justify-center z-[200] p-4">
    <div className={`${darkMode ? 'bg-slate-800' : 'bg-white'} rounded-3xl shadow-2xl max-w-md w-full p-8 relative overflow-hidden`}>
      {/* Animated Background */}
      <div className="absolute inset-0 bg-gradient-to-br from-purple-600/20 to-blue-600/20 animate-pulse"></div>
      
      <div className="relative z-10">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="w-20 h-20 mx-auto bg-gradient-to-r from-purple-600 to-blue-600 rounded-full flex items-center justify-center mb-4 animate-bounce">
            <Zap className="w-10 h-10 text-white" />
          </div>
          <h1 className={`text-3xl font-bold mb-2 ${darkMode ? 'text-white' : 'text-slate-800'}`}>
            Welcome to VORTIS
          </h1>
          <p className={`text-sm ${darkMode ? 'text-slate-400' : 'text-slate-600'}`}>
            Your advanced AI assistant powered by cutting-edge technology
          </p>
        </div>

        {/* Social Login Buttons */}
        <div className="space-y-3 mb-6">
          <button 
            onClick={() => handleOAuthLogin('google')}
            className={`w-full p-4 rounded-xl border-2 ${darkMode ? 'border-slate-700 bg-slate-700/50 hover:bg-slate-600' : 'border-slate-300 bg-white hover:bg-slate-50'} transition-all flex items-center justify-center gap-3 group`}
          >
            <svg className="w-6 h-6" viewBox="0 0 24 24">
              <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
              <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
              <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
              <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
            </svg>
            <span className={`font-medium ${darkMode ? 'text-white' : 'text-slate-800'}`}>
              Continue with Google
            </span>
          </button>

          <button 
            onClick={() => handleOAuthLogin('microsoft')}
            className={`w-full p-4 rounded-xl border-2 ${darkMode ? 'border-slate-700 bg-slate-700/50 hover:bg-slate-600' : 'border-slate-300 bg-white hover:bg-slate-50'} transition-all flex items-center justify-center gap-3 group`}
          >
            <svg className="w-6 h-6" viewBox="0 0 23 23">
              <path fill="#f35325" d="M0 0h11v11H0z"/>
              <path fill="#81bc06" d="M12 0h11v11H12z"/>
              <path fill="#05a6f0" d="M0 12h11v11H0z"/>
              <path fill="#ffba08" d="M12 12h11v11H12z"/>
            </svg>
            <span className={`font-medium ${darkMode ? 'text-white' : 'text-slate-800'}`}>
              Continue with Microsoft
            </span>
          </button>

          <button 
            onClick={() => handleOAuthLogin('github')}
            className={`w-full p-4 rounded-xl border-2 ${darkMode ? 'border-slate-700 bg-slate-700/50 hover:bg-slate-600' : 'border-slate-300 bg-white hover:bg-slate-50'} transition-all flex items-center justify-center gap-3 group`}
          >
            <svg className="w-6 h-6" fill={darkMode ? 'white' : 'black'} viewBox="0 0 24 24">
              <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"/>
            </svg>
            <span className={`font-medium ${darkMode ? 'text-white' : 'text-slate-800'}`}>
              Continue with GitHub
            </span>
          </button>
        </div>

        {/* Divider */}
        <div className="flex items-center gap-4 mb-6">
          <div className={`flex-1 h-px ${darkMode ? 'bg-slate-700' : 'bg-slate-300'}`}></div>
          <span className={`text-sm ${darkMode ? 'text-slate-500' : 'text-slate-500'}`}>or</span>
          <div className={`flex-1 h-px ${darkMode ? 'bg-slate-700' : 'bg-slate-300'}`}></div>
        </div>

        {/* Guest Access */}
        <button 
          onClick={() => {
            setIsAuthenticated(true);
            setShowLoginModal(false);
          }}
          className={`w-full p-4 rounded-xl ${darkMode ? 'bg-slate-700/50 hover:bg-slate-700 text-slate-300' : 'bg-slate-100 hover:bg-slate-200 text-slate-700'} transition-all font-medium`}
        >
          Continue as Guest
        </button>

        {/* Terms */}
        <p className={`text-xs text-center mt-6 ${darkMode ? 'text-slate-500' : 'text-slate-500'}`}>
          By continuing, you agree to our{' '}
          <a href="#" className="text-purple-400 hover:underline">Terms of Service</a>
          {' '}and{' '}
          <a href="#" className="text-purple-400 hover:underline">Privacy Policy</a>
        </p>
      </div>
    </div>
  </div>
)}


// IN THE ACCOUNT TAB OF SETTINGS, ADD LOGOUT BUTTON:
// Find the Account tab section and add this at the bottom:

<button 
  onClick={handleLogout}
  className="w-full p-3 bg-red-500/20 hover:bg-red-500/30 text-red-400 rounded-lg font-medium flex items-center justify-center gap-2 mt-4"
>
  <LogOut className="w-4 h-4" />
  Log Out
</button>