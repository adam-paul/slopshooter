import React from 'react';
const C = { ai: 'var(--verdict-ai)', mixed: 'var(--verdict-mixed)', human: 'var(--verdict-human)' };
const L = { ai: 'AI', mixed: 'Mixed', human: 'Human' };
export function VerdictBadge({ verdict = 'ai' }) {
  const c = C[verdict] || C.ai;
  return <span style={{ fontFamily: 'var(--font-mono)', minWidth: '4.2rem', textAlign: 'center', padding: '0.05rem 0.4rem', borderRadius: 3, fontSize: '0.68rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', border: '1px solid ' + c, color: c, display: 'inline-block', boxSizing: 'border-box' }}>{L[verdict] || verdict}</span>;
}