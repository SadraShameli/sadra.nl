import { z } from 'zod';

import {
    type AccountState,
    accountStateSchema,
    CENTS_PER_DOLLAR,
    dollars,
    type Dollars,
    DrawdownKind,
    type DrawdownState,
    effectivePayoutRequest,
    FundedCycleTracker,
    isAtOrBelowWithinCentTolerance,
    type LiveAccountState,
    LivePlan,
    minimumPayoutRequest,
    nonNegativeDollarsSchema,
    PayoutEvaluationKind,
    PayoutGate,
    PayoutRequestPolicy,
    payoutRequestSizeSchema,
    Plan,
    postPayoutThreshold,
} from '../core';
import { RulebookRule } from './DocumentedRule';
import {
    type PayoutBlockReason,
    payoutBlockReasonFromGate,
    payoutPendingBlockReason,
} from './PayoutBlockReason';
import {
    dayGateProgressOf,
    type PayoutWait,
    PayoutWaitBasis,
    poolProfitOf,
} from './PayoutReadiness';
import {
    type FirmMinimumAboveRequestNotice,
    type PayoutRequestDecision,
    PayoutRequestDecisionKind,
    PayoutRequestNotice,
    RetainedCushionBasis,
} from './PayoutRequestDecision';
import {
    HARD_RULE_2_MIN_RETAINED_CUSHION_CENTS,
    type RulebookParameters,
} from './Rulebook';
import { RuleSource } from './RuleSource';
import { SizingStage } from './SizingStage';

const MAX_SHORTFALL_SEARCH_CENTS = 100_000_000;

export interface FundedPayoutRuleContext {
    readonly paidPayoutsSinceLastLiveAccount: null | number;
    readonly pendingPayouts: Dollars;
    readonly personalRequestOverride: Dollars | null;
    readonly personalRetainedCushion: Dollars | null;
    readonly plan: Plan;
    readonly stage: SizingStage.Funded;
    readonly state: AccountState;
    readonly tracker: FundedCycleTracker;
}

export interface LivePayoutRuleContext {
    readonly livePlan: LivePlan;
    readonly paidPayoutsSinceLastLiveAccount: null | number;
    readonly personalRequestOverride: Dollars | null;
    readonly personalRetainedCushion: Dollars | null;
    readonly stage: SizingStage.Live;
    readonly state: LiveAccountState;
}

export type PayoutRuleContext = FundedPayoutRuleContext | LivePayoutRuleContext;

interface RetainedCushionResolution {
    readonly amount: Dollars;
    readonly basis: RetainedCushionBasis;
}

const paidPayoutsSinceLastLiveAccountSchema = z
    .number()
    .int()
    .nonnegative()
    .nullable();

const personalRequestOverrideSchema = payoutRequestSizeSchema
    .transform(dollars)
    .nullable();

const liveAccountStateSchema = z.looseObject({
    balance: z.number().nonnegative(),
    bestDayProfit: z.number(),
    consecutiveIdleDays: z.number(),
    peakDayCloseProfit: z.number(),
    qualifyingDays: z.number(),
    qualifyingDaysAtLastPayout: z.number(),
    startingBalance: z.number(),
    threshold: z.number(),
    thresholdLocked: z.boolean(),
    todayPnL: z.number(),
    tradingDays: z.number(),
}) satisfies z.ZodType<LiveAccountState>;

const fundedCycleTrackerSchema = z.instanceof(FundedCycleTracker);

const fundedPayoutRuleContextSchema = z.strictObject({
    paidPayoutsSinceLastLiveAccount: paidPayoutsSinceLastLiveAccountSchema,
    pendingPayouts: nonNegativeDollarsSchema,
    personalRequestOverride: personalRequestOverrideSchema,
    personalRetainedCushion: nonNegativeDollarsSchema.nullable(),
    plan: z.instanceof(Plan),
    stage: z.literal(SizingStage.Funded),
    state: accountStateSchema,
    tracker: fundedCycleTrackerSchema,
}) satisfies z.ZodType<FundedPayoutRuleContext>;

