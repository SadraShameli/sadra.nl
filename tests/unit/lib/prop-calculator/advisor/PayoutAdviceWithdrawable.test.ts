import { describe, expect, it } from 'vitest';

import {
    type AccountState,
    dollars,
    EodTrailingDrawdown,
    findFirm,
    findLivePlanBuilder,
    FirmId,
    fraction,
    type FundedCycleTracker,
    newFundedCycleTracker,
    PayoutFloorEffect,
    type Plan,
    type PlanId,
    postPayoutThreshold,
    serializePlanId,
    TopStepVariant,
} from '~/lib/prop-calculator';
import {
    DEFAULT_RULEBOOK,
    type FundedPayoutRuleContext,
    payoutAdvice,
    PayoutCapKind,
    PayoutRequestDecisionKind,
    type RulebookParameters,
    ruleCappedWithdrawable,
    SizingStage,
} from '~/lib/prop-calculator/advisor';

const TOPSTEP_STANDARD_ID: PlanId = {
    accountSize: 50_000,
    firm: FirmId.TopStep,
    variant: TopStepVariant.StandardStandard,
};

const NO_CUSHION = 0;

function registryPlan(id: PlanId): Plan {
    const found = findFirm(id.firm)?.findPlan(id);
    if (!found) throw new Error(`${serializePlanId(id)} missing`);
    return found;
}

