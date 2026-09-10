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

const LEGACY_BENCHMARK_DAY_MILESTONE = 30;
const LEGACY_BEFORE_MILESTONE_SHARE_CAP = fraction(0.5);

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
        maxFundedAccounts: MAX_FUNDED_ACCOUNTS,
        minDaysAfterPassForPayout: 5,
        minPayoutProfit: dollars(500),
        minPayoutProfitPerCycle: dollars(500),
        minPayoutRequest: dollars(250),
        minQualifyingDayProfit: dollars(200),
        minTradingDays: 3,
        payoutCapOverride: new QualifyingDaysMilestonePayoutCap({
            afterMilestone: { balanceShareCap: null, requestCap: null },
            beforeMilestone: {
                balanceShareCap: LEGACY_BEFORE_MILESTONE_SHARE_CAP,
                requestCap: size.beforeMilestoneRequestCap,
            },
            milestoneQualifyingDays: LEGACY_BENCHMARK_DAY_MILESTONE,
        }),
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
        maxFundedAccounts: MAX_FUNDED_ACCOUNTS,
        maxLifetimePayouts: RAPID_MAX_WITHDRAWALS,
        minDaysAfterPassForPayout: 0,
        minPayoutProfit: dollars(RAPID_DAILY_CYCLE_MIN_PROFIT),
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
        maxFundedAccounts: MAX_FUNDED_ACCOUNTS,
        maxLifetimePayouts: RAPID_MAX_WITHDRAWALS,
        minDaysAfterPassForPayout: 0,
        minPayoutProfit: dollars(500),
        minPayoutProfitPerCycle: dollars(500),
        minPayoutRequest: dollars(RAPID_MIN_REQUEST),
        minTradingDays: 0,
        payoutRequestCap: dollars(RAPID_MAX_REQUEST),
        payoutTiers: [
            { thresholdProfit: dollars(0), traderShare: fraction(0.9) },
        ],
        profitTarget: size.profitTarget,
    };
}
