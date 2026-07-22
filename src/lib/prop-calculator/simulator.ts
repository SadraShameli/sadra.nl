import { type AccountState } from './core/AccountState';
import { type CouponDiscounts } from './core/FeeSchedule';
import { type Plan } from './core/Plan';
import { mulberry32, type Rng } from './rng';
import { percentile } from './stats';

export type CorrelationMode = 'copy' | 'grouped' | 'independent';

export interface CostBreakdown {
    activationFee: number;
    evalFee: number;
    monthlySubsTotal: number;
    perAccountActivationFee: number;
    perAccountEvalFee: number;
    resetFeesTotal: number;
}

export type DayStopRule =
    | { dollars: number; kind: 'after-target' }
    | { k: number; kind: 'after-k-losses' }
    | { kind: 'first-win' }
    | { kind: 'none' };

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
    fundedHorizonDays: number;
    maxAttempts?: number;
    maxEvalDays: number;
    plan: Plan;
    riskPerTrade: number;
    rrRatio: number;
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
    roiOnCost: number;
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

interface PathStats {
    currentLossStreak: number;
    grossLosses: number;
    grossWins: number;
    maxDrawdown: number;
    maxLosingStreak: number;
    peakBalance: number;
    tradesTaken: number;
}

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

const TRADING_DAYS_PER_MONTH = 21;
const SAMPLE_CURVE_COUNT = 50;

type EvalAttemptOutcome = 'busted' | 'passed' | 'timed-out';

interface EvalAttemptResult {
    bestDayProfit: number;
    days: number;
    equityCurve: null | number[];
    outcome: EvalAttemptOutcome;
    state: AccountState;
    stats: PathStats;
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
    outcome: TrialOutcome;
    plan: Plan;
    resetFeesPaid: number;
}

