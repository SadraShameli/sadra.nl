import { type AccountState } from '../core/AccountState';
import { type DatedCharge } from '../core/DatedCharge';
import {
    type DayPolicy,
    type DayStopRule,
    type FundedCycleSnapshot,
    type RungSizing,
} from '../core/DayPolicy';
import { type CouponDiscounts } from '../core/FeeSchedule';
import { type FundedCycleTracker } from '../core/FundedPayoutCycle';
import { type InstrumentSymbol } from '../core/Instruments';
import { type Dollars, type Fraction0to1 } from '../core/lib/units';
import { type LiveAccountState } from '../core/LiveAccountState';
import { type LivePlan } from '../core/LivePlan';
import { type Plan } from '../core/Plan';
import { type PositionSizingConfig } from '../core/PositionSizing';
import { type ReplacementInputs } from '../core/Replacement';
import { type Roi } from '../core/Roi';
import { type TradingPhase } from '../core/TradingPhase';
import { type Rng } from '../rng';
import { type Estimate, type UncertainValue } from '../stats';
import {
    type LossStreak,
    type PhaseStats,
    type TradeTotals,
} from './PhaseStats';

export enum CorrelationMode {
    Copy = 'copy',
    Grouped = 'grouped',
    Independent = 'independent',
}

export interface AtLeastProbabilities {
    k1: number;
    kAll: number;
    kHalf: number;
}

export type AttemptOutcome = 'busted' | 'passed' | 'timed-out';

export interface CostBreakdown {
    activationFee: number;
    evalFee: number;
    fundedResetFeesPerFundedAccount: number;
    fundedResetFeesTotal: number;
    perAccountActivationFee: number;
    perAccountEvalFee: number;
    resetFeesTotal: number;
    subscriptionPerFundedAccount: number;
    subscriptionPerTrial: number;
}

export interface CostBreakdownArguments {
    averageFundedResetFees: number;
    averageResetFees: number;
    averageSubscription: number;
    evalPassProbability: number;
    fundedResetFeesPerFundedAccount: number;
    plan: Plan;
    replacementInputs: ReplacementInputs;
}

export type DayRunOptions = EvalDayRunOptions | FundedDayRunOptions;

export interface EvalAttemptOptions {
    commission: Dollars;
    dayPolicy: DayPolicy;
    idleDayProbability?: number;
    intradayPathStepsPerR?: number;
    maxEvalDays: number;
    plan: Plan;
    positionSizing: null | PositionSizingConfig;
    rng: Rng;
    rrRatio: number;
    rungSizing: RungSizing;
    shouldCaptureEquity: boolean;
    totals: TradeTotals;
    winrate: Fraction0to1;
}

export interface EvalAttemptResult {
    closedForInactivity: boolean;
    days: number;
    equityCurve: null | number[];
    outcome: AttemptOutcome;
    state: AccountState;
    stats: PhaseStats;
    streak: LossStreak;
}

export interface EvalDayRunOptions extends DayRunCommonOptions {
    phase: TradingPhase.Eval;
}

export type EvalWithRetriesOptions = EvalAttemptOptions &
    EvalRetryLimit & {
        discounts?: CouponDiscounts;
    };

export interface EvalWithRetriesResult {
    attempt: EvalAttemptResult;
    attemptsUsed: number;
    daysElapsed: number;
    failedAttemptDays: number[];
    resetFeesPaid: number;
    retryCharges: readonly DatedCharge[];
    terminalOutcome: 'busted' | 'timed-out' | null;
}

export interface FinishTrialArguments {
    attemptsUsed: number;
    closedForInactivity: boolean;
    cumulativeDays: number;
    daysToPass: null | number;
    discounts: CouponDiscounts | undefined;
    equityCurve: null | number[];
    evalDays: number;
    evalTradesAtPass: number;
    failedAttemptDays: number[];
    finalBalance: number;
    firstPayoutDay: null | number;
    fundedResetFeesPaid: number;
    fundedResetsUsed: number;
    horizonCredit: number;
    outcome: TrialOutcome;
    payoutCount: number;
    plan: Plan;
    resetFeesPaid: number;
    totalPayout: number;
    totals: TradeTotals;
}

export interface FundedDayRunOptions extends DayRunCommonOptions {
    fundedCycle: FundedCycleSnapshot;
    phase: TradingPhase.Funded;
}

export interface FundedDayStepOptions {
    commission: Dollars;
    dayPolicy: DayPolicy;
    idleDayProbability?: number;
    intradayPathStepsPerR?: number;
    plan: Plan;
    positionSizing: null | PositionSizingConfig;
    rng: Rng;
    rrRatio: number;
    rungSizing: RungSizing;
    state: AccountState;
    stats: PhaseStats;
    tracker: FundedCycleTracker;
    winrate: Fraction0to1;
}

