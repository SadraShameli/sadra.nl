import {
    type AccountState,
    CALENDAR_DAYS_PER_WEEK,
    dollars,
    effectivePayoutRequest,
    type FundedCycleTracker,
    isAtOrBelowWithinCentTolerance,
    ladderStepLookup,
    minimumPayoutRequest,
    PayoutDayGateBasis,
    type PayoutEvaluation,
    PayoutEvaluationKind,
    PayoutGate,
    payoutPoolProfit,
    payoutReferenceThreshold,
    PayoutRequestPolicy,
    perRequestCeiling,
    type Plan,
    requiredDayGateDays,
    SESSION_DAYS_PER_CALENDAR_WEEK,
    sessionDaysForCalendarDays,
} from '~/lib/prop-calculator/core';

import {
    type PayoutBlockReason,
    payoutBlockReasonFromGate,
    payoutPendingBlockReason,
    wouldTriggerLiveBlockReason,
} from './PayoutBlockReason';

export const DEFAULT_PAYOUT_REQUEST_SIZE = dollars(500);

export enum PayoutPathStepUnit {
    Count = 'count',
    Days = 'days',
    Dollars = 'dollars',
    None = 'none',
}

export enum PayoutReadinessKind {
    Blocked = 'blocked',
    Eligible = 'eligible',
}

export enum PayoutWaitBasis {
    CalendarDays = 'calendar-days',
    NoClosedForm = 'no-closed-form',
    Profit = 'profit',
    QualifyingDays = 'qualifying-days',
}

export interface BlockedPayoutReadiness {
    readonly kind: PayoutReadinessKind.Blocked;
    readonly reason: PayoutBlockReason;
    readonly wait: null | PayoutWait;
}

export interface CalendarDaysWait {
    readonly basis: PayoutWaitBasis.CalendarDays;
    readonly daysStillNeeded: number;
}

export interface DocumentedPayoutEvaluationInput {
    readonly minRetainedCushion: number;
    readonly payoutRequestSize: number;
    readonly plan: Plan;
    readonly state: AccountState;
    readonly tracker: FundedCycleTracker;
}

export interface EligiblePayoutReadiness {
    readonly kind: PayoutReadinessKind.Eligible;
    readonly requestedAmount: number;
    readonly traderReceives: number;
}

export interface LiveTriggerCountLimit {
    readonly firmTotalCap: null | number;
    readonly paidPayoutsSinceLastLiveAccount: null | number;
    readonly perAccountCap: null | number;
}

export interface NoClosedFormWait {
    readonly basis: PayoutWaitBasis.NoClosedForm;
}

export interface PayoutPathStep {
    readonly gate: PayoutGate;
    readonly remaining: null | number;
    readonly satisfied: boolean;
    readonly unit: PayoutPathStepUnit;
}

export type PayoutReadiness = BlockedPayoutReadiness | EligiblePayoutReadiness;

export type PayoutReadinessOptions =
    | (PayoutReadinessCommonOptions & {
          readonly pendingPayouts: number;
          readonly statePendingPayoutsNetted: false;
      })
    | (PayoutReadinessCommonOptions & {
          readonly statePendingPayoutsNetted?: true;
      });

export type PayoutWait =
    CalendarDaysWait | NoClosedFormWait | ProfitWait | QualifyingDaysWait;

export interface ProfitWait {
    readonly basis: PayoutWaitBasis.Profit;
    readonly profitStillNeeded: number;
}

export interface QualifyingDaysWait {
    readonly basis: PayoutWaitBasis.QualifyingDays;
    readonly daysStillNeeded: number;
}

interface PayoutReadinessCommonOptions {
    readonly liveTrigger?: LiveTriggerCountLimit;
    readonly minRetainedCushion: number;
    readonly payoutRequestSize?: number | undefined;
}

