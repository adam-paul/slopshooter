import React from 'react';
export function SectionTitle({ children }) {
  return <h2 style={{ fontSize: '1.6rem', fontWeight: 900, fontStyle: 'italic', textTransform: 'uppercase', margin: 0, fontFamily: 'var(--font-display)' }}>{children}</h2>;
}