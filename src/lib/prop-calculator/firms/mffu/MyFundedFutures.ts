import {
    ConsistencyRule,
    ConsistencyScope,
    ContractLimitKind,
    contracts,
    DailyLossLimitKind,
    dollars,
    EodTrailingDrawdown,
    FirmId,
    fraction,
    IntradayTrailingDrawdown,
    MffuVariant,
    type PlanInit,
    TradingFirm,
} from '~/lib/prop-calculator/core';

import { lockThresholdAt, planLabel } from '../shared';

const LOCK_OFFSET = 100;

const RAPID_SIZES = [
    {
        accountSize: dollars(50_000),
        contractLimits: {
            evalMicros: contracts(50),
            evalMinis: contracts(5),
            fundedMicros: {
                kind: ContractLimitKind.Flat,
                maxContracts: contracts(50),
            },
            fundedMinis: {
                kind: ContractLimitKind.Flat,
                maxContracts: contracts(5),
            },
        },
        evalCost: 209,
        maxDrawdown: dollars(2000),
        minPayoutProfit: dollars(2100),
        profitTarget: dollars(3000),
    },
] as const;

const PRO_SIZES = [
    {
        accountSize: dollars(50_000),
        contractLimits: {
            evalMicros: contracts(30),
            evalMinis: contracts(3),
            fundedMicros: {
                kind: ContractLimitKind.Flat,
                maxContracts: contracts(5),
            },
            fundedMinis: {
                kind: ContractLimitKind.Flat,
                maxContracts: contracts(5),
            },
        },
        evalCost: 265,
        maxDrawdown: dollars(2000),
        minPayoutProfit: dollars(2100),
        profitTarget: dollars(3000),
    },
] as const;

type MffuProSize = (typeof PRO_SIZES)[number];
type MffuRapidSize = (typeof RAPID_SIZES)[number];

export class MyFundedFutures extends TradingFirm {
    readonly displayName = 'My Funded Futures';
    readonly id = FirmId.Mffu;
    readonly notes = [
        'Supports NinjaTrader, Tradovate, TradingView, Quantower, Volumetrica, DeepChart/DeepDom, and ATAS across all plans.',
        'Rapid EOD and Builder evaluation and funded accounts close after 7 consecutive calendar days without a single trade. Plain Rapid has no such rule; Pro is subject to some inactivity rule but the exact day count is unconfirmed. This simulator models the closure when you set an idle-day probability above 0. The Flex plan was discontinued and is no longer modeled.',
        "Builder's minPayoutRequest is set explicitly to match its own payoutLadder.minRequestAmount ($500). Left unset, it would silently inherit minPayoutProfit's unrelated $2,600 buffer-zone value instead, the same fallback-chain bug shape confirmed and fixed for Take Profit Trader.",
    ];
    readonly plans = [
        ...RAPID_SIZES.map((s) => this.buildPlan(buildRapidPlan(s))),
        this.buildPlan(buildRapidEodPlan()),
        ...PRO_SIZES.map((s) => this.buildPlan(buildProPlan(s))),
        this.buildPlan(buildBuilderPlan()),
    ];
    readonly website = 'https://myfundedfutures.com';
}

function buildBuilderPlan(): PlanInit {
    return {
        accountSize: dollars(50_000),
        consistency: new ConsistencyRule(
            ConsistencyScope.Funded,
            fraction(0.5),
        ),
        contractLimits: {
            evalMicros: contracts(40),
            evalMinis: contracts(4),
            fundedMicros: {
                kind: ContractLimitKind.Flat,
                maxContracts: contracts(40),
            },
            fundedMinis: {
                kind: ContractLimitKind.Flat,
                maxContracts: contracts(4),
            },
        },
        drawdown: new EodTrailingDrawdown({
            amount: dollars(2000),
            lock: {
                atProfit: dollars(2100),
                lockedThreshold: lockThresholdAt(LOCK_OFFSET),
            },
        }),
        evalDailyLossLimit: {
            amount: dollars(1000),
            kind: DailyLossLimitKind.Flat,
        },
        fees: {
            activation: dollars(0),
            monthlySubscription: dollars(0),
            oneTimeEval: dollars(153),
            reset: dollars(0),
        },
        id: {
            accountSize: 50_000,
            firm: FirmId.Mffu,
            variant: MffuVariant.Builder,
        },
        label: planLabel(50_000, 'Builder'),
        maxConsecutiveIdleDays: 7,
        maxFundedAccounts: 1,
        maxLifetimePayouts: 5,
        minDaysAfterPassForPayout: 2,
        minPayoutProfit: dollars(2600),
        minPayoutProfitPerCycle: dollars(500),
        minPayoutRequest: dollars(500),
        minTradingDays: 1,
        payoutLadder: {
            minRequestAmount: dollars(500),
            steps: [2000, 2000, 2000, 2000, 2000],
        },
        payoutTiers: [
            { thresholdProfit: dollars(0), traderShare: fraction(0.8) },
        ],
        profitTarget: dollars(3000),
    };
}