const livePayoutRuleContextSchema = z.strictObject({
    livePlan: z.instanceof(LivePlan),
    paidPayoutsSinceLastLiveAccount: paidPayoutsSinceLastLiveAccountSchema,
    personalRequestOverride: personalRequestOverrideSchema,
    personalRetainedCushion: nonNegativeDollarsSchema.nullable(),
    stage: z.literal(SizingStage.Live),
    state: liveAccountStateSchema,
}) satisfies z.ZodType<LivePayoutRuleContext>;

const payoutRuleContextSchema = z.discriminatedUnion('stage', [
    fundedPayoutRuleContextSchema,
    livePayoutRuleContextSchema,
]) satisfies z.ZodType<PayoutRuleContext>;

export class PayoutRequestRule extends RulebookRule<PayoutRuleContext> {
    constructor(rulebook: RulebookParameters) {
        super(rulebook, payoutRuleContextSchema);
    }

    private decideFunded(
        context: FundedPayoutRuleContext,
    ): PayoutRequestDecision {
        const { plan, state, tracker } = context;
        const sources = [RuleSource.PayoutSize, RuleSource.HardRule2];
        const { amount: retainedCushion, basis } = retainedCushionForStage(
            this.rulebook,
            context,
        );
        const rawRequest =
            context.personalRequestOverride ??
            this.rulebook.payout.requestCents / CENTS_PER_DOLLAR;
        const requestedAmount = effectivePayoutRequest(plan, rawRequest);
        const notice = firmMinimumNotice(
            rawRequest,
            minimumPayoutRequest(plan),
        );

        const netState =
            context.pendingPayouts > 0
                ? {
                      ...state,
                      balance: dollars(state.balance - context.pendingPayouts),
                  }
                : state;
        const evaluate = (evalState: AccountState) =>
            tracker.evaluatePayout({
                minRetainedCushion: retainedCushion,
                payoutRequestPolicy: PayoutRequestPolicy.FullRequestOnly,
                payoutRequestSize: requestedAmount,
                plan,
                state: evalState,
            });

        const evaluation = evaluate(netState);
        switch (evaluation.kind) {
            case PayoutEvaluationKind.Blocked: {
                const isPending =
                    netState !== state &&
                    evaluate(state).kind === PayoutEvaluationKind.Eligible;
                return isPending
                    ? notEligible(payoutPendingBlockReason(), sources)
                    : this.decideBlockedFunded(
                          context,
                          netState,
                          evaluation.gate,
                          retainedCushion,
                          requestedAmount,
                          sources,
                      );
            }
            case PayoutEvaluationKind.Eligible: {
                if (evaluation.keepsRetainedCushion) {
                    return {
                        kind: PayoutRequestDecisionKind.Request,
                        notice,
                        requestAmount: dollars(requestedAmount),
                        retainedCushion,
                        retainedCushionBasis: basis,
                        sources,
                    };
                }
                return this.waitOrUnreachableFunded(
                    context,
                    netState,
                    retainedCushion,
                    requestedAmount,
                    sources,
                );
            }
        }
    }

    private decideBlockedFunded(
        context: FundedPayoutRuleContext,
        netState: AccountState,
        gate: PayoutGate,
        retainedCushion: number,
        requestedAmount: number,
        sources: readonly RuleSource[],
    ): PayoutRequestDecision {
        const { plan, tracker } = context;
        switch (gate) {
            case PayoutGate.AccountConcluded:
            case PayoutGate.FundedConsistency:
            case PayoutGate.LadderExhausted:
            case PayoutGate.LifetimeDollarCapReached: {
                return notEligible(payoutBlockReasonFromGate(gate), sources);
            }
            case PayoutGate.BelowFullRequest:
            case PayoutGate.BelowMinPayoutProfit:
            case PayoutGate.BelowMinRequest:
            case PayoutGate.EarlyWithdrawalBelowFloor:
            case PayoutGate.EarlyWithdrawalBelowMinimum:
            case PayoutGate.LadderStepUnaffordable:
            case PayoutGate.NothingWithdrawable: {
                return this.waitOrUnreachableFunded(
                    context,
                    netState,
                    retainedCushion,
                    requestedAmount,
                    sources,
                );
            }
            case PayoutGate.DayGateNotMet: {
                return waitDecision(
                    dayGateWait(plan, netState, tracker),
                    sources,
                );
            }
        }
    }

