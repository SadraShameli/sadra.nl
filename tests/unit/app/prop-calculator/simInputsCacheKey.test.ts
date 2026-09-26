import { describe, expect, it } from 'vitest';

import { portfolioCacheKey } from '~/app/(app)/prop-calculator/_components/portfolioCacheKey';
import { simInputsCacheKey } from '~/app/(app)/prop-calculator/_components/simInputsCacheKey';
import { type PortfolioEntry } from '~/app/(app)/prop-calculator/_components/types';
import {
    type CashFlowSimulationArguments,
    cashFlowSimulationCacheKey,
} from '~/app/(app)/prop-calculator/_components/useCashFlowSimulation';
import {
    AlphaFuturesVariant,
    type CouponDiscounts,
    DayStopRuleKind,
    FirmId,
    fraction,
    type FundedCycleSeed,
    InstrumentSymbol,
    NO_PLAN_OPT_INS,
    PayoutRequestPolicy,
    percent,
    type Plan,
    type PlanOptIns,
    PolicySizing,
    RungSizing,
    SIM_DEFAULTS,
    type SimInputs,
    type SimStart,
    TradingPhase,
    withPlanOptIns,
} from '~/lib/prop-calculator';
import { ALL_FIRMS, findFirm } from '~/lib/prop-calculator/firms';

function alphaPlan(variant: AlphaFuturesVariant): Plan {
    const plan = findFirm(FirmId.AlphaFutures)?.findPlan({
        accountSize: 50_000,
        firm: FirmId.AlphaFutures,
        variant,
    });
    if (!plan) throw new Error(`Alpha Futures ${variant} 50K plan not found`);
    return plan;
}

const base: Required<SimInputs> = {
    commissionPerRoundTrip: 4,
    copyAccounts: 2,
    dayStop: { kind: DayStopRuleKind.DayGreen },
    discounts: { activationPercent: percent(0), evalPercent: percent(0) },
    evalDayPolicy: {
        ladder: [100],
        maxLossesPerDay: null,
        sizing: PolicySizing.ContractCapped,
        stopRule: { kind: DayStopRuleKind.None },
    },
    fundedCushionPercent: fraction(0.5),
    fundedDayPolicy: {
        ladder: [100],
        maxLossesPerDay: null,
        sizing: PolicySizing.ContractCapped,
        stopRule: { kind: DayStopRuleKind.None },
    },
    fundedHorizonDays: 60,
    fundedRiskPerTrade: 100,
    fundedRrRatio: 2,
    fundedTradesPerDay: 1,
    idleDayProbability: 0.1,
    instrument: InstrumentSymbol.MNQ,
    intradayPathStepsPerR: 4,
    maxAttempts: 3,
    maxEvalDays: 60,
    minRetainedCushion: 500,
    payoutRequestPolicy: PayoutRequestPolicy.UpToRequest,
    payoutRequestSize: 1000,
    plan: alphaPlan(AlphaFuturesVariant.Zero),
    rebuyLagDays: 1,
    riskPerTrade: 100,
    rrRatio: 2,
    rungSizing: RungSizing.CapToCushion,
    seed: 1,
    stopPoints: 20,
    tradesPerDay: 1,
    trials: 10,
    winrate: 0.5,
};

const changed: Required<SimInputs> = {
    commissionPerRoundTrip: 5,
    copyAccounts: 3,
    dayStop: { kind: DayStopRuleKind.FirstWin },
    discounts: { activationPercent: percent(0), evalPercent: percent(40) },
    evalDayPolicy: {
        ladder: [200],
        maxLossesPerDay: null,
        sizing: PolicySizing.ContractCapped,
        stopRule: { kind: DayStopRuleKind.None },
    },
    fundedCushionPercent: fraction(0.6),
    fundedDayPolicy: {
        ladder: [200],
        maxLossesPerDay: null,
        sizing: PolicySizing.ContractCapped,
        stopRule: { kind: DayStopRuleKind.None },
    },
    fundedHorizonDays: 90,
    fundedRiskPerTrade: 150,
    fundedRrRatio: 3,
    fundedTradesPerDay: 2,
    idleDayProbability: 0.2,
    instrument: InstrumentSymbol.NQ,
    intradayPathStepsPerR: 8,
    maxAttempts: 4,
    maxEvalDays: 90,
    minRetainedCushion: 750,
    payoutRequestPolicy: PayoutRequestPolicy.FullRequestOnly,
    payoutRequestSize: 2000,
    plan: alphaPlan(AlphaFuturesVariant.Standard),
    rebuyLagDays: 2,
    riskPerTrade: 150,
    rrRatio: 3,
    rungSizing: RungSizing.SkipIfUnaffordable,
    seed: 2,
    stopPoints: 30,
    tradesPerDay: 2,
    trials: 20,
    winrate: 0.6,
};

