import { describe, expect, it } from 'vitest';

import {
    DailyLossLimitKind,
    dollars,
    EodTrailingDrawdown,
    FirmId,
    fraction,
    MffuVariant,
    type Plan,
} from '~/lib/prop-calculator/core';
import { computeFundedStateValue } from '~/lib/prop-calculator/core/FundedStateValue';
import { MyFundedFutures } from '~/lib/prop-calculator/firms/mffu/MyFundedFutures';

const WINRATE = 0.45;
const RR = 2;

function toyPlan(): Plan {
    const rapidEod = new MyFundedFutures().findPlan({
        accountSize: 50_000,
        firm: FirmId.Mffu,
        variant: MffuVariant.RapidEod,
    });
    if (!rapidEod) throw new Error('MFF Rapid EOD 50K plan not found');
    return rapidEod.withOverrides({
        accountSize: dollars(1000),
        consistency: null,
        contractLimits: undefined,
        drawdown: new EodTrailingDrawdown({ amount: dollars(100) }),
        evalDailyLossLimit: { kind: DailyLossLimitKind.None },
        fundedConsistency: { kind: 'set', rule: null },
        fundedDailyLossLimit: { kind: DailyLossLimitKind.None },
        fundedDrawdown: new EodTrailingDrawdown({
            amount: dollars(100),
            lock: { atProfit: dollars(150), lockedThreshold: () => 1000 },
        }),
        isInstantFunded: true,
        maxLifetimePayouts: 1,
        minDaysAfterPassForPayout: 0,
        minPayoutProfit: dollars(0),
        minPayoutProfitPerCycle: dollars(0),
        minPayoutRequest: dollars(0),
        minQualifyingDayProfit: null,
        minTradingDays: 0,
        payoutBalanceShareCap: undefined,
        payoutRequestCap: undefined,
        payoutTiers: [
            { thresholdProfit: dollars(0), traderShare: fraction(1) },
        ],
    });
}

const plan = toyPlan();
const CONFIG = {
    actionStepMultiple: 0.25,
    cushionStepMultiple: 0.25,
    evalInitialValue: 0,
    feePerAttempt: dollars(0),
    maxActionMultiple: 1,
    payoutRegimeCap: 0,
    plan,
    rrRatio: RR,
    tradesPerDay: 2,
    winrate: WINRATE,
};
const result = computeFundedStateValue(CONFIG);

function fundedStart() {
    const state = plan.initialState();
    plan.beginFundedPhase(state);
    return state;
}

function readingAt(state = fundedStart(), tradeIndex = 0, risks?: number[]) {
    const reading = result.valuesAt(state, tradeIndex, undefined, risks);
    if (reading === null) throw new Error('no funded value reading');
    return reading;
}

describe('FundedStateValue valuesAt (PT-30a DpStateValues)', () => {
    it('picks the same risk as the policy at the funded start and mid-day', () => {
        const start = fundedStart();
        const afterLoss = {
            ...start,
            balance: start.balance - 25,
            todayPnL: -25,
        };

        expect(readingAt(start).bestRisk).toBe(
            result.dayPolicy.computeRisk?.(start, 0),
        );
        expect(readingAt(afterLoss, 1).bestRisk).toBe(
            result.dayPolicy.computeRisk?.(afterLoss, 1),
        );
    });

    it('is the best of not trading and every candidate', () => {
        const reading = readingAt();

        expect(reading.trades.length).toBeGreaterThan(1);
        expect(reading.value).toBe(
            Math.max(
                reading.noTradeValue,
                ...reading.trades.map((trade) => trade.value),
            ),
        );
    });

    it('values each candidate as p x V(win) + (1 - p) x V(loss) at the fixed rr', () => {
        for (const trade of readingAt().trades) {
            expect(trade.value).toBe(
                WINRATE * trade.valueAfterWin +
                    (1 - WINRATE) * trade.valueAfterLoss,
            );
        }
    });

    it('matches the stored initial value at the funded start once the solve is converged tightly (the lookup is one exact backup of the stored values)', () => {
        const tight = computeFundedStateValue({
            ...CONFIG,
            convergenceTolerance: 1e-9,
            maxIterationsPerLevel: 100_000,
        });
        const reading = tight.valuesAt(fundedStart(), 0);

        expect(reading?.value).toBeCloseTo(tight.initialValue, 6);
    });

    it("reads V after a win as the value of the after-win state's own next decision", () => {
        const start = fundedStart();
        const trade = readingAt(start).trades.find((each) => each.risk === 25);
        const afterWin = {
            ...start,
            balance: start.balance + RR * 25,
            todayPnL: RR * 25,
        };

        expect(trade?.valueAfterWin).toBeCloseTo(
            readingAt(afterWin, 1).value,
            9,
        );
    });

    it('values a requested risk on the action grid exactly like its candidate', () => {
        const reading = readingAt(fundedStart(), 0, [50]);

        expect(reading.requested).toEqual([
            reading.trades.find((trade) => trade.risk === 50),
        ]);
    });

    it('reads nothing past the last trade of the day', () => {
        expect(result.valuesAt(fundedStart(), 2)).toBeNull();
    });
});
