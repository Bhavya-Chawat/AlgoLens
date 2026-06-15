import React from 'react';
import { AppProvider, useApp } from './context/AppContext';
import EditorView from './views/EditorView';
import VisualizerView from './views/VisualizerView';
import ErrorBoundary from './components/ErrorBoundary';
import LeetCodeModal from './components/LeetCodeModal';

// ============================================================
// VIEW SWITCHER — crossfade transition between views
// Both views are mounted; we fade between them so state
// is always preserved and there's no remount jank.
// ============================================================
function ViewSwitcher() {
  const { state } = useApp();
  const isEditor = state.view === 'editor';

  const baseStyle = {
    position: 'absolute',
    inset: 0,
    transition: 'opacity 280ms ease, transform 280ms ease',
  };

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%' }}>
      {/* Editor View */}
      <div style={{
        ...baseStyle,
        opacity: isEditor ? 1 : 0,
        transform: isEditor ? 'scale(1)' : 'scale(0.99)',
        pointerEvents: isEditor ? 'auto' : 'none',
        zIndex: isEditor ? 1 : 0,
      }}>
        <EditorView />
      </div>

      {/* Visualizer View */}
      <div style={{
        ...baseStyle,
        opacity: isEditor ? 0 : 1,
        transform: isEditor ? 'scale(1.005)' : 'scale(1)',
        pointerEvents: isEditor ? 'none' : 'auto',
        zIndex: isEditor ? 0 : 1,
      }}>
        <VisualizerView />
      </div>
      
      {/* Modals */}
      <LeetCodeModal />
    </div>
  );
}