export function dayGateProgressOf(
    plan: Plan,
    state: AccountState,
    tracker: FundedCycleTracker,
): {
    readonly satisfied: boolean;
    readonly wait: CalendarDaysWait | QualifyingDaysWait;
} {
    const required = requiredDayGateDays(plan, tracker);
    switch (plan.payoutDayGateBasis) {
        case PayoutDayGateBasis.CalendarDaysSinceFirstTradeOrPayout: {
            const requiredSessionDays = sessionDaysForCalendarDays(required);
            const sessionDaysSinceAnchor = tracker.sessionDaysSinceAnchor ?? 0;
            const remainingSessionDays = Math.max(
                0,
                requiredSessionDays - sessionDaysSinceAnchor,
            );
            return {
                satisfied:
                    tracker.sessionDaysSinceAnchor !== null &&
                    sessionDaysSinceAnchor >= requiredSessionDays,
                wait: {
                    basis: PayoutWaitBasis.CalendarDays,
                    daysStillNeeded: Math.ceil(
                        (remainingSessionDays * CALENDAR_DAYS_PER_WEEK) /
                            SESSION_DAYS_PER_CALENDAR_WEEK,
                    ),
                },
            };
        }
        case PayoutDayGateBasis.QualifyingDaysSincePassOrPayout: {
            const progress = tracker.dayGateProgress(plan, state);
            return {
                satisfied: progress >= required,
                wait: {
                    basis: PayoutWaitBasis.QualifyingDays,
                    daysStillNeeded: Math.max(0, required - progress),
                },
            };
        }
    }
}

export function evaluateDocumentedPayout(
    input: DocumentedPayoutEvaluationInput,
): PayoutEvaluation {
    return input.tracker.evaluatePayout({
        minRetainedCushion: input.minRetainedCushion,
        payoutRequestPolicy: PayoutRequestPolicy.FullRequestOnly,
        payoutRequestSize: input.payoutRequestSize,
        plan: input.plan,
        state: input.state,
    });
}

export function liveTriggerBlockReasonFor(
    payoutsIssued: number,
    limit: LiveTriggerCountLimit | undefined,
): null | PayoutBlockReason {
    if (limit === undefined) return null;
    if (
        limit.perAccountCap !== null &&
        payoutsIssued + 1 >= limit.perAccountCap
    ) {
        return wouldTriggerLiveBlockReason({
            paidPayoutsSinceLastLiveAccount: payoutsIssued,
            triggerAtPayoutCount: limit.perAccountCap,
        });
    }
    if (
        limit.firmTotalCap !== null &&
        limit.paidPayoutsSinceLastLiveAccount !== null &&
        limit.paidPayoutsSinceLastLiveAccount + 1 >= limit.firmTotalCap
    ) {
        return wouldTriggerLiveBlockReason({
            paidPayoutsSinceLastLiveAccount:
                limit.paidPayoutsSinceLastLiveAccount,
            triggerAtPayoutCount: limit.firmTotalCap,
        });
    }
    return null;
}

