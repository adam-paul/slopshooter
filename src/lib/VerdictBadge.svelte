<script lang="ts">
	import { verdictMeta } from '$lib/format';

	let { verdict }: { verdict: string } = $props();

	const meta = $derived(verdictMeta(verdict));
</script>

<span class="badge {meta.className}">{meta.label}</span>

<style>
	.badge {
		display: inline-block;
		min-width: 3.5rem;
		text-align: center;
		padding: 0.05rem 0.45rem;
		border-radius: 999px;
		font-size: 0.72rem;
		font-weight: 600;
		/* Color comes from the global .v-* class; the border just follows it. */
		border: 1px solid currentColor;
	}
	.badge:not([class*='v-']) {
		border-color: var(--line);
	}
</style>
