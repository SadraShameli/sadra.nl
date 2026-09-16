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

const LEGACY_BENCHMARK_DAY_MILESTONE = 30;
const LEGACY_BEFORE_MILESTONE_SHARE_CAP = fraction(0.5);
const INACTIVITY_CLOSURE_DAYS = 30;

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

const RAPID_DAILY_SIZES = [
    {
        accountSize: dollars(50_000),
        evalCost: 169.99,
        maxDrawdown: dollars(2000),
        profitTarget: dollars(3000),
        resetFee: 189.99,
    },
] as const;

type FunctionFlexSize = (typeof FLEX_SIZES)[number];
type FunctionLegacySize = (typeof LEGACY_SIZES)[number];
type FunctionRapidDailySize = (typeof RAPID_DAILY_SIZES)[number];
type FunctionRapidProSize = (typeof RAPID_PRO_SIZES)[number];

export class FundedNext extends TradingFirm {
    readonly displayName = 'FundedNext';
    readonly id = FirmId.FundedNext;
    readonly notes = [
        "Live-verified against helpfutures.fundednext.com: Legacy's Challenge phase has no minimum-trading-days requirement (the Trading Objectives table, the 'How do I pass the Legacy Challenge?' article, and the Futures Challenge Terms page all omit any day-count gate, matching Rapid Pro/Daily). minTradingDays was previously 3 for Legacy with no live source found for that number; corrected to 0. The separate 5-benchmark-day figure that does appear in Legacy's docs is the funded-account payout cadence (minDaysAfterPassForPayout), not a challenge-phase requirement.",
        'helpfutures.fundednext.com/en/articles/14298328 (inactivity period) and the Trading Objectives page both confirm a firm-wide rule: Challenge and FundedNext Account are breached after 30 consecutive calendar days without a trade, applying identically to Legacy, Rapid Pro, and Rapid Daily. This was previously unmodeled for all three FundedNext plans (maxConsecutiveIdleDays was left unset); now set to 30 for all three, matching the mechanism already used for E8 Futures/MyFundedFutures.',
        "helpfutures.fundednext.com/en/articles/14269280 ('How can I withdraw my Performance Reward?'), under its 'necessary adjustments after the withdrawal of the first Performance Reward' section, states the maximum loss limit is force-locked to a fixed floor AS A RESULT of the first payout itself (Legacy: initial balance; Rapid Pro/Daily: initial balance + $100) -- independent of whether the natural EOD-trailing lock trigger had already fired on its own. Rapid Daily already modeled this (payoutFloorEffect: LockAtPlanFloor); Legacy and Rapid Pro did not. Both can reach first-payout eligibility (5 benchmark days / $500 cycle profit for Legacy, $500 cycle profit for Rapid Pro) before their drawdown's own atProfit lock trigger ($2,000 / $2,100) has naturally fired, so the omission was a real gap, not inert. Added payoutFloorEffect: LockAtPlanFloor to both.",
        'The $169.99/$199.99 eval fees and $174.99/$183.99/$189.99 reset fees modeled here are both live-confirmed exact matches to the current pricing table (helpfutures.fundednext.com/en/articles/15053874 and .../14260538). Reset fees for Rapid Pro/Daily are higher than their own eval fee because the reset fee is a discount off the undiscounted list price ($299.98), while the modeled eval fee is the current promotional/offer price ($169.99) -- both are independently correct published figures, not a computed relationship, so no bug there.',
        "Rapid Daily's minPayoutProfit was previously $500 with no live source, and was dead: payoutBuffer already forces the first-payout floor up to accountSize + maxDrawdown + $100 (the live-verified $52,100 level at 50K), so any cycle profit under ~$2,100 was denied by the buffer long before the $500 profit gate could matter. helpfutures.fundednext.com/en/articles/15878210 states the real rule is '$500 profit in the current cycle above the buffer', i.e. buffer delta + $500 = $2,600. minPayoutProfit corrected to size.maxDrawdown + RAPID_DAILY_BUFFER_OFFSET + RAPID_DAILY_CYCLE_MIN_PROFIT so it is the true, binding first-payout number instead of a dead placeholder; minPayoutProfitPerCycle is unchanged since it already binds correctly for cycle 2+ once the floor locks.",
        "Rapid Pro's minDaysAfterPassForPayout was 0, collapsing it onto Rapid Daily's (correctly 0, live-confirmed 'Minimum Trading Days: Not required' at helpfutures.fundednext.com/en/articles/15878210). But helpfutures.fundednext.com/en/articles/15878126 ('Rapid Pro rewards can be withdrawn every 3 days') and the Rapid Pro vs Rapid Daily comparison article 15877643 ('Rewards | Every 3 Days | Daily') both confirm Rapid Pro has its own distinct 3-day payout cadence. Corrected to 3. Whether the firm's '3 days' means calendar days or qualifying/trading days is not stated in either source; mapped onto qualifying days by analogy to every other firm's use of this field (MyFundedFutures Pro=10, RapidEod=1), consistent with the mechanism minDaysAfterPassForPayout already uses.",
        "Legacy and Rapid Pro contract limits (3 minis/30 micros eval and 5 minis/50 micros funded for Legacy; 4 minis/40 micros both phases for Rapid Pro) are live-confirmed directly from fundednext.com's own pricing/checkout page (the Challenge Rules and Funded & Reward Rules tables, fetched 2026-09-14). Rapid Daily's equivalent contract-limit figures were not visible on the same page pass and are left unset rather than guessed.",
        "Flex is a fourth FundedNext Futures product (Most Affordable Flex Challenge, 95% reward share, the highest split of any plan modeled in this codebase) that was previously entirely unmodeled. Added from the same live pricing page: $50K account, $2,500 profit target, $1,500 EOD-trailing drawdown, 40% eval consistency, no eval or funded daily loss limit, $69.99 eval fee (a live, currently-charged launch-tier coupon price for the first 5 purchases, re-verified 2026-09-14 directly against fundednext.com/futures/flex; NOT the page's $133.99 strikethrough figure, which is a non-transactable marketing anchor never actually charged -- whether the launch tier has since rolled over to the FAQ's stated $79.99 '6th purchase onward' price is unconfirmed), $77.99 reset fee, 3 minis/30 micros contract limit both phases, rewards every 5 days, $1,500 maximum withdrawal (modeled as payoutRequestCap), 95% trader share. The page did not state the funded drawdown's lock trigger/offset, so it is modeled with the same $100-offset pattern used by Rapid Pro/Rapid Daily (RAPID_LOCK_OFFSET) rather than Legacy's zero-offset breakeven lock, since Flex's own marketing tagline (unlike Legacy's explicit 'No Buffer Required') does not claim a zero-buffer lock -- an inference, not a confirmed figure. minPayoutProfit and minPayoutRequest were not stated on the pricing page either and are left unset (defaulting to $0, an honest 'not confirmed' rather than a guessed number). payoutFloorEffect is set to LockAtPlanFloor by analogy to the same real gap already found and fixed for Legacy and Rapid Pro this session (a first payout reachable before the natural drawdown lock fires) -- not independently re-confirmed for Flex specifically.",
        "Flex's payout eligibility was missing its qualifying-day and balance-share gates entirely (only payoutRequestCap was set). helpfutures.fundednext.com's own Performance Reward eligibility article (live-fetched 2026-09-14) states, for the 50K tier: 'Benchmark Days: 5 days of $200... Maximum Withdrawal: Up to 50% of profit (max $1,500)' -- mirroring Legacy's already-correctly-modeled '5 days of $200' pattern. Corrected: added minQualifyingDayProfit: dollars(200) (minDaysAfterPassForPayout was already 5) and payoutBalanceShareCap: fraction(0.5), combined with the existing $1,500 payoutRequestCap.",
        "FundedNext Rapid Daily's contractLimits were previously left entirely unset ('not visible on the same page pass'). helpfutures.fundednext.com's own contract-limit-policy article (live-fetched 2026-09-14) confirms the eval/Challenge-phase limit for the combined 'Rapid Pro and Daily Challenge' category at 50K: 4 e-minis/40 micro e-minis, matching Rapid Pro's already-modeled eval figure exactly. The SAME article has no corresponding funded-phase ('FundedNext Account') table for this category at all, unlike Legacy and plain Rapid, whose funded-phase limits are confirmed HIGHER than their eval limits on this same page -- so assuming Rapid Daily's funded limit is flat/identical to eval (rather than also scaling up, unconfirmed) would be a guess. Corrected: evalMicros/evalMinis set to 40/4; fundedMicros/fundedMinis deliberately left null (honestly unconfirmed) rather than assumed flat.",
        "FundedNext Live (modeled in FundedNextLive.ts, Part M4's background research task w3y0y0n26): the current (post-July-10-2026 cutover) live-account model deposits a small fixed starting balance by size ($1,500/$2,000/$3,000/$4,500 for 25K/50K/100K/150K), unlike Apex/Tradeify/TPT which all start live capital at $0 -- the drawdown floor itself starts at $0 (the deposit trails EOD like every other confirmed live firm, ratcheting up as balance grows) and, critically, LOCKS $1,000 BELOW the starting balance rather than above it, the opposite lock direction from every other confirmed live firm. This is modeled with the existing EodTrailingDrawdown/DrawdownLockConfig mechanism using a negative lockThresholdAt offset (-1000) -- no new drawdown mechanism was needed, confirming the shared mechanism is firm-agnostic on lock direction. Payout is staged, not flat: 100% trader share on the first $5,000 of cumulative lifetime withdrawals, then 90/10 after -- modeled as a two-entry PayoutTier array ({thresholdProfit: 0, traderShare: 1}, {thresholdProfit: 5000, traderShare: 0.9}); this required fixing simulator/livePhase.ts's runLiveHorizon to feed walkPayoutTiers a running cumulative-withdrawn total (diffing successive calls) instead of each withdrawal's own isolated amount, since the prior single-tier-only usage across every other live firm made that bug inert until a real multi-tier plan exercised it. FundedNextLive.ts models the 50K tier only ($2,000 deposit), matching the single-flat-plan convention already used by ApexLive.ts/TradeifyLive.ts/TptLive.ts -- LivePlan/LiveAccountState have no per-size variant concept by design (see Part M1). One live account per eligible funded account (fixed at transition, not profit-unlocked, capped at 5) and no bonus/vault in the current model are confirmed but not simulated (no per-account-count or vault mechanism exists in the live simulator yet, same v1-scope deferral as Apex's Bonus Vault). The live-stage inactivity rule and whether the maximum-loss-limit check is EOD or intraday were NOT independently confirmed against a live-fetched primary source this session -- defaulted to EOD (matching every other confirmed live firm) per Part M4's own stated fallback, flagged here rather than silently assumed.",
    ];
    readonly plans = [
        ...FLEX_SIZES.map((s) => this.buildPlan(buildFlexPlan(s))),
        ...LEGACY_SIZES.map((s) => this.buildPlan(buildLegacyPlan(s))),
        ...RAPID_PRO_SIZES.map((s) => this.buildPlan(buildRapidProPlan(s))),
        ...RAPID_DAILY_SIZES.map((s) => this.buildPlan(buildRapidDailyPlan(s))),
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
        minDaysAfterPassForPayout: 5,
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
