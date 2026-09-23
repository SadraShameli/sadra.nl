import { describe, expect, it } from 'vitest';

import {
    FirmId,
    type Plan,
    selectTier,
    TierBasis,
    tierBreakpoints,
    type TierProfitContext,
    tierProfitFor,
    TopStepVariant,
    TradeifyVariant,
} from '~/lib/prop-calculator/core';
import { ALL_FIRMS, findFirm } from '~/lib/prop-calculator/firms';

const CROSSING: TierProfitContext = {
    peakDayCloseProfit: 3100,
    profit: 3050,
    sessionOpenProfit: 2900,
};

const OUT_OF_ORDER = [
    { label: 'top', minProfit: 2000 },
    { label: 'base', minProfit: 0 },
    { label: 'middle', minProfit: 1500 },
] as const;

function labelAt(profit: number): string | undefined {
    return selectTier(OUT_OF_ORDER, profit, (tier) => tier.minProfit)?.label;
}

function topStepStandard(): Plan {
    const plan = findFirm(FirmId.TopStep)?.findPlan({
        accountSize: 50_000,
        firm: FirmId.TopStep,
        variant: TopStepVariant.StandardStandard,
    });
    if (!plan) throw new Error('TopStep standard 50K plan not found');
    return plan;
}

function tradeifyGrowth(): Plan {
    const plan = findFirm(FirmId.Tradeify)?.findPlan({
        accountSize: 50_000,
        firm: FirmId.Tradeify,
        variant: TradeifyVariant.Growth,
    });
    if (!plan) throw new Error('Tradeify Growth 50K plan not found');
    return plan;
}

describe('tierProfitFor', () => {
    it('reads live profit for LiveProfit', () => {
        expect(tierProfitFor(TierBasis.LiveProfit, CROSSING)).toBe(3050);
    });

    it('reads the session-open profit for SessionOpenProfit, ignoring the peak', () => {
        expect(tierProfitFor(TierBasis.SessionOpenProfit, CROSSING)).toBe(
            2900,
        );
    });

    it('reads the peak session close for PeakSessionCloseProfit', () => {
        expect(tierProfitFor(TierBasis.PeakSessionCloseProfit, CROSSING)).toBe(
            3100,
        );
    });

    it('never lets PeakSessionCloseProfit fall below the session-open profit when the recorded peak lags it', () => {
        expect(
            tierProfitFor(TierBasis.PeakSessionCloseProfit, {
                peakDayCloseProfit: 1000,
                profit: 0,
                sessionOpenProfit: 2900,
            }),
        ).toBe(2900);
    });
});

describe('selectTier', () => {
    it('stays on the lowest tier just below the next breakpoint', () => {
        expect(labelAt(1499)).toBe('base');
    });

    it('moves up exactly at a breakpoint regardless of declaration order', () => {
        expect(labelAt(1500)).toBe('middle');
        expect(labelAt(2000)).toBe('top');
    });

    it('falls back to the lowest tier below every breakpoint', () => {
        expect(labelAt(-500)).toBe('base');
    });

    it('holds the highest tier far above the last breakpoint', () => {
        expect(labelAt(50_000)).toBe('top');
    });

    it('returns undefined for an empty tier list', () => {
        expect(selectTier([], 1000, (tier: number) => tier)).toBeUndefined();
    });
});

describe('tierBreakpoints', () => {
    it('sorts ascending and drops duplicates', () => {
        expect(tierBreakpoints([2000, 0, 1500, 1500])).toStrictEqual([
            0, 1500, 2000,
        ]);
    });

    it('returns an empty list for no values', () => {
        expect(tierBreakpoints([])).toStrictEqual([]);
    });
});

describe('Plan tier profit context', () => {
    it('derives the session-open profit from the balance minus the day P&L so far', () => {
        const plan = topStepStandard();
        const state = plan.initialState();
        plan.beginFundedPhase(state);
        state.balance = state.startingBalance + 2500;
        state.todayPnL = 1300;
        state.peakDayCloseProfit = 1400;

        expect(plan.tierProfitContext(state)).toStrictEqual({
            peakDayCloseProfit: 1400,
            profit: 2500,
            sessionOpenProfit: 1200,
        });
    });

    it('carries the session-open profit into the daily loss limit context', () => {
        const plan = topStepStandard();
        const state = plan.initialState();
        plan.beginFundedPhase(state);
        state.balance = state.startingBalance + 900;
        state.todayPnL = -600;
        state.thresholdLocked = true;

        expect(plan.dailyLossLimitContext(state)).toStrictEqual({
            isThresholdLocked: true,
            peakDayCloseProfit: 0,
            profit: 900,
            sessionOpenProfit: 1500,
        });
    });

    it('reports the funded contract breakpoints only for the basis the plan uses', () => {
        const plan = topStepStandard();

        expect(
            plan.fundedContractTierBreakpoints(
                TierBasis.SessionOpenProfit,
                false,
            ),
        ).toStrictEqual([0, 1500, 2000]);
        expect(
            plan.fundedContractTierBreakpoints(
                TierBasis.SessionOpenProfit,
                true,
            ),
        ).toStrictEqual([0, 1500, 2000]);
        expect(
            plan.fundedContractTierBreakpoints(
                TierBasis.PeakSessionCloseProfit,
                false,
            ),
        ).toStrictEqual([]);
    });

    it('reports the funded daily loss limit breakpoints only for the basis the plan uses', () => {
        const plan = tradeifyGrowth();

        expect(
            plan.fundedDailyLossLimitTierBreakpoints(
                TierBasis.PeakSessionCloseProfit,
            ),
        ).toStrictEqual([0, 3000]);
        expect(
            plan.fundedDailyLossLimitTierBreakpoints(
                TierBasis.SessionOpenProfit,
            ),
        ).toStrictEqual([]);
    });
});

describe('firm notes describe the TierBasis their configs use', () => {
    it('never claims the contract-limit and daily-loss-limit tier bases are one identical flag', () => {
        for (const firm of ALL_FIRMS) {
            for (const note of firm.notes) {
                expect(note, firm.displayName).not.toMatch(
                    /mirroring (the identical flag|DailyLossLimitConfig's)/,
                );
            }
        }
    });

    it('describes the Tradeify scaling daily loss limit as tiering off the highest session close, not the prior day close', () => {
        const note = findFirm(FirmId.Tradeify)?.notes.find(
            (candidate) =>
                candidate.includes('SCALING_FUNDED_DLL') &&
                candidate.includes('TierBasis.PeakSessionCloseProfit'),
        );

        expect(
            tradeifyGrowth().fundedDailyLossLimitTierBreakpoints(
                TierBasis.PeakSessionCloseProfit,
            ),
        ).not.toStrictEqual([]);
        expect(note).toBeDefined();
        expect(note).not.toContain("prior day's confirmed EOD close");
        expect(note).toContain('highest session close');
    });
});
