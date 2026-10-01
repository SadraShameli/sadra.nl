import {
    type DayPolicy,
    type DayStopRule,
    DayStopRuleKind,
    DEFAULT_RUNG_SIZING,
    flatDayPolicy,
    policySizingOf,
} from '~/lib/prop-calculator/core/DayPolicy';
import { dollars, fraction } from '~/lib/prop-calculator/core/lib/units';
import { LifetimeCapScope } from '~/lib/prop-calculator/core/Plan';
import { resolvePositionSizing } from '~/lib/prop-calculator/core/PositionSizing';
import { TradingPhase } from '~/lib/prop-calculator/core/TradingPhase';
import {
    assertDeclaredSizingMatchesPhase,
    assertPositiveSafeInteger,
    SIM_DEFAULTS,
    simInputsSizingIssue,
} from '~/lib/prop-calculator/simulator';

import { CardChargeCursor } from './DatedChargeCursor';
import { runEvalToFundedCycle } from './fundedCycle';
import {
    type AccountTimelineInputs,
    type AccountTimelineResult,
    DEFAULT_DAY_BUDGET,
} from './types';

const MAX_CARDS_PER_TIMELINE = 2000;

export interface SharedPayoutBudget {
    remaining: number;
}

export function runAccountTimeline(
    inputs: AccountTimelineInputs,
    sharedPayoutBudget?: SharedPayoutBudget,
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
        payoutRequestPolicy,
        payoutRequestSize,
        plan,
        rng,
        rrRatio,
        rungSizing = DEFAULT_RUNG_SIZING,
        stopPoints,
        winrate: winrateInput,
    } = inputs;
    const payoutBudget = resolvePayoutBudget(inputs, sharedPayoutBudget);
    const commission = dollars(commissionPerRoundTrip);
    const cushion = plan.resolveRetainedCushion(minRetainedCushion);
    const positionSizing = resolvePositionSizing(instrument, stopPoints);
    const requestSize =
        payoutRequestSize === undefined
            ? undefined
            : dollars(payoutRequestSize);
    const winrate = fraction(winrateInput);
    const sizingIssue = simInputsSizingIssue({
        fundedDayPolicy: inputs.fundedDayPolicy,
        instrument,
        riskPerTrade: inputs.riskPerTrade,
        stopPoints,
    });
    if (sizingIssue !== null) {
        throw new Error(`runAccountTimeline: ${sizingIssue}`);
    }
    const stopRule = inputs.dayStop ?? { kind: DayStopRuleKind.None };
    const evalDayPolicy = phaseDayPolicy(inputs, TradingPhase.Eval, stopRule);
    const fundedDayPolicy = phaseDayPolicy(
        inputs,
        TradingPhase.Funded,
        stopRule,
    );

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
            cardDayBudget: remainingDays,
            commission,
            discounts: cardsRun === 1 ? initialPurchaseDiscounts : discounts,
            evalDayPolicy,
            fundedDayPolicy,
            idleDayProbability,
            maxEvalDays,
            maxFundedDays: remainingDays,
            minRetainedCushion: cushion,
            payoutRequestPolicy,
            payoutRequestSize: requestSize,
            plan,
            positionSizing,
            rng,
            rrRatio,
            rungSizing,
            winrate,
        });

        if (card.totalDays === 0) {
            throw new Error(
                `runAccountTimeline: a card used no trading days (${plan.label} allows ${plan.evalDayCap(maxEvalDays)} eval days per attempt), so the timeline cannot advance`,
            );
        }

        const spendBeforeCard = spendSoFar;
        const evalRetrySpendTotal = card.evalRetryCharges.reduce(
            (sum, charge) => sum + charge.fee,
            0,
        );
        const cardCharges = new CardChargeCursor({
            evalDays: card.evalDays,
            evalRetryCharges: card.evalRetryCharges,
            fundedResetCharges: card.fundedResetCharges,
            spreadEvalCost: card.evalCost - evalRetrySpendTotal,
        });
        let payoutIndex = 0;

        for (
            let d = 1;
            d <= card.totalDays && cardStart + d <= dayBudget;
            d++
        ) {
            spendSoFar = spendBeforeCard + cardCharges.paidThrough(d);
            while (
                payoutIndex < card.payouts.length &&
                card.payouts[payoutIndex]?.dayOffset === d
            ) {
                const rawAmount = card.payouts[payoutIndex]?.amount ?? 0;
                const amount =
                    payoutBudget === null
                        ? rawAmount
                        : Math.max(
                              0,
                              Math.min(rawAmount, payoutBudget.remaining),
                          );
                payoutSoFar += amount;
                if (payoutBudget !== null) payoutBudget.remaining -= amount;
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

function declaredDayPolicy(
    inputs: AccountTimelineInputs,
    phase: TradingPhase,
): DayPolicy | undefined {
    switch (phase) {
        case TradingPhase.Eval: {
            return inputs.evalDayPolicy;
        }
        case TradingPhase.Funded: {
            return inputs.fundedDayPolicy;
        }
    }
}

function phaseDayPolicy(
    inputs: AccountTimelineInputs,
    phase: TradingPhase,
    stopRule: DayStopRule,
): DayPolicy {
    const declared = declaredDayPolicy(inputs, phase);
    if (declared === undefined) {
        return flatDayPolicy(
            inputs.riskPerTrade,
            inputs.tradesPerDay,
            stopRule,
            policySizingOf(phase),
        );
    }
    assertDeclaredSizingMatchesPhase(inputs, declared, phase);
    return declared;
}

function resolvePayoutBudget(
    inputs: AccountTimelineInputs,
    sharedPayoutBudget: SharedPayoutBudget | undefined,
): null | SharedPayoutBudget {
    const cap = inputs.plan.maxLifetimePayoutDollars;
    return cap === null ||
        inputs.plan.lifetimeConclusion.dollarCapScope !==
            LifetimeCapScope.PerUserAcrossVariant
        ? null
        : (sharedPayoutBudget ?? { remaining: cap });
}
