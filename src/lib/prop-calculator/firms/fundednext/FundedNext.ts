import {
    ConsistencyBasis,
    ConsistencyRule,
    ConsistencyScope,
    ContractLimitKind,
    contracts,
    DailyLossLimitKind,
    dollars,
    EodTrailingDrawdown,
    FirmId,
    fraction,
    FundedNextVariant,
    PayoutBuffer,
    PayoutFloorEffect,
    type PlanInit,
    QualifyingDaysMilestonePayoutCap,
    TradingFirm,
} from '~/lib/prop-calculator/core';

import { lockThresholdAt, planLabel } from '../shared';

const RAPID_LOCK_OFFSET = 100;
const RAPID_DAILY_BUFFER_OFFSET = 100;
const RAPID_DAILY_CYCLE_MIN_PROFIT = 500;
const RAPID_MIN_REQUEST = 250;
const RAPID_MAX_REQUEST = 1200;
const RAPID_DAILY_REWARD_SHARE = 0.9;
const RAPID_MAX_WITHDRAWALS = 5;
const RAPID_PRO_PAYOUT_CADENCE_DAYS = 3;
const FLEX_MAX_WITHDRAWALS = 5;
const FLEX_CYCLE_MIN_PROFIT = 500;
const FLEX_MIN_REQUEST = 250;

const LEGACY_BENCHMARK_DAY_MILESTONE = 30;
const LEGACY_BEFORE_MILESTONE_SHARE_CAP = fraction(0.5);
const INACTIVITY_CLOSURE_DAYS = 30;

const FNL003_MAX_ACCOUNTS = 3;
const FNL003_CYCLE_MIN_PROFIT = 800;
const FNL003_MIN_REQUEST = 800;
const FNL003_MAX_REQUEST = 1200;
const FNL003_REWARD_SHARE = 0.9;
const FNL003_MAX_WITHDRAWALS = 5;
const FNL003_CONSISTENCY_SHARE = 0.2;

function contractLimitsOf(evalContracts: number, fundedContracts: number) {
    return {
        evalMicros: contracts(evalContracts * 10),
        evalMinis: contracts(evalContracts),
        fundedMicros: {
            kind: ContractLimitKind.Flat as const,
            maxContracts: contracts(fundedContracts * 10),
        },
        fundedMinis: {
            kind: ContractLimitKind.Flat as const,
            maxContracts: contracts(fundedContracts),
        },
    };
}

const FLEX_SIZES = [
    {
        accountSize: dollars(50_000),
        contractLimits: contractLimitsOf(3, 3),
        evalCost: 69.99,
        maxDrawdown: dollars(1500),
        payoutRequestCap: dollars(1500),
        profitTarget: dollars(2500),
        resetFee: 77.99,
    },
] as const;

const LEGACY_SIZES = [
    {
        accountSize: dollars(50_000),
        beforeMilestoneRequestCap: dollars(6000),
        contractLimits: contractLimitsOf(3, 5),
        evalCost: 199.99,
        maxDrawdown: dollars(2000),
        profitTarget: dollars(3000),
        resetFee: 183.99,
    },
] as const;

const RAPID_PRO_SIZES = [
    {
        accountSize: dollars(50_000),
        contractLimits: contractLimitsOf(4, 4),
        evalCost: 169.99,
        maxDrawdown: dollars(2000),
        profitTarget: dollars(3000),
        resetFee: 174.99,
    },
] as const;

const RAPID_PRO_DLL_ADD_ON_SIZES = [
    {
        accountSize: dollars(50_000),
        contractLimits: contractLimitsOf(4, 4),
        dailyLossLimit: dollars(1000),
        evalCost: 139.99,
        maxDrawdown: dollars(2000),
        profitTarget: dollars(3000),
        resetFee: 134.99,
    },
] as const;

const RAPID_DAILY_SIZES = [
    {
        accountSize: dollars(50_000),
        evalCost: 169.99,
        maxDrawdown: dollars(2000),
        profitTarget: dollars(3000),
        resetFee: 189.99,
    },
] as const;

const FNL003_SIZES = [
    {
        accountPrice: 149.99,
        accountSize: dollars(50_000),
        contractLimits: contractLimitsOf(3, 3),
        maxDrawdown: dollars(2000),
    },
] as const;

type FunctionFlexSize = (typeof FLEX_SIZES)[number];
type FunctionFnl003Size = (typeof FNL003_SIZES)[number];
type FunctionLegacySize = (typeof LEGACY_SIZES)[number];
type FunctionRapidDailySize = (typeof RAPID_DAILY_SIZES)[number];
type FunctionRapidProDllAddOnSize = (typeof RAPID_PRO_DLL_ADD_ON_SIZES)[number];
type FunctionRapidProSize = (typeof RAPID_PRO_SIZES)[number];

