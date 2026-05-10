import {
    ConsistencyRule,
    EodTrailingDrawdown,
    FirmId,
    Plan,
    type PlanInit,
    PropFirm,
} from '../../core';

class TopStepPlan extends Plan {}

const STANDARD_SIZES = [
    {
        accountSize: 50_000,
        monthlySubscription: 49,
        profitTarget: 3_000,
        maxLossLimit: 2_000,
    },
    {
        accountSize: 100_000,
        monthlySubscription: 99,
        profitTarget: 6_000,
        maxLossLimit: 3_000,
    },
    {
        accountSize: 150_000,
        monthlySubscription: 149,
        profitTarget: 9_000,
        maxLossLimit: 4_500,
    },
] as const;

const EXPRESS_SIZES = [
    {
        accountSize: 50_000,
        monthlySubscription: 95,
        profitTarget: 3_000,
        maxLossLimit: 2_000,
    },
    {
        accountSize: 100_000,
        monthlySubscription: 149,
        profitTarget: 6_000,
        maxLossLimit: 3_000,
    },
    {
        accountSize: 150_000,
        monthlySubscription: 229,
        profitTarget: 9_000,
        maxLossLimit: 4_500,
    },
] as const;

type StandardSize = (typeof STANDARD_SIZES)[number];
type ExpressSize = (typeof EXPRESS_SIZES)[number];

function buildStandardPlan(size: StandardSize): PlanInit {
    return {
        id: {
            firm: FirmId.TopStep,
            accountSize: size.accountSize,
            variant: 'standard',
        },
        label: `$${(size.accountSize / 1_000).toFixed(0)}K — Standard`,
        accountSize: size.accountSize,
        profitTarget: size.profitTarget,
        minTradingDays: 0,
        dailyLossLimit: null,
        drawdown: new EodTrailingDrawdown({
            amount: size.maxLossLimit,
            lock: {
                atProfit: size.maxLossLimit,
                lockedThreshold: (start) => start,
            },
        }),
        consistency: new ConsistencyRule('eval', 0.5),
        payoutTiers: [{ thresholdProfit: 0, traderShare: 0.9 }],
        payoutSchedule: { kind: 'every-n-win-days', n: 5 },
        fees: {
            oneTimeEval: 0,
            activation: 149,
            monthlySubscription: size.monthlySubscription,
            reset: 0,
        },
        minPayoutProfit: 750,
        minDaysAfterPassForPayout: 5,
    };
}

function buildExpressPlan(size: ExpressSize): PlanInit {
    return {
        id: {
            firm: FirmId.TopStep,
            accountSize: size.accountSize,
            variant: 'express',
        },
        label: `$${(size.accountSize / 1_000).toFixed(0)}K — Express`,
        accountSize: size.accountSize,
        profitTarget: size.profitTarget,
        minTradingDays: 0,
        dailyLossLimit: null,
        drawdown: new EodTrailingDrawdown({
            amount: size.maxLossLimit,
            lock: {
                atProfit: size.maxLossLimit,
                lockedThreshold: (start) => start,
            },
        }),
        consistency: new ConsistencyRule('eval', 0.5),
        payoutTiers: [{ thresholdProfit: 0, traderShare: 0.9 }],
        payoutSchedule: { kind: 'every-n-win-days', n: 5 },
        fees: {
            oneTimeEval: 0,
            activation: 0,
            monthlySubscription: size.monthlySubscription,
            reset: 0,
        },
        minPayoutProfit: 750,
        minDaysAfterPassForPayout: 5,
    };
}

export class TopStep extends PropFirm {
    readonly id = FirmId.TopStep;
    readonly displayName = 'TopStep';
    readonly website = 'https://topstep.com';
    readonly plans = [
        ...STANDARD_SIZES.map((s) => new TopStepPlan(buildStandardPlan(s))),
        ...EXPRESS_SIZES.map((s) => new TopStepPlan(buildExpressPlan(s))),
    ] as readonly Plan[];

    maxFundedAccounts(): number {
        return 5;
    }
}
