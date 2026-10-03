import { z } from 'zod';

import { type AccountState } from './AccountState';
import {
    CALENDAR_DAYS_PER_WEEK,
    SESSION_DAYS_PER_CALENDAR_WEEK,
} from './constants';
import { type FundedCycleSnapshot } from './DayPolicy';
import {
    type Dollars,
    dollars,
    dollarsSchema,
    type Fraction0to1,
    isAtOrBelowWithinCentTolerance,
    nonNegativeDollarsSchema,
} from './lib/units';
import { PayoutProfitPool } from './PayoutCap';
import { PayoutFloorEffect } from './PayoutFloorEffect';
import { type AccountConclusionGate, PayoutGate } from './PayoutGate';
import {
    DEFAULT_PAYOUT_REQUEST_POLICY,
    fullPayoutRequest,
    minimumPayoutRequest,
    PayoutRequestPolicy,
} from './PayoutRequestPolicy';
import { type PayoutLadder } from './PayoutTiers';
import { type Plan } from './Plan';
import {
    applyPayoutFloorEffect,
    postPayoutThreshold,
} from './PostPayoutThreshold';

export enum PayoutDayGateBasis {
    CalendarDaysSinceFirstTradeOrPayout = 'calendar-days-since-first-trade-or-payout',
    QualifyingDaysSincePassOrPayout = 'qualifying-days-since-pass-or-payout',
}

export enum PayoutEvaluationKind {
    Blocked = 'blocked',
    Eligible = 'eligible',
}

const seedCountSchema = z.number().int().nonnegative();

export const fundedCycleSeedSchema = z.object({
    calendarDayGateProgress: seedCountSchema,
    cumulativePayout: nonNegativeDollarsSchema,
    cycleBestDayProfit: nonNegativeDollarsSchema,
    fundedResetsUsed: seedCountSchema,
    lastPayoutBalance: dollarsSchema,
    payoutsIssued: seedCountSchema,
    qualifyingDaysAtLastPayout: seedCountSchema,
});

export interface EligiblePayout {
    causesHardBreach: boolean;
    debited: number;
    isEarlyWithdrawal: boolean;
    keepsRetainedCushion: boolean;
    kind: PayoutEvaluationKind.Eligible;
    postPayoutCushion: number;
    traderReceives: number;
}

export type FundedCycleSeed = z.input<typeof fundedCycleSeedSchema>;

export interface FundedPayoutOptions {
    minRetainedCushion: number;
    payoutRequestPolicy?: PayoutRequestPolicy;
    payoutRequestSize: number | undefined;
    plan: Plan;
    state: AccountState;
}

export interface FundedPayoutResult {
    causesHardBreach: boolean;
    debited: number;
    traderReceives: number;
}

export interface OneTimeEarlyWithdrawal {
    maxProfitShare: Fraction0to1;
    minRequest: Dollars;
}

export type PayoutEvaluation =
    EligiblePayout | { gate: PayoutGate; kind: PayoutEvaluationKind.Blocked };

export interface WithdrawableNowOptions {
    minRetainedCushion: number;
    payoutRequestSize?: number;
    plan: Plan;
    state: AccountState;
}

type LadderStepLookup =
    | { amount: number; kind: 'step' }
    | { kind: 'exhausted' }
    | { kind: 'no-ladder' };

interface PerRequestCeilingOptions {
    deniesIfUnaffordable: boolean;
    ladderStep: LadderStepLookup;
    payoutRequestSize: number | undefined;
    poolLimit: number;
    profitShareCap: number | undefined;
    withdrawable: number;
}

type RequestCeiling =
    | { amount: number; kind: 'amount' }
    | {
          gate: PayoutGate.LadderExhausted | PayoutGate.LadderStepUnaffordable;
          kind: 'blocked';
      };

export class FundedCycleTracker {
    cumulativePayout = 0;

    cycleBestDayProfit = 0;

    readonly fundedResetsUsed: number;

    lastPayoutBalance: number;

    payoutsIssued = 0;

    qualifyingDaysAtLastPayout: number;

    sessionDaysSinceAnchor: null | number = null;

    constructor(state: AccountState, fundedResetsUsed: number) {
        this.fundedResetsUsed = fundedResetsUsed;
        this.lastPayoutBalance = state.balance;
        this.qualifyingDaysAtLastPayout = state.qualifyingDays;
    }

    private conclusionGate(plan: Plan): AccountConclusionGate | null {
        return plan.conclusionGate(this.payoutsIssued, this.cumulativePayout);
    }

