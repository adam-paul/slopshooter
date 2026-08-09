<script lang="ts">
	import VerdictSplitBar from '$lib/VerdictSplitBar.svelte';
	import { formatScore, timeAgo } from '$lib/format';

	let {
		rank,
		handle,
		score,
		checks,
		ai,
		mix,
		human,
		lastAt
	}: {
		rank: 1 | 2 | 3;
		handle: string;
		score: number;
		checks: number;
		ai: number;
		mix: number;
		human: number;
		lastAt: number;
	} = $props();

	// Only NO.1 wears the brand red (crosshair / DEAD-EYE / card border all match);
	// 2 and 3 are neutral — rank colors must not borrow the verdict tricolor.
	const RANK = [
		{ label: 'NO.1 — DEAD-EYE', color: 'var(--verdict-ai)', score: 'var(--verdict-ai)', border: 'var(--verdict-ai)' },
		{ label: 'NO.2', color: 'var(--fg-muted)', score: 'var(--fg-1)', border: 'var(--line)' },
		{ label: 'NO.3', color: 'var(--fg-muted)', score: 'var(--fg-1)', border: 'var(--line)' }
	];
	const r = $derived(RANK[Math.min(Math.max(rank, 1), 3) - 1]);
</script>

<div class="card" style="border-color:{r.border}">
	<span class="rank mono" style="color:{r.color}">{r.label}</span>
	<div class="row">
		<a href="/u/{handle}" class="handle">@{handle}</a>
		<span class="score mono" style="color:{r.score}">{formatScore(score)}</span>
	</div>
	<VerdictSplitBar {ai} {mix} {human} />
	<span class="meta mono">{checks} tags · {ai} AI / {mix} mixed / {human} human · {timeAgo(lastAt)}</span>
</div>

<style>
	.card {
		border: 1px solid var(--line);
		border-radius: 6px;
		padding: 1.25rem 1.25rem 1rem;
		background: var(--bg-1);
	}
	.rank {
		font-size: 0.72rem;
		letter-spacing: 0.1em;
	}
	.row {
		display: flex;
		align-items: baseline;
		justify-content: space-between;
		gap: 0.75rem;
		margin: 0.3rem 0 0.8rem;
	}
	.handle {
		font-weight: 700;
		font-size: 1.1rem;
		color: var(--fg-1);
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.score {
		font-size: 1.7rem;
		font-weight: 600;
		font-variant-numeric: tabular-nums;
	}
	.meta {
		font-size: 0.72rem;
		color: var(--fg-muted);
		display: block;
		margin-top: 0.6rem;
	}
</style>
