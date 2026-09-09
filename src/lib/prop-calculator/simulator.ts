import { type AccountState } from './core/AccountState';
import { TRADING_DAYS_PER_MONTH } from './core/constants';
import {
    type DayPolicy,
    type DayStopRule,
    DayStopRuleKind,
    DEFAULT_RUNG_SIZING,
    flatDayPolicy,
    resolveTradeRisk,
    type RungSizing,
    shouldStopDay,
} from './core/DayPolicy';
import { type CouponDiscounts } from './core/FeeSchedule';
import {
    type FundedCycleTracker,
    newFundedCycleTracker,
    tryFundedPayout,
} from './core/FundedPayoutCycle';
import { type Plan } from './core/Plan';
import { type Roi, totalRoiOnCost } from './core/Roi';
import {
    type Dollars,
    dollars,
    fraction,
    type Fraction0to1,
} from './core/units';
import { deriveSubSeed, mulberry32, type Rng } from './rng';
import { percentile } from './stats';

export enum CorrelationMode {
    Copy = 'copy',
    Grouped = 'grouped',
    Independent = 'independent',
}

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

export type TrialOutcome =
    | 'bust-eval'
    | 'bust-funded'
    | 'pass-clean'
    | 'pass-violation'
    | 'timeout-eval';

interface TrialResult {
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

export class PathStats {
    currentLossStreak = 0;

    grossLosses = 0;

    grossWins = 0;

    maxDrawdown = 0;

    maxLosingStreak = 0;

    peakBalance: number;

    tradesTaken = 0;

    constructor(startingBalance: number) {
        this.peakBalance = startingBalance;
    }

    recordTrade(isWon: boolean, pnl: number, balance: number): void {
        this.tradesTaken += 1;
        if (balance > this.peakBalance) this.peakBalance = balance;
        const dd = this.peakBalance - balance;
        if (dd > this.maxDrawdown) this.maxDrawdown = dd;
        if (isWon) {
            this.grossWins += pnl;
            this.currentLossStreak = 0;
        } else {
            this.grossLosses += -pnl;
            this.currentLossStreak += 1;
            if (this.currentLossStreak > this.maxLosingStreak) {
                this.maxLosingStreak = this.currentLossStreak;
            }
        }
    }

