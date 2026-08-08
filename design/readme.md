# Slopshooter Design System

Slopshooter is an unofficial leaderboard tracking the verdicts the @pangram bot posts on X: people tag @pangram under posts they suspect are AI slop; the bot rules AI, Mixed, or Human; Slopshooter scores the taggers (AI = 1, Mixed = ½, Human = 0; score is the average, 0–1; minimum 5 tags to rank).

Sources: GitHub repo adam-paul/slopshooter (data model + copy); the canonical design is the landing page in the "Slopshooter landing page" project (Slopshooter Landing v2.dc.html), backpropagated here.

## Content fundamentals
- Tone: deadpan, dry, a little self-aware. "That’s pretty much it." · "Five tags before you’re ranked." · "sample data — the live feed hooks up soon" · "live-ish"
- No emoji, ever. No exclamation marks. Sentence case for prose; lowercase for mono microcopy; UPPERCASE for mono labels and display headlines.
- Handles always render as @handle links. Direct "you" address in rules.
- Always the honesty footer: verdicts are a detector’s opinion, not ground truth.

## Visual foundations
- Ground: near-black blue-greys (--bg-0 page, --bg-1 recessed panels). One page background per screen.
- The verdict tricolor IS the brand: red (AI), amber (Mixed), green (Human). Used for data, accents, stat rules, rank labels — never decoratively at random. No blue/purple accents; --accent-link is for links only.
- Type: Archivo — body at 400–700, display at 900 italic uppercase, line-height 0.95. IBM Plex Mono for ALL numbers, labels, badges, microcopy; tabular-nums on numerals.
- Borders: 1px hairlines in --line everywhere; sections divide with border-top/bottom, never boxes. Radii tiny: 3px controls/badges, 6px cards. No shadows, no gradients, no blur.
- Signature elements: the CSS crosshair mark; tricolor verdict-split bars (6px, rounded); 3px verdict-color top rules over hero stats; concentric hairline reticle rings as hero ornament; the scrolling verdict ticker.
- Motion: the ticker’s linear infinite scroll is the only ambient animation. Hover: rows tint --bg-hover; links shift to --fg-1. Active toggle segment inverts (light bg, dark text).
- Emphasis: weight and the tricolor, never size inflation. Scores drop the leading zero (".97").

## Iconography
No icon font, no SVG icon set. The crosshair mark is drawn in CSS (CrosshairMark). Unicode glyphs used sparingly as data ornaments (▲ in the ticker, · as separator, → for tagged-by). No logo asset exists; the wordmark is plain type (900 italic uppercase Archivo) beside the crosshair.

## Index
- styles.css → tokens/colors.css, tokens/typography.css (fonts via Google Fonts import)
- guidelines/ — specimen cards (colors, type, surfaces)
- components/core/ — CrosshairMark, VerdictBadge, VerdictSplitBar, StatBlock, SectionTitle, RangeToggle, SearchInput, PodiumCard, LeaderboardTable, Ticker
- ui_kits/landing/index.html — the full frontpage (starting point)

## Intentional additions
None — every component exists on the landing page.