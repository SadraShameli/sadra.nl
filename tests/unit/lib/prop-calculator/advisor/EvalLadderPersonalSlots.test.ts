import { describe, expect, it } from 'vitest';

import {
    type AccountState,
    ApexVariant,
    type Dollars,
    dollars,
    findFirm,
    FirmId,
    type Plan,
    serializePlanId,
    TradingPhase,
} from '~/lib/prop-calculator';
import {
    AdviceSource,
    AssumptionBias,
    AssumptionKind,
    DEFAULT_RULEBOOK,
    EvalSizingAdvisor,
    type LadderSearchRequest,
    ladderStepWidenedAssumption,
    NO_PENDING_PAYOUT_COUNTS,
    NO_PERSONAL_CAPS,
    type PersonalCaps,
    type ReconstructedFundedOrEvalAccount,
} from '~/lib/prop-calculator/advisor';

const APEX_EOD_ID = {
    accountSize: 50_000,
    firm: FirmId.Apex,
    variant: ApexVariant.Eod,
} as const;

const BASE_STEP = 100;

function accountWithCushion(cushion: number): ReconstructedFundedOrEvalAccount {
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
        resolvedDailyLossLimit: null,
        state,
        ...NO_PENDING_PAYOUT_COUNTS,
    };
}

function advisorWith(
    caps: Partial<PersonalCaps>,
    cushion = 2000,
): EvalSizingAdvisor {
    return new EvalSizingAdvisor({
        account: accountWithCushion(cushion),
        maxEvalDays: 40,
        personalCaps: { ...NO_PERSONAL_CAPS, ...caps },
        rulebook: DEFAULT_RULEBOOK,
        sims: 20,
        snapshotAsOf: '2026-09-26',
        substate: null,
        today: '2026-09-26',
    });
}

function ladderRequestOf(advisor: EvalSizingAdvisor): LadderSearchRequest {
    const [request] = advisor.optimumRequests();
    if (
        request?.source !== AdviceSource.LadderSearchFresh &&
        request?.source !== AdviceSource.LadderSearchFromState
    ) {
        throw new Error('expected a ladder search request');
    }
    return request;
}

function registryPlan(): Plan {
    const found = findFirm(APEX_EOD_ID.firm)?.findPlan(APEX_EOD_ID);
    if (!found) throw new Error(`${serializePlanId(APEX_EOD_ID)} missing`);
    return found;
}

function widenedAssumptionsOf(advisor: EvalSizingAdvisor) {
    return advisor
        .assemble([])
        .assumptions.filter(
            (assumption) =>
                assumption.kind === AssumptionKind.LadderStepWidened,
        );
}

describe('the eval ladder grid uses at most the personal max trades per day as slots (PT-68f, F-V16)', () => {
    it('keeps four slots when no personal maximum is set or it is above four', () => {
        expect(ladderRequestOf(advisorWith({})).grid.slots).toBe(4);
        expect(
            ladderRequestOf(advisorWith({ maxTradesPerDay: 9 })).grid.slots,
        ).toBe(4);
    });

    it.each([1, 2, 3])(
        'searches at most the personal maximum of %d slots',
        (max) => {
            expect(
                ladderRequestOf(advisorWith({ maxTradesPerDay: max })).grid
                    .slots,
            ).toBe(max);
        },
    );

    it('searches the finer default grid when fewer slots keep the grid inside the size limit', () => {
        expect(
            ladderRequestOf(advisorWith({ maxTradesPerDay: 2 })).grid,
        ).toStrictEqual({ lo: 100, max: 800, slots: 2, step: 100 });
    });
});

describe('the widened-step assumption states the step the search used (PT-68f, F-V16)', () => {
    const maxRisks: readonly (Dollars | null)[] = [
        null,
        dollars(380),
        dollars(450),
        dollars(150),
        dollars(60),
    ];

    it.each(maxRisks)(
        'matches the searched grid step with a personal max risk of %s',
        (maxRiskPerTrade) => {
            const advisor = advisorWith({ maxRiskPerTrade });
            const { step } = ladderRequestOf(advisor).grid;

            expect(widenedAssumptionsOf(advisor)).toStrictEqual(
                step > BASE_STEP
                    ? [
                          ladderStepWidenedAssumption(
                              step,
                              AssumptionBias.Neutral,
                          ),
                      ]
                    : [],
            );
        },
    );

    it('lists nothing when the personal cap makes the searched step finer than the default, though the default grid is widened', () => {
        const advisor = advisorWith({ maxRiskPerTrade: dollars(450) });

        expect(ladderRequestOf(advisor).grid.step).toBe(87.5);
        expect(widenedAssumptionsOf(advisor)).toStrictEqual([]);
    });

    it('lists nothing when fewer slots let the default grid keep its $100 step', () => {
        expect(
            widenedAssumptionsOf(advisorWith({ maxTradesPerDay: 2 })),
        ).toStrictEqual([]);
    });

    it('still lists the default widened step when no personal limit changes the grid', () => {
        expect(widenedAssumptionsOf(advisorWith({}))).toStrictEqual([
            ladderStepWidenedAssumption(140, AssumptionBias.Neutral),
        ]);
    });
});

describe('the capped eval ladder grid stays on whole cents (PT-68f, F-V16)', () => {
    const WHOLE_CENT_TOLERANCE = 1e-6;

    function isWholeCent(amount: number): boolean {
        const cents = amount * 100;
        return Math.abs(cents - Math.round(cents)) < WHOLE_CENT_TOLERANCE;
    }

    it.each([333.33, 301.01, 449.99, 187.77])(
        'offers only whole-cent rungs at or below a personal max risk of %s',
        (cap) => {
            const { grid } = ladderRequestOf(
                advisorWith({ maxRiskPerTrade: dollars(cap) }),
            );
            const levels = Math.round((grid.max - grid.lo) / grid.step) + 1;
            const rungs = Array.from(
                { length: levels },
                (_, index) => grid.lo + index * grid.step,
            );

            expect(isWholeCent(grid.step)).toBe(true);
            expect(grid.max).toBeLessThanOrEqual(cap);
            expect(rungs.every(isWholeCent)).toBe(true);
            expect(levels).toBeGreaterThanOrEqual(2);
        },
    );
});
