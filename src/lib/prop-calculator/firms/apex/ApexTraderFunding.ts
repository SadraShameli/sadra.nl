import {
    ApexVariant,
    ConsistencyRule,
    ConsistencyScope,
    type ContractLimitConfig,
    ContractLimitKind,
    contracts,
    type DailyLossLimitConfig,
    DailyLossLimitKind,
    dollars,
    EodTrailingDrawdown,
    FirmId,
    fraction,
    IntradayTrailingDrawdown,
    PayoutBuffer,
    type PlanInit,
    RetryKind,
    sessionDaysForCalendarDays,
    TierBasis,
    TradingFirm,
} from '~/lib/prop-calculator/core';

import { lockThresholdAt, planLabel } from '../shared';

const LOCK_OFFSET = 100;
const PA_LEVEL_TIER_BASIS = TierBasis.SessionOpenProfit;

const SIZES = [
    {
        accountSize: dollars(50_000),
        contractLimits: {
            evalMicros: contracts(60),
            evalMinis: contracts(6),
        },
        eod: {
            activation: 90,
            evalCost: 590,
            minQualifyingDayProfit: dollars(250),
            payoutLadderSteps: [1500, 1500, 2000, 2500, 2500, 3000],
        },
        evalDailyLossLimit: dollars(1000),
        fundedDllTiers: [
            {
                dailyLossLimit: dollars(1000),
                maxContracts: contracts(2),
                minProfit: dollars(0),
            },
            {
                dailyLossLimit: dollars(1000),
                maxContracts: contracts(3),
                minProfit: dollars(1500),
            },
            {
                dailyLossLimit: dollars(2000),
                maxContracts: contracts(4),
                minProfit: dollars(3000),
            },
            {
                dailyLossLimit: dollars(3000),
                maxContracts: contracts(4),
                minProfit: dollars(6000),
            },
        ],
        intraday: {
            activation: 59,
            evalCost: 249,
            minQualifyingDayProfit: dollars(200),
            payoutLadderSteps: [1500, 2000, 2500, 2500, 3000, 3000],
        },
        maxDrawdown: dollars(2000),
        profitTarget: dollars(3000),
    },
] as const;

const MIN_REQUEST_AMOUNT = 500;
const MAX_LIFETIME_PAYOUTS = 6;
const EVAL_ACCESS_CALENDAR_DAYS = 30;
const MAX_EVAL_TRADING_DAYS = sessionDaysForCalendarDays(
    EVAL_ACCESS_CALENDAR_DAYS,
);
const INACTIVITY_CLOSURE_DAYS = 30;

type ApexSize = (typeof SIZES)[number];

