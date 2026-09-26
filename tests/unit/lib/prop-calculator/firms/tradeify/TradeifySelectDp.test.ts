import { describe, expect, it } from 'vitest';

import {
    type AccountState,
    dollars,
    FirmId,
    INSTRUMENTS,
    InstrumentSymbol,
    type Plan,
    points,
    TradeifyVariant,
} from '~/lib/prop-calculator/core';
import {
    computeFundedStateValue,
    isFundedDpEligible,
} from '~/lib/prop-calculator/core/FundedStateValue';
import { Tradeify } from '~/lib/prop-calculator/firms/tradeify/Tradeify';

const SELECT_VARIANTS = [
    TradeifyVariant.SelectFlex,
    TradeifyVariant.SelectDaily,
] as const;

const STOP_POINTS = 1.25;

function contractRisk(symbol: InstrumentSymbol, count: number): number {
    return count * STOP_POINTS * INSTRUMENTS[symbol].pointValue;
}

function firstTradeRiskFor(
    plan: Plan,
    symbol: InstrumentSymbol,
    payoutRegimeCap = 0,
): (state: AccountState, payoutsIssued?: number) => number {
    const result = computeFundedStateValue({
        actionStepMultiple: 0.25,
        cushionStepMultiple: 0.1,
        evalInitialValue: 0,
        feePerAttempt: dollars(0),
        maxActionMultiple: 1,
        maxCushionMultiple: 2,
        payoutRegimeCap,
        plan,
        positionSizing: {
            instrument: INSTRUMENTS[symbol],
            stopPoints: points(STOP_POINTS),
        },
        rrRatio: 2,
        tradesPerDay: 1,
        winrate: 0.5,
    });
    return (state, payoutsIssued = 0) =>
        result.dayPolicy.computeRisk?.(state, 0, {
            cycleBestDayProfit: 0,
            dayGateProgress: 0,
            fundedResetsUsed: 0,
            lastPayoutBalance: state.balance,
            payoutsIssued,
        }) ?? 0;
}

function selectFlexSessionOpenAfterPayout(plan: Plan): AccountState {
    const state = sessionOpenAfterLosingDay(plan, 1000, 2000);
    plan.fundedDrawdown.forceLock(state);
    return state;
}

function selectPlan(variant: TradeifyVariant): Plan {
    const plan = new Tradeify()
        .findPlan({
            accountSize: 50_000,
            firm: FirmId.Tradeify,
            variant,
        })
        ?.withOverrides({ maxConsecutiveIdleDays: undefined });
    if (!plan) throw new Error(`Tradeify 50K ${variant} plan not found`);
    return plan;
}

function sessionOpenAfterLosingDay(
    plan: Plan,
    closeProfit: number,
    peakCloseProfit: number,
): AccountState {
    const state = plan.initialState();
    plan.beginFundedPhase(state);
    state.balance = state.startingBalance + closeProfit;
    state.peakDayCloseProfit = peakCloseProfit;
    state.threshold =
        state.startingBalance + peakCloseProfit - plan.fundedDrawdown.amount;
    state.tradingDays = 5;
    state.qualifyingDays = 1;
    return state;
}

describe.each(SELECT_VARIANTS)(
    'funded DP for Tradeify %s keeps the cumulative contract tier after a losing day (R1-54 DP half, WP17 step 10)',
    (variant) => {
        const plan = selectPlan(variant);

        it('is eligible for the funded DP', () => {
            expect(isFundedDpEligible(plan)).toBe(true);
        });

        it.each([
            { contracts: 4, symbol: InstrumentSymbol.NQ },
            { contracts: 40, symbol: InstrumentSymbol.MNQ },
        ])(
            'sizes $symbol at $contracts contracts from a session opened at 1,200 profit after a 2,000 peak close',
            ({ contracts, symbol }) => {
                const riskAt = firstTradeRiskFor(plan, symbol);
                expect(
                    riskAt(sessionOpenAfterLosingDay(plan, 1200, 2000)),
                ).toBe(contractRisk(symbol, contracts));
            },
            120_000,
        );

        it('stays on the 2-mini bottom tier from the same open when the peak close never reached 1,500 profit', () => {
            const riskAt = firstTradeRiskFor(plan, InstrumentSymbol.NQ);
            expect(riskAt(sessionOpenAfterLosingDay(plan, 1200, 1400))).toBe(
                contractRisk(InstrumentSymbol.NQ, 2),
            );
        }, 120_000);
    },
);

describe('funded DP for Tradeify Select Flex keeps the cumulative contract tier after a payout (help article 12853966)', () => {
    const plan = selectPlan(TradeifyVariant.SelectFlex);

    it('sizes NQ at 4 contracts in the first post-payout session after a 2,000 peak close and a payout down to 1,000 profit', () => {
        const riskAt = firstTradeRiskFor(plan, InstrumentSymbol.NQ, 1);
        const state = selectFlexSessionOpenAfterPayout(plan);
        expect(state.thresholdLocked).toBe(true);
        expect(riskAt(state, 1)).toBe(contractRisk(InstrumentSymbol.NQ, 4));
    }, 120_000);
});
