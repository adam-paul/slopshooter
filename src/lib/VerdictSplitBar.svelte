<script lang="ts">
	let {
		ai = 0,
		mix = 0,
		human = 0,
		height = 6
	}: { ai?: number; mix?: number; human?: number; height?: number } = $props();

	const total = $derived(ai + mix + human || 1);
</script>

<div class="bar" style="height:{height}px;border-radius:{height / 2}px" aria-hidden="true">
	<span style="background:var(--verdict-ai);width:{(100 * ai) / total}%"></span>
	<span style="background:var(--verdict-mixed);width:{(100 * mix) / total}%"></span>
	<span style="background:var(--verdict-human);width:{(100 * human) / total}%"></span>
</div>

<style>
	.bar {
		display: flex;
		overflow: hidden;
	}
</style>
