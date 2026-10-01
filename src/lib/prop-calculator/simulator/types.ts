import { type AccountState } from '~/lib/prop-calculator/core/AccountState';
import { type DatedCharge } from '~/lib/prop-calculator/core/DatedCharge';
import {
    type DayPolicy,
    type DayStopRule,
    type FundedCycleSnapshot,
    type RungSizing,
} from '~/lib/prop-calculator/core/DayPolicy';
import { type CouponDiscounts } from '~/lib/prop-calculator/core/FeeSchedule';
import {
    type FundedCycleSeed,
    type FundedCycleTracker,
} from '~/lib/prop-calculator/core/FundedPayoutCycle';
import { type InstrumentSymbol } from '~/lib/prop-calculator/core/Instruments';
import {
    type Dollars,
    type Fraction0to1,
} from '~/lib/prop-calculator/core/lib/units';
import { type LiveAccountState } from '~/lib/prop-calculator/core/LiveAccountState';
import { type LivePlan } from '~/lib/prop-calculator/core/LivePlan';
import { type PayoutRequestPolicy } from '~/lib/prop-calculator/core/PayoutRequestPolicy';
import { type Plan } from '~/lib/prop-calculator/core/Plan';
import { type PositionSizingConfig } from '~/lib/prop-calculator/core/PositionSizing';
import { type ReplacementInputs } from '~/lib/prop-calculator/core/Replacement';
import { type Roi } from '~/lib/prop-calculator/core/Roi';
import { type TradingPhase } from '~/lib/prop-calculator/core/TradingPhase';
import { type Rng } from '~/lib/prop-calculator/rng';
import {
    type Estimate,
    type UncertainValue,
} from '~/lib/prop-calculator/stats';

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
    start?: EvalAttemptStart;
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

export interface EvalAttemptStart {
    dayCap: number;
    state: AccountState;
}

export interface EvalDayRunOptions extends DayRunCommonOptions {
    phase: TradingPhase.Eval;
}

export interface EvalSimStart {
    phase: TradingPhase.Eval;
    state: AccountState;
    subscriptionElapsedDays?: number;
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
    equityCurve: null | number[];
    evalCost: number;
    evalDays: number;
    evalTradesAtPass: number;
    failedAttemptDays: number[];
    finalBalance: number;
    firstPayoutDay: null | number;
    fundedResetFeesPaid: number;
    fundedResetsUsed: number;
    horizonCredit: number;
    isAliveAtHorizon: boolean;
    outcome: TrialOutcome;
    payoutCount: number;
    resetFeesPaid: number;
    totalPayout: number;
    totals: TradeTotals;
}

export interface FromStateSimEstimates extends Omit<
    SimEstimates,
    'expectedMonthlyNet' | 'expectedMonthlyRealizedNet'
> {
    fromStateExpectedCash: UncertainValue;
    fromStateExpectedRealizedCash: UncertainValue;
}

export interface FromStateSimInputs extends SimInputs {
    start: SimStart;
}

export interface FromStateSimOutputs extends Omit<
    SimOutputs,
    | 'costBreakdown'
    | 'estimates'
    | 'expectedMonthlyNet'
    | 'expectedMonthlyRealizedNet'
> {
    estimates: FromStateSimEstimates;
    fromStateExpectedCash: number;
    fromStateExpectedRealizedCash: number;
    fromStateWindowDays: number;
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
    tradeRng?: (tradeIndex: number) => Rng;
    winrate: Fraction0to1;
}

export interface FundedFromStateOptions extends Omit<
    FundedHorizonOptions,
    'attempt'
> {
    equityCurve: null | number[];
    initialTracker?: FundedCycleTracker;
    priorFundedResetsUsed?: number;
    state: AccountState;
    stats: PhaseStats;
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
    payoutRequestPolicy?: PayoutRequestPolicy;
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
    isAliveAtHorizon: boolean;
    isBustedFunded: boolean;
    payoutCount: number;
    totalPayout: number;
}

export interface FundedSimStart {
    phase: TradingPhase.Funded;
    seed: FundedCycleSeed;
    state: AccountState;
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
    payoutRequestPolicy?: PayoutRequestPolicy;
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

export type SimStart = EvalSimStart | FundedSimStart;

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
    payoutRequestPolicy?: PayoutRequestPolicy;
    payoutRequestSize: Dollars | undefined;
    plan: Plan;
    positionSizing: null | PositionSizingConfig;
    rng: Rng;
    rrRatio: number;
    rungSizing: RungSizing;
    shouldCaptureEquity: boolean;
    start?: TrialStart;
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
    isAliveAtHorizon: boolean;
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

export type TrialStart =
    | FundedSimStart
    | {
          attempt: EvalAttemptStart;
          phase: TradingPhase.Eval;
          sunkSubscriptionDays: number;
      };

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
    tradeRng?: (tradeIndex: number) => Rng;
    winrate: Fraction0to1;
}

type EvalRetryLimit =
    | { maxAttempts: number; maxTotalEvalDays?: number }
    | { maxAttempts?: number; maxTotalEvalDays: number };