export class FundedNext extends TradingFirm {
    readonly displayName = 'FundedNext';
    readonly id = FirmId.FundedNext;
    readonly notes = [
        "Checked against helpfutures.fundednext.com: no minimum-trading-days requirement for Legacy's Challenge phase was found in the Trading Objectives table, the 'How do I pass the Legacy Challenge?' article, or the Futures Challenge Terms page (matching Rapid Pro/Daily). minTradingDays was previously 3 for Legacy with no live source found for that number; corrected to 0. Flagged: this repo's own re-audited legacy.md doc tree could not independently locate that Trading Objectives table or Futures Challenge Terms page in its own source bundle either, so treat the 0-day figure as an unconfirmed assumption pending a locatable primary source, not as live-verified. The separate 5-benchmark-day figure that does appear in Legacy's docs is the funded-account payout cadence (minDaysAfterPassForPayout), not a challenge-phase requirement.",
        'helpfutures.fundednext.com/en/articles/14298328 (inactivity period) and the Trading Objectives page both confirm a firm-wide rule: Challenge and FundedNext Account are breached after 30 consecutive calendar days without a trade, applying identically to Legacy, Rapid Pro, and Rapid Daily. This was previously unmodeled for all three FundedNext plans (maxConsecutiveIdleDays was left unset); now set to 30 for all three, matching the mechanism already used for E8 Futures/MyFundedFutures.',
        "helpfutures.fundednext.com/en/articles/14269280 ('How can I withdraw my Performance Reward?'), under its 'necessary adjustments after the withdrawal of the first Performance Reward' section, states the maximum loss limit is force-locked to a fixed floor AS A RESULT of the first payout itself (Legacy: initial balance; Rapid Pro/Daily: initial balance + $100) -- independent of whether the natural EOD-trailing lock trigger had already fired on its own. Rapid Daily already modeled this (payoutFloorEffect: LockAtPlanFloor); Legacy and Rapid Pro did not. Both can reach first-payout eligibility (5 benchmark days / $500 cycle profit for Legacy, $500 cycle profit for Rapid Pro) before their drawdown's own atProfit lock trigger ($2,000 / $2,100) has naturally fired, so the omission was a real gap, not inert. Added payoutFloorEffect: LockAtPlanFloor to both.",
        'The $169.99/$199.99 eval fees and $174.99/$183.99/$189.99 reset fees modeled here are both live-confirmed exact matches to the current pricing table (helpfutures.fundednext.com/en/articles/15053874 and .../14260538). Reset fees for Rapid Pro/Daily are higher than their own eval fee because the reset fee is a discount off the undiscounted list price ($299.98), while the modeled eval fee is the current promotional/offer price ($169.99) -- both are independently correct published figures, not a computed relationship, so no bug there.',
        "Rapid Daily's minPayoutProfit was previously $500 with no live source, and was dead: payoutBuffer already forces the first-payout floor up to accountSize + maxDrawdown + $100 (the live-verified $52,100 level at 50K), so any cycle profit under ~$2,100 was denied by the buffer long before the $500 profit gate could matter. helpfutures.fundednext.com/en/articles/15878210 states the real rule is '$500 profit in the current cycle above the buffer', i.e. buffer delta + $500 = $2,600. minPayoutProfit corrected to size.maxDrawdown + RAPID_DAILY_BUFFER_OFFSET + RAPID_DAILY_CYCLE_MIN_PROFIT so it is the true, binding first-payout number instead of a dead placeholder; minPayoutProfitPerCycle is unchanged since it already binds correctly for cycle 2+ once the floor locks.",
        "Rapid Pro's minDaysAfterPassForPayout was 0, collapsing it onto Rapid Daily's (correctly 0, live-confirmed 'Minimum Trading Days: Not required' at helpfutures.fundednext.com/en/articles/15878210). But helpfutures.fundednext.com/en/articles/15878126 ('Rapid Pro rewards can be withdrawn every 3 days') and the Rapid Pro vs Rapid Daily comparison article 15877643 ('Rewards | Every 3 Days | Daily') both confirm Rapid Pro has its own distinct 3-day payout cadence. Corrected to 3. Whether the firm's '3 days' means calendar days or qualifying/trading days is not stated in either source; mapped onto qualifying days by analogy to every other firm's use of this field (MyFundedFutures Pro=10, RapidEod=1), consistent with the mechanism minDaysAfterPassForPayout already uses.",
        "Legacy and Rapid Pro contract limits (3 minis/30 micros eval and 5 minis/50 micros funded for Legacy; 4 minis/40 micros both phases for Rapid Pro) are live-confirmed directly from fundednext.com's own pricing/checkout page (the Challenge Rules and Funded & Reward Rules tables, fetched 2026-09-14). Rapid Daily's equivalent contract-limit figures were not visible on the same page pass and are left unset rather than guessed.",
        "Flex is a fourth FundedNext Futures product (Most Affordable Flex Challenge, 95% reward share, the highest split of any plan modeled in this codebase) that was previously entirely unmodeled. Added from the same live pricing page: $50K account, $2,500 profit target, $1,500 EOD-trailing drawdown, 40% eval consistency, no eval or funded daily loss limit, $69.99 eval fee (a live, currently-charged launch-tier coupon price for the first 5 purchases, re-verified 2026-09-14 directly against fundednext.com/futures/flex; NOT the page's $133.99 strikethrough figure, which is a non-transactable marketing anchor never actually charged -- whether the launch tier has since rolled over to the FAQ's stated $79.99 '6th purchase onward' price is unconfirmed), $77.99 reset fee, 3 minis/30 micros contract limit both phases, rewards every 5 days, $1,500 maximum withdrawal (modeled as payoutRequestCap), 95% trader share. The page did not state the funded drawdown's lock trigger/offset, so it is modeled with the same $100-offset pattern used by Rapid Pro/Rapid Daily (RAPID_LOCK_OFFSET) rather than Legacy's zero-offset breakeven lock, since Flex's own marketing tagline (unlike Legacy's explicit 'No Buffer Required') does not claim a zero-buffer lock -- an inference, not a confirmed figure. minPayoutProfit and minPayoutRequest were not stated on the pricing page pass and were briefly left unset (defaulting to $0). This repo's own re-audited flex.md doc tree has since found both directly confirmed in Flex's dedicated Performance Reward eligibility article: $250 Minimum Withdrawal and $500 minimum cycle profit for eligibility. Corrected: minPayoutProfit/minPayoutProfitPerCycle set to dollars(FLEX_CYCLE_MIN_PROFIT) (=$500) and minPayoutRequest to dollars(FLEX_MIN_REQUEST) (=$250), mirroring the identical pattern already used by Legacy/Rapid Pro/Rapid Daily. payoutFloorEffect is set to LockAtPlanFloor by analogy to the same real gap already found and fixed for Legacy and Rapid Pro this session (a first payout reachable before the natural drawdown lock fires) -- not independently re-confirmed for Flex specifically.",
        "Flex's payout eligibility was missing its qualifying-day and balance-share gates entirely (only payoutRequestCap was set). helpfutures.fundednext.com's own Performance Reward eligibility article (live-fetched 2026-09-14) states, for the 50K tier: 'Benchmark Days: 5 days of $200... Maximum Withdrawal: Up to 50% of profit (max $1,500)' -- mirroring Legacy's already-correctly-modeled '5 days of $200' pattern. Corrected: added minQualifyingDayProfit: dollars(200) (minDaysAfterPassForPayout was already 5) and payoutBalanceShareCap: fraction(0.5), combined with the existing $1,500 payoutRequestCap.",
        "Flex's own source directly confirms a 5-payout lifetime cap ('After 5 Performance Reward Withdrawals, the Flex FundedNext Account will be concluded'), previously left unmodeled (maxLifetimePayouts was unset, so the simulator never concluded a Flex account on payout count). Corrected: maxLifetimePayouts set to FLEX_MAX_WITHDRAWALS (=5), matching the RAPID_MAX_WITHDRAWALS/FNL003_MAX_WITHDRAWALS convention already used by the other three plans.",
        "Rapid Pro's optional Daily Loss Limit Add-On (rapid-pro.md) is a real, separately-purchasable Rapid Pro variant modeled here as `RapidProDllAddOn` (50K tier only): $1,000 flat DLL carrying through Challenge and FundedNext Account, all other fields identical to base Rapid Pro (consistency, payout structure, contract limits) since the Add-On's own source scopes it to changing only the DLL and price. The Add-On's price is a genuine, unresolved 3-way conflict across FundedNext's own sources: the plan's dedicated pricing article states $109.99 eval / $117.99 reset; a firm-wide sizes-and-prices article states $129.99 eval; the Add-On's own dedicated article states $139.99 eval / $134.99 reset (the last figure independently corroborated by the firm-wide reset-conditions article's own 'Rapid Pro with Add-On' column). Modeled as $139.99 eval (the Add-On's own most-directly-on-topic article) / $134.99 reset (the two-source-corroborated figure) as the best-supported reading, not a definitively resolved one -- do not treat either as settled without checking the live checkout page.",
        "Legacy's own source states plainly: 'Withdrawing all of your simulated profit in one go causes a hard breach.' After Legacy's own 30-qualifying-day milestone, payoutCapOverride removes both the balance-share cap and the request cap entirely (afterMilestone: {balanceShareCap: null, requestCap: null}), so a post-milestone Legacy trader genuinely can request a payout covering 100% of current profit -- previously the simulator would just pay it out normally with no consequence, contradicting this confirmed rule. Added a new `fullWithdrawalHardBreach` flag to PlanInit/Plan (default false, no behavior change for every other plan in this codebase), checked in FundedPayoutCycle.ts's tryPayout: if the flag is set and a payout's debited amount consumes the account's entire pre-payout profit, the result carries `causesHardBreach: true`, which simulator/fundedPhase.ts (and the matching exact-DP continuation in core/FundedStateValue.ts) treats as an immediate funded-phase bust occurring right after that payout is credited -- the trader still banks that payout, but the account closes with no further trading, mirroring how ConsistencyBasis.Perpetual was added as a new capability for FNL:003 in this same codebase. Set true only for Legacy.",
        "FundedNext Rapid Daily's contractLimits were previously left entirely unset ('not visible on the same page pass'). helpfutures.fundednext.com's own contract-limit-policy article (live-fetched 2026-09-14) confirms the eval/Challenge-phase limit for the combined 'Rapid Pro and Daily Challenge' category at 50K: 4 e-minis/40 micro e-minis, matching Rapid Pro's already-modeled eval figure exactly. The SAME article has no corresponding funded-phase ('FundedNext Account') table for this category at all, unlike Legacy and plain Rapid, whose funded-phase limits are confirmed HIGHER than their eval limits on this same page -- so assuming Rapid Daily's funded limit is flat/identical to eval (rather than also scaling up, unconfirmed) would be a guess. Corrected: evalMicros/evalMinis set to 40/4; fundedMicros/fundedMinis deliberately left null (honestly unconfirmed) rather than assumed flat.",
        "FundedNext Live (modeled in FundedNextLive.ts, Part M4's background research task w3y0y0n26): the current (post-July-10-2026 cutover) live-account model deposits a small fixed starting balance by size ($1,500/$2,000/$3,000/$4,500 for 25K/50K/100K/150K), unlike Apex/Tradeify/TPT which all start live capital at $0 -- the drawdown floor itself starts at $0 (the deposit trails EOD like every other confirmed live firm, ratcheting up as balance grows) and, critically, LOCKS $1,000 BELOW the starting balance rather than above it, the opposite lock direction from every other confirmed live firm. This is modeled with the existing EodTrailingDrawdown/DrawdownLockConfig mechanism using a negative lockThresholdAt offset (-1000) -- no new drawdown mechanism was needed, confirming the shared mechanism is firm-agnostic on lock direction. Payout is staged, not flat: 100% trader share on the first $5,000 of cumulative lifetime withdrawals, then 90/10 after -- modeled as a two-entry PayoutTier array ({thresholdProfit: 0, traderShare: 1}, {thresholdProfit: 5000, traderShare: 0.9}); this required fixing simulator/livePhase.ts's runLiveHorizon to feed walkPayoutTiers a running cumulative-withdrawn total (diffing successive calls) instead of each withdrawal's own isolated amount, since the prior single-tier-only usage across every other live firm made that bug inert until a real multi-tier plan exercised it. FundedNextLive.ts models the 50K tier only ($2,000 deposit), matching the single-flat-plan convention already used by ApexLive.ts/TradeifyLive.ts/TptLive.ts -- LivePlan/LiveAccountState have no per-size variant concept by design (see Part M1). One live account per eligible funded account (fixed at transition, not profit-unlocked, capped at 5) and no bonus/vault in the current model are confirmed but not simulated (no per-account-count or vault mechanism exists in the live simulator yet, same v1-scope deferral as Apex's Bonus Vault). The live-stage inactivity rule and whether the maximum-loss-limit check is EOD or intraday were NOT independently confirmed against a live-fetched primary source this session -- defaulted to EOD (matching every other confirmed live firm) per Part M4's own stated fallback, flagged here rather than silently assumed.",
        'FNFLEX (~47% off Flex $50K) and RAPID (~43-46% off Rapid Pro/Daily $50K) codes exist and are standing; Legacy is explicitly not discounted.',
        'FundedNextLive.ts engine bug found and fixed this pass: the drawdown lock\'s atProfit trigger was set to STARTING_BALANCE + LOCK_OFFSET (2000 + (-1000) = 1000), firing the lock once profit reached $1,000 (balance $3,000). helpfutures.fundednext.com\'s own "Road to Live Trading" articles state the trigger is "When your profit equals your initial MLL amount", which the same articles\' own "MLL Lock Benefit" section clarifies means profit equal to the starting balance itself (balance $4,000 for the 50K tier, explicitly worked through in the source\'s own example table). The LOCK_OFFSET belongs only in the locked VALUE calculation (lockedThreshold: lockThresholdAt(LOCK_OFFSET), correctly $1,000 below starting balance and unchanged by this fix), not the trigger -- the trigger was double-counting the offset. Corrected atProfit to STARTING_BALANCE alone.',
        "Separately, and flagged with reduced confidence: the reset fee is calculated off list price, not the discounted purchase price, so resetting can cost more than buying fresh with the current code. FundedNext's own reset-fee help article contradicts itself and the live pricing page on the exact dollar figures involved (e.g. its own table says Rapid Pro 50K costs $169.99, the live site says $159.99; its own worked examples use yet a third set of numbers), so the mechanism (reset priced off list, not the discounted price) is confirmed but the exact dollar gap isn't precise enough to hardcode -- this note describes the mechanism, not a specific dollar amount.",
        "FNL:003 50K Instant Account (Labs, previously entirely unmodeled): a direct-to-funded product with no Challenge phase, modeled with isInstantFunded: true (the same mechanism already used by Tradeify's Lightning and Lucid's Direct plans). $50,000 account, $149.99 one-time account price, no reset option (resetFee left at $0 since the engine's replacement model for a busted instant-funded account has no reset path to represent here -- reset is confirmed absent, not unconfirmed). EOD-trailing $2,000 drawdown locking at Initial Balance + $100 ($50,100), the same RAPID_LOCK_OFFSET pattern as Flex/Rapid Pro/Rapid Daily, directly source-confirmed (\"trails upward only until it locks at Starting Balance + $100\"). 3 Mini/30 Micro contract limit (flat, source-confirmed). 90% Reward Share, $800 minimum/$1,200 maximum withdrawal, 5 lifetime withdrawals (RAPID_MAX_WITHDRAWALS pattern). Its own $2,100 buffer requirement (\"Clear the $2,100 buffer\") is modeled as PayoutBuffer(RAPID_LOCK_OFFSET), which computes startingBalance + maxDrawdown + 100 = $52,100, matching the source exactly -- the buffer-clearing profit level and the drawdown lock's own atProfit trigger land on the identical $2,100 figure by construction (both are startingBalance + maxDrawdown + 100 minus startingBalance), so payoutFloorEffect is left at its default None rather than LockAtPlanFloor: unlike Legacy/Rapid Pro/Rapid Daily, first-payout eligibility here can never be reached before the natural drawdown lock already fired, because minPayoutProfit ($2,900) is strictly greater than the lock's own atProfit ($2,100). minPayoutProfit is modeled as maxDrawdown + RAPID_LOCK_OFFSET + FNL003_CYCLE_MIN_PROFIT (the buffer-clearing profit plus the source's own separately-stated \"at least $800 above the buffer\" gate), minPayoutProfitPerCycle as the recurring $800-above-buffer figure alone, mirroring Rapid Daily's own buffer-plus-cycle-minimum pattern exactly. Its 20% Perpetual Consistency Rule (\"your highest single trading day ever recorded on the account\" compared against current-cycle profit, never resetting the best-day record across cycles) required a genuine new engine capability, not just data: added ConsistencyBasis.Perpetual to ConsistencyRule (core/ConsistencyRule.ts) and gated FundedCycleTracker's per-payout cycleBestDayProfit reset on it (core/FundedPayoutCycle.ts), plus the matching continuation-value gate in the exact DP solver (core/FundedStateValue.ts) -- every other firm's existing ConsistencyRule usage defaults to ConsistencyBasis.Cycle and is unaffected. Daily Loss Limit is genuinely unconfirmed for FNL:003 (absent from every firm-wide DLL table) and modeled as DailyLossLimitKind.None, the same honest-absence convention already used for Flex/Legacy rather than a guessed figure. Inactivity is modeled at the same firm-wide 30-day figure as the other three plans, though FNL:003 is not named in that source article by itself (same category-level basis, not an independent FNL:003-specific citation). minDaysAfterPassForPayout is left at 0 (not stated either way). maxFundedAccounts is FNL:003's own separate 3-account purchase cap, NOT the standard 5-account FundedNext Account allocation the other four plans share (FNL:003 accounts are explicitly excluded from that cap, per its own source).",
    ];
    readonly plans = [
        ...FLEX_SIZES.map((s) => this.buildPlan(buildFlexPlan(s))),
        ...LEGACY_SIZES.map((s) => this.buildPlan(buildLegacyPlan(s))),
        ...RAPID_PRO_SIZES.map((s) => this.buildPlan(buildRapidProPlan(s))),
        ...RAPID_PRO_DLL_ADD_ON_SIZES.map((s) =>
            this.buildPlan(buildRapidProDllAddOnPlan(s)),
        ),
        ...RAPID_DAILY_SIZES.map((s) => this.buildPlan(buildRapidDailyPlan(s))),
        ...FNL003_SIZES.map((s) => this.buildPlan(buildFnl003Plan(s))),
    ];
    readonly website = 'https://fundednext.com';
}

