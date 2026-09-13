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
        'A 10% reset discount to restart from the Challenge phase after a failed account is confirmed live on both the general E8 Markets help domain and the futures-specific one (helpfutures.e8markets.com/en/articles/11640147-account-reset), resolving the earlier futures-vs-general ambiguity. It is documented here, not baked into the base list-price reset fee this plan models, since it is a conditional retry-flow discount rather than a standing list price.',
        'The real payout cap steps up by payout count: $1,250 for the 1st-2nd payout, $2,250 for the 3rd-4th, $3,250 from the 5th on. Modeled exactly via PayoutCountTieredPayoutCap, keyed on payoutsIssued.',
        'No recurring per-cycle profit requirement beyond the first-payout $2,000 buffer-zone gate was found in the research, so minPayoutProfitPerCycle is left unset rather than guessed; it defaults to $0 (no additional recurring floor modeled).',
        'Contract/minis-micros limits are not published anywhere in the live docs for this product and size, so contractLimits is left unset rather than guessed.',
        'E8 Zero, a separate product on this same firm with no funded consistency rule, a 5-payout lifetime cap, and a fixed daily payout schedule instead of on-demand, is not modeled in this pass.',
        "E8's live futures-specific inactivity-rule article (helpfutures.e8markets.com/en/articles/10253631-inactivity-rule) states accounts are closed after 7 consecutive days without a placed-and-closed trade, with no split by account stage or market type; a separate, differently-numbered article on the general E8 Markets help domain covers an unrelated 90-day rule that does not apply to Futures accounts. This was previously unmodeled (maxConsecutiveIdleDays was left unset); now set to 7, matching the mechanism MyFundedFutures already models the same way.",
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
        maxConsecutiveIdleDays: 7,
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