export class ApexTraderFunding extends TradingFirm {
    readonly displayName = 'Apex Trader Funding';
    readonly id = FirmId.Apex;
    readonly notes = [
        "minPayoutRequest is set explicitly to match this plan's own payoutLadder.minRequestAmount ($500). Left unset, it would silently inherit minPayoutProfit's unrelated $2,600 buffer-zone value instead, which the CLI displays as the minimum request even though the ladder already governs the actual withdrawal floor at runtime, the same fallback-chain bug shape confirmed and fixed for Take Profit Trader.",
        "No recurring per-cycle profit requirement distinct from the 5-qualifying-day ($250/day EOD, $200/day Intraday) and 50% consistency checks was found in Apex's help center, so minPayoutProfitPerCycle is left unset rather than guessed; it defaults to $0 (both of those other gates are already enforced separately by this engine).",
        "support.apextraderfunding.com's 'Inactivity Policy on Performance Accounts (PA)' (checked via search, apextraderfunding.com's own primary help-center pages return HTTP 403 to automated fetch; this repo's own re-audited eod.md doc tree has since cited this identical article directly at apextraderfunding.com/help-center/billing/inactivity-policy-on-performance-accounts-pa, fetched 2026-09-19 as a logged-in browser dump -- not via search, not 403-blocked, and not on the support subdomain) states funded PA accounts on both EOD and Intraday plans are closed after failing to record at least 2 trading days with $50+ net profit within any rolling 30 calendar days (dormant at day 15, second notice at day 20, permanent closure at day 30; evaluation accounts are explicitly exempt). Previously unmodeled (maxConsecutiveIdleDays was left unset). Set to 30 for both funded plans, matching the mechanism used for MFFU/E8/FundedNext/TopStep/Lucid. Two known approximations, same shape as TopStep's: (a) this engine's field resets on ANY traded day regardless of profitability, while Apex's real rule specifically requires profitable ($50+) days, so it understates closure risk for an actively-trading-but-unprofitable account; (b) the field is Plan-wide with no eval/funded split, so it nominally also applies during the simulated eval phase, which has no such rule in reality -- inert there at the default idleDayProbability of 0.",
        "apextraderfunding.com/help-center/eod-trailing-drawdown-accounts/eod-drawdown-explained/ and .../intraday-trailing-drawdown-accounts/intraday-trailing-drawdown-explained/ (live-confirmed via search plus an independent third-party quote, primary pages blocked by HTTP 403) describe platform-dependent eval-phase drawdown behavior: on Rithmic and Wealthcharts, the EOD/Intraday trailing threshold stops trailing and freezes at the Target Profit Balance (accountSize + profitTarget = $53,000 for this $50K plan) once the highest balance reaches Target Profit Balance + Max Drawdown ($55,000); on Tradovate it trails indefinitely with no lock. Both eval drawdowns here were previously configured with no lock at all (an unconditional never-locks model), which silently modeled only the Tradovate case. Now locked per the Rithmic/Wealthcharts rule via evalLockOf(); the engine has no per-platform axis, so Tradovate's genuinely-unlocked eval variant is not separately modeled -- this is a deliberate, disclosed simplification, not an oversight.",
        "apextraderfunding.com's Scaling Levels (PA) / Daily Loss Limit help-center articles (live-confirmed via search, primary pages blocked by HTTP 403) state PA position size and Daily Loss Limit are assigned together from the same profit-tiered Level system (Level 1-4), not granted at full size from day one. fundedMinis/fundedMicros were previously ContractLimitKind.Flat (constant 4/40 regardless of funded profit); switched to Tiered, derived directly from the same fundedDllTiers breakpoints ($0/$1,500/$3,000/$6,000 profit -> 2/3/4/4 minis) already modeled here for the Daily Loss Limit, since Apex's own help center confirms both are tied to the identical Level system (micros scaled x10, matching this plan's existing eval 60/6 and prior flat 40/4 ratio).",
        "The SAVENOW coupon (up to 90% off; the site banner reads 'Any Size Evals up to 90% Off') is a typed code, so decision T4 keeps it out of the modeled fees; model it with --eval-discount. The homepage product picker's promoData (window.productPickerConfig, dateModified 2026-08-25, user-pasted 2026-09-23) lists 'COUPON \"SAVENOW\"' as active until 2026-09-27 23:59 with first_month_code 90 and recurring_code 50 under both its EndOfDay and RealTime entries, which by their names are the current EOD and Intraday trailing evals, plus a Legacy entry (90 and 80). The earlier reading that SAVENOW applied only to the revived Legacy subscription line is superseded. Per the coupon page's terms it is excluded from resets and PA activation fees, so leave --activation-discount at 0 for it.",
        "Apex 50K fees are the no-code checkout price (decision T4), read from the homepage product picker (window.productPickerConfig, dateModified 2026-08-25, user-pasted 2026-09-23 because apextraderfunding.com returns HTTP 403 to automated fetch): EOD $590 eval and $90 PA activation (products 3002/4002/5002, price 590, pa_features.price 90), Intraday $249 eval and $59 PA activation (3018/4018/5018). The earlier $550 eval and $139 activation for EOD were stale. The March 1, 2026 fee model is one-time, with no subscription and no reset: 'Evaluation Plan Fees and Access Explained' (dateModified 2026-06-25) says 'There are no reset fees. If an Evaluation fails, the only way to continue is by purchasing a new one.' So monthlySubscription is $0 and a failed eval is a re-buy at the eval price (reset = oneTimeEval), which follows the eval price when it changes. The picker's products also carry a reset_fee of 65, which contradicts that article and is not modeled.",
        'The 5-Pack Evaluation Bundle prices from the same product picker (dateModified 2026-08-25): EOD 25K $2,250, 50K $2,450, 100K $4,950, 150K $9,950; Intraday 25K $749.50, 50K $950, 100K $3,450, 150K $4,950; No Activation Fee EOD 25K $4,450, 50K $5,450. At 50K that is $490 per EOD eval against $590 single and $190 per Intraday eval against $249 single. The 5-Pack is not modeled: every simulated purchase is charged the single-account price.',
        "ApexLive.ts's withdrawableAmount (via core/LivePlan.ts) previously computed the post-lock payout floor as balance minus the drawdown lock's own lockedThreshold (start + $100), understating the real floor by $3,000: this repo's own re-audited live.md doc tree confirms twice verbatim that payout-eligible profit is balance minus the $3,100 Buffer Requirement/Safety Net, a distinct concept from the $100 drawdown-lock floor. Corrected by adding a `payoutFloor` field to LivePlanInit/LivePlan (defaulting to null, i.e. falling back to the old lockedThreshold-based behavior for every other live firm, none of which have a confirmed distinct payout floor), and setting ApexLive.ts's payoutFloor to dollars(DRAWDOWN_AMOUNT + LOCK_OFFSET) (=$3,100).",
        "PA Levels (the funded Daily Loss Limit and the funded mini/micro contract caps, one shared Level system) are resolved from the prior full session's closing balance via TierBasis.SessionOpenProfit, for both the EOD and the Intraday PA. Apex's 'Scaling Levels (PA) Explained' article (dateModified 2026-04-16, user-pasted 2026-09-23 because apextraderfunding.com returns HTTP 403 to automated fetch) states: 'Tier Levels are updated once per trading day before the trading session begins, and are based on your ending account balance at market close (4:59:59 PM ET) of the prior full trading session', 'Tier Levels never change during the trading session' and 'Tier Down: If your ending account balance falls below a tier threshold, your account moves down to the appropriate lower Tier Level for the next session'. Its FAQ applies the same daily assignment to 'your PA (EOD & Intraday Trailing)', and 'Daily Loss Limit Explained' says the PA DLL is 'Fixed for the entire session (does not trail or adjust intraday)'. Previously the DLL tier (both variants) and the Intraday contract tier recomputed on live intraday profit, so an intraday gain across $3,000 raised the DLL mid-session and an intraday loss from a $2,000-Level open cut it to $1,000. The Level is the prior close, not a peak, so it drops after a losing close and re-derives from the post-payout close. The funded DP behind `optimize dp` (FundedStateValue.ts) enforces the PA Level DLL the same way: it solves every funded day per day-start cushion, resolves the Level from that session-open profit, caps each trade at the DLL headroom left today and locks the day out once today's loss reaches the limit, and it resolves the contract tiers from the same day-start profit. The Monte Carlo simulator applies both halves of the rule exactly.",
        "Apex Live Levels (ApexLive.ts), from the pasted 'Live Prop Trading Program FAQ' (dateModified 2026-06-30, user-pasted 2026-09-23): Level 1 from $0 profit, 10 mini / 100 micro, no DLL; Level 2 from $10,000, 25 mini / 250 micro, $5,000 DLL; Level 3 from $25,000, 30 mini / 300 micro, $10,000 DLL. The Level is set from the prior close via TierBasis.SessionOpenProfit ('This updates at the end of each trading day'), so it never changes intraday and a payout that takes the close below a threshold drops the next session to the lower Level. Level 4 ($50,000+) is 'Custom review', where the trader 'may continue under Level 3', so it stays on Level 3 limits. 'The minimum live payout request amount is $500.' is enforced through LivePlan's minPayoutRequest, so smaller withdrawals above the $3,100 safety net wait until $500 is available. Per decision T25, two rules are not modeled, which understates live payouts: the Bonus Vault (a monthly 20% bonus on live withdrawals, 40% in the first month, drawn from simulated PA balances outside the live simulation) and the exception that pays safety-net amounts after 90 days of live trading, which only applies at account closure.",
    ];
    readonly plans = SIZES.flatMap((s) => [
        this.buildPlan(buildEodPlan(s)),
        this.buildPlan(buildIntradayPlan(s)),
    ]);
    readonly website = 'https://apextraderfunding.com';
}

