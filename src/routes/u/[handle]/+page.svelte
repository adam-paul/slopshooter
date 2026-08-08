<script lang="ts">
	import VerdictBadge from '$lib/VerdictBadge.svelte';
	import { historyUrl, hitRatePct, profileUrl, timeAgo, tweetUrl } from '$lib/format';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	const total = $derived(data.totalChecks);
	const hitRate = $derived(hitRatePct(data.counts.ai, total));
</script>

<svelte:head>
	<title>@{data.handle} — Slopshooter</title>
</svelte:head>

<nav class="crumb"><a href="/">← leaderboard</a></nav>

<h1>
	<a href={profileUrl(data.handle)} rel="noopener">@{data.handle}</a>
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
		<li>
			<VerdictBadge verdict={v.verdict} />
			{#if v.checkedAuthorHandle}
				checked <a href={profileUrl(v.checkedAuthorHandle)} rel="noopener">@{v.checkedAuthorHandle}</a>
			{:else}
				checked a post
			{/if}
			{#if v.shortTextDisclaimer}
				<span class="flag" title="Pangram flagged this text as short — verdict may be less reliable">short-text</span>
			{/if}
			<span class="dim">· {timeAgo(v.verdictAt)}</span>
			<span class="links">
				<a href={tweetUrl(v.verdictTweetId)} rel="noopener">tweet</a>
				{#if v.historyUuid}
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
		margin: 0 0 1.5rem;
		--stats-gap: 1.5rem;
		--stat-size: 1.5rem;
	}
	.flag {
		font-size: 0.7rem;
		color: var(--mix);
		border: 1px dashed var(--mix);
		border-radius: 3px;
		padding: 0 0.3rem;
	}
</style>
