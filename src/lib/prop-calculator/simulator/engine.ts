import { TRADING_DAYS_PER_MONTH } from '~/lib/prop-calculator/core/constants';
import { DEFAULT_RUNG_SIZING } from '~/lib/prop-calculator/core/DayPolicy';
import {
    activationFee,
    type CouponDiscounts,
    evalAttemptDays,
    type FeeSchedule,
    feesUntilPassAcrossAttempts,
    initialEvalFee,
    monthlySubscriptionFee,
    retryPath,
} from '~/lib/prop-calculator/core/FeeSchedule';
import {
    dollars,
    type Dollars,
    fraction,
} from '~/lib/prop-calculator/core/lib/units';
import { LifetimeCapScope, type Plan } from '~/lib/prop-calculator/core/Plan';
import { resolvePositionSizing } from '~/lib/prop-calculator/core/PositionSizing';
import {
    replacementEconomics,
    type ReplacementInputs,
} from '~/lib/prop-calculator/core/Replacement';
import { totalRoiOnCost } from '~/lib/prop-calculator/core/Roi';
import { TradingPhase } from '~/lib/prop-calculator/core/TradingPhase';
import { deriveSubSeed, mulberry32 } from '~/lib/prop-calculator/rng';
import {
    binomialStandardError,
    type Estimate,
    meanStandardError,
    percentile,
    ratioEstimate,
    type UncertainValue,
} from '~/lib/prop-calculator/stats';

import { resolveDayPolicy } from './day';
import { SIM_INPUTS_REFUSAL_PREFIX } from './dayPolicyValidation';
import {
    liveTransferContinuationKindOf,
    liveTransferOptionsFor,
    type LiveTransferSetup,
    resolveLiveTransferSetup,
} from './LiveTransfer';
import { resolveCopyAccounts, SIM_DEFAULTS } from './SimDefaults';
import { assertPayoutRequestPolicy, simStartIssue } from './simStartValidation';
import { hasPassedEval, simulateTrial } from './trial';
import {
    type AtLeastProbabilities,
    CorrelationMode,
    type CostBreakdown,
    type CostBreakdownArguments,
    type FromStateSimInputs,
    type FromStateSimOutputs,
    type LiveTransferContinuationKind,
    type MultiAccountResult,
    type PortfolioSimInputs,
    type SimEstimates,
    type SimInputs,
    type SimOutputs,
    type SimStart,
    type TrialOutcome,
    type TrialResult,
    type TrialStart,
} from './types';
import { assertPositiveSafeInteger } from './validation';

const SAMPLE_CURVE_COUNT = 50;
const MIN_FUNDED_TRIALS_FOR_SE = 2;

export const FUNDED_PAYOUT_COUNT_TAIL_BUCKET = 10;

interface Moments {
    count: number;
    squaredSum: number;
    sum: number;
}

export function fromStateCashSamples(
    trialResults: readonly TrialResult[],
    windowDays: number,
    freshExpectedMonthlyNet: number,
    freshExpectedMonthlyRealizedNet: number,
): { cash: number[]; realizedCash: number[] } {
    const cash: number[] = [];
    const realizedCash: number[] = [];
    for (const r of trialResults) {
        if (r.isAliveAtHorizon) {
            cash.push(r.net + r.horizonCredit);
            realizedCash.push(r.net);
            continue;
        }
        if (r.isTransferredLive) {
            cash.push(r.net);
            realizedCash.push(r.net);
            continue;
        }
        const fundedDaysElapsed = r.daysElapsed - r.evalDays;
        const remainingDays = Math.max(0, windowDays - fundedDaysElapsed);
        cash.push(
            r.net +
                (remainingDays * freshExpectedMonthlyNet) /
                    TRADING_DAYS_PER_MONTH,
        );
        realizedCash.push(
            r.net +
                (remainingDays * freshExpectedMonthlyRealizedNet) /
                    TRADING_DAYS_PER_MONTH,
        );
    }
    return { cash, realizedCash };
}

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
        payoutRequestPolicy,
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
    assertPayoutRequestPolicy(plan, payoutRequestPolicy, payoutRequestSize);
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
    const liveTransfer = liveTransferSetupOf(
        inputs,
        commission,
        fundedDayPolicy.ladder.length,
    );
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
                liveTransfer: liveTransferOptionsFor(liveTransfer, index, 0),
                maxAttempts,
                maxEvalDays,
                minRetainedCushion: cushion,
                payoutRequestPolicy,
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

    return buildSimOutputs(
        pooledLifetimeCapAcrossCopies(trialResults, accountMultiplier, plan),
        plan,
        purchaseDiscounts,
        accountMultiplier,
        rebuyLagDays,
        liveTransferContinuationKindOf(liveTransfer),
    );
}

