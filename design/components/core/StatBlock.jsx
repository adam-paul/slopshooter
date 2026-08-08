import React from 'react';
export function StatBlock({ value, label, accent = 'var(--verdict-ai)' }) {
  return (
    <div style={{ fontFamily: 'var(--font-mono)' }}>
      <span style={{ display: 'block', fontSize: '2.4rem', fontWeight: 600, fontVariantNumeric: 'tabular-nums', borderTop: '3px solid ' + accent, paddingTop: '0.4rem' }}>{value}</span>
      <span style={{ color: 'var(--fg-muted)', fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.08em' }}>{label}</span>
    </div>
  );
}