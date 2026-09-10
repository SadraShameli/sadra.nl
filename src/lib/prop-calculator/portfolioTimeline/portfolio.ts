import { TRADING_DAYS_PER_MONTH } from '../core/constants';
import { deriveSubSeed, mulberry32 } from '../rng';
import { percentile } from '../stats';
import { runAccountTimeline } from './accountTimeline';
import {
    DEFAULT_DAY_BUDGET,
    DEFAULT_MAX_PAYOUTS_PER_CARD,
    type PortfolioTimelineInputs,
    type PortfolioTimelineResult,
} from './types';

const STEP = 5;

export function simulatePortfolioTimeline(
    inputs: PortfolioTimelineInputs,
): PortfolioTimelineResult {
    const {
        accounts,
        commissionPerRoundTrip = 0,
        dayBudget = DEFAULT_DAY_BUDGET,
        dayStop,
        discounts,
        evalDayPolicy,
        fundedDayPolicy,
        maxEvalDays,
        maxPayoutsPerCard = DEFAULT_MAX_PAYOUTS_PER_CARD,
        minRetainedCushion,
        payoutRequestSize,
        plan,
        riskPerTrade,
        rrRatio,
        rungSizing,
        seed,
        tradesPerDay,
        trials,
        winrate,
    } = inputs;

    const safeDayBudget = Math.max(1, Math.floor(dayBudget));
    const safeTrials = Math.max(1, Math.floor(trials));
    const N = Math.max(1, Math.floor(accounts));

    const perTrialSpend: Float64Array[] = [];
    const perTrialPayout: Float64Array[] = [];
    const perTrialNet: Float64Array[] = [];
    const breakEvenMonthValues: number[] = [];
    let everPositiveCount = 0;

    for (let t = 0; t < safeTrials; t++) {
        const combinedSpend = new Float64Array(safeDayBudget + 1);
        const combinedPayout = new Float64Array(safeDayBudget + 1);
        const combinedNet = new Float64Array(safeDayBudget + 1);

        for (let a = 0; a < N; a++) {
            const accountRng = mulberry32(deriveSubSeed(seed, t, a));
            const account = runAccountTimeline({
                commissionPerRoundTrip,
                dayBudget: safeDayBudget,
                dayStop,
                discounts,
                evalDayPolicy,
                fundedDayPolicy,
                maxEvalDays,
                maxPayoutsPerCard,
                minRetainedCushion,
                payoutRequestSize,
                plan,
                riskPerTrade,
                rng: accountRng,
                rrRatio,
                rungSizing,
                tradesPerDay,
                winrate,
            });

            for (let d = 0; d <= safeDayBudget; d++) {
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

        const breakEvenDay = firstNonNegativeDay(combinedNet);
        if (breakEvenDay !== null) {
            everPositiveCount += 1;
            breakEvenMonthValues.push(breakEvenDay / TRADING_DAYS_PER_MONTH);
        }
    }

    const sampleIndices: number[] = [];
    for (let d = 0; d <= safeDayBudget; d += STEP) sampleIndices.push(d);
    if (sampleIndices.at(-1) !== safeDayBudget)
        sampleIndices.push(safeDayBudget);

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
        breakEvenMonthValues,
        days,
        netP10,
        netP50,
        netP90,
        payoutP10,
        payoutP50,
        payoutP90,
        pEverCashflowPositive: everPositiveCount / safeTrials,
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
