import React from 'react';

interface State { error: Error | null }

export default class ErrorBoundary extends React.Component<React.PropsWithChildren, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div style={{ padding: 40, color: '#e0e0e0', background: '#1a1a2e', height: '100vh', fontFamily: 'system-ui' }}>
        <h1>Etwas ist schiefgelaufen</h1>
        <pre style={{ marginTop: 16, padding: 16, background: '#252536', borderRadius: 6, overflow: 'auto', maxHeight: '40vh' }}>
          {this.state.error.message}
        </pre>
        <button
          onClick={() => { this.setState({ error: null }); }}
          style={{ marginTop: 24, padding: '10px 24px', background: '#4fc3f7', color: '#000', border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 16 }}
        >
          Erneut versuchen
        </button>
      </div>
    );
  }
}