function withChanged(field: keyof SimInputs): SimInputs {
    return { ...base, [field]: changed[field] };
}

describe('simInputsCacheKey covers every simulation input', () => {
    it.each(Object.keys(changed) as (keyof SimInputs)[])(
        'changes the key when %s changes, so a panel never shows a stale result',
        (field) => {
            expect(simInputsCacheKey(withChanged(field))).not.toBe(
                simInputsCacheKey(base),
            );
        },
    );

    it('keys an omitted defaulted input the same as its explicit SIM_DEFAULTS value', () => {
        const minimal: SimInputs = {
            fundedHorizonDays: 60,
            maxEvalDays: 60,
            plan: alphaPlan(AlphaFuturesVariant.Zero),
            riskPerTrade: 100,
            rrRatio: 2,
            seed: 1,
            tradesPerDay: 1,
            trials: 10,
            winrate: 0.5,
        };
        expect(simInputsCacheKey({ ...minimal, ...SIM_DEFAULTS })).toBe(
            simInputsCacheKey(minimal),
        );
    });
});

const baseDiscounts: Required<CouponDiscounts> = {
    activationPercent: percent(0),
    bundlePercent: percent(0),
    evalPercent: percent(0),
    monthlySubscriptionPercent: percent(0),
    resetPercent: percent(0),
};

const changedDiscounts: Required<CouponDiscounts> = {
    activationPercent: percent(10),
    bundlePercent: percent(20),
    evalPercent: percent(30),
    monthlySubscriptionPercent: percent(40),
    resetPercent: percent(50),
};

function withChangedDiscount(field: keyof CouponDiscounts): CouponDiscounts {
    return { ...baseDiscounts, [field]: changedDiscounts[field] };
}

const DISCOUNT_FIELDS = Object.keys(
    changedDiscounts,
) as (keyof CouponDiscounts)[];

function planOffering(optIn: keyof PlanOptIns): Plan {
    const optedIn = { ...NO_PLAN_OPT_INS, [optIn]: true };
    for (const firm of ALL_FIRMS) {
        for (const plan of firm.plans) {
            if (withPlanOptIns(plan, optedIn) !== plan) return plan;
        }
    }
    throw new Error(`no registered plan offers the ${optIn} opt-in`);
}

const OPT_IN_FIELDS = Object.keys(NO_PLAN_OPT_INS) as (keyof PlanOptIns)[];

function withOptIn(plan: Plan, optIn: keyof PlanOptIns): Plan {
    return withPlanOptIns(plan, { ...NO_PLAN_OPT_INS, [optIn]: true });
}

describe('simInputsCacheKey covers every nested simulation input (WP23)', () => {
    it.each(DISCOUNT_FIELDS)(
        'changes the key when discounts.%s changes',
        (field) => {
            expect(
                simInputsCacheKey({
                    ...base,
                    discounts: withChangedDiscount(field),
                }),
            ).not.toBe(
                simInputsCacheKey({ ...base, discounts: baseDiscounts }),
            );
        },
    );

    it.each(OPT_IN_FIELDS)(
        'changes the key when the plan opt-in %s is taken',
        (optIn) => {
            const plan = planOffering(optIn);
            expect(
                simInputsCacheKey({ ...base, plan: withOptIn(plan, optIn) }),
            ).not.toBe(simInputsCacheKey({ ...base, plan }));
        },
    );
});

const PORTFOLIO_OVERRIDDEN_FIELDS = new Set<keyof SimInputs>([
    'copyAccounts',
    'discounts',
    'plan',
]);

