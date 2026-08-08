<script lang="ts">
	import { verdictMeta } from '$lib/format';

	interface TickerItem {
		verdict: string;
		tagger: string;
		target: string | null;
		ago: string;
	}

	let { items, duration = 40 }: { items: TickerItem[]; duration?: number } = $props();

	// Content is duplicated so the -50% translate loops seamlessly.
	const loop = $derived([...items, ...items]);
</script>

{#if items.length > 0}
	<div class="ticker">
		<div class="track" style="animation-duration:{duration}s">
			{#each loop as t, i (i)}
				<span class="item">
					<span class="verdict {verdictMeta(t.verdict).className}">▲ {verdictMeta(t.verdict).label}</span>
					<span class="dim">@{t.tagger} → {t.target ? `@${t.target}` : 'a post'} · {t.ago}</span>
				</span>
			{/each}
		</div>
	</div>
{/if}

<style>
	.ticker {
		border-top: 1px solid var(--line);
		border-bottom: 1px solid var(--line);
		overflow: hidden;
		background: var(--bg-1);
	}
	.track {
		display: inline-flex;
		gap: 2.5rem;
		padding: 0.5rem 0;
		white-space: nowrap;
		animation: scroll linear infinite;
		font-family: var(--font-mono);
		font-size: 0.75rem;
	}
	.item {
		display: inline-flex;
		gap: 0.5rem;
		align-items: center;
	}
	.verdict {
		font-weight: 600;
	}
	@keyframes scroll {
		from {
			transform: translateX(0);
		}
		to {
			transform: translateX(-50%);
		}
	}
	@media (prefers-reduced-motion: reduce) {
		.track {
			animation: none;
		}
	}
</style>
