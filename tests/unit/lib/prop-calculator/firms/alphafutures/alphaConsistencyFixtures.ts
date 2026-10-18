import {
    AlphaFuturesVariant,
    type ConsistencyBoundary,
    ConsistencyNonPositiveProfit,
    ConsistencyRule,
    ConsistencyScope,
    DailyLossLimitKind,
    dollars,
    EodTrailingDrawdown,
    FirmId,
    fraction,
    type Plan,
} from '~/lib/prop-calculator';
import { AlphaFutures } from '~/lib/prop-calculator/firms/alphafutures/AlphaFutures';

export const alphaFirm = new AlphaFutures();

export function alphaPlan(variant: AlphaFuturesVariant): Plan {
    const plan = alphaFirm.findPlan({
        accountSize: 50_000,
        firm: FirmId.AlphaFutures,
        variant,
    });
    if (!plan) throw new Error(`Alpha Futures ${variant} 50K plan not found`);
    return plan;
}

export function alphaToy(rule: ConsistencyRule): Plan {
    return alphaPlan(AlphaFuturesVariant.Standard).withOverrides({
        accountSize: dollars(1000),
        consistency: null,
        contractLimits: undefined,
        drawdown: new EodTrailingDrawdown({ amount: dollars(100) }),
        evalDailyLossLimit: { kind: DailyLossLimitKind.None },
        fundedConsistency: { kind: 'set', rule },
        fundedDailyLossLimit: { kind: DailyLossLimitKind.None },
        fundedDrawdown: new EodTrailingDrawdown({
            amount: dollars(100),
            lock: {
                atProfit: dollars(150),
                lockedThreshold: () => 1000,
            },
        }),
        isInstantFunded: true,
        maxLifetimePayouts: 3,
        minDaysAfterPassForPayout: 0,
        minPayoutRequest: dollars(0),
        minQualifyingDayProfit: null,
        minTradingDays: 0,
        payoutRequestCap: undefined,
        payoutTiers: [
            { thresholdProfit: dollars(0), traderShare: fraction(1) },
        ],
        payoutTiersFromPayout: undefined,
    });
}

export function lossExemptRuleOf(rule: ConsistencyRule): ConsistencyRule {
    return withRule(rule, {
        nonPositiveProfit: ConsistencyNonPositiveProfit.Passes,
    });
}

export function qualifiedAlphaRule(): ConsistencyRule {
    const rule = alphaPlan(AlphaFuturesVariant.Standard).fundedConsistencyRule(
        1,
    );
    if (rule === null) {
        throw new Error('Alpha Standard has no Qualified consistency rule');
    }
    return rule;
}

export function withRule(
    rule: ConsistencyRule,
    changes: {
        boundary?: ConsistencyBoundary;
        nonPositiveProfit?: ConsistencyNonPositiveProfit;
    },
): ConsistencyRule {
    return new ConsistencyRule(
        ConsistencyScope.Funded,
        rule.maxBestDayShare,
        rule.basis,
        rule.violationEffect,
        changes.boundary ?? rule.boundary,
        changes.nonPositiveProfit ?? rule.nonPositiveProfit,
    );
}
