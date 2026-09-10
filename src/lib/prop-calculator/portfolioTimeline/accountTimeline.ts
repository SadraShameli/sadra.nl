import {
    DayStopRuleKind,
    DEFAULT_RUNG_SIZING,
    flatDayPolicy,
} from '../core/DayPolicy';
import { dollars, fraction } from '../core/units';
import { runEvalToFundedCycle } from './fundedCycle';
import {
    type AccountTimelineInputs,
    type AccountTimelineResult,
    DEFAULT_DAY_BUDGET,
    DEFAULT_MAX_PAYOUTS_PER_CARD,
} from './types';

const MAX_CARDS_PER_TIMELINE = 2000;

export function runAccountTimeline(
    inputs: AccountTimelineInputs,
): AccountTimelineResult {
    const {
        commissionPerRoundTrip = 0,
        dayBudget = DEFAULT_DAY_BUDGET,
        discounts,
        maxEvalDays,
        maxPayoutsPerCard = DEFAULT_MAX_PAYOUTS_PER_CARD,
        minRetainedCushion,
        payoutRequestSize,
        plan,
        rng,
        rrRatio,
        rungSizing = DEFAULT_RUNG_SIZING,
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
    const flatPolicy = flatDayPolicy(
        inputs.riskPerTrade,
        inputs.tradesPerDay,
        inputs.dayStop ?? { kind: DayStopRuleKind.None },
    );
    const evalDayPolicy = inputs.evalDayPolicy ?? flatPolicy;
    const fundedDayPolicy = inputs.fundedDayPolicy ?? flatPolicy;

    const safeDayBudget = Math.max(1, Math.floor(dayBudget));
    const safeMaxEvalDays = Math.max(1, Math.floor(maxEvalDays));

    const cumulativeSpend = new Float64Array(safeDayBudget + 1);
    const cumulativePayout = new Float64Array(safeDayBudget + 1);
    const cumulativeNet = new Float64Array(safeDayBudget + 1);

    let spendSoFar = 0;
    let payoutSoFar = 0;
    let currentDay = 0;
    let cardsRun = 0;

    while (currentDay < safeDayBudget && cardsRun < MAX_CARDS_PER_TIMELINE) {
        cardsRun += 1;
        const cardStart = currentDay;
        const remainingDays = safeDayBudget - cardStart;

        const card = runEvalToFundedCycle({
            commission,
            discounts,
            evalDayPolicy,
            fundedDayPolicy,
            maxEvalDays: safeMaxEvalDays,
            maxFundedDays: remainingDays,
            maxPayoutsPerCard,
            minRetainedCushion: cushion,
            payoutRequestSize: requestSize,
            plan,
            rng,
            rrRatio,
            rungSizing,
            winrate,
        });

        spendSoFar += card.totalCost;
        let payoutIndex = 0;

        for (
            let d = 1;
            d <= card.totalDays && cardStart + d <= safeDayBudget;
            d++
        ) {
            while (
                payoutIndex < card.payouts.length &&
                card.payouts[payoutIndex]?.dayOffset === d
            ) {
                payoutSoFar += card.payouts[payoutIndex]?.amount ?? 0;
                payoutIndex += 1;
            }
            const absoluteDay = cardStart + d;
            cumulativeSpend[absoluteDay] = spendSoFar;
            cumulativePayout[absoluteDay] = payoutSoFar;
            cumulativeNet[absoluteDay] = payoutSoFar - spendSoFar;
        }

        currentDay = Math.min(safeDayBudget, cardStart + card.totalDays);
    }

    for (let d = currentDay + 1; d <= safeDayBudget; d++) {
        cumulativeSpend[d] = spendSoFar;
        cumulativePayout[d] = payoutSoFar;
        cumulativeNet[d] = payoutSoFar - spendSoFar;
    }

    return { cardsRun, cumulativeNet, cumulativePayout, cumulativeSpend };
}
