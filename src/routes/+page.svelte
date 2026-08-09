<script lang="ts">
	import { goto } from '$app/navigation';
	import PodiumCard from '$lib/PodiumCard.svelte';
	import StatBlock from '$lib/StatBlock.svelte';
	import Ticker from '$lib/Ticker.svelte';
	import VerdictBadge from '$lib/VerdictBadge.svelte';
	import VerdictSplitBar from '$lib/VerdictSplitBar.svelte';
	import { formatCount, formatScore, historyUrl, pctAi, profileUrl, timeAgo, tweetUrl } from '$lib/format';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	let search = $state('');

	const podium = $derived(data.leaderboard.slice(0, 3));
	const rest = $derived(data.leaderboard.slice(3));
	const tickerItems = $derived(
		data.recent
			.filter((v) => v.taggerHandle !== null)
			.slice(0, 12)
			.map((v) => ({
				verdict: v.verdict,
				tagger: v.taggerHandle as string,
				target: v.checkedAuthorHandle,
				ago: timeAgo(v.verdictAt)
			}))
	);
	const fresh = $derived(data.recent.slice(0, 6));

	function submitSearch(e: SubmitEvent) {
		e.preventDefault();
		const handle = search.trim().replace(/^@/, '');
		// X handle grammar — rejects junk that could only 404 or break the route.
		if (/^[A-Za-z0-9_]{1,15}$/.test(handle)) goto(`/u/${handle}`);
	}
</script>

<svelte:head>
	<title>Slopshooter — who is the top slop cop?</title>
	<meta
		name="description"
		content="Tag @pangram under twitter posts you think are AI. We keep score and compile a leaderboard that ranks our keenest slop detectives."
	/>
</svelte:head>

<section class="hero">
	<div class="reticle r1" aria-hidden="true"></div>
	<div class="reticle r2" aria-hidden="true"></div>
	<div class="container">
		<p class="eyebrow mono">The unofficial Pangram leaderboard</p>
		<h1>Who is the&nbsp;<br /><span class="v-ai">top slop COP</span>?</h1>
		<p class="sub">
			Tag @pangram under twitter posts you think are AI. We keep score and compile a leaderboard
			that ranks our keenest slop detectives.
		</p>
		<div class="statrow">
			<StatBlock
				value={formatCount(data.totals.checks)}
				label="slopvestigations"
				accent="var(--verdict-ai)"
			/>
			<StatBlock
				value="{pctAi(data.totals.ai, data.totals.checks)}%"
				label="came back AI"
				accent="var(--verdict-mixed)"
			/>
			<StatBlock
				value={formatCount(data.totals.taggers)}
				label="unique slopshooters"
				accent="var(--verdict-human)"
			/>
		</div>
	</div>
</section>

<Ticker items={tickerItems} />

