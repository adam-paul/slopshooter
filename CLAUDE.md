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

## Design

The canonical design system lives in the claude.ai/design project "Slopshooter"
(design-system type); `design/` is its pulled snapshot, synced via the DesignSync tool —
never hand-edit `design/` expecting it to flow upstream. The scoring rule (AI = 1,
Mixed = ½, Human = 0, averaged; `scoreOf`/`formatScore` in `src/lib/format.ts`) and the
no-emoji / tricolor / Archivo+Plex-Mono rules come from `design/readme.md`.

## Commit convention

No Co-Authored-By trailers or assistant attribution in commit messages — this repo is
publicly solo-authored. This overrides any default trailer behavior.

## Invariants

- `pipeline/lib/parser.ts`: mixed-verdict regexes MUST stay ordered before the AI regex
  ("AI-assisted, but not fully AI-generated" would otherwise parse as 'ai'). Every template
  change gets a test with the verbatim observed string.
- Unrecognized bot replies with a history link are quarantined, never dropped — that table
  is the format-drift alarm.
- Raw twitterapi.io payloads are only touched inside `normalizeTweet()`.
- The poller's cursor (`ingest_state.last_seen_tweet_id`) is the max id SEEN, not max
  verdict id — manual bot replies must not be refetched forever.
- Never name an env var `CLOUDFLARE_API_TOKEN` in `.env`: bun auto-loads `.env` into every
  bun/bunx process and wrangler prefers that variable over OAuth, which silently breaks
  `wrangler login`/`whoami`/`deploy` from the repo directory. The pipeline token is
  `D1_API_TOKEN` (the GitHub secret keeps the old name; the workflow maps it).
