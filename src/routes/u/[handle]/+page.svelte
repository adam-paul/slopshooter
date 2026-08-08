<script lang="ts">
	import { historyUrl, timeAgo, tweetUrl, VERDICT_META } from '$lib/format';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	const total = $derived(data.totalChecks);
	const hitRate = $derived(total > 0 ? Math.round((100 * data.counts.ai) / total) : 0);
</script>

<svelte:head>
	<title>@{data.handle} — Pangram Leaderboard</title>
</svelte:head>

<nav class="crumb"><a href="/">← leaderboard</a></nav>

<h1>
	<a href="https://x.com/{data.handle}" rel="noopener">@{data.handle}</a>
</h1>

<section class="stats">
	<div class="stat"><span class="num">{total}</span><span class="lbl">checks</span></div>
	<div class="stat">
		<span class="num v-ai">{data.counts.ai}</span><span class="lbl">AI</span>
	</div>
	<div class="stat">
		<span class="num v-mix">{data.counts.mix}</span><span class="lbl">mixed</span>
	</div>
	<div class="stat">
		<span class="num v-human">{data.counts.human}</span><span class="lbl">human</span>
	</div>
	<div class="stat"><span class="num">{hitRate}%</span><span class="lbl">hit rate</span></div>
</section>

{#if total > data.verdicts.length}
	<p class="dim feednote">Showing the latest {data.verdicts.length} of {total} checks.</p>
{/if}

<ul class="feed">
	{#each data.verdicts as v (v.verdictTweetId)}
		{@const meta = VERDICT_META[v.verdict] ?? { label: v.verdict, className: '' }}
		<li>
			<span class="badge {meta.className}">{meta.label}</span>
			{#if v.checkedAuthorHandle}
				checked <a href="https://x.com/{v.checkedAuthorHandle}" rel="noopener">@{v.checkedAuthorHandle}</a>
			{:else}
				checked a post
			{/if}
			{#if v.shortTextDisclaimer}
				<span class="flag" title="Pangram flagged this text as short — verdict may be less reliable">short-text</span>
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

<style>
	.crumb {
		margin: 1rem 0;
		font-size: 0.85rem;
	}
	.feednote {
		font-size: 0.8rem;
		margin: 0 0 0.5rem;
	}
	h1 {
		font-size: 1.4rem;
		margin: 0.5rem 0 1rem;
	}
	h1 a {
		color: var(--fg);
	}
	.stats {
		display: flex;
		gap: 1.5rem;
		flex-wrap: wrap;
		margin: 0 0 1.5rem;
	}
	.stat .num {
		display: block;
		font-size: 1.5rem;
		font-weight: 700;
		font-variant-numeric: tabular-nums;
	}
	.stat .lbl {
		color: var(--dim);
		font-size: 0.8rem;
	}
	.feed {
		list-style: none;
		padding: 0;
		margin: 0;
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
	.flag {
		font-size: 0.7rem;
		color: var(--mix);
		border: 1px dashed var(--mix);
		border-radius: 3px;
		padding: 0 0.3rem;
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
