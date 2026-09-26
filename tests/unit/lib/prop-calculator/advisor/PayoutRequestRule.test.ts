import { describe, expect, it, vi } from 'vitest';
import { ZodError } from 'zod';

import {
    type AccountState,
    AlphaFuturesVariant,
    ApexVariant,
    dollars,
    EodTrailingDrawdown,
    findFirm,
    findLivePlanBuilder,
    FirmId,
    fraction,
    type FundedCycleTracker,
    FundedNextVariant,
    LivePlan,
    MffuVariant,
    newFundedCycleTracker,
    PayoutFloorEffect,
    type Plan,
    type PlanId,
    serializePlanId,
    TOPSTEP_LIVE_DEFAULT_CUSHION_PERCENT,
    TopStepVariant,
    TradeifyVariant,
} from '~/lib/prop-calculator';
import {
    DEFAULT_RULEBOOK,
    type FundedPayoutRuleContext,
    type LivePayoutRuleContext,
    PayoutBlockReasonKind,
    PayoutRequestDecisionKind,
    PayoutRequestNotice,
    PayoutRequestRule,
    PayoutWaitBasis,
    RetainedCushionBasis,
    retainedCushionForStage,
    type RulebookParameters,
    RulebookRule,
    ruleCappedWithdrawable,
    SizingStage,
} from '~/lib/prop-calculator/advisor';

function baseFundedContext(
    plan: Plan,
    tracker: FundedCycleTracker,
    state: AccountState,
    overrides: Partial<FundedPayoutRuleContext> = {},
): FundedPayoutRuleContext {
    return {
        paidPayoutsSinceLastLiveAccount: null,
        pendingPayouts: dollars(0),
        personalRequestOverride: null,
        personalRetainedCushion: null,
        plan,
        stage: SizingStage.Funded,
        state,
        tracker,
        ...overrides,
    };
}

function fundedState(overrides: Partial<AccountState>): AccountState {
    return {
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
        ...overrides,
    };
}

function registryPlan(id: PlanId): Plan {
    const found = findFirm(id.firm)?.findPlan(id);
    if (!found) throw new Error(`${serializePlanId(id)} missing`);
    return found;
}

function rulebookWith(
    overrides: Partial<RulebookParameters['payout']>,
): RulebookParameters {
    return {
        ...DEFAULT_RULEBOOK,
        payout: { ...DEFAULT_RULEBOOK.payout, ...overrides },
    };
}

function trackerAt(
    state: AccountState,
    qualifyingDaysAtLastPayout: number,
): FundedCycleTracker {
    const tracker = newFundedCycleTracker({
        ...state,
        balance: state.startingBalance,
        qualifyingDays: qualifyingDaysAtLastPayout,
    });
    return tracker;
}

const TOPSTEP_STANDARD_ID: PlanId = {
    accountSize: 50_000,
    firm: FirmId.TopStep,
    variant: TopStepVariant.StandardStandard,
};

const MFF_PRO_ID: PlanId = {
    accountSize: 50_000,
    firm: FirmId.Mffu,
    variant: MffuVariant.Pro,
};

const APEX_EOD_ID: PlanId = {
    accountSize: 50_000,
    firm: FirmId.Apex,
    variant: ApexVariant.Eod,
};

describe('PayoutRequestRule: class shape', () => {
    it('extends the generic RulebookRule base, not DocumentedRule', () => {
        const rule = new PayoutRequestRule(DEFAULT_RULEBOOK);
        expect(rule).toBeInstanceOf(RulebookRule);
    });
});

