import { type UsdCents, usdCents } from '~/lib/prop-accounts/core';
import { meanStandardError } from '~/lib/prop-calculator/stats';

import { type MonthlyStatement } from './MonthlyStatement';
import {
    roundCents,
    type SampledEstimate,
    sampledRate,
} from './PortfolioLedger';
import { type RealizedNetPerSlot } from './RealizedNetPerSlot';

export interface Repeatability {
    readonly overall: null | RepeatabilityStats;
    readonly perSlot: null | RepeatabilityStats;
}

export interface RepeatabilityStats {
    readonly best: UsdCents;
    readonly count: number;
    readonly mean: UsdCents;
    readonly shareAtOrAboveTarget: null | SampledEstimate;
    readonly sharePositive: SampledEstimate;
    readonly standardDeviation: UsdCents;
    readonly worst: UsdCents;
}

export function repeatability(
    statement: MonthlyStatement,
    slots: RealizedNetPerSlot,
    target: null | number,
): Repeatability {
    const completeMonths = statement.months.filter((month) => !month.isPartial);
    const partialMonths = new Set(
        statement.months
            .filter((month) => month.isPartial)
            .map((month) => month.month),
    );
    const completeSlotMonths = slots.months.filter(
        (month) => !partialMonths.has(month.month),
    );
    return {
        overall: statsOf(
            completeMonths.map((month) => month.net),
            completeMonths.map((month) => month.payouts),
            completeMonths.map(() => target),
        ),
        perSlot: statsOf(
            completeSlotMonths.map((month) => month.netPerSlot),
            completeSlotMonths.map((month) => month.payouts),
            completeSlotMonths.map(() => target),
        ),
    };
}

function statsOf(
    nets: readonly number[],
    payouts: readonly number[],
    targets: readonly (null | number)[],
): null | RepeatabilityStats {
    const count = nets.length;
    const sharePositive = sampledRate(
        nets.filter((net) => net > 0).length,
        count,
    );
    if (sharePositive === null) return null;
    const sum = nets.reduce((total, net) => total + net, 0);
    const squaredSum = nets.reduce((total, net) => total + net * net, 0);
    const hasTarget = targets.some((value) => value !== null);
    const atOrAboveTarget = payouts.filter((payout, index) => {
        const target = targets[index] ?? null;
        return target !== null && payout >= target;
    }).length;
    return {
        best: usdCents(Math.max(...nets)),
        count,
        mean: roundCents(sum / count),
        shareAtOrAboveTarget: hasTarget
            ? sampledRate(atOrAboveTarget, count)
            : null,
        sharePositive,
        standardDeviation: roundCents(
            meanStandardError(sum, squaredSum, count) * Math.sqrt(count),
        ),
        worst: usdCents(Math.min(...nets)),
    };
}
