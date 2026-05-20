import { describe, expect, it } from 'vitest';

import type { Answers } from '~/lib/trading/types';

import { DEFAULT_PLAN } from '~/lib/trading/defaults';
import { findCurrentWindow, scoreAssessment } from '~/lib/trading/scoring';

const cleanMental: Answers['mental'] = {
    boredomHunt: false,
    distracted: false,
    hesitation: false,
    revengeOrFomo: false,
};

const cleanDol: Answers['dol'] = {
    bothSided: false,
    distanceR: 3,
    singular: true,
    type: 'None',
};

function makeAnswers(overrides: Partial<Answers> = {}): Answers {
    return {
        bias: {
            conviction: 8,
            daily: 'bullish',
            fifteenMin: 'bullish',
            fourHour: 'bullish',
            oneHour: 'bullish',
            weekly: 'bullish',
        },
        context: {
            accountType: 'eval',
            windowId: DEFAULT_PLAN.windows[0]?.id ?? null,
            windowQuotaUsed: false,
        },
        dol: cleanDol,
        entry: { confluences: [], onFvg: true },
        finals: { dolAlreadyTaken: false, notes: '', overExtended: false },
        mental: cleanMental,
        rr: { slippageR: 0, targetR: 3 },
        sl: { bb: true, ob: true, swing: true },
        state: {
            dayType: 'imbalanced',
            displacement: 'toward',
            opposingSweep: true,
            setupType: 'continuation',
        },
        ...overrides,
    };
}

function nyDateAt(hhmm: string): Date {
    return new Date(`2025-01-15T${hhmm}:00-05:00`);
}

describe('findCurrentWindow', () => {
    it('returns the matching window id when inside its start–end range', () => {
        const win = DEFAULT_PLAN.windows[0];
        if (!win) throw new Error('DEFAULT_PLAN must define a first window');
        expect(findCurrentWindow(DEFAULT_PLAN, nyDateAt(win.start))).toBe(
            win.id,
        );
    });

    it('returns null when the time is between two windows', () => {
        const first = DEFAULT_PLAN.windows[0];
        const second = DEFAULT_PLAN.windows[1];
        if (!first || !second) {
            throw new Error('DEFAULT_PLAN must define two windows');
        }
        const [endH, endM] = first.end.split(':').map(Number);
        const gap = `${String(endH ?? 0).padStart(2, '0')}:${String((endM ?? 0) + 15).padStart(2, '0')}`;
        expect(findCurrentWindow(DEFAULT_PLAN, nyDateAt(gap))).toBeNull();
    });

    it('returns null when the plan defines no windows', () => {
        const empty = { ...DEFAULT_PLAN, windows: [] };
        expect(findCurrentWindow(empty, new Date())).toBeNull();
    });
});

describe('scoreAssessment knockouts', () => {
    it('mental.distracted produces a knockout result', () => {
        const result = scoreAssessment(
            DEFAULT_PLAN,
            makeAnswers({ mental: { ...cleanMental, distracted: true } }),
        );
        expect(result.redFlags.length).toBeGreaterThan(0);
        expect(['skip', 'hard-skip']).toContain(result.recommendation);
        expect(result.score).toBe(0);
    });

    it('revenge / FOMO impulse produces a knockout flag', () => {
        const result = scoreAssessment(
            DEFAULT_PLAN,
            makeAnswers({ mental: { ...cleanMental, revengeOrFomo: true } }),
        );
        expect(result.redFlags.some((f) => /revenge|fomo/i.test(f))).toBe(true);
    });

    it('both-sided DOL produces a knockout flag', () => {
        const result = scoreAssessment(
            DEFAULT_PLAN,
            makeAnswers({ dol: { ...cleanDol, bothSided: true } }),
        );
        expect(result.redFlags.some((f) => /both-sided/i.test(f))).toBe(true);
    });
});

describe('scoreAssessment grading', () => {
    it('returns no red flags and a positive score on clean inputs', () => {
        const result = scoreAssessment(DEFAULT_PLAN, makeAnswers());
        expect(result.redFlags).toEqual([]);
        expect(result.score).toBeGreaterThan(0);
        expect([
            'strong-take',
            'take',
            'marginal',
            'skip',
            'hard-skip',
        ]).toContain(result.recommendation);
    });

    it('produces a score no higher than clean when stop protection drops', () => {
        const clean = scoreAssessment(DEFAULT_PLAN, makeAnswers());
        const weakened = scoreAssessment(
            DEFAULT_PLAN,
            makeAnswers({ sl: { bb: false, ob: false, swing: true } }),
        );
        expect(weakened.score).toBeLessThanOrEqual(clean.score);
    });
});
