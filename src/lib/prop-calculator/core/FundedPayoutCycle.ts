import { type AccountState } from './AccountState';
import { type ConsistencyRule } from './ConsistencyRule';
import {
    CALENDAR_DAYS_PER_WEEK,
    SESSION_DAYS_PER_CALENDAR_WEEK,
} from './constants';
import { type FundedCycleSnapshot } from './DayPolicy';
import { type Dollars, dollars, type Fraction0to1 } from './lib/units';
import { PayoutProfitPool } from './PayoutCap';
import { PayoutFloorEffect } from './PayoutFloorEffect';
import { type PayoutLadder } from './PayoutTiers';
import { type Plan } from './Plan';

export enum PayoutDayGateBasis {
    CalendarDaysSinceFirstTradeOrPayout = 'calendar-days-since-first-trade-or-payout',
    QualifyingDaysSincePassOrPayout = 'qualifying-days-since-pass-or-payout',
}

export interface FundedPayoutOptions {
    minRetainedCushion: number;
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

    private earlyWithdrawalDebit(
        plan: Plan,
        state: AccountState,
        payoutRequestSize: number | undefined,
    ): null | number {
        const rule = plan.oneTimeEarlyWithdrawal;
        if (
            rule === null ||
            !plan.takesOneTimeEarlyWithdrawal ||
            this.payoutsIssued > 0
        ) {
            return null;
        }
        const allowance = rule.maxProfitShare * plan.accountProfit(state);
        const debited =
            payoutRequestSize === undefined
                ? allowance
                : Math.min(payoutRequestSize, allowance);
        const isAboveFloorAfterwards =
            state.balance - debited > payoutReferenceThreshold(plan, state);
        return isAboveFloorAfterwards && debited >= rule.minRequest
            ? debited
            : null;
    }

    private hasMetDayGate(plan: Plan, state: AccountState): boolean {
        const requiredDays =
            this.payoutsIssued === 0
                ? plan.minDaysAfterPassForPayout
                : (plan.minDaysAfterPassForPayoutPerCycle ??
                  plan.minDaysAfterPassForPayout);
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

    private settle(
        debited: number,
        plan: Plan,
        state: AccountState,
        fundedConsistency: ConsistencyRule | null,
    ): FundedPayoutResult {
        const traderReceives = plan.payoutFromProfit(
            debited,
            this.payoutsIssued,
        );
        const isCausesHardBreach =
            plan.fullWithdrawalHardBreach &&
            debited >= plan.accountProfit(state);

        state.balance -= debited;
        switch (plan.payoutFloorEffect) {
            case PayoutFloorEffect.LockAtPlanFloor: {
                plan.fundedDrawdown.forceLock(state);
                break;
            }
            case PayoutFloorEffect.MoveToLockedFloor: {
                plan.fundedDrawdown.moveToLock(state);
                break;
            }
            case PayoutFloorEffect.None: {
                break;
            }
            case PayoutFloorEffect.ReleaseFloor: {
                plan.fundedDrawdown.release(state, plan.accountSize);
                break;
            }
        }
        this.lastPayoutBalance = state.balance;
        this.qualifyingDaysAtLastPayout = state.qualifyingDays;
        this.sessionDaysSinceAnchor = 0;
        if (!fundedConsistency?.isPerpetual()) {
            this.cycleBestDayProfit = 0;
        }
        this.cumulativePayout += traderReceives;
        this.payoutsIssued += 1;

        return {
            causesHardBreach: isCausesHardBreach,
            debited,
            traderReceives,
        };
    }

    closeoutCredit(options: WithdrawableNowOptions): number {
        const { payoutRequestSize, plan, state } = options;
        if (
            (plan.maxLifetimePayouts !== null &&
                this.payoutsIssued >= plan.maxLifetimePayouts) ||
            (plan.maxLifetimePayoutDollars !== null &&
                this.cumulativePayout >= plan.maxLifetimePayoutDollars)
        ) {
            return 0;
        }
        const ceiling = perRequestCeiling({
            ...this.requestLimits(plan, state),
            payoutRequestSize,
            withdrawable: this.withdrawableNow(options),
        });
        return ceiling === null
            ? 0
            : plan.payoutFromProfit(Math.max(0, ceiling), this.payoutsIssued);
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

    tryPayout(options: FundedPayoutOptions): FundedPayoutResult | null {
        const { minRetainedCushion, payoutRequestSize, plan, state } = options;
        if (
            plan.maxLifetimePayoutDollars !== null &&
            this.cumulativePayout >= plan.maxLifetimePayoutDollars
        ) {
            return null;
        }

        const cycleProfit = state.balance - this.lastPayoutBalance;
        const poolProfit = payoutPoolProfit(plan, state, cycleProfit);
        const requiredProfit =
            this.payoutsIssued === 0
                ? plan.minPayoutProfit
                : (plan.minPayoutProfitPerCycle ?? dollars(0));
        const fundedConsistency = plan.fundedConsistencyRule(
            this.payoutsIssued,
        );
        const isConsistent = !fundedConsistency?.isViolated(
            this.cycleBestDayProfit,
            cycleProfit,
        );

        if (!isConsistent || !this.hasMetDayGate(plan, state)) {
            return null;
        }

        if (poolProfit < requiredProfit) {
            const earlyDebit = this.earlyWithdrawalDebit(
                plan,
                state,
                payoutRequestSize,
            );
            return earlyDebit === null
                ? null
                : this.settle(earlyDebit, plan, state, fundedConsistency);
        }

        const withdrawable = this.withdrawableNow({
            minRetainedCushion,
            plan,
            state,
        });
        if (withdrawable <= 0) return null;

        const debited = perRequestCeiling({
            ...this.requestLimits(plan, state),
            payoutRequestSize,
            withdrawable,
        });
        const minRequest =
            plan.payoutLadder?.minRequestAmount ?? plan.minPayoutRequest;
        return debited === null || debited < minRequest
            ? null
            : this.settle(debited, plan, state, fundedConsistency);
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

function ladderStepLookup(
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

function payoutPoolProfit(
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

function payoutReferenceThreshold(plan: Plan, state: AccountState): number {
    const effect = plan.payoutFloorEffect;
    switch (effect) {
        case PayoutFloorEffect.LockAtPlanFloor:
        case PayoutFloorEffect.MoveToLockedFloor: {
            return plan.fundedDrawdown.prospectiveLockThreshold(state, effect);
        }
        case PayoutFloorEffect.None:
        case PayoutFloorEffect.ReleaseFloor: {
            return state.threshold;
        }
    }
}

function perRequestCeiling(options: PerRequestCeilingOptions): null | number {
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
            return null;
        }
        case 'no-ladder': {
            const available =
                profitShareCap === undefined
                    ? Math.min(poolLimit, ceiling)
                    : ceiling;
            return payoutRequestSize === undefined
                ? available
                : Math.min(payoutRequestSize, available);
        }
        case 'step': {
            if (deniesIfUnaffordable && ladderStep.amount > ceiling) {
                return null;
            }
            const stepCeiling = deniesIfUnaffordable
                ? ladderStep.amount
                : Math.min(ladderStep.amount, ceiling);
            return payoutRequestSize === undefined
                ? stepCeiling
                : Math.min(payoutRequestSize, stepCeiling);
        }
    }
}
