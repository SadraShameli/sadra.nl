import {
    ApexVariant,
    ConsistencyRule,
    ConsistencyScope,
    ContractLimitKind,
    contracts,
    type DailyLossLimitConfig,
    DailyLossLimitKind,
    dollars,
    EodTrailingDrawdown,
    FirmId,
    fraction,
    IntradayTrailingDrawdown,
    PayoutBuffer,
    type PlanInit,
    TradingFirm,
} from '~/lib/prop-calculator/core';

import { lockThresholdAt, planLabel } from '../shared';

const LOCK_OFFSET = 100;

const SIZES = [
    {
        accountSize: dollars(50_000),
        contractLimits: {
            evalMicros: contracts(60),
            evalMinis: contracts(6),
            fundedMicros: {
                kind: ContractLimitKind.Flat,
                maxContracts: contracts(40),
            },
            fundedMinis: {
                kind: ContractLimitKind.Flat,
                maxContracts: contracts(4),
            },
        },
        eod: {
            activation: 139,
            evalCost: 550,
            minQualifyingDayProfit: dollars(250),
            payoutLadderSteps: [1500, 1500, 2000, 2500, 2500, 3000],
        },
        evalDailyLossLimit: dollars(1000),
        fundedDllTiers: [
            {
                dailyLossLimit: dollars(1000),
                maxContracts: contracts(2),
                minProfit: dollars(0),
            },
            {
                dailyLossLimit: dollars(1000),
                maxContracts: contracts(3),
                minProfit: dollars(1500),
            },
            {
                dailyLossLimit: dollars(2000),
                maxContracts: contracts(4),
                minProfit: dollars(3000),
            },
            {
                dailyLossLimit: dollars(3000),
                maxContracts: contracts(4),
                minProfit: dollars(6000),
            },
        ],
        intraday: {
            activation: 59,
            evalCost: 249,
            minQualifyingDayProfit: dollars(200),
            payoutLadderSteps: [1500, 2000, 2500, 2500, 3000, 3000],
        },
        maxDrawdown: dollars(2000),
        profitTarget: dollars(3000),
    },
] as const;

const MIN_REQUEST_AMOUNT = 500;
const MAX_LIFETIME_PAYOUTS = 6;
const EVAL_ACCESS_CALENDAR_DAYS = 30;
const TRADING_DAYS_PER_CALENDAR_WEEK = 5;
const MAX_EVAL_TRADING_DAYS = Math.round(
    (EVAL_ACCESS_CALENDAR_DAYS * TRADING_DAYS_PER_CALENDAR_WEEK) / 7,
);

type ApexSize = (typeof SIZES)[number];

export class ApexTraderFunding extends TradingFirm {
    readonly displayName = 'Apex Trader Funding';
    readonly id = FirmId.Apex;
    readonly notes = [
        "minPayoutRequest is set explicitly to match this plan's own payoutLadder.minRequestAmount ($500). Left unset, it would silently inherit minPayoutProfit's unrelated $2,600 buffer-zone value instead, which the CLI displays as the minimum request even though the ladder already governs the actual withdrawal floor at runtime, the same fallback-chain bug shape confirmed and fixed for Take Profit Trader.",
    ];
    readonly plans = SIZES.flatMap((s) => [
        this.buildPlan(buildEodPlan(s)),
        this.buildPlan(buildIntradayPlan(s)),
    ]);
    readonly website = 'https://apextraderfunding.com';
}

const MAX_FUNDED_ACCOUNTS = 20;

