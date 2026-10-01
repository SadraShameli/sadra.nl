import { describe, expect, it } from 'vitest';

import {
    type AccountState,
    dollars,
    findFirm,
    FirmId,
    TopStepVariant,
    TradingPhase,
} from '~/lib/prop-calculator';
import {
    DEFAULT_RULEBOOK,
    EvalSizingAdvisor,
} from '~/lib/prop-calculator/advisor';
import { dayProgressFromCounts } from '~/lib/prop-calculator/advisor/actions';

function evalAdvisor(): EvalSizingAdvisor {
    const plan = findFirm(FirmId.TopStep)?.findPlan({
        accountSize: 50_000,
        firm: FirmId.TopStep,
        variant: TopStepVariant.StandardStandard,
    });
    if (!plan) throw new Error('TopStep Standard/Standard 50K plan not found');
    const state: AccountState = {
        balance: 50_000,
        bestDayProfit: 0,
        consecutiveIdleDays: 0,
        intradayHighProfit: 0,
        peakDayCloseProfit: 0,
        peakIntradayProfit: 0,
        qualifyingDays: 0,
        startingBalance: 50_000,
        threshold: 48_000,
        thresholdLocked: false,
        todayPnL: 0,
        tradingDays: 0,
    };
    return new EvalSizingAdvisor({
        account: {
            assumptions: [],
            contractLimit: null,
            cushion: 2000,
            fundedTracker: null,
            kind: TradingPhase.Eval,
            plan,
            resolvedDailyLossLimit: null,
            state,
        },
        maxEvalDays: 150,
        rulebook: DEFAULT_RULEBOOK,
        sims: 20,
        snapshotAsOf: '2026-09-26',
        today: '2026-09-26',
    });
}

describe('dayProgressFromCounts (PT-67b step 3)', () => {
    const advisor = evalAdvisor();
    const rungs = advisor.dailyPlanCard()?.rungs ?? [];

    it('has at least two rungs in the fixture', () => {
        expect(rungs.length).toBeGreaterThanOrEqual(2);
    });

    it('is the zero day without trades', () => {
        expect(dayProgressFromCounts(advisor, 0, 0)).toStrictEqual({
            dayPnL: dollars(0),
            losses: 0,
            runningLoss: dollars(0),
            wins: 0,
        });
    });

    it('adds the running loss of the documented ladder for each loss', () => {
        expect(dayProgressFromCounts(advisor, 0, 1).runningLoss).toBe(
            rungs[0]?.runningLossAfter,
        );
        expect(dayProgressFromCounts(advisor, 0, 2).runningLoss).toBe(
            rungs[1]?.runningLossAfter,
        );
    });

    it('prices wins at the take profit of the rung the day stands on', () => {
        const day = dayProgressFromCounts(advisor, 1, 1);

        expect(day.dayPnL).toBe(
            dollars(
                (rungs[1]?.takeProfit ?? 0) - (rungs[0]?.runningLossAfter ?? 0),
            ),
        );
    });

    it('stays at the last rung when the day has more losses than rungs', () => {
        const last = rungs.at(-1);

        expect(
            dayProgressFromCounts(advisor, 0, rungs.length + 5).runningLoss,
        ).toBe(last?.runningLossAfter);
    });
});
