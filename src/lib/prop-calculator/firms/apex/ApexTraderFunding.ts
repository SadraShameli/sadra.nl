import {
    ConsistencyRule,
    type DailyLossLimitConfig,
    EodTrailingDrawdown,
    FirmId,
    IntradayTrailingDrawdown,
    Plan,
    type PlanInit,
    TradingFirm,
} from '~/lib/prop-calculator/core';

class ApexPlan extends Plan {}

const SIZES = [
    {
        accountSize: 25_000,
        eod: {
            activation: 99,
            evalCost: 390,
            minQualifyingDayProfit: 100,
            payoutLadderSteps: [1000, 1000, 1000, 1000, 1000, 1000],
        },
        evalDailyLossLimit: 500,
        fundedDllTiers: [
            { dailyLossLimit: 500, maxContracts: 4, minProfit: 0 },
            { dailyLossLimit: 500, maxContracts: 4, minProfit: 1000 },
            { dailyLossLimit: 1250, maxContracts: 4, minProfit: 2000 },
        ],
        intraday: {
            activation: 69,
            evalCost: 199,
            minQualifyingDayProfit: 100,
            payoutLadderSteps: [1000, 1000, 1000, 1000, 1000, 1000],
        },
        maxDrawdown: 1000,
        profitTarget: 1500,
    },
    {
        accountSize: 50_000,
        eod: {
            activation: 129,
            evalCost: 490,
            minQualifyingDayProfit: 250,
            payoutLadderSteps: [1500, 1500, 2000, 2500, 2500, 3000],
        },
        evalDailyLossLimit: 1000,
        fundedDllTiers: [
            { dailyLossLimit: 1000, maxContracts: 6, minProfit: 0 },
            { dailyLossLimit: 1000, maxContracts: 6, minProfit: 1500 },
            { dailyLossLimit: 2000, maxContracts: 6, minProfit: 3000 },
            { dailyLossLimit: 3000, maxContracts: 6, minProfit: 6000 },
        ],
        intraday: {
            activation: 79,
            evalCost: 249,
            minQualifyingDayProfit: 200,
            payoutLadderSteps: [1500, 2000, 2500, 2500, 3000, 3000],
        },
        maxDrawdown: 2000,
        profitTarget: 3000,
    },
    {
        accountSize: 100_000,
        eod: {
            activation: 139,
            evalCost: 790,
            minQualifyingDayProfit: 300,
            payoutLadderSteps: [2000, 2500, 2500, 3000, 4000, 4000],
        },
        evalDailyLossLimit: 1500,
        fundedDllTiers: [
            { dailyLossLimit: 1750, maxContracts: 8, minProfit: 0 },
            { dailyLossLimit: 1750, maxContracts: 8, minProfit: 2000 },
            { dailyLossLimit: 1750, maxContracts: 8, minProfit: 3000 },
            { dailyLossLimit: 2500, maxContracts: 8, minProfit: 5000 },
            { dailyLossLimit: 3500, maxContracts: 8, minProfit: 10_000 },
        ],
        intraday: {
            activation: 99,
            evalCost: 399,
            minQualifyingDayProfit: 250,
            payoutLadderSteps: [2000, 2500, 3000, 3000, 4000, 4000],
        },
        maxDrawdown: 3000,
        profitTarget: 6000,
    },
    {
        accountSize: 150_000,
        eod: {
            activation: 159,
            evalCost: 1490,
            minQualifyingDayProfit: 350,
            payoutLadderSteps: [2500, 3000, 3000, 3000, 4000, 5000],
        },
        evalDailyLossLimit: 2000,
        fundedDllTiers: [
            { dailyLossLimit: 2500, maxContracts: 12, minProfit: 0 },
            { dailyLossLimit: 2500, maxContracts: 12, minProfit: 2000 },
            { dailyLossLimit: 2500, maxContracts: 12, minProfit: 3000 },
            { dailyLossLimit: 3000, maxContracts: 12, minProfit: 5000 },
            { dailyLossLimit: 4000, maxContracts: 12, minProfit: 10_000 },
        ],
        intraday: {
            activation: 129,
            evalCost: 599,
            minQualifyingDayProfit: 300,
            payoutLadderSteps: [2500, 3000, 3000, 4000, 4000, 5000],
        },
        maxDrawdown: 4000,
        profitTarget: 9000,
    },
] as const;

