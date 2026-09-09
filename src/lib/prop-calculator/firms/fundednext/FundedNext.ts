import {
    ConsistencyRule,
    ConsistencyScope,
    DailyLossLimitKind,
    dollars,
    EodTrailingDrawdown,
    FirmId,
    fraction,
    FundedNextVariant,
    Plan,
    type PlanInit,
    TradingFirm,
} from '~/lib/prop-calculator/core';

import { lockThresholdAt, planLabel } from '../shared';

const RESET_FEE_DISCOUNT = 0.9;

class FundedNextPlan extends Plan {}

const LEGACY_SIZES = [
    {
        accountSize: dollars(50_000),
        evalCost: 150,
        maxDrawdown: dollars(2000),
        profitTarget: dollars(3000),
    },
] as const;

const RAPID_SIZES = [
    {
        accountSize: dollars(50_000),
        evalCost: 200,
        maxDrawdown: dollars(2000),
        minPayoutProfit: dollars(250),
        profitTarget: dollars(3000),
    },
] as const;

const BOLT_SIZES = [
    {
        accountSize: dollars(50_000),
        dailyLossLimit: dollars(1000),
        evalCost: 100,
        maxDrawdown: dollars(2000),
        profitTarget: dollars(3000),
        resetCost: 92,
    },
] as const;

type FunctionBoltSize = (typeof BOLT_SIZES)[number];
type FunctionLegacySize = (typeof LEGACY_SIZES)[number];
type FunctionRapidSize = (typeof RAPID_SIZES)[number];

export class FundedNext extends TradingFirm {
    readonly displayName = 'FundedNext';
    readonly id = FirmId.FundedNext;
    readonly plans = [
        ...LEGACY_SIZES.map((s) => new FundedNextPlan(buildLegacyPlan(s))),
        ...RAPID_SIZES.map((s) => new FundedNextPlan(buildRapidPlan(s))),
        ...BOLT_SIZES.map((s) => new FundedNextPlan(buildBoltPlan(s))),
    ];
    readonly website = 'https://fundednext.com';
}

const MAX_FUNDED_ACCOUNTS = 5;

function buildBoltPlan(size: FunctionBoltSize): PlanInit {
    return {
        accountSize: size.accountSize,
        consistency: new ConsistencyRule(ConsistencyScope.Eval, fraction(0.4)),
        drawdown: new EodTrailingDrawdown({
            amount: size.maxDrawdown,
            lock: {
                atProfit: size.maxDrawdown,
                lockedThreshold: lockThresholdAt(0),
            },
        }),
        evalDailyLossLimit: {
            amount: size.dailyLossLimit,
            kind: DailyLossLimitKind.Flat,
        },
        fees: {
            activation: dollars(0),
            monthlySubscription: dollars(0),
            oneTimeEval: dollars(size.evalCost),
            reset: dollars(size.resetCost),
        },
        id: {
            accountSize: 50_000,
            firm: FirmId.FundedNext,
            variant: FundedNextVariant.Bolt,
        },
        label: planLabel(size.accountSize, 'Bolt'),
        maxFundedAccounts: MAX_FUNDED_ACCOUNTS,
        minDaysAfterPassForPayout: 0,
        minPayoutProfit: dollars(250),
        minTradingDays: 0,
        payoutTiers: [
            { thresholdProfit: dollars(0), traderShare: fraction(0.8) },
        ],
        profitTarget: size.profitTarget,
    };
}

function buildLegacyPlan(size: FunctionLegacySize): PlanInit {
    return {
        accountSize: size.accountSize,
        consistency: new ConsistencyRule(ConsistencyScope.Eval, fraction(0.4)),
        drawdown: new EodTrailingDrawdown({
            amount: size.maxDrawdown,
            lock: {
                atProfit: size.maxDrawdown,
                lockedThreshold: lockThresholdAt(0),
            },
        }),
        evalDailyLossLimit: { kind: DailyLossLimitKind.None },
        fees: {
            activation: dollars(0),
            monthlySubscription: dollars(0),
            oneTimeEval: dollars(size.evalCost),
            reset: dollars(Math.round(size.evalCost * RESET_FEE_DISCOUNT)),
        },
        id: {
            accountSize: 50_000,
            firm: FirmId.FundedNext,
            variant: FundedNextVariant.Legacy,
        },
        label: planLabel(size.accountSize, 'Legacy'),
        maxFundedAccounts: MAX_FUNDED_ACCOUNTS,
        minDaysAfterPassForPayout: 5,
        minPayoutProfit: dollars(250),
        minTradingDays: 3,
        payoutTiers: [
            { thresholdProfit: dollars(0), traderShare: fraction(0.8) },
        ],
        profitTarget: size.profitTarget,
    };
}

function buildRapidPlan(size: FunctionRapidSize): PlanInit {
    return {
        accountSize: size.accountSize,
        consistency: new ConsistencyRule(
            ConsistencyScope.Funded,
            fraction(0.4),
        ),
        drawdown: new EodTrailingDrawdown({
            amount: size.maxDrawdown,
            lock: {
                atProfit: size.maxDrawdown,
                lockedThreshold: lockThresholdAt(0),
            },
        }),
        evalDailyLossLimit: { kind: DailyLossLimitKind.None },
        fees: {
            activation: dollars(0),
            monthlySubscription: dollars(0),
            oneTimeEval: dollars(size.evalCost),
            reset: dollars(Math.round(size.evalCost * RESET_FEE_DISCOUNT)),
        },
        id: {
            accountSize: 50_000,
            firm: FirmId.FundedNext,
            variant: FundedNextVariant.Rapid,
        },
        label: planLabel(size.accountSize, 'Rapid'),
        maxFundedAccounts: MAX_FUNDED_ACCOUNTS,
        minDaysAfterPassForPayout: 5,
        minPayoutProfit: size.minPayoutProfit,
        minTradingDays: 0,
        payoutTiers: [
            { thresholdProfit: dollars(0), traderShare: fraction(0.8) },
        ],
        profitTarget: size.profitTarget,
    };
}
