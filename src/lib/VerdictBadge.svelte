<script lang="ts">
	import { verdictMeta } from '$lib/format';

	let { verdict }: { verdict: string } = $props();

	const meta = $derived(verdictMeta(verdict));
</script>

<span class="badge mono {meta.className}">{meta.label}</span>

<style>
	.badge {
		display: inline-block;
		box-sizing: border-box;
		min-width: 4.2rem;
		text-align: center;
		padding: 0.05rem 0.4rem;
		border-radius: 3px;
		font-size: 0.68rem;
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.06em;
		flex: none;
		/* Color comes from the global .v-* class; the border just follows it. */
		border: 1px solid currentColor;
	}
	.badge:not([class*='v-']) {
		border-color: var(--line);
	}
</style>
