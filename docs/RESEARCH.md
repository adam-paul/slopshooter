# Pangram Leaderboard — Exploration

*Status: idea exploration, 2026-08-07. Research from live measurement of the bot's timeline (via X syndication API, Wayback CDX, FxTwitter, Nitter proxies) plus web research — all facts below are dated and sourced.*

**The idea:** a public leaderboard scoring the people who tag @pangram on X. Do they have a good eye for slop? Hit rate, weighted average AI%, volume, streaks.

**Verdict: very feasible, and much cheaper than expected — roughly $1–5/month in data costs via third-party Twitter APIs. You do not need the official X API. The niche is open (no such tracker exists), but Pangram's own CEO has a "slop hunter of the week leaderboard" on his to-do list (Slate, Apr 2026), unshipped as of Aug 2026.**

---

## 1. The bot (measured facts)

- **Account:** `@pangram`, X user ID `1706455927531147264`, created Sep 2023. Renamed from `@pangramlabs` between May 27 and Jun 4, 2026; the old handle now 404s, so all data lives on one account.
- **First automated verdict:** Dec 29, 2025 (tweet `2005615734873846260`). ~222 days of operation as of Aug 7, 2026.
- **Volume (measured Jul 31–Aug 7, 2026):** 59, 49, 47, 214, 57, 45, 48, 75 replies/day — **mean ~74/day, median ~53**, spikes >200. Growing fast post-Pangram-4 (Jul 29).
- **Lifetime corpus:** account has 9,407 statuses; ~271 originals + ~224 RTs → **~8,900 lifetime verdict replies**. Backfill-sized, not big-data-sized.
- **Tagger diversity:** 178 recent replies → 134 distinct taggers, max 7 from one user. ~60+ distinct taggers/day. Enough for a real leaderboard.
- **Trigger:** any @pangram mention (verified triggers include bare `@pangram`, `slop?`, `🦊`, nonsense words). The bio's "tag with 'ai?'" is suggested usage only.
- **Outages happen** (Jan 20 and ~Jun 2026) and Pangram backfills mentions afterward, so verdict timestamps can lag the summons by hours.

## 2. Reply format (the parsing problem)

Current template (verified Aug 3–6, 2026), one of three fixed strings:

> "We believe that this entire text is **AI**." / "…is **human-written**." / "…is **a mix of AI and human-written content**."

plus optional lines (`Disclaimer: For text under 75 words…`, `Extracted N words from the image.`, historically `Truncated to 2500 words.`), a `pangram.com/history/{uuid}` link, and an attached verdict-card image.

**Key catches:**
- **No numeric percentage in the tweet text — ever** (0 of ~25 samples across Jun–Aug 2026). The "0–100% AI" number lives in:
  - the attached card image, and
  - the history page's **opengraph-image endpoint** (`{history-url}/opengraph-image-1ovxhm`) — a server-rendered PNG with exact numbers ("AI DETECTED 77%", "AI Generated 77% / Human 23%", word count). Fixed layout → trivially OCR-able (tesseract) or pixel-parseable. The history page itself is client-rendered Next.js/RSC — raw HTML has no verdict.
- **Format has drifted twice in ~9 weeks** (handle rename; then a template rewrite Jul 30–Aug 3, days after Pangram 4). Regex on today's three strings works but will break; anchor records on the **history-URL UUID** and design the parser to quarantine unrecognized templates rather than drop them.
- The account also posts **manual, non-verdict replies** — filter on the verdict template, don't assume every reply is a verdict.
- A stale HF dataset exists (`bingbangboom/pangrambot-verdicts`, 1,631 rows, last updated Jul 13, 2026) — wrong taxonomy/era now, but a useful format-history reference.

## 3. Thread topology (this makes the whole project easy)

Verified on 57/57 resolvable samples:

```
bot verdict reply ──in_reply_to──▶ summoner's tag tweet ──in_reply_to / quoted──▶ checked post
```

- The bot **replies to the tagger, not the checked post**. So `in_reply_to_user_id` on the verdict tweet **is the leaderboard subject** — the core join needs only the bot's own timeline. No search API, no mention-firehose.
- Identifying *what* was checked needs one more hop: hydrate the summons, read its `in_reply_to_status_id` (reply summons) or `quoted_tweet` (quote summons — verified to exist).
- The history page contains the analyzed text but **no source-tweet URL**, so it can't replace the chain walk.
- Expect ~12–14% of summons tweets to be deleted (attribution usually survives; the checked post is lost).
- Same checked post can get one verdict per tagger (verified) — dedupe by (checked_post, verdict) for "post" stats, but each tag still counts for the tagger.

