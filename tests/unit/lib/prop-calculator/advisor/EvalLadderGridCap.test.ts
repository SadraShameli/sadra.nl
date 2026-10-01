import { describe, expect, it } from 'vitest';

import {
    type AccountState,
    ApexVariant,
    findFirm,
    FirmId,
    ladderGridSize,
    type Plan,
    serializePlanId,
    TradingPhase,
} from '~/lib/prop-calculator';
import {
    AdviceSource,
    DEFAULT_RULEBOOK,
    DifferenceReason,
    EvalSizingAdvisor,
    type ReconstructedFundedOrEvalAccount,
} from '~/lib/prop-calculator/advisor';

const APEX_EOD_ID = {
    accountSize: 50_000,
    firm: FirmId.Apex,
    variant: ApexVariant.Eod,
} as const;

const LADDER_GRID_CAP = 2000;
const BASE_STEP = 100;

function accountWithCushion(
    cushion: number,
    resolvedDailyLossLimit: null | number = null,
): ReconstructedFundedOrEvalAccount {
    const state: AccountState = {
        balance: 50_000 + cushion,
        bestDayProfit: 0,
        consecutiveIdleDays: 0,
        elapsedDays: 0,
        intradayHighProfit: 0,
        peakDayCloseProfit: 0,
        peakIntradayProfit: 0,
        qualifyingDays: 0,
        startingBalance: 50_000,
        threshold: 50_000,
        thresholdLocked: false,
        todayPnL: 0,
        tradingDays: 0,
    };
    return {
        assumptions: [],
        contractLimit: null,
        cushion,
        fundedTracker: null,
        kind: TradingPhase.Eval,
        plan: registryPlan(),
        resolvedDailyLossLimit,
        state,
    };
}

function adviceAt(cushion: number, dailyLossLimit: null | number) {
    const advisor = new EvalSizingAdvisor({
        account: accountWithCushion(cushion, dailyLossLimit),
        maxEvalDays: 150,
        rulebook: DEFAULT_RULEBOOK,
        snapshotAsOf: '2026-09-26',
        today: '2026-09-26',
    });
    return advisor.assemble([]);
}

function ladderRequestAt(cushion: number) {
    const advisor = new EvalSizingAdvisor({
        account: accountWithCushion(cushion),
        maxEvalDays: 150,
        rulebook: DEFAULT_RULEBOOK,
        snapshotAsOf: '2026-09-26',
        today: '2026-09-26',
    });
    const [request] = advisor.optimumRequests();
    if (request?.source !== AdviceSource.LadderSearchFresh) {
        throw new Error('expected a fresh ladder search request');
    }
    return request;
}

function registryPlan(): Plan {
    const found = findFirm(APEX_EOD_ID.firm)?.findPlan(APEX_EOD_ID);
    if (!found) throw new Error(`${serializePlanId(APEX_EOD_ID)} missing`);
    return found;
}

describe('EvalSizingAdvisor ladder grid fits the cap at any cushion (PT-24c step 1)', () => {
    it.each([50, 100, 250, 800, 1500, 2000, 2500, 3000, 5000, 10_000, 50_000])(
        'cushion %d produces a grid within the ladder cap without throwing',
        (cushion) => {
            const request = ladderRequestAt(cushion);

            expect(request.maxGridSize).toBe(LADDER_GRID_CAP);
            expect(ladderGridSize(request.grid)).toBeLessThanOrEqual(
                LADDER_GRID_CAP,
            );
            expect(request.grid.max).toBeGreaterThanOrEqual(request.grid.lo);
        },
    );

    it('keeps the $100 step wherever the default grid already fits', () => {
        expect(ladderRequestAt(1500).grid.step).toBe(BASE_STEP);
        expect(ladderRequestAt(1000).grid.step).toBe(BASE_STEP);
    });

    it('widens the step, never the cap, at a $2,000 cushion (the 4,680-ladder case)', () => {
        const request = ladderRequestAt(2000);

        expect(request.grid.step).toBeGreaterThan(BASE_STEP);
        expect(request.grid.max).toBe(800);
        expect(request.maxGridSize).toBe(LADDER_GRID_CAP);
    });

    it('never narrows the step as the cushion grows', () => {
        const steps = [2000, 2500, 5000, 10_000, 50_000].map(
            (cushion) => ladderRequestAt(cushion).grid.step,
        );

        expect(steps).toStrictEqual(steps.toSorted((a, b) => a - b));
    });

    it.each([50, 100, 250, 800, 1500, 2000, 2500, 3000, 5000, 10_000, 50_000])(
        'cushion %d keeps the top rung on the grid, so the printed range is the searched range',
        (cushion) => {
            const { grid } = ladderRequestAt(cushion);
            const rungsAboveLo = (grid.max - grid.lo) / grid.step;

            expect(Number.isSafeInteger(rungsAboveLo)).toBe(true);
        },
    );

    it.each([2000, 2500, 5000, 50_000])(
        'cushion %d never searches a lower top rung than the default grid',
        (cushion) => {
            const { grid } = ladderRequestAt(cushion);
            const defaultMax = Math.round(cushion * 0.4);

            expect(grid.max).toBeGreaterThanOrEqual(defaultMax);
            expect(grid.max - defaultMax).toBeLessThan(10);
        },
    );

    it('searches the full 6 rung values at the $2,000 cushion, 100 through 800', () => {
        const { grid } = ladderRequestAt(2000);

        expect(grid).toStrictEqual({ lo: 100, max: 800, slots: 4, step: 140 });
        expect(ladderGridSize(grid)).toBe(1554);
    });
});

describe('EvalSizingAdvisor states how the engine ladder differs from the documented rule', () => {
    it('lists the speed-versus-monthly-net objective difference on every eval advice', () => {
        const advice = adviceAt(2000, null);

        expect(advice.differenceReasons).toContainEqual({
            kind: DifferenceReason.ObjectiveSpeedVsMonthlyNet,
        });
    });

    it('lists the daily loss cap with its amount when the plan has one', () => {
        const advice = adviceAt(2000, 1000);

        expect(advice.differenceReasons).toContainEqual({
            dailyLossLimit: 1000,
            kind: DifferenceReason.DailyLossCap,
        });
    });

    it('lists no daily loss cap when the plan has none', () => {
        const advice = adviceAt(2000, null);

        expect(
            advice.differenceReasons.some(
                (reason) => reason.kind === DifferenceReason.DailyLossCap,
            ),
        ).toBe(false);
    });
});
