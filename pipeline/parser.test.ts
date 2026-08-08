import { describe, expect, test } from 'bun:test';
import { parseVerdictReply } from './lib/parser';
import { parseTweetDate } from './lib/twitterapi';

const UUID = 'c1bcb03f-bd5d-44c7-a410-922f3b808d1b';
const HISTORY_URL = `https://www.pangram.com/history/${UUID}`;

// Template strings below are verbatim from observed bot replies (see docs/RESEARCH.md).

describe('current template (Aug 2026)', () => {
	test('AI verdict with reply mentions, disclaimer, and t.co link', () => {
		const r = parseVerdictReply(
			'@someuser We believe that this entire text is AI. Disclaimer: For text under 75 words, results may be less accurate. https://t.co/abc123',
			[HISTORY_URL]
		);
		expect(r).toEqual({
			kind: 'verdict',
			label: 'ai',
			historyUuid: UUID,
			truncated: false,
			fromImage: false,
			shortTextDisclaimer: true
		});
	});

	test('human verdict', () => {
		const r = parseVerdictReply(
			'@Thom_Wolf @pangram We believe that this entire text is human-written. https://t.co/x',
			[HISTORY_URL]
		);
		expect(r.kind).toBe('verdict');
		if (r.kind === 'verdict') {
			expect(r.label).toBe('human');
			expect(r.shortTextDisclaimer).toBe(false);
		}
	});

	test('mix verdict (verbatim observed wording)', () => {
		const r = parseVerdictReply(
			'@u We believe that this entire text is a mix of AI and human-written content. https://t.co/x',
			[HISTORY_URL]
		);
		expect(r.kind).toBe('verdict');
		if (r.kind === 'verdict') expect(r.label).toBe('mix');
	});

	test('mix verdict (defensive "this text" variant)', () => {
		const r = parseVerdictReply(
			'@u We believe that this text is a mix of AI and human-written content. https://t.co/x',
			[HISTORY_URL]
		);
		expect(r.kind).toBe('verdict');
		if (r.kind === 'verdict') expect(r.label).toBe('mix');
	});
});

describe('legacy templates (Feb–Jul 2026)', () => {
	test('"We are confident … fully AI-generated" (Feb–May)', () => {
		const r = parseVerdictReply(
			'@a @b We are confident that this document is fully AI-generated https://t.co/x',
			[HISTORY_URL]
		);
		expect(r.kind).toBe('verdict');
		if (r.kind === 'verdict') expect(r.label).toBe('ai');
	});

	test('"We believe … fully AI-generated" (Jun–Jul)', () => {
		const r = parseVerdictReply(
			'@a We believe that this document is fully AI-generated https://t.co/x',
			[HISTORY_URL]
		);
		expect(r.kind).toBe('verdict');
		if (r.kind === 'verdict') expect(r.label).toBe('ai');
	});

	test('AI-assisted is MIX, never AI — ordering regression guard', () => {
		const r = parseVerdictReply(
			'@a We believe that this document is AI-assisted, but not fully AI-generated. Disclaimer: For text under 75 words, results may be less accurate. https://t.co/x',
			[HISTORY_URL]
		);
		expect(r.kind).toBe('verdict');
		if (r.kind === 'verdict') {
			expect(r.label).toBe('mix');
			expect(r.shortTextDisclaimer).toBe(true);
		}
	});

	test('docs-variant mix wordings', () => {
		for (const s of [
			'We believe that this document is a mix of AI-generated, and human-written content.',
			'We believe that this document is a mix of AI-generated, AI-assisted, and human-written content.'
		]) {
			const r = parseVerdictReply(`@a ${s} https://t.co/x`, [HISTORY_URL]);
			expect(r.kind).toBe('verdict');
			if (r.kind === 'verdict') expect(r.label).toBe('mix');
		}
	});

	test('truncation prefix ("Truncated to 2500 words.")', () => {
		const r = parseVerdictReply(
			'@a Truncated to 2500 words. We believe that this document is fully human-written https://t.co/x',
			[HISTORY_URL]
		);
		expect(r.kind).toBe('verdict');
		if (r.kind === 'verdict') {
			expect(r.label).toBe('human');
			expect(r.truncated).toBe(true);
		}
	});

	test('image-OCR prefix ("Extracted 98 words from the image.")', () => {
		const r = parseVerdictReply(
			'@a Extracted 98 words from the image. We believe that this document is fully AI-generated https://t.co/x',
			[HISTORY_URL]
		);
		expect(r.kind).toBe('verdict');
		if (r.kind === 'verdict') {
			expect(r.label).toBe('ai');
			expect(r.fromImage).toBe(true);
		}
	});
});

describe('launch-era template (Dec 2025)', () => {
	test('"AI Detected"', () => {
		const r = parseVerdictReply('@a AI Detected https://t.co/x', [HISTORY_URL]);
		expect(r.kind).toBe('verdict');
		if (r.kind === 'verdict') {
			expect(r.label).toBe('ai');
			expect(r.historyUuid).toBe(UUID);
		}
	});

	test('"No AI Detected" is human, not AI', () => {
		const r = parseVerdictReply('@a No AI Detected https://t.co/x', [HISTORY_URL]);
		expect(r.kind).toBe('verdict');
		if (r.kind === 'verdict') expect(r.label).toBe('human');
	});
});

describe('non-verdicts and drift', () => {
	test('manual announcement tweet is not a verdict', () => {
		const r = parseVerdictReply('The bot is back! @pangram is this AI?', []);
		expect(r.kind).toBe('not-verdict');
	});

	test('unknown template WITH history link goes to quarantine, not the floor', () => {
		const r = parseVerdictReply(
			'@a Our verdict: 87% synthetic content. https://t.co/x',
			[HISTORY_URL]
		);
		expect(r.kind).toBe('unrecognized');
	});

	test('uuid extraction from raw text when no expanded urls', () => {
		const r = parseVerdictReply(`@a AI Detected ${HISTORY_URL}`, []);
		expect(r.kind).toBe('verdict');
		if (r.kind === 'verdict') expect(r.historyUuid).toBe(UUID);
	});
});

describe('parseTweetDate', () => {
	test('ISO 8601', () => {
		expect(parseTweetDate('2026-08-03T11:53:00.000Z')).toBe(1785757980);
	});

	test('legacy Twitter format matches its ISO equivalent', () => {
		expect(parseTweetDate('Wed Oct 10 20:19:24 +0000 2018')).toBe(
			Math.floor(Date.parse('2018-10-10T20:19:24Z') / 1000)
		);
	});

	test('unix epoch passthrough (seconds and milliseconds)', () => {
		expect(parseTweetDate(1785757980)).toBe(1785757980);
		expect(parseTweetDate(1785757980000)).toBe(1785757980);
	});

	test('garbage returns 0, never throws', () => {
		expect(parseTweetDate('not a date')).toBe(0);
		expect(parseTweetDate(undefined)).toBe(0);
	});
});
