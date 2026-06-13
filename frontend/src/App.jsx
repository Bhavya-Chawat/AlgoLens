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
        
        {/* Motion Graphic Container */}
        <div style={{ position: 'relative', width: 120, height: 120, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          
          {/* Outer Orbiting Ring */}
          <div style={{
            position: 'absolute', width: 120, height: 120,
            border: '1px dashed rgba(143,175,157,0.4)', borderRadius: '50%',
            animation: 'orbit-spin 8s linear infinite'
          }}>
            <div style={{ position: 'absolute', top: -4, left: '50%', transform: 'translateX(-50%)', width: 8, height: 8, background: 'var(--accent-terracotta)', borderRadius: '50%', boxShadow: '0 0 8px var(--accent-terracotta)' }} />
            <div style={{ position: 'absolute', bottom: -4, left: '50%', transform: 'translateX(-50%)', width: 6, height: 6, background: 'var(--accent-sage)', borderRadius: '50%' }} />
          </div>

          {/* Inner Orbiting Ring (Counter-Rotate) */}
          <div style={{
            position: 'absolute', width: 70, height: 70,
            border: '1px solid rgba(143,175,157,0.2)', borderRadius: '50%',
            animation: 'orbit-spin 4s linear infinite reverse'
          }}>
            <div style={{ position: 'absolute', top: '50%', right: -4, transform: 'translateY(-50%)', width: 8, height: 8, background: 'var(--accent-amber)', borderRadius: '50%', boxShadow: '0 0 8px var(--accent-amber)' }} />
          </div>

          {/* Central Lens / Core */}
          <div style={{
            width: 32, height: 32,
            background: 'var(--accent-sage)',
            borderRadius: '50%',
            animation: 'pulse-lens 2s ease-in-out infinite',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            boxShadow: '0 0 20px rgba(143,175,157,0.5)',
            position: 'relative'
          }}>
             {/* Inner eye / reflection */}
             <div style={{ position: 'absolute', top: 6, right: 8, width: 6, height: 4, background: 'rgba(255,255,255,0.8)', borderRadius: '50%', transform: 'rotate(-45deg)' }} />
          </div>

        </div>
        
        {/* Text & Loading Bar */}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16 }}>
          <div style={{
            fontSize: 24, fontWeight: 700, color: 'var(--text-primary)',
            letterSpacing: '-0.03em', fontFamily: 'var(--font-sans)',
            textShadow: '0 4px 12px rgba(0,0,0,0.05)'
          }}>AlgoLens</div>
          
          <div style={{
            width: 160, height: 3, background: 'var(--border)',
            borderRadius: 4, overflow: 'hidden', position: 'relative',
            boxShadow: 'inset 0 1px 2px rgba(0,0,0,0.05)'
          }}>
            <div style={{
              position: 'absolute', top: 0, bottom: 0, left: 0, width: '40%',
              background: 'linear-gradient(90deg, var(--accent-sage), var(--accent-sage-hover))',
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
