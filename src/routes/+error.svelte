<script lang="ts">
	import { page } from '$app/state';
</script>

<svelte:head>
	<title>{page.status} — Slopshooter</title>
</svelte:head>

<section class="wrap">
	<div class="container">
		<p class="eyebrow mono">{page.status}</p>
		<h1>{page.status === 404 ? 'Nothing here' : 'Something misfired'}</h1>
		{#if page.error?.message}
			<p class="sub mono">{page.error.message}</p>
		{/if}
		<p class="cta mono"><a href="/">← leaderboard</a></p>
	</div>
</section>

<style>
	.wrap {
		padding: 4.5rem 2rem;
	}
	.eyebrow {
		font-size: 0.78rem;
		color: var(--fg-muted);
		letter-spacing: 0.14em;
		text-transform: uppercase;
		margin: 0 0 1rem;
	}
	h1 {
		font-size: clamp(2rem, 5vw, 3.2rem);
		font-weight: 900;
		font-style: italic;
		text-transform: uppercase;
		line-height: 0.95;
		margin: 0;
	}
	.sub {
		max-width: 34rem;
		color: var(--fg-muted);
		font-size: 0.8rem;
		margin: 1.25rem 0 2rem;
	}
	.cta {
		font-size: 0.78rem;
	}
</style>
