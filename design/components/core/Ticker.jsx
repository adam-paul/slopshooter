import React from 'react';
const C = { ai: 'var(--verdict-ai)', mixed: 'var(--verdict-mixed)', human: 'var(--verdict-human)' };
const L = { ai: 'AI', mixed: 'Mixed', human: 'Human' };
export function Ticker({ items = [], duration = 40 }) {
  const loop = items.concat(items);
  return (
    <div style={{ borderTop: '1px solid var(--line)', borderBottom: '1px solid var(--line)', overflow: 'hidden', background: 'var(--bg-1)' }}>
      <style>{'@keyframes ssTicker{from{transform:translateX(0)}to{transform:translateX(-50%)}}'}</style>
      <div style={{ display: 'inline-flex', gap: '2.5rem', padding: '0.5rem 0', whiteSpace: 'nowrap', animation: 'ssTicker ' + duration + 's linear infinite', fontFamily: 'var(--font-mono)', fontSize: '0.75rem' }}>
        {loop.map((t, i) => (
          <span key={i} style={{ display: 'inline-flex', gap: '0.5rem', alignItems: 'center' }}>
            <span style={{ color: C[t.verdict], fontWeight: 600 }}>▲ {L[t.verdict]}</span>
            <span style={{ color: 'var(--fg-muted)' }}>@{t.tagger} → @{t.target} · {t.ago}</span>
          </span>
        ))}
      </div>
    </div>
  );
}