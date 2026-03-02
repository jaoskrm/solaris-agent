import { useState } from 'react';
import { Shield, Github, MessageSquare, GitBranch, Network } from 'lucide-react';
import { Landing } from './Landing';
import { Dashboard } from './Dashboard';
import { TeamChat } from './pages/TeamChat';
import { Pipeline } from './pages/Pipeline';
import { Swarm } from './pages/Swarm';

type ViewType = 'landing' | 'dashboard' | 'chat' | 'pipeline' | 'swarm';

export default function App() {
  const [currentView, setCurrentView] = useState<ViewType>('landing');

  const renderView = () => {
    switch (currentView) {
      case 'landing':
        return <Landing />;
      case 'dashboard':
        return <Dashboard />;
      case 'chat':
        return <TeamChat />;
      case 'pipeline':
        return <Pipeline />;
      case 'swarm':
        return <Swarm />;
      default:
        return <Landing />;
    }
  };

  return (
    <div className="min-h-screen bg-[#050505] text-white font-sans overflow-hidden relative selection:bg-emerald-500/30">
      {/* Background Video - hidden when on swarm view */}
      {/* Fixed Background Video - FULL FRAME, NO CROPPING */}
      {currentView !== 'swarm' && (
        <div className="fixed inset-0 z-0 overflow-hidden">
          <video
            autoPlay
            muted
            loop
            playsInline
            className="w-screen h-screen object-fill scale-[1.05] -translate-y-[2%]"  // Key fixes
            style={{
              objectPosition: 'center 10%',  // Adjust vertical position
            }}
          >
            <source src="/background.mp4" type="video/mp4" />
          </video>
          
          {/* Optimized overlay */}
          <div className="absolute inset-0 bg-gradient-to-b from-black/20 via-black/50 to-black/80"></div>
          
          {/* Subtle glow - reduced size */}
          <div className="absolute inset-0 bg-gradient-radial from-emerald-900/30 to-transparent via-transparent blur-xl animate-pulse"></div>
          
          {/* Bottom fade */}
          <div className="absolute bottom-0 left-0 right-0 h-40 bg-gradient-to-t from-[#050505] to-transparent"></div>
        </div>
      )}

      {/* Navigation */}
      <nav className="relative z-10 flex items-center justify-between px-6 py-6 max-w-7xl mx-auto w-full">
        <div className="flex items-center gap-12">
          {/* VibeCheck Logo - Now clickable to return to landing */}
          <button
            onClick={() => setCurrentView('landing')}
            className="flex items-center gap-2 text-xl font-bold tracking-tighter hover:opacity-80 transition-opacity"
          >
            <Shield className="w-6 h-6 text-white" />
            <span className="hidden sm:inline-block">VibeCheck</span>
          </button>
          <div className="hidden md:flex items-center gap-8 text-sm font-medium text-gray-300">
            <button
              onClick={() => setCurrentView('dashboard')}
              className={`hover:text-white transition-colors ${currentView === 'dashboard' ? 'text-white' : ''}`}
            >
              Dashboard
            </button>
            <button
              onClick={() => setCurrentView('pipeline')}
              className={`hover:text-white transition-colors flex items-center gap-1 ${currentView === 'pipeline' ? 'text-white' : ''}`}
            >
              <GitBranch className="w-4 h-4" />
              Pipeline
            </button>
            <button
              onClick={() => setCurrentView('chat')}
              className={`hover:text-white transition-colors flex items-center gap-1 ${currentView === 'chat' ? 'text-white' : ''}`}
            >
              <MessageSquare className="w-4 h-4" />
              Team Chat
            </button>
            <button
              onClick={() => setCurrentView('swarm')}
              className={`hover:text-white transition-colors flex items-center gap-1 ${currentView === 'swarm' ? 'text-white' : ''}`}
            >
              <Network className="w-4 h-4" />
              Swarm
            </button>
            <button
              onClick={() => setCurrentView('landing')}
              className={`hover:text-white transition-colors ${currentView === 'landing' ? 'text-white' : ''}`}
            >
              About
            </button>
          </div>
        </div>
        <div className="flex items-center gap-6 text-sm font-medium">
          <a href="#" className="hidden md:flex items-center gap-2 text-gray-300 hover:text-white transition-colors">
            <Github className="w-4 h-4" />
            GitHub
          </a>
          <button
            onClick={() => setCurrentView('pipeline')}
            className="px-4 py-2 bg-white text-black rounded-md hover:bg-gray-200 transition-colors font-medium"
          >
            Start Scanning
          </button>
        </div>
      </nav>

      {/* Main Content Area */}
      {renderView()}
    </div>
  );
}
