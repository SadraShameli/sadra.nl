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
            evalMicros: contracts(5),
            evalMinis: contracts(5),
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
        "Pro's contract limit is a genuinely unresolved two-source conflict, disclosed rather than silently picked: myfundedfutures.com/plans/pro's own rendered page states 'Max Contracts (Mini / Micro): 5 / 5' for the $50K tier in two independent locations (the size-selector summary AND the separate full-rules table, which shows all three sizes side by side with no toggle dependency), marketed explicitly as a feature ('5 minis from day one... no build-up required'). A rigorously-scripted extraction of propfirmmatch.com's own per-row detail panels (not its summary widget -- opened via dispatched click, read from the DOM) instead shows eval 3 mini/30 micro scaling up to funded 5 mini/50 micro, the same as this file modeled before today. Sided with MFF's own page since it was confirmed two ways on the same page with no toggle involved, and the 'no build-up required' marketing copy would be a direct falsehood about MFF's own product if the aggregator's scaling figure were current -- but flagging this plainly since propfirmmatch's method here was genuinely more rigorous than anything else this file's other 2026-09-14 corrections relied on, and its data could instead mean MFF's page reflects a recent redesign the aggregator hasn't caught up to yet.",
        "Rapid EOD's funded contract limit is flat 3 mini/30 micro, same as eval -- confirmed by a scripted extraction of propfirmmatch.com's own per-row detail panel ('flat, confirmed via panel (does not scale like Rapid 100K/150K)'), which explicitly checked for and ruled out scaling. A same-day reading of myfundedfutures.com's own rules table had suggested 4 mini/40 micro funded, based on a second 'Max Contracts' row on that page; given that page's confusingly repetitive table structure (multiple rows share identical labels for what turn out to be different sub-tables) and this session's two other same-day misreads of MFF's own page, the panel-based extraction is trusted here instead.",
        "Rapid EOD's eval/reset fee is $209, not $145. myfundedfutures.com/plans/rapid-eod defaults its account-size selector to $25,000 (unlike its Rapid/Pro/Builder sibling pages, which default to $50,000) -- $145 is genuinely the $25,000 tier's own regular price, misread as the $50,000 price because the selected radio button wasn't checked first. Re-verified by explicitly clicking the $50,000 radio (price updated live to 'One-time fee $105, Based on current promotions $209') and independently confirmed by a scripted, panel-based extraction of propfirmmatch.com's own detail panel for the 3-mini/30-micro, 30%-consistency row (Rapid EOD's own unambiguous signature).",
        "Builder's eval/reset fee is $153, not $125. A scripted, panel-based extraction of propfirmmatch.com's own struck-through list-price element (the definitive 'list' vs 'promo' signal, not a guess) confirms $153 list / $76.50 promo for the $50K tier -- matching this file's original, never-actually-wrong value. The $125 seen directly on myfundedfutures.com's own page was very likely read with an optional cost-reducing add-on already toggled on (the same page's own reset-fee field shows an identical '$153.00 | $125.00 with add on' pattern), the same class of silent-toggle-state mistake as the $145 Rapid EOD misread above.",
        "Builder's own daily-loss-limit mechanism may be a percentage of peak balance/equity ('2%' of 'Balance/Equity - Highest at EOD' per a scripted propfirmmatch.com panel extraction), not the flat $1,000 modeled here -- numerically identical at the $50,000 starting balance (2% x $50,000 = $1,000) but structurally different: a percentage-of-peak model would scale the daily loss limit up as the account's peak balance grows, while the flat model modeled here never changes. Not corrected pending a clearer primary-source description of the exact mechanism, since this codebase's existing peak-share DLL kind (PeakProfitShare) is keyed on peak PROFIT, not peak BALANCE/equity, and approximating one as the other risks introducing a different, unverified error.",
        "Two Pro-specific mechanisms confirmed live but not modeled, since neither maps to an existing field without guessing at unconfirmed specifics: a $100,000 lifetime cap on total Sim-Funded payouts (distinct from maxLifetimePayouts, which counts payouts, not dollars), and a one-time early withdrawal of up to 60% of profits available before the buffer is fully cleared (subject to the normal $1,000 minimum request). Also unconfirmed in enough detail to model: Builder's own live plan page confirms a genuine second max-loss-limit configuration exists ('add-on' rows throughout its full-rules table showing $1,500 max loss / $1,600 buffer instead of the modeled $2,000 / $2,100), but not enough detail on its other terms (fee delta, contract limit, whether it changes anything else) to model as a real second variant.",
        "Pro's drawdown lock is modeled as triggering once profit reaches the $2,100 buffer (the standard profit-threshold lock every other EOD-trailing plan in this codebase uses), whereas help.myfundedfutures.com states the lock specifically triggers 'after your first payout'. Since a payout cannot be requested before the same $2,100 buffer clears, the two triggers coincide in the ordinary case; they would only diverge if a trader reached $2,100 profit without immediately requesting a payout, which this profit-threshold approximation does not distinguish.",
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
        minDaysAfterPassForPayout: 10,
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
