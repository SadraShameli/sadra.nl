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
    PayoutFloorEffect,
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

const FLEX_SIZES = [
    {
        accountSize: dollars(50_000),
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
        evalCost: 127,
        maxDrawdown: dollars(2000),
        minPayoutProfit: dollars(500),
        minQualifyingDayProfit: dollars(150),
        payoutCap: dollars(2000),
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

type MffuFlexSize = (typeof FLEX_SIZES)[number];
type MffuProSize = (typeof PRO_SIZES)[number];
type MffuRapidSize = (typeof RAPID_SIZES)[number];

export class MyFundedFutures extends TradingFirm {
    readonly displayName = 'My Funded Futures';
    readonly id = FirmId.Mffu;
    readonly plans = [
        ...RAPID_SIZES.map((s) => this.buildPlan(buildRapidPlan(s))),
        this.buildPlan(buildRapidEodPlan()),
        ...FLEX_SIZES.map((s) => this.buildPlan(buildFlexPlan(s))),
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
        maxFundedAccounts: 1,
        minDaysAfterPassForPayout: 2,
        minPayoutProfit: dollars(2600),
        minPayoutProfitPerCycle: dollars(500),
        minTradingDays: 1,
        payoutLadder: {
            minRequestAmount: 500,
            steps: [2000, 2000, 2000, 2000, 2000],
        },
        payoutTiers: [
            { thresholdProfit: dollars(0), traderShare: fraction(0.8) },
        ],
        profitTarget: dollars(3000),
    };
}

function buildFlexPlan(size: MffuFlexSize): PlanInit {
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
            variant: MffuVariant.Flex,
        },
        label: planLabel(size.accountSize, 'Flex'),
        maxFundedAccounts: 3,
        minDaysAfterPassForPayout: 5,
        minPayoutProfit: size.minPayoutProfit,
        minPayoutProfitPerCycle: dollars(500),
        minQualifyingDayProfit: size.minQualifyingDayProfit,
        minTradingDays: 2,
        payoutFloorEffect: PayoutFloorEffect.LockAtPlanFloor,
        payoutLadder: {
            minRequestAmount: size.minPayoutProfit,
            steps: [
                size.payoutCap,
                size.payoutCap,
                size.payoutCap,
                size.payoutCap,
                size.payoutCap,
            ],
        },
        payoutProfitShare: fraction(0.5),
        payoutTiers: [
            { thresholdProfit: dollars(0), traderShare: fraction(0.8) },
        ],
        profitTarget: size.profitTarget,
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
