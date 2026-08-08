import type { VerdictLabel } from '../../shared/verdicts';

export function timeAgo(unixSeconds: number): string {
	const s = Math.max(0, Math.floor(Date.now() / 1000) - unixSeconds);
	if (s < 60) return 'just now';
	const m = Math.floor(s / 60);
	if (m < 60) return `${m}m ago`;
	const h = Math.floor(m / 60);
	if (h < 24) return `${h}h ago`;
	const d = Math.floor(h / 24);
	if (d < 30) return `${d}d ago`;
	const mo = Math.floor(d / 30);
	if (mo < 12) return `${mo}mo ago`;
	return `${Math.floor(mo / 12)}y ago`;
}

const VERDICT_META: Record<VerdictLabel, { label: string; className: string }> = {
	ai: { label: 'AI', className: 'v-ai' },
	mix: { label: 'Mixed', className: 'v-mix' },
	human: { label: 'Human', className: 'v-human' }
};

/** Owns the unknown-verdict fallback so templates never re-implement it. */
export function verdictMeta(verdict: string): { label: string; className: string } {
	return (VERDICT_META as Record<string, { label: string; className: string }>)[verdict] ?? {
		label: verdict,
		className: ''
	};
}

/** The site's one scoring definition: AI = 1, Mixed = ½, Human = 0, averaged 0–1. */
export function scoreOf(ai: number, mix: number, checks: number): number {
	return checks > 0 ? (ai + 0.5 * mix) / checks : 0;
}

/** Design rule: scores drop the leading zero — ".97", "1.00". */
export function formatScore(score: number): string {
	return score.toFixed(2).replace(/^0\./, '.');
}

/** % of checks that came back fully AI — used for site-wide stats, not tagger scores. */
export function pctAi(ai: number, checks: number): number {
	return checks > 0 ? Math.round((100 * ai) / checks) : 0;
}

export function historyUrl(uuid: string): string {
	return `https://www.pangram.com/history/${uuid}`;
}

export function tweetUrl(id: string): string {
	return `https://x.com/i/status/${id}`;
}

export function profileUrl(handle: string): string {
	return `https://x.com/${handle}`;
}
