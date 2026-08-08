<script lang="ts">
	let {
		value,
		label,
		accent = 'var(--verdict-ai)'
	}: { value: string; label: string; accent?: string } = $props();
</script>

<div class="stat">
	<span class="num" style="border-top-color:{accent}">{value}</span>
	<span class="lbl">{label}</span>
</div>

<style>
	.stat {
		font-family: var(--font-mono);
	}
	.num {
		display: block;
		font-size: 2.4rem;
		font-weight: 600;
		font-variant-numeric: tabular-nums;
		border-top: 3px solid var(--verdict-ai);
		padding-top: 0.4rem;
	}
	.lbl {
		color: var(--fg-muted);
		font-size: 0.75rem;
		text-transform: uppercase;
		letter-spacing: 0.08em;
	}
</style>
