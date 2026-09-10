import { TRADING_DAYS_PER_MONTH } from '../core/constants';
import { DEFAULT_RUNG_SIZING } from '../core/DayPolicy';
import { type CouponDiscounts } from '../core/FeeSchedule';
import { type Plan } from '../core/Plan';
import { totalRoiOnCost } from '../core/Roi';
import { TradingPhase } from '../core/TradingPhase';
import { dollars, fraction } from '../core/units';
import { deriveSubSeed, mulberry32 } from '../rng';
import { percentile } from '../stats';
import { resolveDayPolicy } from './day';
import { isPassingOutcome, simulateTrial } from './trial';
import {
    CorrelationMode,
    type CostBreakdown,
    type MultiAccountResult,
    type PortfolioSimInputs,
    type SimInputs,
    type SimOutputs,
    type TrialOutcome,
    type TrialResult,
} from './types';

const SAMPLE_CURVE_COUNT = 50;

export function simulate(inputs: SimInputs): SimOutputs {
    const {
        commissionPerRoundTrip = 0,
        copyAccounts = 1,
        discounts,
        fundedHorizonDays,
        maxAttempts = 1,
        maxEvalDays,
        minRetainedCushion,
        payoutRequestSize,
        plan,
        riskPerTrade,
        rrRatio,
        rungSizing = DEFAULT_RUNG_SIZING,
        seed,
        trials,
    } = inputs;
    const commission = dollars(commissionPerRoundTrip);
    const cushion = dollars(
        minRetainedCushion ?? plan.defaultRetainedCushion(),
    );
    const requestSize =
        payoutRequestSize === undefined
            ? undefined
            : dollars(payoutRequestSize);
    const winrate = fraction(inputs.winrate);
    const evalDayPolicy = resolveDayPolicy(inputs, TradingPhase.Eval);
    const fundedDayPolicy = resolveDayPolicy(inputs, TradingPhase.Funded);
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

    const passes = counts['pass-clean'];
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
        daysToPassArray.length > 0
            ? daysToPassSum / daysToPassArray.length
            : expectedDaysPerTrial;
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
        minRetainedCushion,
        payoutRequestSize,
        plan,
        rrRatio,
        rungSizing = DEFAULT_RUNG_SIZING,
        seed,
        trials,
        winrate: winrateInput,
    } = inputs;
    const commission = dollars(commissionPerRoundTrip);
    const cushion = dollars(
        minRetainedCushion ?? plan.defaultRetainedCushion(),
    );
    const requestSize =
        payoutRequestSize === undefined
            ? undefined
            : dollars(payoutRequestSize);
    const winrate = fraction(winrateInput);
    const evalDayPolicy = resolveDayPolicy(inputs, TradingPhase.Eval);
    const fundedDayPolicy = resolveDayPolicy(inputs, TradingPhase.Funded);

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