const MAX_FUNDED_ACCOUNTS = 5;

function buildFlexPlan(size: FunctionFlexSize): PlanInit {
    return {
        accountSize: size.accountSize,
        consistency: new ConsistencyRule(ConsistencyScope.Eval, fraction(0.4)),
        contractLimits: size.contractLimits,
        drawdown: new EodTrailingDrawdown({
            amount: size.maxDrawdown,
            lock: {
                atProfit: dollars(size.maxDrawdown + RAPID_LOCK_OFFSET),
                lockedThreshold: lockThresholdAt(RAPID_LOCK_OFFSET),
            },
        }),
        evalDailyLossLimit: { kind: DailyLossLimitKind.None },
        fees: {
            activation: dollars(0),
            monthlySubscription: dollars(0),
            oneTimeEval: dollars(size.evalCost),
            reset: dollars(size.resetFee),
        },
        id: {
            accountSize: 50_000,
            firm: FirmId.FundedNext,
            variant: FundedNextVariant.Flex,
        },
        label: planLabel(size.accountSize, 'Flex'),
        maxConsecutiveIdleDays: INACTIVITY_CLOSURE_DAYS,
        maxFundedAccounts: MAX_FUNDED_ACCOUNTS,
        maxLifetimePayouts: FLEX_MAX_WITHDRAWALS,
        minDaysAfterPassForPayout: 5,
        minPayoutProfit: dollars(FLEX_CYCLE_MIN_PROFIT),
        minPayoutProfitPerCycle: dollars(FLEX_CYCLE_MIN_PROFIT),
        minPayoutRequest: dollars(FLEX_MIN_REQUEST),
        minQualifyingDayProfit: dollars(200),
        minTradingDays: 0,
        payoutBalanceShareCap: fraction(0.5),
        payoutFloorEffect: PayoutFloorEffect.LockAtPlanFloor,
        payoutRequestCap: size.payoutRequestCap,
        payoutTiers: [
            { thresholdProfit: dollars(0), traderShare: fraction(0.95) },
        ],
        profitTarget: size.profitTarget,
    };
}