export function payoutPath(
    state: AccountState,
    plan: Plan,
    tracker: FundedCycleTracker,
    minRetainedCushion: number,
    payoutRequestSize: number = DEFAULT_PAYOUT_REQUEST_SIZE,
): readonly PayoutPathStep[] {
    const steps: PayoutPathStep[] = [];

    const conclusionGate = plan.conclusionGate(
        tracker.payoutsIssued,
        tracker.cumulativePayout,
    );
    steps.push(
        {
            gate: PayoutGate.AccountConcluded,
            remaining: null,
            satisfied: conclusionGate !== PayoutGate.AccountConcluded,
            unit: PayoutPathStepUnit.None,
        },
        {
            gate: PayoutGate.LifetimeDollarCapReached,
            remaining:
                plan.maxLifetimePayoutDollars === null
                    ? null
                    : Math.max(
                          0,
                          plan.maxLifetimePayoutDollars -
                              tracker.cumulativePayout,
                      ),
            satisfied: conclusionGate !== PayoutGate.LifetimeDollarCapReached,
            unit: PayoutPathStepUnit.Dollars,
        },
        {
            gate: PayoutGate.LadderExhausted,
            remaining: null,
            satisfied: conclusionGate !== PayoutGate.LadderExhausted,
            unit: PayoutPathStepUnit.None,
        },
    );

    const consistency = plan.fundedConsistencyRule(tracker.payoutsIssued);
    const cycleProfit = state.balance - tracker.lastPayoutBalance;
    const isConsistencySatisfied = !(
        consistency?.isViolated(tracker.cycleBestDayProfit, cycleProfit) ??
        false
    );
    steps.push({
        gate: PayoutGate.FundedConsistency,
        remaining: null,
        satisfied: isConsistencySatisfied,
        unit: PayoutPathStepUnit.None,
    });

    const dayGate = dayGateProgressOf(plan, state, tracker);
    steps.push({
        gate: PayoutGate.DayGateNotMet,
        remaining: dayGate.satisfied ? null : dayGate.wait.daysStillNeeded,
        satisfied: dayGate.satisfied,
        unit: PayoutPathStepUnit.Days,
    });

    const profitWait = profitWaitOf(plan, state, tracker);
    steps.push({
        gate: PayoutGate.BelowMinPayoutProfit,
        remaining: profitWait.profitStillNeeded,
        satisfied: profitWait.profitStillNeeded <= 0,
        unit: PayoutPathStepUnit.Dollars,
    });

    const earlyWithdrawal = earlyWithdrawalStepsOf(
        plan,
        state,
        tracker,
        profitWait.profitStillNeeded,
        payoutRequestSize,
    );
    steps.push(earlyWithdrawal.floor, earlyWithdrawal.minimum);

    const withdrawable = tracker.withdrawableNow({
        minRetainedCushion,
        plan,
        state,
    });
    steps.push({
        gate: PayoutGate.NothingWithdrawable,
        remaining: withdrawable > 0 ? null : 0,
        satisfied: withdrawable > 0,
        unit: PayoutPathStepUnit.Dollars,
    });

    const ladderStep = ladderStepLookup(
        plan.payoutLadder,
        tracker.payoutsIssued,
    );
    const profitShareCap =
        plan.payoutProfitShare === null
            ? undefined
            : plan.payoutProfitShare * cycleProfit;
    const ceiling = perRequestCeiling({
        deniesIfUnaffordable: plan.payoutLadder?.deniesIfUnaffordable ?? false,
        ladderStep,
        payoutRequestSize: undefined,
        poolLimit: poolProfitOf(plan, state, tracker),
        profitShareCap,
        withdrawable,
    });
    steps.push({
        gate: PayoutGate.LadderStepUnaffordable,
        remaining: null,
        satisfied: !(
            ceiling.kind === 'blocked' &&
            ceiling.gate === PayoutGate.LadderStepUnaffordable
        ),
        unit: PayoutPathStepUnit.None,
    });

    const minRequest = minimumPayoutRequest(plan);
    steps.push({
        gate: PayoutGate.BelowMinRequest,
        remaining: Math.max(0, minRequest - Math.max(0, withdrawable)),
        satisfied: withdrawable >= minRequest,
        unit: PayoutPathStepUnit.Dollars,
    });

    const requested = effectivePayoutRequest(plan, payoutRequestSize);
    const { requestCap } = plan.resolvedPayoutCap(state, tracker.payoutsIssued);
    const stepAmount =
        ladderStep.kind === 'step' ? ladderStep.amount : Infinity;
    const fullRequestAmount = Math.min(
        requested,
        requestCap ?? Infinity,
        stepAmount,
    );
    steps.push({
        gate: PayoutGate.BelowFullRequest,
        remaining:
            ceiling.kind === 'amount'
                ? Math.max(0, fullRequestAmount - ceiling.amount)
                : null,
        satisfied:
            ceiling.kind === 'amount' &&
            isAtOrBelowWithinCentTolerance(fullRequestAmount, ceiling.amount),
        unit: PayoutPathStepUnit.Dollars,
    });

    return steps;
}

export function payoutReadiness(
    plan: Plan,
    state: AccountState,
    tracker: FundedCycleTracker,
    options: PayoutReadinessOptions,
): PayoutReadiness {
    const netState =
        options.statePendingPayoutsNetted === false &&
        options.pendingPayouts > 0
            ? { ...state, balance: state.balance - options.pendingPayouts }
            : state;
    const requested = effectivePayoutRequest(
        plan,
        options.payoutRequestSize ?? DEFAULT_PAYOUT_REQUEST_SIZE,
    );
    const evaluate = (evalState: AccountState) =>
        evaluateDocumentedPayout({
            minRetainedCushion: options.minRetainedCushion,
            payoutRequestSize: requested,
            plan,
            state: evalState,
            tracker,
        });
    const evaluation = evaluate(netState);
    switch (evaluation.kind) {
        case PayoutEvaluationKind.Blocked: {
            const isCausedByPendingPayout =
                netState !== state &&
                evaluate(state).kind === PayoutEvaluationKind.Eligible;
            return {
                kind: PayoutReadinessKind.Blocked,
                reason: isCausedByPendingPayout
                    ? payoutPendingBlockReason()
                    : payoutBlockReasonFromGate(evaluation.gate),
                wait: waitFor(plan, netState, tracker, evaluation.gate),
            };
        }
        case PayoutEvaluationKind.Eligible: {
            const liveTriggerReason = liveTriggerBlockReasonFor(
                tracker.payoutsIssued,
                options.liveTrigger,
            );
            if (liveTriggerReason !== null) {
                return {
                    kind: PayoutReadinessKind.Blocked,
                    reason: liveTriggerReason,
                    wait: null,
                };
            }
            return {
                kind: PayoutReadinessKind.Eligible,
                requestedAmount: evaluation.debited,
                traderReceives: evaluation.traderReceives,
            };
        }
    }
}

