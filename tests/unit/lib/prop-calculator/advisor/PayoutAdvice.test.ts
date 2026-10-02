import { describe, expect, it } from 'vitest';

import {
    type AccountState,
    dollars,
    EodTrailingDrawdown,
    findFirm,
    FirmId,
    fraction,
    type FundedCycleTracker,
    newFundedCycleTracker,
    PayoutFloorEffect,
    type Plan,
    type PlanId,
    serializePlanId,
    TopStepVariant,
} from '~/lib/prop-calculator';
import {
    AssumptionKind,
    DEFAULT_RULEBOOK,
    type FundedPayoutRuleContext,
    payoutAdvice,
    PayoutRequestDecisionKind,
    type RulebookParameters,
    SizingStage,
} from '~/lib/prop-calculator/advisor';

const TOPSTEP_STANDARD_ID: PlanId = {
    accountSize: 50_000,
    firm: FirmId.TopStep,
    variant: TopStepVariant.StandardStandard,
};

function registryPlan(id: PlanId): Plan {
    const found = findFirm(id.firm)?.findPlan(id);
    if (!found) throw new Error(`${serializePlanId(id)} missing`);
    return found;
}

const basePlan = registryPlan(TOPSTEP_STANDARD_ID).withOverrides({
    consistency: null,
    fundedConsistency: { kind: 'set', rule: null },
    fundedDrawdown: new EodTrailingDrawdown({ amount: dollars(2000) }),
    maxLifetimePayouts: undefined,
    minDaysAfterPassForPayout: 0,
    minPayoutProfit: dollars(0),
    minPayoutProfitPerCycle: dollars(0),
    payoutBalanceShareCap: undefined,
    payoutFloorEffect: PayoutFloorEffect.None,
    payoutLadder: null,
    payoutMethodFee: dollars(0),
    payoutRequestCap: undefined,
    payoutTiers: [{ thresholdProfit: dollars(0), traderShare: fraction(0.9) }],
});

const rulebook: RulebookParameters = {
    ...DEFAULT_RULEBOOK,
    payout: {
        allowBelowHardRule2: true,
        requestCents: 50_000,
        retainedCushionCents: 0,
    },
};

function fundedContext(
    overrides: Partial<FundedPayoutRuleContext> = {},
): FundedPayoutRuleContext {
    const state = fundedState({});
    return {
        liveTriggerFirmTotalCap: null,
        liveTriggerFirmTotalSource: null,
        liveTriggerPerAccountCap: null,
        liveTriggerPerAccountSource: null,
        paidPayoutsSinceLastLiveAccount: null,
        pendingPayouts: dollars(0),
        personalRequestOverride: null,
        personalRetainedCushion: null,
        plan: basePlan,
        stage: SizingStage.Funded,
        state,
        tracker: trackerAt(state),
        ...overrides,
    };
}

function fundedState(overrides: Partial<AccountState>): AccountState {
    return {
        balance: 52_000,
        bestDayProfit: 0,
        consecutiveIdleDays: 0,
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

function trackerAt(state: AccountState): FundedCycleTracker {
    return newFundedCycleTracker({ ...state, balance: state.startingBalance });
}

describe('payoutAdvice (PT-19f, F-128)', () => {
    it('nets the documented request through the split, at 90% with no method fee', () => {
        const advice = payoutAdvice(rulebook, fundedContext());

        expect(advice.documented.kind).toBe(PayoutRequestDecisionKind.Request);
        if (advice.documented.kind !== PayoutRequestDecisionKind.Request)
            return;
        expect(advice.documented.requestAmount).toBe(500);
        expect(advice.netAfterSplit).toBe(450);
    });

    it('reports the engine horizon credit via closeoutCredit, never above balance minus the post-payout floor minus the retained cushion', () => {
        const advice = payoutAdvice(rulebook, fundedContext());

        expect(advice.engineHorizonCredit).not.toBeNull();
        expect(advice.engineHorizonCredit).toBeLessThanOrEqual(
            (52_000 - 50_000 - 0) * 0.9,
        );
    });

    it('carries no numbers when the documented decision is not a request', () => {
        const state = fundedState({ balance: 50_000 });
        const advice = payoutAdvice(
            rulebook,
            fundedContext({ state, tracker: trackerAt(state) }),
        );

        expect(advice.documented.kind).not.toBe(
            PayoutRequestDecisionKind.Request,
        );
        expect(advice.engineHorizonCredit).toBeNull();
        expect(advice.netAfterSplit).toBeNull();
    });

    it('always discloses that live-transition triggers are not yet checked (F-145)', () => {
        const advice = payoutAdvice(rulebook, fundedContext());

        expect(
            advice.assumptions.some(
                (assumption) =>
                    assumption.kind === AssumptionKind.LiveTriggersNotChecked,
            ),
        ).toBe(true);
    });
});