function buildFnl003Plan(size: FunctionFnl003Size): PlanInit {
    return {
        accountSize: size.accountSize,
        consistency: new ConsistencyRule(
            ConsistencyScope.Funded,
            fraction(FNL003_CONSISTENCY_SHARE),
            ConsistencyBasis.Perpetual,
        ),
        contractLimits: size.contractLimits,
        drawdown: new EodTrailingDrawdown({
            amount: size.maxDrawdown,
            lock: {
                atProfit: dollars(size.maxDrawdown + RAPID_LOCK_OFFSET),
                lockedThreshold: lockThresholdAt(RAPID_LOCK_OFFSET),
            },
        }),
        evalDailyLossLimit: { kind: DailyLossLimitKind.None },
        fees: {
            activation: dollars(0),
            monthlySubscription: dollars(0),
            oneTimeEval: dollars(size.accountPrice),
            reset: dollars(0),
        },
        id: {
            accountSize: 50_000,
            firm: FirmId.FundedNext,
            variant: FundedNextVariant.Fnl003,
        },
        isInstantFunded: true,
        label: planLabel(size.accountSize, 'FNL:003 Instant'),
        maxConsecutiveIdleDays: INACTIVITY_CLOSURE_DAYS,
        maxFundedAccounts: FNL003_MAX_ACCOUNTS,
        maxLifetimePayouts: FNL003_MAX_WITHDRAWALS,
        minDaysAfterPassForPayout: 0,
        minPayoutProfit: dollars(
            size.maxDrawdown + RAPID_LOCK_OFFSET + FNL003_CYCLE_MIN_PROFIT,
        ),
        minPayoutProfitPerCycle: dollars(FNL003_CYCLE_MIN_PROFIT),
        minPayoutRequest: dollars(FNL003_MIN_REQUEST),
        minTradingDays: 0,
        payoutBuffer: new PayoutBuffer(dollars(RAPID_LOCK_OFFSET)),
        payoutRequestCap: dollars(FNL003_MAX_REQUEST),
        payoutTiers: [
            {
                thresholdProfit: dollars(0),
                traderShare: fraction(FNL003_REWARD_SHARE),
            },
        ],
        profitTarget: dollars(0),
    };
}

