import type { Answers, TradeAssessmentRow } from '~/lib/trading/types';

import { DEFAULT_PLAN } from '~/lib/trading/defaults';
import { scoreAssessment } from '~/lib/trading/scoring';

const ANSWERS: Answers = {
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
    dol: { bothSided: false, distanceR: 3, singular: true, type: 'None' },
    entry: { confluences: [], onFvg: true },
    finals: { dolAlreadyTaken: false, notes: '', overExtended: false },
    mental: {
        boredomHunt: false,
        distracted: false,
        hesitation: false,
        revengeOrFomo: false,
    },
    rr: { slippageR: 0, targetR: 3 },
    sl: { bb: true, ob: true, swing: true },
    state: {
        dayType: 'imbalanced',
        displacement: 'toward',
        opposingSweep: true,
        setupType: 'continuation',
    },
};

export const ASSESSMENT_ID = 'saved-assessment';

export function assessment(
    overrides: Partial<TradeAssessmentRow> = {},
): TradeAssessmentRow {
    const snapshot = {
        ...DEFAULT_PLAN,
        risk: { ...DEFAULT_PLAN.risk, evalDollars: 100 },
    };
    const result = scoreAssessment(snapshot, ANSWERS);
    return {
        actualRiskTaken: null,
        answers: ANSWERS,
        createdAt: new Date('2026-09-10T14:00:00Z'),
        executionDeviations: null,
        followedPlan: null,
        grade: result.grade,
        id: ASSESSMENT_ID,
        outcome: null,
        outcomeNotes: null,
        outcomeR: null,
        outcomeRecordedAt: null,
        planId: 'old-plan',
        planSnapshot: snapshot,
        recommendation: result.recommendation,
        result,
        score: result.score,
        userId: 'trader',
        ...overrides,
    };
}