export function simulateFromState(
    inputs: FromStateSimInputs,
): FromStateSimOutputs {
    const {
        commissionPerRoundTrip = SIM_DEFAULTS.commissionPerRoundTrip,
        discounts,
        fundedHorizonDays,
        idleDayProbability,
        instrument,
        intradayPathStepsPerR,
        maxAttempts = SIM_DEFAULTS.maxAttempts,
        maxEvalDays,
        minRetainedCushion,
        payoutRequestPolicy,
        payoutRequestSize,
        plan,
        rrRatio,
        rungSizing = DEFAULT_RUNG_SIZING,
        seed,
        start,
        stopPoints,
        trials,
    } = inputs;
    assertPositiveSafeInteger(trials, 'trials');
    assertPositiveSafeInteger(maxEvalDays, 'maxEvalDays');
    assertPositiveSafeInteger(maxAttempts, 'maxAttempts');
    assertPayoutRequestPolicy(plan, payoutRequestPolicy, payoutRequestSize);
    const startIssue = simStartIssue(plan, start, maxEvalDays);
    if (startIssue !== null) {
        throw new Error(`${SIM_INPUTS_REFUSAL_PREFIX}${startIssue}`);
    }

    const commission = dollars(commissionPerRoundTrip);
    const cushion = plan.resolveRetainedCushion(minRetainedCushion);
    const requestSize =
        payoutRequestSize === undefined
            ? undefined
            : dollars(payoutRequestSize);
    const winrate = fraction(inputs.winrate);
    const evalDayPolicy = resolveDayPolicy(inputs, TradingPhase.Eval);
    const fundedDayPolicy = resolveDayPolicy(inputs, TradingPhase.Funded);
    const liveTransfer = liveTransferSetupOf(
        inputs,
        commission,
        fundedDayPolicy.ladder.length,
    );
    const positionSizing = resolvePositionSizing(instrument, stopPoints);
    const rng = mulberry32(seed);
    const trialStart = toTrialStart(plan, start, maxEvalDays);
    const purchaseDiscounts = plan.purchaseDiscounts(discounts, 1);

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
                liveTransfer: liveTransferOptionsFor(liveTransfer, index, 0),
                maxAttempts,
                maxEvalDays,
                minRetainedCushion: cushion,
                payoutRequestPolicy,
                payoutRequestSize: requestSize,
                plan,
                positionSizing,
                rng,
                rrRatio,
                rungSizing,
                shouldCaptureEquity: isCaptureEquity,
                start: trialStart,
                winrate,
            }),
        );
    }

    const base = buildSimOutputs(
        trialResults,
        plan,
        purchaseDiscounts,
        1,
        resolveRebuyLagDays(inputs.rebuyLagDays),
        liveTransferContinuationKindOf(liveTransfer),
        true,
    );

    const freshOutputs = simulate({
        commissionPerRoundTrip,
        discounts,
        fundedHorizonDays,
        idleDayProbability,
        instrument,
        intradayPathStepsPerR,
        liveTransferHazard: inputs.liveTransferHazard,
        maxAttempts,
        maxEvalDays,
        minRetainedCushion,
        payoutRequestPolicy,
        payoutRequestSize,
        plan,
        rebuyLagDays: inputs.rebuyLagDays,
        riskPerTrade: inputs.riskPerTrade,
        rrRatio,
        rungSizing,
        seed: deriveSubSeed(seed, trials, 0),
        stopPoints,
        tradesPerDay: inputs.tradesPerDay,
        trials,
        verifiedCumulativePayoutTrigger: inputs.verifiedCumulativePayoutTrigger,
        winrate: inputs.winrate,
    });

    const windowDays = fundedHorizonDays;
    const { cash, realizedCash } = fromStateCashSamples(
        trialResults,
        windowDays,
        freshOutputs.expectedMonthlyNet,
        freshOutputs.expectedMonthlyRealizedNet,
    );
    const cashEstimate = uncertainMean(cash);
    const realizedCashEstimate = uncertainMean(realizedCash);

    const shared = withoutKeys(base, [
        'costBreakdown',
        'expectedMonthlyNet',
        'expectedMonthlyRealizedNet',
    ]);
    const sharedEstimates = withoutKeys(base.estimates, [
        'expectedMonthlyNet',
        'expectedMonthlyRealizedNet',
    ]);

    return {
        ...shared,
        estimates: {
            ...sharedEstimates,
            fromStateExpectedCash: cashEstimate,
            fromStateExpectedRealizedCash: realizedCashEstimate,
        },
        fromStateExpectedCash: cashEstimate.value,
        fromStateExpectedRealizedCash: realizedCashEstimate.value,
        fromStateWindowDays: windowDays,
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
        payoutRequestPolicy,
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
    assertPayoutRequestPolicy(plan, payoutRequestPolicy, payoutRequestSize);
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
    const liveTransfer = liveTransferSetupOf(
        inputs,
        commission,
        fundedDayPolicy.ladder.length,
    );
    const positionSizing = resolvePositionSizing(instrument, stopPoints);

    const N = accounts;
    const purchaseDiscounts = plan.purchaseDiscounts(discounts, N);
    const pooledLifetimeCap = resolvePooledLifetimeCap(plan);
    const groupSizes =
        correlation === CorrelationMode.Copy
            ? [N]
            : correlation === CorrelationMode.Independent
              ? Array.from({ length: N }, () => 1)
              : buildGroupSizes(N, groups);

    const distribution = Array.from({ length: N + 1 }, () => 0);
    const survivalDistribution = Array.from({ length: N + 1 }, () => 0);
    const liveTransferDistribution = Array.from({ length: N + 1 }, () => 0);
    let totalAccountTransfers = 0;
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
        let trialTransfers = 0;
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
        let remainingLifetimeBudget: null | number = pooledLifetimeCap;

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
                liveTransfer: liveTransferOptionsFor(liveTransfer, index, g),
                maxAttempts,
                maxEvalDays,
                minRetainedCushion: cushion,
                payoutRequestPolicy,
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
            if (r.isTransferredLive) trialTransfers += size;
            if (r.outcome === 'bust-eval' || r.outcome === 'bust-funded')
                isAnyBust = true;
            const rawGroupPayout = r.grossPayout * size;
            const clampedGroupPayout =
                remainingLifetimeBudget === null
                    ? rawGroupPayout
                    : Math.max(
                          0,
                          Math.min(rawGroupPayout, remainingLifetimeBudget),
                      );
            if (remainingLifetimeBudget !== null) {
                remainingLifetimeBudget -= clampedGroupPayout;
            }
            trialNet += r.net * size - (rawGroupPayout - clampedGroupPayout);
            trialCredit += r.horizonCredit * size;
            trialDayElapsed += (r.daysElapsed + r.liveSlotDays) * size;
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
        liveTransferDistribution[trialTransfers] =
            (liveTransferDistribution[trialTransfers] ?? 0) + 1;
        totalAccountTransfers += trialTransfers;
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
        liveTransferDistribution[k] =
            (liveTransferDistribution[k] ?? 0) / trials;
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
    const expectedMonthlyRealizedNet = monthlyNetPerSlot(
        expectedNet,
        slotDaysPerTrial,
    );
    const expectedDaysToPass =
        daysToPassCount > 0 ? daysToPassSum / daysToPassCount : 0;
    const expectedMaxLossStreak = maxStreakSum / trials;
    const meanTradesPerDay =
        activeDaysSum > 0 ? tradesTakenSum / activeDaysSum : 0;

    return {
        accountsLiveTransferDistribution: liveTransferDistribution,
        accountsPassDistribution: distribution,
        expectedAccountsPass,
        expectedDaysToPass,
        expectedMaxLossStreak,
        expectedMonthlyNet,
        expectedMonthlyRealizedNet,
        expectedNet,
        liveTransferContinuation: liveTransferContinuationKindOf(liveTransfer),
        liveTransferProbability: totalAccountTransfers / (trials * N),
        meanTradesPerDay,
        pAtLeast: atLeastProbabilities(distribution),
        pAtLeastFundedSurvival: atLeastProbabilities(survivalDistribution),
        perAccountFundedSurvival,
        perAccountPass,
        pHitDDLimit: bustTrials / trials,
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

function binomialEstimate(p: number, n: number): Estimate {
    return { standardError: binomialStandardError(p, n), value: p };
}

function buildCostBreakdown(arguments_: CostBreakdownArguments): CostBreakdown {
    const {
        averageFundedResetFees,
        averageResetFees,
        averageSubscription,
        evalPassProbability,
        fundedResetFeesPerFundedAccount,
        plan,
        replacementInputs,
    } = arguments_;
    const { discounts } = replacementInputs;
    const perAccountEvalFee = initialEvalFee(plan.fees, discounts);
    const perAccountActivationFee = activationFee(plan.fees, discounts);
    return {
        activationFee: perAccountActivationFee * evalPassProbability,
        evalFee: perAccountEvalFee,
        fundedResetFeesPerFundedAccount,
        fundedResetFeesTotal: averageFundedResetFees,
        perAccountActivationFee,
        perAccountEvalFee,
        resetFeesTotal: averageResetFees,
        subscriptionPerFundedAccount:
            subscriptionPerFundedAccount(replacementInputs),
        subscriptionPerTrial: averageSubscription,
    };
}

function buildGroupSizes(N: number, groups: number): number[] {
    if (!Number.isSafeInteger(groups) || groups < 1 || groups > N) {
        throw new Error(
            `groups must be a whole number from 1 to the ${N} accounts, got ${groups}`,
        );
    }
    const G = groups;
    const base = Math.floor(N / G);
    const extra = N - base * G;
    const out: number[] = [];
    for (let g = 0; g < G; g++) out.push(base + (g < extra ? 1 : 0));
    return out;
}

function buildSimOutputs(
    trialResults: readonly TrialResult[],
    plan: Plan,
    purchaseDiscounts: CouponDiscounts | undefined,
    accountMultiplier: number,
    rebuyLagDays: number,
    liveTransferContinuation: LiveTransferContinuationKind,
    isFromState = false,
): SimOutputs {
    const trials = trialResults.length;
    const counts: Record<TrialOutcome, number> = {
        'bust-eval': 0,
        'bust-funded': 0,
        'pass-clean': 0,
        'timeout-eval': 0,
    };
    let netSum = 0;
    let creditSum = 0;
    let liveTransferCashSum = 0;
    let liveTransferCapitalReturnedSum = 0;
    let liveTransferLiquidationSum = 0;
    let liveTransferTransitionSum = 0;
    let liveTransferCount = 0;
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
    let fundedResetFeesSum = 0;
    let fundedResetsSum = 0;
    let subscriptionSum = 0;
    let netSquaredSum = 0;
    let creditSquaredSum = 0;
    let payoutSquaredSum = 0;
    let payoutCountSquaredSum = 0;
    let attemptsSquaredSum = 0;
    let payingTrialsCount = 0;
    const fundedPayoutCounts = Array.from(
        { length: FUNDED_PAYOUT_COUNT_TAIL_BUCKET + 1 },
        () => 0,
    );
    const fundedPayoutValues: number[] = [];
    const creditInclusiveNets: number[] = [];
    const slotDays: number[] = [];
    const trialNets: number[] = [];
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
        liveTransferCashSum += r.liveTransferCash;
        liveTransferCapitalReturnedSum += r.liveTransferOneOff.capitalReturned;
        liveTransferLiquidationSum += r.liveTransferOneOff.liquidationPayout;
        liveTransferTransitionSum += r.liveTransferOneOff.transitionCredit;
        if (r.isTransferredLive) liveTransferCount += 1;
        costSum += r.totalCost;
        payoutSum += r.grossPayout;
        payoutCountSum += r.payoutCount;
        dayElapsedSum += r.daysElapsed + r.liveSlotDays;
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
        fundedResetFeesSum += r.fundedResetFeesPaid;
        fundedResetsSum += r.fundedResetsUsed;
        subscriptionSum += trialSubscription(plan.fees, r, purchaseDiscounts);
        failedAttemptDaysArray.push(...r.failedAttemptDays);
        grossSpendArray.push(r.totalCost);
        netSquaredSum += r.net ** 2;
        creditSquaredSum += r.horizonCredit ** 2;
        payoutSquaredSum += r.grossPayout ** 2;
        payoutCountSquaredSum += r.payoutCount ** 2;
        attemptsSquaredSum += r.attemptsUsed ** 2;
        if (r.payoutCount > 0) payingTrialsCount += 1;
        if (hasPassedEval(r.outcome)) {
            fundedPayoutValues.push(r.grossPayout);
            const bucket = Math.min(
                r.payoutCount,
                FUNDED_PAYOUT_COUNT_TAIL_BUCKET,
            );
            fundedPayoutCounts[bucket] = (fundedPayoutCounts[bucket] ?? 0) + 1;
        }
        creditInclusiveNets.push(r.net + r.horizonCredit);
        slotDays.push(
            r.daysElapsed + r.liveSlotDays + rebuyLagDays * r.attemptsUsed,
        );
        trialNets.push(r.net);
    }

    const reachedFundedCount = counts['pass-clean'] + counts['bust-funded'];
    const evalPassProbability = reachedFundedCount / trials;
    const fundedSurvivalProbability = counts['pass-clean'] / trials;
    const fundedBustProbability = counts['bust-funded'] / trials;
    const attemptPassProbability =
        attemptsSum > 0 ? reachedFundedCount / attemptsSum : 0;
    const attemptPaysProbability =
        attemptsSum > 0 ? payingTrialsCount / attemptsSum : 0;
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
    const expectedMonthlyRealizedNet = monthlyNetPerSlot(
        expectedNet,
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
        evalPassRate: attemptPassProbability,
        fees: plan.fees,
        meanDaysOnFail:
            failedAttempts > 0 ? failedAttemptDaysSum / failedAttempts : 0,
        meanDaysOnPass:
            reachedFundedCount > 0 ? daysToPassSum / reachedFundedCount : 0,
    };
    const fundedResetFeesPerFundedAccount =
        reachedFundedCount > 0 ? fundedResetFeesSum / reachedFundedCount : 0;
    const costPerFundedAccount = isFromState
        ? reachedFundedCount > 0
            ? costSum / reachedFundedCount
            : Infinity
        : replacementEconomics(replacementInputs).costPerFundedAccount +
          fundedResetFeesPerFundedAccount;
    const costBreakdown = buildCostBreakdown({
        averageFundedResetFees: fundedResetFeesSum / trials,
        averageResetFees: resetFeesSum / trials,
        averageSubscription: subscriptionSum / trials,
        evalPassProbability,
        fundedResetFeesPerFundedAccount,
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

    const fundedPayoutCountDistribution =
        reachedFundedCount > 0
            ? fundedPayoutCounts.map((count) => count / reachedFundedCount)
            : [];
    const anyPayoutGivenFundedProbability =
        reachedFundedCount > 0
            ? 1 - (fundedPayoutCountDistribution[0] ?? 0)
            : 0;
    const payoutsPerFundedAccount =
        reachedFundedCount > 0 ? payoutCountSum / reachedFundedCount : 0;
    const netPerAttempt = ratioEstimate(trialNets, attemptsArray);
    const costPerAttempt = ratioEstimate(grossSpendArray, attemptsArray);
    const monthlySlotDays = slotDays.some((days) => days > 0)
        ? slotDays
        : slotDays.map(() => 1);

    const m = accountMultiplier;
    const trialMoments = (sum: number, squaredSum: number): Moments => ({
        count: trials,
        squaredSum,
        sum,
    });
    const fundedMoments = (sum: number, squaredSum: number): Moments => ({
        count: reachedFundedCount,
        squaredSum,
        sum,
    });
    const fundedConditional = (estimate: Estimate): UncertainValue =>
        reachedFundedCount < MIN_FUNDED_TRIALS_FOR_SE
            ? { standardError: null, value: estimate.value }
            : estimate;
    const estimates: SimEstimates = {
        anyPayoutGivenFundedProbability: fundedConditional(
            binomialEstimate(
                anyPayoutGivenFundedProbability,
                reachedFundedCount,
            ),
        ),
        attemptPassProbability: binomialEstimate(
            attemptPassProbability,
            attemptsSum,
        ),
        attemptPaysProbability: binomialEstimate(
            attemptPaysProbability,
            attemptsSum,
        ),
        costPerAttempt: scaledEstimate(costPerAttempt, m),
        evalPassProbability: binomialEstimate(evalPassProbability, trials),
        expectedAttempts: meanEstimate(
            expectedAttempts,
            trialMoments(attemptsSum, attemptsSquaredSum),
            1,
        ),
        expectedGrossPayout: meanEstimate(
            expectedGrossPayout * m,
            trialMoments(payoutSum, payoutSquaredSum),
            m,
        ),
        expectedHorizonCredit: meanEstimate(
            expectedHorizonCredit * m,
            trialMoments(creditSum, creditSquaredSum),
            m,
        ),
        expectedMonthlyNet: monthlyNetEstimate(
            expectedMonthlyNet * m,
            ratioEstimate(creditInclusiveNets, monthlySlotDays),
            m,
        ),
        expectedMonthlyRealizedNet: monthlyNetEstimate(
            expectedMonthlyRealizedNet * m,
            ratioEstimate(trialNets, monthlySlotDays),
            m,
        ),
        expectedNet: meanEstimate(
            expectedNet * m,
            trialMoments(netSum, netSquaredSum),
            m,
        ),
        expectedNetPerAttempt: scaledEstimate(netPerAttempt, m),
        expectedPayoutCount: meanEstimate(
            expectedPayoutCount,
            trialMoments(payoutCountSum, payoutCountSquaredSum),
            1,
        ),
        expectedPayoutPerFundedAccount: fundedConditional(
            meanEstimate(
                expectedPayoutPerFundedAccount,
                fundedMoments(payoutSum, payoutSquaredSum),
                1,
            ),
        ),
        fundedBustProbability: binomialEstimate(fundedBustProbability, trials),
        fundedSurvivalProbability: binomialEstimate(
            fundedSurvivalProbability,
            trials,
        ),
        payoutsPerFundedAccount: fundedConditional(
            meanEstimate(
                payoutsPerFundedAccount,
                fundedMoments(payoutCountSum, payoutCountSquaredSum),
                1,
            ),
        ),
    };
    return {
        accountSize: plan.accountSize,
        anyPayoutGivenFundedProbability,
        attemptPassProbability,
        attemptPaysProbability,
        averageRiskPerTrade,
        breakEvenFundedProfit: breakEvenFundedProfit * m,
        bustProbability: counts['bust-eval'] / trials,
        copyAccounts: accountMultiplier,
        costBreakdown: {
            activationFee: costBreakdown.activationFee * m,
            evalFee: costBreakdown.evalFee * m,
            fundedResetFeesPerFundedAccount:
                costBreakdown.fundedResetFeesPerFundedAccount,
            fundedResetFeesTotal: costBreakdown.fundedResetFeesTotal * m,
            perAccountActivationFee: costBreakdown.perAccountActivationFee,
            perAccountEvalFee: costBreakdown.perAccountEvalFee,
            resetFeesTotal: costBreakdown.resetFeesTotal * m,
            subscriptionPerFundedAccount:
                costBreakdown.subscriptionPerFundedAccount,
            subscriptionPerTrial: costBreakdown.subscriptionPerTrial * m,
        },
        costPerAttempt: estimates.costPerAttempt.value,
        costPerDrawdownDollar,
        costPerFundedAccount,
        daysToPassP5: percentile(daysToPassArray, 5),
        daysToPassP25: percentile(daysToPassArray, 25),
        daysToPassP50: percentile(daysToPassArray, 50),
        daysToPassP75: percentile(daysToPassArray, 75),
        daysToPassP95: percentile(daysToPassArray, 95),
        daysToPassValues: daysToPassArray,
        drawdownAmount: plan.drawdown.amount,
        estimates,
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
        expectedFundedResets: fundedResetsSum / trials,
        expectedGrossPayout: expectedGrossPayout * m,
        expectedGrossSpend: expectedGrossSpend * m,
        expectedHorizonCredit: expectedHorizonCredit * m,
        expectedLiveTransferCapitalReturned:
            (liveTransferCapitalReturnedSum / trials) * m,
        expectedLiveTransferCash: (liveTransferCashSum / trials) * m,
        expectedLiveTransferLiquidationPayout:
            (liveTransferLiquidationSum / trials) * m,
        expectedLiveTransferTransitionCredit:
            (liveTransferTransitionSum / trials) * m,
        expectedMonthlyNet: expectedMonthlyNet * m,
        expectedMonthlyRealizedNet: expectedMonthlyRealizedNet * m,
        expectedNet: expectedNet * m,
        expectedNetPerAttempt: estimates.expectedNetPerAttempt.value,
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
        fundedBustProbability,
        fundedPayoutCountDistribution,
        fundedPayoutValues: fundedPayoutValues.map((payout) => payout * m),
        fundedSurvivalProbability,
        inactivityClosureProbability: inactivityClosureCount / trials,
        initialThreshold: plan.drawdown.initialThreshold(plan.accountSize),
        liveTransferContinuation,
        liveTransferProbability: liveTransferCount / trials,
        maxDrawdownP50: percentile(maxDrawdowns, 50),
        maxDrawdownP95: percentile(maxDrawdowns, 95),
        maxLosingStreakP50: percentile(maxLosingStreaks, 50),
        maxLosingStreakP95: percentile(maxLosingStreaks, 95),
        netValues: trialNets.map((net) => net * m),
        payoutsPerFundedAccount,
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

function liveTransferSetupOf(
    inputs: SimInputs,
    commission: Dollars,
    fundedTradesPerDay: number,
): LiveTransferSetup | null {
    return resolveLiveTransferSetup({
        commission,
        fundedRrRatio: inputs.fundedRrRatio ?? inputs.rrRatio,
        fundedTradesPerDay,
        idleDayProbability: inputs.idleDayProbability,
        instrument: inputs.instrument,
        liveTransferHazard: inputs.liveTransferHazard,
        minRetainedCushion: inputs.minRetainedCushion,
        payoutRequestSize: inputs.payoutRequestSize,
        plan: inputs.plan,
        seed: inputs.seed,
        stopPoints: inputs.stopPoints,
        verifiedCumulativePayoutTrigger: inputs.verifiedCumulativePayoutTrigger,
        winrate: fraction(inputs.winrate),
    });
}

function meanEstimate(
    value: number,
    moments: Moments,
    scale: number,
): Estimate {
    return {
        standardError:
            meanStandardError(moments.sum, moments.squaredSum, moments.count) *
            scale,
        value,
    };
}

function monthlyNetEstimate(
    value: number,
    perSlotDay: Estimate,
    scale: number,
): Estimate {
    return {
        standardError:
            perSlotDay.standardError * TRADING_DAYS_PER_MONTH * scale,
        value,
    };
}

function monthlyNetPerSlot(cycleNet: number, slotDays: number): number {
    return (cycleNet * TRADING_DAYS_PER_MONTH) / slotDays;
}

function pooledLifetimeCapAcrossCopies(
    trialResults: readonly TrialResult[],
    accountMultiplier: number,
    plan: Plan,
): readonly TrialResult[] {
    const pooledLifetimeCap = resolvePooledLifetimeCap(plan);
    if (pooledLifetimeCap === null || accountMultiplier <= 1) {
        return trialResults;
    }
    return trialResults.map((r) => {
        const rawCombinedPayout = r.grossPayout * accountMultiplier;
        if (rawCombinedPayout <= pooledLifetimeCap) return r;
        const perCopyPayout = pooledLifetimeCap / accountMultiplier;
        const payoutReduction = r.grossPayout - perCopyPayout;
        return {
            ...r,
            grossPayout: perCopyPayout,
            net: r.net - payoutReduction,
        };
    });
}

function resolvePooledLifetimeCap(plan: Plan): Dollars | null {
    const cap = plan.maxLifetimePayoutDollars;
    return cap !== null &&
        plan.lifetimeConclusion.dollarCapScope ===
            LifetimeCapScope.PerUserAcrossVariant
        ? cap
        : null;
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

function scaledEstimate(estimate: Estimate, scale: number): Estimate {
    return {
        standardError: estimate.standardError * scale,
        value: estimate.value * scale,
    };
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

function toTrialStart(
    plan: Plan,
    start: SimStart,
    maxEvalDays: number,
): TrialStart {
    switch (start.phase) {
        case TradingPhase.Eval: {
            const state = { ...start.state };
            const elapsedDays = state.elapsedDays ?? 0;
            const dayCap = plan.evalDayCap(maxEvalDays) - elapsedDays;
            return {
                attempt: { dayCap, state },
                phase: TradingPhase.Eval,
                sunkSubscriptionDays:
                    start.subscriptionElapsedDays ?? elapsedDays,
            };
        }
        case TradingPhase.Funded: {
            return {
                phase: TradingPhase.Funded,
                seed: start.seed,
                state: { ...start.state },
            };
        }
    }
}

function trialSubscription(
    fees: FeeSchedule,
    result: TrialResult,
    discounts: CouponDiscounts | undefined,
): number {
    return (
        feesUntilPassAcrossAttempts(fees, evalAttemptDays(result), discounts) -
        initialEvalFee(fees, discounts)
    );
}

function uncertainMean(samples: readonly number[]): UncertainValue {
    const count = samples.length;
    if (count === 0) return { standardError: null, value: 0 };
    let sum = 0;
    let squaredSum = 0;
    for (const value of samples) {
        sum += value;
        squaredSum += value ** 2;
    }
    return {
        standardError:
            count < MIN_FUNDED_TRIALS_FOR_SE
                ? null
                : meanStandardError(sum, squaredSum, count),
        value: sum / count,
    };
}

function withoutKeys<T extends object, K extends keyof T>(
    value: T,
    keys: readonly K[],
): Omit<T, K> {
    const copy: T = { ...value };
    for (const key of keys) {
        Reflect.deleteProperty(copy, key);
    }
    return copy;
}