describe('PayoutRequestRule: context schema', () => {
    const rule = new PayoutRequestRule(DEFAULT_RULEBOOK);
    const plan = registryPlan(TOPSTEP_STANDARD_ID);
    const state = fundedState({ balance: 50_000, threshold: 48_000 });
    const tracker = trackerAt(state, 0);

    it('rejects an unknown extra key', () => {
        const context = {
            ...baseFundedContext(plan, tracker, state),
            extra: 'nope',
        };
        expect(() => rule.decide(context as never)).toThrow();
    });

    it('rejects a negative balance', () => {
        const context = baseFundedContext(plan, tracker, {
            ...state,
            balance: -1,
        });
        expect(() => rule.decide(context)).toThrow();
    });

    it('rejects a non-positive personalRequestOverride at the schema boundary with a ZodError, never a bare throw from effectivePayoutRequest', () => {
        const negativeContext = baseFundedContext(plan, tracker, state, {
            personalRequestOverride: dollars(-100),
        });
        expect(() => rule.decide(negativeContext)).toThrow(ZodError);

        const zeroContext = baseFundedContext(plan, tracker, state, {
            personalRequestOverride: dollars(0),
        });
        expect(() => rule.decide(zeroContext)).toThrow(ZodError);
    });

    it('rejects a tracker-shaped object missing fields this file actually reads (payoutsIssued, dayGateProgress)', () => {
        const incompleteTracker = {
            evaluatePayout: () => {
                throw new Error('should never be called');
            },
            withdrawableNow: () => 0,
        };
        const context = baseFundedContext(
            plan,
            incompleteTracker as unknown as FundedCycleTracker,
            state,
        );
        expect(() => rule.decide(context)).toThrow(ZodError);
    });

    it('rejects a fully tracker-shaped plain object that is not a real FundedCycleTracker instance (PT-46b)', () => {
        const duckTypedTracker = {
            dayGateProgress: () => 0,
            evaluatePayout: () => {
                throw new Error('should never be called');
            },
            lastPayoutBalance: 0,
            payoutsIssued: 0,
            sessionDaysSinceAnchor: null,
            withdrawableNow: () => 0,
        };
        const context = baseFundedContext(
            plan,
            duckTypedTracker as unknown as FundedCycleTracker,
            state,
        );
        expect(() => rule.decide(context)).toThrow(ZodError);
    });

    it('rejects a state missing a field this file actually reads (threshold)', () => {
        const incompleteState = { ...state } as Partial<AccountState>;
        delete incompleteState.threshold;
        const context = baseFundedContext(
            plan,
            tracker,
            incompleteState as AccountState,
        );
        expect(() => rule.decide(context)).toThrow(ZodError);
    });
});

describe('PayoutRequestRule funded: LockAtPlanFloor forces the lock on any payout (F-105a)', () => {
    const basePlan = registryPlan(TOPSTEP_STANDARD_ID).withOverrides({
        consistency: null,
        fundedConsistency: { kind: 'set', rule: null },
        fundedDrawdown: new EodTrailingDrawdown({
            amount: dollars(2000),
            lock: { atProfit: dollars(2000), lockedThreshold: () => 50_000 },
        }),
        maxLifetimePayouts: undefined,
        minDaysAfterPassForPayout: 0,
        minPayoutProfit: dollars(0),
        minPayoutProfitPerCycle: dollars(0),
        payoutBalanceShareCap: undefined,
        payoutFloorEffect: PayoutFloorEffect.LockAtPlanFloor,
        payoutLadder: null,
        payoutRequestCap: undefined,
    });
    const rulebook = rulebookWith({
        allowBelowHardRule2: true,
        requestCents: 50_000,
        retainedCushionCents: 0,
    });
    const rule = new PayoutRequestRule(rulebook);

    function contextAt(balance: number): FundedPayoutRuleContext {
        const state = fundedState({
            balance,
            qualifyingDays: 0,
            threshold: dollars(balance - 2000),
        });
        const tracker = trackerAt(state, 0);
        return baseFundedContext(basePlan, tracker, state, {
            personalRetainedCushion: dollars(1000),
        });
    }

    it('allows the request at exactly the profit that survives the forced lock', () => {
        const decision = rule.decide(contextAt(51_500));
        expect(decision.kind).toBe(PayoutRequestDecisionKind.Request);
    });

    it('refuses one cent below that profit and reports the whole-cent shortfall', () => {
        const decision = rule.decide(contextAt(51_499.99));
        expect(decision.kind).toBe(PayoutRequestDecisionKind.Wait);
        if (decision.kind !== PayoutRequestDecisionKind.Wait) return;
        expect(decision.wait).toEqual({
            basis: PayoutWaitBasis.Profit,
            profitStillNeeded: 0.01,
        });
    });

    it('never mutates the state or tracker while searching', () => {
        const context = contextAt(51_499.99);
        const stateBefore = { ...context.state };
        const trackerBefore = context.tracker.payoutsIssued;
        rule.decide(context);
        expect(context.state).toEqual(stateBefore);
        expect(context.tracker.payoutsIssued).toBe(trackerBefore);
    });
});

