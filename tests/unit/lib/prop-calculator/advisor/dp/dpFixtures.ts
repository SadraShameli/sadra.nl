import { SizingObjective } from '~/lib/prop-calculator/advisor';
import { type DpSolveConfig } from '~/lib/prop-calculator/advisor/dp';
import {
    DailyLossLimitKind,
    dollars,
    EodTrailingDrawdown,
    FirmId,
    fraction,
    MffuVariant,
    NO_PLAN_OPT_INS,
    type Plan,
    RetryKind,
    serializePlanId,
} from '~/lib/prop-calculator/core';
import { MyFundedFutures } from '~/lib/prop-calculator/firms/mffu/MyFundedFutures';

export const TOY_FINGERPRINT = 'f'.repeat(64);

export function toyDpConfig(
    plan: Plan,
    overrides: Partial<DpSolveConfig> = {},
): DpSolveConfig {
    return {
        commission: 0,
        copyAccounts: 1,
        discounts: null,
        evalGrid: {
            actionStepDollars: 50,
            cushionStepDollars: 50,
            maxActionDollars: 50,
            profitStepDollars: 50,
        },
        fundedGrid: {
            actionStepMultiple: 1,
            cushionStepMultiple: 1,
            maxActionMultiple: 1,
        },
        fundedHorizonDays: 252,
        lifetimePayoutCapOverride: null,
        maxEvalDays: 1,
        maxSolves: 10,
        objective: SizingObjective.MonthlyNet,
        optIns: NO_PLAN_OPT_INS,
        planRulesFingerprint: TOY_FINGERPRINT,
        planSerial: serializePlanId(plan.id),
        positionSizing: null,
        rateTolerancePerDay: null,
        rebuyLagDays: 0,
        rrRatio: 2,
        startRatePerDay: null,
        tradesPerDay: 1,
        winrate: 0.5,
        ...overrides,
    };
}

export function toyDpPlan(): Plan {
    const base = new MyFundedFutures().findPlan({
        accountSize: 50_000,
        firm: FirmId.Mffu,
        variant: MffuVariant.RapidEod,
    });
    if (!base) throw new Error('MFF Rapid EOD 50K plan not found');
    return base.withOverrides({
        accountSize: dollars(1000),
        consistency: null,
        contractLimits: undefined,
        drawdown: new EodTrailingDrawdown({ amount: dollars(100) }),
        evalDailyLossLimit: { kind: DailyLossLimitKind.None },
        fees: {
            activation: dollars(0),
            monthlySubscription: dollars(0),
            oneTimeEval: dollars(10),
            reset: dollars(10),
            retry: RetryKind.Rebuy,
        },
        fundedConsistency: { kind: 'set', rule: null },
        fundedDailyLossLimit: { kind: DailyLossLimitKind.None },
        fundedDrawdown: new EodTrailingDrawdown({
            amount: dollars(100),
            lock: {
                atProfit: dollars(150),
                lockedThreshold: () => 1000,
            },
        }),
        isInstantFunded: false,
        maxLifetimePayouts: 1,
        minDaysAfterPassForPayout: 0,
        minPayoutProfit: dollars(0),
        minPayoutProfitPerCycle: dollars(0),
        minPayoutRequest: dollars(0),
        minQualifyingDayProfit: null,
        minTradingDays: 0,
        payoutBalanceShareCap: undefined,
        payoutRequestCap: undefined,
        payoutTiers: [
            { thresholdProfit: dollars(0), traderShare: fraction(1) },
        ],
        profitTarget: dollars(50),
    });
}