function buildLegacyPlan(size: FunctionLegacySize): PlanInit {
    return {
        accountSize: size.accountSize,
        consistency: new ConsistencyRule(ConsistencyScope.Eval, fraction(0.4)),
        contractLimits: size.contractLimits,
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
            oneTimeEval: dollars(size.evalCost),
            reset: dollars(size.resetFee),
        },
        fullWithdrawalHardBreach: true,
        id: {
            accountSize: 50_000,
            firm: FirmId.FundedNext,
            variant: FundedNextVariant.Legacy,
        },
        label: planLabel(size.accountSize, 'Legacy'),
        maxConsecutiveIdleDays: INACTIVITY_CLOSURE_DAYS,
        maxFundedAccounts: MAX_FUNDED_ACCOUNTS,
        minDaysAfterPassForPayout: 5,
        minPayoutProfit: dollars(500),
        minPayoutProfitPerCycle: dollars(500),
        minPayoutRequest: dollars(250),
        minQualifyingDayProfit: dollars(200),
        minTradingDays: 0,
        payoutCapOverride: new QualifyingDaysMilestonePayoutCap({
            afterMilestone: { balanceShareCap: null, requestCap: null },
            beforeMilestone: {
                balanceShareCap: LEGACY_BEFORE_MILESTONE_SHARE_CAP,
                requestCap: size.beforeMilestoneRequestCap,
            },
            milestoneQualifyingDays: LEGACY_BENCHMARK_DAY_MILESTONE,
        }),
        payoutFloorEffect: PayoutFloorEffect.LockAtPlanFloor,
        payoutTiers: [
            { thresholdProfit: dollars(0), traderShare: fraction(0.8) },
        ],
        profitTarget: size.profitTarget,
    };
}