    private eligiblePayout(
        options: FundedPayoutOptions,
        debited: number,
        isEarlyWithdrawal: boolean,
    ): EligiblePayout {
        const { minRetainedCushion, plan, state } = options;
        const balanceAfter = state.balance - debited;
        const postPayoutCushion =
            balanceAfter -
            postPayoutThreshold(
                plan.fundedDrawdown,
                { ...state, balance: balanceAfter },
                plan.payoutFloorEffect,
                plan.accountSize,
            );
        return {
            causesHardBreach:
                plan.fullWithdrawalHardBreach &&
                debited >= plan.accountProfit(state),
            debited,
            isEarlyWithdrawal,
            keepsRetainedCushion: isAtOrBelowWithinCentTolerance(
                Math.max(0, minRetainedCushion),
                postPayoutCushion,
            ),
            kind: PayoutEvaluationKind.Eligible,
            postPayoutCushion,
            traderReceives: plan.payoutFromProfit(debited, this.payoutsIssued),
        };
    }

    private evaluateEarlyWithdrawal(
        options: FundedPayoutOptions,
        fullRequest: null | number,
    ): PayoutEvaluation {
        const { payoutRequestSize, plan, state } = options;
        const rule = plan.oneTimeEarlyWithdrawal;
        if (
            rule === null ||
            !plan.takesOneTimeEarlyWithdrawal ||
            this.payoutsIssued > 0
        ) {
            return blockedBy(PayoutGate.BelowMinPayoutProfit);
        }
        const allowance = rule.maxProfitShare * plan.accountProfit(state);
        const debited =
            payoutRequestSize === undefined
                ? allowance
                : Math.min(payoutRequestSize, allowance);
        if (state.balance - debited <= payoutReferenceThreshold(plan, state)) {
            return blockedBy(PayoutGate.EarlyWithdrawalBelowFloor);
        }
        return debited < rule.minRequest
            ? blockedBy(PayoutGate.EarlyWithdrawalBelowMinimum)
            : this.settleableAmount(options, debited, fullRequest, true);
    }

    private fullRequestAmount(
        plan: Plan,
        state: AccountState,
        fullRequest: number,
        ladderStep: LadderStepLookup,
    ): number {
        const { requestCap } = plan.resolvedPayoutCap(
            state,
            this.payoutsIssued,
        );
        const stepAmount =
            ladderStep.kind === 'step' ? ladderStep.amount : Infinity;
        return Math.min(fullRequest, requestCap ?? Infinity, stepAmount);
    }

    private hasMetDayGate(plan: Plan, state: AccountState): boolean {
        const requiredDays = requiredDayGateDays(plan, this);
        switch (plan.payoutDayGateBasis) {
            case PayoutDayGateBasis.CalendarDaysSinceFirstTradeOrPayout: {
                return (
                    this.sessionDaysSinceAnchor !== null &&
                    this.sessionDaysSinceAnchor >=
                        sessionDaysForCalendarDays(requiredDays)
                );
            }
            case PayoutDayGateBasis.QualifyingDaysSincePassOrPayout: {
                return (
                    state.qualifyingDays - this.qualifyingDaysAtLastPayout >=
                    requiredDays
                );
            }
        }
    }

    private requestLimits(
        plan: Plan,
        state: AccountState,
    ): Omit<PerRequestCeilingOptions, 'payoutRequestSize' | 'withdrawable'> {
        const ladder = plan.payoutLadder;
        const cycleProfit = state.balance - this.lastPayoutBalance;
        return {
            deniesIfUnaffordable: ladder?.deniesIfUnaffordable ?? false,
            ladderStep: ladderStepLookup(ladder, this.payoutsIssued),
            poolLimit: payoutPoolProfit(plan, state, cycleProfit),
            profitShareCap:
                plan.payoutProfitShare === null
                    ? undefined
                    : plan.payoutProfitShare * cycleProfit,
        };
    }

    private settleableAmount(
        options: FundedPayoutOptions,
        available: number,
        fullAmount: null | number,
        isEarlyWithdrawal: boolean,
    ): PayoutEvaluation {
        if (fullAmount === null) {
            return this.eligiblePayout(options, available, isEarlyWithdrawal);
        }
        return isAtOrBelowWithinCentTolerance(fullAmount, available)
            ? this.eligiblePayout(options, fullAmount, isEarlyWithdrawal)
            : blockedBy(PayoutGate.BelowFullRequest);
    }

