import React from 'react';
export function VerdictSplitBar({ ai = 0, mixed = 0, human = 0, height = 6 }) {
  const t = ai + mixed + human || 1;
  const seg = (n, v) => <span key={v} style={{ background: 'var(--verdict-' + v + ')', width: (100 * n / t) + '%' }} />;
  return <div style={{ display: 'flex', height, borderRadius: height / 2, overflow: 'hidden' }}>{seg(ai, 'ai')}{seg(mixed, 'mixed')}{seg(human, 'human')}</div>;
}