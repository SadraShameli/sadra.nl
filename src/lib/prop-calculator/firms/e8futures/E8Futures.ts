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
        "E8 Signature's own help-center article ('Max. available Contract Sizes', helpfutures.e8markets.com, dateModified 2026-08-19, reached 2026-09-14 via a reader-proxy after direct fetch was blocked) gives one flat 'Maximum Contract Size' table with no eval-vs-funded split at all (unlike E8 Zero's own table on the same page, which does split into Challenge/Performance columns): 4 contracts ($40,000 margin) at the $50K tier. The article doesn't distinguish mini vs micro contract types the way most other firms' articles do, so this is modeled as a flat 4 for both evalMicros and evalMinis (and funded), matching MFF Pro's own precedent for a firm whose contract cap doesn't scale 10:1 by instrument type. Previously left entirely unset ('not published anywhere in the live docs') -- that was a stale conclusion from a pass that couldn't reach this specific article, not a genuine absence of the data.",
        "E8 Signature carries a hard 5-payout lifetime cap: after the 5th payout the funded cycle closes and the trader receives a free replacement challenge of the same size, per helpfutures.e8markets.com's own 'Payout caps and buffers for E8 Signature Futures explained' article, for accounts purchased after 14.07.2026 20:00 UTC+2 (already in effect). Previously unmodeled (an earlier note here wrongly implied this cap was E8 Zero-specific); maxLifetimePayouts set to 5.",
        'E8 Zero, a separate product on this same firm with no funded consistency rule and a fixed daily payout schedule instead of on-demand, is not modeled in this pass.',
        "E8 Signature's own help-center article ('E8 Signature Futures', reached via Wayback Machine after direct fetch was blocked, dated 2026-01-20) confirms a real recurring inter-payout gate, previously only found in conflicting secondary sources: 'Minimum profitable days for the first payout: 3... Minimum profitable days between each payout: 5... A profitable day is considered as a day where the realized closed PnL equals to 0.3% or more... After requesting a payout, your previously achieved profitable trading days will reset to 0.' The same article also states the already-confirmed 35% best-day rule and $1,250/$2,250/$3,250 payout caps, ruling out the conflation risk an earlier pass flagged (a different, unconfirmed E8 'Model 1/2' product tier has its own separate 40%-best-day/$1,200-cap article, textually distinct from this one). Modeled via a new minDaysAfterPassForPayoutPerCycle field on Plan (mirroring the existing minPayoutProfit/minPayoutProfitPerCycle first-vs-subsequent-cycle split, since no equivalent split previously existed for the qualifying-day count): minDaysAfterPassForPayout=3 (first payout), minDaysAfterPassForPayoutPerCycle=5 (every payout after), minQualifyingDayProfit=$150 (0.3% of the $50,000 account size).",
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
        contractLimits: {
            evalMicros: contracts(4),
            evalMinis: contracts(4),
            fundedMicros: {
                kind: ContractLimitKind.Flat,
                maxContracts: contracts(4),
            },
            fundedMinis: {
                kind: ContractLimitKind.Flat,
                maxContracts: contracts(4),
            },
        },
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
        maxLifetimePayouts: 5,
        minDaysAfterPassForPayout: 3,
        minDaysAfterPassForPayoutPerCycle: 5,
        minPayoutProfit: dollars(2000),
        minPayoutRequest: dollars(0.01),
        minQualifyingDayProfit: dollars(150),
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
