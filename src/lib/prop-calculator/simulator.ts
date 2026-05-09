import { type AccountState } from './core/AccountState';
import { type CouponDiscounts } from './core/FeeSchedule';
import { type Plan } from './core/Plan';
import { mulberry32, type Rng } from './rng';
import { percentile } from './stats';

export interface SimInputs {
    plan: Plan;
    winrate: number;
    rrRatio: number;
    riskPerTrade: number;
    tradesPerDay: number;
    maxEvalDays: number;
    fundedHorizonDays: number;
    trials: number;
    seed: number;
    discounts?: CouponDiscounts;
    commissionPerRoundTrip?: number;
    maxAttempts?: number;
    copyAccounts?: number;
}

export type TrialOutcome =
    | 'bust-eval'
    | 'timeout-eval'
    | 'pass-clean'
    | 'pass-violation'
    | 'bust-funded';

export interface CostBreakdown {
    evalFee: number;
    activationFee: number;
    monthlySubsTotal: number;
    resetFeesTotal: number;
}

export interface SimOutputs {
    passProbability: number;
    cleanPassProbability: number;
    bustProbability: number;
    timeoutProbability: number;
    fundedBustProbability: number;
    expectedDaysToPass: number;
    expectedFirstPayoutDay: number;
    expectedTotalCost: number;
    expectedGrossPayout: number;
    expectedNet: number;
    expectedMonthlyNet: number;
    sampleEquityCurves: number[][];
    accountSize: number;
    profitTarget: number;
    drawdownAmount: number;
    initialThreshold: number;
    expectancyDollars: number;
    expectancyR: number;
    profitFactor: number;
    maxLosingStreakP50: number;
    maxLosingStreakP95: number;
    risk5LossesPercent: number;
    risk10LossesPercent: number;
    maxDrawdownP50: number;
    maxDrawdownP95: number;
    finalBalanceP5: number;
    finalBalanceP25: number;
    finalBalanceP50: number;
    finalBalanceP75: number;
    finalBalanceP95: number;
    daysToPassP25: number;
    daysToPassP50: number;
    daysToPassP75: number;
    tradesPerSuccessfulAttempt: number;
    roiOnCost: number;
    costBreakdown: CostBreakdown;
    expectedAttempts: number;
    expectedAttemptsP90: number;
    expectedGrossSpend: number;
    expectedSpendP90: number;
    breakEvenFundedProfit: number;
    finalBalances: number[];
    daysToPassValues: number[];
}

interface TrialResult {
    outcome: TrialOutcome;
    daysElapsed: number;
    daysToPass: number | null;
    fundedProfit: number;
    grossPayout: number;
    totalCost: number;
    net: number;
    firstPayoutDay: number | null;
    equityCurve: number[] | null;
    finalBalance: number;
    maxDrawdown: number;
    grossWins: number;
    grossLosses: number;
    maxLosingStreak: number;
    tradesTaken: number;
    had5LossStreak: boolean;
    had10LossStreak: boolean;
    attemptsUsed: number;
    resetFeesPaid: number;
}

interface PathStats {
    peakBalance: number;
    maxDrawdown: number;
    grossWins: number;
    grossLosses: number;
    currentLossStreak: number;
    maxLosingStreak: number;
    tradesTaken: number;
}

const TRADING_DAYS_PER_MONTH = 21;
const SAMPLE_CURVE_COUNT = 50;