export function simulate(inputs: SimInputs): SimOutputs {
    const {
        commissionPerRoundTrip = 0,
        copyAccounts = 1,
        dayStop,
        discounts,
        fundedHorizonDays,
        maxAttempts = 1,
        maxEvalDays,
        plan,
        riskPerTrade,
        rrRatio,
        seed,
        tradesPerDay,
        trials,
        winrate,
    } = inputs;
    const accountMultiplier = Math.max(1, Math.floor(copyAccounts));
    const rng = mulberry32(seed);

    const trialResults: TrialResult[] = [];
    for (let index = 0; index < trials; index++) {
        const stride = Math.max(1, Math.floor(trials / SAMPLE_CURVE_COUNT));
        const isCaptureEquity = index % stride === 0;
        trialResults.push(
            simulateTrial(
                plan,
                winrate,
                rrRatio,
                riskPerTrade,
                tradesPerDay,
                maxEvalDays,
                fundedHorizonDays,
                Math.max(1, maxAttempts),
                commissionPerRoundTrip,
                rng,
                isCaptureEquity,
                discounts,
                dayStop,
            ),
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
        if (
            r.firstPayoutDay !== null &&
            (r.outcome === 'pass-clean' || r.outcome === 'pass-violation')
        ) {
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
        if (r.outcome === 'pass-clean' || r.outcome === 'pass-violation') {
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
    const roiOnCost =
        expectedTotalCost > 0 ? expectedNet / expectedTotalCost : 0;

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
        dayStop,
        discounts,
        fundedHorizonDays,
        groups,
        maxAttempts = 1,
        maxEvalDays,
        plan,
        riskPerTrade,
        rrRatio,
        seed,
        tradesPerDay,
        trials,
        winrate,
    } = inputs;

    const N = Math.max(1, Math.floor(accounts));
    const groupSizes =
        correlation === 'copy'
            ? [N]
            : correlation === 'independent'
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
            const groupRng = mulberry32(seed + index * 1000 + g * 7919 + 1);
            const r = simulateTrial(
                plan,
                winrate,
                rrRatio,
                riskPerTrade,
                tradesPerDay,
                maxEvalDays,
                fundedHorizonDays,
                Math.max(1, maxAttempts),
                commissionPerRoundTrip,
                groupRng,
                false,
                discounts,
                dayStop,
            );
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
        outcome,
        plan,
        resetFeesPaid,
    } = arguments_;
    const grossPayout =
        outcome === 'pass-clean' || outcome === 'pass-violation'
            ? plan.payoutFromProfit(fundedProfit)
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

function isPassingOutcome(o: TrialOutcome): boolean {
    return o === 'pass-clean' || o === 'pass-violation';
}

function newPathStats(startingBalance: number): PathStats {
    return {
        currentLossStreak: 0,
        grossLosses: 0,
        grossWins: 0,
        maxDrawdown: 0,
        maxLosingStreak: 0,
        peakBalance: startingBalance,
        tradesTaken: 0,
    };
}

function rollUpStats(target: PathStats, source: PathStats): void {
    target.tradesTaken += source.tradesTaken;
    target.grossWins += source.grossWins;
    target.grossLosses += source.grossLosses;
    if (source.maxLosingStreak > target.maxLosingStreak) {
        target.maxLosingStreak = source.maxLosingStreak;
    }
    if (source.maxDrawdown > target.maxDrawdown) {
        target.maxDrawdown = source.maxDrawdown;
    }
}

function runDay(
    plan: Plan,
    state: AccountState,
    stats: PathStats,
    winrate: number,
    rrRatio: number,
    riskPerTrade: number,
    tradesPerDay: number,
    commission: number,
    rng: Rng,
    dayStop: DayStopRule | undefined,
): { busted: boolean; traded: boolean } {
    state.todayHigh = state.balance;
    state.todayPnL = 0;
    let isTraded = false;
    let lossesToday = 0;

    for (let t = 0; t < tradesPerDay; t++) {
        const isWon = rng() < winrate;
        const tradeGross = isWon ? rrRatio * riskPerTrade : -riskPerTrade;
        const pnl = tradeGross - commission;
        state.balance += pnl;
        state.todayPnL += pnl;
        isTraded = true;
        stats.tradesTaken += 1;
        if (state.balance > state.todayHigh) state.todayHigh = state.balance;
        if (state.balance > stats.peakBalance)
            stats.peakBalance = state.balance;
        const dd = stats.peakBalance - state.balance;
        if (dd > stats.maxDrawdown) stats.maxDrawdown = dd;
        if (isWon) {
            stats.grossWins += pnl;
            stats.currentLossStreak = 0;
        } else {
            stats.grossLosses += -pnl;
            stats.currentLossStreak += 1;
            lossesToday += 1;
            if (stats.currentLossStreak > stats.maxLosingStreak) {
                stats.maxLosingStreak = stats.currentLossStreak;
            }
        }
        plan.drawdown.onTrade(state, pnl);
        if (plan.isBust(state)) return { busted: true, traded: isTraded };
        if (shouldStopDay(dayStop, isWon, lossesToday, state.todayPnL)) break;
    }

    if (isTraded) state.tradingDays += 1;
    plan.drawdown.onDayClose(state);
    if (plan.isBust(state)) return { busted: true, traded: isTraded };
    return { busted: false, traded: isTraded };
}

function runEvalAttempt(
    plan: Plan,
    winrate: number,
    rrRatio: number,
    riskPerTrade: number,
    tradesPerDay: number,
    maxEvalDays: number,
    commission: number,
    rng: Rng,
    shouldCaptureEquity: boolean,
    dayStop: DayStopRule | undefined,
): EvalAttemptResult {
    const state = plan.initialState();
    const stats = newPathStats(state.startingBalance);
    const equityCurve: null | number[] = shouldCaptureEquity
        ? [state.balance]
        : null;
    let bestDayProfit = 0;
    let days = 0;
    let outcome: EvalAttemptOutcome = 'timed-out';

    for (let day = 0; day < maxEvalDays; day++) {
        const { busted } = runDay(
            plan,
            state,
            stats,
            winrate,
            rrRatio,
            riskPerTrade,
            tradesPerDay,
            commission,
            rng,
            dayStop,
        );
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

function runFundedHorizon(
    plan: Plan,
    attempt: EvalAttemptResult,
    winrate: number,
    rrRatio: number,
    riskPerTrade: number,
    tradesPerDay: number,
    fundedHorizonDays: number,
    commission: number,
    rng: Rng,
    dayStop: DayStopRule | undefined,
): { daysElapsed: number; isBustedFunded: boolean } {
    let daysElapsed = 0;
    let isBustedFunded = false;

    for (let day = 0; day < fundedHorizonDays; day++) {
        const { busted } = runDay(
            plan,
            attempt.state,
            attempt.stats,
            winrate,
            rrRatio,
            riskPerTrade,
            tradesPerDay,
            commission,
            rng,
            dayStop,
        );
        daysElapsed += 1;
        attempt.state.daysElapsed += 1;
        if (attempt.equityCurve) {
            attempt.equityCurve.push(attempt.state.balance);
        }

        if (busted) {
            isBustedFunded = true;
            break;
        }
    }

    return { daysElapsed, isBustedFunded };
}

function shouldStopDay(
    rule: DayStopRule | undefined,
    hasWon: boolean,
    lossesToday: number,
    pnlToday: number,
): boolean {
    if (!rule || rule.kind === 'none') return false;
    switch (rule.kind) {
        case 'after-k-losses': {
            return lossesToday >= rule.k;
        }
        case 'after-target': {
            return pnlToday >= rule.dollars;
        }
        case 'first-win': {
            return hasWon;
        }
    }
}

function simulateTrial(
    plan: Plan,
    winrate: number,
    rrRatio: number,
    riskPerTrade: number,
    tradesPerDay: number,
    maxEvalDays: number,
    fundedHorizonDays: number,
    maxAttempts: number,
    commission: number,
    rng: Rng,
    shouldCaptureEquity: boolean,
    discounts: CouponDiscounts | undefined,
    dayStop: DayStopRule | undefined,
): TrialResult {
    const cumulative = newPathStats(plan.accountSize);
    let cumulativeDays = 0;
    let attemptsUsed = 0;
    let resetFeesPaid = 0;

    for (;;) {
        attemptsUsed += 1;
        const attempt = runEvalAttempt(
            plan,
            winrate,
            rrRatio,
            riskPerTrade,
            tradesPerDay,
            maxEvalDays,
            commission,
            rng,
            shouldCaptureEquity,
            dayStop,
        );
        cumulativeDays += attempt.days;
        const lastEquityCurve = attempt.equityCurve;

        if (attempt.outcome === 'passed') {
            const passDay = attempt.days;
            const passBalance = attempt.state.balance;
            const evalTradesAtPass = attempt.stats.tradesTaken;

            const fundedHorizon = runFundedHorizon(
                plan,
                attempt,
                winrate,
                rrRatio,
                riskPerTrade,
                tradesPerDay,
                fundedHorizonDays,
                commission,
                rng,
                dayStop,
            );
            cumulativeDays += fundedHorizon.daysElapsed;
            const isBustedFunded = fundedHorizon.isBustedFunded;

            rollUpStats(cumulative, attempt.stats);

            const fundedProfit = Math.max(
                0,
                attempt.state.balance - passBalance,
            );
            let firstPayoutDay: null | number = null;
            if (fundedProfit >= plan.minPayoutProfit) {
                const earliest = passDay + plan.minDaysAfterPassForPayout;
                firstPayoutDay = Math.max(earliest, passDay + 1);
            }

            let isConsistencyViolated = false;
            const evalProfit = passBalance - attempt.state.startingBalance;
            if (
                plan.consistency &&
                plan.consistency.appliesToEval() &&
                plan.consistency.isViolated(attempt.bestDayProfit, evalProfit)
            ) {
                isConsistencyViolated = true;
            }

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
                outcome,
                plan,
                resetFeesPaid,
            });
        }

        rollUpStats(cumulative, attempt.stats);

        if (attempt.outcome === 'busted' && attemptsUsed < maxAttempts) {
            resetFeesPaid += plan.fees.reset;
            continue;
        }

        const finalOutcome: TrialOutcome =
            attempt.outcome === 'busted' ? 'bust-eval' : 'timeout-eval';
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
            outcome: finalOutcome,
            plan,
            resetFeesPaid,
        });
    }
}