const uncappedPlan = registryPlan(TOPSTEP_STANDARD_ID).withOverrides({
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

const lockFloorPlan = uncappedPlan.withOverrides({
    fundedDrawdown: new EodTrailingDrawdown({
        amount: dollars(2000),
        lock: {
            atProfit: null,
            lockedThreshold: (startingBalance) => startingBalance + 100,
        },
    }),
    payoutFloorEffect: PayoutFloorEffect.MoveToLockedFloor,
});

const releaseFloorPlan = uncappedPlan.withOverrides({
    payoutFloorEffect: PayoutFloorEffect.ReleaseFloor,
});

function fundedContext(
    plan: Plan,
    overrides: Partial<FundedPayoutRuleContext> = {},
): FundedPayoutRuleContext {
    const state = fundedState();
    return {
        liveTriggerFirmTotalCap: null,
        liveTriggerFirmTotalSource: null,
        liveTriggerPerAccountCap: null,
        liveTriggerPerAccountSource: null,
        otherAccountsPendingPayoutCount: 0,
        paidPayoutsSinceLastLiveAccount: null,
        pendingPayoutCount: 0,
        pendingPayouts: dollars(0),
        personalRequestOverride: null,
        personalRetainedCushion: null,
        plan,
        stage: SizingStage.Funded,
        state,
        tracker: trackerAt(state),
        ...overrides,
    };
}

function fundedState(overrides: Partial<AccountState> = {}): AccountState {
    return {
        balance: 53_000,
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
        ...overrides,
    };
}

function rulebookRequesting(requestCents: number): RulebookParameters {
    return {
        ...DEFAULT_RULEBOOK,
        payout: {
            allowBelowHardRule2: true,
            requestCents,
            retainedCushionCents: NO_CUSHION,
        },
    };
}

function trackerAt(state: AccountState, payoutsIssued = 0): FundedCycleTracker {
    const tracker = newFundedCycleTracker({
        ...state,
        balance: state.startingBalance,
    });
    tracker.payoutsIssued = payoutsIssued;
    return tracker;
}

describe('the payout advice states the rule-capped withdrawable (PT-105 step 6, F-128)', () => {
    it('equals ruleCappedWithdrawable on a plan with a lock floor effect and stays under balance minus the post-payout floor minus the retained cushion', () => {
        const context = fundedContext(lockFloorPlan);

        const advice = payoutAdvice(rulebookRequesting(50_000), context);

        expect(advice.documented.kind).toBe(PayoutRequestDecisionKind.Request);
        if (advice.documented.kind !== PayoutRequestDecisionKind.Request) {
            return;
        }
        const { retainedCushion } = advice.documented;
        const expected = ruleCappedWithdrawable(
            lockFloorPlan,
            context.tracker,
            context.state,
            retainedCushion,
        );
        const postPayoutFloor = postPayoutThreshold(
            lockFloorPlan.fundedDrawdown,
            context.state,
            lockFloorPlan.payoutFloorEffect,
            lockFloorPlan.accountSize,
        );
        expect(advice.ruleCappedWithdrawable).toBe(expected);
        expect(advice.ruleCappedWithdrawable).toBeGreaterThan(0);
        expect(advice.ruleCappedWithdrawable).toBeLessThanOrEqual(
            context.state.balance - postPayoutFloor - retainedCushion,
        );
    });

    it('is below the engine withdrawable on a release-floor plan, where the engine room reads the pre-payout threshold', () => {
        const context = fundedContext(releaseFloorPlan);

        const advice = payoutAdvice(rulebookRequesting(50_000), context);

        const engineRoom = context.tracker.withdrawableNow({
            minRetainedCushion: NO_CUSHION,
            plan: releaseFloorPlan,
            state: context.state,
        });
        expect(advice.documented.kind).toBe(PayoutRequestDecisionKind.Request);
        expect(engineRoom).toBe(5000);
        expect(advice.ruleCappedWithdrawable).toBe(3000);
    });

    it('nets a pending payout out of the balance before sizing the withdrawable', () => {
        const net = fundedState();
        const context = fundedContext(uncappedPlan, {
            pendingPayoutCount: 1,
            pendingPayouts: dollars(500),
            state: { ...net, balance: dollars(net.balance + 500) },
            tracker: trackerAt(net),
        });

        const advice = payoutAdvice(rulebookRequesting(50_000), context);

        expect(advice.ruleCappedWithdrawable).toBe(
            ruleCappedWithdrawable(
                uncappedPlan,
                context.tracker,
                net,
                NO_CUSHION,
            ),
        );
    });

    it('carries no withdrawable when the documented decision is not a request', () => {
        const state = fundedState({ balance: 50_000 });
        const advice = payoutAdvice(
            rulebookRequesting(50_000),
            fundedContext(uncappedPlan, { state, tracker: trackerAt(state) }),
        );

        expect(advice.documented.kind).not.toBe(
            PayoutRequestDecisionKind.Request,
        );
        expect(advice.ruleCappedWithdrawable).toBeNull();
        expect(advice.caps).toStrictEqual([]);
    });

    it('carries no withdrawable and no caps on a live account', () => {
        const builder = findLivePlanBuilder(FirmId.TopStep);
        if (!builder) throw new Error('missing TopStep live plan builder');
        const livePlan = builder(DEFAULT_RULEBOOK.live.cushionPercent);
        const state = livePlan.initialState();

        const advice = payoutAdvice(rulebookRequesting(50_000), {
            livePlan,
            paidPayoutsSinceLastLiveAccount: null,
            personalRequestOverride: null,
            personalRetainedCushion: null,
            stage: SizingStage.Live,
            state,
        });

        expect(advice.ruleCappedWithdrawable).toBeNull();
        expect(advice.caps).toStrictEqual([]);
    });
});

describe('the payout advice names the caps that bound the request (PT-105 step 7, F-128)', () => {
    it('lists nothing on a plan without a per-request cap, a balance share cap or a lifetime payout count', () => {
        const advice = payoutAdvice(
            rulebookRequesting(50_000),
            fundedContext(uncappedPlan),
        );

        expect(advice.documented.kind).toBe(PayoutRequestDecisionKind.Request);
        expect(advice.caps).toStrictEqual([]);
    });

    it('lists a per-request cap with its dollar amount and says it limits the withdrawable', () => {
        const plan = uncappedPlan.withOverrides({
            payoutRequestCap: dollars(300),
        });

        const advice = payoutAdvice(
            rulebookRequesting(30_000),
            fundedContext(plan),
        );

        expect(advice.documented.kind).toBe(PayoutRequestDecisionKind.Request);
        expect(advice.caps).toStrictEqual([
            {
                amount: 300,
                kind: PayoutCapKind.RequestCap,
                limitsWithdrawable: true,
            },
        ]);
        expect(advice.ruleCappedWithdrawable).toBe(300);
    });

    it('does not mark a per-request cap that sits above the cushion room as the limiter', () => {
        const plan = uncappedPlan.withOverrides({
            payoutRequestCap: dollars(9000),
        });

        const advice = payoutAdvice(
            rulebookRequesting(50_000),
            fundedContext(plan),
        );

        expect(advice.caps).toStrictEqual([
            {
                amount: 9000,
                kind: PayoutCapKind.RequestCap,
                limitsWithdrawable: false,
            },
        ]);
    });

    it('lists a balance share cap as a dollar amount of the account profit', () => {
        const plan = uncappedPlan.withOverrides({
            payoutBalanceShareCap: fraction(0.5),
        });

        const advice = payoutAdvice(
            rulebookRequesting(50_000),
            fundedContext(plan),
        );

        expect(advice.documented.kind).toBe(PayoutRequestDecisionKind.Request);
        expect(advice.caps).toStrictEqual([
            {
                amount: 1500,
                kind: PayoutCapKind.BalanceShare,
                limitsWithdrawable: true,
                share: 0.5,
            },
        ]);
    });

    it('lists the remaining lifetime payouts', () => {
        const plan = uncappedPlan.withOverrides({ maxLifetimePayouts: 5 });
        const state = fundedState();

        const advice = payoutAdvice(
            rulebookRequesting(50_000),
            fundedContext(plan, { state, tracker: trackerAt(state, 2) }),
        );

        expect(advice.documented.kind).toBe(PayoutRequestDecisionKind.Request);
        expect(advice.caps).toStrictEqual([
            { kind: PayoutCapKind.RemainingPayouts, remaining: 3 },
        ]);
    });
});