function newPathStats(startingBalance: number): PathStats {
    return {
        peakBalance: startingBalance,
        maxDrawdown: 0,
        grossWins: 0,
        grossLosses: 0,
        currentLossStreak: 0,
        maxLosingStreak: 0,
        tradesTaken: 0,
    };
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
): { busted: boolean; traded: boolean } {
    state.todayHigh = state.balance;
    state.todayPnL = 0;
    let traded = false;

    for (let t = 0; t < tradesPerDay; t++) {
        const won = rng() < winrate;
        const tradeGross = won ? rrRatio * riskPerTrade : -riskPerTrade;
        const pnl = tradeGross - commission;
        state.balance += pnl;
        state.todayPnL += pnl;
        traded = true;
        stats.tradesTaken += 1;
        if (state.balance > state.todayHigh) state.todayHigh = state.balance;
        if (state.balance > stats.peakBalance)
            stats.peakBalance = state.balance;
        const dd = stats.peakBalance - state.balance;
        if (dd > stats.maxDrawdown) stats.maxDrawdown = dd;
        if (won) {
            stats.grossWins += pnl;
            stats.currentLossStreak = 0;
        } else {
            stats.grossLosses += -pnl;
            stats.currentLossStreak += 1;
            if (stats.currentLossStreak > stats.maxLosingStreak) {
                stats.maxLosingStreak = stats.currentLossStreak;
            }
        }
        plan.drawdown.onTrade(state, pnl);
        if (plan.isBust(state)) return { busted: true, traded };
    }

    if (traded) state.tradingDays += 1;
    plan.drawdown.onDayClose(state);
    if (plan.isBust(state)) return { busted: true, traded };
    return { busted: false, traded };
}

type EvalAttemptOutcome = 'busted' | 'timed-out' | 'passed';

interface EvalAttemptResult {
    outcome: EvalAttemptOutcome;
    state: AccountState;
    stats: PathStats;
    days: number;
    bestDayProfit: number;
    equityCurve: number[] | null;
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
    captureEquity: boolean,
): EvalAttemptResult {
    const state = plan.initialState();
    const stats = newPathStats(state.startingBalance);
    const equityCurve: number[] | null = captureEquity ? [state.balance] : null;
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

    return { outcome, state, stats, days, bestDayProfit, equityCurve };
}

function rollUpStats(target: PathStats, src: PathStats): void {
    target.tradesTaken += src.tradesTaken;
    target.grossWins += src.grossWins;
    target.grossLosses += src.grossLosses;
    if (src.maxLosingStreak > target.maxLosingStreak) {
        target.maxLosingStreak = src.maxLosingStreak;
    }
    if (src.maxDrawdown > target.maxDrawdown) {
        target.maxDrawdown = src.maxDrawdown;
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
    captureEquity: boolean,
    discounts: CouponDiscounts | undefined,
): TrialResult {
    const cumulative = newPathStats(plan.accountSize);
    let cumulativeDays = 0;
    let attemptsUsed = 0;
    let resetFeesPaid = 0;
    let lastEquityCurve: number[] | null = null;

    while (true) {
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
            captureEquity,
        );
        cumulativeDays += attempt.days;
        lastEquityCurve = attempt.equityCurve;

        if (attempt.outcome === 'passed') {
            const passDay = attempt.days;
            const passBalance = attempt.state.balance;
            let bustedFunded = false;

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
                );
                cumulativeDays += 1;
                attempt.state.daysElapsed += 1;
                if (lastEquityCurve)
                    lastEquityCurve.push(attempt.state.balance);
                if (busted) {
                    bustedFunded = true;
                    break;
                }
            }

            rollUpStats(cumulative, attempt.stats);

            const fundedProfit = Math.max(
                0,
                attempt.state.balance - passBalance,
            );
            let firstPayoutDay: number | null = null;
            if (fundedProfit >= plan.minPayoutProfit) {
                const earliest = passDay + plan.minDaysAfterPassForPayout;
                firstPayoutDay = Math.max(earliest, passDay + 1);
            }

            let consistencyViolated = false;
            const evalProfit = passBalance - attempt.state.startingBalance;
            if (
                plan.consistency &&
                plan.consistency.appliesToEval() &&
                plan.consistency.isViolated(attempt.bestDayProfit, evalProfit)
            ) {
                consistencyViolated = true;
            }

            let outcome: TrialOutcome;
            if (bustedFunded) outcome = 'bust-funded';
            else if (consistencyViolated) outcome = 'pass-violation';
            else outcome = 'pass-clean';

            return finishTrial({
                plan,
                outcome,
                daysToPass: passDay,
                cumulativeDays,
                finalBalance: attempt.state.balance,
                fundedProfit,
                equityCurve: lastEquityCurve,
                firstPayoutDay,
                discounts,
                cumulative,
                attemptsUsed,
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
            plan,
            outcome: finalOutcome,
            daysToPass: null,
            cumulativeDays,
            finalBalance: attempt.state.balance,
            fundedProfit: 0,
            equityCurve: lastEquityCurve,
            firstPayoutDay: null,
            discounts,
            cumulative,
            attemptsUsed,
            resetFeesPaid,
        });
    }
}

