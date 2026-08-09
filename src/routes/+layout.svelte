<script lang="ts">
	import CrosshairMark from '$lib/CrosshairMark.svelte';

	let { children } = $props();
</script>

<svelte:head>
	<!-- Served from static/ as a stable URL: Vite would otherwise inline it as a
	     data: URI, and the SVG must stay comment-free (XML forbids "--" in comments —
	     an embedded comment with "--verdict-ai" once killed the icon site-wide). -->
	<link rel="icon" type="image/svg+xml" href="/favicon.svg" />
</svelte:head>

<div class="shell">
	<header>
		<a href="/" class="brand">
			<CrosshairMark size={18} />
			<span class="wordmark">Slopshooter</span>
		</a>
		<span class="status mono">
			<span class="livedot" aria-hidden="true"></span>tracking <a href="https://x.com/pangram" rel="noopener">@pangram</a> · live-ish
		</span>
	</header>

	<main>
		{@render children?.()}
	</main>

	<footer>
		<div class="container">
			<p>
				Unofficial tracker of the verdicts <a href="https://x.com/pangram" rel="noopener">@pangram</a>
				posts on X. Not affiliated with Pangram Labs.
			</p>
		</div>
	</footer>
</div>

<style>
	:global(:root) {
		/* ground */
		--bg-0: #0e1116;
		--bg-1: #0a0d12;
		--bg-hover: #12161d;
		--line: #21262d;
		/* ink */
		--fg-1: #e6e8eb;
		--fg-muted: #8b949e;
		/* verdict tricolor — the brand */
		--verdict-ai: #f85149;
		--verdict-mixed: #d29922;
		--verdict-human: #3fb950;
		/* links */
		--accent-link: #58a6ff;
		/* type */
		--font-display: 'Archivo', ui-sans-serif, system-ui, sans-serif;
		--font-mono: 'IBM Plex Mono', ui-monospace, monospace;
	}
	:global(body) {
		margin: 0;
		background: var(--bg-0);
		color: var(--fg-1);
		font-family: var(--font-display);
		line-height: 1.5;
	}
	:global(a) {
		color: var(--accent-link);
		text-decoration: none;
	}
	:global(a:hover) {
		color: var(--fg-1);
	}
	/* shared vocabulary */
	:global(.mono) {
		font-family: var(--font-mono);
	}
	:global(.v-ai) {
		color: var(--verdict-ai);
	}
	:global(.v-mix) {
		color: var(--verdict-mixed);
	}
	:global(.v-human) {
		color: var(--verdict-human);
	}
	:global(.dim) {
		color: var(--fg-muted);
	}
	:global(.container) {
		max-width: 68rem;
		margin: 0 auto;
	}
	:global(.section-title) {
		font-size: 1.6rem;
		font-weight: 900;
		font-style: italic;
		text-transform: uppercase;
		margin: 0;
		font-family: var(--font-display);
	}

	.shell {
		min-height: 100vh;
		display: flex;
		flex-direction: column;
	}
	header {
		display: flex;
		align-items: center;
		gap: 0.75rem;
		padding: 0.9rem 2rem;
		border-bottom: 1px solid var(--line);
	}
	.brand {
		display: inline-flex;
		align-items: center;
		gap: 0.75rem;
		color: var(--fg-1);
	}
	.wordmark {
		font-weight: 900;
		font-style: italic;
		font-size: 1.05rem;
		letter-spacing: 0.02em;
		text-transform: uppercase;
	}
	.status {
		font-size: 0.72rem;
		color: var(--fg-muted);
		margin-left: auto;
		display: flex;
		align-items: center;
		gap: 0.45rem;
	}
	.livedot {
		width: 7px;
		height: 7px;
		border-radius: 50%;
		background: var(--verdict-human);
		display: inline-block;
	}
	main {
		flex: 1;
	}
	footer {
		margin-top: auto;
		padding: 1.25rem 2rem 2rem;
		border-top: 1px solid var(--line);
	}
	footer .container {
		color: var(--fg-muted);
		font-size: 0.78rem;
	}
	footer p {
		margin: 0 0 0.4rem;
	}
	footer p:last-child {
		margin: 0;
	}
</style>