describe('PayoutRequestRule funded: MoveToLockedFloor once already locked (F-105b)', () => {
    const plan = registryPlan(MFF_PRO_ID);
    const rulebook = rulebookWith({ requestCents: 100_000 });
    const rule = new PayoutRequestRule(rulebook);

    function lockedContext(balance: number): FundedPayoutRuleContext {
        const state = fundedState({
            balance,
            qualifyingDays: 20,
            threshold: 50_100,
            thresholdLocked: true,
        });
        const tracker = trackerAt(state, 0);
        tracker.payoutsIssued = 1;
        tracker.restoreCalendarDayGateProgress(20);
        return baseFundedContext(plan, tracker, state, {
            personalRetainedCushion: dollars(2000),
        });
    }

    it('allows a request that leaves exactly the cushion above the locked $50,100 floor', () => {
        const decision = rule.decide(lockedContext(53_100));
        expect(decision.kind).toBe(PayoutRequestDecisionKind.Request);
    });

    it('waits when the locked floor leaves less than the cushion', () => {
        const decision = rule.decide(lockedContext(51_000));
        expect(decision.kind).toBe(PayoutRequestDecisionKind.Wait);
    });
});

function topStepReleaseFloorState(): AccountState {
    return fundedState({
        balance: 51_200,
        qualifyingDays: 5,
        threshold: 49_200,
    });
}

describe('PayoutRequestRule funded: ReleaseFloor advice-path fix, TopStep (F-105c)', () => {
    const plan = registryPlan(TOPSTEP_STANDARD_ID);
    expect(plan.payoutFloorEffect).toBe(PayoutFloorEffect.ReleaseFloor);
    expect(plan.accountSize).toBe(50_000);

    it('ruleCappedWithdrawable is $200, not the engine withdrawableNow of $600', () => {
        const s = topStepReleaseFloorState();
        const tracker = trackerAt(s, 0);
        const engineRoom = tracker.withdrawableNow({
            minRetainedCushion: 1000,
            plan,
            state: s,
        });
        expect(engineRoom).toBe(600);
        expect(ruleCappedWithdrawable(plan, tracker, s, 1000)).toBe(200);
    });

    it('waits (never requests the unsafe $500) with a $1,000 cushion via allowBelowHardRule2', () => {
        const rulebook = rulebookWith({
            allowBelowHardRule2: true,
            requestCents: 50_000,
            retainedCushionCents: 0,
        });
        const rule = new PayoutRequestRule(rulebook);
        const s = topStepReleaseFloorState();
        const tracker = trackerAt(s, 0);
        const decision = rule.decide(
            baseFundedContext(plan, tracker, s, {
                personalRetainedCushion: dollars(1000),
            }),
        );
        expect(decision.kind).toBe(PayoutRequestDecisionKind.Wait);
        if (decision.kind !== PayoutRequestDecisionKind.Wait) return;
        expect(decision.wait).toEqual({
            basis: PayoutWaitBasis.Profit,
            profitStillNeeded: 300,
        });
    });

    it('waits with the default $2,000 Hard Rule 2 cushion before the lock', () => {
        const rulebook = rulebookWith({ requestCents: 50_000 });
        const rule = new PayoutRequestRule(rulebook);
        const s = topStepReleaseFloorState();
        const tracker = trackerAt(s, 0);
        const decision = rule.decide(baseFundedContext(plan, tracker, s));
        expect(decision.kind).toBe(PayoutRequestDecisionKind.Wait);
        if (decision.kind !== PayoutRequestDecisionKind.Wait) return;
        expect(decision.wait).toEqual({
            basis: PayoutWaitBasis.Profit,
            profitStillNeeded: 1300,
        });
    });

    it('nets pendingPayouts into the whole-cent shortfall search, not just the eligibility check', () => {
        const rulebook = rulebookWith({
            allowBelowHardRule2: true,
            requestCents: 50_000,
            retainedCushionCents: 0,
        });
        const rule = new PayoutRequestRule(rulebook);
        const s = topStepReleaseFloorState();

        function profitStillNeededFor(pendingPayouts: number): number {
            const tracker = trackerAt(s, 0);
            const decision = rule.decide(
                baseFundedContext(plan, tracker, s, {
                    pendingPayouts: dollars(pendingPayouts),
                    personalRetainedCushion: dollars(1000),
                }),
            );
            expect(decision.kind).toBe(PayoutRequestDecisionKind.Wait);
            if (decision.kind !== PayoutRequestDecisionKind.Wait) {
                throw new Error('expected a Wait decision');
            }
            expect(decision.wait.basis).toBe(PayoutWaitBasis.Profit);
            if (decision.wait.basis !== PayoutWaitBasis.Profit) {
                throw new Error('expected a Profit wait basis');
            }
            return decision.wait.profitStillNeeded;
        }

        const withNoPending = profitStillNeededFor(0);
        const withPending = profitStillNeededFor(100);
        expect(withNoPending).toBe(300);
        expect(withPending).toBe(withNoPending + 100);
    });
});

