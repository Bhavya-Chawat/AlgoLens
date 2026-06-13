import React from 'react';

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null, errorInfo: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true };
  }

  componentDidCatch(error, errorInfo) {
    this.setState({ error, errorInfo });
    console.error("AlgoLens ErrorBoundary caught an error:", error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{
          padding: '40px',
          background: 'var(--bg-page, #0A0A0A)',
          color: 'var(--text-primary, #E0E0E0)',
          height: '100vh',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          fontFamily: 'var(--font-sans, sans-serif)'
        }}>
          <div style={{
            background: 'var(--bg-card, #141414)',
            border: '1px solid #C05540',
            borderRadius: '12px',
            padding: '30px',
            maxWidth: '600px',
            width: '100%',
            boxShadow: '0 8px 32px rgba(0,0,0,0.4)'
          }}>
            <h2 style={{ color: '#C05540', marginTop: 0, display: 'flex', alignItems: 'center', gap: '10px' }}>
              <span style={{ fontSize: '24px' }}>⚠</span> Something went wrong.
            </h2>
            <p style={{ color: 'var(--text-secondary, #A0A0A0)', marginBottom: '20px' }}>
              AlgoLens encountered an unexpected error while rendering this view. This usually happens if the execution trace is malformed.
            </p>
            
            <div style={{
              background: '#1a1010',
              padding: '16px',
              borderRadius: '8px',
              overflowX: 'auto',
              border: '1px solid #4a2020',
              marginBottom: '20px'
            }}>
              <code style={{ color: '#ff8a8a', fontSize: '12px', whiteSpace: 'pre-wrap' }}>
                {this.state.error && this.state.error.toString()}
                <br /><br />
                {this.state.errorInfo && this.state.errorInfo.componentStack}
              </code>
            </div>

            <button 
              onClick={() => window.location.reload()}
              style={{
                background: '#C05540',
                color: 'white',
                border: 'none',
                padding: '10px 20px',
                borderRadius: '6px',
                cursor: 'pointer',
                fontWeight: '600'
              }}
            >
              Reload Application
            </button>
          </div>
        </div>
      );
    }

    return this.props.children; 
  }
}

export default ErrorBoundary;
