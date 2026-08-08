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

export const VERDICT_META: Record<string, { label: string; className: string }> = {
	ai: { label: 'AI', className: 'v-ai' },
	mix: { label: 'Mixed', className: 'v-mix' },
	human: { label: 'Human', className: 'v-human' }
};

export function historyUrl(uuid: string | null): string | null {
	return uuid ? `https://www.pangram.com/history/${uuid}` : null;
}

export function tweetUrl(id: string): string {
	return `https://x.com/i/status/${id}`;
}