describe('PayoutRequestRule funded: PayoutFloorEffect.None and Unreachable (F-105d)', () => {
    it('is Unreachable when the cushion can never fit under a trailing floor with no lock', () => {
        const plan = registryPlan(TOPSTEP_STANDARD_ID).withOverrides({
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
            payoutRequestCap: undefined,
        });
        const rulebook = rulebookWith({
            allowBelowHardRule2: true,
            requestCents: 50_000,
        });
        const rule = new PayoutRequestRule(rulebook);
        const state = fundedState({
            balance: 50_500,
            qualifyingDays: 0,
            threshold: 48_500,
        });
        const tracker = trackerAt(state, 0);
        const decision = rule.decide(
            baseFundedContext(plan, tracker, state, {
                personalRetainedCushion: dollars(2500),
            }),
        );
        expect(decision.kind).toBe(PayoutRequestDecisionKind.Unreachable);
    });
});

describe('PayoutRequestRule funded: payoutBuffer binds above threshold + cushion (F-105e)', () => {
    it('waits when the buffer requires more than the threshold and cushion alone', () => {
        const apex = registryPlan(APEX_EOD_ID).withOverrides({
            consistency: null,
            fundedConsistency: { kind: 'set', rule: null },
            maxLifetimePayouts: undefined,
            minDaysAfterPassForPayout: 0,
            minPayoutProfit: dollars(0),
            minPayoutProfitPerCycle: dollars(0),
            payoutLadder: null,
            payoutRequestCap: undefined,
        });
        expect(apex.payoutBuffer).not.toBeNull();
        const rulebook = rulebookWith({
            allowBelowHardRule2: true,
            requestCents: 50_000,
        });
        const rule = new PayoutRequestRule(rulebook);
        const state = fundedState({
            balance: 51_600,
            qualifyingDays: 0,
            threshold: 48_100,
        });
        const tracker = trackerAt(state, 0);
        const decision = rule.decide(
            baseFundedContext(apex, tracker, state, {
                personalRetainedCushion: dollars(0),
            }),
        );
        expect(decision.kind).toBe(PayoutRequestDecisionKind.Wait);
    });
});

describe('PayoutRequestRule funded: plan minimum above $500 (F-105f)', () => {
    const cases: { readonly id: PlanId; readonly minimum: number }[] = [
        { id: MFF_PRO_ID, minimum: 1000 },
        {
            id: {
                accountSize: 50_000,
                firm: FirmId.Tradeify,
                variant: TradeifyVariant.Lightning,
            },
            minimum: 1000,
        },
        {
            id: {
                accountSize: 50_000,
                firm: FirmId.AlphaFutures,
                variant: AlphaFuturesVariant.Advanced,
            },
            minimum: 1000,
        },
        {
            id: {
                accountSize: 50_000,
                firm: FirmId.FundedNext,
                variant: FundedNextVariant.Fnl003,
            },
            minimum: 800,
        },
    ];

    for (const { id, minimum } of cases) {
        it(`${serializePlanId(id)}: raises the $500 default to the $${minimum} minimum with a notice`, () => {
            const plan = registryPlan(id);
            expect(plan.minPayoutRequest >= 800 || minimum >= 800).toBe(true);
            const rulebook = rulebookWith({
                allowBelowHardRule2: true,
                requestCents: 50_000,
            });
            const rule = new PayoutRequestRule(rulebook);
            const state = fundedState({
                balance: plan.accountSize + minimum + 5000,
                qualifyingDays: 40,
                threshold: plan.accountSize - 100,
            });
            const tracker = trackerAt(state, 0);
            tracker.restoreCalendarDayGateProgress(40);
            const decision = rule.decide(
                baseFundedContext(plan, tracker, state, {
                    personalRetainedCushion: dollars(0),
                }),
            );
            expect(decision.kind).toBe(PayoutRequestDecisionKind.Request);
            if (decision.kind !== PayoutRequestDecisionKind.Request) return;
            expect(decision.requestAmount).toBe(minimum);
            expect(decision.notice).toEqual({
                kind: PayoutRequestNotice.FirmMinimumAboveRequest,
                minimumRequestAmount: minimum,
                requestedAmount: 500,
            });
        });
    }
});

