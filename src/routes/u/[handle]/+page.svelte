<script lang="ts">
	import StatBlock from '$lib/StatBlock.svelte';
	import VerdictBadge from '$lib/VerdictBadge.svelte';
	import VerdictSplitBar from '$lib/VerdictSplitBar.svelte';
	import { formatScore, historyUrl, profileUrl, scoreOf, timeAgo, tweetUrl } from '$lib/format';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	const total = $derived(data.totalChecks);
	const score = $derived(scoreOf(data.counts.ai, data.counts.mix, total));
</script>

<svelte:head>
	<title>@{data.handle} — Slopshooter</title>
</svelte:head>

<section class="profile">
	<div class="container">
		<nav class="crumb mono"><a href="/">← leaderboard</a></nav>

		<div class="head">
			<h1><a href={profileUrl(data.handle)} rel="noopener">@{data.handle}</a></h1>
			<span class="bigscore mono">{formatScore(score)}</span>
		</div>

		<div class="statrow">
			<StatBlock value={String(total)} label="checks" accent="var(--line)" />
			<StatBlock value={String(data.counts.ai)} label="AI" accent="var(--verdict-ai)" />
			<StatBlock value={String(data.counts.mix)} label="mixed" accent="var(--verdict-mixed)" />
			<StatBlock value={String(data.counts.human)} label="human" accent="var(--verdict-human)" />
		</div>

		<div class="split">
			<VerdictSplitBar ai={data.counts.ai} mix={data.counts.mix} human={data.counts.human} />
		</div>

		{#if total > data.verdicts.length}
			<p class="feednote mono dim">showing the latest {data.verdicts.length} of {total} checks</p>
		{/if}

		<ul class="fresh">
			{#each data.verdicts as v (v.verdictTweetId)}
				<li>
					<VerdictBadge verdict={v.verdict} />
					<span>
						{#if v.checkedAuthorHandle}
							checked <a href={profileUrl(v.checkedAuthorHandle)} rel="noopener">@{v.checkedAuthorHandle}</a>
						{:else}
							checked a post
						{/if}
						{#if v.shortTextDisclaimer}
							<span class="flag mono" title="Pangram flagged this text as short — verdict may be less reliable">short-text</span>
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
	</div>
</section>

<style>
	.profile {
		padding: 2rem 2rem 3.5rem;
	}
	.crumb {
		margin: 0 0 2rem;
		font-size: 0.78rem;
	}
	.head {
		display: flex;
		align-items: baseline;
		justify-content: space-between;
		gap: 1rem;
		flex-wrap: wrap;
		margin-bottom: 1.75rem;
	}
	h1 {
		font-size: 1.6rem;
		font-weight: 700;
		margin: 0;
	}
	h1 a {
		color: var(--fg-1);
	}
	.bigscore {
		font-size: 2.4rem;
		font-weight: 600;
		font-variant-numeric: tabular-nums;
		color: var(--verdict-ai);
	}
	.statrow {
		display: flex;
		gap: 3rem;
		flex-wrap: wrap;
		margin-bottom: 1.5rem;
	}
	.split {
		max-width: 28rem;
		margin-bottom: 2rem;
	}
	.feednote {
		font-size: 0.7rem;
		margin: 0 0 0.75rem;
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
	.flag {
		font-size: 0.68rem;
		color: var(--verdict-mixed);
		border: 1px dashed var(--verdict-mixed);
		border-radius: 3px;
		padding: 0 0.3rem;
	}
</style>
