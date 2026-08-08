import React from 'react';
export function RangeToggle({ options = ['week', 'all-time'], value, onChange }) {
  return (
    <div style={{ display: 'flex', border: '1px solid var(--line)', borderRadius: 3, overflow: 'hidden', fontFamily: 'var(--font-mono)' }}>
      {options.map((o, i) => {
        const on = o === value;
        return <button key={o} onClick={() => onChange && onChange(o)} style={{ background: on ? 'var(--fg-1)' : 'transparent', color: on ? 'var(--bg-0)' : 'var(--fg-muted)', border: 'none', borderLeft: i ? '1px solid var(--line)' : 'none', fontSize: '0.72rem', textTransform: 'uppercase', letterSpacing: '0.06em', padding: '0.42rem 0.8rem', cursor: 'pointer', fontFamily: 'inherit' }}>{o}</button>;
      })}
    </div>
  );
}