export interface FundedHorizonOptions {
    attempt: EvalAttemptResult;
    commission: Dollars;
    dayPolicy: DayPolicy;
    discounts: CouponDiscounts | undefined;
    fundedHorizonDays: number;
    idleDayProbability?: number;
    intradayPathStepsPerR?: number;
    minRetainedCushion: Dollars;
    payoutRequestSize: Dollars | undefined;
    plan: Plan;
    positionSizing: null | PositionSizingConfig;
    rng: Rng;
    rrRatio: number;
    rungSizing: RungSizing;
    winrate: Fraction0to1;
}

export interface FundedHorizonResult {
    closedForInactivity: boolean;
    daysElapsed: number;
    firstPayoutDay: null | number;
    fundedResetFeesPaid: number;
    fundedResetsUsed: number;
    horizonCredit: number;
    isBustedFunded: boolean;
    payoutCount: number;
    totalPayout: number;
}

export interface LiveDayRunOptions {
    commission: Dollars;
    idleDayProbability?: number;
    plan: LivePlan;
    positionSizing: PositionSizingConfig;
    rng: Rng;
    rrRatio: number;
    state: LiveAccountState;
    tradesPerDay: number;
    winrate: Fraction0to1;
}

export interface LiveOutputs {
    cumulativeWithdrawalsAtHorizon: number[];
    cumulativeWithdrawalsP5: number;
    cumulativeWithdrawalsP50: number;
    cumulativeWithdrawalsP95: number;
    expectedAnnualWithdrawalRate: number;
    expectedCapitalReturned: number;
    expectedLiquidationPayout: number;
    liveBustProbability: number;
    liveInactivityClosureProbability: number;
    medianDaysToBust: number;
    medianDaysToFirstWithdrawal: number;
}

export interface LiveSimInputs {
    commissionPerRoundTrip?: number;
    horizonDays: number;
    idleDayProbability?: number;
    instrument: InstrumentSymbol;
    payoutRequestSize?: number;
    plan: LivePlan;
    retainedCushion?: number;
    rrRatio: number;
    seed: number;
    stopPoints: number;
    tradesPerDay: number;
    trials: number;
    winrate: number;
}

export interface MultiAccountResult {
    accountsPassDistribution: number[];
    expectedAccountsPass: number;
    expectedDaysToPass: number;
    expectedMaxLossStreak: number;
    expectedMonthlyNet: number;
    expectedMonthlyRealizedNet: number;
    expectedNet: number;
    meanTradesPerDay: number;
    pAtLeast: AtLeastProbabilities;
    pAtLeastFundedSurvival: AtLeastProbabilities;
    perAccountFundedSurvival: number;
    perAccountPass: number;
    pHitDDLimit: number;
    theoreticalPassProb: number;
}

export interface PortfolioSimInputs extends SimInputs {
    accounts: number;
    correlation: CorrelationMode;
    groups: number;
}

export interface SimEstimates {
    anyPayoutGivenFundedProbability: UncertainValue;
    attemptPassProbability: Estimate;
    attemptPaysProbability: Estimate;
    costPerAttempt: Estimate;
    evalPassProbability: Estimate;
    expectedAttempts: Estimate;
    expectedGrossPayout: Estimate;
    expectedHorizonCredit: Estimate;
    expectedMonthlyNet: Estimate;
    expectedMonthlyRealizedNet: Estimate;
    expectedNet: Estimate;
    expectedNetPerAttempt: Estimate;
    expectedPayoutCount: Estimate;
    expectedPayoutPerFundedAccount: UncertainValue;
    fundedBustProbability: Estimate;
    fundedSurvivalProbability: Estimate;
    payoutsPerFundedAccount: UncertainValue;
}

export interface SimInputs {
    commissionPerRoundTrip?: number;
    copyAccounts?: number;
    dayStop?: DayStopRule;
    discounts?: CouponDiscounts;
    evalDayPolicy?: DayPolicy;
    fundedCushionPercent?: Fraction0to1;
    fundedDayPolicy?: DayPolicy;
    fundedHorizonDays: number;
    fundedRiskPerTrade?: number;
    fundedRrRatio?: number;
    fundedTradesPerDay?: number;
    idleDayProbability?: number;
    instrument?: InstrumentSymbol;
    intradayPathStepsPerR?: number;
    maxAttempts?: number;
    maxEvalDays: number;
    minRetainedCushion?: number;
    payoutRequestSize?: number;
    plan: Plan;
    rebuyLagDays?: number;
    riskPerTrade: number;
    rrRatio: number;
    rungSizing?: RungSizing;
    seed: number;
    stopPoints?: number;
    tradesPerDay: number;
    trials: number;
    winrate: number;
}

