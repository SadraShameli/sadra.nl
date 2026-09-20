import {
    ConsistencyBasis,
    ConsistencyRule,
    ConsistencyScope,
    ConsistencyViolationEffect,
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
        "PRO (funded) accounts require at least one traded day per calendar week (Sunday-Friday), per a scripted propfirmmatch.com panel extraction (2026-09-14) cross-checked against takeprofittrader.com's own Overview tab Firm Rules. Previously unmodeled (maxConsecutiveIdleDays was unset); set to 7, matching the mechanism used elsewhere in this codebase. This repo's own re-audited test-pro.md doc tree directly confirms no such rule exists during the Test stage (the only weekly-trading source, PRO Account Rules #3, is explicitly scoped to PRO), and warns not to assume this shared, Plan-wide field also governs Test. Corrected: core/Plan.ts now supports an evalMaxConsecutiveIdleDays override (defaulting to inherit maxConsecutiveIdleDays for every firm that doesn't set it, preserving current behavior for firms like FundedNext/MFFU/Tradeify whose eval stage genuinely shares the funded rule); set to null here so Test-stage simulations with a nonzero eval idleDayProbability are never wrongly busted for inactivity, while PRO's own funded 7-day rule is unchanged.",
        "Contract limit (6 minis / 60 micros, flat across eval and funded) was previously unmodeled entirely, confirmed by the same 2026-09-14 extraction and by takeprofittrader.com's own per-size leverage table. This repo's own re-audited test-pro.md doc tree confirms the Eval-stage figure directly but states the PRO/funded-stage figure is only carried over from the Eval table by inference (no separate PRO-specific contract-limit table exists in its own sources) -- not independently, separately confirmed the way the Eval-stage figure is. The modeled value (6/60, flat across both stages) is unaffected either way, since both stages use the same number regardless of confirmation route.",
        "Normal, ongoing payouts ARE a flat 80% split, gated only by the one-time buffer-zone clearance above (takeprofittrader.com's own Payout Policy: 'In the PRO account, the profit split is 80/20... You can withdraw your profits at 80% once you reach the level of your maximum drawdown'). A separate, narrow, NOT-modeled mechanic exists for 'Withdrawing from the Buffer': profit left unclaimed inside the buffer zone can only be recovered after the PRO account has been terminated, and that one-time recovery is split 50% if the account survived 60 or fewer TRADING days (not calendar days) before its last trading day, 80% if it survived more than 60 -- evaluated once, at termination, against total trading days survived, not an ongoing per-payout schedule. This is a genuinely different mechanic from an everyday withdrawal (point-in-time, termination-only, keyed off leftover buffer profit) and is not modeled by this engine, which has no bust/termination hook for a one-time leftover-profit split; documented here as a confirmed-but-unmodeled fact rather than approximated.",
        "The reset fee modeled here ($99) is TPT's own confirmed EVALUATION-phase reset price, matching exactly what this engine's reset mechanic represents (retrying a busted eval). A separate, much higher $649 FUNDED/PRO account reset option also exists (buy back into the same funded account after a funded-phase bust, up to 3 times, per the Overview tab's 'Pro Account Reset Option') -- not modeled, since this engine's replacement model for a busted funded account is already a fresh eval cycle, not a same-account funded reset; the $649 option is a genuinely different real-world choice this simulator does not currently represent as an alternative.",
        "This firm's own site shows two different minimum-trading-day figures for the same Test-phase requirement: the plan-card detail panel says 3 days (matching minTradingDays here), the Overview tab's own Consistency Rules section separately states 5 days. This repo's own re-audited test-pro.md doc tree resolves this: it is not an unreconciled conflict but a date-based policy change, directly confirmed by the 50AND3 promo FAQ -- 3 days for Test accounts purchased from August 17th onward, 5 days for earlier accounts and their resets (only the year, 2026, attached to that cutoff is separately unconfirmed; the day-count split itself is a directly-sourced fact). The modeled value (3) is correct for new purchases under this reading.",
        'PRO+ (the live-capital account, modeled in TptLive.ts): $0 start, EOD trailing drawdown "equivalent to the starting drawdown of the original PRO account" (help center: "PRO+ Account Upgrade Process"), trailing up and locking flush at $0 once that amount is reached -- no +$100 lock buffer, unlike Apex/Tradeify. For the $50K tier modeled here that is $2,000, matching this file\'s own maxDrawdown. 90/10 split (up from PRO\'s 80/20), and no per-request minimum/buffer for withdrawals, confirmed by the same source ("no buffer zone requirement for withdrawal"). The Zendesk help-center pages themselves 403\'d on direct fetch (Cloudflare-gated, no Wayback snapshot available either); this is sourced from the search engine\'s own indexed page text quoting that article, not a live primary-source fetch -- flagged per this project\'s data-verification rule rather than silently treated as fully confirmed.',
        "Two PRO+/TptLive.ts engine bugs found and fixed this pass. (1) LivePlan.withdrawableAmount() previously returned $0 for every plan until liveDrawdown.threshold locked, directly contradicting PRO+'s own confirmed \"no buffer zone requirement for withdrawal\" -- PRO+ could withdraw its balance-minus-threshold cushion at any time, pre- or post-lock, but the engine gated the entire cushion behind a lock event PRO+ doesn't require. Added a new LivePlanInit.requiresLockForWithdrawal flag (default true, preserving every other live firm's existing behavior byte-for-byte) and set it false only for TptLive.ts. (2) LivePlanInit had no inactivity/idle-day concept at all -- LiveAccountState already carried an unused consecutiveIdleDays field, but nothing incremented or checked it, so PRO's own funded-phase weekly-trading requirement (maxConsecutiveIdleDays: 7 on the funded PlanInit above, per this file's own note) had no live-stage equivalent to carry into PRO+. Added LivePlanInit.maxConsecutiveIdleDays plus idleDayProbability threading through runLiveDay/runLiveHorizon/simulateLiveAccount (mirroring the exact funded-phase pattern in simulator/day.ts), and set PRO+'s own maxConsecutiveIdleDays to 7 by direct analogy to PRO's own confirmed weekly rule -- at the time, the live-stage cadence itself had not been independently re-confirmed against a PRO+-specific primary source. This repo's own re-audited pro-plus.md doc tree has since confirmed it directly: its own Inactivity Rule row states the Weekly Trading Requirement as a PRO+ Account Rule in its own right, sourced from a Zendesk article distinct from the one covering PRO's weekly rule, not merely inherited by analogy. The 7-day value is unchanged; only the note's confirmation-status claim was stale.",
        "The NOFEE40 coupon code's exact mechanics are two separate fields from the same code: 40% off the monthly Test subscription and a separate 100% activation-fee waiver, with unlimited/uncapped stacking across accounts confirmed (no multi-account bulk discount exists on top of it, per TPT's own FAQ).",
        "PRO+ Development (pro-plus.md), previously entirely unmodeled, is now built in TptLive.ts as `buildTptLiveDevelopmentPlan` (50K-origin tier only): a reduced-risk live sub-variant with its own $1,250 EOD drawdown (vs. standard PRO+'s $2,000, same $0-flush-lock mechanic), a $1,000 soft-breach Daily Loss Limit, and a flat 2-mini contract cap -- all three the only named differences from standard PRO+ per pro-plus.md's own 'three differences' framing, so every other field (starting balance, payout split/frequency, requiresLockForWithdrawal: false, the 7-day weekly-trading requirement) is carried over unchanged. Building this required relaxing a real architectural constraint: `core/LivePlan.ts` previously threw if both `liveDrawdown` and `liveDailyLossLimit` were set, an either/or assumption that held for every live firm modeled before now but doesn't fit Development, which genuinely needs both simultaneously (a hard-breach EOD drawdown AND an independent same-day-pause DLL). Traced `isBust`/`isDayLockedOut`/`withdrawableAmount` and confirmed they already check `liveDrawdown`/`liveDailyLossLimit` independently of each other, so removing the mutual-exclusivity guard (keeping the 'at least one must be set' check) is behavior-preserving for every existing live firm and correctly enables Development's combination; `runLiveDay`'s existing `isDayLockedOut` handling (`break`, not a bust) already matches pro-plus.md's own 'pauses you, doesn't fail you' soft-breach description with no simulator changes needed. Not wired into `firms/index.ts`'s `LIVE_PLAN_BUILDERS` map: that registry is one live-plan-per-FirmId by design (used by the CLI's `prop live` command), and TPT's slot there already represents standard PRO+ -- exposing a second, discretionary live tier for the same firm needs a registry/CLI decision beyond this data-modeling change, so `buildTptLiveDevelopmentPlan` is exported standalone (from TptLive.ts and firms/index.ts) for direct/programmatic use instead.",
        "Plan.isPassed() previously treated any consistency-rule violation as an outright eval failure, but test-pro.md directly confirms TPT's own mechanic is fundamentally different: tripping the 50%-best-day rule does not fail the eval, it doubles the required profit target (Updated Profit Goal = Net P/L x 2) and the trader keeps trading toward that new target. Added a new `ConsistencyViolationEffect` enum (`Fail`/`DoubleTarget`) to `ConsistencyRule`, defaulting to `Fail` (preserving every other firm's existing binary pass/fail behavior byte-for-byte); Plan.isPassed() now requires `profit >= 2 * profitTarget` instead of failing outright when the rule's effect is `DoubleTarget`. Set here via the fourth ConsistencyRule constructor argument. core/EvalStateValue.ts's exact-DP grid ceiling (`maxTrackedProfitLike`) is widened to 2x profitTarget when this effect is set, so the discretized state space actually reaches the doubled target instead of clamping short of it. Known, disclosed gap: core/LadderSearch.ts's own simplified ladder-search model has its own self-contained, primitive-number-based consistency check that still treats any violation as an outright failure -- it does not know about ConsistencyViolationEffect. This understates (not overstates) TPT's true pass odds within that specific module only; the main Monte Carlo simulator (simulator/evalPhase.ts) and the exact DP solver (EvalStateValue.ts) are both fully correct.",
    ];
    readonly plans = SIZES.map((s) => this.buildPlan(buildPlan(s)));
    readonly website = 'https://takeprofittrader.com';
}

const MAX_FUNDED_ACCOUNTS = 5;

function buildPlan(size: TptSize): PlanInit {
    return {
        accountSize: size.accountSize,
        consistency: new ConsistencyRule(
            ConsistencyScope.Eval,
            fraction(0.5),
            ConsistencyBasis.Cycle,
            ConsistencyViolationEffect.DoubleTarget,
        ),
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
        evalMaxConsecutiveIdleDays: null,
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