    rollUp(source: PathStats): void {
        this.tradesTaken += source.tradesTaken;
        this.grossWins += source.grossWins;
        this.grossLosses += source.grossLosses;
        if (source.maxLosingStreak > this.maxLosingStreak) {
            this.maxLosingStreak = source.maxLosingStreak;
        }
        if (source.maxDrawdown > this.maxDrawdown) {
            this.maxDrawdown = source.maxDrawdown;
        }
    }
}

const SAMPLE_CURVE_COUNT = 50;

export type AttemptOutcome = 'busted' | 'passed' | 'timed-out';

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

interface FinishTrialArguments {
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

interface FundedHorizonOptions {
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

interface FundedHorizonResult {
    daysElapsed: number;
    firstPayoutDay: null | number;
    isBustedFunded: boolean;
    isClosed: boolean;
    payoutsIssued: number;
    totalPayout: number;
}

interface TrialOptions {
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

export function isPassingOutcome(o: TrialOutcome): boolean {
    return o === 'pass-clean' || o === 'pass-violation';
}

export function newPathStats(startingBalance: number): PathStats {
    return new PathStats(startingBalance);
}

export function resolveDayPolicy(
    inputs: SimInputs,
    phase: 'eval' | 'funded',
): DayPolicy {
    const declared =
        phase === 'eval' ? inputs.evalDayPolicy : inputs.fundedDayPolicy;
    return (
        declared ??
        flatDayPolicy(
            inputs.riskPerTrade,
            inputs.tradesPerDay,
            inputs.dayStop ?? { kind: DayStopRuleKind.None },
        )
    );
}

export function runDay(options: DayRunOptions): {
    busted: boolean;
    traded: boolean;
} {
    const {
        commission,
        dayPolicy,
        phase,
        plan,
        rng,
        rrRatio,
        rungSizing,
        state,
        stats,
        winrate,
    } = options;
    state.todayHigh = state.balance;
    state.todayPnL = 0;
    let isTraded = false;
    let lossesToday = 0;

    for (const intendedRisk of dayPolicy.ladder) {
        const cushion = state.balance - state.threshold;
        const risk = resolveTradeRisk(intendedRisk, cushion, rungSizing);
        if (risk <= 0) break;

        const isWon = rng() < winrate;
        const tradeGross = isWon ? rrRatio * risk : -risk;
        const pnl = tradeGross - commission;
        state.balance += pnl;
        state.todayPnL += pnl;
        isTraded = true;
        if (state.balance > state.todayHigh) state.todayHigh = state.balance;
        stats.recordTrade(isWon, pnl, state.balance);
        if (!isWon) lossesToday += 1;
        plan.drawdown.onTrade(state, pnl);
        if (plan.isBust(state, phase)) {
            return { busted: true, traded: isTraded };
        }
        if (
            dayPolicy.maxLossesPerDay !== null &&
            lossesToday >= dayPolicy.maxLossesPerDay
        ) {
            break;
        }
        if (
            shouldStopDay(
                dayPolicy.stopRule,
                isWon,
                lossesToday,
                state.todayPnL,
            )
        ) {
            break;
        }
    }

    if (isTraded) {
        state.tradingDays += 1;
        if (state.todayPnL >= (plan.minQualifyingDayProfit ?? -Infinity)) {
            state.qualifyingDays += 1;
        }
    }
    plan.drawdown.onDayClose(state);
    if (plan.isBust(state, phase)) return { busted: true, traded: isTraded };
    return { busted: false, traded: isTraded };
}

export function runEvalAttempt(options: EvalAttemptOptions): EvalAttemptResult {
    const {
        commission,
        dayPolicy,
        maxEvalDays,
        plan,
        rng,
        rrRatio,
        rungSizing,
        shouldCaptureEquity,
        winrate,
    } = options;
    const state = plan.initialState();
    const stats = newPathStats(state.startingBalance);
    const equityCurve: null | number[] = shouldCaptureEquity
        ? [state.balance]
        : null;
    let bestDayProfit = 0;
    let days = 0;
    let outcome: AttemptOutcome = 'timed-out';

    for (let day = 0; day < maxEvalDays; day++) {
        const { busted } = runDay({
            commission,
            dayPolicy,
            phase: 'eval',
            plan,
            rng,
            rrRatio,
            rungSizing,
            state,
            stats,
            winrate,
        });
        days += 1;
        state.daysElapsed = days;
        if (state.todayPnL > bestDayProfit) bestDayProfit = state.todayPnL;
        if (state.todayPnL > state.bestDayProfit) {
            state.bestDayProfit = state.todayPnL;
        }
        if (equityCurve) equityCurve.push(state.balance);

        if (busted) {
            outcome = 'busted';
            break;
        }
        if (plan.isPassed(state)) {
            outcome = 'passed';
            break;
        }
    }

    return { bestDayProfit, days, equityCurve, outcome, state, stats };
}

export function runEvalWithRetries(
    options: EvalWithRetriesOptions,
): EvalWithRetriesResult {
    const {
        commission,
        dayPolicy,
        maxAttempts,
        maxEvalDays,
        onFailedAttempt,
        plan,
        rng,
        rrRatio,
        rungSizing,
        shouldCaptureEquity,
        winrate,
    } = options;
    let daysElapsed = 0;
    let attemptsUsed = 0;
    let resetFeesPaid = 0;

    for (;;) {
        attemptsUsed += 1;
        const attempt = runEvalAttempt({
            commission,
            dayPolicy,
            maxEvalDays,
            plan,
            rng,
            rrRatio,
            rungSizing,
            shouldCaptureEquity,
            winrate,
        });
        daysElapsed += attempt.days;

        if (attempt.outcome === 'passed') {
            return {
                attempt,
                attemptsUsed,
                daysElapsed,
                resetFeesPaid,
                terminalOutcome: null,
            };
        }

        onFailedAttempt?.(attempt);

        if (attempt.outcome === 'busted' && attemptsUsed < maxAttempts) {
            resetFeesPaid += plan.fees.reset;
            continue;
        }

        return {
            attempt,
            attemptsUsed,
            daysElapsed,
            resetFeesPaid,
            terminalOutcome:
                attempt.outcome === 'busted' ? 'busted' : 'timed-out',
        };
    }
}

export function simulate(inputs: SimInputs): SimOutputs {
    const {
        commissionPerRoundTrip = 0,
        copyAccounts = 1,
        discounts,
        fundedHorizonDays,
        maxAttempts = 1,
        maxEvalDays,
        minRetainedCushion = 0,
        payoutRequestSize,
        plan,
        riskPerTrade,
        rrRatio,
        rungSizing = DEFAULT_RUNG_SIZING,
        seed,
        trials,
    } = inputs;
    const commission = dollars(commissionPerRoundTrip);
    const cushion = dollars(minRetainedCushion);
    const requestSize =
        payoutRequestSize === undefined
            ? undefined
            : dollars(payoutRequestSize);
    const winrate = fraction(inputs.winrate);
    const evalDayPolicy = resolveDayPolicy(inputs, 'eval');
    const fundedDayPolicy = resolveDayPolicy(inputs, 'funded');
    const accountMultiplier = Math.max(1, Math.floor(copyAccounts));
    const rng = mulberry32(seed);

    const trialResults: TrialResult[] = [];
    for (let index = 0; index < trials; index++) {
        const stride = Math.max(1, Math.floor(trials / SAMPLE_CURVE_COUNT));
        const isCaptureEquity = index % stride === 0;
        trialResults.push(
            simulateTrial({
                commission,
                discounts,
                evalDayPolicy,
                fundedDayPolicy,
                fundedHorizonDays,
                maxAttempts: Math.max(1, maxAttempts),
                maxEvalDays,
                minRetainedCushion: cushion,
                payoutRequestSize: requestSize,
                plan,
                rng,
                rrRatio,
                rungSizing,
                shouldCaptureEquity: isCaptureEquity,
                winrate,
            }),
        );
    }

    const counts: Record<TrialOutcome, number> = {
        'bust-eval': 0,
        'bust-funded': 0,
        'pass-clean': 0,
        'pass-violation': 0,
        'timeout-eval': 0,
    };
    let netSum = 0;
    let costSum = 0;
    let payoutSum = 0;
    let dayElapsedSum = 0;
    let daysToPassSum = 0;
    let firstPayoutSum = 0;
    let firstPayoutCount = 0;
    let grossWinsSum = 0;
    let grossLossesSum = 0;
    let passingTradesSum = 0;
    let passingTrialsCount = 0;
    let perTradePnLSum = 0;
    let perTradePnLCount = 0;
    let had5LossCount = 0;
    let had10LossCount = 0;
    let attemptsSum = 0;
    let resetFeesSum = 0;
    const sampleEquityCurves: number[][] = [];
    const finalBalances: number[] = [];
    const maxDrawdowns: number[] = [];
    const maxLosingStreaks: number[] = [];
    const daysToPassArray: number[] = [];
    const attemptsArray: number[] = [];
    const grossSpendArray: number[] = [];

    for (const r of trialResults) {
        counts[r.outcome] += 1;
        netSum += r.net;
        costSum += r.totalCost;
        payoutSum += r.grossPayout;
        dayElapsedSum += r.daysElapsed;
        if (r.daysToPass !== null) {
            daysToPassSum += r.daysToPass;
            daysToPassArray.push(r.daysToPass);
        }
        if (r.firstPayoutDay !== null && isPassingOutcome(r.outcome)) {
            firstPayoutSum += r.firstPayoutDay;
            firstPayoutCount += 1;
        }
        if (r.equityCurve) sampleEquityCurves.push(r.equityCurve);
        finalBalances.push(r.finalBalance);
        maxDrawdowns.push(r.maxDrawdown);
        maxLosingStreaks.push(r.maxLosingStreak);
        grossWinsSum += r.grossWins;
        grossLossesSum += r.grossLosses;
        if (r.tradesTaken > 0) {
            perTradePnLSum += (r.grossWins - r.grossLosses) / r.tradesTaken;
            perTradePnLCount += 1;
        }
        if (isPassingOutcome(r.outcome)) {
            passingTradesSum += r.evalTradesAtPass;
            passingTrialsCount += 1;
        }
        if (r.had5LossStreak) had5LossCount += 1;
        if (r.had10LossStreak) had10LossCount += 1;
        attemptsSum += r.attemptsUsed;
        attemptsArray.push(r.attemptsUsed);
        resetFeesSum += r.resetFeesPaid;
        grossSpendArray.push(r.totalCost);
    }

    const passes = counts['pass-clean'] + counts['pass-violation'];
    const totalTrials = trials || 1;
    const expectedDaysPerTrial = dayElapsedSum / totalTrials || 1;
    const expectedNet = netSum / totalTrials;
    const expectedTotalCost = costSum / totalTrials;
    const expectedGrossPayout = payoutSum / totalTrials;
    const expectedMonthlyNet =
        (expectedNet * TRADING_DAYS_PER_MONTH) / expectedDaysPerTrial;

    const expectancyDollars =
        perTradePnLCount > 0 ? perTradePnLSum / perTradePnLCount : 0;
    const expectancyR = riskPerTrade > 0 ? expectancyDollars / riskPerTrade : 0;
    const profitFactor =
        grossLossesSum > 0
            ? grossWinsSum / grossLossesSum
            : grossWinsSum > 0
              ? Infinity
              : 0;
    const tradesPerSuccessfulAttempt =
        passingTrialsCount > 0 ? passingTradesSum / passingTrialsCount : 0;
    const roiOnCost = totalRoiOnCost(expectedNet, expectedTotalCost);

    const avgDaysForCost =
        passes > 0 ? daysToPassSum / passes : expectedDaysPerTrial;
    const avgResetFees = resetFeesSum / totalTrials;
    const costBreakdown = buildCostBreakdown(
        plan,
        discounts,
        avgDaysForCost,
        avgResetFees,
    );

    const expectedAttempts = attemptsSum / totalTrials;
    const expectedAttemptsP90 = percentile(attemptsArray, 90);
    const expectedGrossSpend = expectedTotalCost;
    const expectedSpendP90 = percentile(grossSpendArray, 90);
    const breakEvenFundedProfit = expectedTotalCost;

    const m = accountMultiplier;
    return {
        accountSize: plan.accountSize,
        breakEvenFundedProfit: breakEvenFundedProfit * m,
        bustProbability: counts['bust-eval'] / totalTrials,
        cleanPassProbability: counts['pass-clean'] / totalTrials,
        costBreakdown: {
            activationFee: costBreakdown.activationFee * m,
            evalFee: costBreakdown.evalFee * m,
            monthlySubsTotal: costBreakdown.monthlySubsTotal * m,
            perAccountActivationFee: costBreakdown.perAccountActivationFee,
            perAccountEvalFee: costBreakdown.perAccountEvalFee,
            resetFeesTotal: costBreakdown.resetFeesTotal * m,
        },
        daysToPassP5: percentile(daysToPassArray, 5),
        daysToPassP25: percentile(daysToPassArray, 25),
        daysToPassP50: percentile(daysToPassArray, 50),
        daysToPassP75: percentile(daysToPassArray, 75),
        daysToPassP95: percentile(daysToPassArray, 95),
        daysToPassValues: daysToPassArray,
        drawdownAmount: plan.drawdown.amount,
        expectancyDollars,
        expectancyR,
        expectedAttempts,
        expectedAttemptsP90,
        expectedDaysToPass:
            daysToPassArray.length > 0
                ? daysToPassSum / daysToPassArray.length
                : 0,
        expectedFirstPayoutDay:
            firstPayoutCount > 0 ? firstPayoutSum / firstPayoutCount : 0,
        expectedGrossPayout: expectedGrossPayout * m,
        expectedGrossSpend: expectedGrossSpend * m,
        expectedMonthlyNet: expectedMonthlyNet * m,
        expectedNet: expectedNet * m,
        expectedSpendP90: expectedSpendP90 * m,
        expectedTotalCost: expectedTotalCost * m,
        finalBalanceP5: percentile(finalBalances, 5),
        finalBalanceP25: percentile(finalBalances, 25),
        finalBalanceP50: percentile(finalBalances, 50),
        finalBalanceP75: percentile(finalBalances, 75),
        finalBalanceP95: percentile(finalBalances, 95),
        finalBalances,
        fundedBustProbability: counts['bust-funded'] / totalTrials,
        initialThreshold: plan.drawdown.initialThreshold(plan.accountSize),
        maxDrawdownP50: percentile(maxDrawdowns, 50),
        maxDrawdownP95: percentile(maxDrawdowns, 95),
        maxLosingStreakP50: percentile(maxLosingStreaks, 50),
        maxLosingStreakP95: percentile(maxLosingStreaks, 95),
        passProbability: passes / totalTrials,
        profitFactor,
        profitTarget: plan.profitTarget,
        risk5LossesPercent: had5LossCount / totalTrials,
        risk10LossesPercent: had10LossCount / totalTrials,
        roiOnCost,
        sampleEquityCurves,
        timeoutProbability: counts['timeout-eval'] / totalTrials,
        tradesPerSuccessfulAttempt,
    };
}

export function simulatePortfolio(
    inputs: PortfolioSimInputs,
): MultiAccountResult {
    const {
        accounts,
        commissionPerRoundTrip = 0,
        correlation,
        discounts,
        fundedHorizonDays,
        groups,
        maxAttempts = 1,
        maxEvalDays,
        minRetainedCushion = 0,
        payoutRequestSize,
        plan,
        rrRatio,
        rungSizing = DEFAULT_RUNG_SIZING,
        seed,
        trials,
        winrate: winrateInput,
    } = inputs;
    const commission = dollars(commissionPerRoundTrip);
    const cushion = dollars(minRetainedCushion);
    const requestSize =
        payoutRequestSize === undefined
            ? undefined
            : dollars(payoutRequestSize);
    const winrate = fraction(winrateInput);
    const evalDayPolicy = resolveDayPolicy(inputs, 'eval');
    const fundedDayPolicy = resolveDayPolicy(inputs, 'funded');

    const N = Math.max(1, Math.floor(accounts));
    const groupSizes =
        correlation === CorrelationMode.Copy
            ? [N]
            : correlation === CorrelationMode.Independent
              ? Array.from({ length: N }, () => 1)
              : buildGroupSizes(N, groups);

    const distribution = Array.from({ length: N + 1 }, () => 0);
    let netSum = 0;
    let dayElapsedSum = 0;
    let daysToPassSum = 0;
    let daysToPassCount = 0;
    let bustTrials = 0;
    let totalAccountPasses = 0;
    let tradesTakenSum = 0;
    let activeDaysSum = 0;
    let maxStreakSum = 0;

    for (let index = 0; index < trials; index++) {
        let trialPasses = 0;
        let trialNet = 0;
        let trialDayElapsed = 0;
        let trialDaysToPassSum = 0;
        let trialDaysToPassCount = 0;
        let isAnyBust = false;
        let trialTrades = 0;
        let trialActiveDays = 0;
        let trialMaxStreak = 0;

        for (const [g, groupSize] of groupSizes.entries()) {
            const size = groupSize;
            const groupRng = mulberry32(deriveSubSeed(seed, index, g));
            const r = simulateTrial({
                commission,
                discounts,
                evalDayPolicy,
                fundedDayPolicy,
                fundedHorizonDays,
                maxAttempts: Math.max(1, maxAttempts),
                maxEvalDays,
                minRetainedCushion: cushion,
                payoutRequestSize: requestSize,
                plan,
                rng: groupRng,
                rrRatio,
                rungSizing,
                shouldCaptureEquity: false,
                winrate,
            });
            const isPasses = isPassingOutcome(r.outcome);
            if (isPasses) trialPasses += size;
            if (r.outcome === 'bust-eval' || r.outcome === 'bust-funded')
                isAnyBust = true;
            trialNet += r.net * size;
            trialDayElapsed += r.daysElapsed * size;
            if (r.daysToPass !== null) {
                trialDaysToPassSum += r.daysToPass * size;
                trialDaysToPassCount += size;
            }
            trialTrades += r.tradesTaken * size;
            trialActiveDays += Math.max(1, r.daysElapsed) * size;
            if (r.maxLosingStreak > trialMaxStreak)
                trialMaxStreak = r.maxLosingStreak;
        }

        distribution[trialPasses] = (distribution[trialPasses] ?? 0) + 1;
        netSum += trialNet;
        dayElapsedSum += trialDayElapsed;
        daysToPassSum += trialDaysToPassSum;
        daysToPassCount += trialDaysToPassCount;
        if (isAnyBust) bustTrials += 1;
        totalAccountPasses += trialPasses;
        tradesTakenSum += trialTrades;
        activeDaysSum += trialActiveDays;
        maxStreakSum += trialMaxStreak;
    }

    const totalTrials = Math.max(1, trials);
    for (let k = 0; k <= N; k++)
        distribution[k] = (distribution[k] ?? 0) / totalTrials;

    const perAccountPass = totalAccountPasses / (totalTrials * N);
    const expectedAccountsPass = totalAccountPasses / totalTrials;

    let pAtLeast1 = 0;
    let pAtLeastHalf = 0;
    let pAll = 0;
    const halfK = Math.ceil(N / 2);
    for (let k = 0; k <= N; k++) {
        const pk = distribution[k] ?? 0;
        if (k >= 1) pAtLeast1 += pk;
        if (k >= halfK) pAtLeastHalf += pk;
        if (k >= N) pAll += pk;
    }

    const expectedNet = netSum / totalTrials;
    const expectedDaysPerTrial = dayElapsedSum / (totalTrials * N) || 1;
    const expectedMonthlyNet =
        (expectedNet * TRADING_DAYS_PER_MONTH) / expectedDaysPerTrial;
    const expectedDaysToPass =
        daysToPassCount > 0 ? daysToPassSum / daysToPassCount : 0;
    const expectedMaxLossStreak = maxStreakSum / totalTrials;
    const meanTradesPerDay =
        activeDaysSum > 0 ? tradesTakenSum / activeDaysSum : 0;

    return {
        accountsPassDistribution: distribution,
        expectedAccountsPass,
        expectedDaysToPass,
        expectedMaxLossStreak,
        expectedMonthlyNet,
        expectedNet,
        meanTradesPerDay,
        pAtLeast: { k1: pAtLeast1, kAll: pAll, kHalf: pAtLeastHalf },
        perAccountPass,
        pHitDDLimit: bustTrials / totalTrials,
        theoreticalPassProb: 0,
    };
}

export function stepFundedDay(options: FundedDayStepOptions): {
    busted: boolean;
} {
    const {
        commission,
        dayPolicy,
        plan,
        rng,
        rrRatio,
        rungSizing,
        state,
        stats,
        tracker,
        winrate,
    } = options;
    const { busted } = runDay({
        commission,
        dayPolicy,
        phase: 'funded',
        plan,
        rng,
        rrRatio,
        rungSizing,
        state,
        stats,
        winrate,
    });
    if (state.todayPnL > tracker.cycleBestDayProfit) {
        tracker.cycleBestDayProfit = state.todayPnL;
    }
    return { busted };
}

function buildCostBreakdown(
    plan: Plan,
    discounts: CouponDiscounts | undefined,
    avgDays: number,
    avgResetFees: number,
): CostBreakdown {
    const evalFactor = 1 - (discounts?.evalPercent ?? 0) / 100;
    const activationFactor = 1 - (discounts?.activationPercent ?? 0) / 100;
    const months = Math.max(1, Math.ceil(avgDays / TRADING_DAYS_PER_MONTH));
    const perAccountEvalFee = plan.fees.oneTimeEval * evalFactor;
    const perAccountActivationFee = plan.fees.activation * activationFactor;
    return {
        activationFee: perAccountActivationFee,
        evalFee: perAccountEvalFee,
        monthlySubsTotal: plan.fees.monthlySubscription * months,
        perAccountActivationFee,
        perAccountEvalFee,
        resetFeesTotal: avgResetFees,
    };
}

function buildGroupSizes(N: number, groups: number): number[] {
    const G = Math.max(1, Math.min(groups, N));
    const base = Math.floor(N / G);
    const extra = N - base * G;
    const out: number[] = [];
    for (let g = 0; g < G; g++) out.push(base + (g < extra ? 1 : 0));
    return out;
}

function finishTrial(arguments_: FinishTrialArguments): TrialResult {
    const {
        attemptsUsed,
        cumulative,
        cumulativeDays,
        daysToPass,
        discounts,
        equityCurve,
        evalTradesAtPass,
        finalBalance,
        firstPayoutDay,
        fundedProfit,
        ladderPayout,
        outcome,
        plan,
        resetFeesPaid,
    } = arguments_;
    const isPassed = isPassingOutcome(outcome);
    const grossPayout = isPassed
        ? plan.payoutLadder
            ? ladderPayout
            : plan.payoutFromProfit(fundedProfit)
        : 0;
    const baseCost = plan.totalCostThroughDay(cumulativeDays, discounts);
    const totalCost = baseCost + resetFeesPaid;
    const net = grossPayout - totalCost;
    return {
        attemptsUsed,
        daysElapsed: cumulativeDays,
        daysToPass,
        equityCurve,
        evalTradesAtPass,
        finalBalance,
        firstPayoutDay,
        fundedProfit,
        grossLosses: cumulative.grossLosses,
        grossPayout,
        grossWins: cumulative.grossWins,
        had5LossStreak: cumulative.maxLosingStreak >= 5,
        had10LossStreak: cumulative.maxLosingStreak >= 10,
        maxDrawdown: cumulative.maxDrawdown,
        maxLosingStreak: cumulative.maxLosingStreak,
        net,
        outcome,
        resetFeesPaid,
        totalCost,
        tradesTaken: cumulative.tradesTaken,
    };
}

function runFundedHorizon(options: FundedHorizonOptions): FundedHorizonResult {
    const {
        attempt,
        commission,
        dayPolicy,
        fundedHorizonDays,
        minRetainedCushion,
        payoutRequestSize,
        plan,
        rng,
        rrRatio,
        rungSizing,
        winrate,
    } = options;
    const { state } = attempt;
    state.fundingBaseline = state.balance;

    const ladder = plan.payoutLadder;
    let daysElapsed = 0;
    let isBustedFunded = false;
    let isClosed = false;
    let totalPayout = 0;
    let firstPayoutDay: null | number = null;
    const tracker = newFundedCycleTracker(state);

    for (let day = 0; day < fundedHorizonDays; day++) {
        const { busted } = stepFundedDay({
            commission,
            dayPolicy,
            plan,
            rng,
            rrRatio,
            rungSizing,
            state,
            stats: attempt.stats,
            tracker,
            winrate,
        });
        daysElapsed += 1;
        state.daysElapsed += 1;
        if (attempt.equityCurve) {
            attempt.equityCurve.push(state.balance);
        }

        if (busted) {
            isBustedFunded = true;
            break;
        }

        const payout = tryFundedPayout({
            maxPayouts: Infinity,
            minRetainedCushion,
            payoutRequestSize,
            plan,
            state,
            tracker,
        });
        if (payout === null) continue;

        totalPayout += payout.traderReceives;
        firstPayoutDay ??= daysElapsed;

        if (ladder && tracker.payoutsIssued >= ladder.steps.length) {
            isClosed = true;
            break;
        }
    }

    return {
        daysElapsed,
        firstPayoutDay,
        isBustedFunded,
        isClosed,
        payoutsIssued: tracker.payoutsIssued,
        totalPayout,
    };
}

function simulateTrial(options: TrialOptions): TrialResult {
    const {
        commission,
        discounts,
        evalDayPolicy,
        fundedDayPolicy,
        fundedHorizonDays,
        maxAttempts,
        maxEvalDays,
        minRetainedCushion,
        payoutRequestSize,
        plan,
        rng,
        rrRatio,
        rungSizing,
        shouldCaptureEquity,
        winrate,
    } = options;
    const cumulative = newPathStats(plan.accountSize);

    const retryResult = runEvalWithRetries({
        commission,
        dayPolicy: evalDayPolicy,
        maxAttempts,
        maxEvalDays,
        onFailedAttempt: (failedAttempt) =>
            cumulative.rollUp(failedAttempt.stats),
        plan,
        rng,
        rrRatio,
        rungSizing,
        shouldCaptureEquity,
        winrate,
    });
    const { attempt, attemptsUsed, resetFeesPaid } = retryResult;
    let cumulativeDays = retryResult.daysElapsed;
    const lastEquityCurve = attempt.equityCurve;

    if (retryResult.terminalOutcome === null) {
        const passDay = attempt.days;
        const passBalance = attempt.state.balance;
        const evalTradesAtPass = attempt.stats.tradesTaken;

        const fundedHorizon = runFundedHorizon({
            attempt,
            commission,
            dayPolicy: fundedDayPolicy,
            fundedHorizonDays,
            minRetainedCushion,
            payoutRequestSize,
            plan,
            rng,
            rrRatio,
            rungSizing,
            winrate,
        });
        cumulativeDays += fundedHorizon.daysElapsed;
        const isBustedFunded = fundedHorizon.isBustedFunded;

        cumulative.rollUp(attempt.stats);

        const fundedProfit = Math.max(0, attempt.state.balance - passBalance);
        let firstPayoutDay: null | number = null;
        if (plan.payoutLadder) {
            firstPayoutDay =
                fundedHorizon.firstPayoutDay === null
                    ? null
                    : passDay + fundedHorizon.firstPayoutDay;
        } else if (fundedProfit >= plan.minPayoutProfit) {
            const earliest = passDay + plan.minDaysAfterPassForPayout;
            firstPayoutDay = Math.max(earliest, passDay + 1);
        }

        const evalProfit = passBalance - attempt.state.startingBalance;
        const isConsistencyViolated =
            plan
                .evalConsistencyRule()
                ?.isViolated(attempt.bestDayProfit, evalProfit) ?? false;

        let outcome: TrialOutcome;
        if (isBustedFunded) outcome = 'bust-funded';
        else if (isConsistencyViolated) outcome = 'pass-violation';
        else outcome = 'pass-clean';

        return finishTrial({
            attemptsUsed,
            cumulative,
            cumulativeDays,
            daysToPass: passDay,
            discounts,
            equityCurve: lastEquityCurve,
            evalTradesAtPass,
            finalBalance: attempt.state.balance,
            firstPayoutDay,
            fundedProfit,
            ladderPayout: fundedHorizon.totalPayout,
            outcome,
            plan,
            resetFeesPaid,
        });
    }

    const finalOutcome: TrialOutcome =
        retryResult.terminalOutcome === 'busted' ? 'bust-eval' : 'timeout-eval';
    return finishTrial({
        attemptsUsed,
        cumulative,
        cumulativeDays,
        daysToPass: null,
        discounts,
        equityCurve: lastEquityCurve,
        evalTradesAtPass: 0,
        finalBalance: attempt.state.balance,
        firstPayoutDay: null,
        fundedProfit: 0,
        ladderPayout: 0,
        outcome: finalOutcome,
        plan,
        resetFeesPaid,
    });
}
