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
        maxLossLimit: 2000,
        monthlySubscription: 49,
        profitTarget: 3000,
    },
    {
        accountSize: 100_000,
        maxLossLimit: 3000,
        monthlySubscription: 99,
        profitTarget: 6000,
    },
    {
        accountSize: 150_000,
        maxLossLimit: 4500,
        monthlySubscription: 149,
        profitTarget: 9000,
    },
] as const;

const EXPRESS_SIZES = [
    {
        accountSize: 50_000,
        maxLossLimit: 2000,
        monthlySubscription: 95,
        profitTarget: 3000,
    },
    {
        accountSize: 100_000,
        maxLossLimit: 3000,
        monthlySubscription: 149,
        profitTarget: 6000,
    },
    {
        accountSize: 150_000,
        maxLossLimit: 4500,
        monthlySubscription: 229,
        profitTarget: 9000,
    },
] as const;

type ExpressSize = (typeof EXPRESS_SIZES)[number];
type StandardSize = (typeof STANDARD_SIZES)[number];

export class TopStep extends PropFirm {
    readonly displayName = 'TopStep';
    readonly id = FirmId.TopStep;
    readonly plans = [
        ...STANDARD_SIZES.map((s) => new TopStepPlan(buildStandardPlan(s))),
        ...EXPRESS_SIZES.map((s) => new TopStepPlan(buildExpressPlan(s))),
    ] as readonly Plan[];
    readonly website = 'https://topstep.com';

    maxFundedAccounts(): number {
        return 5;
    }
}

function buildExpressPlan(size: ExpressSize): PlanInit {
    return {
        accountSize: size.accountSize,
        consistency: new ConsistencyRule('eval', 0.5),
        dailyLossLimit: null,
        drawdown: new EodTrailingDrawdown({
            amount: size.maxLossLimit,
            lock: {
                atProfit: size.maxLossLimit,
                lockedThreshold: (start) => start,
            },
        }),
        fees: {
            activation: 0,
            monthlySubscription: size.monthlySubscription,
            oneTimeEval: 0,
            reset: 0,
        },
        id: {
            accountSize: size.accountSize,
            firm: FirmId.TopStep,
            variant: 'express',
        },
        label: `$${(size.accountSize / 1000).toFixed(0)}K — Express`,
        minDaysAfterPassForPayout: 5,
        minPayoutProfit: 750,
        minTradingDays: 0,
        payoutSchedule: { kind: 'every-n-win-days', n: 5 },
        payoutTiers: [{ thresholdProfit: 0, traderShare: 0.9 }],
        profitTarget: size.profitTarget,
    };
}

function buildStandardPlan(size: StandardSize): PlanInit {
    return {
        accountSize: size.accountSize,
        consistency: new ConsistencyRule('eval', 0.5),
        dailyLossLimit: null,
        drawdown: new EodTrailingDrawdown({
            amount: size.maxLossLimit,
            lock: {
                atProfit: size.maxLossLimit,
                lockedThreshold: (start) => start,
            },
        }),
        fees: {
            activation: 149,
            monthlySubscription: size.monthlySubscription,
            oneTimeEval: 0,
            reset: 0,
        },
        id: {
            accountSize: size.accountSize,
            firm: FirmId.TopStep,
            variant: 'standard',
        },
        label: `$${(size.accountSize / 1000).toFixed(0)}K — Standard`,
        minDaysAfterPassForPayout: 5,
        minPayoutProfit: 750,
        minTradingDays: 0,
        payoutSchedule: { kind: 'every-n-win-days', n: 5 },
        payoutTiers: [{ thresholdProfit: 0, traderShare: 0.9 }],
        profitTarget: size.profitTarget,
    };
}