describe('PayoutRequestRule funded: firm gates (F-105g)', () => {
    it('gives NotEligible for a consistency violation, never a wait', () => {
        const plan = registryPlan(APEX_EOD_ID);
        const rulebook = rulebookWith({
            allowBelowHardRule2: true,
            requestCents: 50_000,
        });
        const rule = new PayoutRequestRule(rulebook);
        const state = fundedState({
            balance: plan.accountSize + 1000,
            qualifyingDays: 40,
            threshold: plan.accountSize - plan.fundedDrawdown.amount,
        });
        const tracker = trackerAt(state, 0);
        tracker.cycleBestDayProfit = 800;
        const decision = rule.decide(
            baseFundedContext(plan, tracker, state, {
                personalRetainedCushion: dollars(0),
            }),
        );
        expect(decision.kind).toBe(PayoutRequestDecisionKind.NotEligible);
        if (decision.kind !== PayoutRequestDecisionKind.NotEligible) return;
        expect(decision.reason).toEqual({
            gate: 'funded-consistency',
            kind: PayoutBlockReasonKind.Gate,
        });
    });

    it('gives NotEligible for AccountConcluded with no amount', () => {
        const plan = registryPlan(APEX_EOD_ID).withOverrides({
            consistency: null,
            fundedConsistency: { kind: 'set', rule: null },
        });
        const rulebook = rulebookWith({ requestCents: 50_000 });
        const rule = new PayoutRequestRule(rulebook);
        const state = fundedState({
            balance: plan.accountSize + 5000,
            qualifyingDays: 40,
        });
        const tracker = trackerAt(state, 0);
        tracker.payoutsIssued = plan.maxLifetimePayouts ?? 6;
        const decision = rule.decide(baseFundedContext(plan, tracker, state));
        expect(decision.kind).toBe(PayoutRequestDecisionKind.NotEligible);
        if (decision.kind !== PayoutRequestDecisionKind.NotEligible) return;
        expect(decision.reason.kind).toBe(PayoutBlockReasonKind.Gate);
    });

    it('gives NotEligible for LadderExhausted', () => {
        const plan = registryPlan(APEX_EOD_ID).withOverrides({
            consistency: null,
            fundedConsistency: { kind: 'set', rule: null },
            maxLifetimePayouts: undefined,
        });
        const rulebook = rulebookWith({ requestCents: 50_000 });
        const rule = new PayoutRequestRule(rulebook);
        const state = fundedState({
            balance: plan.accountSize + 5000,
            qualifyingDays: 40,
        });
        const tracker = trackerAt(state, 0);
        tracker.payoutsIssued = plan.payoutLadder?.steps.length ?? 6;
        const decision = rule.decide(baseFundedContext(plan, tracker, state));
        expect(decision.kind).toBe(PayoutRequestDecisionKind.NotEligible);
        if (decision.kind !== PayoutRequestDecisionKind.NotEligible) return;
        expect(decision.reason).toEqual({
            gate: 'ladder-exhausted',
            kind: PayoutBlockReasonKind.Gate,
        });
    });

    it('gives NotEligible with PayoutPending when a pending payout is what blocks it', () => {
        const plan = registryPlan(MFF_PRO_ID);
        const rulebook = rulebookWith({ requestCents: 50_000 });
        const rule = new PayoutRequestRule(rulebook);
        const state = fundedState({
            balance: 54_000,
            qualifyingDays: 20,
            threshold: 50_100,
            thresholdLocked: true,
        });
        const tracker = trackerAt(state, 0);
        tracker.restoreCalendarDayGateProgress(20);
        const decision = rule.decide(
            baseFundedContext(plan, tracker, state, {
                pendingPayouts: dollars(1500),
            }),
        );
        expect(decision.kind).toBe(PayoutRequestDecisionKind.NotEligible);
        if (decision.kind !== PayoutRequestDecisionKind.NotEligible) return;
        expect(decision.reason).toEqual({ kind: PayoutBlockReasonKind.PayoutPending });
    });

    it('waits in days for the day gate', () => {
        const plan = registryPlan(MFF_PRO_ID);
        const rulebook = rulebookWith({ requestCents: 50_000 });
        const rule = new PayoutRequestRule(rulebook);
        const state = fundedState({
            balance: 53_000,
            qualifyingDays: 1,
            threshold: 50_100,
            thresholdLocked: true,
        });
        const tracker = trackerAt(state, 0);
        const decision = rule.decide(baseFundedContext(plan, tracker, state));
        expect(decision.kind).toBe(PayoutRequestDecisionKind.Wait);
        if (decision.kind !== PayoutRequestDecisionKind.Wait) return;
        expect(decision.wait.basis).toBe(PayoutWaitBasis.CalendarDays);
    });

    it('waits in dollars for the minimum payout profit gate', () => {
        const plan = registryPlan(MFF_PRO_ID);
        const rulebook = rulebookWith({ requestCents: 50_000 });
        const rule = new PayoutRequestRule(rulebook);
        const state = fundedState({
            balance: 51_500,
            qualifyingDays: 20,
            threshold: 50_100,
            thresholdLocked: true,
        });
        const tracker = trackerAt(state, 0);
        tracker.restoreCalendarDayGateProgress(20);
        const decision = rule.decide(baseFundedContext(plan, tracker, state));
        expect(decision.kind).toBe(PayoutRequestDecisionKind.Wait);
        if (decision.kind !== PayoutRequestDecisionKind.Wait) return;
        expect(decision.wait.basis).toBe(PayoutWaitBasis.Profit);
    });

    it('waits for the profit needed under a share cap, never NotEligible', () => {
        const plan = registryPlan(TOPSTEP_STANDARD_ID).withOverrides({
            payoutFloorEffect: PayoutFloorEffect.None,
        });
        const rulebook = rulebookWith({
            allowBelowHardRule2: true,
            requestCents: 50_000,
            retainedCushionCents: 0,
        });
        const rule = new PayoutRequestRule(rulebook);
        const state = fundedState({
            balance: 50_900,
            qualifyingDays: 5,
            threshold: 48_900,
        });
        const tracker = trackerAt(state, 0);
        const decision = rule.decide(
            baseFundedContext(plan, tracker, state, {
                personalRetainedCushion: dollars(0),
            }),
        );
        expect(decision.kind).toBe(PayoutRequestDecisionKind.Wait);
        if (decision.kind !== PayoutRequestDecisionKind.Wait) return;
        expect(decision.wait).toEqual({
            basis: PayoutWaitBasis.Profit,
            profitStillNeeded: 100,
        });
    });
});

