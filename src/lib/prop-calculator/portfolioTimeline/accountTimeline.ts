import {
    DayStopRuleKind,
    DEFAULT_RUNG_SIZING,
    flatDayPolicy,
} from '../core/DayPolicy';
import { dollars, fraction } from '../core/lib/units';
import { resolvePositionSizing } from '../core/PositionSizing';
import { assertPositiveSafeInteger, SIM_DEFAULTS } from '../simulator';
import { runEvalToFundedCycle } from './fundedCycle';
import {
    type AccountTimelineInputs,
    type AccountTimelineResult,
    DEFAULT_DAY_BUDGET,
} from './types';

const MAX_CARDS_PER_TIMELINE = 2000;

export function runAccountTimeline(
    inputs: AccountTimelineInputs,
): AccountTimelineResult {
    const {
        commissionPerRoundTrip = SIM_DEFAULTS.commissionPerRoundTrip,
        dayBudget = DEFAULT_DAY_BUDGET,
        discounts,
        idleDayProbability,
        initialPurchaseDiscounts = discounts,
        instrument,
        maxEvalDays,
        minRetainedCushion,
        payoutRequestSize,
        plan,
        rng,
        rrRatio,
        rungSizing = DEFAULT_RUNG_SIZING,
        stopPoints,
        winrate: winrateInput,
    } = inputs;
    const commission = dollars(commissionPerRoundTrip);
    const cushion = plan.resolveRetainedCushion(minRetainedCushion);
    const positionSizing = resolvePositionSizing(instrument, stopPoints);
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

    assertPositiveSafeInteger(dayBudget, 'dayBudget');
    assertPositiveSafeInteger(maxEvalDays, 'maxEvalDays');

    const cumulativeSpend = new Float64Array(dayBudget + 1);
    const cumulativePayout = new Float64Array(dayBudget + 1);
    const cumulativeNet = new Float64Array(dayBudget + 1);

    let spendSoFar = 0;
    let payoutSoFar = 0;
    let currentDay = 0;
    let cardsRun = 0;

    while (currentDay < dayBudget && cardsRun < MAX_CARDS_PER_TIMELINE) {
        cardsRun += 1;
        const cardStart = currentDay;
        const remainingDays = dayBudget - cardStart;

        const card = runEvalToFundedCycle({
            commission,
            discounts: cardsRun === 1 ? initialPurchaseDiscounts : discounts,
            evalDayPolicy,
            fundedDayPolicy,
            idleDayProbability,
            maxEvalDays,
            maxFundedDays: remainingDays,
            minRetainedCushion: cushion,
            payoutRequestSize: requestSize,
            plan,
            positionSizing,
            rng,
            rrRatio,
            rungSizing,
            winrate,
        });

        const spendBeforeCard = spendSoFar;
        let payoutIndex = 0;
        let fundedResetIndex = 0;
        let fundedResetSpend = 0;

        for (
            let d = 1;
            d <= card.totalDays && cardStart + d <= dayBudget;
            d++
        ) {
            while (
                fundedResetIndex < card.fundedResetCharges.length &&
                card.fundedResetCharges[fundedResetIndex]?.dayOffset === d
            ) {
                fundedResetSpend +=
                    card.fundedResetCharges[fundedResetIndex]?.fee ?? 0;
                fundedResetIndex += 1;
            }
            spendSoFar =
                spendBeforeCard +
                fundedResetSpend +
                (card.evalDays > 0
                    ? (card.evalCost * Math.min(d, card.evalDays)) /
                      card.evalDays
                    : card.evalCost);
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

        currentDay = Math.min(dayBudget, cardStart + card.totalDays);
    }

    for (let d = currentDay + 1; d <= dayBudget; d++) {
        cumulativeSpend[d] = spendSoFar;
        cumulativePayout[d] = payoutSoFar;
        cumulativeNet[d] = payoutSoFar - spendSoFar;
    }

    return { cumulativeNet, cumulativePayout, cumulativeSpend };
}
