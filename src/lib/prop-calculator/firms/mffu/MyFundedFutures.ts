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
    IntradayTrailingDrawdown,
    MffuVariant,
    type PlanInit,
    TradingFirm,
} from '~/lib/prop-calculator/core';

import { lockThresholdAt, planLabel } from '../shared';

const LOCK_OFFSET = 100;

const RAPID_SIZES = [
    {
        accountSize: dollars(50_000),
        contractLimits: {
            evalMicros: contracts(50),
            evalMinis: contracts(5),
            fundedMicros: {
                kind: ContractLimitKind.Flat,
                maxContracts: contracts(50),
            },
            fundedMinis: {
                kind: ContractLimitKind.Flat,
                maxContracts: contracts(5),
            },
        },
        evalCost: 209,
        maxDrawdown: dollars(2000),
        minPayoutProfit: dollars(2100),
        profitTarget: dollars(3000),
    },
] as const;

const PRO_SIZES = [
    {
        accountSize: dollars(50_000),
        contractLimits: {
            evalMicros: contracts(3),
            evalMinis: contracts(3),
            fundedMicros: {
                kind: ContractLimitKind.Flat,
                maxContracts: contracts(5),
            },
            fundedMinis: {
                kind: ContractLimitKind.Flat,
                maxContracts: contracts(5),
            },
        },
        evalCost: 265,
        maxDrawdown: dollars(2000),
        minPayoutProfit: dollars(2100),
        profitTarget: dollars(3000),
    },
] as const;

type MffuProSize = (typeof PRO_SIZES)[number];
type MffuRapidSize = (typeof RAPID_SIZES)[number];