    closeoutCredit(options: WithdrawableNowOptions): number {
        const { payoutRequestSize, plan, state } = options;
        if (this.conclusionGate(plan) !== null) return 0;
        const ceiling = perRequestCeiling({
            ...this.requestLimits(plan, state),
            payoutRequestSize,
            withdrawable: this.withdrawableNow(options),
        });
        switch (ceiling.kind) {
            case 'amount': {
                return plan.payoutFromProfit(
                    Math.max(0, ceiling.amount),
                    this.payoutsIssued,
                );
            }
            case 'blocked': {
                return 0;
            }
        }
    }

    cycleSnapshot(plan: Plan, state: AccountState): FundedCycleSnapshot {
        return {
            cycleBestDayProfit: this.cycleBestDayProfit,
            dayGateProgress: this.dayGateProgress(plan, state),
            fundedResetsUsed: this.fundedResetsUsed,
            lastPayoutBalance: this.lastPayoutBalance,
            payoutsIssued: this.payoutsIssued,
        };
    }

    dayGateProgress(plan: Plan, state: AccountState): number {
        switch (plan.payoutDayGateBasis) {
            case PayoutDayGateBasis.CalendarDaysSinceFirstTradeOrPayout: {
                if (this.sessionDaysSinceAnchor === null) return 0;
                return this.payoutsIssued === 0
                    ? this.sessionDaysSinceAnchor + 1
                    : this.sessionDaysSinceAnchor;
            }
            case PayoutDayGateBasis.QualifyingDaysSincePassOrPayout: {
                return state.qualifyingDays - this.qualifyingDaysAtLastPayout;
            }
        }
    }

    recordSessionClose(state: AccountState): void {
        if (this.sessionDaysSinceAnchor !== null) {
            this.sessionDaysSinceAnchor += 1;
            return;
        }
        if (state.consecutiveIdleDays === 0) this.sessionDaysSinceAnchor = 0;
    }

    evaluatePayout(options: FundedPayoutOptions): PayoutEvaluation {
        const { minRetainedCushion, payoutRequestSize, plan, state } = options;
        const fullRequest = fullRequestOf(options);
        const concluded = this.conclusionGate(plan);
        if (concluded !== null) return blockedBy(concluded);

        const cycleProfit = state.balance - this.lastPayoutBalance;
        const fundedConsistency = plan.fundedConsistencyRule(
            this.payoutsIssued,
        );
        if (
            fundedConsistency?.isViolated(this.cycleBestDayProfit, cycleProfit)
        ) {
            return blockedBy(PayoutGate.FundedConsistency);
        }
        if (!this.hasMetDayGate(plan, state)) {
            return blockedBy(PayoutGate.DayGateNotMet);
        }

        const requiredProfit =
            this.payoutsIssued === 0
                ? plan.minPayoutProfit
                : (plan.minPayoutProfitPerCycle ?? dollars(0));
        if (payoutPoolProfit(plan, state, cycleProfit) < requiredProfit) {
            return this.evaluateEarlyWithdrawal(options, fullRequest);
        }

        const withdrawable = this.withdrawableNow({
            minRetainedCushion,
            plan,
            state,
        });
        if (withdrawable <= 0) {
            return blockedBy(PayoutGate.NothingWithdrawable);
        }

        const limits = this.requestLimits(plan, state);
        const ceiling = perRequestCeiling({
            ...limits,
            payoutRequestSize,
            withdrawable,
        });
        if (ceiling.kind === 'blocked') return blockedBy(ceiling.gate);
        if (ceiling.amount < minimumPayoutRequest(plan)) {
            return blockedBy(PayoutGate.BelowMinRequest);
        }
        return this.settleableAmount(
            options,
            ceiling.amount,
            fullRequest === null
                ? null
                : this.fullRequestAmount(
                      plan,
                      state,
                      fullRequest,
                      limits.ladderStep,
                  ),
            false,
        );
    }

    restoreCalendarDayGateProgress(progress: number): void {
        this.sessionDaysSinceAnchor =
            this.payoutsIssued > 0
                ? progress
                : progress === 0
                  ? null
                  : progress - 1;
    }

    withdrawableNow(options: WithdrawableNowOptions): number {
        const { minRetainedCushion, plan, state } = options;
        const prospectiveThreshold = payoutReferenceThreshold(plan, state);
        const cushionRoom =
            state.balance -
            plan.payoutBalanceFloor(
                { ...state, threshold: prospectiveThreshold },
                minRetainedCushion,
            );
        const cap = plan.resolvedPayoutCap(state, this.payoutsIssued);
        const dollarCappedWithdrawable =
            cap.requestCap === null
                ? cushionRoom
                : Math.min(cushionRoom, cap.requestCap);
        return cap.balanceShareCap === null
            ? dollarCappedWithdrawable
            : Math.min(
                  dollarCappedWithdrawable,
                  cap.balanceShareCap * Math.max(0, plan.accountProfit(state)),
              );
    }

