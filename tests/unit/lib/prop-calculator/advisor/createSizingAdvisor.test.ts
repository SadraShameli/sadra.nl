import { describe, expect, it } from 'vitest';

import {
    type AccountState,
    ApexVariant,
    findFirm,
    FirmId,
    type Plan,
    type PlanId,
    serializePlanId,
    TopStepVariant,
    TradingPhase,
} from '~/lib/prop-calculator';
import {
    createSizingAdvisor,
    DEFAULT_RULEBOOK,
    EvalSizingAdvisor,
    FundedSizingAdvisor,
    InstantFundedEvalAdvisorError,
    LiveSizingAdvisor,
    type ReconstructedFundedOrEvalAccount,
    ReconstructedLiveKind,
} from '~/lib/prop-calculator/advisor';

const APEX_EOD_ID: PlanId = {
    accountSize: 50_000,
    firm: FirmId.Apex,
    variant: ApexVariant.Eod,
};

const TOPSTEP_STANDARD_ID: PlanId = {
    accountSize: 50_000,
    firm: FirmId.TopStep,
    variant: TopStepVariant.StandardStandard,
};

function accountState(overrides: Partial<AccountState> = {}): AccountState {
    return {
        balance: 52_000,
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
        ...overrides,
    };
}

function evalAccount(plan: Plan): ReconstructedFundedOrEvalAccount {
    const state = accountState();
    return {
        assumptions: [],
        contractLimit: null,
        cushion: state.balance - state.threshold,
        fundedTracker: null,
        kind: TradingPhase.Eval,
        plan,
        resolvedDailyLossLimit: null,
        state,
    };
}

function registryPlan(id: PlanId): Plan {
    const found = findFirm(id.firm)?.findPlan(id);
    if (!found) throw new Error(`${serializePlanId(id)} missing`);
    return found;
}

const commonOptions = {
    maxEvalDays: 150,
    rulebook: DEFAULT_RULEBOOK,
    snapshotAsOf: '2026-09-26',
    today: '2026-09-26',
};

describe('createSizingAdvisor (PT-19f, F-118, step 15)', () => {
    it('builds an EvalSizingAdvisor for an eval account', () => {
        const advisor = createSizingAdvisor(
            evalAccount(registryPlan(APEX_EOD_ID)),
            commonOptions,
        );

        expect(advisor).toBeInstanceOf(EvalSizingAdvisor);
    });

    it('builds a FundedSizingAdvisor for a funded account', () => {
        const state = accountState();
        const advisor = createSizingAdvisor(
            {
                assumptions: [],
                contractLimit: null,
                cushion: state.balance - state.threshold,
                fundedTracker: null,
                kind: TradingPhase.Funded,
                plan: registryPlan(TOPSTEP_STANDARD_ID),
                resolvedDailyLossLimit: null,
                state,
            },
            { fundedHorizonDays: 252, ...commonOptions },
        );

        expect(advisor).toBeInstanceOf(FundedSizingAdvisor);
    });

    it('builds a LiveSizingAdvisor for a live account', () => {
        const plan = registryPlan(TOPSTEP_STANDARD_ID);
        const advisor = createSizingAdvisor(
            {
                assumptions: [],
                cushion: null,
                kind: ReconstructedLiveKind.Live,
                livePlan: null,
                plan,
                state: null,
            },
            commonOptions,
        );

        expect(advisor).toBeInstanceOf(LiveSizingAdvisor);
    });

    it('throws a typed error for an instant-funded plan reconstructed as an eval account', () => {
        const instantFunded = registryPlan(APEX_EOD_ID).withOverrides({
            isInstantFunded: true,
        });

        expect(() =>
            createSizingAdvisor(evalAccount(instantFunded), commonOptions),
        ).toThrow(InstantFundedEvalAdvisorError);
    });
});