function buildProPlan(size: MffuProSize): PlanInit {
    return {
        accountSize: size.accountSize,
        consistency: new ConsistencyRule(ConsistencyScope.Eval, fraction(0.5)),
        contractLimits: size.contractLimits,
        drawdown: new EodTrailingDrawdown({
            amount: size.maxDrawdown,
            lock: {
                atProfit: dollars(size.maxDrawdown + LOCK_OFFSET),
                lockedThreshold: lockThresholdAt(LOCK_OFFSET),
            },
        }),
        evalDailyLossLimit: { kind: DailyLossLimitKind.None },
        fees: {
            activation: dollars(0),
            monthlySubscription: dollars(0),
            oneTimeEval: dollars(size.evalCost),
            reset: dollars(size.evalCost),
        },
        id: {
            accountSize: 50_000,
            firm: FirmId.Mffu,
            variant: MffuVariant.Pro,
        },
        label: planLabel(size.accountSize, 'Pro'),
        maxFundedAccounts: 5,
        minDaysAfterPassForPayout: 10,
        minPayoutProfit: size.minPayoutProfit,
        minPayoutRequest: dollars(1000),
        minTradingDays: 2,
        payoutTiers: [
            { thresholdProfit: dollars(0), traderShare: fraction(0.8) },
        ],
        profitTarget: size.profitTarget,
    };
}

function buildRapidEodPlan(): PlanInit {
    const maxDrawdown = dollars(2000);
    return {
        accountSize: dollars(50_000),
        consistency: new ConsistencyRule(ConsistencyScope.Eval, fraction(0.3)),
        contractLimits: {
            evalMicros: contracts(30),
            evalMinis: contracts(3),
            fundedMicros: {
                kind: ContractLimitKind.Flat,
                maxContracts: contracts(30),
            },
            fundedMinis: {
                kind: ContractLimitKind.Flat,
                maxContracts: contracts(3),
            },
        },
        drawdown: new EodTrailingDrawdown({
            amount: maxDrawdown,
            lock: {
                atProfit: dollars(maxDrawdown + LOCK_OFFSET),
                lockedThreshold: lockThresholdAt(LOCK_OFFSET),
            },
        }),
        evalDailyLossLimit: { kind: DailyLossLimitKind.None },
        fees: {
            activation: dollars(0),
            monthlySubscription: dollars(0),
            oneTimeEval: dollars(209),
            reset: dollars(209),
        },
        id: {
            accountSize: 50_000,
            firm: FirmId.Mffu,
            variant: MffuVariant.RapidEod,
        },
        label: planLabel(50_000, 'Rapid EOD'),
        maxConsecutiveIdleDays: 7,
        maxFundedAccounts: 3,
        minDaysAfterPassForPayout: 1,
        minPayoutProfit: dollars(maxDrawdown + 100),
        minPayoutProfitPerCycle: dollars(500),
        minPayoutRequest: dollars(500),
        minTradingDays: 4,
        payoutTiers: [
            { thresholdProfit: dollars(0), traderShare: fraction(0.9) },
        ],
        profitTarget: dollars(3000),
    };
}

function buildRapidPlan(size: MffuRapidSize): PlanInit {
    return {
        accountSize: size.accountSize,
        consistency: new ConsistencyRule(ConsistencyScope.Eval, fraction(0.5)),
        contractLimits: size.contractLimits,
        drawdown: new EodTrailingDrawdown({
            amount: size.maxDrawdown,
            lock: {
                atProfit: dollars(size.maxDrawdown + LOCK_OFFSET),
                lockedThreshold: lockThresholdAt(LOCK_OFFSET),
            },
        }),
        evalDailyLossLimit: { kind: DailyLossLimitKind.None },
        fees: {
            activation: dollars(0),
            monthlySubscription: dollars(0),
            oneTimeEval: dollars(size.evalCost),
            reset: dollars(size.evalCost),
        },
        fundedDrawdown: new IntradayTrailingDrawdown({
            amount: size.maxDrawdown,
            lock: {
                atProfit: dollars(size.maxDrawdown + LOCK_OFFSET),
                lockedThreshold: lockThresholdAt(LOCK_OFFSET),
            },
        }),
        id: {
            accountSize: 50_000,
            firm: FirmId.Mffu,
            variant: MffuVariant.Rapid,
        },
        label: planLabel(size.accountSize, 'Rapid'),
        maxFundedAccounts: 5,
        minDaysAfterPassForPayout: 1,
        minPayoutProfit: size.minPayoutProfit,
        minPayoutRequest: dollars(500),
        minTradingDays: 2,
        payoutTiers: [
            { thresholdProfit: dollars(0), traderShare: fraction(0.9) },
        ],
        profitTarget: size.profitTarget,
    };
}
