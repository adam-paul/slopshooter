import React from 'react';
import { VerdictSplitBar } from './VerdictSplitBar';
const th = (align) => ({ textAlign: align, color: 'var(--fg-muted)', fontWeight: 500, fontFamily: 'var(--font-mono)', fontSize: '0.68rem', textTransform: 'uppercase', letterSpacing: '0.08em', padding: '0.5rem 0.7rem', borderBottom: '1px solid var(--line)', whiteSpace: 'nowrap' });
const td = (extra) => Object.assign({ padding: '0.55rem 0.7rem', borderBottom: '1px solid var(--line)', whiteSpace: 'nowrap' }, extra);
export function LeaderboardTable({ rows = [] }) {
  return (
    <div style={{ overflowX: 'auto' }}>
      <style>{'.ss-lb tbody tr:hover{background:var(--bg-hover)}'}</style>
      <table className="ss-lb" style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.88rem' }}>
        <thead><tr><th style={th('right')}>#</th><th style={th('left')}>Tagger</th><th style={th('right')}>Tags</th><th style={Object.assign(th('left'), { width: '30%' })}>Verdict split</th><th style={th('right')}>Score</th><th style={th('right')}>Last tag</th></tr></thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.handle}>
              <td style={td({ textAlign: 'right', color: 'var(--fg-muted)', fontFamily: 'var(--font-mono)', fontVariantNumeric: 'tabular-nums' })}>{r.rank}</td>
              <td style={td({})}><a href="#" style={{ color: 'var(--fg-1)', fontWeight: 700 }}>@{r.handle}</a></td>
              <td style={td({ textAlign: 'right', fontFamily: 'var(--font-mono)', fontVariantNumeric: 'tabular-nums' })}>{r.checks}</td>
              <td style={td({ minWidth: 160, whiteSpace: 'normal' })}><VerdictSplitBar ai={r.ai} mixed={r.mixed} human={r.human} /></td>
              <td style={td({ textAlign: 'right', fontFamily: 'var(--font-mono)', fontWeight: 600, fontVariantNumeric: 'tabular-nums' })}>{r.score}</td>
              <td style={td({ textAlign: 'right', color: 'var(--fg-muted)', fontFamily: 'var(--font-mono)', fontSize: '0.78rem' })}>{r.lastAt}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}