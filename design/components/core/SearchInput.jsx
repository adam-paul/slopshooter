import React, { useState } from 'react';
export function SearchInput({ placeholder = 'find a slopshooter', value, onChange, width = '11rem' }) {
  const [focus, setFocus] = useState(false);
  return <input type="text" placeholder={placeholder} value={value} onChange={onChange} onFocus={() => setFocus(true)} onBlur={() => setFocus(false)} style={{ background: 'transparent', border: '1px solid ' + (focus ? 'var(--accent-link)' : 'var(--line)'), borderRadius: 3, color: 'var(--fg-1)', fontFamily: 'var(--font-mono)', fontSize: '0.78rem', padding: '0.38rem 0.7rem', width, outline: 'none' }} />;
}