export function poolProfitOf(
    plan: Plan,
    state: AccountState,
    tracker: FundedCycleTracker,
): number {
    return payoutPoolProfit(
        plan,
        state,
        state.balance - tracker.lastPayoutBalance,
    );
}

function earlyWithdrawalNotOfferedStep(gate: PayoutGate): PayoutPathStep {
    return {
        gate,
        remaining: null,
        satisfied: true,
        unit: PayoutPathStepUnit.None,
    };
}

function earlyWithdrawalStepsOf(
    plan: Plan,
    state: AccountState,
    tracker: FundedCycleTracker,
    profitStillNeeded: number,
    payoutRequestSize: number,
): { readonly floor: PayoutPathStep; readonly minimum: PayoutPathStep } {
    const rule = plan.oneTimeEarlyWithdrawal;
    const isOffered =
        profitStillNeeded > 0 &&
        rule !== null &&
        plan.takesOneTimeEarlyWithdrawal &&
        tracker.payoutsIssued === 0;
    if (!isOffered) {
        return {
            floor: earlyWithdrawalNotOfferedStep(
                PayoutGate.EarlyWithdrawalBelowFloor,
            ),
            minimum: earlyWithdrawalNotOfferedStep(
                PayoutGate.EarlyWithdrawalBelowMinimum,
            ),
        };
    }
    const allowance = rule.maxProfitShare * plan.accountProfit(state);
    const debited = Math.min(payoutRequestSize, allowance);
    const floorThreshold = payoutReferenceThreshold(plan, state);
    const isFloorSatisfied = state.balance - debited > floorThreshold;
    return {
        floor: {
            gate: PayoutGate.EarlyWithdrawalBelowFloor,
            remaining: null,
            satisfied: isFloorSatisfied,
            unit: PayoutPathStepUnit.None,
        },
        minimum: {
            gate: PayoutGate.EarlyWithdrawalBelowMinimum,
            remaining: isFloorSatisfied
                ? Math.max(0, rule.minRequest - debited)
                : null,
            satisfied: !isFloorSatisfied || debited >= rule.minRequest,
            unit: PayoutPathStepUnit.Dollars,
        },
    };
}

function profitWaitOf(
    plan: Plan,
    state: AccountState,
    tracker: FundedCycleTracker,
): ProfitWait {
    const required =
        tracker.payoutsIssued === 0
            ? plan.minPayoutProfit
            : (plan.minPayoutProfitPerCycle ?? dollars(0));
    const pool = poolProfitOf(plan, state, tracker);
    return {
        basis: PayoutWaitBasis.Profit,
        profitStillNeeded: Math.max(0, required - pool),
    };
}

function waitFor(
    plan: Plan,
    state: AccountState,
    tracker: FundedCycleTracker,
    gate: PayoutGate,
): null | PayoutWait {
    switch (gate) {
        case PayoutGate.AccountConcluded:
        case PayoutGate.BelowFullRequest:
        case PayoutGate.BelowMinRequest:
        case PayoutGate.EarlyWithdrawalBelowFloor:
        case PayoutGate.EarlyWithdrawalBelowMinimum:
        case PayoutGate.FundedConsistency:
        case PayoutGate.LadderExhausted:
        case PayoutGate.LadderStepUnaffordable:
        case PayoutGate.LifetimeDollarCapReached:
        case PayoutGate.NothingWithdrawable: {
            return null;
        }
        case PayoutGate.BelowMinPayoutProfit: {
            return profitWaitOf(plan, state, tracker);
        }
        case PayoutGate.DayGateNotMet: {
            return dayGateProgressOf(plan, state, tracker).wait;
        }
    }
}