## 4. Data access options (the original question)

You asked whether this requires paying for the X API. No — that's the *worst* self-serve option now.

| Route | Cost at current volume (~74/day × 3 tweets/interaction) | Backfill (~8.9k verdicts ≈ 27k tweets) | Notes |
|---|---|---|---|
| **twitterapi.io** | **~$1/mo** ($0.15/1k tweets) | **~$4** | `last_tweets` w/ `includeReplies`, batch tweets-by-IDs, monitoring/webhook API (their docs recommend it over polling). Best reputation of the unofficial providers. |
| **socialdata.tools** | ~$1.35/mo ($0.20/1k) | ~$5.50 | Equivalent endpoints; failed requests free. One competitor claims it briefly shut down — live as of Aug 7, but note the wobble. |
| Official X API (pay-per-use) | ~$33/mo ($0.005/post read) | ~$135 (full-archive search works on PPU) | Free tier is dead (Feb 2026); Basic/Pro closed. ToS-clean, ~30× pricier. Rate limits are a non-issue at this scale. |
| Free/gray (syndication API, Wayback CDX, FxTwitter) | $0 | ~2,000 IDs free via Wayback CDX | `cdn.syndication.twimg.com/tweet-result?id=…` hydrates tweets with no auth — this research was done entirely with it. Great for prototyping; unofficial, can vanish, and ~12% of payloads drop `in_reply_to` fields. |

Legal posture: X ToS prohibits scraping, but case law (hiQ, X v. Bright Data — dismissed then settled, Bright Data still operating) plus X only suing large commercial scrapers means realistic risk for a hobby leaderboard is account/IP bans, not lawsuits. A third-party API outsources the scraping and most of the risk. Pangram's ToS (Aug 2025) says nothing about republishing bot verdicts, and the history pages are deliberately public.

## 5. Stats design

Directly computable from reply text (free, robust):
- **Hit rate** — % of a tagger's checks returning "entire text is AI" (choose whether "mix" counts as a half-hit). Minimum ~5–10 tags to qualify for the board.
- **Volume, streaks, distinct-targets** — most active slop-hunters, longest AI-verdict streak, breadth.

