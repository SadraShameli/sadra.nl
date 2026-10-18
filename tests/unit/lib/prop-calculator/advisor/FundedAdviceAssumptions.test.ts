import { describe, expect, it } from 'vitest';

import {
    type AccountState,
    findFirm,
    FirmId,
    newFundedCycleTracker,
    type Plan,
    type PlanId,
    serializePlanId,
    TopStepVariant,
    TradingPhase,
} from '~/lib/prop-calculator';
import {
    type Advice,
    AssumptionKind,
    assumptionText,
    DEFAULT_RULEBOOK,
    FundedSizingAdvisor,
    type FundedSizingAdvisorInput,
    NO_PENDING_PAYOUT_COUNTS,
    type ReconstructedFundedOrEvalAccount,
} from '~/lib/prop-calculator/advisor';
import { InstrumentSymbol } from '~/lib/prop-calculator/core';

const TOPSTEP_STANDARD_ID: PlanId = {
    accountSize: 50_000,
    firm: FirmId.TopStep,
    variant: TopStepVariant.StandardStandard,
};

const plan: Plan = (() => {
    const found = findFirm(TOPSTEP_STANDARD_ID.firm)?.findPlan(
        TOPSTEP_STANDARD_ID,
    );
    if (!found) throw new Error(serializePlanId(TOPSTEP_STANDARD_ID));
    return found;
})();

const state: AccountState = {
    balance: 51_500,
    bestDayProfit: 0,
    consecutiveIdleDays: 0,
    intradayHighProfit: 0,
    peakDayCloseProfit: 0,
    peakIntradayProfit: 0,
    qualifyingDays: 20,
    startingBalance: 50_000,
    threshold: 48_000,
    thresholdLocked: false,
    todayPnL: 0,
    tradingDays: 20,
};

const account: ReconstructedFundedOrEvalAccount = {
    assumptions: [],
    contractLimit: null,
    cushion: state.balance - state.threshold,
    fundedTracker: newFundedCycleTracker({
        ...state,
        balance: state.startingBalance,
    }),
    kind: TradingPhase.Funded,
    plan,
    resolvedDailyLossLimit: null,
    state,
    ...NO_PENDING_PAYOUT_COUNTS,
};

function assembled(overrides: Partial<FundedSizingAdvisorInput> = {}): Advice {
    return new FundedSizingAdvisor({
        account,
        fundedHorizonDays: 252,
        rulebook: DEFAULT_RULEBOOK,
        snapshotAsOf: '2026-09-26',
        substate: null,
        today: '2026-09-26',
        ...overrides,
    }).assemble([]);
}

function kindsOf(advice: Advice): readonly AssumptionKind[] {
    return advice.assumptions.map((assumption) => assumption.kind);
}

describe('funded advice lists the defaults its engine inputs ran on (PT-104, F-125)', () => {
    it('lists the assumed rebuy lag and the unspecified position sizing when neither was measured nor entered', () => {
        const kinds = kindsOf(assembled());

        expect(kinds).toContain(AssumptionKind.RebuyLagAssumed);
        expect(kinds).toContain(AssumptionKind.PositionSizingUnspecified);
        expect(kinds).toContain(AssumptionKind.PercentCandidatesLeftOut);
    });

    it('lists the zero-commission sizing rule the engine ran on', () => {
        const advice = assembled();

        expect(
            advice.assumptions.some(
                (assumption) => assumption.kind === AssumptionKind.SizingRule,
            ),
        ).toBe(true);
    });

    it('drops the rebuy-lag assumption once a lag was measured', () => {
        const kinds = kindsOf(
            assembled({ measuredRebuyLag: { days: 2, samples: 4 } }),
        );

        expect(kinds).not.toContain(AssumptionKind.RebuyLagAssumed);
    });

    it('drops the position-sizing assumptions once a stop is entered', () => {
        const kinds = kindsOf(
            assembled({
                positionSizing: {
                    instrument: InstrumentSymbol.MNQ,
                    stopPoints: 10,
                },
            }),
        );

        expect(kinds).not.toContain(AssumptionKind.PositionSizingUnspecified);
        expect(kinds).not.toContain(AssumptionKind.PercentCandidatesLeftOut);
    });

    it('lists every assumption once even when the account and the engine policy both raise it', () => {
        const advice = assembled();
        const kinds = kindsOf(advice);
        const texts = advice.assumptions.map(assumptionText);

        expect(
            kinds.filter(
                (kind) => kind === AssumptionKind.LiveTriggersNotChecked,
            ),
        ).toHaveLength(1);
        expect(new Set(texts).size).toBe(texts.length);
    });
});