// ============================================================
// INITIAL LOADER (Motion Graphic Splash)
// ============================================================
function InitialLoader() {
  const { traceEngine } = useApp();
  const [show, setShow] = React.useState(true);

  React.useEffect(() => {
    if (traceEngine.isReady) {
      const t = setTimeout(() => setShow(false), 600);
      return () => clearTimeout(t);
    }
  }, [traceEngine.isReady]);

  if (!show) return null;

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 1000,
      background: 'var(--bg-page)',
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      opacity: traceEngine.isReady ? 0 : 1,
      transition: 'opacity 500ms ease-in-out, transform 500ms ease-in-out',
      transform: traceEngine.isReady ? 'scale(1.05)' : 'scale(1)',
      pointerEvents: traceEngine.isReady ? 'none' : 'auto',
      overflow: 'hidden'
    }}>
      {/* Background ambient glow */}
      <div style={{
        position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)',
        width: '60vmin', height: '60vmin',
        background: 'radial-gradient(circle, rgba(143,175,157,0.15) 0%, transparent 70%)',
        zIndex: 0
      }} />

      <div className="animate-fade-in-up" style={{
        position: 'relative', zIndex: 1,
        display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 40
      }}>
        
        {/* Motion Graphic Container - Graph Data Structure */}
        <div style={{ position: 'relative', width: 120, height: 120 }}>
          {/* Edges */}
          <svg style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', zIndex: 0 }}>
            <line x1="50%" y1="15%" x2="20%" y2="50%" stroke="var(--accent-sage)" strokeWidth="2" className="animate-draw-line" />
            <line x1="50%" y1="15%" x2="80%" y2="50%" stroke="var(--accent-terracotta)" strokeWidth="2" className="animate-draw-line" style={{ animationDelay: '0.5s' }} />
            <line x1="20%" y1="50%" x2="50%" y2="85%" stroke="var(--accent-amber)" strokeWidth="2" className="animate-draw-line" style={{ animationDelay: '1s' }} />
            <line x1="80%" y1="50%" x2="50%" y2="85%" stroke="var(--accent-sage)" strokeWidth="2" className="animate-draw-line" style={{ animationDelay: '1.5s' }} />
            <line x1="20%" y1="50%" x2="80%" y2="50%" stroke="var(--border)" strokeWidth="1" strokeDasharray="3,3" />
          </svg>

          {/* Nodes */}
          <div style={{ position: 'absolute', top: '10%', left: '50%', transform: 'translateX(-50%)', width: 14, height: 14, background: 'var(--accent-sage)', borderRadius: '4px', zIndex: 1, boxShadow: '0 0 15px var(--accent-sage)', animation: 'pulse-glow 2s infinite' }} />
          <div style={{ position: 'absolute', top: '45%', left: '15%', width: 12, height: 12, background: 'var(--accent-terracotta)', borderRadius: '50%', zIndex: 1, boxShadow: '0 0 10px var(--accent-terracotta)', animation: 'pulse-glow 2s infinite 0.5s' }} />
          <div style={{ position: 'absolute', top: '45%', right: '15%', width: 12, height: 12, background: 'var(--accent-amber)', borderRadius: '50%', zIndex: 1, boxShadow: '0 0 10px var(--accent-amber)', animation: 'pulse-glow 2s infinite 1.5s' }} />
          <div style={{ position: 'absolute', bottom: '10%', left: '50%', transform: 'translateX(-50%)', width: 14, height: 14, background: 'var(--bg-card)', border: '2px solid var(--accent-sage)', borderRadius: '2px', zIndex: 1, animation: 'pulse-glow 2s infinite 1s' }} />
        </div>
        
        {/* Text & Loading Bar */}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16 }}>
          <div style={{
            fontSize: 28, fontWeight: 800, color: 'var(--text-primary)',
            letterSpacing: '-0.04em', fontFamily: 'var(--font-sans)',
            textShadow: '0 4px 12px rgba(0,0,0,0.05)'
          }}>AlgoLens</div>
          
          <div style={{
            width: 160, height: 4, background: 'var(--border)',
            borderRadius: 4, overflow: 'hidden', position: 'relative',
          }}>
            <div style={{
              position: 'absolute', top: 0, bottom: 0, left: 0, width: '40%',
              background: 'linear-gradient(90deg, var(--accent-sage), var(--accent-amber))',
              animation: traceEngine.isReady ? 'none' : 'sweep 1.2s ease-in-out infinite',
              borderRadius: 4
            }} />
          </div>
          
          <div style={{
            fontSize: 12, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)',
            textTransform: 'uppercase', letterSpacing: '0.1em', fontWeight: 600,
            animation: 'float-node 3s ease-in-out infinite'
          }}>
            {traceEngine.isReady ? 'Ready' : (traceEngine.engineMessage || 'Initializing Python Runtime')}
          </div>
        </div>
      </div>
      
      <style>{`
        @keyframes sweep {
          0% { transform: translateX(-100%); }
          100% { transform: translateX(300%); }
        }
        @keyframes pulse-glow {
          0% { transform: scale(1); opacity: 0.8; }
          50% { transform: scale(1.3); opacity: 1; }
          100% { transform: scale(1); opacity: 0.8; }
        }
        .animate-draw-line {
          stroke-dasharray: 100;
          animation: draw-line 2s infinite;
        }
        @keyframes draw-line {
          0% { stroke-dashoffset: 100; opacity: 0; }
          50% { stroke-dashoffset: 0; opacity: 1; }
          100% { stroke-dashoffset: -100; opacity: 0; }
        }
      `}</style>
    </div>
  );
}

// ============================================================
// GLOBAL LOADING OVERLAY
// ============================================================
function GlobalLoadingOverlay() {
  const { state } = useApp();
  if (!state.globalLoading) return null;

  return (
    <div className="animate-fade-in" style={{
      position: 'absolute', inset: 0, zIndex: 9999,
      background: 'rgba(10, 10, 12, 0.4)', backdropFilter: 'blur(8px)', WebkitBackdropFilter: 'blur(8px)',
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center'
    }}>
      <div style={{
        background: 'var(--bg-card)', padding: '24px 32px', borderRadius: 16,
        border: '1px solid var(--border)', boxShadow: '0 24px 60px rgba(0,0,0,0.4)',
        display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16
      }}>
        <div style={{
            width: 32, height: 32, borderRadius: '50%',
            border: '3px solid var(--border)',
            borderTopColor: 'var(--accent-sage)',
            animation: 'spin 800ms linear infinite',
        }} />
        <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-secondary)', letterSpacing: '0.02em' }}>
          {state.globalLoadingText || 'Loading...'}
        </span>
      </div>
    </div>
  );
}

// ============================================================
// APP ROOT
// ============================================================
export default function App() {
  return (
    <AppProvider>
      <div style={{ width: '100vw', height: '100vh', overflow: 'hidden', position: 'relative' }}>
        <InitialLoader />
        <GlobalLoadingOverlay />
        <ErrorBoundary>
          <ViewSwitcher />
        </ErrorBoundary>
      </div>
    </AppProvider>
  );
}