const baseEntry: PortfolioEntry = {
    activationDiscountPercent: 0,
    count: 1,
    evalDiscountPercent: 0,
    firmId: FirmId.AlphaFutures,
    id: 'entry-1',
    instrument: null,
    linkActivationDiscount: false,
    monthlySubscriptionDiscountPercent: 0,
    planId: alphaPlan(AlphaFuturesVariant.Zero).id,
    resetDiscountPercent: 0,
    stopPoints: null,
};

const changedEntry: Omit<PortfolioEntry, 'id'> = {
    activationDiscountPercent: 10,
    count: 2,
    evalDiscountPercent: 20,
    firmId: FirmId.Apex,
    instrument: InstrumentSymbol.NQ,
    linkActivationDiscount: true,
    monthlySubscriptionDiscountPercent: 30,
    planId: alphaPlan(AlphaFuturesVariant.Standard).id,
    resetDiscountPercent: 40,
    stopPoints: 25,
};

describe('portfolio panel cache key (WP23: built on simInputsCacheKey)', () => {
    const baseKey = portfolioCacheKey(base, [baseEntry], NO_PLAN_OPT_INS);

    it.each(
        (Object.keys(changed) as (keyof SimInputs)[]).filter(
            (field) => !PORTFOLIO_OVERRIDDEN_FIELDS.has(field),
        ),
    )(
        'changes the key when the shared input %s changes, so the portfolio table never shows a stale result',
        (field) => {
            expect(
                portfolioCacheKey(
                    { ...base, [field]: changed[field] },
                    [baseEntry],
                    NO_PLAN_OPT_INS,
                ),
            ).not.toBe(baseKey);
        },
    );

    it.each(Object.keys(changedEntry) as (keyof typeof changedEntry)[])(
        'changes the key when the portfolio entry field %s changes',
        (field) => {
            expect(
                portfolioCacheKey(
                    base,
                    [{ ...baseEntry, [field]: changedEntry[field] }],
                    NO_PLAN_OPT_INS,
                ),
            ).not.toBe(baseKey);
        },
    );

    it.each(OPT_IN_FIELDS)(
        'changes the key when the %s opt-in changes',
        (optIn) => {
            expect(
                portfolioCacheKey(base, [baseEntry], {
                    ...NO_PLAN_OPT_INS,
                    [optIn]: true,
                }),
            ).not.toBe(baseKey);
        },
    );

    it('changes the key when two portfolios with equal contents have different entry ids, since results are joined by entry id', () => {
        expect(
            portfolioCacheKey(
                base,
                [{ ...baseEntry, id: 'entry-2' }],
                NO_PLAN_OPT_INS,
            ),
        ).not.toBe(baseKey);
    });

    it('keeps the key when only the per-entry overrides of the shared inputs change', () => {
        expect(
            portfolioCacheKey(
                {
                    ...base,
                    copyAccounts: changed.copyAccounts,
                    discounts: changed.discounts,
                },
                [baseEntry],
                NO_PLAN_OPT_INS,
            ),
        ).toBe(baseKey);
    });
});

const cashFlowBase: Required<CashFlowSimulationArguments> = {
    accounts: 2,
    commissionPerRoundTrip: 4,
    dayBudget: 250,
    dayStop: { kind: DayStopRuleKind.DayGreen },
    discounts: baseDiscounts,
    evalDayPolicy: {
        ladder: [100],
        maxLossesPerDay: null,
        sizing: PolicySizing.ContractCapped,
        stopRule: { kind: DayStopRuleKind.None },
    },
    instrument: InstrumentSymbol.MNQ,
    maxEvalDays: 60,
    minRetainedCushion: 500,
    payoutRequestSize: 1000,
    plan: alphaPlan(AlphaFuturesVariant.Zero),
    riskPerTrade: 100,
    rrRatio: 2,
    rungSizing: RungSizing.CapToCushion,
    seed: 1,
    stopPoints: 10,
    tradesPerDay: 1,
    trials: 10,
    winrate: 0.5,
};

const cashFlowChanged: Required<CashFlowSimulationArguments> = {
    accounts: 3,
    commissionPerRoundTrip: 5,
    dayBudget: 500,
    dayStop: { kind: DayStopRuleKind.FirstWin },
    discounts: changedDiscounts,
    evalDayPolicy: {
        ladder: [200],
        maxLossesPerDay: null,
        sizing: PolicySizing.ContractCapped,
        stopRule: { kind: DayStopRuleKind.None },
    },
    instrument: InstrumentSymbol.NQ,
    maxEvalDays: 90,
    minRetainedCushion: 750,
    payoutRequestSize: 2000,
    plan: alphaPlan(AlphaFuturesVariant.Standard),
    riskPerTrade: 150,
    rrRatio: 3,
    rungSizing: RungSizing.SkipIfUnaffordable,
    seed: 2,
    stopPoints: 20,
    tradesPerDay: 2,
    trials: 20,
    winrate: 0.6,
};

