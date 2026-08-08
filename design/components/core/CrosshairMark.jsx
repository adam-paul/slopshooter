import React from 'react';
export function CrosshairMark({ size = 18, color = 'var(--verdict-ai)' }) {
  const arm = Math.round(size * 0.28);
  return (
    <span style={{ position: 'relative', width: size, height: size, border: '2px solid ' + color, borderRadius: '50%', display: 'inline-block', flex: 'none' }}>
      <span style={{ position: 'absolute', left: '50%', top: -arm, bottom: -arm, width: 2, marginLeft: -1, background: color }} />
      <span style={{ position: 'absolute', top: '50%', left: -arm, right: -arm, height: 2, marginTop: -1, background: color }} />
    </span>
  );
}