export class MyFundedFutures extends TradingFirm {
    readonly displayName = 'My Funded Futures';
    readonly id = FirmId.Mffu;
    readonly notes = [
        'Supports NinjaTrader, Tradovate, TradingView, Quantower, Volumetrica, DeepChart/DeepDom, and ATAS across all plans.',
        "Rapid EOD and Builder evaluation and funded accounts close after 7 consecutive calendar days without a single trade -- Rapid EOD's own dedicated help-center article ('Rapid EOD 50k - A Comprehensive Look') and Builder's own live plan page (myfundedfutures.com/plans/builder, 'Inactivity Rule: 7 Calendar Days') both state this explicitly. Live-reconfirmed 2026-09-14 directly on myfundedfutures.com's own rendered pages (not summarized) that Pro's own live plan page also explicitly states it ('the account requires at least one trade every 7 calendar days to stay active'), so Pro now carries the same rule. Rapid's own equivalent dedicated help-center article ('Rapid Plan 50k - A Comprehensive Look') was checked the same way and states no such rule at all, unlike Rapid EOD's identically-structured article which does -- so Rapid remains deliberately exempt. This simulator models the closure when you set an idle-day probability above 0. The Flex plan was discontinued and is no longer modeled.",
        "Builder's minPayoutRequest is set explicitly to match its own payoutLadder.minRequestAmount ($500). Left unset, it would silently inherit minPayoutProfit's unrelated $2,600 buffer-zone value instead, the same fallback-chain bug shape confirmed and fixed for Take Profit Trader.",
        "Pro and Rapid: help.myfundedfutures.com's own plan pages confirm payouts unlock with no recurring per-cycle profit requirement beyond the first-payout buffer gate ($2,100, modeled as minPayoutProfit) and the per-request minimum, so minPayoutProfitPerCycle is left unset for both rather than guessed; it defaults to $0.",
        "Pro's contract limit conflict (flagged in an earlier pass as genuinely unresolved) is now resolved by reading MFF's own raw page data directly instead of its rendered summary widgets: myfundedfutures.com/plans/pro's embedded Next.js JSON gives maxPositionSize:3 (eval) vs maxPositionSizeFunded:5 (funded) for the $50K Pro tier -- and the same 3-vs-5 split repeats at every tier (100K: 6 vs 10, 150K: 9 vs 15). The rendered 'EVALUATION RULES' table has no Max Contracts row at all; the only visible '5 / 5' row lives exclusively in the separate 'SIM-FUNDED' table, and the marketing line ('5 minis from day one... no build-up required') explicitly self-scopes to funded ('the moment you're funded'), not eval. Corrected: evalMicros/evalMinis set to 3 (flat, matching MFF's own 1:1 mini/micro convention for Pro specifically, unlike Rapid/RapidEod/Builder's 10:1 ratio), fundedMicros/fundedMinis unchanged at flat 5. This also resolves the earlier conflict in propfirmmatch's favor on the eval number (3) while rejecting its funded-side scaling claim (flat 5, not scaling to 5/50) -- MFF's own page is unambiguous that funded is a flat cap, not a mini:micro ratio.",
        "Rapid EOD's funded contract limit is flat 3 mini/30 micro, same as eval -- confirmed by a scripted extraction of propfirmmatch.com's own per-row detail panel ('flat, confirmed via panel (does not scale like Rapid 100K/150K)'), which explicitly checked for and ruled out scaling. A same-day reading of myfundedfutures.com's own rules table had suggested 4 mini/40 micro funded, based on a second 'Max Contracts' row on that page; given that page's confusingly repetitive table structure (multiple rows share identical labels for what turn out to be different sub-tables) and this session's two other same-day misreads of MFF's own page, the panel-based extraction is trusted here instead.",
        "Rapid EOD's eval/reset fee is $209, not $145. myfundedfutures.com/plans/rapid-eod defaults its account-size selector to $25,000 (unlike its Rapid/Pro/Builder sibling pages, which default to $50,000) -- $145 is genuinely the $25,000 tier's own regular price, misread as the $50,000 price because the selected radio button wasn't checked first. Re-verified by explicitly clicking the $50,000 radio (price updated live to 'One-time fee $105, Based on current promotions $209') and independently confirmed by a scripted, panel-based extraction of propfirmmatch.com's own detail panel for the 3-mini/30-micro, 30%-consistency row (Rapid EOD's own unambiguous signature).",
        "Builder's eval/reset fee is $153, not $125. A scripted, panel-based extraction of propfirmmatch.com's own struck-through list-price element (the definitive 'list' vs 'promo' signal, not a guess) confirms $153 list / $76.50 promo for the $50K tier -- matching this file's original, never-actually-wrong value. The $125 seen directly on myfundedfutures.com's own page was very likely read with an optional cost-reducing add-on already toggled on (the same page's own reset-fee field shows an identical '$153.00 | $125.00 with add on' pattern), the same class of silent-toggle-state mistake as the $145 Rapid EOD misread above.",
        "Builder's own daily-loss-limit mechanism may be a percentage of peak balance/equity ('2%' of 'Balance/Equity - Highest at EOD' per a scripted propfirmmatch.com panel extraction), not the flat $1,000 modeled here -- numerically identical at the $50,000 starting balance (2% x $50,000 = $1,000) but structurally different: a percentage-of-peak model would scale the daily loss limit up as the account's peak balance grows, while the flat model modeled here never changes. Not corrected pending a clearer primary-source description of the exact mechanism, since this codebase's existing peak-share DLL kind (PeakProfitShare) is keyed on peak PROFIT, not peak BALANCE/equity, and approximating one as the other risks introducing a different, unverified error.",
        "Pro's minDaysAfterPassForPayout was 10; myfundedfutures.com/plans/pro's own embedded JSON gives initialWithdrawalDays:14 for every tier (50K/100K/150K), matching the rendered rules table's 'Payout Timing: 14 days from first trade + buffer cleared' row exactly. Corrected to 14.",
        "Two Pro-specific mechanisms confirmed live but not modeled, since neither maps to an existing field without guessing at unconfirmed specifics: a $100,000 lifetime cap on total Sim-Funded payouts (distinct from maxLifetimePayouts, which counts payouts, not dollars), and a one-time early withdrawal of up to 60% of profits available before the buffer is fully cleared (subject to the normal $1,000 minimum request). Also unconfirmed in enough detail to model: Builder's own live plan page confirms a genuine second max-loss-limit configuration exists ('add-on' rows throughout its full-rules table showing $1,500 max loss / $1,600 buffer instead of the modeled $2,000 / $2,100), but not enough detail on its other terms (fee delta, contract limit, whether it changes anything else) to model as a real second variant.",
        "Every MFF plan's drawdown lock is modeled as triggering once profit reaches its buffer threshold (the standard profit-threshold lock this codebase's EOD/Intraday trailing drawdown classes use), whereas each plan's own live account-provisioning JSON carries a `moveMllToLockOnFirstPayout: true` field -- confirmed present and true for all four plans (Rapid, Rapid EOD, Builder, Pro) at every account-size tier on each plan's own page, not only Pro as an earlier pass here disclosed. Since a payout cannot be requested before the same profit buffer clears, the two triggers coincide in the ordinary case; they would only diverge if a trader reached the buffer profit without immediately requesting a payout, which this profit-threshold approximation does not distinguish. All four plans already share the identical `lock.atProfit: dollars(maxDrawdown + LOCK_OFFSET)` code pattern, so this note broadens the disclosure to match code that was already uniform -- it changes nothing about behavior, only the accuracy of this file's own documentation.",
        "Rapid Live (modeled in MffuRapidLive.ts, Part M4's background research task w3y0y0n26): help.myfundedfutures.com's 'Understanding Rapid Live' article confirms all tiers start at $0 balance, with an EOD-calculated Max Loss Limit that trails up with the EOD balance and 'stops at $0' -- flush to zero with no lock buffer above it, the same shape as TakeProfitTrader's PRO+ (TptLive.ts), not Apex/Tradeify's +$100 buffer. The MLL amount is tiered by account size: $1,000/25K, $2,000/50K, $3,000/100K, $4,500/150K (cross-confirmed against the per-size 'Rapid Plan Xk - A Comprehensive Look' articles for the 25K and 150K endpoints). MffuRapidLive.ts models the 50K tier only ($2,000), matching the single-flat-plan convention already used by ApexLive.ts/TradeifyLive.ts/TptLive.ts/FundedNextLive.ts. Payout is a flat 90/10 split, daily. The same article confirms live accounts carry no inactivity timer/rule at all ('All our live accounts, no matter what account type you were originally on, have no inactivity timer/rule'), a genuine confirmed difference from every other live firm modeled here, not an unconfirmed gap -- correctly left unmodeled since maxConsecutiveIdleDays already defaults to none. Two mechanics are confirmed but deliberately unmodeled, same v1-scope deferral as Apex's Bonus Vault (M2): a one-time Reserve allocation on transition (up to $5,000 of Sim Funded profit, paid out later as milestone-based 'Performance Bonus' or as breach protection) -- a one-time reserve seed, structurally unlike Apex's recurring vault -- and the fact that multiple Rapid accounts transitioning together are firm-side collapsed into a single Live account with a proportionally combined MLL (mirroring Apex's own PA-collapse trigger), which this codebase's `simulateLiveAccount` entry point already treats as an out-of-scope, pre-collapsed starting condition per M2. MFF's other four live-account tiers (Starter, Starter Plus, Expert, Pro -- distinct live-stage tier names, not the same as the Rapid/RapidEod/Builder/Pro eval-plan `MffuVariant` names above) exist but are NOT modeled: their starting balances are confirmed (partial nominal amounts by size for Starter/Starter Plus, a static non-trailing $140 floor for Expert/Pro) but their profit-split percentages were not found on any primary-source page, so no `<Tier>Live.ts` is built for them -- do not guess a plausible split.",
    ];
    readonly plans = [
        ...RAPID_SIZES.map((s) => this.buildPlan(buildRapidPlan(s))),
        this.buildPlan(buildRapidEodPlan()),
        ...PRO_SIZES.map((s) => this.buildPlan(buildProPlan(s))),
        this.buildPlan(buildBuilderPlan()),
    ];
    readonly website = 'https://myfundedfutures.com';
}

