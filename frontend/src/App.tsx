import { lazy, Suspense, useEffect, useState } from 'react';
import { Routes, Route, useNavigate, useLocation } from 'react-router-dom';
import { motion } from 'motion/react';
import { Shield, Github, MessageSquare, GitBranch, Network, LayoutDashboard, Info, Palette } from 'lucide-react';
import { cn } from './lib/utils';
import { NavBar } from './components/ui/tubelight-navbar';
import { ErrorBoundary } from './components/ErrorBoundary';
import { MagneticButton } from './components/ui/magnetic-button';
import { useSwarmStore } from './store/swarm';

const Landing = lazy(() => import('./Landing').then(m => ({ default: m.Landing })));
const Dashboard = lazy(() => import('./Dashboard').then(m => ({ default: m.Dashboard })));
const TeamChat = lazy(() => import('./pages/TeamChat').then(m => ({ default: m.TeamChat })));
const Pipeline = lazy(() => import('./pages/Pipeline').then(m => ({ default: m.Pipeline })));
const Swarm = lazy(() => import('./pages/Swarm').then(m => ({ default: m.default })));

const navItems = [
  { name: 'Dashboard', url: '/dashboard', icon: LayoutDashboard },
  { name: 'Pipeline', url: '/pipeline', icon: GitBranch },
  { name: 'Team Chat', url: '/chat', icon: MessageSquare },
  { name: 'Swarm', url: '/swarm', icon: Network },
  { name: 'About', url: '/', icon: Info },
];

const pathToTab: Record<string, string> = {
  '/': 'About',
  '/dashboard': 'Dashboard',
  '/pipeline': 'Pipeline',
  '/chat': 'Team Chat',
  '/swarm': 'Swarm',
};

const tabToPath: Record<string, string> = {
  'Dashboard': '/dashboard',
  'Pipeline': '/pipeline',
  'Team Chat': '/chat',
  'Swarm': '/swarm',
  'About': '/',
};

function PageSkeleton() {
  return (
    <div className="relative z-10 flex items-center justify-center min-h-[60vh]">
      <div className="flex flex-col items-center gap-4">
        <div className="w-8 h-8 border-2 border-white/20 border-t-white/80 rounded-full animate-spin" />
        <p className="text-sm text-gray-500 font-medium tracking-wide">Loading...</p>
      </div>
    </div>
  );
}

