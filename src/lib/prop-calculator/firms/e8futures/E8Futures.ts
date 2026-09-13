import {
    ConsistencyRule,
    ConsistencyScope,
    DailyLossLimitKind,
    dollars,
    EodTrailingDrawdown,
    FirmId,
    fraction,
    PayoutBuffer,
    PayoutCountTieredPayoutCap,
    type PlanInit,
    TradingFirm,
} from '~/lib/prop-calculator/core';

import { lockThresholdAt, planLabel } from '../shared';

const SIZES = [
    {
        accountSize: dollars(50_000),
        maxDrawdown: dollars(2000),
        profitTarget: dollars(3000),
    },
] as const;

type E8FuturesSize = (typeof SIZES)[number];

export class E8Futures extends TradingFirm {
    readonly displayName = 'E8 Futures';
    readonly id = FirmId.E8Futures;
    readonly notes = [
        'Coupon code "E8" is a standing, site-wide 25% discount on the eval fee ($160 -> $120). It is documented here, not baked into the base list-price eval fee this plan models.',
        'A 10% reset discount is confirmed on the general E8 Markets help domain, not the futures-specific one. It is documented here, not baked into the base list-price reset fee this plan models, for the same reason and the same treatment as the eval-fee coupon above.',
        'The real payout cap steps up by payout count: $1,250 for the 1st-2nd payout, $2,250 for the 3rd-4th, $3,250 from the 5th on. Modeled exactly via PayoutCountTieredPayoutCap, keyed on payoutsIssued.',
        'No recurring per-cycle profit requirement beyond the first-payout $2,000 buffer-zone gate was found in the research, so minPayoutProfitPerCycle is left unset rather than guessed; it falls back to minPayoutRequest ($0.01), effectively no recurring floor.',
        'Contract/minis-micros limits are not published anywhere in the live docs for this product and size, so contractLimits is left unset rather than guessed.',
        'E8 Zero, a separate product on this same firm with no funded consistency rule, a 5-payout lifetime cap, and a fixed daily payout schedule instead of on-demand, is not modeled in this pass.',
    ];
    readonly plans = SIZES.map((s) => this.buildPlan(buildPlan(s)));
    readonly website = 'https://e8futures.com';
}

const MAX_FUNDED_ACCOUNTS = 5;

function buildPlan(size: E8FuturesSize): PlanInit {
    return {
        accountSize: size.accountSize,
        consistency: null,
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
            oneTimeEval: dollars(160),
            reset: dollars(160),
        },
        fundedConsistency: {
            kind: 'set',
            rule: new ConsistencyRule(ConsistencyScope.Funded, fraction(0.35)),
        },
        fundedDailyLossLimit: {
            amount: dollars(1000),
            kind: DailyLossLimitKind.Flat,
        },
        id: { accountSize: 50_000, firm: FirmId.E8Futures },
        label: planLabel(size.accountSize, 'Signature'),
        maxFundedAccounts: MAX_FUNDED_ACCOUNTS,
        minDaysAfterPassForPayout: 0,
        minPayoutProfit: dollars(2000),
        minPayoutRequest: dollars(0.01),
        minTradingDays: 0,
        payoutBuffer: new PayoutBuffer(dollars(0)),
        payoutCapOverride: new PayoutCountTieredPayoutCap([
            {
                fromPayoutIndex: 0,
                regime: { balanceShareCap: null, requestCap: dollars(1250) },
            },
            {
                fromPayoutIndex: 2,
                regime: { balanceShareCap: null, requestCap: dollars(2250) },
            },
            {
                fromPayoutIndex: 4,
                regime: { balanceShareCap: null, requestCap: dollars(3250) },
            },
        ]),
        payoutTiers: [
            { thresholdProfit: dollars(0), traderShare: fraction(0.8) },
        ],
        profitTarget: size.profitTarget,
    };
}
