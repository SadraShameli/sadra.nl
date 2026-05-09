import {
    ConsistencyRule,
    FirmId,
    IntradayTrailingDrawdown,
    Plan,
    type PlanId,
    type PlanInit,
    PropFirm,
} from '../../core';

class TopStepPlan extends Plan {}

interface TopStepSize {
    accountSize: number;
    monthlySubscription: number;
    profitTarget: number;
    maxLossLimit: number;
}

const SIZES: readonly TopStepSize[] = [
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

function buildPlan(size: TopStepSize): PlanInit {
    return {
        id: `topstep-${size.accountSize}` as PlanId,
        label: `$${(size.accountSize / 1_000).toFixed(0)}K — Trading Combine`,
        accountSize: size.accountSize,
        profitTarget: size.profitTarget,
        minTradingDays: 0,
        dailyLossLimit: null,
        drawdown: new IntradayTrailingDrawdown({ amount: size.maxLossLimit }),
        consistency: new ConsistencyRule('both', 0.5),
        payoutTiers: [{ thresholdProfit: 0, traderShare: 0.9 }],
        payoutSchedule: { kind: 'daily' },
        fees: {
            oneTimeEval: 0,
            activation: 149,
            monthlySubscription: size.monthlySubscription,
            reset: 0,
        },
        minPayoutProfit: 250,
        minDaysAfterPassForPayout: 5,
    };
}

export class TopStep extends PropFirm {
    readonly id = FirmId.TopStep;
    readonly displayName = 'TopStep';
    readonly website = 'https://topstep.com';
    readonly plans = SIZES.map(
        (s) => new TopStepPlan(buildPlan(s)),
    ) as readonly Plan[];

    maxFundedAccounts(): number {
        return 5;
    }
}
