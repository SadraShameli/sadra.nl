import {
    ConsistencyRule,
    ConsistencyScope,
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

const LEGACY_SIZES = [
    {
        accountSize: dollars(50_000),
        beforeMilestoneRequestCap: dollars(6000),
        evalCost: 199.99,
        maxDrawdown: dollars(2000),
        profitTarget: dollars(3000),
        resetFee: 183.99,
    },
] as const;

const RAPID_PRO_SIZES = [
    {
        accountSize: dollars(50_000),
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
    ];
    readonly plans = [
        ...LEGACY_SIZES.map((s) => this.buildPlan(buildLegacyPlan(s))),
        ...RAPID_PRO_SIZES.map((s) => this.buildPlan(buildRapidProPlan(s))),
        ...RAPID_DAILY_SIZES.map((s) => this.buildPlan(buildRapidDailyPlan(s))),
    ];
    readonly website = 'https://fundednext.com';
}

const MAX_FUNDED_ACCOUNTS = 5;

function buildLegacyPlan(size: FunctionLegacySize): PlanInit {
    return {
        accountSize: size.accountSize,
        consistency: new ConsistencyRule(ConsistencyScope.Eval, fraction(0.4)),
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
