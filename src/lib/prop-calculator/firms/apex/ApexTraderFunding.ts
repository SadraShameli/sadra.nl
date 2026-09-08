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
        accountSize: 50_000,
        contractLimits: {
            evalMicros: 60,
            evalMinis: 6,
            fundedMicros: 60,
            fundedMinis: 6,
        },
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
        return 20;
    }
}

function buildPlan(size: ApexSize, variant: 'eod' | 'intraday'): PlanInit {
    const isEod = variant === 'eod';
    const pricing: ApexVariantPricing = isEod ? size.eod : size.intraday;
    const lock = {
        atProfit: size.maxDrawdown + 100,
        lockedThreshold: (start: number) => start + 100,
    };
    const drawdown = isEod
        ? new EodTrailingDrawdown({ amount: size.maxDrawdown, lock })
        : new IntradayTrailingDrawdown({ amount: size.maxDrawdown, lock });

    const evalDailyLossLimit: DailyLossLimitConfig = isEod
        ? { amount: size.evalDailyLossLimit, kind: 'flat' }
        : { kind: 'none' };
    const fundedDailyLossLimit: DailyLossLimitConfig = {
        kind: 'tiered',
        tiers: size.fundedDllTiers,
    };

    return {
        accountSize: size.accountSize,
        consistency: new ConsistencyRule('funded', 0.5),
        contractLimits: size.contractLimits,
        drawdown,
        evalDailyLossLimit,
        fees: {
            activation: pricing.activation,
            monthlySubscription: 0,
            oneTimeEval: pricing.evalCost,
            reset: pricing.evalCost,
        },
        fundedDailyLossLimit,
        id: { accountSize: size.accountSize, firm: FirmId.Apex, variant },
        label: `$${(size.accountSize / 1000).toFixed(0)}K — ${isEod ? 'EOD trailing' : 'Intraday trailing'}`,
        minDaysAfterPassForPayout: 5,
        minPayoutProfit: size.maxDrawdown + 600,
        minQualifyingDayProfit: pricing.minQualifyingDayProfit,
        minTradingDays: 0,
        payoutLadder: {
            minRequestAmount: MIN_REQUEST_AMOUNT,
            steps: pricing.payoutLadderSteps,
        },
        payoutSchedule: { kind: 'event-driven' },
        payoutTiers: [{ thresholdProfit: 0, traderShare: 1 }],
        profitTarget: size.profitTarget,
    };
}