function buildRapidDailyPlan(size: FunctionRapidDailySize): PlanInit {
    return {
        accountSize: size.accountSize,
        consistency: null,
        contractLimits: {
            evalMicros: contracts(40),
            evalMinis: contracts(4),
            fundedMicros: null,
            fundedMinis: null,
        },
        drawdown: new EodTrailingDrawdown({
            amount: size.maxDrawdown,
            lock: {
                atProfit: dollars(size.maxDrawdown + RAPID_LOCK_OFFSET),
                lockedThreshold: lockThresholdAt(RAPID_LOCK_OFFSET),
            },
        }),
        evalDailyLossLimit: {
            amount: dollars(1000),
            kind: DailyLossLimitKind.Flat,
        },
        fees: {
            activation: dollars(0),
            monthlySubscription: dollars(0),
            oneTimeEval: dollars(size.evalCost),
            reset: dollars(size.resetFee),
        },
        id: {
            accountSize: 50_000,
            firm: FirmId.FundedNext,
            variant: FundedNextVariant.RapidDaily,
        },
        label: planLabel(size.accountSize, 'Rapid Daily'),
        maxConsecutiveIdleDays: INACTIVITY_CLOSURE_DAYS,
        maxFundedAccounts: MAX_FUNDED_ACCOUNTS,
        maxLifetimePayouts: RAPID_MAX_WITHDRAWALS,
        minDaysAfterPassForPayout: 0,
        minPayoutProfit: dollars(
            size.maxDrawdown +
                RAPID_DAILY_BUFFER_OFFSET +
                RAPID_DAILY_CYCLE_MIN_PROFIT,
        ),
        minPayoutProfitPerCycle: dollars(RAPID_DAILY_CYCLE_MIN_PROFIT),
        minPayoutRequest: dollars(RAPID_MIN_REQUEST),
        minTradingDays: 0,
        payoutBuffer: new PayoutBuffer(dollars(RAPID_DAILY_BUFFER_OFFSET)),
        payoutFloorEffect: PayoutFloorEffect.LockAtPlanFloor,
        payoutRequestCap: dollars(RAPID_MAX_REQUEST),
        payoutTiers: [
            {
                thresholdProfit: dollars(0),
                traderShare: fraction(RAPID_DAILY_REWARD_SHARE),
            },
        ],
        profitTarget: size.profitTarget,
    };
}