describe('PayoutRequestRule funded: MFF Pro one-time early withdrawal still enforces the cushion (F-105h)', () => {
    it('never uses closeoutCredit and still enforces the cushion above $50,100', () => {
        const plan = registryPlan(MFF_PRO_ID).withOverrides({
            oneTimeEarlyWithdrawal: { maxProfitShare: fraction(1), minRequest: dollars(1) },
            takesOneTimeEarlyWithdrawal: true,
        });
        const rulebook = rulebookWith({ requestCents: 100_000 });
        const rule = new PayoutRequestRule(rulebook);
        const state = fundedState({
            balance: 50_600,
            qualifyingDays: 20,
            threshold: 50_100,
            thresholdLocked: true,
        });
        const tracker = trackerAt(state, 0);
        tracker.restoreCalendarDayGateProgress(20);
        const closeoutSpy = vi.spyOn(tracker, 'closeoutCredit');
        const decision = rule.decide(
            baseFundedContext(plan, tracker, state, {
                personalRetainedCushion: dollars(2000),
            }),
        );
        expect(closeoutSpy).not.toHaveBeenCalled();
        expect(decision.kind).toBe(PayoutRequestDecisionKind.Wait);
    });
});

describe('retainedCushionForStage (F-105i)', () => {
    it('funded: floors at $2,000 (Hard Rule 2) even below a hand-built rulebook value', () => {
        const plan = registryPlan(TOPSTEP_STANDARD_ID);
        const rulebook = rulebookWith({ retainedCushionCents: 10_000 });
        const context = baseFundedContext(
            plan,
            trackerAt(fundedState({}), 0),
            fundedState({}),
        );
        const resolved = retainedCushionForStage(rulebook, context);
        expect(resolved.amount).toBe(2000);
        expect(resolved.basis).toBe(RetainedCushionBasis.HardRule2Default);
    });

    it('funded: allowBelowHardRule2 lets a hand-built rulebook value stand', () => {
        const plan = registryPlan(TOPSTEP_STANDARD_ID);
        const rulebook = rulebookWith({
            allowBelowHardRule2: true,
            retainedCushionCents: 10_000,
        });
        const context = baseFundedContext(
            plan,
            trackerAt(fundedState({}), 0),
            fundedState({}),
        );
        const resolved = retainedCushionForStage(rulebook, context);
        expect(resolved.amount).toBe(100);
        expect(resolved.basis).toBe(RetainedCushionBasis.RulebookSize);
    });

    it('funded: a personal retained cushion only tightens, never loosens', () => {
        const plan = registryPlan(TOPSTEP_STANDARD_ID);
        const rulebook = rulebookWith({});
        const context = baseFundedContext(
            plan,
            trackerAt(fundedState({}), 0),
            fundedState({}),
            { personalRetainedCushion: dollars(5000) },
        );
        const resolved = retainedCushionForStage(rulebook, context);
        expect(resolved.amount).toBe(5000);
        expect(resolved.basis).toBe(RetainedCushionBasis.PersonalOverride);
    });

    it('live: uses the larger of the rulebook cushion and one full live drawdown (D4)', () => {
        const builder = findLivePlanBuilder(FirmId.TopStep);
        if (!builder) throw new Error('missing TopStep live plan builder');
        const livePlan = builder(TOPSTEP_LIVE_DEFAULT_CUSHION_PERCENT);
        const rulebook = rulebookWith({});
        const context: LivePayoutRuleContext = {
            livePlan,
            paidPayoutsSinceLastLiveAccount: null,
            personalRequestOverride: null,
            personalRetainedCushion: null,
            stage: SizingStage.Live,
            state: livePlan.initialState(),
        };
        const resolved = retainedCushionForStage(rulebook, context);
        expect(resolved.amount).toBe(livePlan.defaultRetainedCushion());
        expect(resolved.basis).toBe(RetainedCushionBasis.LiveOneDrawdown);
    });

    it('live: a trailing plan without a lock reports Unreachable, not a throw', () => {
        const trailingNoLock = new LivePlan({
            cushionPercent: { postLock: fraction(0.1), preLock: fraction(0.05) },
            label: 'synthetic trailing, no lock',
            liveDailyLossLimit: null,
            liveDrawdown: new EodTrailingDrawdown({ amount: dollars(2000) }),
            payoutTiers: [{ thresholdProfit: dollars(0), traderShare: fraction(0.9) }],
            requiresLockForWithdrawal: false,
        });
        const rulebook = rulebookWith({});
        const rule = new PayoutRequestRule(rulebook);
        const context: LivePayoutRuleContext = {
            livePlan: trailingNoLock,
            paidPayoutsSinceLastLiveAccount: null,
            personalRequestOverride: null,
            personalRetainedCushion: null,
            stage: SizingStage.Live,
            state: trailingNoLock.initialState(),
        };
        expect(() => trailingNoLock.defaultRetainedCushion()).toThrow();
        const decision = rule.decide(context);
        expect(decision.kind).toBe(PayoutRequestDecisionKind.Unreachable);
    });
});

