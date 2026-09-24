import { TRADING_DAYS_PER_MONTH } from '../core/constants';
import { DEFAULT_RUNG_SIZING } from '../core/DayPolicy';
import {
    activationFee,
    type CouponDiscounts,
    type FeeSchedule,
    feesUntilPassAcrossAttempts,
    initialEvalFee,
    monthlySubscriptionFee,
    retryPath,
} from '../core/FeeSchedule';
import { dollars, fraction } from '../core/lib/units';
import { resolvePositionSizing } from '../core/PositionSizing';
import {
    replacementEconomics,
    type ReplacementInputs,
} from '../core/Replacement';
import { totalRoiOnCost } from '../core/Roi';
import { TradingPhase } from '../core/TradingPhase';
import { deriveSubSeed, mulberry32 } from '../rng';
import { percentile } from '../stats';
import { resolveDayPolicy } from './day';
import { resolveCopyAccounts, SIM_DEFAULTS } from './SimDefaults';
import { hasPassedEval, simulateTrial } from './trial';
import {
    type AtLeastProbabilities,
    CorrelationMode,
    type CostBreakdown,
    type CostBreakdownArguments,
    type MultiAccountResult,
    type PortfolioSimInputs,
    type SimInputs,
    type SimOutputs,
    type TrialOutcome,
    type TrialResult,
} from './types';
import { assertPositiveSafeInteger } from './validation';

const SAMPLE_CURVE_COUNT = 50;

