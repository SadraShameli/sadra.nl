import {
    ConsistencyRule,
    ConsistencyScope,
    type ContractLimitConfig,
    ContractLimitKind,
    contracts,
    DailyLossLimitKind,
    dollars,
    type Dollars,
    E8FuturesVariant,
    EodTrailingDrawdown,
    FirmId,
    fraction,
    PayoutBuffer,
    PayoutCountTieredPayoutCap,
    PayoutFloorEffect,
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

enum ZeroTier {
    Max = 'max',
    Starter = 'starter',
}

type E8FuturesSize = (typeof SIZES)[number];

const ZERO_ACCOUNT_SIZE = dollars(50_000);
const ZERO_DRAWDOWN = dollars(1500);
const ZERO_PROFIT_TARGET = dollars(3000);
const ZERO_EVAL_CONTRACTS = contracts(4);

const ZERO_FUNDED_CONTRACT_LIMITS: ContractLimitConfig = {
    kind: ContractLimitKind.Tiered,
    tiers: [
        { maxContracts: contracts(2), minBalance: dollars(0) },
        { maxContracts: contracts(3), minBalance: dollars(750) },
        { maxContracts: contracts(5), minBalance: dollars(1500) },
    ],
};

const ZERO_TIER_CONFIG: Record<
    ZeroTier,
    { label: string; payoutRequestCap: Dollars }
> = {
    [ZeroTier.Max]: { label: 'Zero MAX', payoutRequestCap: dollars(3000) },
    [ZeroTier.Starter]: {
        label: 'Zero Starter',
        payoutRequestCap: dollars(1000),
    },
};

const ZERO_PAYOUT_SHARES: Record<
    ZeroTier,
    Record<80 | 100, { evalFee: Dollars; variant: E8FuturesVariant }>
> = {
    [ZeroTier.Max]: {
        80: { evalFee: dollars(214), variant: E8FuturesVariant.ZeroMax80 },
        100: { evalFee: dollars(279), variant: E8FuturesVariant.ZeroMax100 },
    },
    [ZeroTier.Starter]: {
        80: {
            evalFee: dollars(116),
            variant: E8FuturesVariant.ZeroStarter80,
        },
        100: {
            evalFee: dollars(149),
            variant: E8FuturesVariant.ZeroStarter100,
        },
    },
};

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
        "E8 Zero (MAX and Starter) is a real, separate, currently-purchasable one-phase product line, confirmed live 2026-09-15 directly against e8futures.com/e8-zero's own account configurator (cross-checked against a user-supplied screenshot of the same live configurator showing both the 80% and 100% payout states, which resolved an initial mis-read of the page's default-loaded state). At $50K: Challenge profit target $3,000, 3% EOD Dynamic Drawdown ($1,500), 40% consistency rule (challenge-only -- zero consistency, zero daily loss limit, zero minimum-profitable-days once funded, unlike Signature which is the reverse). Modeled as 4 separate variants (ZeroMax80/100, ZeroStarter80/100) since the payout share is a real, distinct-price choice made at purchase, not a runtime toggle: MAX $214/$279 (80%/100% payout), Starter $116/$149 (80%/100%). Both tiers share identical rules and drawdown; only price, payout share and the per-cycle payout cap ($3,000 MAX vs $1,000 Starter, at $50K) differ.",
        'E8 Zero funds daily: minPayoutRequest and minPayoutProfit/minPayoutProfitPerCycle are all set to $100 (the site\'s own "make at least $100 in the current payout cycle" rule, every cycle, not just the first), minDaysAfterPassForPayout is 0 ("first payout in as little as 0 Days"), and minQualifyingDayProfit is left unset since there is explicitly no minimum-profitable-days rule funded-side.',
        "E8 Zero's drawdown locks to breakeven either once closed profit equals the $1,500 drawdown amount (the same lock mechanism Signature already uses) or on the first payout, whichever comes first -- the second trigger needed payoutFloorEffect: PayoutFloorEffect.LockAtPlanFloor added on top of the existing profit-triggered lock, since a trader can request a (small) payout before profit reaches $1,500.",
        "E8 Zero's funded contract limit scales with profit rather than staying flat like Signature's: 2 contracts from $0, 3 from $750 (half the $1,500 drawdown) reached in profit, 5 from $1,500 (the full drawdown) reached in profit -- modeled via ContractLimitKind.Tiered keyed on accountProfit, exactly like TopStep's existing tiered funded limit. The eval/challenge side is flat 4, matching Signature's own no-mini/micro-split convention (the site's own table doesn't split by contract type either).",
        "E8 Zero's reset fee is not independently confirmed by any source read so far -- modeled as equal to each variant's own eval fee, matching Signature's existing reset==eval convention, pending a direct confirmation.",
        "E8 Zero does NOT carry Signature's payoutBuffer (the 'EOD balance must clear accountSize+drawdown' safety-net gate) -- no source describes any such pre-first-payout balance requirement for Zero, and its own rules explicitly allow a payout as soon as $100 cycle profit is made, from day one. Caught by a direct tryFundedPayout test after initially copying Signature's payoutBuffer over by pattern-matching rather than checking it against Zero's own confirmed rules. Confirmed directly against E8 Zero's own dedicated article (helpfutures.e8markets.com/en/articles/15935817-e8-zero-starter-and-max, reached via a real browser session after every curl/WebFetch attempt was Cloudflare-blocked): 'No minimum Trading days' (confirms minTradingDays: 0 is correct, contradicting a third-party aggregator's self-contradictory '3 days' claim), and the payout buffer is only soft advisory text ('in certain scenarios, you should leave a buffer'), not a hard rule -- confirming the fix.",
        "E8 Zero's funded-account cap is 3, not Signature's 5 -- confirmed directly (2026-09-15, user-fetched after Cloudflare blocked every automated path) against help.e8markets.com's 'How many accounts can I apply for at once?' article: 'E8 Zero = 3 performance accounts... E8 Signature Futures = 5 performance accounts.' Previously modeled as 5 for all 5 E8 Futures plans via one shared MAX_FUNDED_ACCOUNTS constant; Zero's 4 variants now use a separate ZERO_MAX_FUNDED_ACCOUNTS=3 constant. The same article also independently re-confirms the account-reset 10% discount mechanic already documented above (not baked into either plan's base reset fee).",
        "E8 Signature's own help-center article ('E8 Signature Futures', reached via Wayback Machine after direct fetch was blocked, dated 2026-01-20) confirms a real recurring inter-payout gate, previously only found in conflicting secondary sources: 'Minimum profitable days for the first payout: 3... Minimum profitable days between each payout: 5... A profitable day is considered as a day where the realized closed PnL equals to 0.3% or more... After requesting a payout, your previously achieved profitable trading days will reset to 0.' The same article also states the already-confirmed 35% best-day rule and $1,250/$2,250/$3,250 payout caps, ruling out the conflation risk an earlier pass flagged (a different, unconfirmed E8 'Model 1/2' product tier has its own separate 40%-best-day/$1,200-cap article, textually distinct from this one). Modeled via a new minDaysAfterPassForPayoutPerCycle field on Plan (mirroring the existing minPayoutProfit/minPayoutProfitPerCycle first-vs-subsequent-cycle split, since no equivalent split previously existed for the qualifying-day count): minDaysAfterPassForPayout=3 (first payout), minDaysAfterPassForPayoutPerCycle=5 (every payout after), minQualifyingDayProfit=$150 (0.3% of the $50,000 account size).",
        "E8's live futures-specific inactivity-rule article (helpfutures.e8markets.com/en/articles/10253631-inactivity-rule) states accounts are closed after 7 consecutive days without a placed-and-closed trade, with no split by account stage or market type; a separate, differently-numbered article on the general E8 Markets help domain covers an unrelated 90-day rule that does not apply to Futures accounts. This was previously unmodeled (maxConsecutiveIdleDays was left unset); now set to 7, matching the mechanism MyFundedFutures already models the same way.",
        'No live-account program exists -- the account model terminates at a simulated, payout-eligible stage.',
    ];
    readonly plans = [
        ...SIZES.map((s) => this.buildPlan(buildSignaturePlan(s))),
        ...(
            [
                [ZeroTier.Max, 80],
                [ZeroTier.Max, 100],
                [ZeroTier.Starter, 80],
                [ZeroTier.Starter, 100],
            ] as const
        ).map(([tier, share]) => this.buildPlan(buildZeroPlan(tier, share))),
    ];
    readonly website = 'https://e8futures.com';
}