    settle(
        payout: Pick<
            EligiblePayout,
            'causesHardBreach' | 'debited' | 'traderReceives'
        >,
        plan: Plan,
        state: AccountState,
    ): FundedPayoutResult {
        const { causesHardBreach, debited, traderReceives } = payout;
        const fundedConsistency = plan.fundedConsistencyRule(
            this.payoutsIssued,
        );

        state.balance -= debited;
        applyPayoutFloorEffect(
            plan.fundedDrawdown,
            state,
            plan.payoutFloorEffect,
            plan.accountSize,
        );
        this.lastPayoutBalance = state.balance;
        this.qualifyingDaysAtLastPayout = state.qualifyingDays;
        this.sessionDaysSinceAnchor = 0;
        if (!fundedConsistency?.isPerpetual()) {
            this.cycleBestDayProfit = 0;
        }
        this.cumulativePayout += traderReceives;
        this.payoutsIssued += 1;

        return { causesHardBreach, debited, traderReceives };
    }

    tryPayout(options: FundedPayoutOptions): FundedPayoutResult | null {
        const evaluation = this.evaluatePayout(options);
        switch (evaluation.kind) {
            case PayoutEvaluationKind.Blocked: {
                return null;
            }
            case PayoutEvaluationKind.Eligible: {
                return this.settle(evaluation, options.plan, options.state);
            }
        }
    }
}

export function describePayoutDayGate(plan: Plan): string {
    const days = plan.minDaysAfterPassForPayout;
    const perCycleDays = plan.minDaysAfterPassForPayoutPerCycle ?? days;
    const hasDistinctPerCycle = perCycleDays !== days;
    switch (plan.payoutDayGateBasis) {
        case PayoutDayGateBasis.CalendarDaysSinceFirstTradeOrPayout: {
            return hasDistinctPerCycle
                ? `${days} calendar days from first trade, then ${perCycleDays} from each payout`
                : `${days} calendar days from first trade, restarting at each payout`;
        }
        case PayoutDayGateBasis.QualifyingDaysSincePassOrPayout: {
            return hasDistinctPerCycle
                ? `${days} qualifying days, then ${perCycleDays} per payout cycle`
                : `${days} qualifying days`;
        }
    }
}

export function ladderStepLookup(
    ladder: null | PayoutLadder,
    index: number,
): LadderStepLookup {
    if (!ladder) return { kind: 'no-ladder' };
    const step = ladder.steps[index];
    if (step !== undefined) return { amount: step, kind: 'step' };
    if (ladder.capsAtLastStep) {
        const lastStep = ladder.steps.at(-1);
        if (lastStep !== undefined) return { amount: lastStep, kind: 'step' };
    }
    return { kind: 'exhausted' };
}

export function newFundedCycleTracker(state: AccountState): FundedCycleTracker {
    return new FundedCycleTracker(state, 0);
}

export function newFundedCycleTrackerAfterReset(
    state: AccountState,
    fundedResetsUsed: number,
): FundedCycleTracker {
    if (!Number.isSafeInteger(fundedResetsUsed) || fundedResetsUsed < 1) {
        throw new RangeError(
            `A funded cycle tracker opened after a reset needs a positive whole reset count, got ${fundedResetsUsed}`,
        );
    }
    return new FundedCycleTracker(state, fundedResetsUsed);
}

export function payoutPoolProfit(
    plan: Plan,
    state: AccountState,
    cycleProfit: number,
): number {
    switch (plan.payoutProfitPool) {
        case PayoutProfitPool.AccountProfit: {
            return plan.accountProfit(state);
        }
        case PayoutProfitPool.CycleProfit: {
            return cycleProfit;
        }
    }
}

export function payoutReferenceThreshold(
    plan: Plan,
    state: AccountState,
): number {
    const effect = plan.payoutFloorEffect;
    switch (effect) {
        case PayoutFloorEffect.LockAtPlanFloor:
        case PayoutFloorEffect.MoveToLockedFloor:
        case PayoutFloorEffect.None: {
            return postPayoutThreshold(
                plan.fundedDrawdown,
                state,
                effect,
                plan.accountSize,
            );
        }
        case PayoutFloorEffect.ReleaseFloor: {
            return state.threshold;
        }
    }
}

