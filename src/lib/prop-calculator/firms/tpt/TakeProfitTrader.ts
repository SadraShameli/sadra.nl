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
    type PlanInit,
    TradingFirm,
} from '~/lib/prop-calculator/core';

import { lockThresholdAt, planLabel } from '../shared';

const SIZES = [
    {
        accountSize: dollars(50_000),
        maxDrawdown: dollars(2000),
        monthlySubscription: 170,
        profitTarget: dollars(3000),
    },
] as const;

type TptSize = (typeof SIZES)[number];

export class TakeProfitTrader extends TradingFirm {
    readonly displayName = 'Take Profit Trader';
    readonly id = FirmId.Tpt;
    readonly notes = [
        'No minimum payout request size exists. Any withdrawal amount is allowed; requests of $250 or less carry a flat $50 fee, waived above $250 (help center: "Withdrawal Fees").',
        'A one-time buffer-zone gate applies before the first payout only: balance must reach starting balance + max drawdown (e.g. $52,000 for a $50K account) before any withdrawal is possible (help center: "PRO Account Profit Split & Withdrawal Rules"). This is minPayoutProfit in this codebase, not a recurring per-request minimum.',
        'No recurring per-cycle profit requirement exists beyond that one-time buffer-zone gate: takeprofittrader.com confirms PRO payouts have no minimum-profitable-days requirement for withdrawals after the first, so minPayoutProfitPerCycle is left unset rather than guessed; it defaults to $0.',
        "PRO (funded) accounts require at least one traded day per calendar week (Sunday-Friday), per a scripted propfirmmatch.com panel extraction (2026-09-14) cross-checked against takeprofittrader.com's own Overview tab Firm Rules. Previously unmodeled (maxConsecutiveIdleDays was unset); set to 7, matching the mechanism used elsewhere in this codebase.",
        "Contract limit (6 minis / 60 micros, flat across eval and funded) was previously unmodeled entirely, confirmed by the same 2026-09-14 extraction and independently by takeprofittrader.com's own per-size leverage table.",
        "Normal, ongoing payouts ARE a flat 80% split, gated only by the one-time buffer-zone clearance above (takeprofittrader.com's own Payout Policy: 'In the PRO account, the profit split is 80/20... You can withdraw your profits at 80% once you reach the level of your maximum drawdown'). A separate, narrow, NOT-modeled mechanic exists for 'Withdrawing from the Buffer': profit left unclaimed inside the buffer zone can only be recovered after the PRO account has been terminated, and that one-time recovery is split 50% if the account survived 60 or fewer TRADING days (not calendar days) before its last trading day, 80% if it survived more than 60 -- evaluated once, at termination, against total trading days survived, not an ongoing per-payout schedule. This is a genuinely different mechanic from an everyday withdrawal (point-in-time, termination-only, keyed off leftover buffer profit) and is not modeled by this engine, which has no bust/termination hook for a one-time leftover-profit split; documented here as a confirmed-but-unmodeled fact rather than approximated.",
        "The reset fee modeled here ($99) is TPT's own confirmed EVALUATION-phase reset price, matching exactly what this engine's reset mechanic represents (retrying a busted eval). A separate, much higher $649 FUNDED/PRO account reset option also exists (buy back into the same funded account after a funded-phase bust, up to 3 times, per the Overview tab's 'Pro Account Reset Option') -- not modeled, since this engine's replacement model for a busted funded account is already a fresh eval cycle, not a same-account funded reset; the $649 option is a genuinely different real-world choice this simulator does not currently represent as an alternative.",
        "This firm's own site shows two different minimum-trading-day figures for the same Test-phase requirement: the plan-card detail panel says 3 days (matching minTradingDays here), the Overview tab's own Consistency Rules section separately states 5 days. Quoted as an unreconciled site-internal conflict rather than silently picked; kept at 3 since that is this file's pre-existing, already-tested value and no clearer signal points either way.",
        'PRO+ (the live-capital account, modeled in TptLive.ts): $0 start, EOD trailing drawdown "equivalent to the starting drawdown of the original PRO account" (help center: "PRO+ Account Upgrade Process"), trailing up and locking flush at $0 once that amount is reached -- no +$100 lock buffer, unlike Apex/Tradeify. For the $50K tier modeled here that is $2,000, matching this file\'s own maxDrawdown. 90/10 split (up from PRO\'s 80/20), and no per-request minimum/buffer for withdrawals, confirmed by the same source ("no buffer zone requirement for withdrawal"). The Zendesk help-center pages themselves 403\'d on direct fetch (Cloudflare-gated, no Wayback snapshot available either); this is sourced from the search engine\'s own indexed page text quoting that article, not a live primary-source fetch -- flagged per this project\'s data-verification rule rather than silently treated as fully confirmed.',
        "The NOFEE40 coupon code's exact mechanics are two separate fields from the same code: 40% off the monthly Test subscription and a separate 100% activation-fee waiver, with unlimited/uncapped stacking across accounts confirmed (no multi-account bulk discount exists on top of it, per TPT's own FAQ).",
    ];
    readonly plans = SIZES.map((s) => this.buildPlan(buildPlan(s)));
    readonly website = 'https://takeprofittrader.com';
}

const MAX_FUNDED_ACCOUNTS = 5;

function buildPlan(size: TptSize): PlanInit {
    return {
        accountSize: size.accountSize,
        consistency: new ConsistencyRule(ConsistencyScope.Eval, fraction(0.5)),
        contractLimits: {
            evalMicros: contracts(60),
            evalMinis: contracts(6),
            fundedMicros: {
                kind: ContractLimitKind.Flat,
                maxContracts: contracts(60),
            },
            fundedMinis: {
                kind: ContractLimitKind.Flat,
                maxContracts: contracts(6),
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
            activation: dollars(130),
            monthlySubscription: dollars(size.monthlySubscription),
            oneTimeEval: dollars(0),
            reset: dollars(99),
        },
        fundedDrawdown: new IntradayTrailingDrawdown({
            amount: size.maxDrawdown,
            lock: {
                atProfit: size.maxDrawdown,
                lockedThreshold: lockThresholdAt(0),
            },
        }),
        id: { accountSize: 50_000, firm: FirmId.Tpt },
        label: planLabel(size.accountSize, 'Test → PRO'),
        maxConsecutiveIdleDays: 7,
        maxFundedAccounts: MAX_FUNDED_ACCOUNTS,
        minDaysAfterPassForPayout: 0,
        minPayoutProfit: size.maxDrawdown,
        minPayoutRequest: dollars(0.01),
        minTradingDays: 3,
        payoutTiers: [
            { thresholdProfit: dollars(0), traderShare: fraction(0.8) },
        ],
        profitTarget: size.profitTarget,
    };
}