const MAX_FUNDED_ACCOUNTS = 5;
const ZERO_MAX_FUNDED_ACCOUNTS = 3;

function buildSignaturePlan(size: E8FuturesSize): PlanInit {
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
        id: {
            accountSize: 50_000,
            firm: FirmId.E8Futures,
            variant: E8FuturesVariant.Signature,
        },
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

function buildZeroPlan(tier: ZeroTier, share: 80 | 100): PlanInit {
    const tierConfig = ZERO_TIER_CONFIG[tier];
    const shareConfig = ZERO_PAYOUT_SHARES[tier][share];
    return {
        accountSize: ZERO_ACCOUNT_SIZE,
        consistency: new ConsistencyRule(ConsistencyScope.Eval, fraction(0.4)),
        contractLimits: {
            evalMicros: ZERO_EVAL_CONTRACTS,
            evalMinis: ZERO_EVAL_CONTRACTS,
            fundedMicros: ZERO_FUNDED_CONTRACT_LIMITS,
            fundedMinis: ZERO_FUNDED_CONTRACT_LIMITS,
        },
        drawdown: new EodTrailingDrawdown({
            amount: ZERO_DRAWDOWN,
            lock: {
                atProfit: ZERO_DRAWDOWN,
                lockedThreshold: lockThresholdAt(0),
            },
        }),
        evalDailyLossLimit: { kind: DailyLossLimitKind.None },
        fees: {
            activation: dollars(0),
            monthlySubscription: dollars(0),
            oneTimeEval: shareConfig.evalFee,
            reset: shareConfig.evalFee,
        },
        fundedDailyLossLimit: { kind: DailyLossLimitKind.None },
        id: {
            accountSize: 50_000,
            firm: FirmId.E8Futures,
            variant: shareConfig.variant,
        },
        label: planLabel(
            ZERO_ACCOUNT_SIZE,
            `${tierConfig.label} (${share}% payout)`,
        ),
        maxConsecutiveIdleDays: 7,
        maxFundedAccounts: ZERO_MAX_FUNDED_ACCOUNTS,
        maxLifetimePayouts: 5,
        minDaysAfterPassForPayout: 0,
        minPayoutProfit: dollars(100),
        minPayoutProfitPerCycle: dollars(100),
        minPayoutRequest: dollars(100),
        minTradingDays: 0,
        payoutFloorEffect: PayoutFloorEffect.LockAtPlanFloor,
        payoutRequestCap: tierConfig.payoutRequestCap,
        payoutTiers: [
            { thresholdProfit: dollars(0), traderShare: fraction(share / 100) },
        ],
        profitTarget: ZERO_PROFIT_TARGET,
    };
}