function buildBuilderPlan(): PlanInit {
    return {
        accountSize: dollars(50_000),
        consistency: new ConsistencyRule(
            ConsistencyScope.Funded,
            fraction(0.5),
        ),
        contractLimits: {
            evalMicros: contracts(40),
            evalMinis: contracts(4),
            fundedMicros: {
                kind: ContractLimitKind.Flat,
                maxContracts: contracts(40),
            },
            fundedMinis: {
                kind: ContractLimitKind.Flat,
                maxContracts: contracts(4),
            },
        },
        drawdown: new EodTrailingDrawdown({
            amount: dollars(2000),
            lock: {
                atProfit: dollars(2100),
                lockedThreshold: lockThresholdAt(LOCK_OFFSET),
            },
        }),
        evalDailyLossLimit: {
            amount: dollars(1000),
            kind: DailyLossLimitKind.Flat,
        },
        fees: {
            activation: dollars(0),
            monthlySubscription: dollars(0),
            oneTimeEval: dollars(153),
            reset: dollars(0),
        },
        id: {
            accountSize: 50_000,
            firm: FirmId.Mffu,
            variant: MffuVariant.Builder,
        },
        label: planLabel(50_000, 'Builder'),
        maxConsecutiveIdleDays: 7,
        maxFundedAccounts: 1,
        maxLifetimePayouts: 5,
        minDaysAfterPassForPayout: 2,
        minPayoutProfit: dollars(2600),
        minPayoutProfitPerCycle: dollars(500),
        minPayoutRequest: dollars(500),
        minTradingDays: 1,
        payoutLadder: {
            minRequestAmount: dollars(500),
            steps: [2000, 2000, 2000, 2000, 2000],
        },
        payoutTiers: [
            { thresholdProfit: dollars(0), traderShare: fraction(0.8) },
        ],
        profitTarget: dollars(3000),
    };
}