export interface SimOutputs {
    accountSize: number;
    anyPayoutGivenFundedProbability: number;
    attemptPassProbability: number;
    attemptPaysProbability: number;
    averageRiskPerTrade: number;
    breakEvenFundedProfit: number;
    bustProbability: number;
    copyAccounts: number;
    costBreakdown: CostBreakdown;
    costPerAttempt: number;
    costPerDrawdownDollar: number;
    costPerFundedAccount: number;
    daysToPassP5: number;
    daysToPassP25: number;
    daysToPassP50: number;
    daysToPassP75: number;
    daysToPassP95: number;
    daysToPassValues: number[];
    drawdownAmount: number;
    estimates: SimEstimates;
    evalPassProbability: number;
    expectancyDollars: number;
    expectancyR: number;
    expectedAttempts: number;
    expectedAttemptsP90: number;
    expectedDaysToPass: number;
    expectedFirstPayoutDay: number;
    expectedFundedResets: number;
    expectedGrossPayout: number;
    expectedGrossSpend: number;
    expectedHorizonCredit: number;
    expectedMonthlyNet: number;
    expectedMonthlyRealizedNet: number;
    expectedNet: number;
    expectedNetPerAttempt: number;
    expectedPayoutCount: number;
    expectedPayoutPerFundedAccount: number;
    expectedSpendP90: number;
    expectedTotalCost: number;
    finalBalanceP5: number;
    finalBalanceP25: number;
    finalBalanceP50: number;
    finalBalanceP75: number;
    finalBalanceP95: number;
    finalBalances: number[];
    fundedBustProbability: number;
    fundedPayoutCountDistribution: number[];
    fundedPayoutValues: number[];
    fundedSurvivalProbability: number;
    inactivityClosureProbability: number;
    initialThreshold: number;
    maxDrawdownP50: number;
    maxDrawdownP95: number;
    maxLosingStreakP50: number;
    maxLosingStreakP95: number;
    netValues: number[];
    payoutsPerFundedAccount: number;
    profitFactor: number;
    profitTarget: number;
    risk5LossesPercent: number;
    risk10LossesPercent: number;
    roiOnCost: Roi;
    sampleEquityCurves: number[][];
    timeoutProbability: number;
    tradesPerSuccessfulAttempt: number;
}

export interface TrialOptions {
    commission: Dollars;
    discounts: CouponDiscounts | undefined;
    evalDayPolicy: DayPolicy;
    fundedDayPolicy: DayPolicy;
    fundedHorizonDays: number;
    fundedRrRatio?: number;
    idleDayProbability?: number;
    intradayPathStepsPerR?: number;
    maxAttempts: number;
    maxEvalDays: number;
    minRetainedCushion: Dollars;
    payoutRequestSize: Dollars | undefined;
    plan: Plan;
    positionSizing: null | PositionSizingConfig;
    rng: Rng;
    rrRatio: number;
    rungSizing: RungSizing;
    shouldCaptureEquity: boolean;
    winrate: Fraction0to1;
}

export type TrialOutcome =
    'bust-eval' | 'bust-funded' | 'pass-clean' | 'timeout-eval';

export interface TrialResult {
    attemptsUsed: number;
    closedForInactivity: boolean;
    daysElapsed: number;
    daysToPass: null | number;
    equityCurve: null | number[];
    evalDays: number;
    evalTradesAtPass: number;
    failedAttemptDays: number[];
    finalBalance: number;
    firstPayoutDay: null | number;
    fundedResetFeesPaid: number;
    fundedResetsUsed: number;
    grossLosses: number;
    grossPayout: number;
    grossWins: number;
    had5LossStreak: boolean;
    had10LossStreak: boolean;
    horizonCredit: number;
    maxDrawdown: number;
    maxLosingStreak: number;
    net: number;
    outcome: TrialOutcome;
    payoutCount: number;
    resetFeesPaid: number;
    riskTaken: number;
    totalCost: number;
    tradesTaken: number;
}

interface DayRunCommonOptions {
    commission: Dollars;
    dayPolicy: DayPolicy;
    idleDayProbability?: number;
    intradayPathStepsPerR?: number;
    plan: Plan;
    positionSizing: null | PositionSizingConfig;
    rng: Rng;
    rrRatio: number;
    rungSizing: RungSizing;
    state: AccountState;
    stats: PhaseStats;
    winrate: Fraction0to1;
}

type EvalRetryLimit =
    | { maxAttempts: number; maxTotalEvalDays?: number }
    | { maxAttempts?: number; maxTotalEvalDays: number };