const MAX_FUNDED_ACCOUNTS = 20;

function buildEodPlan(size: ApexSize): PlanInit {
    const pricing = size.eod;
    return {
        accountSize: size.accountSize,
        consistency: new ConsistencyRule(
            ConsistencyScope.Funded,
            fraction(0.5),
        ),
        contractLimits: {
            ...size.contractLimits,
            ...fundedContractLimitsOf(size, PA_LEVEL_TIER_BASIS),
        },
        drawdown: new EodTrailingDrawdown({
            amount: size.maxDrawdown,
            lock: evalLockOf(size),
        }),
        evalDailyLossLimit: {
            amount: size.evalDailyLossLimit,
            kind: DailyLossLimitKind.Flat,
        },
        fees: {
            activation: dollars(pricing.activation),
            monthlySubscription: dollars(0),
            oneTimeEval: dollars(pricing.evalCost),
            reset: dollars(pricing.evalCost),
            retry: RetryKind.Rebuy,
        },
        fundedDailyLossLimit: fundedDailyLossLimitOf(size, PA_LEVEL_TIER_BASIS),
        fundedDrawdown: new EodTrailingDrawdown({
            amount: size.maxDrawdown,
            lock: lockOf(size),
        }),
        id: {
            accountSize: 50_000,
            firm: FirmId.Apex,
            variant: ApexVariant.Eod,
        },
        label: planLabel(size.accountSize, 'EOD trailing'),
        maxConsecutiveIdleDays: INACTIVITY_CLOSURE_DAYS,
        maxEvalTradingDays: MAX_EVAL_TRADING_DAYS,
        maxFundedAccounts: MAX_FUNDED_ACCOUNTS,
        maxLifetimePayouts: MAX_LIFETIME_PAYOUTS,
        minDaysAfterPassForPayout: 5,
        minPayoutProfit: dollars(size.maxDrawdown + 600),
        minPayoutRequest: dollars(MIN_REQUEST_AMOUNT),
        minQualifyingDayProfit: pricing.minQualifyingDayProfit,
        minTradingDays: 0,
        payoutBuffer: new PayoutBuffer(dollars(LOCK_OFFSET)),
        payoutLadder: {
            deniesIfUnaffordable: true,
            minRequestAmount: dollars(MIN_REQUEST_AMOUNT),
            steps: pricing.payoutLadderSteps,
        },
        payoutTiers: [
            { thresholdProfit: dollars(0), traderShare: fraction(1) },
        ],
        profitTarget: size.profitTarget,
    };
}

