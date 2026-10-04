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
        <GlobalLoadingOverlay />
        <ErrorBoundary>
          <ViewSwitcher />
        </ErrorBoundary>
      </div>
    </AppProvider>
  );
}