describe('cash flow simulation cache key (WP23: built on simInputsCacheKey)', () => {
    const baseKey = cashFlowSimulationCacheKey(cashFlowBase);

    it.each(
        Object.keys(cashFlowChanged) as (keyof CashFlowSimulationArguments)[],
    )(
        'changes the key when %s changes, so the cash flow chart never shows a stale result',
        (field) => {
            expect(
                cashFlowSimulationCacheKey({
                    ...cashFlowBase,
                    [field]: cashFlowChanged[field],
                }),
            ).not.toBe(baseKey);
        },
    );

    it.each(DISCOUNT_FIELDS)(
        'changes the key when discounts.%s changes',
        (field) => {
            expect(
                cashFlowSimulationCacheKey({
                    ...cashFlowBase,
                    discounts: withChangedDiscount(field),
                }),
            ).not.toBe(baseKey);
        },
    );

    it.each(OPT_IN_FIELDS)(
        'changes the key when the plan opt-in %s is taken',
        (optIn) => {
            const plan = planOffering(optIn);
            expect(
                cashFlowSimulationCacheKey({
                    ...cashFlowBase,
                    plan: withOptIn(plan, optIn),
                }),
            ).not.toBe(cashFlowSimulationCacheKey({ ...cashFlowBase, plan }));
        },
    );

    it('keys trades per day on the capped value the panel simulates', () => {
        expect(
            cashFlowSimulationCacheKey({ ...cashFlowBase, tradesPerDay: 11 }),
        ).toBe(
            cashFlowSimulationCacheKey({ ...cashFlowBase, tradesPerDay: 12 }),
        );
    });
});

function fundedCycleSeed(overrides: Partial<FundedCycleSeed> = {}): FundedCycleSeed {
    return {
        calendarDayGateProgress: 0,
        cumulativePayout: 0,
        cycleBestDayProfit: 0,
        fundedResetsUsed: 0,
        lastPayoutBalance: base.plan.accountSize,
        payoutsIssued: 0,
        qualifyingDaysAtLastPayout: 0,
        ...overrides,
    };
}

describe('simInputsCacheKey covers the from-state start (PT-14b)', () => {
    const evalStart: SimStart = {
        phase: TradingPhase.Eval,
        state: base.plan.initialState(),
    };
    const fundedStart: SimStart = {
        phase: TradingPhase.Funded,
        seed: fundedCycleSeed(),
        state: base.plan.initialState(),
    };

    it('keys the same inputs the same with no start', () => {
        expect(simInputsCacheKey(base)).toBe(simInputsCacheKey(base));
    });

    it('changes the key when start goes from omitted to an eval start', () => {
        expect(simInputsCacheKey({ ...base, start: evalStart })).not.toBe(
            simInputsCacheKey(base),
        );
    });

    it('changes the key between an eval start and a funded start', () => {
        expect(simInputsCacheKey({ ...base, start: evalStart })).not.toBe(
            simInputsCacheKey({ ...base, start: fundedStart }),
        );
    });

    it('changes the key when a field on the eval start state changes', () => {
        const changedState: SimStart = {
            phase: TradingPhase.Eval,
            state: { ...evalStart.state, elapsedDays: 3, tradingDays: 3 },
        };
        expect(simInputsCacheKey({ ...base, start: evalStart })).not.toBe(
            simInputsCacheKey({ ...base, start: changedState }),
        );
    });

    it('changes the key when a field on the funded start seed changes', () => {
        const changedSeed: SimStart = {
            phase: TradingPhase.Funded,
            seed: fundedCycleSeed({ payoutsIssued: 2 }),
            state: fundedStart.state,
        };
        expect(simInputsCacheKey({ ...base, start: fundedStart })).not.toBe(
            simInputsCacheKey({ ...base, start: changedSeed }),
        );
    });
});
