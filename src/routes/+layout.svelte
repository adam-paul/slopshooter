<script lang="ts">
	import favicon from '$lib/assets/favicon.svg';

	let { children } = $props();
</script>

<svelte:head>
	<link rel="icon" href={favicon} />
</svelte:head>

<div class="shell">
	<header>
		<a href="/" class="logo">🎯 Slopshooter</a>
		<span class="tagline">who actually spots the slop?</span>
	</header>

	<main>
		{@render children?.()}
	</main>

	<footer>
		<p>
			Unofficial tracker of the verdicts <a href="https://x.com/pangram" rel="noopener">@pangram</a>
			posts on X. Not affiliated with Pangram Labs.
		</p>
		<p>
			A "hit" means Pangram judged the tagged text fully AI-generated. Pangram's verdicts are a
			detector's opinion, not ground truth — this site measures agreement with Pangram, nothing
			more.
		</p>
	</footer>
</div>

<style>
	:global(:root) {
		--bg: #0e1116;
		--fg: #e6e8eb;
		--dim: #8b949e;
		--line: #21262d;
		--accent: #58a6ff;
		--accent-dim: rgba(88, 166, 255, 0.25);
		--ai: #f85149;
		--mix: #d29922;
		--human: #3fb950;
	}
	:global(body) {
		margin: 0;
		background: var(--bg);
		color: var(--fg);
		font-family:
			ui-sans-serif,
			system-ui,
			-apple-system,
			sans-serif;
		line-height: 1.5;
	}
	:global(a) {
		color: var(--accent);
		text-decoration: none;
	}
	:global(a:hover) {
		text-decoration: underline;
	}
	.shell {
		max-width: 60rem;
		margin: 0 auto;
		padding: 1.5rem 1rem 3rem;
	}
	header {
		display: flex;
		align-items: baseline;
		gap: 0.75rem;
		flex-wrap: wrap;
		padding-bottom: 1rem;
		border-bottom: 1px solid var(--line);
	}
	.logo {
		font-weight: 700;
		font-size: 1.15rem;
		color: var(--fg);
	}
	.tagline {
		color: var(--dim);
		font-size: 0.85rem;
	}
	footer {
		margin-top: 3rem;
		padding-top: 1rem;
		border-top: 1px solid var(--line);
		color: var(--dim);
		font-size: 0.78rem;
	}
</style>