describe('PayoutRequestRule live: request and wait (F-105i)', () => {
    it('requests when the live room covers the effective request', () => {
        const builder = findLivePlanBuilder(FirmId.TopStep);
        if (!builder) throw new Error('missing TopStep live plan builder');
        const livePlan = builder(TOPSTEP_LIVE_DEFAULT_CUSHION_PERCENT);
        const rulebook = rulebookWith({ requestCents: 50_000 });
        const rule = new PayoutRequestRule(rulebook);
        const state = livePlan.initialState();
        state.qualifyingDays = 30;
        state.balance = state.startingBalance + livePlan.defaultRetainedCushion() + 1000;
        const decision = rule.decide({
            livePlan,
            paidPayoutsSinceLastLiveAccount: null,
            personalRequestOverride: null,
            personalRetainedCushion: null,
            stage: SizingStage.Live,
            state,
        });
        expect(decision.kind).toBe(PayoutRequestDecisionKind.Request);
    });

    it('waits with NoClosedForm when the live room is short', () => {
        const builder = findLivePlanBuilder(FirmId.TopStep);
        if (!builder) throw new Error('missing TopStep live plan builder');
        const livePlan = builder(TOPSTEP_LIVE_DEFAULT_CUSHION_PERCENT);
        const rulebook = rulebookWith({ requestCents: 50_000 });
        const rule = new PayoutRequestRule(rulebook);
        const state = livePlan.initialState();
        const decision = rule.decide({
            livePlan,
            paidPayoutsSinceLastLiveAccount: null,
            personalRequestOverride: null,
            personalRetainedCushion: null,
            stage: SizingStage.Live,
            state,
        });
        expect(decision.kind).toBe(PayoutRequestDecisionKind.Wait);
        if (decision.kind !== PayoutRequestDecisionKind.Wait) return;
        expect(decision.wait).toEqual({ basis: PayoutWaitBasis.NoClosedForm });
    });
});

