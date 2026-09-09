import { type AccountState } from '../core/AccountState';
import {
    type DayPolicy,
    type DayStopRule,
    type RungSizing,
} from '../core/DayPolicy';
import { type CouponDiscounts } from '../core/FeeSchedule';
import { type FundedCycleTracker } from '../core/FundedPayoutCycle';
import { type Plan } from '../core/Plan';
import { type Roi } from '../core/Roi';
import { type Dollars, type Fraction0to1 } from '../core/units';
import { type Rng } from '../rng';
import { type PathStats } from './PathStats';

export enum CorrelationMode {
    Copy = 'copy',
    Grouped = 'grouped',
    Independent = 'independent',
}

export type AttemptOutcome = 'busted' | 'passed' | 'timed-out';

export interface CostBreakdown {
    activationFee: number;
    evalFee: number;
    monthlySubsTotal: number;
    perAccountActivationFee: number;
    perAccountEvalFee: number;
    resetFeesTotal: number;
}

export interface DayRunOptions {
    commission: Dollars;
    dayPolicy: DayPolicy;
    phase: 'eval' | 'funded';
    plan: Plan;
    rng: Rng;
    rrRatio: number;
    rungSizing: RungSizing;
    state: AccountState;
    stats: PathStats;
    winrate: Fraction0to1;
}

export interface EvalAttemptOptions {
    commission: Dollars;
    dayPolicy: DayPolicy;
    maxEvalDays: number;
    plan: Plan;
    rng: Rng;
    rrRatio: number;
    rungSizing: RungSizing;
    shouldCaptureEquity: boolean;
    winrate: Fraction0to1;
}

export interface EvalAttemptResult {
    bestDayProfit: number;
    days: number;
    equityCurve: null | number[];
    outcome: AttemptOutcome;
    state: AccountState;
    stats: PathStats;
}

export interface EvalWithRetriesOptions extends EvalAttemptOptions {
    maxAttempts: number;
    onFailedAttempt?: (attempt: EvalAttemptResult) => void;
}

export interface EvalWithRetriesResult {
    attempt: EvalAttemptResult;
    attemptsUsed: number;
    daysElapsed: number;
    resetFeesPaid: number;
    terminalOutcome: 'busted' | 'timed-out' | null;
}

export interface FinishTrialArguments {
    attemptsUsed: number;
    cumulative: PathStats;
    cumulativeDays: number;
    daysToPass: null | number;
    discounts: CouponDiscounts | undefined;
    equityCurve: null | number[];
    evalTradesAtPass: number;
    finalBalance: number;
    firstPayoutDay: null | number;
    fundedProfit: number;
    ladderPayout: number;
    outcome: TrialOutcome;
    plan: Plan;
    resetFeesPaid: number;
}

export interface FundedDayStepOptions {
    commission: Dollars;
    dayPolicy: DayPolicy;
    plan: Plan;
    rng: Rng;
    rrRatio: number;
    rungSizing: RungSizing;
    state: AccountState;
    stats: PathStats;
    tracker: FundedCycleTracker;
    winrate: Fraction0to1;
}

export interface FundedHorizonOptions {
    attempt: EvalAttemptResult;
    commission: Dollars;
    dayPolicy: DayPolicy;

    fundedHorizonDays: number;
    minRetainedCushion: Dollars;
    payoutRequestSize: Dollars | undefined;
    plan: Plan;
    rng: Rng;
    rrRatio: number;
    rungSizing: RungSizing;
    winrate: Fraction0to1;
}

export interface FundedHorizonResult {
    daysElapsed: number;
    firstPayoutDay: null | number;
    isBustedFunded: boolean;
    isClosed: boolean;
    payoutsIssued: number;
    totalPayout: number;
}

export interface MultiAccountResult {
    accountsPassDistribution: number[];
    expectedAccountsPass: number;
    expectedDaysToPass: number;
    expectedMaxLossStreak: number;
    expectedMonthlyNet: number;
    expectedNet: number;
    meanTradesPerDay: number;
    pAtLeast: { k1: number; kAll: number; kHalf: number };
    perAccountPass: number;
    pHitDDLimit: number;
    theoreticalPassProb: number;
}

export interface PortfolioSimInputs extends SimInputs {
    accounts: number;
    correlation: CorrelationMode;
    groups: number;
}

export interface SimInputs {
    commissionPerRoundTrip?: number;
    copyAccounts?: number;
    dayStop?: DayStopRule;
    discounts?: CouponDiscounts;
    evalDayPolicy?: DayPolicy;
    fundedDayPolicy?: DayPolicy;
    fundedHorizonDays: number;
    maxAttempts?: number;
    maxEvalDays: number;
    minRetainedCushion?: number;
    payoutRequestSize?: number;
    plan: Plan;
    riskPerTrade: number;
    rrRatio: number;
    rungSizing?: RungSizing;
    seed: number;
    tradesPerDay: number;
    trials: number;
    winrate: number;
}

export interface SimOutputs {
    accountSize: number;
    breakEvenFundedProfit: number;
    bustProbability: number;
    cleanPassProbability: number;
    costBreakdown: CostBreakdown;
    daysToPassP5: number;
    daysToPassP25: number;
    daysToPassP50: number;
    daysToPassP75: number;
    daysToPassP95: number;
    daysToPassValues: number[];
    drawdownAmount: number;
    expectancyDollars: number;
    expectancyR: number;
    expectedAttempts: number;
    expectedAttemptsP90: number;
    expectedDaysToPass: number;
    expectedFirstPayoutDay: number;
    expectedGrossPayout: number;
    expectedGrossSpend: number;
    expectedMonthlyNet: number;
    expectedNet: number;
    expectedSpendP90: number;
    expectedTotalCost: number;
    finalBalanceP5: number;
    finalBalanceP25: number;
    finalBalanceP50: number;
    finalBalanceP75: number;
    finalBalanceP95: number;
    finalBalances: number[];
    fundedBustProbability: number;
    initialThreshold: number;
    maxDrawdownP50: number;
    maxDrawdownP95: number;
    maxLosingStreakP50: number;
    maxLosingStreakP95: number;
    passProbability: number;
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
    maxAttempts: number;
    maxEvalDays: number;
    minRetainedCushion: Dollars;
    payoutRequestSize: Dollars | undefined;
    plan: Plan;
    rng: Rng;
    rrRatio: number;
    rungSizing: RungSizing;
    shouldCaptureEquity: boolean;
    winrate: Fraction0to1;
}

export type TrialOutcome =
    | 'bust-eval'
    | 'bust-funded'
    | 'pass-clean'
    | 'pass-violation'
    | 'timeout-eval';

export interface TrialResult {
    attemptsUsed: number;
    daysElapsed: number;
    daysToPass: null | number;
    equityCurve: null | number[];
    evalTradesAtPass: number;
    finalBalance: number;
    firstPayoutDay: null | number;
    fundedProfit: number;
    grossLosses: number;
    grossPayout: number;
    grossWins: number;
    had5LossStreak: boolean;
    had10LossStreak: boolean;
    maxDrawdown: number;
    maxLosingStreak: number;
    net: number;
    outcome: TrialOutcome;
    resetFeesPaid: number;
    totalCost: number;
    tradesTaken: number;
}
