import {
    ConsistencyRule,
    ConsistencyScope,
    contracts,
    DailyLossLimitKind,
    dollars,
    EodTrailingDrawdown,
    FirmId,
    fraction,
    type PlanInit,
    TopStepVariant,
    TradingFirm,
} from '~/lib/prop-calculator/core';

import { lockThresholdAt, planLabel } from '../shared';

const ACCOUNT_SIZE = 50_000;
const MAX_LOSS_LIMIT = dollars(2000);
const PROFIT_TARGET = dollars(3000);
const MIN_TRADING_DAYS = 2;
const MIN_PAYOUT = dollars(125);
const MIN_PAYOUT_PROFIT_PER_CYCLE = dollars(0.01);
const PAYOUT_BALANCE_SHARE_CAP = fraction(0.5);
const TRADER_SHARE = 0.9;

const COMBINE_CONSISTENCY = fraction(0.5);

const CONTRACT_LIMITS = {
    evalMicros: contracts(50),
    evalMinis: contracts(5),
    fundedMicros: null,
    fundedMinis: null,
};

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
        minQualifyingDayProfit: dollars(150),
        payoutRequestCap: dollars(2000),
        winningDays: 5,
    },
    {
        fundedConsistency: 0.4,
        key: 'consistency',
        label: 'Consistency XFA',
        minQualifyingDayProfit: null,
        payoutRequestCap: dollars(3000),
        winningDays: 3,
    },
] as const;

type PayoutPath = (typeof PAYOUT_PATHS)[number];
type PricingPath = (typeof PRICING_PATHS)[number];
type TopStepVariantKey = `${PricingPath['key']}-${PayoutPath['key']}`;

const TOPSTEP_VARIANTS: Record<TopStepVariantKey, TopStepVariant> = {
    'no-fee-consistency': TopStepVariant.NoFeeConsistency,
    'no-fee-standard': TopStepVariant.NoFeeStandard,
    'standard-consistency': TopStepVariant.StandardConsistency,
    'standard-standard': TopStepVariant.StandardStandard,
};

export class TopStep extends TradingFirm {
    readonly displayName = 'TopStep';
    readonly id = FirmId.TopStep;
    readonly plans = PRICING_PATHS.flatMap((pricing) =>
        PAYOUT_PATHS.map((payout) =>
            this.buildPlan(buildPlan(pricing, payout)),
        ),
    );
    readonly website = 'https://topstep.com';
}

const MAX_FUNDED_ACCOUNTS = 5;

function buildPlan(pricing: PricingPath, payout: PayoutPath): PlanInit {
    return {
        accountSize: dollars(ACCOUNT_SIZE),
        consistency: new ConsistencyRule(
            ConsistencyScope.Eval,
            COMBINE_CONSISTENCY,
        ),
        contractLimits: CONTRACT_LIMITS,
        drawdown: new EodTrailingDrawdown({
            amount: MAX_LOSS_LIMIT,
            lock: {
                atProfit: MAX_LOSS_LIMIT,
                lockedThreshold: lockThresholdAt(0),
            },
        }),
        evalDailyLossLimit: { kind: DailyLossLimitKind.None },
        fees: {
            activation: dollars(pricing.activation),
            monthlySubscription: dollars(pricing.monthlySubscription),
            oneTimeEval: dollars(0),
            reset: dollars(pricing.reset),
        },
        fundedConsistency: {
            kind: 'set',
            rule:
                payout.fundedConsistency === null
                    ? null
                    : new ConsistencyRule(
                          ConsistencyScope.Funded,
                          fraction(payout.fundedConsistency),
                      ),
        },
        id: {
            accountSize: ACCOUNT_SIZE,
            firm: FirmId.TopStep,
            variant: TOPSTEP_VARIANTS[`${pricing.key}-${payout.key}`],
        },
        label: planLabel(ACCOUNT_SIZE, `${pricing.label} · ${payout.label}`),
        maxFundedAccounts: MAX_FUNDED_ACCOUNTS,
        minDaysAfterPassForPayout: payout.winningDays,
        minPayoutProfit: dollars(0),
        minPayoutProfitPerCycle: MIN_PAYOUT_PROFIT_PER_CYCLE,
        minPayoutRequest: MIN_PAYOUT,
        minQualifyingDayProfit: payout.minQualifyingDayProfit,
        minTradingDays: MIN_TRADING_DAYS,
        payoutBalanceShareCap: PAYOUT_BALANCE_SHARE_CAP,
        payoutRequestCap: payout.payoutRequestCap,
        payoutResetsLossLimit: true,
        payoutTiers: [
            {
                thresholdProfit: dollars(0),
                traderShare: fraction(TRADER_SHARE),
            },
        ],
        profitTarget: PROFIT_TARGET,
    };
}
