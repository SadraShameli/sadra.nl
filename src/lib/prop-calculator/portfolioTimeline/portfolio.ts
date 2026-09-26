import { TRADING_DAYS_PER_MONTH } from '../core/constants';
import { LifetimeCapScope } from '../core/Plan';
import { deriveSubSeed, mulberry32 } from '../rng';
import {
    assertPayoutRequestPolicy,
    assertPositiveSafeInteger,
    SIM_DEFAULTS,
} from '../simulator';
import { percentile } from '../stats';
import { runAccountTimeline, type SharedPayoutBudget } from './accountTimeline';
import {
    DEFAULT_DAY_BUDGET,
    type PortfolioTimelineInputs,
    type PortfolioTimelineResult,
} from './types';

const STEP = 5;

export function simulatePortfolioTimeline(
    inputs: PortfolioTimelineInputs,
): PortfolioTimelineResult {
    const {
        accounts,
        commissionPerRoundTrip = SIM_DEFAULTS.commissionPerRoundTrip,
        dayBudget = DEFAULT_DAY_BUDGET,
        dayStop,
        discounts,
        evalDayPolicy,
        fundedDayPolicy,
        idleDayProbability,
        instrument,
        maxEvalDays,
        minRetainedCushion,
        payoutRequestPolicy,
        payoutRequestSize,
        plan,
        riskPerTrade,
        rrRatio,
        rungSizing,
        seed,
        stopPoints,
        tradesPerDay,
        trials,
        winrate,
    } = inputs;

    assertPositiveSafeInteger(trials, 'trials');
    assertPositiveSafeInteger(dayBudget, 'dayBudget');
    assertPositiveSafeInteger(accounts, 'accounts');
    assertPositiveSafeInteger(maxEvalDays, 'maxEvalDays');
    assertPayoutRequestPolicy(plan, payoutRequestPolicy, payoutRequestSize);
    const N = Math.min(accounts, plan.maxFundedAccounts);

    const initialPurchaseDiscounts = plan.purchaseDiscounts(discounts, N);

    const pooledLifetimeCap = plan.maxLifetimePayoutDollars;
    const isPooledScope =
        pooledLifetimeCap !== null &&
        plan.lifetimeConclusion.dollarCapScope ===
            LifetimeCapScope.PerUserAcrossVariant;

    const perTrialSpend: Float64Array[] = [];
    const perTrialPayout: Float64Array[] = [];
    const perTrialNet: Float64Array[] = [];
    const breakEvenMonthValues: number[] = [];
    let everPositiveCount = 0;
    let finalNetNegativeCount = 0;

    for (let t = 0; t < trials; t++) {
        const combinedSpend = new Float64Array(dayBudget + 1);
        const combinedPayout = new Float64Array(dayBudget + 1);
        const combinedNet = new Float64Array(dayBudget + 1);
        const sharedPayoutBudget: SharedPayoutBudget | undefined = isPooledScope
            ? { remaining: pooledLifetimeCap }
            : undefined;

        for (let a = 0; a < N; a++) {
            const accountRng = mulberry32(deriveSubSeed(seed, t, a));
            const account = runAccountTimeline(
                {
                    commissionPerRoundTrip,
                    dayBudget,
                    dayStop,
                    discounts,
                    evalDayPolicy,
                    fundedDayPolicy,
                    idleDayProbability,
                    initialPurchaseDiscounts,
                    instrument,
                    maxEvalDays,
                    minRetainedCushion,
                    payoutRequestPolicy,
                    payoutRequestSize,
                    plan,
                    riskPerTrade,
                    rng: accountRng,
                    rrRatio,
                    rungSizing,
                    stopPoints,
                    tradesPerDay,
                    winrate,
                },
                sharedPayoutBudget,
            );

            for (let d = 0; d <= dayBudget; d++) {
                combinedSpend[d] =
                    (combinedSpend[d] ?? 0) + (account.cumulativeSpend[d] ?? 0);
                combinedPayout[d] =
                    (combinedPayout[d] ?? 0) +
                    (account.cumulativePayout[d] ?? 0);
                combinedNet[d] =
                    (combinedNet[d] ?? 0) + (account.cumulativeNet[d] ?? 0);
            }
        }

        perTrialSpend.push(combinedSpend);
        perTrialPayout.push(combinedPayout);
        perTrialNet.push(combinedNet);

        if ((combinedNet.at(-1) ?? 0) < 0) finalNetNegativeCount += 1;

        const breakEvenDay = firstNonNegativeDay(combinedNet);
        if (breakEvenDay === null) {
            continue;
        }

        everPositiveCount += 1;
        breakEvenMonthValues.push(breakEvenDay / TRADING_DAYS_PER_MONTH);
    }

    const sampleIndices: number[] = [];
    for (let d = 0; d <= dayBudget; d += STEP) sampleIndices.push(d);
    if (sampleIndices.at(-1) !== dayBudget) sampleIndices.push(dayBudget);

    const days: number[] = [];
    const spendP10: number[] = [];
    const spendP50: number[] = [];
    const spendP90: number[] = [];
    const payoutP10: number[] = [];
    const payoutP50: number[] = [];
    const payoutP90: number[] = [];
    const netP10: number[] = [];
    const netP50: number[] = [];
    const netP90: number[] = [];

    for (const d of sampleIndices) {
        days.push(d);
        const spendVals = perTrialSpend.map((s) => s[d] ?? 0);
        const payoutVals = perTrialPayout.map((p) => p[d] ?? 0);
        const netVals = perTrialNet.map((n) => n[d] ?? 0);
        spendP10.push(percentile(spendVals, 10));
        spendP50.push(percentile(spendVals, 50));
        spendP90.push(percentile(spendVals, 90));
        payoutP10.push(percentile(payoutVals, 10));
        payoutP50.push(percentile(payoutVals, 50));
        payoutP90.push(percentile(payoutVals, 90));
        netP10.push(percentile(netVals, 10));
        netP50.push(percentile(netVals, 50));
        netP90.push(percentile(netVals, 90));
    }

    return {
        accountsSimulated: N,
        breakEvenMonthValues,
        days,
        netP10,
        netP50,
        netP90,
        payoutP10,
        payoutP50,
        payoutP90,
        pEverCashflowPositive: everPositiveCount / trials,
        pFinalNetNegative: finalNetNegativeCount / trials,
        spendP10,
        spendP50,
        spendP90,
    };
}

function firstNonNegativeDay(net: Float64Array): null | number {
    for (let index = 1; index < net.length; index++) {
        if ((net[index] ?? 0) >= 0) return index;
    }
    return null;
}
