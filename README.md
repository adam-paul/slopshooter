# Pangram Leaderboard

Unofficial tracker of the AI-detection verdicts [@pangram](https://x.com/pangram) posts on X.
People tag the bot to check whether a post is AI slop; this site scores the taggers — who
actually has an eye for it?

Full background research (bot behavior, thread topology, reply-format history, cost analysis)
lives in [docs/RESEARCH.md](docs/RESEARCH.md).

## How it works

```
GitHub Actions (cron */15)                        Cloudflare
┌──────────────────────────────┐          ┌─────────────────────────┐
│ pipeline/poll.ts (Bun)       │  D1 HTTP │  D1 (sqlite)            │
│  poll @pangram replies       │─────────▶│  verdicts / quarantine  │
│  via twitterapi.io           │   API    │  ingest_state           │
│  → parse verdict template    │          └───────────┬─────────────┘
│  → hydrate summons + checked │                      │ binding
│    post (tagger attribution) │          ┌───────────▼─────────────┐
└──────────────────────────────┘          │  SvelteKit on Workers   │
                                          │  leaderboard UI         │
                                          └─────────────────────────┘
```

Key domain facts the code leans on (verified Aug 2026, see research doc):

- The bot replies **to the tagger**, so `in_reply_to_user_id` on a verdict is the leaderboard
  subject. The checked post is one hop further (summons' reply-to, or its quoted tweet).
- Verdicts are a fixed 3-way template (AI / human / mixed) in the reply text. Numeric
  percentages only exist in the linked report's OG image — deferred to a v2 enricher
  (`pct_ai` column already exists).
- The template **has drifted twice in nine weeks**. Unrecognized replies that still carry a
  `pangram.com/history/` link land in the `quarantine` table and the poll run emits a CI
  warning. When that fires, extend `TEMPLATES` in `pipeline/lib/parser.ts` (with a test).

## Setup

```sh
bun install
bunx wrangler login

# 1. Create the database, then paste the printed database_id into wrangler.jsonc
bunx wrangler d1 create pangram-leaderboard

# 2. Apply migrations (migrations/ is generated from src/lib/server/db/schema.ts)
bun run db:migrate:remote

# 3. Verify the twitterapi.io field mapping before writing anything (see caveat below)
cp .env.example .env   # fill in keys
bun run poll -- --dry-run

# 4. First real ingest + deploy
bun run poll
bun run deploy
```

Then add the four values from `.env.example` as GitHub Actions secrets and the
`.github/workflows/poll.yml` cron takes over.

> **Caveat — verify on first run:** the `twitterapi.io` response field names in
> `pipeline/lib/twitterapi.ts#normalizeTweet` were written defensively from docs, not
> verified against a live key. The `--dry-run` output makes it obvious if ids/handles/reply
> fields aren't coming through; fix them in `normalizeTweet()` only.

## Local dev

```sh
bun run db:migrate:local   # local D1 in .wrangler/
bun run dev                # adapter emulates the DB binding from wrangler.jsonc
```

To get real data locally, run the poller against remote D1 (it's the same database the
deployed site reads), or point `--dry-run` output wherever you like.

## Backfill

```sh
bun run poll -- --ignore-cursor --max-pages=500
```

walks the timeline as far as the provider allows. X timelines historically cap around the
most recent ~3,200 statuses; the bot has ~9.4k lifetime statuses (~8.9k verdicts, first one
2025-12-29). For the full corpus, options: twitterapi.io advanced search
(`from:pangram`), or seed tweet ids from the Wayback CDX index (~2,000 archived bot-status
URLs). Both are documented in docs/RESEARCH.md §4. At ~$0.15/1k tweets the whole corpus is
a few dollars.

## Costs

| Thing | Cost |
| --- | --- |
| twitterapi.io polling (~75 verdicts/day × 3 tweets) | ~$1/mo |
| One-time backfill (~27k tweets) | ~$4 |
| Cloudflare Workers + D1 | free tier |
| GitHub Actions (public repo) | free |

## Stats & framing

- **Hit rate** = share of a tagger's checks that came back "fully AI". Mixed verdicts count
  as their own column, not as hits. Minimum 5 checks to rank.
- This measures **agreement with Pangram**, not ground truth — Pangram has documented false
  positives, especially on short text (the bot's own sub-75-word disclaimer is stored per
  row as `short_text_disclaimer`). The UI says so.
- Taggers are scored, never the authors of checked posts.
