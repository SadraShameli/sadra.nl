import {
    ConsistencyRule,
    ConsistencyScope,
    type ContractCount,
    type ContractLimitConfig,
    ContractLimitKind,
    type ContractLimits,
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
    TierBasis,
    TradingFirm,
} from '~/lib/prop-calculator/core';
import { lockThresholdAt, planLabel } from '~/lib/prop-calculator/firms/shared';

const SIZES = [
    {
        accountSize: dollars(50_000),
        marginAllowance: dollars(40_000),
        maxDrawdown: dollars(2000),
        profitTarget: dollars(3000),
    },
] as const;

const MINI_CONTRACT_MARGIN = dollars(10_000);
const MICRO_CONTRACT_MARGIN = dollars(1000);

enum ZeroTier {
    Max = 'max',
    Starter = 'starter',
}

type E8FuturesSize = (typeof SIZES)[number];

const ZERO_ACCOUNT_SIZE = dollars(50_000);
const ZERO_DRAWDOWN = dollars(1500);
const ZERO_PROFIT_TARGET = dollars(3000);
const ZERO_EVAL_MARGIN_ALLOWANCE = dollars(40_000);

const ZERO_FUNDED_MARGIN_TIERS = [
    { marginAllowance: dollars(20_000), minBalance: dollars(0) },
    { marginAllowance: dollars(30_000), minBalance: dollars(750) },
    { marginAllowance: dollars(50_000), minBalance: dollars(1500) },
] as const;

function contractsWithinMargin(
    allowance: Dollars,
    perContract: Dollars,
): ContractCount {
    return contracts(Math.floor(allowance / perContract));
}

function zeroFundedContractLimit(perContract: Dollars): ContractLimitConfig {
    return {
        kind: ContractLimitKind.Tiered,
        tierBasis: TierBasis.SessionOpenProfit,
        tiers: ZERO_FUNDED_MARGIN_TIERS.map((tier) => ({
            maxContracts: contractsWithinMargin(
                tier.marginAllowance,
                perContract,
            ),
            minBalance: tier.minBalance,
        })),
    };
}