<section class="board">
	<div class="container">
		<div class="boardhead">
			<h2 class="section-title">Leaderboard</h2>
			<span class="scoring mono">AI = 1 · Mixed = ½ · Human = 0 · min {data.minChecks} tags</span>
			<div class="controls">
				<form onsubmit={submitSearch}>
					<input
						type="text"
						class="search mono"
						placeholder="find a slopshooter"
						bind:value={search}
						aria-label="Find a slopshooter"
					/>
				</form>
				<!-- noscroll: toggling the range re-runs the load but must not jump the page -->
				<div class="range mono" data-sveltekit-noscroll data-sveltekit-replacestate>
					<a href="/?range=week" class:on={data.range === 'week'}>week</a>
					<a href="/" class:on={data.range === 'all-time'}>all-time</a>
				</div>
			</div>
		</div>

		{#if data.leaderboard.length === 0}
			<p class="empty dim">No qualifying taggers {data.range === 'week' ? 'this week ' : ''}yet — five tags before you're ranked.</p>
		{:else}
			<div class="podium">
				{#each podium as row, i (row.handle)}
					<PodiumCard
						rank={(i + 1) as 1 | 2 | 3}
						handle={row.handle}
						score={row.score}
						checks={row.checks}
						ai={row.ai}
						mix={row.mix}
						human={row.human}
						lastAt={row.lastAt}
					/>
				{/each}
			</div>

			{#if rest.length > 0}
				<div class="tablewrap">
					<table>
						<thead>
							<tr>
								<th class="r">#</th>
								<th>Tagger</th>
								<th class="r">Tags</th>
								<th class="split-col">Verdict split</th>
								<th class="r">Score</th>
								<th class="r last-col">Last tag</th>
							</tr>
						</thead>
						<tbody>
							{#each rest as row, i (row.handle)}
								<tr>
									<td class="r mono dim">{i + 4}</td>
									<td><a href="/u/{row.handle}" class="handle">@{row.handle}</a></td>
									<td class="r mono">{row.checks}</td>
									<td class="split-col">
										<VerdictSplitBar
											ai={row.ai}
											mix={row.mix}
											human={row.human}
											label="{row.ai} AI / {row.mix} mixed / {row.human} human"
										/>
									</td>
									<td class="r mono score">{formatScore(row.score)}</td>
									<td class="r mono dim small last-col">{timeAgo(row.lastAt)}</td>
								</tr>
							{/each}
						</tbody>
					</table>
				</div>
			{/if}

			<p class="qualnote mono dim">
				{data.leaderboard.length === 1
					? '1 slopshooter qualifies'
					: `${data.leaderboard.length} slopshooters qualify`}{data.range === 'week'
					? ' this week'
					: ''} — five tags to join them.
			</p>
		{/if}
	</div>
</section>

<section class="below">
	<div class="container twocol">
		<div>
			<h2 class="section-title">Recent slopshots</h2>
			{#if fresh.length === 0}
				<p class="empty dim">Nothing yet.</p>
			{:else}
				<ul class="fresh">
					{#each fresh as v (v.verdictTweetId)}
						<li>
							<VerdictBadge verdict={v.verdict} />
							<span>
								{#if v.taggerHandle}
									<a href="/u/{v.taggerHandle}" class="handle">@{v.taggerHandle}</a>
								{:else}
									<span class="dim">someone</span>
								{/if}
								tagged
								{#if v.checkedAuthorHandle}
									<a href={profileUrl(v.checkedAuthorHandle)} rel="noopener">@{v.checkedAuthorHandle}</a>
								{:else}
									<span class="dim">a post</span>
								{/if}
								<span class="meta mono dim">
									{timeAgo(v.verdictAt)} · <a href={tweetUrl(v.verdictTweetId)} rel="noopener">tweet</a>
									{#if v.historyUuid}
										· <a href={historyUrl(v.historyUuid)} rel="noopener">report</a>
									{/if}
								</span>
							</span>
						</li>
					{/each}
				</ul>
			{/if}
		</div>
		<div>
			<h2 class="section-title">How it works</h2>
			<ol class="rules">
				<li>
					<span class="n mono dim">01</span>
					<span>Someone suspects a post is slop and tags <a href="https://x.com/pangram" rel="noopener">@pangram</a> under it.</span>
				</li>
				<li>
					<span class="n mono dim">02</span>
					<span>The bot rules <span class="v-ai b">AI</span>, <span class="v-mix b">Mixed</span>, or <span class="v-human b">Human</span>.</span>
				</li>
				<li>
					<span class="n mono dim">03</span>
					<span>The tagger gets scored: AI is worth 1, Mixed ½, Human 0. Your score is the average — a number between 0 and 1.</span>
				</li>
				<li>
					<span class="n mono dim">04</span>
					<span>Five tags before you're ranked.</span>
				</li>
			</ol>
		</div>
	</div>
</section>

<style>
	.container {
		padding: 0;
	}
	/* hero */
	.hero {
		padding: 4.5rem 2rem 3rem;
		/* The hero owns this hairline — the ticker below is conditional. */
		border-bottom: 1px solid var(--line);
		position: relative;
		overflow: hidden;
	}
	.reticle {
		position: absolute;
		top: 50%;
		transform: translateY(-50%);
		border: 1px solid var(--line);
		border-radius: 50%;
		pointer-events: none;
	}
	.r1 {
		right: -120px;
		width: 420px;
		height: 420px;
	}
	.r2 {
		right: -40px;
		width: 260px;
		height: 260px;
	}
	.eyebrow {
		font-size: 0.78rem;
		color: var(--verdict-mixed);
		letter-spacing: 0.14em;
		text-transform: uppercase;
		margin: 0 0 1rem;
	}
	h1 {
		font-size: clamp(2.6rem, 7vw, 5.2rem);
		font-weight: 900;
		font-style: italic;
		text-transform: uppercase;
		line-height: 0.95;
		letter-spacing: -0.01em;
		margin: 0;
	}
	.sub {
		max-width: 34rem;
		color: var(--fg-muted);
		font-size: 1rem;
		margin: 1.5rem 0 2.5rem;
	}
	.statrow {
		display: flex;
		gap: 3rem;
		flex-wrap: wrap;
	}
	/* leaderboard */
	.board {
		padding: 3.5rem 2rem 2rem;
	}
	.boardhead {
		display: flex;
		align-items: baseline;
		gap: 1.25rem;
		flex-wrap: wrap;
		margin-bottom: 1.75rem;
	}
	.scoring {
		font-size: 0.75rem;
		color: var(--fg-muted);
	}
	.controls {
		display: flex;
		gap: 0.6rem;
		margin-left: auto;
		align-items: center;
		flex-wrap: wrap;
	}
	.search {
		background: transparent;
		border: 1px solid var(--line);
		border-radius: 3px;
		color: var(--fg-1);
		font-size: 0.78rem;
		padding: 0.38rem 0.7rem;
		width: 11rem;
		outline: none;
	}
	.search:focus {
		border-color: var(--accent-link);
	}
	.range {
		display: flex;
		border: 1px solid var(--line);
		border-radius: 3px;
		overflow: hidden;
	}
	.range a {
		color: var(--fg-muted);
		font-size: 0.72rem;
		text-transform: uppercase;
		letter-spacing: 0.06em;
		padding: 0.42rem 0.8rem;
	}
	.range a + a {
		border-left: 1px solid var(--line);
	}
	.range a.on {
		background: var(--fg-1);
		color: var(--bg-0);
	}
	.podium {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(230px, 1fr));
		gap: 1rem;
		margin-bottom: 2rem;
	}
	.tablewrap {
		overflow-x: auto;
	}
	table {
		width: 100%;
		border-collapse: collapse;
		font-size: 0.88rem;
	}
	th {
		text-align: left;
		color: var(--fg-muted);
		font-weight: 500;
		font-family: var(--font-mono);
		font-size: 0.68rem;
		text-transform: uppercase;
		letter-spacing: 0.08em;
		padding: 0.5rem 0.7rem;
		border-bottom: 1px solid var(--line);
		white-space: nowrap;
	}
	td {
		padding: 0.55rem 0.7rem;
		border-bottom: 1px solid var(--line);
		white-space: nowrap;
	}
	tbody tr:hover {
		background: var(--bg-hover);
	}
	.r {
		text-align: right;
	}
	td.mono {
		font-variant-numeric: tabular-nums;
	}
	.split-col {
		width: 30%;
		min-width: 160px;
		white-space: normal;
	}
	/* On phones the table collapses to #, tagger, checks, score — the split bar
	   and last-tag columns are what forced horizontal scrolling. */
	@media (max-width: 640px) {
		.split-col,
		.last-col {
			display: none;
		}
	}
	.score {
		font-weight: 600;
	}
	.qualnote {
		font-size: 0.7rem;
		margin: 1rem 0 0;
	}
	.small {
		font-size: 0.78rem;
	}
	.handle {
		color: var(--fg-1);
		font-weight: 700;
	}
	.empty {
		font-style: italic;
	}
	/* below the fold */
	.below {
		padding: 2rem 2rem 3.5rem;
	}
	.twocol {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
		gap: 3rem;
	}
	/* Below-the-fold titles only — the boardhead h2 stays at the global margin: 0. */
	.twocol .section-title {
		margin-bottom: 1rem;
	}
	.fresh {
		list-style: none;
		padding: 0;
		margin: 0;
		display: grid;
		gap: 0.55rem;
		font-size: 0.9rem;
	}
	.fresh li {
		display: flex;
		gap: 0.7rem;
		align-items: baseline;
	}
	.meta {
		font-size: 0.75rem;
	}
	.rules {
		margin: 0;
		padding: 0;
		list-style: none;
		display: grid;
		gap: 0.9rem;
		font-size: 0.9rem;
	}
	.rules li {
		display: flex;
		gap: 0.9rem;
	}
	.n {
		font-weight: 600;
		flex: none;
	}
	.b {
		font-weight: 700;
	}
</style>