function buildProPlan(size: MffuProSize): PlanInit {
    return {
        accountSize: size.accountSize,
        consistency: new ConsistencyRule(ConsistencyScope.Eval, fraction(0.5)),
        contractLimits: size.contractLimits,
        drawdown: new EodTrailingDrawdown({
            amount: size.maxDrawdown,
            lock: {
                atProfit: dollars(size.maxDrawdown + LOCK_OFFSET),
                lockedThreshold: lockThresholdAt(LOCK_OFFSET),
            },
        }),
        evalDailyLossLimit: { kind: DailyLossLimitKind.None },
        fees: {
            activation: dollars(0),
            monthlySubscription: dollars(0),
            oneTimeEval: dollars(size.evalCost),
            reset: dollars(size.evalCost),
        },
        id: {
            accountSize: 50_000,
            firm: FirmId.Mffu,
            variant: MffuVariant.Pro,
        },
        label: planLabel(size.accountSize, 'Pro'),
        maxConsecutiveIdleDays: 7,
        maxFundedAccounts: 5,
        minDaysAfterPassForPayout: 14,
        minPayoutProfit: size.minPayoutProfit,
        minPayoutRequest: dollars(1000),
        minTradingDays: 2,
        payoutTiers: [
            { thresholdProfit: dollars(0), traderShare: fraction(0.8) },
        ],
        profitTarget: size.profitTarget,
    };
}

function buildRapidEodPlan(): PlanInit {
    const maxDrawdown = dollars(2000);
    return {
        accountSize: dollars(50_000),
        consistency: new ConsistencyRule(ConsistencyScope.Eval, fraction(0.3)),
        contractLimits: {
            evalMicros: contracts(30),
            evalMinis: contracts(3),
            fundedMicros: {
                kind: ContractLimitKind.Flat,
                maxContracts: contracts(30),
            },
            fundedMinis: {
                kind: ContractLimitKind.Flat,
                maxContracts: contracts(3),
            },
        },
        drawdown: new EodTrailingDrawdown({
            amount: maxDrawdown,
            lock: {
                atProfit: dollars(maxDrawdown + LOCK_OFFSET),
                lockedThreshold: lockThresholdAt(LOCK_OFFSET),
            },
        }),
        evalDailyLossLimit: { kind: DailyLossLimitKind.None },
        fees: {
            activation: dollars(0),
            monthlySubscription: dollars(0),
            oneTimeEval: dollars(209),
            reset: dollars(209),
        },
        id: {
            accountSize: 50_000,
            firm: FirmId.Mffu,
            variant: MffuVariant.RapidEod,
        },
        label: planLabel(50_000, 'Rapid EOD'),
        maxConsecutiveIdleDays: 7,
        maxFundedAccounts: 3,
        minDaysAfterPassForPayout: 1,
        minPayoutProfit: dollars(maxDrawdown + 100),
        minPayoutProfitPerCycle: dollars(500),
        minPayoutRequest: dollars(500),
        minTradingDays: 4,
        payoutTiers: [
            { thresholdProfit: dollars(0), traderShare: fraction(0.9) },
        ],
        profitTarget: dollars(3000),
    };
}

function buildRapidPlan(size: MffuRapidSize): PlanInit {
    return {
        accountSize: size.accountSize,
        consistency: new ConsistencyRule(ConsistencyScope.Eval, fraction(0.5)),
        contractLimits: size.contractLimits,
        drawdown: new EodTrailingDrawdown({
            amount: size.maxDrawdown,
            lock: {
                atProfit: dollars(size.maxDrawdown + LOCK_OFFSET),
                lockedThreshold: lockThresholdAt(LOCK_OFFSET),
            },
        }),
        evalDailyLossLimit: { kind: DailyLossLimitKind.None },
        fees: {
            activation: dollars(0),
            monthlySubscription: dollars(0),
            oneTimeEval: dollars(size.evalCost),
            reset: dollars(size.evalCost),
        },
        fundedDrawdown: new IntradayTrailingDrawdown({
            amount: size.maxDrawdown,
            lock: {
                atProfit: dollars(size.maxDrawdown + LOCK_OFFSET),
                lockedThreshold: lockThresholdAt(LOCK_OFFSET),
            },
        }),
        id: {
            accountSize: 50_000,
            firm: FirmId.Mffu,
            variant: MffuVariant.Rapid,
        },
        label: planLabel(size.accountSize, 'Rapid'),
        maxFundedAccounts: 5,
        minDaysAfterPassForPayout: 1,
        minPayoutProfit: size.minPayoutProfit,
        minPayoutRequest: dollars(500),
        minTradingDays: 2,
        payoutTiers: [
            { thresholdProfit: dollars(0), traderShare: fraction(0.9) },
        ],
        profitTarget: size.profitTarget,
    };
}
