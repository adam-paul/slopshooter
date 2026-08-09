import type { VerdictLabel } from './types';

export type ParseResult =
	| {
			kind: 'verdict';
			label: VerdictLabel;
			historyUuid: string | null;
			truncated: boolean;
			fromImage: boolean;
			fromLink: boolean;
			shortTextDisclaimer: boolean;
	  }
	| { kind: 'unrecognized'; reason: string }
	| { kind: 'not-verdict' };

const HISTORY_URL_RE = /pangram\.com\/history\/([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12})/;

/**
 * Every template the bot has used, Dec 2025 – Aug 2026 (all observed in the
 * wild except the two "docs variant" mixes, kept defensively):
 *
 *   Dec 2025:      "AI Detected <link>" / "No AI Detected <link>"
 *   Feb–May 2026:  "We are confident that this document is fully AI-generated"
 *                  "We believe that this document is fully human-written"
 *   Jun–Jul 2026:  "We believe that this document is fully AI-generated"
 *                  "We believe that this document is AI-assisted, but not fully AI-generated."
 *   Aug 2026:      "We believe that this entire text is AI."
 *                  "We believe that this entire text is human-written."
 *                  "We believe that this entire text is a mix of AI and human-written content."
 *                  "We believe this text is mainly AI, with some human-written content."
 *                  (note: no "that" in the graded-mix variant, observed 2026-08-08)
 *
 * ORDER MATTERS: mixed-verdict patterns must precede the plain AI pattern, or
 * "AI-assisted, but not fully AI-generated" would be misread as 'ai'.
 */
const TEMPLATES: Array<{ re: RegExp; label: VerdictLabel }> = [
	// The mixed-verdict family is generalized: live data (198 quarantined rows,
	// 2026-08-09 backfill) showed the bot grades blends along several axes —
	// "a mix of <components> content", "<mainly|primarily> X with some Y content
	// (detected)", "<lightly|moderately> AI-assisted, but not fully AI-generated".
	// Anything enumerating a blend is 'mix'.
	{ re: /^We (?:believe|are confident) that this (?:document|entire text|text) is (?:lightly |moderately |heavily )?AI-assisted, but not fully AI-generated\b/, label: 'mix' },
	{ re: /^We (?:believe|are confident) (?:that )?(?:this|the) (?:document|entire text|text) (?:is|contains) a mix of [^.\n]*\bcontent\b/, label: 'mix' },
	{ re: /^We (?:believe|are confident) (?:that )?(?:this|the) (?:document|entire text|text) is (?:mainly|primarily|mostly|largely) [^.\n]*\bwith (?:some|a) [^.\n]*\bcontent(?: detected)?\b/, label: 'mix' },
	{ re: /^We (?:believe|are confident) that this (?:document|entire text|text) is (?:fully )?AI(?:-generated)?\.?(?:\s|$)/, label: 'ai' },
	{ re: /^We (?:believe|are confident) that this (?:document|entire text|text) is (?:fully )?human-written\b/, label: 'human' },
	{ re: /^No AI Detected\b/, label: 'human' },
	{ re: /^AI Detected\b/, label: 'ai' },
	// Short-label era (observed in the 2026-08 backfill window; predates the
	// sentence templates on some reply paths):
	{ re: /^Mostly Human, AI Detected\b/, label: 'mix' },
	{ re: /^Mostly [Hh]uman [Ww]ritten\b/, label: 'mix' },
	{ re: /^AI Assisted\b/, label: 'mix' },
	{ re: /^Fully AI Generated\b/, label: 'ai' },
	{ re: /^Fully Human Written\b/, label: 'human' }
];

const TRUNCATED_PREFIX_RE = /^Truncated to [\d,]+ words\.\s*/;
const IMAGE_PREFIX_RE = /^Extracted [\d,]+ words? from the image\.\s*/;
// Observed live 2026-08-08 (tweet 2086150647448031518): the bot also extracts
// article text from URLs — "Extracted 5296 words from the link."
const LINK_PREFIX_RE = /^Extracted [\d,]+ words? from the link\.\s*/;
const DISCLAIMER_RE = /Disclaimer: For text under \d+ words/;

/**
 * Classify one @pangram reply.
 *
 * - 'verdict':       matched a known template.
 * - 'unrecognized':  links a pangram.com/history page but matches no template —
 *                    this is the FORMAT-DRIFT ALARM; callers must quarantine it,
 *                    never drop it.
 * - 'not-verdict':   manual/announcement tweet; safe to ignore.
 */
export function parseVerdictReply(text: string, expandedUrls: string[] = []): ParseResult {
	// A retweet is a pointer to a verdict, never a verdict — the original tweet
	// is ingested separately (observed: the bot occasionally self-RTs).
	if (/^RT @/.test(text)) return { kind: 'not-verdict' };

	const historyUuid = extractHistoryUuid(text, expandedUrls);

	// Strip the X reply prefix (leading @mentions).
	let body = text.replace(/^(?:@\w{1,15}\s+)+/, '').trim();

	let truncated = false;
	let fromImage = false;
	let fromLink = false;
	for (;;) {
		const t = body.match(TRUNCATED_PREFIX_RE);
		if (t) {
			truncated = true;
			body = body.slice(t[0].length);
			continue;
		}
		const i = body.match(IMAGE_PREFIX_RE);
		if (i) {
			fromImage = true;
			body = body.slice(i[0].length);
			continue;
		}
		const l = body.match(LINK_PREFIX_RE);
		if (l) {
			fromLink = true;
			body = body.slice(l[0].length);
			continue;
		}
		break;
	}

	for (const { re, label } of TEMPLATES) {
		if (re.test(body)) {
			return {
				kind: 'verdict',
				label,
				historyUuid,
				truncated,
				fromImage,
				fromLink,
				shortTextDisclaimer: DISCLAIMER_RE.test(body)
			};
		}
	}

	if (historyUuid !== null) {
		return { kind: 'unrecognized', reason: 'history link present but no known verdict template' };
	}
	return { kind: 'not-verdict' };
}

function extractHistoryUuid(text: string, expandedUrls: string[]): string | null {
	// Prefer expanded entity URLs — in tweet text the link is usually t.co-wrapped.
	for (const candidate of [...expandedUrls, text]) {
		const m = candidate?.match(HISTORY_URL_RE);
		if (m) return m[1].toLowerCase();
	}
	return null;
}
