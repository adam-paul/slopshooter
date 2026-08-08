/**
 * The verdict vocabulary — single authoritative home, imported by both the
 * pipeline (parser, poll) and the app (schema enum, UI meta). Neutral location
 * because pipeline/ must never import from src/ (it runs standalone in CI).
 */
export const VERDICT_LABELS = ['ai', 'human', 'mix'] as const;

export type VerdictLabel = (typeof VERDICT_LABELS)[number];