function buildEodPlan(size: ApexSize): PlanInit {
    const pricing = size.eod;
    return {
        accountSize: size.accountSize,
        consistency: new ConsistencyRule(
            ConsistencyScope.Funded,
            fraction(0.5),
        ),
        contractLimits: size.contractLimits,
        drawdown: new EodTrailingDrawdown({ amount: size.maxDrawdown }),
        evalDailyLossLimit: {
            amount: size.evalDailyLossLimit,
            kind: DailyLossLimitKind.Flat,
        },
        fees: {
            activation: dollars(pricing.activation),
            monthlySubscription: dollars(0),
            oneTimeEval: dollars(pricing.evalCost),
            reset: dollars(pricing.evalCost),
        },
        fundedDailyLossLimit: fundedDailyLossLimitOf(size),
        fundedDrawdown: new EodTrailingDrawdown({
            amount: size.maxDrawdown,
            lock: lockOf(size),
        }),
        id: {
            accountSize: 50_000,
            firm: FirmId.Apex,
            variant: ApexVariant.Eod,
        },
        label: planLabel(size.accountSize, 'EOD trailing'),
        maxEvalTradingDays: MAX_EVAL_TRADING_DAYS,
        maxFundedAccounts: MAX_FUNDED_ACCOUNTS,
        maxLifetimePayouts: MAX_LIFETIME_PAYOUTS,
        minDaysAfterPassForPayout: 5,
        minPayoutProfit: dollars(size.maxDrawdown + 600),
        minPayoutRequest: dollars(MIN_REQUEST_AMOUNT),
        minQualifyingDayProfit: pricing.minQualifyingDayProfit,
        minTradingDays: 0,
        payoutBuffer: new PayoutBuffer(dollars(LOCK_OFFSET)),
        payoutLadder: {
            deniesIfUnaffordable: true,
            minRequestAmount: dollars(MIN_REQUEST_AMOUNT),
            steps: pricing.payoutLadderSteps,
        },
        payoutTiers: [
            { thresholdProfit: dollars(0), traderShare: fraction(1) },
        ],
        profitTarget: size.profitTarget,
    };
}

function buildIntradayPlan(size: ApexSize): PlanInit {
    const pricing = size.intraday;
    return {
        accountSize: size.accountSize,
        consistency: new ConsistencyRule(
            ConsistencyScope.Funded,
            fraction(0.5),
        ),
        contractLimits: size.contractLimits,
        drawdown: new IntradayTrailingDrawdown({ amount: size.maxDrawdown }),
        evalDailyLossLimit: { kind: DailyLossLimitKind.None },
        fees: {
            activation: dollars(pricing.activation),
            monthlySubscription: dollars(0),
            oneTimeEval: dollars(pricing.evalCost),
            reset: dollars(pricing.evalCost),
        },
        fundedDailyLossLimit: fundedDailyLossLimitOf(size),
        fundedDrawdown: new IntradayTrailingDrawdown({
            amount: size.maxDrawdown,
            lock: lockOf(size),
        }),
        id: {
            accountSize: 50_000,
            firm: FirmId.Apex,
            variant: ApexVariant.Intraday,
        },
        label: planLabel(size.accountSize, 'Intraday trailing'),
        maxEvalTradingDays: MAX_EVAL_TRADING_DAYS,
        maxFundedAccounts: MAX_FUNDED_ACCOUNTS,
        maxLifetimePayouts: MAX_LIFETIME_PAYOUTS,
        minDaysAfterPassForPayout: 5,
        minPayoutProfit: dollars(size.maxDrawdown + 600),
        minPayoutRequest: dollars(MIN_REQUEST_AMOUNT),
        minQualifyingDayProfit: pricing.minQualifyingDayProfit,
        minTradingDays: 0,
        payoutBuffer: new PayoutBuffer(dollars(LOCK_OFFSET)),
        payoutLadder: {
            deniesIfUnaffordable: true,
            minRequestAmount: dollars(MIN_REQUEST_AMOUNT),
            steps: pricing.payoutLadderSteps,
        },
        payoutTiers: [
            { thresholdProfit: dollars(0), traderShare: fraction(1) },
        ],
        profitTarget: size.profitTarget,
    };
}

function fundedDailyLossLimitOf(size: ApexSize): DailyLossLimitConfig {
    return { kind: DailyLossLimitKind.Tiered, tiers: size.fundedDllTiers };
}

function lockOf(size: ApexSize) {
    return {
        atProfit: dollars(size.maxDrawdown + LOCK_OFFSET),
        lockedThreshold: lockThresholdAt(LOCK_OFFSET),
    };
}