function buildRapidProDllAddOnPlan(
    size: FunctionRapidProDllAddOnSize,
): PlanInit {
    return {
        accountSize: size.accountSize,
        consistency: new ConsistencyRule(
            ConsistencyScope.Funded,
            fraction(0.4),
        ),
        contractLimits: size.contractLimits,
        drawdown: new EodTrailingDrawdown({
            amount: size.maxDrawdown,
            lock: {
                atProfit: dollars(size.maxDrawdown + RAPID_LOCK_OFFSET),
                lockedThreshold: lockThresholdAt(RAPID_LOCK_OFFSET),
            },
        }),
        evalDailyLossLimit: {
            amount: size.dailyLossLimit,
            kind: DailyLossLimitKind.Flat,
        },
        fees: {
            activation: dollars(0),
            monthlySubscription: dollars(0),
            oneTimeEval: dollars(size.evalCost),
            reset: dollars(size.resetFee),
        },
        fundedDailyLossLimit: {
            amount: size.dailyLossLimit,
            kind: DailyLossLimitKind.Flat,
        },
        id: {
            accountSize: 50_000,
            firm: FirmId.FundedNext,
            variant: FundedNextVariant.RapidProDllAddOn,
        },
        label: planLabel(size.accountSize, 'Rapid Pro (DLL Add-On)'),
        maxConsecutiveIdleDays: INACTIVITY_CLOSURE_DAYS,
        maxFundedAccounts: MAX_FUNDED_ACCOUNTS,
        maxLifetimePayouts: RAPID_MAX_WITHDRAWALS,
        minDaysAfterPassForPayout: RAPID_PRO_PAYOUT_CADENCE_DAYS,
        minPayoutProfit: dollars(500),
        minPayoutProfitPerCycle: dollars(500),
        minPayoutRequest: dollars(RAPID_MIN_REQUEST),
        minTradingDays: 0,
        payoutFloorEffect: PayoutFloorEffect.LockAtPlanFloor,
        payoutRequestCap: dollars(RAPID_MAX_REQUEST),
        payoutTiers: [
            { thresholdProfit: dollars(0), traderShare: fraction(0.9) },
        ],
        profitTarget: size.profitTarget,
    };
}