function buildIntradayPlan(size: ApexSize): PlanInit {
    const pricing = size.intraday;
    return {
        accountSize: size.accountSize,
        consistency: new ConsistencyRule(
            ConsistencyScope.Funded,
            fraction(0.5),
        ),
        contractLimits: {
            ...size.contractLimits,
            ...fundedContractLimitsOf(size, PA_LEVEL_TIER_BASIS),
        },
        drawdown: new IntradayTrailingDrawdown({
            amount: size.maxDrawdown,
            lock: evalLockOf(size),
        }),
        evalDailyLossLimit: { kind: DailyLossLimitKind.None },
        fees: {
            activation: dollars(pricing.activation),
            monthlySubscription: dollars(0),
            oneTimeEval: dollars(pricing.evalCost),
            reset: dollars(pricing.evalCost),
            retry: RetryKind.Rebuy,
        },
        fundedDailyLossLimit: fundedDailyLossLimitOf(size, PA_LEVEL_TIER_BASIS),
        fundedDrawdown: new IntradayTrailingDrawdown({
            amount: size.maxDrawdown,
            lock: lockOf(size),
        }),
        id: {
            accountSize: 50_000,
            firm: FirmId.Apex,
            variant: ApexVariant.Intraday,
        },
        label: planLabel(size.accountSize, 'Intraday trailing'),
        maxConsecutiveIdleDays: INACTIVITY_CLOSURE_DAYS,
        maxEvalTradingDays: MAX_EVAL_TRADING_DAYS,
        maxFundedAccounts: MAX_FUNDED_ACCOUNTS,
        maxLifetimePayouts: MAX_LIFETIME_PAYOUTS,
        minDaysAfterPassForPayout: 5,
        minPayoutProfit: dollars(size.maxDrawdown + 600),
        minPayoutRequest: dollars(MIN_REQUEST_AMOUNT),
        minQualifyingDayProfit: pricing.minQualifyingDayProfit,
        minTradingDays: 0,
        payoutBuffer: new PayoutBuffer(dollars(LOCK_OFFSET)),
        payoutLadder: {
            deniesIfUnaffordable: true,
            minRequestAmount: dollars(MIN_REQUEST_AMOUNT),
            steps: pricing.payoutLadderSteps,
        },
        payoutTiers: [
            { thresholdProfit: dollars(0), traderShare: fraction(1) },
        ],
        profitTarget: size.profitTarget,
    };
}

function evalLockOf(size: ApexSize) {
    return {
        atProfit: dollars(size.profitTarget + size.maxDrawdown),
        lockedThreshold: lockThresholdAt(size.profitTarget),
    };
}

function fundedContractLimitsOf(
    size: ApexSize,
    tierBasis: TierBasis,
): {
    fundedMicros: ContractLimitConfig;
    fundedMinis: ContractLimitConfig;
} {
    return {
        fundedMicros: {
            kind: ContractLimitKind.Tiered,
            tierBasis,
            tiers: size.fundedDllTiers.map((tier) => ({
                maxContracts: contracts(tier.maxContracts * 10),
                minBalance: dollars(tier.minProfit),
            })),
        },
        fundedMinis: {
            kind: ContractLimitKind.Tiered,
            tierBasis,
            tiers: size.fundedDllTiers.map((tier) => ({
                maxContracts: tier.maxContracts,
                minBalance: dollars(tier.minProfit),
            })),
        },
    };
}

function fundedDailyLossLimitOf(
    size: ApexSize,
    tierBasis: TierBasis,
): DailyLossLimitConfig {
    return {
        kind: DailyLossLimitKind.Tiered,
        tierBasis,
        tiers: size.fundedDllTiers,
    };
}

function lockOf(size: ApexSize) {
    return {
        atProfit: dollars(size.maxDrawdown + LOCK_OFFSET),
        lockedThreshold: lockThresholdAt(LOCK_OFFSET),
    };
}
