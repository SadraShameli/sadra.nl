import { type AccountState } from '../core/AccountState';
import {
    type DayPolicy,
    type DayStopRule,
    type RungSizing,
} from '../core/DayPolicy';
import { type CouponDiscounts } from '../core/FeeSchedule';
import { type FundedCycleTracker } from '../core/FundedPayoutCycle';
import { type InstrumentSymbol } from '../core/Instruments';
import { type LiveAccountState } from '../core/LiveAccountState';
import { type LivePlan } from '../core/LivePlan';
import { type Plan } from '../core/Plan';
import { type PositionSizingConfig } from '../core/PositionSizing';
import { type Roi } from '../core/Roi';
import { type TradingPhase } from '../core/TradingPhase';
import { type Dollars, type Fraction0to1 } from '../core/units';
import { type Rng } from '../rng';
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
    idleDayProbability?: number;
    intradayPathStepsPerR?: number;
    payoutsIssued?: number;
    phase: TradingPhase;
    plan: Plan;
    positionSizing: null | PositionSizingConfig;
    rng: Rng;
    rrRatio: number;
    rungSizing: RungSizing;
    state: AccountState;
    stats: PhaseStats;
    winrate: Fraction0to1;
}

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

export interface EvalWithRetriesOptions extends EvalAttemptOptions {
    maxAttempts: number;
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
    closedForInactivity: boolean;
    cumulativeDays: number;
    daysToPass: null | number;
    discounts: CouponDiscounts | undefined;
    equityCurve: null | number[];
    evalDays: number;
    evalTradesAtPass: number;
    finalBalance: number;
    firstPayoutDay: null | number;
    outcome: TrialOutcome;
    payoutCount: number;
    plan: Plan;
    resetFeesPaid: number;
    totalPayout: number;
    totals: TradeTotals;
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
    isBustedFunded: boolean;
    payoutCount: number;
    totalPayout: number;
}

export interface LiveDayRunOptions {
    commission: Dollars;
    plan: LivePlan;
    positionSizing: null | PositionSizingConfig;
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
    liveBustProbability: number;
    medianDaysToBust: number;
    medianDaysToFirstWithdrawal: number;
}

export interface LiveSimInputs {
    commissionPerRoundTrip?: number;
    horizonDays: number;
    instrument?: InstrumentSymbol;
    payoutRequestSize?: number;
    plan: LivePlan;
    rrRatio: number;
    seed: number;
    stopPoints?: number;
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
    breakEvenFundedProfit: number;
    bustProbability: number;
    costBreakdown: CostBreakdown;
    costPerDrawdownDollar: number;
    costPerFundedAccount: number;
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
    inactivityClosureProbability: number;
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
    evalTradesAtPass: number;
    finalBalance: number;
    firstPayoutDay: null | number;
    grossLosses: number;
    grossPayout: number;
    grossWins: number;
    had5LossStreak: boolean;
    had10LossStreak: boolean;
    maxDrawdown: number;
    maxLosingStreak: number;
    net: number;
    outcome: TrialOutcome;
    payoutCount: number;
    resetFeesPaid: number;
    totalCost: number;
    tradesTaken: number;
}