Needing the percentage (OCR the OG-image PNG per check — free; or re-score via Pangram's API — Pangram 3 tier ~$0.02/check adds up):
- **Weighted average AI%** across a user's tags.
- Distribution/calibration views.

Honest-framing caveats worth designing in:
- **Intent is unknowable.** Some taggers are accusing, some are hoping to *clear* a post (self-checks verified in the wild). "Hit rate" silently assumes accusation. Options: embrace it with two boards ("slop hunters" vs "vibes checkers"), or classify summons text (accusatory vs neutral) with a small LLM pass — the "Grok in the Wild" paper (arXiv 2602.11286) did exactly this for Grok replies at κ ≈ .7.
- **Pangram ≠ ground truth.** Well-documented false positives (Taylor Lorenz, NYT Modern Love, Granta winners, the deBoer excerpt-vs-full-essay flip), known weakness on short text (the bot's own 75-word disclaimer), and verdict instability. The leaderboard measures *agreement with Pangram*, and should say so — that framing is also the defamation-safe one.
- **Score taggers, not authors.** A "most-flagged authors" board is the legally/socially spicy version; the tagger board (what you want anyway) is the safe one.

## 6. MVP architecture

1. **Poller** (cron, ~15 min): twitterapi.io `last_tweets(includeReplies, since_id)` on `@pangram` → filter to verdict template → batch-hydrate summons tweets → resolve checked post via `in_reply_to`/`quoted_tweet`.
2. **Enricher:** fetch `{history-url}/opengraph-image-1ovxhm`, OCR the % (fixed layout); store the UUID as the stable key.
3. **Store:** SQLite. `verdicts(verdict_tweet_id, history_uuid, tagger_id, tagger_handle, summons_id, summons_text, checked_post_id, checked_author, verdict_label, pct_ai, word_count, ts)`.
4. **Backfill:** Wayback CDX gives ~2,000 bot-status IDs free (Jun 4–Aug 6 window, pre-rename tweets not captured under `/pangram/`); provider advanced-search `from:pangram` for the rest of the ~8,900.
5. **Frontend:** static site rebuilt hourly. Leaderboard + per-user pages + recent-verdicts feed.

Total running cost: **well under $10/mo including hosting.** Prototype the poller against the free syndication API before spending anything.

## 6.5 Stack (decided 2026-08-07)

- **Frontend:** SvelteKit (Svelte 5) on **Cloudflare Workers**. The "dashboard" is one sortable table + a few charts + per-user pages — doesn't justify React/TanStack weight. LayerChart or plain SVG for charts.
- **Data:** **Cloudflare D1** (SQLite, matches the plan) + **Drizzle** (already house standard). Optionally R2 to archive verdict-card PNGs as insurance against deletions/format drift.
- **Storage sizing (at measured ~75 verdicts/day):** D1 holds rows only — ~2KB/verdict ≈ 55MB/year (+~18MB backfill); 10GB paid cap (500MB free-tier cap) is years of headroom even at 10× volume. Images go to R2, never D1: ~200KB/verdict ≈ 5.5GB/year, inside the 10GB free tier year one, then $0.015/GB-mo with zero egress (30GB archive = $0.45/mo). Shrink by archiving only the OG image and recompressing to WebP (~1.5GB/year). Images are insurance, not operational — deletable after OCR with no feature loss. Only limit worth remembering: D1 free tier is 100k row-writes/day (matters only for bulk re-imports).
- **Pipeline:** **GitHub Actions cron** (every 15 min, public repo = free) running a Bun script: poll twitterapi.io → hydrate summons → parse verdict → write to D1 via HTTP API. Native tesseract for OCR lives here happily; Cloudflare Workers' CPU limits make in-Worker OCR the only awkward piece, so keep OCR out of Workers.
- **Sequencing trick:** v1 needs **no OCR at all** — hit-rate stats come from the three-way verdict in reply text. Store `history_uuid` from day one; OG-image percentages can be backfilled any time for v2's weighted-average stats.
- **Why not Vercel:** Hobby tier is non-commercial with daily-only cron precision; we'd pay for what Cloudflare gives free. **Why not React:** nothing here needs TanStack Table; Svelte is the lighter, more fun choice for a scratch project, and it's already in the toolbelt (2weeks, playcademy).
- **Cost: $0/mo hosting** (CF free tier: 100k req/day, D1 5M reads/day) + ~$1/mo twitterapi.io.

## 7. Risks / open questions

- **Pangram ships their own leaderboard** (CEO's stated to-do). Mitigation: this is a fast, fun build; or reach out — they might like it / share data. Precedent: Community Notes third-party leaderboards coexist with X's official stats.
- **Format drift** (twice in 9 weeks) — the #1 operational risk. Alert on unparsed replies instead of skipping.
- **Free syndication endpoint could close** — fine, the paid fallback is ~$1/mo.
- Indicator's Grok tracker paused updates after ~1 month — reply-tracking pipelines rot without alerts; build the drift alarm first.
- Unverified: twitterapi.io monitoring/webhook per-event pricing; whether pre-rename (`@pangramlabs`-era) replies are fully reachable via provider search (search undercounted old low-engagement replies during measurement).

## 8. Key sources

- Volume/lifetime measurement: `api.fxtwitter.com/pangram` (9,407 statuses), Nitter-proxied timeline walk, both 2026-08-08 UTC.
- Topology: 57 verdicts hydrated via `cdn.syndication.twimg.com/tweet-result`, sampled from ~2,000 Wayback CDX-archived `@pangram` status URLs.
- Format: ~25 dated samples Jun 4–Aug 6, 2026; OG-image verdict card verified at `pangram.com/history/{uuid}/opengraph-image-1ovxhm`.
- X API pricing: docs.x.com pricing + rate-limit pages (fetched 2026-08-07) — PPU $0.005/post read, free tier discontinued Feb 6, 2026, legacy Basic killed Jun 1, 2026.
- Providers: twitterapi.io ($0.15/1k, fetched 2026-08-07), docs.socialdata.tools ($0.0002/item).
- Prior art: Slate 2026-04-17 (Spero's leaderboard to-do); "Grok in the Wild" arXiv 2602.11286 (bot-reply pipeline design); community-notes-leaderboard.com (free-TSV model); indicator.media Grok tracker (paused Apr 7, 2026).
- Accuracy debate: en.wikipedia.org/wiki/Pangram_(AI_detector); Requarth Apr 2026; deBoer Jul 2026; GPTZero's Jan 2026 rebuttal.