    private waitOrUnreachableFunded(
        context: FundedPayoutRuleContext,
        netState: AccountState,
        retainedCushion: number,
        requestedAmount: number,
        sources: readonly RuleSource[],
    ): PayoutRequestDecision {
        const { plan, tracker } = context;
        const requiredProfit =
            tracker.payoutsIssued === 0
                ? plan.minPayoutProfit
                : (plan.minPayoutProfitPerCycle ?? dollars(0));
        const pool = poolProfitOf(plan, netState, tracker);
        if (pool < requiredProfit) {
            return waitDecision(
                {
                    basis: PayoutWaitBasis.Profit,
                    profitStillNeeded: Math.max(0, requiredProfit - pool),
                },
                sources,
            );
        }
        const isSafeAndEligibleAt = (extraProfitCents: number): boolean => {
            const hypothetical = replayFundedState(
                plan,
                netState,
                extraProfitCents / CENTS_PER_DOLLAR,
            );
            const evaluation = tracker.evaluatePayout({
                minRetainedCushion: retainedCushion,
                payoutRequestPolicy: PayoutRequestPolicy.FullRequestOnly,
                payoutRequestSize: requestedAmount,
                plan,
                state: hypothetical,
            });
            return (
                evaluation.kind === PayoutEvaluationKind.Eligible &&
                evaluation.keepsRetainedCushion
            );
        };
        const shortfallCents = searchWholeCentShortfall(isSafeAndEligibleAt);
        if (shortfallCents === null) {
            return unreachable(sources);
        }
        return waitDecision(
            {
                basis: PayoutWaitBasis.Profit,
                profitStillNeeded: shortfallCents / CENTS_PER_DOLLAR,
            },
            sources,
        );
    }

    private decideLive(context: LivePayoutRuleContext): PayoutRequestDecision {
        const sources = [
            RuleSource.PayoutSize,
            RuleSource.HardRule2,
            RuleSource.LiveSizing,
        ];
        const { livePlan, state } = context;
        if (hasUnretainableLiveLock(livePlan)) {
            return unreachable(sources);
        }
        const resolution = retainedCushionForStage(this.rulebook, context);
        const rawRequest =
            context.personalRequestOverride ??
            this.rulebook.payout.requestCents / CENTS_PER_DOLLAR;
        const requestedAmount = effectivePayoutRequest(livePlan, rawRequest);
        const notice = firmMinimumNotice(
            rawRequest,
            minimumPayoutRequest(livePlan),
        );
        const room = livePlan.withdrawableAmount(state, resolution.amount);
        if (isAtOrBelowWithinCentTolerance(requestedAmount, room)) {
            return {
                kind: PayoutRequestDecisionKind.Request,
                notice,
                requestAmount: dollars(requestedAmount),
                retainedCushion: resolution.amount,
                retainedCushionBasis: resolution.basis,
                sources,
            };
        }
        return waitDecision({ basis: PayoutWaitBasis.NoClosedForm }, sources);
    }

    decide(context: PayoutRuleContext): PayoutRequestDecision {
        const parsed = this.contextSchema.parse(context);
        switch (parsed.stage) {
            case SizingStage.Funded: {
                return this.decideFunded(parsed);
            }
            case SizingStage.Live: {
                return this.decideLive(parsed);
            }
        }
    }
}

export function retainedCushionForStage(
    rulebook: RulebookParameters,
    context: PayoutRuleContext,
): RetainedCushionResolution {
    const rulebookCushion =
        rulebook.payout.retainedCushionCents / CENTS_PER_DOLLAR;
    const personal = context.personalRetainedCushion ?? 0;
    switch (context.stage) {
        case SizingStage.Funded: {
            const hardFloor = rulebook.payout.allowBelowHardRule2
                ? 0
                : HARD_RULE_2_MIN_RETAINED_CUSHION_CENTS / CENTS_PER_DOLLAR;
            const amount = Math.max(hardFloor, rulebookCushion, personal);
            const basis =
                personal === amount && personal > 0
                    ? RetainedCushionBasis.PersonalOverride
                    : rulebookCushion === amount
                      ? RetainedCushionBasis.RulebookSize
                      : RetainedCushionBasis.HardRule2Default;
            return { amount: dollars(amount), basis };
        }
        case SizingStage.Live: {
            const oneDrawdown = context.livePlan.defaultRetainedCushion();
            const amount = Math.max(rulebookCushion, personal, oneDrawdown);
            const basis =
                oneDrawdown === amount &&
                oneDrawdown > Math.max(rulebookCushion, personal)
                    ? RetainedCushionBasis.LiveOneDrawdown
                    : personal === amount && personal > 0
                      ? RetainedCushionBasis.PersonalOverride
                      : RetainedCushionBasis.RulebookSize;
            return { amount: dollars(amount), basis };
        }
    }
}

