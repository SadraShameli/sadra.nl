import {
    ConsistencyRule,
    EodTrailingDrawdown,
    FirmId,
    Plan,
    type PlanId,
    type PlanInit,
    PropFirm,
} from '../../core';

class LucidPlan extends Plan {}

interface LucidSize {
    accountSize: number;
    evalCost: number;
    maxDrawdown: number;
}

const SIZES: readonly LucidSize[] = [
    { accountSize: 25_000, evalCost: 80, maxDrawdown: 1_000 },
    { accountSize: 50_000, evalCost: 104, maxDrawdown: 2_000 },
    { accountSize: 100_000, evalCost: 180, maxDrawdown: 3_000 },
    { accountSize: 150_000, evalCost: 261, maxDrawdown: 4_500 },
] as const;

function buildPlan(size: LucidSize): PlanInit {
    const profitTarget = size.accountSize * 0.06;
    return {
        id: `lucid-${size.accountSize}` as PlanId,
        label: `$${(size.accountSize / 1_000).toFixed(0)}K — LucidFlex`,
        accountSize: size.accountSize,
        profitTarget,
        minTradingDays: 2,
        dailyLossLimit: null,
        drawdown: new EodTrailingDrawdown({
            amount: size.maxDrawdown,
            lock: {
                atProfit: size.maxDrawdown,
                lockedThreshold: (start) => start,
            },
        }),
        consistency: new ConsistencyRule('eval', 0.5),
        payoutTiers: [{ thresholdProfit: 0, traderShare: 0.9 }],
        payoutSchedule: { kind: 'every-n-win-days', n: 5 },
        fees: {
            oneTimeEval: size.evalCost,
            activation: 0,
            monthlySubscription: 0,
            reset: 50,
        },
        minPayoutProfit: 500,
        minDaysAfterPassForPayout: 5,
    };
}

export class LucidTrading extends PropFirm {
    readonly id = FirmId.Lucid;
    readonly displayName = 'Lucid Trading';
    readonly website = 'https://lucidtrading.com';
    readonly plans = SIZES.map(
        (s) => new LucidPlan(buildPlan(s)),
    ) as readonly Plan[];

    maxFundedAccounts(): number {
        return 5;
    }
}
