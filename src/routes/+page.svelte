<script lang="ts">
	import { historyUrl, timeAgo, tweetUrl, VERDICT_META } from '$lib/format';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();
</script>

<svelte:head>
	<title>Slopshooter — who has the best eye for slop?</title>
	<meta
		name="description"
		content="Tracking the verdicts @pangram hands out on X. Which taggers actually catch AI slop?"
	/>
</svelte:head>

<section class="stats">
	<div class="stat">
		<span class="num">{data.totals.checks.toLocaleString()}</span>
		<span class="lbl">checks tracked</span>
	</div>
	<div class="stat">
		<span class="num">
			{data.totals.checks > 0 ? Math.round((100 * data.totals.ai) / data.totals.checks) : 0}%
		</span>
		<span class="lbl">came back AI</span>
	</div>
	<div class="stat">
		<span class="num">{data.totals.taggers.toLocaleString()}</span>
		<span class="lbl">distinct taggers</span>
	</div>
</section>

<section>
	<h2>Leaderboard</h2>
	<p class="hint">
		Taggers with ≥{data.minChecks} checks, ranked by hit rate — the share of their tags Pangram
		called fully AI.
	</p>
	{#if data.leaderboard.length === 0}
		<p class="empty">No qualifying taggers yet — the poller hasn't collected enough data.</p>
	{:else}
		<div class="tablewrap">
			<table>
				<thead>
					<tr>
						<th class="r">#</th>
						<th>Tagger</th>
						<th class="r">Checks</th>
						<th class="r">AI</th>
						<th class="r">Mixed</th>
						<th class="r">Human</th>
						<th class="r">Hit rate</th>
						<th class="r">Last tag</th>
					</tr>
				</thead>
				<tbody>
					{#each data.leaderboard as row, i (row.handle)}
						<tr>
							<td class="r dim">{i + 1}</td>
							<td><a href="/u/{row.handle}">@{row.handle}</a></td>
							<td class="r">{row.checks}</td>
							<td class="r v-ai">{row.ai}</td>
							<td class="r v-mix">{row.mix}</td>
							<td class="r v-human">{row.human}</td>
							<td class="r">
								<span class="bar" style="--pct: {row.hitRate}%">{row.hitRate}%</span>
							</td>
							<td class="r dim">{timeAgo(row.lastAt)}</td>
						</tr>
					{/each}
				</tbody>
			</table>
		</div>
	{/if}
</section>

<section>
	<h2>Recent verdicts</h2>
	{#if data.recent.length === 0}
		<p class="empty">Nothing yet.</p>
	{:else}
		<ul class="feed">
			{#each data.recent as v (v.verdictTweetId)}
				{@const meta = VERDICT_META[v.verdict] ?? { label: v.verdict, className: '' }}
				<li>
					<span class="badge {meta.className}">{meta.label}</span>
					{#if v.taggerHandle}
						<a href="/u/{v.taggerHandle}">@{v.taggerHandle}</a>
					{:else}
						<span class="dim">someone</span>
					{/if}
					tagged
					{#if v.checkedAuthorHandle}
						<a href="https://x.com/{v.checkedAuthorHandle}" rel="noopener">@{v.checkedAuthorHandle}</a>
					{:else}
						<span class="dim">a post</span>
					{/if}
					<span class="dim">· {timeAgo(v.verdictAt)}</span>
					<span class="links">
						<a href={tweetUrl(v.verdictTweetId)} rel="noopener">tweet</a>
						{#if historyUrl(v.historyUuid)}
							· <a href={historyUrl(v.historyUuid)} rel="noopener">report</a>
						{/if}
					</span>
				</li>
			{/each}
		</ul>
	{/if}
</section>

<style>
	.stats {
		display: flex;
		gap: 2rem;
		flex-wrap: wrap;
		margin: 1.5rem 0 2.5rem;
	}
	.stat .num {
		display: block;
		font-size: 2rem;
		font-weight: 700;
		font-variant-numeric: tabular-nums;
	}
	.stat .lbl {
		color: var(--dim);
		font-size: 0.85rem;
	}
	h2 {
		margin: 2rem 0 0.25rem;
		font-size: 1.1rem;
	}
	.hint {
		color: var(--dim);
		font-size: 0.85rem;
		margin: 0 0 0.75rem;
	}
	.empty {
		color: var(--dim);
		font-style: italic;
	}
	.tablewrap {
		overflow-x: auto;
	}
	table {
		width: 100%;
		border-collapse: collapse;
		font-size: 0.9rem;
	}
	th {
		text-align: left;
		color: var(--dim);
		font-weight: 500;
		font-size: 0.75rem;
		text-transform: uppercase;
		letter-spacing: 0.05em;
	}
	th,
	td {
		padding: 0.45rem 0.6rem;
		border-bottom: 1px solid var(--line);
		white-space: nowrap;
	}
	.r {
		text-align: right;
	}
	td.r {
		font-variant-numeric: tabular-nums;
	}
	.bar {
		background: linear-gradient(to right, var(--accent-dim) var(--pct), transparent var(--pct));
		padding: 0.1rem 0.4rem;
		border-radius: 3px;
	}
	.feed {
		list-style: none;
		padding: 0;
		margin: 0.75rem 0;
		display: grid;
		gap: 0.4rem;
		font-size: 0.9rem;
	}
	.badge {
		display: inline-block;
		min-width: 3.5rem;
		text-align: center;
		padding: 0.05rem 0.45rem;
		border-radius: 999px;
		font-size: 0.72rem;
		font-weight: 600;
		border: 1px solid var(--line);
	}
	.links {
		font-size: 0.8rem;
	}
	.dim {
		color: var(--dim);
	}
	.v-ai {
		color: var(--ai);
	}
	.v-mix {
		color: var(--mix);
	}
	.v-human {
		color: var(--human);
	}
	.badge.v-ai {
		border-color: var(--ai);
	}
	.badge.v-mix {
		border-color: var(--mix);
	}
	.badge.v-human {
		border-color: var(--human);
	}
</style>