describe('PayoutRequestRule: invariants (F-105j)', () => {
    it('never requests less than the effective request', () => {
        const plan = registryPlan(MFF_PRO_ID);
        const rulebook = rulebookWith({ requestCents: 50_000 });
        const rule = new PayoutRequestRule(rulebook);
        const state = fundedState({
            balance: 55_000,
            qualifyingDays: 20,
            threshold: 50_100,
            thresholdLocked: true,
        });
        const tracker = trackerAt(state, 0);
        tracker.restoreCalendarDayGateProgress(20);
        const decision = rule.decide(baseFundedContext(plan, tracker, state));
        expect(decision.kind).toBe(PayoutRequestDecisionKind.Request);
        if (decision.kind !== PayoutRequestDecisionKind.Request) return;
        expect(decision.requestAmount).toBeGreaterThanOrEqual(500);
    });

    it('ruleCappedWithdrawable never exceeds balance minus the correct post-payout floor minus the cushion', () => {
        const plan = registryPlan(TOPSTEP_STANDARD_ID);
        const state = fundedState({
            balance: 51_200,
            qualifyingDays: 5,
            threshold: 49_200,
        });
        const tracker = trackerAt(state, 0);
        const capped = ruleCappedWithdrawable(plan, tracker, state, 1000);
        expect(capped).toBeLessThanOrEqual(51_200 - 50_000 - 1000 + 1e-6);
    });

    it('sources always include PayoutSize and HardRule2, plus LiveSizing for live', () => {
        const plan = registryPlan(TOPSTEP_STANDARD_ID);
        const rulebook = rulebookWith({ requestCents: 50_000 });
        const rule = new PayoutRequestRule(rulebook);
        const state = fundedState({
            balance: 53_000,
            qualifyingDays: 5,
            threshold: 51_000,
        });
        const tracker = trackerAt(state, 0);
        const decision = rule.decide(baseFundedContext(plan, tracker, state));
        expect(decision.sources).toContain('PAYOUT SIZING');
        expect(decision.sources).toContain('Hard Rule 2');

        const builder = findLivePlanBuilder(FirmId.TopStep);
        if (!builder) throw new Error('missing TopStep live plan builder');
        const livePlan = builder(TOPSTEP_LIVE_DEFAULT_CUSHION_PERCENT);
        const liveDecision = rule.decide({
            livePlan,
            paidPayoutsSinceLastLiveAccount: null,
            personalRequestOverride: null,
            personalRetainedCushion: null,
            stage: SizingStage.Live,
            state: livePlan.initialState(),
        });
        expect(liveDecision.sources).toContain('Live account (NOT replaceable)');
    });
});