export function ruleCappedWithdrawable(
    plan: Plan,
    tracker: FundedCycleTracker,
    state: AccountState,
    retainedCushion: number,
): Dollars {
    const engineRoom = tracker.withdrawableNow({
        minRetainedCushion: retainedCushion,
        plan,
        state,
    });
    const correctThreshold = postPayoutThreshold(
        plan.fundedDrawdown,
        state,
        plan.payoutFloorEffect,
        plan.accountSize,
    );
    const correctFloor = plan.payoutBalanceFloor(
        { ...state, threshold: correctThreshold },
        retainedCushion,
    );
    const correctRoom = state.balance - correctFloor;
    return dollars(Math.max(0, Math.min(engineRoom, correctRoom)));
}

function dayGateWait(
    plan: Plan,
    state: AccountState,
    tracker: FundedCycleTracker,
): PayoutWait {
    return dayGateProgressOf(plan, state, tracker).wait;
}

function firmMinimumNotice(
    requestedAmount: number,
    effectiveAmount: number,
): FirmMinimumAboveRequestNotice | null {
    return effectiveAmount > requestedAmount
        ? {
              kind: PayoutRequestNotice.FirmMinimumAboveRequest,
              minimumRequestAmount: dollars(effectiveAmount),
              requestedAmount: dollars(requestedAmount),
          }
        : null;
}

function hasUnretainableLiveLock(livePlan: LivePlan): boolean {
    const { liveDrawdown } = livePlan;
    return (
        liveDrawdown !== null &&
        liveDrawdown.kind !== DrawdownKind.Static &&
        liveDrawdown.lock === undefined
    );
}

function notEligible(
    reason: PayoutBlockReason,
    sources: readonly RuleSource[],
): PayoutRequestDecision {
    return { kind: PayoutRequestDecisionKind.NotEligible, reason, sources };
}

function replayFundedState(
    plan: Plan,
    state: AccountState,
    extraProfit: number,
): AccountState {
    if (extraProfit === 0 || state.thresholdLocked) {
        return { ...state, balance: dollars(state.balance + extraProfit) };
    }
    const copy: DrawdownState = {
        balance: dollars(state.balance + extraProfit),
        startingBalance: state.startingBalance,
        threshold: state.threshold,
        thresholdLocked: state.thresholdLocked,
    };
    plan.fundedDrawdown.onDayClose(copy);
    return {
        ...state,
        balance: copy.balance,
        threshold: copy.threshold,
        thresholdLocked: copy.thresholdLocked,
    };
}

function searchWholeCentShortfall(
    isSatisfiedAt: (extraProfitCents: number) => boolean,
): null | number {
    if (isSatisfiedAt(0)) return 0;
    let lo = 0;
    let hi = 1;
    while (!isSatisfiedAt(hi)) {
        if (hi >= MAX_SHORTFALL_SEARCH_CENTS) return null;
        lo = hi;
        hi = Math.min(hi * 2, MAX_SHORTFALL_SEARCH_CENTS);
        if (lo === hi) return null;
    }
    while (hi - lo > 1) {
        const mid = Math.floor((lo + hi) / 2);
        if (isSatisfiedAt(mid)) {
            hi = mid;
        } else {
            lo = mid;
        }
    }
    return hi;
}

function unreachable(sources: readonly RuleSource[]): PayoutRequestDecision {
    return { kind: PayoutRequestDecisionKind.Unreachable, sources };
}

function waitDecision(
    wait: PayoutWait,
    sources: readonly RuleSource[],
): PayoutRequestDecision {
    return { kind: PayoutRequestDecisionKind.Wait, sources, wait };
}
