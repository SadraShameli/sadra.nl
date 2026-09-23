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

function evalBustToyPlan(): Plan {
    return rapidEodPlan().withOverrides({
        accountSize: dollars(1000),
        consistency: null,
        contractLimits: undefined,
        drawdown: new StaticDrawdown({ amount: dollars(RISK_PER_TRADE / 5) }),
        evalDailyLossLimit: { kind: DailyLossLimitKind.None },
        fundedConsistency: { kind: 'set', rule: null },
        fundedDailyLossLimit: { kind: DailyLossLimitKind.None },
        isInstantFunded: false,
        minQualifyingDayProfit: null,
        minTradingDays: 0,
    });
}

function instantFundedToyPlan(): Plan {
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

function toyInputs(overrides: Partial<SimInputs> = {}): SimInputs {
    return {
        fundedHorizonDays: FUNDED_HORIZON_DAYS,
        maxEvalDays: 1,
        plan: instantFundedToyPlan(),
        riskPerTrade: RISK_PER_TRADE,
        rrRatio: RR_RATIO,
        seed: 1,
        tradesPerDay: 1,
        trials: 1,
        winrate: 1,
        ...overrides,
    };
}

describe('rebuyLagDays adds empty slot time to the monthly-net denominator', () => {
    it('(a) omitted and 0 give toStrictEqual outputs', () => {
        const omitted = simulate(toyInputs());
        const explicitZero = simulate(toyInputs({ rebuyLagDays: 0 }));
        expect(explicitZero).toStrictEqual(omitted);
    });

    it('(b) on a deterministic toy, monthly net divides by (days + lag * attempts)', () => {
        const lag = 3;
        const base = simulate(toyInputs());
        const withLag = simulate(toyInputs({ rebuyLagDays: lag }));

        expect(base.expectedAttempts).toBe(1);
        expect(withLag.expectedMonthlyNet).toBe(
            ((base.expectedNet + base.expectedHorizonCredit) *
                TRADING_DAYS_PER_MONTH) /
                (FUNDED_HORIZON_DAYS + lag * 1),
        );
    });

    it('(c) the lag changes only expectedMonthlyNet: everything else stays toStrictEqual', () => {
        const base = simulate(toyInputs());
        const withLag = simulate(toyInputs({ rebuyLagDays: 4 }));

        const { expectedMonthlyNet: baseMonthlyNet, ...baseRest } = base;
        const { expectedMonthlyNet: lagMonthlyNet, ...lagRest } = withLag;
        expect(lagRest).toStrictEqual(baseRest);
        expect(lagMonthlyNet).not.toBe(baseMonthlyNet);
    });

    it('(d) with maxAttempts 3 and a deterministic eval bust, the lag is charged per attempt', () => {
        const lag = 2;
        const maxAttempts = 3;
        const bustInputs: Partial<SimInputs> = {
            maxAttempts,
            maxEvalDays: 1,
            plan: evalBustToyPlan(),
            winrate: 0,
        };
        const base = simulate(toyInputs(bustInputs));
        const withLag = simulate(
            toyInputs({ ...bustInputs, rebuyLagDays: lag }),
        );

        expect(base.bustProbability).toBe(1);
        expect(base.expectedAttempts).toBe(maxAttempts);

        const daysWithNoLag = maxAttempts * 1;
        expect(base.expectedMonthlyNet).toBe(
            (base.expectedNet * TRADING_DAYS_PER_MONTH) / daysWithNoLag,
        );
        expect(withLag.expectedMonthlyNet).toBe(
            (base.expectedNet * TRADING_DAYS_PER_MONTH) /
                (daysWithNoLag + lag * maxAttempts),
        );
    });

    it('(e) negative, NaN and Infinity each throw', () => {
        expect(() => simulate(toyInputs({ rebuyLagDays: -1 }))).toThrow();
        expect(() => simulate(toyInputs({ rebuyLagDays: NaN }))).toThrow();
        expect(() => simulate(toyInputs({ rebuyLagDays: Infinity }))).toThrow();
    });

    it('(f) simulatePortfolio honors the lag', () => {
        const lag = 3;
        const single = simulate(toyInputs());
        const withLag = simulatePortfolio({
            accounts: 2,
            correlation: CorrelationMode.Independent,
            fundedHorizonDays: FUNDED_HORIZON_DAYS,
            groups: 2,
            maxEvalDays: 1,
            plan: instantFundedToyPlan(),
            rebuyLagDays: lag,
            riskPerTrade: RISK_PER_TRADE,
            rrRatio: RR_RATIO,
            seed: 1,
            tradesPerDay: 1,
            trials: 1,
            winrate: 1,
        });

        expect(single.expectedAttempts).toBe(1);
        const netSum = single.expectedNet * 2;
        const creditSum = single.expectedHorizonCredit * 2;
        const attemptsSum = single.expectedAttempts * 2;
        const slotDaysPerTrial =
            (FUNDED_HORIZON_DAYS * 2 + lag * attemptsSum) / 2;
        expect(withLag.expectedMonthlyNet).toBe(
            ((netSum + creditSum) * TRADING_DAYS_PER_MONTH) / slotDaysPerTrial,
        );
    });
});
