import { describe, expect, it } from 'vitest';

import {
    DailyLossLimitKind,
    DayStopRuleKind,
    dollars,
    FirmId,
    fraction,
    InstrumentSymbol,
    LucidVariant,
    MffuVariant,
    type Plan,
    StaticDrawdown,
    TRADING_DAYS_PER_MONTH,
} from '~/lib/prop-calculator/core';
import { LucidTrading } from '~/lib/prop-calculator/firms/lucid/LucidTrading';
import { MyFundedFutures } from '~/lib/prop-calculator/firms/mffu/MyFundedFutures';
import {
    CorrelationMode,
    type SimInputs,
    simulate,
    simulatePortfolio,
} from '~/lib/prop-calculator/simulator';

const mffu = new MyFundedFutures();
const lucid = new LucidTrading();

const FUNDED_HORIZON_DAYS = 5;
const RISK_PER_TRADE = 50;
const RR_RATIO = 2;
const RETAINED_CUSHION = 200;
const EXPECTED_CREDIT = 500;
const EXPECTED_NET = -209;

function lucidInputs(plan: Plan, overrides: Partial<SimInputs>): SimInputs {
    return {
        commissionPerRoundTrip: 0,
        dayStop: { kind: DayStopRuleKind.DayGreen },
        fundedHorizonDays: 252,
        maxEvalDays: 150,
        plan,
        riskPerTrade: 250,
        rrRatio: 2,
        seed: 42,
        tradesPerDay: 4,
        trials: 2000,
        winrate: 0.4,
        ...overrides,
    };
}

function lucidPlan(variant: LucidVariant): Plan {
    const found = lucid.findPlan({
        accountSize: 50_000,
        firm: FirmId.Lucid,
        variant,
    });
    if (!found) throw new Error(`Lucid ${variant} 50K plan not found`);
    return found;
}

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

describe('horizon credit is one capped payout request per surviving account (T32)', () => {
    it('Lucid Pro no-DLL at 25% of cushion (MNQ, 10 point stop) credits at most one ladder step net of split per survivor', () => {
        const plan = lucidPlan(LucidVariant.ProNoDll);
        const out = simulate(
            lucidInputs(plan, {
                fundedCushionPercent: fraction(0.25),
                instrument: InstrumentSymbol.MNQ,
                stopPoints: 10,
            }),
        );

        expect(out.fundedSurvivalProbability).toBeGreaterThan(0);
        expect(out.expectedHorizonCredit).toBeLessThanOrEqual(
            out.fundedSurvivalProbability * plan.payoutFromProfit(2500, 1) +
                1e-6,
        );
    });

    it('Lucid Daily EOD at flat $1000 with a $500 request size credits at most one $500 request net of split per survivor', () => {
        const plan = lucidPlan(LucidVariant.DailyEod);
        const out = simulate(
            lucidInputs(plan, {
                payoutRequestSize: 500,
                riskPerTrade: 1000,
            }),
        );

        expect(out.fundedSurvivalProbability).toBeGreaterThan(0);
        expect(out.expectedHorizonCredit).toBeLessThanOrEqual(
            out.fundedSurvivalProbability * 0.9 * 500 + 1e-6,
        );
    });
});

describe('expectedMonthlyRealizedNet leaves the horizon credit out of the monthly net (N-72)', () => {
    it('scales the per-cycle net alone to a month over the same slot days', () => {
        const out = simulate(toyInputs());
        expect(out.expectedMonthlyRealizedNet).toBe(
            (EXPECTED_NET * TRADING_DAYS_PER_MONTH) / FUNDED_HORIZON_DAYS,
        );
    });

    it('differs from expectedMonthlyNet by exactly the credit scaled to a month', () => {
        const out = simulate(toyInputs());
        expect(out.expectedHorizonCredit).toBeGreaterThan(0);
        expect(
            out.expectedMonthlyNet - out.expectedMonthlyRealizedNet,
        ).toBeCloseTo(
            (out.expectedHorizonCredit * TRADING_DAYS_PER_MONTH) /
                FUNDED_HORIZON_DAYS,
            9,
        );
    });

    it('equals expectedMonthlyNet when no account survives to carry a credit', () => {
        const out = simulate(toyInputs({ winrate: 0 }));
        expect(out.expectedHorizonCredit).toBe(0);
        expect(out.expectedMonthlyRealizedNet).toBe(out.expectedMonthlyNet);
    });

    it('is scaled by copyAccounts like the credit and the credit-inclusive monthly net', () => {
        const single = simulate(toyInputs());
        const copied = simulate(toyInputs({ copyAccounts: 3 }));
        expect(copied.expectedHorizonCredit).toBe(
            single.expectedHorizonCredit * 3,
        );
        expect(copied.expectedMonthlyNet).toBe(single.expectedMonthlyNet * 3);
        expect(copied.expectedMonthlyRealizedNet).toBe(
            single.expectedMonthlyRealizedNet * 3,
        );
    });

    it('keeps the credit identity on Lucid Pro no-DLL at 25% of cushion, where survivors carry a real credit', () => {
        const out = simulate(
            lucidInputs(lucidPlan(LucidVariant.ProNoDll), {
                fundedCushionPercent: fraction(0.25),
                instrument: InstrumentSymbol.MNQ,
                stopPoints: 10,
                trials: 200,
            }),
        );
        expect(out.expectedHorizonCredit).toBeGreaterThan(0);
        const slotDays =
            (out.expectedNet * TRADING_DAYS_PER_MONTH) /
            out.expectedMonthlyRealizedNet;
        expect(
            out.expectedMonthlyNet - out.expectedMonthlyRealizedNet,
        ).toBeCloseTo(
            (out.expectedHorizonCredit * TRADING_DAYS_PER_MONTH) / slotDays,
            9,
        );
    });

    it("leaves the credit out of simulatePortfolio's realized monthly net too", () => {
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

        const expectedDaysPerTrial =
            (FUNDED_HORIZON_DAYS + FUNDED_HORIZON_DAYS) / 2;
        expect(out.expectedMonthlyRealizedNet).toBe(
            (EXPECTED_NET * 2 * TRADING_DAYS_PER_MONTH) / expectedDaysPerTrial,
        );
    });
});