function buildRapidProPlan(size: FunctionRapidProSize): PlanInit {
    return {
        accountSize: size.accountSize,
        consistency: new ConsistencyRule(
            ConsistencyScope.Funded,
            fraction(0.4),
        ),
        contractLimits: size.contractLimits,
        drawdown: new EodTrailingDrawdown({
            amount: size.maxDrawdown,
            lock: {
                atProfit: dollars(size.maxDrawdown + RAPID_LOCK_OFFSET),
                lockedThreshold: lockThresholdAt(RAPID_LOCK_OFFSET),
            },
        }),
        evalDailyLossLimit: { kind: DailyLossLimitKind.None },
        fees: {
            activation: dollars(0),
            monthlySubscription: dollars(0),
            oneTimeEval: dollars(size.evalCost),
            reset: dollars(size.resetFee),
        },
        id: {
            accountSize: 50_000,
            firm: FirmId.FundedNext,
            variant: FundedNextVariant.RapidPro,
        },
        label: planLabel(size.accountSize, 'Rapid Pro'),
        maxConsecutiveIdleDays: INACTIVITY_CLOSURE_DAYS,
        maxFundedAccounts: MAX_FUNDED_ACCOUNTS,
        maxLifetimePayouts: RAPID_MAX_WITHDRAWALS,
        minDaysAfterPassForPayout: RAPID_PRO_PAYOUT_CADENCE_DAYS,
        minPayoutProfit: dollars(500),
        minPayoutProfitPerCycle: dollars(500),
        minPayoutRequest: dollars(RAPID_MIN_REQUEST),
        minTradingDays: 0,
        payoutFloorEffect: PayoutFloorEffect.LockAtPlanFloor,
        payoutRequestCap: dollars(RAPID_MAX_REQUEST),
        payoutTiers: [
            { thresholdProfit: dollars(0), traderShare: fraction(0.9) },
        ],
        profitTarget: size.profitTarget,
    };
}
