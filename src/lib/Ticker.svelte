<script lang="ts">
	import { verdictMeta } from '$lib/format';

	interface TickerItem {
		verdict: string;
		tagger: string;
		target: string | null;
		ago: string;
	}

	let { items }: { items: TickerItem[] } = $props();

	// Tile the set until the band is comfortably wider than the viewport, then
	// double it so the -50% translate loops seamlessly. Duration scales with the
	// tiled length so scroll speed holds the design's cadence (~6 items / 40s)
	// regardless of how many distinct items we were given.
	const MIN_TILE = 12;
	const base = $derived(
		items.length === 0
			? []
			: Array.from({ length: Math.ceil(MIN_TILE / items.length) }, () => items).flat()
	);
	const loop = $derived([...base, ...base]);
	const duration = $derived(base.length * (40 / 6));
</script>

{#if items.length > 0}
	<div class="ticker">
		<div class="track" style="animation-duration:{duration}s">
			{#each loop as t, i (i)}
				<!-- Announce each distinct verdict once; the tiled/doubled copies are decor. -->
				<span class="item" aria-hidden={i >= items.length ? true : undefined}>
					<span class="verdict {verdictMeta(t.verdict).className}">▲ {verdictMeta(t.verdict).label}</span>
					<span class="dim">@{t.tagger} → {t.target ? `@${t.target}` : 'a post'} · {t.ago}</span>
				</span>
			{/each}
		</div>
	</div>
{/if}

<style>
	.ticker {
		/* The hero above owns the top hairline (always rendered); we only add the bottom. */
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
