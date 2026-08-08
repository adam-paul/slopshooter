# slopshooter

Tracks @pangram's AI-detection verdict replies on X and ranks the taggers.
Read README.md first; deep background in docs/RESEARCH.md.

## Stack

Bun + SvelteKit (Svelte 5 runes) on Cloudflare Workers · D1 + Drizzle · pipeline is plain
Bun scripts run by GitHub Actions cron (`.github/workflows/poll.yml`), writing to D1 over
the HTTP API — it never imports SvelteKit or the Workers binding.

## Commands

- `bun test` — parser tests (the ones that matter)
- `bun run check` — svelte-check
- `bun run db:generate` — regen migrations after editing `src/lib/server/db/schema.ts`
- `bun run poll -- --dry-run` — fetch + parse without writing

## Invariants

- `pipeline/lib/parser.ts`: mixed-verdict regexes MUST stay ordered before the AI regex
  ("AI-assisted, but not fully AI-generated" would otherwise parse as 'ai'). Every template
  change gets a test with the verbatim observed string.
- Unrecognized bot replies with a history link are quarantined, never dropped — that table
  is the format-drift alarm.
- Raw twitterapi.io payloads are only touched inside `normalizeTweet()`.
- The poller's cursor (`ingest_state.last_seen_tweet_id`) is the max id SEEN, not max
  verdict id — manual bot replies must not be refetched forever.