export default function App() {
  const navigate = useNavigate();
  const location = useLocation();
  const activeTab = pathToTab[location.pathname] || '';
  const isSwarm = location.pathname === '/swarm';
  
  const [themeMode, setThemeMode] = useState<'peach' | 'dark'>(() => {
    return (localStorage.getItem('vibecheck-theme') as 'peach' | 'dark') || 'peach';
  });

  const { theme, cycleTheme } = useSwarmStore();

  const handleTabChange = (name: string) => {
    const path = tabToPath[name] ?? '/';
    navigate(path);
  };

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      const x = (e.clientX / window.innerWidth) * 100;
      const y = (e.clientY / window.innerHeight) * 100;
      document.documentElement.style.setProperty('--mouse-x', `${x}%`);
      document.documentElement.style.setProperty('--mouse-y', `${y}%`);
    };

    window.addEventListener('mousemove', handleMouseMove);
    return () => window.removeEventListener('mousemove', handleMouseMove);
  }, []);

  useEffect(() => {
    const colors = {
      light: {
        '--swarm-bg': '#F6F2EC',
        '--swarm-sidebar': '#15120F',
        '--swarm-canvas': '#FFFFFF',
        '--swarm-accent': '#D97706',
        '--swarm-muted': '#6B6560',
        '--swarm-bright': '#1A1714',
        '--swarm-border': 'rgba(26,23,20,0.1)',
        '--swarm-card': '#FFFFFF',
        '--swarm-text': '#1A1714',
        '--swarm-text-muted': '#6B6560',
      },
      charcoal: {
        '--swarm-bg': '#1a1a1a',
        '--swarm-sidebar': '#212121',
        '--swarm-canvas': '#262626',
        '--swarm-accent': '#d69a7c',
        '--swarm-muted': '#888888',
        '--swarm-bright': '#e5e5e5',
        '--swarm-border': '#333333',
        '--swarm-card': '#262626',
        '--swarm-text': '#e5e5e5',
        '--swarm-text-muted': '#888888',
      },
      black: {
        '--swarm-bg': '#000000',
        '--swarm-sidebar': '#000000',
        '--swarm-canvas': '#0a0a0a',
        '--swarm-accent': '#D97706',
        '--swarm-muted': '#a1a1aa',
        '--swarm-bright': '#ffffff',
        '--swarm-border': '#27272a',
        '--swarm-card': '#111111',
        '--swarm-text': '#ffffff',
        '--swarm-text-muted': '#a1a1aa',
      },
    };
    const root = document.documentElement;
    Object.entries(colors[theme]).forEach(([key, value]) => {
      root.style.setProperty(key, value);
    });
    document.documentElement.setAttribute('data-swarm-theme', theme);
  }, [theme]);

  const toggleTheme = () => {
    cycleTheme();
  };

  const themeBg = theme === 'light' ? '#F6F2EC' : theme === 'charcoal' ? '#262626' : '#000000';
  const themeText = theme === 'light' ? '#1A1714' : theme === 'charcoal' ? '#e5e5e5' : '#ffffff';
  const themeMuted = theme === 'light' ? '#6B6560' : theme === 'charcoal' ? '#888888' : '#a1a1aa';
  const themeCard = theme === 'light' ? '#FFFFFF' : theme === 'charcoal' ? '#1a1a1a' : '#111111';
  const themeBorder = theme === 'light' ? 'rgba(26,23,20,0.1)' : theme === 'charcoal' ? '#333333' : '#27272a';

  return (
    <div 
      className="min-h-screen font-sans overflow-hidden relative selection:bg-emerald-500/30"
      style={{ background: theme === 'light' ? '#F6F2EC' : theme === 'charcoal' ? '#050505' : '#000000', color: themeText }}
    >
      {!isSwarm && (
        <div className="fixed inset-0 z-0 overflow-hidden" style={{ aspectRatio: '16/9' }}>
          <div className="absolute inset-0 bg-gradient-to-br from-slate-900 via-[#0a0f1c] to-black" />

          <video
            autoPlay
            muted
            loop
            playsInline
            poster="/poster.webp"
            className="absolute inset-0 w-full h-full object-cover scale-[1.05] -translate-y-[2%] will-change-transform"
            style={{ objectPosition: 'center 10%' }}
            onError={(e) => {
              (e.target as HTMLVideoElement).style.display = 'none';
            }}
          >
            <source src="/background.mp4" type="video/mp4" />
          </video>

          <div className="absolute inset-0 bg-gradient-to-b from-black/20 via-black/50 to-black/80" />
          <div className="absolute inset-0 bg-gradient-radial from-emerald-900/30 to-transparent via-transparent blur-xl animate-glow-breathe" />
          <div className="absolute bottom-0 left-0 right-0 h-40 bg-gradient-to-t from-[#050505] to-transparent" />
        </div>
      )}

      <nav className={cn(
        "relative z-10 flex justify-between items-center w-full px-6 h-16",
        isSwarm ? "border-b" : "border-b border-white/[0.06]"
      )} role="navigation" aria-label="Main navigation"
        style={{
          background: isSwarm ? (theme === 'light' ? '#15120F' : theme === 'charcoal' ? '#212121' : '#000000') : '#15120F',
          borderColor: 'rgba(255,255,255,0.05)',
        }}
      >
        <div className="absolute left-6">
          <motion.button
            onClick={() => navigate('/')}
            whileHover={{ scale: 1.04 }}
            whileTap={{ scale: 0.97 }}
            className="flex items-center gap-2 text-xl font-bold tracking-tighter"
            aria-label="VibeCheck — Go to home page"
          >
            <motion.div whileHover={{ rotate: 15 }} transition={{ type: 'spring', stiffness: 300 }}>
              <Shield className="w-6 h-6" style={isSwarm ? { color: 'var(--swarm-accent)' } : { color: 'white' }} />
            </motion.div>
            <span className="hidden sm:inline-block" style={isSwarm ? { color: '#e5e5e5' } : { color: '#e8e8f0' }}>VibeCheck</span>
          </motion.button>
        </div>

        <div className="absolute left-1/2 -translate-x-1/2">
          <NavBar
            items={navItems}
            activeTab={activeTab}
            onTabChange={handleTabChange}
            swarmTheme={isSwarm}
          />
        </div>

        <div className="flex items-center gap-6 text-sm font-medium ml-auto">
          <a
            href="#"
            className={cn(
              "hidden md:flex items-center gap-2 transition-colors",
              isSwarm ? "text-[#888888] hover:text-amber-500" : "text-gray-300 hover:text-white"
            )}
            aria-label="View on GitHub"
          >
            <Github className="w-4 h-4" aria-hidden="true" />
            GitHub
          </a>
          
          <button
            onClick={toggleTheme}
            className="flex items-center justify-center w-8 h-8 rounded-full transition-colors opacity-75 hover:opacity-100"
            style={isSwarm ? { background: 'rgba(217,119,6,0.1)', color: '#D97706' } : { background: 'rgba(255,255,255,0.1)', color: 'white' }}
            title="Toggle Swarm Theme"
          >
            <Palette className="w-4 h-4" />
          </button>

          {isSwarm ? (
            <button
              onClick={() => navigate('/pipeline')}
              aria-label="Start a security scan"
              className="px-4 py-2 rounded-md font-medium text-sm transition-all duration-200"
              style={{
                background: 'rgba(217,119,6,0.12)',
                border: '1px solid rgba(217,119,6,0.3)',
                color: '#D97706',
              }}
              onMouseEnter={e => {
                e.currentTarget.style.background = 'rgba(217,119,6,0.2)';
                e.currentTarget.style.borderColor = 'rgba(217,119,6,0.5)';
              }}
              onMouseLeave={e => {
                e.currentTarget.style.background = 'rgba(217,119,6,0.12)';
                e.currentTarget.style.borderColor = 'rgba(217,119,6,0.3)';
              }}
            >
              Start Scanning
            </button>
          ) : (
            <MagneticButton
              onClick={() => navigate('/pipeline')}
              aria-label="Start a security scan"
            >
              Start Scanning
            </MagneticButton>
          )}
        </div>
      </nav>

      <ErrorBoundary>
        <Suspense fallback={<PageSkeleton />} key={location.pathname}>
          <Routes>
            <Route path="/" element={<Landing />} />
            <Route path="/dashboard" element={<Dashboard />} />
            <Route path="/pipeline" element={<Pipeline />} />
            <Route path="/chat" element={<TeamChat />} />
            <Route path="/swarm" element={<Swarm />} />
          </Routes>
        </Suspense>
      </ErrorBoundary>
    </div>
  );
}