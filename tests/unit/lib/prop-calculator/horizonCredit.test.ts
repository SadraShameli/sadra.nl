import { describe, expect, it } from 'vitest';

import {
    DailyLossLimitKind,
    dollars,
    FirmId,
    fraction,
    MffuVariant,
    type Plan,
    StaticDrawdown,
    TRADING_DAYS_PER_MONTH,
} from '~/lib/prop-calculator/core';
import { MyFundedFutures } from '~/lib/prop-calculator/firms/mffu/MyFundedFutures';
import {
    CorrelationMode,
    type SimInputs,
    simulate,
    simulatePortfolio,
} from '~/lib/prop-calculator/simulator';

const mffu = new MyFundedFutures();

const FUNDED_HORIZON_DAYS = 5;
const RISK_PER_TRADE = 50;
const RR_RATIO = 2;
const RETAINED_CUSHION = 200;
const EXPECTED_CREDIT = 500;
const EXPECTED_NET = -209;

function noPayoutToyPlan(): Plan {
    return rapidEodPlan().withOverrides({
        accountSize: dollars(1000),
        consistency: null,
        contractLimits: undefined,
        drawdown: new StaticDrawdown({ amount: dollars(RETAINED_CUSHION) }),
        evalDailyLossLimit: { kind: DailyLossLimitKind.None },
        fundedConsistency: { kind: 'set', rule: null },
        fundedDailyLossLimit: { kind: DailyLossLimitKind.None },
        fundedDrawdown: new StaticDrawdown({
            amount: dollars(RETAINED_CUSHION),
        }),
        isInstantFunded: true,
        minDaysAfterPassForPayout: 999,
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

function rapidEodPlan(): Plan {
    const found = mffu.findPlan({
        accountSize: 50_000,
        firm: FirmId.Mffu,
        variant: MffuVariant.RapidEod,
    });
    if (!found) throw new Error('MFF Rapid EOD 50K plan not found');
    return found;
}

function reachablePayoutToyPlan(): Plan {
    return noPayoutToyPlan().withOverrides({
        maxLifetimePayouts: 1,
        minDaysAfterPassForPayout: 0,
    });
}

function toyInputs(overrides: Partial<SimInputs> = {}): SimInputs {
    return {
        fundedHorizonDays: FUNDED_HORIZON_DAYS,
        maxEvalDays: 1,
        plan: noPayoutToyPlan(),
        riskPerTrade: RISK_PER_TRADE,
        rrRatio: RR_RATIO,
        seed: 1,
        tradesPerDay: 1,
        trials: 1,
        winrate: 1,
        ...overrides,
    };
}

describe('horizon credit: a surviving funded account is credited its withdrawable balance at the horizon', () => {
    it('equals the hand-derived withdrawable balance at horizon end', () => {
        const out = simulate(toyInputs());
        expect(out.expectedHorizonCredit).toBe(EXPECTED_CREDIT);
    });

    it('leaves expectedGrossPayout and expectedNet untouched by the credit', () => {
        const out = simulate(toyInputs());
        expect(out.expectedGrossPayout).toBe(0);
        expect(out.expectedNet).toBe(EXPECTED_NET);
    });

    it('folds the credit into expectedMonthlyNet as (net + credit) * 21 / days', () => {
        const out = simulate(toyInputs());
        expect(out.expectedMonthlyNet).toBe(
            ((out.expectedNet + out.expectedHorizonCredit) *
                TRADING_DAYS_PER_MONTH) /
                FUNDED_HORIZON_DAYS,
        );
    });

    it('gives no credit when the funded account busts before the horizon', () => {
        const out = simulate(toyInputs({ winrate: 0 }));
        expect(out.fundedBustProbability).toBe(1);
        expect(out.expectedHorizonCredit).toBe(0);
    });

    it('gives no credit once the account concludes on a lifetime-payout cap before the horizon', () => {
        const out = simulate(toyInputs({ plan: reachablePayoutToyPlan() }));
        expect(out.expectedGrossPayout).toBeGreaterThan(0);
        expect(out.expectedHorizonCredit).toBe(0);
    });

    it("folds into simulatePortfolio's monthly net too", () => {
        const out = simulatePortfolio({
            accounts: 2,
            correlation: CorrelationMode.Independent,
            fundedHorizonDays: FUNDED_HORIZON_DAYS,
            groups: 2,
            maxEvalDays: 1,
            plan: noPayoutToyPlan(),
            riskPerTrade: RISK_PER_TRADE,
            rrRatio: RR_RATIO,
            seed: 1,
            tradesPerDay: 1,
            trials: 1,
            winrate: 1,
        });

        const netSum = EXPECTED_NET * 2;
        const creditSum = EXPECTED_CREDIT * 2;
        const expectedDaysPerTrial =
            (FUNDED_HORIZON_DAYS + FUNDED_HORIZON_DAYS) / 2;
        expect(out.expectedMonthlyNet).toBe(
            ((netSum + creditSum) * TRADING_DAYS_PER_MONTH) /
                expectedDaysPerTrial,
        );
    });
});