interface FinishTrialArgs {
    plan: Plan;
    outcome: TrialOutcome;
    daysToPass: number | null;
    cumulativeDays: number;
    finalBalance: number;
    fundedProfit: number;
    equityCurve: number[] | null;
    firstPayoutDay: number | null;
    discounts: CouponDiscounts | undefined;
    cumulative: PathStats;
    attemptsUsed: number;
    resetFeesPaid: number;
}

function finishTrial(args: FinishTrialArgs): TrialResult {
    const {
        plan,
        outcome,
        daysToPass,
        cumulativeDays,
        finalBalance,
        fundedProfit,
        equityCurve,
        firstPayoutDay,
        discounts,
        cumulative,
        attemptsUsed,
        resetFeesPaid,
    } = args;
    const grossPayout =
        outcome === 'pass-clean' || outcome === 'pass-violation'
            ? plan.payoutFromProfit(fundedProfit)
            : 0;
    const baseCost = plan.totalCostThroughDay(cumulativeDays, discounts);
    const totalCost = baseCost + resetFeesPaid;
    const net = grossPayout - totalCost;
    return {
        outcome,
        daysElapsed: cumulativeDays,
        daysToPass,
        fundedProfit,
        grossPayout,
        totalCost,
        net,
        firstPayoutDay,
        equityCurve,
        finalBalance,
        maxDrawdown: cumulative.maxDrawdown,
        grossWins: cumulative.grossWins,
        grossLosses: cumulative.grossLosses,
        maxLosingStreak: cumulative.maxLosingStreak,
        tradesTaken: cumulative.tradesTaken,
        had5LossStreak: cumulative.maxLosingStreak >= 5,
        had10LossStreak: cumulative.maxLosingStreak >= 10,
        attemptsUsed,
        resetFeesPaid,
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
    return {
        evalFee: plan.fees.oneTimeEval * evalFactor,
        activationFee: plan.fees.activation * activationFactor,
        monthlySubsTotal: plan.fees.monthlySubscription * months,
        resetFeesTotal: avgResetFees,
    };
}

export function simulate(inputs: SimInputs): SimOutputs {
    const {
        plan,
        winrate,
        rrRatio,
        riskPerTrade,
        tradesPerDay,
        maxEvalDays,
        fundedHorizonDays,
        trials,
        seed,
        discounts,
        commissionPerRoundTrip = 0,
        maxAttempts = 1,
        copyAccounts = 1,
    } = inputs;
    const accountMultiplier = Math.max(1, Math.floor(copyAccounts));
    const rng = mulberry32(seed);

    const trialResults: TrialResult[] = [];
    for (let i = 0; i < trials; i++) {
        const captureEquity = i < SAMPLE_CURVE_COUNT;
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
                captureEquity,
                discounts,
            ),
        );
    }

    const counts: Record<TrialOutcome, number> = {
        'bust-eval': 0,
        'timeout-eval': 0,
        'pass-clean': 0,
        'pass-violation': 0,
        'bust-funded': 0,
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
    const daysToPassArr: number[] = [];
    const attemptsArr: number[] = [];
    const grossSpendArr: number[] = [];

    for (const r of trialResults) {
        counts[r.outcome] += 1;
        netSum += r.net;
        costSum += r.totalCost;
        payoutSum += r.grossPayout;
        dayElapsedSum += r.daysElapsed;
        if (r.daysToPass !== null) {
            daysToPassSum += r.daysToPass;
            daysToPassArr.push(r.daysToPass);
        }
        if (r.firstPayoutDay !== null) {
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
            passingTradesSum += r.tradesTaken;
            passingTrialsCount += 1;
        }
        if (r.had5LossStreak) had5LossCount += 1;
        if (r.had10LossStreak) had10LossCount += 1;
        attemptsSum += r.attemptsUsed;
        attemptsArr.push(r.attemptsUsed);
        resetFeesSum += r.resetFeesPaid;
        grossSpendArr.push(r.totalCost);
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
    const expectedAttemptsP90 = percentile(attemptsArr, 90);
    const expectedGrossSpend = expectedTotalCost;
    const expectedSpendP90 = percentile(grossSpendArr, 90);
    const breakEvenFundedProfit = expectedTotalCost;

    const m = accountMultiplier;
    return {
        passProbability: passes / totalTrials,
        cleanPassProbability: counts['pass-clean'] / totalTrials,
        bustProbability: counts['bust-eval'] / totalTrials,
        timeoutProbability: counts['timeout-eval'] / totalTrials,
        fundedBustProbability: counts['bust-funded'] / totalTrials,
        expectedDaysToPass:
            daysToPassArr.length > 0 ? daysToPassSum / daysToPassArr.length : 0,
        expectedFirstPayoutDay:
            firstPayoutCount > 0 ? firstPayoutSum / firstPayoutCount : 0,
        expectedTotalCost: expectedTotalCost * m,
        expectedGrossPayout: expectedGrossPayout * m,
        expectedNet: expectedNet * m,
        expectedMonthlyNet: expectedMonthlyNet * m,
        sampleEquityCurves,
        accountSize: plan.accountSize,
        profitTarget: plan.profitTarget,
        drawdownAmount: plan.drawdown.amount,
        initialThreshold: plan.drawdown.initialThreshold(plan.accountSize),
        expectancyDollars,
        expectancyR,
        profitFactor,
        maxLosingStreakP50: percentile(maxLosingStreaks, 50),
        maxLosingStreakP95: percentile(maxLosingStreaks, 95),
        risk5LossesPercent: had5LossCount / totalTrials,
        risk10LossesPercent: had10LossCount / totalTrials,
        maxDrawdownP50: percentile(maxDrawdowns, 50),
        maxDrawdownP95: percentile(maxDrawdowns, 95),
        finalBalanceP5: percentile(finalBalances, 5),
        finalBalanceP25: percentile(finalBalances, 25),
        finalBalanceP50: percentile(finalBalances, 50),
        finalBalanceP75: percentile(finalBalances, 75),
        finalBalanceP95: percentile(finalBalances, 95),
        daysToPassP25: percentile(daysToPassArr, 25),
        daysToPassP50: percentile(daysToPassArr, 50),
        daysToPassP75: percentile(daysToPassArr, 75),
        tradesPerSuccessfulAttempt,
        roiOnCost,
        costBreakdown: {
            evalFee: costBreakdown.evalFee * m,
            activationFee: costBreakdown.activationFee * m,
            monthlySubsTotal: costBreakdown.monthlySubsTotal * m,
            resetFeesTotal: costBreakdown.resetFeesTotal * m,
        },
        expectedAttempts,
        expectedAttemptsP90,
        expectedGrossSpend: expectedGrossSpend * m,
        expectedSpendP90: expectedSpendP90 * m,
        breakEvenFundedProfit: breakEvenFundedProfit * m,
        finalBalances,
        daysToPassValues: daysToPassArr,
    };
}