const MIN_REQUEST_AMOUNT = 500;

type ApexSize = (typeof SIZES)[number];

interface ApexVariantPricing {
    activation: number;
    evalCost: number;
    minQualifyingDayProfit: number;
    payoutLadderSteps: readonly number[];
}

export class ApexTraderFunding extends TradingFirm {
    readonly displayName = 'Apex Trader Funding';
    readonly id = FirmId.Apex;
    readonly plans = SIZES.flatMap((s) => [
        new ApexPlan(buildPlan(s, 'eod')),
        new ApexPlan(buildPlan(s, 'intraday')),
    ]) as readonly Plan[];
    readonly website = 'https://apextraderfunding.com';

    maxFundedAccounts(): number {
        // Flat 20 across every size and variant — Apex does not scale this
        // by account size, so the `plan` parameter is intentionally unused.
        return 20;
    }
}

function buildPlan(size: ApexSize, variant: 'eod' | 'intraday'): PlanInit {
    const isEod = variant === 'eod';
    const pricing: ApexVariantPricing = isEod ? size.eod : size.intraday;
    const drawdown = isEod
        ? new EodTrailingDrawdown({ amount: size.maxDrawdown })
        : new IntradayTrailingDrawdown({ amount: size.maxDrawdown });

    // Eval phase: EOD has a flat, non-scaling DLL; Intraday evals have no
    // DLL at all.
    const evalDailyLossLimit: DailyLossLimitConfig = isEod
        ? { amount: size.evalDailyLossLimit, kind: 'flat' }
        : { kind: 'none' };
    // Funded/PA phase: DLL is tier-scaled and identical for EOD and
    // Intraday — the current code's "Intraday = null DLL" bug is fixed by
    // giving both variants this same tiered config.
    const fundedDailyLossLimit: DailyLossLimitConfig = {
        kind: 'tiered',
        tiers: size.fundedDllTiers,
    };

    return {
        accountSize: size.accountSize,
        consistency: new ConsistencyRule('funded', 0.5),
        drawdown,
        evalDailyLossLimit,
        fees: {
            activation: pricing.activation,
            monthlySubscription: 0,
            oneTimeEval: pricing.evalCost,
            // "There are no reset fees. If an Evaluation fails, the only
            // way to continue is by purchasing a new one." — full eval
            // price, same variant, not a discounted flat retry fee.
            reset: pricing.evalCost,
        },
        fundedDailyLossLimit,
        id: { accountSize: size.accountSize, firm: FirmId.Apex, variant },
        label: `$${(size.accountSize / 1000).toFixed(0)}K — ${isEod ? 'EOD trailing' : 'Intraday trailing'}`,
        minDaysAfterPassForPayout: 5,
        // Safety net = start + maxDrawdown + $100 balance floor, plus the
        // $500 minimum payout-request amount = maxDrawdown + $600 profit
        // above start needed to request the first payout.
        minPayoutProfit: size.maxDrawdown + 600,
        minQualifyingDayProfit: pricing.minQualifyingDayProfit,
        minTradingDays: 0,
        payoutLadder: {
            minRequestAmount: MIN_REQUEST_AMOUNT,
            steps: pricing.payoutLadderSteps,
        },
        // Event-driven: gated by qualifying days + balance, no calendar
        // deadline.
        payoutSchedule: { kind: 'event-driven' },
        payoutTiers: [{ thresholdProfit: 0, traderShare: 1 }],
        profitTarget: size.profitTarget,
    };
}