export function perRequestCeiling(
    options: PerRequestCeilingOptions,
): RequestCeiling {
    const {
        deniesIfUnaffordable,
        ladderStep,
        payoutRequestSize,
        poolLimit,
        profitShareCap,
        withdrawable,
    } = options;
    const ceiling =
        profitShareCap === undefined
            ? withdrawable
            : Math.min(withdrawable, profitShareCap);

    switch (ladderStep.kind) {
        case 'exhausted': {
            return { gate: PayoutGate.LadderExhausted, kind: 'blocked' };
        }
        case 'no-ladder': {
            const available =
                profitShareCap === undefined
                    ? Math.min(poolLimit, ceiling)
                    : ceiling;
            return {
                amount:
                    payoutRequestSize === undefined
                        ? available
                        : Math.min(payoutRequestSize, available),
                kind: 'amount',
            };
        }
        case 'step': {
            if (deniesIfUnaffordable && ladderStep.amount > ceiling) {
                return {
                    gate: PayoutGate.LadderStepUnaffordable,
                    kind: 'blocked',
                };
            }
            const stepCeiling = deniesIfUnaffordable
                ? ladderStep.amount
                : Math.min(ladderStep.amount, ceiling);
            return {
                amount:
                    payoutRequestSize === undefined
                        ? stepCeiling
                        : Math.min(payoutRequestSize, stepCeiling),
                kind: 'amount',
            };
        }
    }
}

export function requiredDayGateDays(
    plan: Pick<
        Plan,
        'minDaysAfterPassForPayout' | 'minDaysAfterPassForPayoutPerCycle'
    >,
    tracker: Pick<FundedCycleTracker, 'payoutsIssued'>,
): number {
    return tracker.payoutsIssued === 0
        ? plan.minDaysAfterPassForPayout
        : (plan.minDaysAfterPassForPayoutPerCycle ??
              plan.minDaysAfterPassForPayout);
}

export function restoreFundedCycleTracker(
    state: AccountState,
    seed: FundedCycleSeed,
): FundedCycleTracker {
    const parsed = fundedCycleSeedSchema.safeParse(seed);
    if (!parsed.success) {
        throw new RangeError(
            `A funded cycle seed is invalid: ${parsed.error.issues
                .map((issue) => `${issue.path.join('.')} ${issue.message}`)
                .join('; ')}`,
        );
    }
    const valid = parsed.data;
    if (valid.qualifyingDaysAtLastPayout > state.qualifyingDays) {
        throw new RangeError(
            `A funded cycle seed counts ${valid.qualifyingDaysAtLastPayout} qualifying days at the last payout, more than the ${state.qualifyingDays} the account has`,
        );
    }
    const tracker =
        valid.fundedResetsUsed === 0
            ? newFundedCycleTracker(state)
            : newFundedCycleTrackerAfterReset(state, valid.fundedResetsUsed);
    tracker.payoutsIssued = valid.payoutsIssued;
    tracker.cumulativePayout = valid.cumulativePayout;
    tracker.cycleBestDayProfit = valid.cycleBestDayProfit;
    tracker.lastPayoutBalance = valid.lastPayoutBalance;
    tracker.qualifyingDaysAtLastPayout = valid.qualifyingDaysAtLastPayout;
    tracker.restoreCalendarDayGateProgress(valid.calendarDayGateProgress);
    return tracker;
}

export function sessionDaysForCalendarDays(calendarDays: number): number {
    return Math.round(
        (calendarDays * SESSION_DAYS_PER_CALENDAR_WEEK) /
            CALENDAR_DAYS_PER_WEEK,
    );
}

export function withOneTimeEarlyWithdrawalTaken(
    plan: Plan,
    isTaken: boolean,
): Plan {
    return isTaken && plan.oneTimeEarlyWithdrawal !== null
        ? plan.withOverrides({ takesOneTimeEarlyWithdrawal: true })
        : plan;
}

function blockedBy(gate: PayoutGate): PayoutEvaluation {
    return { gate, kind: PayoutEvaluationKind.Blocked };
}

function fullRequestOf(options: FundedPayoutOptions): null | number {
    const policy = options.payoutRequestPolicy ?? DEFAULT_PAYOUT_REQUEST_POLICY;
    switch (policy) {
        case PayoutRequestPolicy.FullRequestOnly: {
            return fullPayoutRequest(options.plan, options.payoutRequestSize);
        }
        case PayoutRequestPolicy.UpToRequest: {
            return null;
        }
    }
}