const ZERO_CONTRACT_LIMITS: ContractLimits = {
    evalMicros: contractsWithinMargin(
        ZERO_EVAL_MARGIN_ALLOWANCE,
        MICRO_CONTRACT_MARGIN,
    ),
    evalMinis: contractsWithinMargin(
        ZERO_EVAL_MARGIN_ALLOWANCE,
        MINI_CONTRACT_MARGIN,
    ),
    fundedMicros: zeroFundedContractLimit(MICRO_CONTRACT_MARGIN),
    fundedMinis: zeroFundedContractLimit(MINI_CONTRACT_MARGIN),
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
    Record<80 | 100, { listEvalFee: Dollars; variant: E8FuturesVariant }>
> = {
    [ZeroTier.Max]: {
        80: {
            listEvalFee: dollars(328),
            variant: E8FuturesVariant.ZeroMax80,
        },
        100: {
            listEvalFee: dollars(428),
            variant: E8FuturesVariant.ZeroMax100,
        },
    },
    [ZeroTier.Starter]: {
        80: {
            listEvalFee: dollars(178),
            variant: E8FuturesVariant.ZeroStarter80,
        },
        100: {
            listEvalFee: dollars(228),
            variant: E8FuturesVariant.ZeroStarter100,
        },
    },
};

export class E8Futures extends TradingFirm {
    readonly displayName = 'E8 Futures';
    readonly id = FirmId.E8Futures;
    readonly notes = [
        'The Signature 50K evaluation fee and reset are the configurator\'s list price, $170 (balances.50000.price in the embedded config on e8futures.com, re-read 2026-10-02; it read $160 on 2026-09-23), not a price after any code (T3, T4).',
        'Coupon code "E8" is a typed code, so it is not baked into the list-price eval fees modeled here (T4), and E8\'s own pages disagree on it: on 2026-10-02 the configurator shows code E8 at 5% on a first order (Signature $50K $170 -> $162), the discount-codes page still lists E8 at 25% on E8 Signature and REB8 at 35% on E8 Zero for all purchases, and the homepage runs a separate 40% promo. No source says which of these a buyer is charged, and no typed code lowers the modeled fee. Model the code you actually use with --eval-discount.',
        'A 10% reset discount to restart from the Challenge phase after a failed account is confirmed live on both the general E8 Markets help domain and the futures-specific one (helpfutures.e8markets.com/en/articles/11640147-account-reset), resolving the earlier futures-vs-general ambiguity. It is documented here, not baked into the base list-price reset fee this plan models, since it is a conditional retry-flow discount rather than a standing list price.',
        'The real payout cap steps up by payout count: $1,250 for the 1st-2nd payout, $2,250 for the 3rd-4th, $3,250 from the 5th on. Modeled exactly via PayoutCountTieredPayoutCap, keyed on payoutsIssued.',
        'No recurring per-cycle profit requirement beyond the first-payout $2,000 buffer-zone gate was found in the research, so minPayoutProfitPerCycle is left unset rather than guessed; it defaults to $0 (no additional recurring floor modeled).',
        "E8 Signature's contract cap is margin-based, per helpfutures.e8markets.com's 'Max. available Contract Sizes' article (10155917, updated 2026-08-19, page pasted by the user 2026-09-23): 'Allowed margin / Margin per contract = size of the position', with the $50K tier at '4 Contracts ($40,000 margin)'. The same article's margin table lists /ES and /NQ at $10,000 and /MES and /MNQ at $1,000 per contract, so the $40,000 allowance gives 4 minis or 40 micros ($1,000 per micro contract). The table has no eval-vs-funded split for Signature, so both stages use the same caps. SIZES carries the margin allowance and the caps are derived from it. Previously modeled as a flat 4 for micros too, on the false premise that the article did not distinguish contract types, which capped micro sizing 10x below the firm's rule.",
        "E8 Signature carries a hard 5-payout lifetime cap: after the 5th payout the funded cycle closes and the trader receives a free replacement challenge of the same size, per helpfutures.e8markets.com's own 'Payout caps and buffers for E8 Signature Futures explained' article, for accounts purchased after 14.07.2026 20:00 UTC+2 (already in effect). Previously unmodeled (an earlier note here wrongly implied this cap was E8 Zero-specific); maxLifetimePayouts set to 5.",
        "E8 Zero (MAX and Starter) is a real, separate, currently-purchasable one-phase product line, checked live 2026-09-15 directly against e8futures.com/e8-zero's own account configurator (cross-checked against a user-supplied screenshot of the same live configurator showing both the 80% and 100% payout states, which resolved an initial mis-read of the page's default-loaded state). At $50K: Challenge profit target $3,000, 3% EOD Dynamic Drawdown ($1,500), 40% consistency rule (challenge-only -- zero consistency, zero daily loss limit, zero minimum-profitable-days once funded, unlike Signature which is the reverse). Modeled as 4 separate variants (ZeroMax80/100, ZeroStarter80/100) since the payout share is a real, distinct-price choice made at purchase, not a runtime toggle: MAX $328/$428 (80%/100% payout), Starter $178/$228 (80%/100%), modeled at the list price with no coupon code, the same basis as Signature's $170. The 80%-share prices are e8futures.com's own configurator list prices (balances.50000.price for e8zero_max_fu and e8zero_start_fu, fetched 2026-09-23). The 100%-share prices are not displayed anywhere on the site; they are derived from the site's own pricing function (ceil(listPrice80 * (1 + 20 * pht))), per zero.md. Both tiers share identical rules and drawdown; only price, payout share and the per-cycle payout cap ($3,000 MAX vs $1,000 Starter, at $50K) differ. The live discount sources conflict (on 2026-10-02 the configurator shows code E8 at 5% on a first order, the discount-codes page lists REB8 at 35% for all purchases on Zero MAX and Zero Starter, and the homepage runs a 40% promo), so none is baked in and no typed code lowers the modeled fee: apply the one you actually use with --eval-discount. Previously modeled at the 35%-off promo prices $214/$279/$116/$149, which mixed a discounted Zero basis with Signature's list basis and made Zero Starter rank cheaper than Signature.",
        'E8 Zero funds daily: minPayoutRequest and minPayoutProfit/minPayoutProfitPerCycle are all set to $100 (the site\'s own "make at least $100 in the current payout cycle" rule, every cycle, not just the first), minDaysAfterPassForPayout is 0 ("first payout in as little as 0 Days"), and minQualifyingDayProfit is left unset since there is explicitly no minimum-profitable-days rule funded-side.',
        "E8 Zero's Performance-stage drawdown (fundedDrawdown) locks to breakeven either once closed profit reaches the $1,500 drawdown amount (the same lock mechanism Signature already uses) or on the first payout, whichever comes first; the Challenge-stage drawdown never locks (see the Challenge-stage note below). The second trigger needed payoutFloorEffect: PayoutFloorEffect.LockAtPlanFloor added on top of the existing profit-triggered lock, since a trader can request a (small) payout before profit reaches $1,500.",
        "E8 Zero's funded contract limit scales with profit rather than staying flat like Signature's, and like Signature it is margin-based ('Max. available Contract Sizes', pasted 2026-09-23): a $20,000 margin allowance from $0, $30,000 from $750 (half the $1,500 drawdown) reached in profit, $50,000 from $1,500 (the full drawdown) reached in profit, which gives 2/3/5 minis at $10,000 or 20/30/50 micros at $1,000 per contract, modeled via ContractLimitKind.Tiered with tierBasis TierBasis.SessionOpenProfit, so the tier comes from account profit at the prior session close (see the tier-timing note below). The Challenge side is a flat $40,000 allowance: 4 minis or 40 micros. Previously the mini counts were applied to micros too.",
        "E8 Zero's reset fee is not independently confirmed by any source read so far (the 2026-09-23 site config has no reset-price field): modeled as equal to each variant's own list eval fee, matching Signature's reset == eval convention, pending a direct confirmation.",
        "E8 Zero does NOT carry Signature's payoutBuffer (the 'EOD balance must clear accountSize+drawdown' safety-net gate) -- no source describes any such pre-first-payout balance requirement for Zero, and its own rules explicitly allow a payout as soon as $100 cycle profit is made, from day one. Caught by a direct FundedCycleTracker.tryPayout test after initially copying Signature's payoutBuffer over by pattern-matching rather than checking it against Zero's own confirmed rules. Confirmed directly against E8 Zero's own dedicated article (helpfutures.e8markets.com/en/articles/15935817-e8-zero-starter-and-max, reached via a real browser session after every curl/WebFetch attempt was Cloudflare-blocked): 'No minimum Trading days' (confirms minTradingDays: 0 is correct, contradicting a third-party aggregator's self-contradictory '3 days' claim), and the payout buffer is only soft advisory text ('in certain scenarios, you should leave a buffer'), not a hard rule -- confirming the fix.",
        "E8 Zero's funded-account cap is 3, not Signature's 5 -- confirmed directly (2026-09-15, user-fetched after Cloudflare blocked every automated path) against help.e8markets.com's 'How many accounts can I apply for at once?' article: 'E8 Zero = 3 performance accounts... E8 Signature Futures = 5 performance accounts.' Previously modeled as 5 for all 5 E8 Futures plans via one shared MAX_FUNDED_ACCOUNTS constant; Zero's 4 variants now use a separate ZERO_MAX_FUNDED_ACCOUNTS=3 constant. The same article also independently re-confirms the account-reset 10% discount mechanic already documented above (not baked into either plan's base reset fee).",
        "E8 Signature's own help-center article ('E8 Signature Futures', reached via Wayback Machine after direct fetch was blocked, dated 2026-01-20) confirms a real recurring inter-payout gate, previously only found in conflicting secondary sources: 'Minimum profitable days for the first payout: 3... Minimum profitable days between each payout: 5... A profitable day is considered as a day where the realized closed PnL equals to 0.3% or more... After requesting a payout, your previously achieved profitable trading days will reset to 0.' The same article also states the already-confirmed 35% best-day rule and $1,250/$2,250/$3,250 payout caps, ruling out the conflation risk an earlier pass flagged (a different, unconfirmed E8 'Model 1/2' product tier has its own separate 40%-best-day/$1,200-cap article, textually distinct from this one). Modeled via a new minDaysAfterPassForPayoutPerCycle field on Plan (mirroring the existing minPayoutProfit/minPayoutProfitPerCycle first-vs-subsequent-cycle split, since no equivalent split previously existed for the qualifying-day count): minDaysAfterPassForPayoutPerCycle=5 (every payout after the first), minQualifyingDayProfit=$150 (0.3% of the $50,000 account size). Correction, 2026-09-18: the '3 days for the first payout' figure this note originally also modeled as minDaysAfterPassForPayout=3 turned out not to be an independent rule -- two current, live-fetched articles ('What is Payout On Demand?', 'Everything about Payouts') both state explicitly that 3 days is only the fastest the 35% Best Day Rule's own math can work out, not a separately enforced minimum. Removed; the existing fundedConsistency rule (35% Best Day) already produces the same effective 3-day floor on its own, so no separate day-count field is needed.",
        "E8 Zero's Challenge-stage EOD Dynamic Drawdown does not lock, only its Performance-stage drawdown does, per the plan's own dedicated article, read directly: \"In challange stage of E8 Zero, the Eod Drawdown scales with your profit, no matter what amount you make. Meaning that the loss level is not being locked at the initial balance and can go further.\" Previously modeled with a single shared `drawdown` field carrying the lock config, which Plan.ts's `fundedDrawdown = init.fundedDrawdown ?? init.drawdown` fallback then silently applied to the eval/Challenge phase too, incorrectly locking Zero's Challenge-stage floor at breakeven once profit reached the drawdown amount. Fixed 2026-09-18 by splitting into two EodTrailingDrawdown instances: `drawdown` (Challenge, no lock) and `fundedDrawdown` (Performance, same lock config as before). LadderSearch.ts's eval-phase pass-rate search takes its drawdown from plan.drawdownFor(TradingPhase.Eval), so it also uses the unlocked Challenge drawdown.",
        "Signature's minPayoutRequest is dollars(125). The 'E8 Signature Futures' article (11864618, updated 2026-09-08, page pasted by the user 2026-09-23) states: 'Minimum payout is $100. Amounts are taken from your net profit. Meaning, with 80% payout, you need to request at least $125.' The engine compares minPayoutRequest against the gross amount debited from the account, so the $100 net minimum is modeled as $100 / 0.8 = $125 gross. It was dollars(0.01) before 2026-09-18, never confirmed against a source.",
        "E8's live futures-specific inactivity-rule article (helpfutures.e8markets.com/en/articles/10253631-inactivity-rule) states accounts are closed after 7 consecutive days without a placed-and-closed trade, with no split by account stage or market type; a separate, differently-numbered article on the general E8 Markets help domain covers an unrelated 90-day rule that does not apply to Futures accounts. This was previously unmodeled (maxConsecutiveIdleDays was left unset); now set to 7, matching the mechanism MyFundedFutures already models the same way.",
        'No live-account program exists -- the account model terminates at a simulated, payout-eligible stage.',
        "E8 Zero's funded contract limits (minis and micros) now set tierBasis: TierBasis.SessionOpenProfit: helpfutures.e8markets.com's dedicated 'Max Available Contract Sizes' article states the tier 'scales automatically at the start of each new trading day,' not continuously as simulated profit moves intraday. Previously the shared engine recomputed this tier on every trade within a day (a real bug this session found and fixed generally via ContractLimits.ts's new tierBasis setting, the same TierBasis setting Tiered daily-loss-limit configs carry, chosen per config rather than shared: these contract tiers use TierBasis.SessionOpenProfit, while Tradeify's scaling daily loss limit uses TierBasis.PeakIntradayProfit); a losing or winning streak within a single session could never have moved E8 Zero's contract cap mid-session in reality, but previously could in this simulator. Open question (N-40, blocked on a firm source): the same article says the Performance-stage tiers grow 'based on locked profit at the end of the day. Secure 1.5% profit, and you unlock Scaling Trigger 1 the next day. Secure 3%, and you unlock Scaling Trigger 2,' and e8futures.com/e8-zero (fetched 2026-09-23) only labels them 'Half of drawdown reached in profit' and 'Full drawdown reached in profit'. Neither says whether a tier, once unlocked, is kept after a losing day (Tradeify's article, by contrast, says its triggers are cumulative), so the tiers stay on TierBasis.SessionOpenProfit, which re-derives the tier from the prior session's closing profit and can step back down. Switching to TierBasis.PeakSessionCloseProfit waits for a source that settles it.",
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
    const minis = contractsWithinMargin(
        size.marginAllowance,
        MINI_CONTRACT_MARGIN,
    );
    const micros = contractsWithinMargin(
        size.marginAllowance,
        MICRO_CONTRACT_MARGIN,
    );
    return {
        accountSize: size.accountSize,
        consistency: null,
        contractLimits: {
            evalMicros: micros,
            evalMinis: minis,
            fundedMicros: {
                kind: ContractLimitKind.Flat,
                maxContracts: micros,
            },
            fundedMinis: {
                kind: ContractLimitKind.Flat,
                maxContracts: minis,
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
            oneTimeEval: dollars(170),
            reset: dollars(170),
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
        minDaysAfterPassForPayoutPerCycle: 5,
        minPayoutProfit: dollars(2000),
        minPayoutRequest: dollars(125),
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
        contractLimits: ZERO_CONTRACT_LIMITS,
        drawdown: new EodTrailingDrawdown({ amount: ZERO_DRAWDOWN }),
        evalDailyLossLimit: { kind: DailyLossLimitKind.None },
        fees: {
            activation: dollars(0),
            monthlySubscription: dollars(0),
            oneTimeEval: shareConfig.listEvalFee,
            reset: shareConfig.listEvalFee,
        },
        fundedDailyLossLimit: { kind: DailyLossLimitKind.None },
        fundedDrawdown: new EodTrailingDrawdown({
            amount: ZERO_DRAWDOWN,
            lock: {
                atProfit: ZERO_DRAWDOWN,
                lockedThreshold: lockThresholdAt(0),
            },
        }),
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