export function simulate(inputs: SimInputs): SimOutputs {
    const {
        commissionPerRoundTrip = SIM_DEFAULTS.commissionPerRoundTrip,
        copyAccounts,
        discounts,
        fundedHorizonDays,
        idleDayProbability,
        instrument,
        intradayPathStepsPerR,
        maxAttempts = SIM_DEFAULTS.maxAttempts,
        maxEvalDays,
        minRetainedCushion,
        payoutRequestSize,
        plan,
        rrRatio,
        rungSizing = DEFAULT_RUNG_SIZING,
        seed,
        stopPoints,
        trials,
    } = inputs;
    assertPositiveSafeInteger(trials, 'trials');
    assertPositiveSafeInteger(maxEvalDays, 'maxEvalDays');
    assertPositiveSafeInteger(maxAttempts, 'maxAttempts');
    const commission = dollars(commissionPerRoundTrip);
    const cushion = plan.resolveRetainedCushion(minRetainedCushion);
    const requestSize =
        payoutRequestSize === undefined
            ? undefined
            : dollars(payoutRequestSize);
    const winrate = fraction(inputs.winrate);
    const rebuyLagDays = resolveRebuyLagDays(inputs.rebuyLagDays);
    const evalDayPolicy = resolveDayPolicy(inputs, TradingPhase.Eval);
    const fundedDayPolicy = resolveDayPolicy(inputs, TradingPhase.Funded);
    const accountMultiplier = resolveCopyAccounts(copyAccounts);
    const purchaseDiscounts = plan.purchaseDiscounts(
        discounts,
        accountMultiplier,
    );
    const positionSizing = resolvePositionSizing(instrument, stopPoints);
    const rng = mulberry32(seed);

    const trialResults: TrialResult[] = [];
    for (let index = 0; index < trials; index++) {
        const stride = Math.max(1, Math.floor(trials / SAMPLE_CURVE_COUNT));
        const isCaptureEquity = index % stride === 0;
        trialResults.push(
            simulateTrial({
                commission,
                discounts: purchaseDiscounts,
                evalDayPolicy,
                fundedDayPolicy,
                fundedHorizonDays,
                fundedRrRatio: inputs.fundedRrRatio,
                idleDayProbability,
                intradayPathStepsPerR,
                maxAttempts,
                maxEvalDays,
                minRetainedCushion: cushion,
                payoutRequestSize: requestSize,
                plan,
                positionSizing,
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
    let creditSum = 0;
    let costSum = 0;
    let payoutSum = 0;
    let payoutCountSum = 0;
    let failedAttemptDaysSum = 0;
    let dayElapsedSum = 0;
    let daysToPassSum = 0;
    let firstPayoutSum = 0;
    let firstPayoutCount = 0;
    let grossWinsSum = 0;
    let grossLossesSum = 0;
    let passingTradesSum = 0;
    let passingTrialsCount = 0;
    let tradesTakenSum = 0;
    let riskTakenSum = 0;
    let had5LossCount = 0;
    let had10LossCount = 0;
    let inactivityClosureCount = 0;
    let attemptsSum = 0;
    let resetFeesSum = 0;
    let subscriptionSum = 0;
    const sampleEquityCurves: number[][] = [];
    const finalBalances: number[] = [];
    const maxDrawdowns: number[] = [];
    const maxLosingStreaks: number[] = [];
    const daysToPassArray: number[] = [];
    const failedAttemptDaysArray: number[] = [];
    const attemptsArray: number[] = [];
    const grossSpendArray: number[] = [];

    for (const r of trialResults) {
        counts[r.outcome] += 1;
        netSum += r.net;
        creditSum += r.horizonCredit;
        costSum += r.totalCost;
        payoutSum += r.grossPayout;
        payoutCountSum += r.payoutCount;
        dayElapsedSum += r.daysElapsed;
        failedAttemptDaysSum += r.evalDays - (r.daysToPass ?? 0);
        if (r.daysToPass !== null) {
            daysToPassSum += r.daysToPass;
            daysToPassArray.push(r.daysToPass);
        }
        if (r.firstPayoutDay !== null) {
            firstPayoutSum +=
                r.firstPayoutDay + rebuyLagDays * (r.attemptsUsed - 1);
            firstPayoutCount += 1;
        }
        if (r.equityCurve) sampleEquityCurves.push(r.equityCurve);
        finalBalances.push(r.finalBalance);
        maxDrawdowns.push(r.maxDrawdown);
        maxLosingStreaks.push(r.maxLosingStreak);
        grossWinsSum += r.grossWins;
        grossLossesSum += r.grossLosses;
        tradesTakenSum += r.tradesTaken;
        riskTakenSum += r.riskTaken;
        if (hasPassedEval(r.outcome)) {
            passingTradesSum += r.evalTradesAtPass;
            passingTrialsCount += 1;
        }
        if (r.had5LossStreak) had5LossCount += 1;
        if (r.had10LossStreak) had10LossCount += 1;
        if (r.closedForInactivity) inactivityClosureCount += 1;
        attemptsSum += r.attemptsUsed;
        attemptsArray.push(r.attemptsUsed);
        resetFeesSum += r.resetFeesPaid;
        subscriptionSum += trialSubscription(plan.fees, r, purchaseDiscounts);
        failedAttemptDaysArray.push(...r.failedAttemptDays);
        grossSpendArray.push(r.totalCost);
    }

    const reachedFundedCount = counts['pass-clean'] + counts['bust-funded'];
    const evalPassProbability = reachedFundedCount / trials;
    const fundedSurvivalProbability = counts['pass-clean'] / trials;
    const expectedNet = netSum / trials;
    const expectedHorizonCredit = creditSum / trials;
    const expectedTotalCost = costSum / trials;
    const expectedGrossPayout = payoutSum / trials;
    const expectedPayoutCount = payoutCountSum / trials;
    const expectedPayoutPerFundedAccount =
        reachedFundedCount > 0 ? payoutSum / reachedFundedCount : 0;
    const slotDaysPerTrial =
        (dayElapsedSum + rebuyLagDays * attemptsSum) / trials || 1;
    const expectedMonthlyNet = monthlyNetPerSlot(
        expectedNet + expectedHorizonCredit,
        slotDaysPerTrial,
    );

    const expectancyDollars =
        tradesTakenSum > 0
            ? (grossWinsSum - grossLossesSum) / tradesTakenSum
            : 0;
    const averageRiskPerTrade =
        tradesTakenSum > 0 ? riskTakenSum / tradesTakenSum : 0;
    const expectancyR =
        averageRiskPerTrade > 0 ? expectancyDollars / averageRiskPerTrade : 0;
    const profitFactor =
        grossLossesSum > 0
            ? grossWinsSum / grossLossesSum
            : grossWinsSum > 0
              ? Infinity
              : 0;
    const tradesPerSuccessfulAttempt =
        passingTrialsCount > 0 ? passingTradesSum / passingTrialsCount : 0;
    const roiOnCost = totalRoiOnCost(expectedNet, expectedTotalCost);

    const failedAttempts = attemptsSum - reachedFundedCount;
    const replacementInputs: ReplacementInputs = {
        attemptDays:
            reachedFundedCount > 0
                ? {
                      failDays: failedAttemptDaysArray,
                      passDays: daysToPassArray,
                  }
                : undefined,
        discounts: purchaseDiscounts,
        evalPassRate: attemptsSum > 0 ? reachedFundedCount / attemptsSum : 0,
        fees: plan.fees,
        meanDaysOnFail:
            failedAttempts > 0 ? failedAttemptDaysSum / failedAttempts : 0,
        meanDaysOnPass:
            reachedFundedCount > 0 ? daysToPassSum / reachedFundedCount : 0,
    };
    const costPerFundedAccount =
        replacementEconomics(replacementInputs).costPerFundedAccount;
    const costBreakdown = buildCostBreakdown({
        averageResetFees: resetFeesSum / trials,
        averageSubscription: subscriptionSum / trials,
        evalPassProbability,
        plan,
        replacementInputs,
    });
    const costPerDrawdownDollar =
        costPerFundedAccount / plan.fundedDrawdown.amount;

    const expectedAttempts = attemptsSum / trials;
    const expectedAttemptsP90 = percentile(attemptsArray, 90);
    const expectedGrossSpend = expectedTotalCost;
    const expectedSpendP90 = percentile(grossSpendArray, 90);
    const breakEvenFundedProfit = expectedTotalCost;

    const m = accountMultiplier;
    return {
        accountSize: plan.accountSize,
        averageRiskPerTrade,
        breakEvenFundedProfit: breakEvenFundedProfit * m,
        bustProbability: counts['bust-eval'] / trials,
        costBreakdown: {
            activationFee: costBreakdown.activationFee * m,
            evalFee: costBreakdown.evalFee * m,
            perAccountActivationFee: costBreakdown.perAccountActivationFee,
            perAccountEvalFee: costBreakdown.perAccountEvalFee,
            resetFeesTotal: costBreakdown.resetFeesTotal * m,
            subscriptionPerFundedAccount:
                costBreakdown.subscriptionPerFundedAccount,
            subscriptionPerTrial: costBreakdown.subscriptionPerTrial * m,
        },
        costPerDrawdownDollar,
        costPerFundedAccount,
        daysToPassP5: percentile(daysToPassArray, 5),
        daysToPassP25: percentile(daysToPassArray, 25),
        daysToPassP50: percentile(daysToPassArray, 50),
        daysToPassP75: percentile(daysToPassArray, 75),
        daysToPassP95: percentile(daysToPassArray, 95),
        daysToPassValues: daysToPassArray,
        drawdownAmount: plan.drawdown.amount,
        evalPassProbability,
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
        expectedHorizonCredit: expectedHorizonCredit * m,
        expectedMonthlyNet: expectedMonthlyNet * m,
        expectedNet: expectedNet * m,
        expectedPayoutCount,
        expectedPayoutPerFundedAccount,
        expectedSpendP90: expectedSpendP90 * m,
        expectedTotalCost: expectedTotalCost * m,
        finalBalanceP5: percentile(finalBalances, 5),
        finalBalanceP25: percentile(finalBalances, 25),
        finalBalanceP50: percentile(finalBalances, 50),
        finalBalanceP75: percentile(finalBalances, 75),
        finalBalanceP95: percentile(finalBalances, 95),
        finalBalances,
        fundedBustProbability: counts['bust-funded'] / trials,
        fundedSurvivalProbability,
        inactivityClosureProbability: inactivityClosureCount / trials,
        initialThreshold: plan.drawdown.initialThreshold(plan.accountSize),
        maxDrawdownP50: percentile(maxDrawdowns, 50),
        maxDrawdownP95: percentile(maxDrawdowns, 95),
        maxLosingStreakP50: percentile(maxLosingStreaks, 50),
        maxLosingStreakP95: percentile(maxLosingStreaks, 95),
        profitFactor,
        profitTarget: plan.profitTarget,
        risk5LossesPercent: had5LossCount / trials,
        risk10LossesPercent: had10LossCount / trials,
        roiOnCost,
        sampleEquityCurves,
        timeoutProbability: counts['timeout-eval'] / trials,
        tradesPerSuccessfulAttempt,
    };
}

export function simulatePortfolio(
    inputs: PortfolioSimInputs,
): MultiAccountResult {
    const {
        accounts,
        commissionPerRoundTrip = SIM_DEFAULTS.commissionPerRoundTrip,
        correlation,
        discounts,
        fundedHorizonDays,
        groups,
        idleDayProbability,
        instrument,
        intradayPathStepsPerR,
        maxAttempts = SIM_DEFAULTS.maxAttempts,
        maxEvalDays,
        minRetainedCushion,
        payoutRequestSize,
        plan,
        rrRatio,
        rungSizing = DEFAULT_RUNG_SIZING,
        seed,
        stopPoints,
        trials,
        winrate: winrateInput,
    } = inputs;
    assertPositiveSafeInteger(trials, 'trials');
    assertPositiveSafeInteger(accounts, 'accounts');
    assertPositiveSafeInteger(maxEvalDays, 'maxEvalDays');
    assertPositiveSafeInteger(maxAttempts, 'maxAttempts');
    const commission = dollars(commissionPerRoundTrip);
    const cushion = plan.resolveRetainedCushion(minRetainedCushion);
    const requestSize =
        payoutRequestSize === undefined
            ? undefined
            : dollars(payoutRequestSize);
    const winrate = fraction(winrateInput);
    const rebuyLagDays = resolveRebuyLagDays(inputs.rebuyLagDays);
    const evalDayPolicy = resolveDayPolicy(inputs, TradingPhase.Eval);
    const fundedDayPolicy = resolveDayPolicy(inputs, TradingPhase.Funded);
    const positionSizing = resolvePositionSizing(instrument, stopPoints);

    const N = accounts;
    const purchaseDiscounts = plan.purchaseDiscounts(discounts, N);
    const groupSizes =
        correlation === CorrelationMode.Copy
            ? [N]
            : correlation === CorrelationMode.Independent
              ? Array.from({ length: N }, () => 1)
              : buildGroupSizes(N, groups);

    const distribution = Array.from({ length: N + 1 }, () => 0);
    const survivalDistribution = Array.from({ length: N + 1 }, () => 0);
    let netSum = 0;
    let creditSum = 0;
    let dayElapsedSum = 0;
    let attemptsSum = 0;
    let daysToPassSum = 0;
    let daysToPassCount = 0;
    let bustTrials = 0;
    let totalAccountPasses = 0;
    let totalAccountSurvivals = 0;
    let tradesTakenSum = 0;
    let activeDaysSum = 0;
    let maxStreakSum = 0;

    for (let index = 0; index < trials; index++) {
        let trialPasses = 0;
        let trialSurvivals = 0;
        let trialNet = 0;
        let trialCredit = 0;
        let trialDayElapsed = 0;
        let trialAttempts = 0;
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
                discounts: purchaseDiscounts,
                evalDayPolicy,
                fundedDayPolicy,
                fundedHorizonDays,
                fundedRrRatio: inputs.fundedRrRatio,
                idleDayProbability,
                intradayPathStepsPerR,
                maxAttempts,
                maxEvalDays,
                minRetainedCushion: cushion,
                payoutRequestSize: requestSize,
                plan,
                positionSizing,
                rng: groupRng,
                rrRatio,
                rungSizing,
                shouldCaptureEquity: false,
                winrate,
            });
            if (hasPassedEval(r.outcome)) {
                trialPasses += size;
                if (r.outcome === 'pass-clean') trialSurvivals += size;
            }
            if (r.outcome === 'bust-eval' || r.outcome === 'bust-funded')
                isAnyBust = true;
            trialNet += r.net * size;
            trialCredit += r.horizonCredit * size;
            trialDayElapsed += r.daysElapsed * size;
            trialAttempts += r.attemptsUsed * size;
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
        survivalDistribution[trialSurvivals] =
            (survivalDistribution[trialSurvivals] ?? 0) + 1;
        netSum += trialNet;
        creditSum += trialCredit;
        dayElapsedSum += trialDayElapsed;
        attemptsSum += trialAttempts;
        daysToPassSum += trialDaysToPassSum;
        daysToPassCount += trialDaysToPassCount;
        if (isAnyBust) bustTrials += 1;
        totalAccountPasses += trialPasses;
        totalAccountSurvivals += trialSurvivals;
        tradesTakenSum += trialTrades;
        activeDaysSum += trialActiveDays;
        maxStreakSum += trialMaxStreak;
    }

    for (let k = 0; k <= N; k++) {
        distribution[k] = (distribution[k] ?? 0) / trials;
        survivalDistribution[k] = (survivalDistribution[k] ?? 0) / trials;
    }

    const perAccountPass = totalAccountPasses / (trials * N);
    const perAccountFundedSurvival = totalAccountSurvivals / (trials * N);
    const expectedAccountsPass = totalAccountPasses / trials;

    const expectedNet = netSum / trials;
    const expectedHorizonCredit = creditSum / trials;
    const slotDaysPerTrial =
        (dayElapsedSum + rebuyLagDays * attemptsSum) / (trials * N) || 1;
    const expectedMonthlyNet = monthlyNetPerSlot(
        expectedNet + expectedHorizonCredit,
        slotDaysPerTrial,
    );
    const expectedDaysToPass =
        daysToPassCount > 0 ? daysToPassSum / daysToPassCount : 0;
    const expectedMaxLossStreak = maxStreakSum / trials;
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
        pAtLeast: atLeastProbabilities(distribution),
        pAtLeastFundedSurvival: atLeastProbabilities(survivalDistribution),
        perAccountFundedSurvival,
        perAccountPass,
        pHitDDLimit: bustTrials / trials,
        theoreticalPassProb: 0,
    };
}

function atLeastProbabilities(
    distribution: readonly number[],
): AtLeastProbabilities {
    const N = distribution.length - 1;
    const halfK = Math.ceil(N / 2);
    let k1 = 0;
    let kHalf = 0;
    let kAll = 0;
    for (const [k, pk] of distribution.entries()) {
        if (k >= 1) k1 += pk;
        if (k >= halfK) kHalf += pk;
        if (k >= N) kAll += pk;
    }
    return { k1, kAll, kHalf };
}

function buildCostBreakdown(arguments_: CostBreakdownArguments): CostBreakdown {
    const {
        averageResetFees,
        averageSubscription,
        evalPassProbability,
        plan,
        replacementInputs,
    } = arguments_;
    const { discounts } = replacementInputs;
    const perAccountEvalFee = initialEvalFee(plan.fees, discounts);
    const perAccountActivationFee = activationFee(plan.fees, discounts);
    return {
        activationFee: perAccountActivationFee * evalPassProbability,
        evalFee: perAccountEvalFee,
        perAccountActivationFee,
        perAccountEvalFee,
        resetFeesTotal: averageResetFees,
        subscriptionPerFundedAccount:
            subscriptionPerFundedAccount(replacementInputs),
        subscriptionPerTrial: averageSubscription,
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

function monthlyNetPerSlot(cycleNet: number, slotDays: number): number {
    return (cycleNet * TRADING_DAYS_PER_MONTH) / slotDays;
}

function resolveRebuyLagDays(
    rebuyLagDays: number = SIM_DEFAULTS.rebuyLagDays,
): number {
    if (!Number.isFinite(rebuyLagDays) || rebuyLagDays < 0) {
        throw new Error(
            `rebuyLagDays must be a finite number >= 0, got ${rebuyLagDays}`,
        );
    }
    return rebuyLagDays;
}

function subscriptionOnlyFees(
    fees: FeeSchedule,
    discounts: CouponDiscounts | undefined,
): FeeSchedule {
    return {
        activation: dollars(0),
        monthlySubscription: fees.monthlySubscription,
        oneTimeEval: dollars(0),
        reset: dollars(0),
        retry: retryPath(fees, discounts),
    };
}

function subscriptionPerFundedAccount(inputs: ReplacementInputs): number {
    if (monthlySubscriptionFee(inputs.fees, inputs.discounts) === 0) return 0;
    return replacementEconomics({
        ...inputs,
        fees: subscriptionOnlyFees(inputs.fees, inputs.discounts),
    }).costPerFundedAccount;
}

function trialSubscription(
    fees: FeeSchedule,
    result: TrialResult,
    discounts: CouponDiscounts | undefined,
): number {
    const attemptDays =
        result.daysToPass === null
            ? result.failedAttemptDays
            : [...result.failedAttemptDays, result.daysToPass];
    return (
        feesUntilPassAcrossAttempts(fees, attemptDays, discounts) -
        initialEvalFee(fees, discounts)
    );
}
