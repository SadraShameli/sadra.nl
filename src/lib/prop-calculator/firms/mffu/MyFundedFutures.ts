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
    PayoutDayGateBasis,
    PayoutFloorEffect,
    type PlanInit,
    RetryKind,
    TradingFirm,
} from '~/lib/prop-calculator/core';

import { lockThresholdAt, planLabel } from '../shared';

const BUILDER_EVAL_FEE = dollars(153);
const LOCK_OFFSET = 100;
const PRO_PAYOUT_CALENDAR_DAYS = 14;
const PRO_ONE_TIME_EARLY_WITHDRAWAL = {
    maxProfitShare: fraction(0.6),
    minRequest: dollars(1000),
};

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
            evalMicros: contracts(30),
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
        "Pro's contract limit conflict (flagged in an earlier pass as genuinely unresolved) was reading MFF's own raw page data directly instead of its rendered summary widgets: myfundedfutures.com/plans/pro's embedded Next.js JSON gives maxPositionSize:3 (eval) vs maxPositionSizeFunded:5 (funded) for the $50K Pro tier -- and the same 3-vs-5 split repeats at every tier (100K: 6 vs 10, 150K: 9 vs 15). The rendered 'EVALUATION RULES' table has no Max Contracts row at all; the only visible '5 / 5' row lives exclusively in the separate 'SIM-FUNDED' table, and the marketing line ('5 minis from day one... no build-up required') explicitly self-scopes to funded ('the moment you're funded'), not eval. This was read as a 1:1 mini/micro convention specific to Pro (evalMicros=3, not 30), unlike Rapid/RapidEod/Builder's 10:1 ratio. This repo's own re-audited pro.md doc tree has since directly confirmed the eval Max Contracts figure at the $50K tier is '3 mini / 30 micro' -- the standard 10:1 ratio, not a Pro-specific 1:1 exception; the JSON field's plain '3' was a mini-only figure, not a combined mini/micro count. Corrected: evalMicros set to 30 (evalMinis unchanged at 3); fundedMicros/fundedMinis unchanged at flat 5.",
        "Rapid EOD's funded contract limit is flat 3 mini/30 micro, same as eval -- confirmed by a scripted extraction of propfirmmatch.com's own per-row detail panel ('flat, confirmed via panel (does not scale like Rapid 100K/150K)'), which explicitly checked for and ruled out scaling. A same-day reading of myfundedfutures.com's own rules table had suggested 4 mini/40 micro funded, based on a second 'Max Contracts' row on that page; given that page's confusingly repetitive table structure (multiple rows share identical labels for what turn out to be different sub-tables) and this session's two other same-day misreads of MFF's own page, the panel-based extraction is trusted here instead.",
        "Rapid EOD's eval/reset fee is $209, not $145. myfundedfutures.com/plans/rapid-eod defaults its account-size selector to $25,000 (unlike its Rapid/Pro/Builder sibling pages, which default to $50,000) -- $145 is genuinely the $25,000 tier's own regular price, misread as the $50,000 price because the selected radio button wasn't checked first. Re-verified by explicitly clicking the $50,000 radio (price updated live to 'One-time fee $105, Based on current promotions $209') and independently confirmed by a scripted, panel-based extraction of propfirmmatch.com's own detail panel for the 3-mini/30-micro, 30%-consistency row (Rapid EOD's own unambiguous signature).",
        "Builder's eval/reset fee is $153, not $125. A scripted, panel-based extraction of propfirmmatch.com's own struck-through list-price element (the definitive 'list' vs 'promo' signal, not a guess) confirms $153 list / $76.50 promo for the $50K tier -- matching this file's original, never-actually-wrong value. The $125 seen directly on myfundedfutures.com's own page was very likely read with an optional cost-reducing add-on already toggled on (the same page's own reset-fee field shows an identical '$153.00 | $125.00 with add on' pattern), the same class of silent-toggle-state mistake as the $145 Rapid EOD misread above.",
        "Builder's own daily-loss-limit mechanism may be a percentage of peak balance/equity ('2%' of 'Balance/Equity - Highest at EOD' per a scripted propfirmmatch.com panel extraction), not the flat $1,000 modeled here -- numerically identical at the $50,000 starting balance (2% x $50,000 = $1,000) but structurally different: a percentage-of-peak model would scale the daily loss limit up as the account's peak balance grows, while the flat model modeled here never changes. Not corrected pending a clearer primary-source description of the exact mechanism, since this codebase's existing peak-share DLL kind (PeakProfitShare) is keyed on peak PROFIT, not peak BALANCE/equity, and approximating one as the other risks introducing a different, unverified error.",
        "Pro's payout day gate is 14 calendar days from the first trade on the sim funded account, and it recurs after each payout (N-7). myfundedfutures.com/plans/pro's own embedded JSON gives initialWithdrawalDays:14 for every tier (50K/100K/150K) and its rendered rules table says '14 days from first trade + buffer cleared'; the same page's FAQ (fetched 2026-09-23) says 'The 14-day window runs from your first trade on the sim funded account.' and 'the practical unlock is whichever comes later: 14 calendar days or buffer cleared'. Help article 11802674 says '14 calendar days from day of first trade.' and 13745661 says 'Request a payout every 14 calendar days from your first trade'. Modeled as PayoutDayGateBasis.CalendarDaysSinceFirstTradeOrPayout with minDaysAfterPassForPayout 14: the engine counts 10 sessions (5 trading sessions per 7 calendar days) from the first funded session with a trade, idle sessions included because the calendar keeps running, and restarts the count at each payout. The engine used to count 14 qualifying days after the pass, which was stricter. Reading 'every 14 calendar days' as 14 days after the previous payout, rather than a fixed 14-day cadence from the first trade, is an assumption; the two readings agree whenever each payout is taken on its first eligible day.",
        "Pro's $100,000 lifetime cap on total Sim-Funded payouts, previously flagged as confirmed-but-unmodeled (no field existed for a dollar-denominated lifetime cap, distinct from the count-based maxLifetimePayouts), is now modeled via the new Plan.maxLifetimePayoutDollars field, wired into FundedCycleTracker.tryPayout (a payout is refused once cumulative trader-received payout -- post profit-split, not the gross account debit -- reaches the cap) and Plan.isAccountConcluded (the funded horizon concludes, the same best-case-stop semantics as ladder exhaustion, once the cap is hit). Directly re-confirmed 2026-09-18 via MFFU's own 'Pro Plan Sim-Funded and Live Account Highlights' article (help.myfundedfutures.com, dated June 30, 2026): 'Maximum Payout (per user): $100,000' -- identical across all three sizes (50K/100K/150K). Modeled as a hard stop on further sim-funded extraction, not the full real mechanic: the same article describes profits beyond $100,000 being partially carried into a forced live-account transition (capped at $5,000/$7,500/$10,000 by size) with any remainder explicitly forfeited ('Remaining profits are forfeited') -- that live-transition-and-forfeiture step is deliberately out of scope here, matching this codebase's established architecture of keeping the live phase a separate, standalone module (Part M) rather than a continuation of the sim-funded trial; the engine's approximation (payouts simply stop at the cap) understates the true payout by whatever fraction of the excess would have been salvaged via the live transfer, and does not model the live phase's own subsequent economics at all. Pro's one-time withdrawal of up to 60% of profits before the buffer clears is modeled as an opt-in that is off by default: see the N-51 note on Pro in-buffer withdrawal. Two live-transition triggers were also newly confirmed by this same article (3 consecutive payouts, OR excess profit above the $100,000 cap) and a discretionary risk-team-initiated transition 'at any point' -- both are live-phase concerns, not sim-funded ones, and are not modeled here for the same reason. Builder's own live plan page confirms a genuine second max-loss-limit configuration exists ('add-on' rows throughout its full-rules table showing $1,500 max loss / $1,600 buffer instead of the modeled $2,000 / $2,100), but not enough detail on its other terms (fee delta, contract limit, whether it changes anything else) to model as a real second variant -- still unconfirmed, left as-is.",
        "Pro's Sim Funded drawdown locks on the first payout, not on a profit threshold: help.myfundedfutures.com article 11802674 (live-rechecked 2026-09-23) says 'After first payout, MLL moves to $50,100 and remains static' ($100,100 and $150,100 for the larger tiers). Modeled as a separate fundedDrawdown whose lock has no profit trigger (atProfit null) plus payoutFloorEffect MoveToLockedFloor: the first payout sets the MLL to exactly start + $100 and locks it, even when the MLL had trailed above that level (the literal 'moves to' reading), and the payout may take the balance down to start + $100 plus the $2,000 retained cushion, which is the documented $2,100 buffer. Before the first payout the funded MLL keeps trailing at end of day at the $2,000 distance, confirmed by the Pro plan page FAQ (myfundedfutures.com/plans/pro, fetched 2026-09-23): 'Pro uses end-of-day trailing drawdown in both eval and sim funded. ... After your first approved payout, the MLL locks permanently at your starting balance plus $100 and stops trailing entirely. Until that first payout, the MLL continues to trail each time you set a new EOD equity high.' Pro's evaluation drawdown stops trailing at start + $100, which is the engine's eval lock at +$2,100 profit: the same page's embedded evaluation config carries its own limit, separate from the funded one (Pro50KOTP \"maxDrawdownLimit\":50100, 100100 at 100K, 150100 at 150K). Rapid, Rapid EOD and Builder keep their doc-confirmed profit-threshold locks at +$2,100 (rapid.md, rapid-eod.md, builder.md), even though each plan's account-provisioning JSON also carries moveMllToLockOnFirstPayout: true: their first payout needs at least $2,100 of profit at a day close, so the profit trigger has always fired by then.",
        "Pro in-buffer withdrawal (N-51): the buffer is the rule and a one-time withdrawal inside it is the exception, both stated by two help articles. Help article 11802674 (dateModified 2026-06-30, fetched 2026-09-23) says the 'trader cannot request first withdrawal until the account balance is above the starting balance plus the buffer amount' ($2,100 at 50K, $3,100 at 100K, $4,600 at 150K) and then 'One-time withdrawal: Allowed before reaching full buffer zone. Up to 60% of profits can be withdrawn, with a minimum of $1,000. Remaining 40% remains for continued trading.' Help article 13745661 (dateModified 2026-08-25, fetched 2026-09-23) says in its Pro section 'Must meet the buffer target before requesting a payout' and 'Withdrawal While in Buffer: You can withdraw up to 60% of your profits before fully clearing the buffer.' The Pro plan page's sentence 'You also need to have cleared the required buffer before a payout can be approved' covers regular payouts. The engine models the exception as the plan's oneTimeEarlyWithdrawal rule, an opt-in (decision T30) that is off by default and turned on with the CLI flag --early-withdrawal. When on, once per account, after the 14-calendar-day gate and while the profit is still under the buffer, it withdraws 60% of the profit (less with --request-size) if that is at least $1,000, and the other 40% stays in the account. It counts as the first approved payout, so the MLL moves to start + $100 and locks, per the plan page ('After your first approved payout, the MLL locks permanently at your starting balance plus $100'); treating the one-time withdrawal as that first approved payout is an assumption, since no source says how it affects the MLL. It leaves only about $567 to $740 above the locked MLL, a thin cushion. The retained-cushion setting does not apply to it, since the firm fixes what stays. optimize dp does not take the opt-in, so it always solves the default rule.",
        "Rapid Live (modeled in MffuRapidLive.ts, Part M4's background research task w3y0y0n26): help.myfundedfutures.com's 'Understanding Rapid Live' article confirms all tiers start at $0 balance, with an EOD-calculated Max Loss Limit that trails up with the EOD balance and 'stops at $0' -- flush to zero with no lock buffer above it, the same shape as TakeProfitTrader's PRO+ (TptLive.ts), not Apex/Tradeify's +$100 buffer. The MLL amount is tiered by account size: $1,000/25K, $2,000/50K, $3,000/100K, $4,500/150K (cross-confirmed against the per-size 'Rapid Plan Xk - A Comprehensive Look' articles for the 25K and 150K endpoints). MffuRapidLive.ts models the 50K tier only ($2,000), matching the single-flat-plan convention already used by ApexLive.ts/TradeifyLive.ts/TptLive.ts/FundedNextLive.ts. Payout is a flat 90/10 split, daily. Every live withdrawal must be at least $250 (minPayoutRequest): MFF's firm-wide live FAQ (help.myfundedfutures.com article 12109396, 'Comprehensive FAQ - Live Accounts', re-fetched 2026-09-23) says 'MyFunded Futures offers transparency, speed, and daily live payouts to all account types. Live traders must ensure that the minimum amount that they can withdraw is $250.' The Rapid Live article (13134718, dateModified 2026-09-08, re-fetched 2026-09-23) states no minimum of its own, so the firm-wide figure applies. Withdrawals are not gated behind the MLL lock ('There is no buffer requirement on the Rapid Live account'): MffuRapidLive.ts sets requiresLockForWithdrawal: false with a $0 payoutFloor, so only positive live balance above the $0 start is withdrawable and a withdrawal never takes the balance below max($0, MLL), while the MLL keeps its own EOD trailing and $0 lock. `prop live` by default retains one full $2,000 drawdown of cushion above that floor (decision D4) and `--request-size all` withdraws down to one cent above it: after the $0 lock the floor is the MLL itself, and a balance exactly on the MLL is a closure in this engine (decision T17), so the engine keeps that cent and rounds every withdrawal down to whole cents. The 50K tier's confirmed 3 mini / 30 micro cap is modeled as LivePlan.contractLimits. The same article confirms live accounts carry no inactivity timer/rule at all ('All our live accounts, no matter what account type you were originally on, have no inactivity timer/rule'), a genuine confirmed difference from every other live firm modeled here, not an unconfirmed gap -- correctly left unmodeled since maxConsecutiveIdleDays already defaults to none. Two mechanics are confirmed but deliberately unmodeled, same v1-scope deferral as Apex's Bonus Vault (M2): a one-time Reserve allocation on transition (up to $5,000 of Sim Funded profit, paid out later as milestone-based 'Performance Bonus' or as breach protection) -- a one-time reserve seed, structurally unlike Apex's recurring vault -- and the fact that multiple Rapid accounts transitioning together are firm-side collapsed into a single Live account with a proportionally combined MLL (mirroring Apex's own PA-collapse trigger), which this codebase's `simulateLiveAccount` entry point already treats as an out-of-scope, pre-collapsed starting condition per M2. MFF's other four live-account tiers (Starter, Starter Plus, Expert, Pro -- distinct live-stage tier names, not the same as the Rapid/RapidEod/Builder/Pro eval-plan `MffuVariant` names above) exist but are NOT modeled: their starting balances are confirmed (partial nominal amounts by size for Starter/Starter Plus, a static non-trailing $140 floor for Expert/Pro) but their profit-split percentages were not found on any primary-source page, so no `<Tier>Live.ts` is built for them -- do not guess a plausible split.",
        'The CLUB coupon code is confirmed live on myfundedfutures.com\'s own coupons page as "50%OFF ... CODE: CLUB ... Lifetime Promo ... Works on: Rapid, Builder, Rapid EOD, Pro."',
        'Separately, and not fully reconciled with the CLUB code\'s 50% figure (a second, independently-sourced fact from the Builder plan\'s own help article, not guessed to be the same mechanism): Builder 50K\'s pricing table shows its own two named tiers next to the base price -- "Discounted Price (30% OFF)" and "Discounted Price (40% OFF - 2 uses only)." Both facts are noted as separately confirmed rather than collapsed into one number.',
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
            oneTimeEval: BUILDER_EVAL_FEE,
            reset: BUILDER_EVAL_FEE,
            retry: RetryKind.Rebuy,
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
        fundedDrawdown: new EodTrailingDrawdown({
            amount: size.maxDrawdown,
            lock: {
                atProfit: null,
                lockedThreshold: lockThresholdAt(LOCK_OFFSET),
            },
        }),
        id: {
            accountSize: 50_000,
            firm: FirmId.Mffu,
            variant: MffuVariant.Pro,
        },
        label: planLabel(size.accountSize, 'Pro'),
        maxConsecutiveIdleDays: 7,
        maxFundedAccounts: 5,
        maxLifetimePayoutDollars: dollars(100_000),
        minDaysAfterPassForPayout: PRO_PAYOUT_CALENDAR_DAYS,
        minPayoutProfit: size.minPayoutProfit,
        minPayoutRequest: dollars(1000),
        minTradingDays: 2,
        oneTimeEarlyWithdrawal: PRO_ONE_TIME_EARLY_WITHDRAWAL,
        payoutDayGateBasis:
            PayoutDayGateBasis.CalendarDaysSinceFirstTradeOrPayout,
        payoutFloorEffect: PayoutFloorEffect.MoveToLockedFloor,
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
