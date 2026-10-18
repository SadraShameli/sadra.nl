import { describe, expect, it } from 'vitest';

import {
    type AccountState,
    type ComputeRisk,
    dollars,
    FirmId,
    type FundedCycleSnapshot,
    type Plan,
    type PlanId,
    TopStepVariant,
} from '~/lib/prop-calculator';
import {
    createDocumentedRule,
    DEFAULT_RULEBOOK,
    fundedConsistencyStatusAt,
    NextTradeKind,
    NO_PERSONAL_CAPS,
    ruleContextAt,
    SizingStage,
} from '~/lib/prop-calculator/advisor';
import {
    type DocumentedPolicySpec,
    type EnginePolicy,
    LifetimePayoutCapBasis,
    RebuyLagBasis,
    toSimInputs,
} from '~/lib/prop-calculator/advisor/policy';
import { ALL_FIRMS } from '~/lib/prop-calculator/firms';

function registryPlan(id: PlanId): Plan {
    const firm = ALL_FIRMS.find((candidate) => candidate.id === id.firm);
    const plan = firm?.findPlan(id);
    if (!plan) throw new Error(`registry plan ${JSON.stringify(id)} not found`);
    return plan;
}

const noFeeConsistency = registryPlan({
    accountSize: 50_000,
    firm: FirmId.TopStep,
    variant: TopStepVariant.NoFeeConsistency,
});
const standardStandard = registryPlan({
    accountSize: 50_000,
    firm: FirmId.TopStep,
    variant: TopStepVariant.StandardStandard,
});

const POLICY: EnginePolicy = {
    commissionPerRoundTrip: 0,
    fundedHorizonDays: 60,
    lifetimePayoutCapBasis: LifetimePayoutCapBasis.LiveTriggersNotChecked,
    lifetimePayoutCapOverride: null,
    payoutRequestOverride: null,
    rebuyLagBasis: RebuyLagBasis.AssumedZero,
    rebuyLagDays: 0,
    retainedCushionRequest: null,
};

const SPEC: DocumentedPolicySpec = {
    enginePolicy: POLICY,
    rulebook: DEFAULT_RULEBOOK,
    run: { maxEvalDays: 30, seed: 42, trials: 20 },
};

const CYCLE_PROFIT = 600;
const BEST_DAY = 200;

function cardRisk(state: AccountState, cycle: FundedCycleSnapshot): number {
    const { ceiling, note } = fundedConsistencyStatusAt(
        noFeeConsistency,
        state.balance,
        cycle,
    );
    const trade = createDocumentedRule(
        SizingStage.Funded,
        DEFAULT_RULEBOOK,
    ).nextTrade(
        ruleContextAt(noFeeConsistency, SizingStage.Funded, state, {
            consistencyCeiling: ceiling,
            consistencyNote: note,
            instrument: null,
            personalCaps: NO_PERSONAL_CAPS,
            personalDll: null,
        }),
        { dayPnL: dollars(0), losses: 0, runningLoss: dollars(0), wins: 0 },
    );
    return trade.kind === NextTradeKind.Trade ? trade.rung.risk : 0;
}

function cycleOf(): FundedCycleSnapshot {
    const state = noFeeConsistency.initialState();
    noFeeConsistency.beginFundedPhase(state);
    return {
        cycleBestDayProfit: BEST_DAY,
        dayGateProgress: 3,
        fundedResetsUsed: 0,
        lastPayoutBalance: state.balance,
        payoutsIssued: 0,
    };
}

function fundedComputeRisk(): ComputeRisk {
    const computeRisk = toSimInputs(noFeeConsistency, SPEC).fundedDayPolicy
        ?.computeRisk;
    if (computeRisk === undefined) {
        throw new Error('the documented funded day is flat');
    }
    return computeRisk;
}

function fundedState(cycleProfit: number): AccountState {
    const state = noFeeConsistency.initialState();
    noFeeConsistency.beginFundedPhase(state);
    return { ...state, balance: state.balance + cycleProfit };
}

describe('documented funded policy: funded consistency ceiling (PT-119, Q52)', () => {
    it('sizes the TopStep No-fee Consistency funded day with the documented rule instead of a flat ladder', () => {
        expect(
            toSimInputs(noFeeConsistency, SPEC).fundedDayPolicy?.computeRisk,
        ).toBeDefined();
    });

    it('caps the first trade so its win stays under the 40% ceiling ($400 on $600 of cycle profit)', () => {
        const state = fundedState(CYCLE_PROFIT);
        const risk = fundedComputeRisk()(state, 0, cycleOf());
        const rewardMultiple =
            DEFAULT_RULEBOOK.funded.takeProfitCents /
            DEFAULT_RULEBOOK.funded.riskCents;

        expect(risk).toBeLessThan(DEFAULT_RULEBOOK.funded.riskCents / 100);
        expect(risk * rewardMultiple).toBeLessThanOrEqual(400);
    });

    it('trades the same first risk the daily advice card shows at that state', () => {
        const state = fundedState(CYCLE_PROFIT);
        const cycle = cycleOf();

        expect(fundedComputeRisk()(state, 0, cycle)).toBe(
            cardRisk(state, cycle),
        );
    });

    it('trades the full rulebook risk on the first day of a cycle, where the ceiling does not apply yet', () => {
        const state = fundedState(0);

        expect(fundedComputeRisk()(state, 0, cycleOf())).toBe(
            DEFAULT_RULEBOOK.funded.riskCents / 100,
        );
    });

    it('refuses to size a consistency plan funded day without the funded cycle snapshot', () => {
        const state = fundedState(CYCLE_PROFIT);

        expect(() => fundedComputeRisk()(state, 0)).toThrow(
            /funded cycle snapshot/,
        );
    });

    it('keeps the flat funded ladder on a plan without a funded consistency rule', () => {
        expect(standardStandard.fundedConsistencyRule()).toBeNull();
        expect(
            toSimInputs(standardStandard, SPEC).fundedDayPolicy?.computeRisk,
        ).toBeUndefined();
    });
});
