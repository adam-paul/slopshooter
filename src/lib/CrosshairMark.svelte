<script lang="ts">
	let { size = 18, color = 'var(--verdict-ai)' }: { size?: number; color?: string } = $props();

	const arm = $derived(Math.round(size * 0.28));
</script>

<span
	class="ring"
	style="width:{size}px;height:{size}px;border-color:{color}"
	aria-hidden="true"
>
	<span class="v" style="top:-{arm}px;bottom:-{arm}px;background:{color}"></span>
	<span class="h" style="left:-{arm}px;right:-{arm}px;background:{color}"></span>
</span>

<style>
	.ring {
		position: relative;
		border: 2px solid;
		border-radius: 50%;
		display: inline-block;
		flex: none;
	}
	.v {
		position: absolute;
		left: 50%;
		width: 2px;
		margin-left: -1px;
	}
	.h {
		position: absolute;
		top: 50%;
		height: 2px;
		margin-top: -1px;
	}
</style>
