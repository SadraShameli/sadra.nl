import {
    ConsistencyRule,
    EodTrailingDrawdown,
    FirmId,
    Plan,
    type PlanId,
    type PlanInit,
    TradingFirm,
} from '~/lib/prop-calculator/core';

class TopStepPlan extends Plan {}

const ACCOUNT_SIZE = 50_000;
const MAX_LOSS_LIMIT = 2000;
const PROFIT_TARGET = 3000;
const MIN_TRADING_DAYS = 2;
const MIN_PAYOUT = 125;
const TRADER_SHARE = 0.9;

const COMBINE_CONSISTENCY = 0.5;

const CONTRACT_LIMITS = {
    evalMicros: 50,
    evalMinis: 5,
    fundedMicros: null,
    fundedMinis: null,
} as const;

const PRICING_PATHS = [
    {
        activation: 149,
        key: 'standard',
        label: 'Standard path',
        monthlySubscription: 49,
        reset: 49,
    },
    {
        activation: 0,
        key: 'no-fee',
        label: 'No-fee path',
        monthlySubscription: 95,
        reset: 95,
    },
] as const;

const PAYOUT_PATHS = [
    {
        fundedConsistency: null,
        key: 'standard',
        label: 'Standard XFA',
        minQualifyingDayProfit: 150,
        payoutRequestCap: 2000,
        winningDays: 5,
    },
    {
        fundedConsistency: 0.4,
        key: 'consistency',
        label: 'Consistency XFA',
        minQualifyingDayProfit: null,
        payoutRequestCap: 3000,
        winningDays: 3,
    },
] as const;

type PayoutPath = (typeof PAYOUT_PATHS)[number];
type PricingPath = (typeof PRICING_PATHS)[number];
type TopStepPlanId = Extract<PlanId, { firm: FirmId.TopStep }>;

export class TopStep extends TradingFirm {
    readonly displayName = 'TopStep';
    readonly id = FirmId.TopStep;
    readonly plans = PRICING_PATHS.flatMap((pricing) =>
        PAYOUT_PATHS.map(
            (payout) => new TopStepPlan(buildPlan(pricing, payout)),
        ),
    ) as readonly Plan[];
    readonly website = 'https://topstep.com';

    maxFundedAccounts(): number {
        return 5;
    }
}

function buildPlan(pricing: PricingPath, payout: PayoutPath): PlanInit {
    return {
        accountSize: ACCOUNT_SIZE,
        consistency: new ConsistencyRule('eval', COMBINE_CONSISTENCY),
        contractLimits: CONTRACT_LIMITS,
        drawdown: new EodTrailingDrawdown({
            amount: MAX_LOSS_LIMIT,
            lock: {
                atProfit: MAX_LOSS_LIMIT,
                lockedThreshold: (start) => start,
            },
        }),
        evalDailyLossLimit: { kind: 'none' },
        fees: {
            activation: pricing.activation,
            monthlySubscription: pricing.monthlySubscription,
            oneTimeEval: 0,
            reset: pricing.reset,
        },
        fundedConsistency:
            payout.fundedConsistency === null
                ? null
                : new ConsistencyRule('funded', payout.fundedConsistency),
        id: {
            accountSize: ACCOUNT_SIZE,
            firm: FirmId.TopStep,
            variant: `${pricing.key}-${payout.key}` as TopStepPlanId['variant'],
        },
        label: `$${(ACCOUNT_SIZE / 1000).toFixed(0)}K — ${pricing.label} · ${payout.label}`,
        minDaysAfterPassForPayout: payout.winningDays,
        minPayoutProfit: MIN_PAYOUT,
        minPayoutRequest: MIN_PAYOUT,
        minQualifyingDayProfit: payout.minQualifyingDayProfit,
        minTradingDays: MIN_TRADING_DAYS,
        payoutRequestCap: payout.payoutRequestCap,
        payoutSchedule: { kind: 'every-n-win-days', n: payout.winningDays },
        payoutTiers: [{ thresholdProfit: 0, traderShare: TRADER_SHARE }],
        profitTarget: PROFIT_TARGET,
    };
}
