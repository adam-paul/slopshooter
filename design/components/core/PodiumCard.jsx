import React from 'react';
import { VerdictSplitBar } from './VerdictSplitBar';
const RANK = [
  { label: 'NO.1 — DEAD-EYE', color: 'var(--verdict-ai)', border: 'var(--verdict-ai)' },
  { label: 'NO.2', color: 'var(--verdict-mixed)', border: 'var(--line)' },
  { label: 'NO.3', color: 'var(--verdict-human)', border: 'var(--line)' }
];
export function PodiumCard({ rank = 1, handle, score, checks, ai, mixed, human, lastAt }) {
  const r = RANK[Math.min(Math.max(rank, 1), 3) - 1];
  return (
    <div style={{ border: '1px solid ' + r.border, borderRadius: 6, padding: '1.25rem 1.25rem 1rem', background: 'var(--bg-1)' }}>
      <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.72rem', color: r.color, letterSpacing: '0.1em' }}>{r.label}</span>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: '0.75rem', margin: '0.3rem 0 0.8rem' }}>
        <a href="#" style={{ fontWeight: 700, fontSize: '1.1rem', color: 'var(--fg-1)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>@{handle}</a>
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: '1.7rem', fontWeight: 600, fontVariantNumeric: 'tabular-nums', color: r.color }}>{score}</span>
      </div>
      <VerdictSplitBar ai={ai} mixed={mixed} human={human} />
      <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.72rem', color: 'var(--fg-muted)', display: 'block', marginTop: '0.6rem' }}>{checks} checks · {ai} AI / {mixed} mixed / {human} human · {lastAt}</span>
    </div>
  );
}