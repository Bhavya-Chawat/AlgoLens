import React, { useState } from 'react';
import VariablesTab from './VariablesTab';
import CallStackTab from './CallStackTab';
import MemoryTab from './MemoryTab';

export default function InspectorPanel() {
  const [activeTab, setActiveTab] = useState('Variables');

  const tabs = ['Variables', 'Call Stack', 'Memory'];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* Tab Header */}
      <div style={{
        display: 'flex', borderBottom: '1px solid var(--border)',
        background: 'var(--bg-canvas)', flexShrink: 0,
      }}>
        {tabs.map(t => (
          <button
            key={t}
            onClick={() => setActiveTab(t)}
            style={{
              flex: 1, padding: '10px 0',
              background: 'transparent', border: 'none', cursor: 'pointer',
              fontSize: 11, fontFamily: 'var(--font-sans)', fontWeight: 600,
              color: activeTab === t ? 'var(--text-primary)' : 'var(--text-muted)',
              borderBottom: activeTab === t ? '2px solid var(--accent-sage)' : '2px solid transparent',
              transition: 'all 150ms ease', textTransform: 'uppercase', letterSpacing: '0.05em'
            }}
          >
            {t}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      <div style={{ flex: 1, overflow: 'hidden' }}>
        {activeTab === 'Variables' && <VariablesTab />}
        {activeTab === 'Call Stack' && <CallStackTab />}
        {activeTab === 'Memory' && <MemoryTab />}
      </div>
    </div>
  );
}
