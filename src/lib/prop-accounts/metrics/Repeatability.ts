import { type UsdCents, usdCents } from '~/lib/prop-accounts/core';
import { standardDeviation } from '~/lib/prop-calculator/stats';

import { type MonthlyStatement } from './MonthlyStatement';
import { roundCents } from './PortfolioLedger';
import { type RealizedNetPerSlot } from './RealizedNetPerSlot';

export interface Repeatability {
    readonly overall: null | RepeatabilityStats;
    readonly perSlot: null | RepeatabilityStats;
}

export interface RepeatabilityStats {
    readonly best: UsdCents;
    readonly count: number;
    readonly mean: UsdCents;
    readonly shareAtOrAboveTarget: null | number;
    readonly sharePositive: number;
    readonly standardDeviation: UsdCents;
    readonly worst: UsdCents;
}

export function repeatability(
    statement: MonthlyStatement,
    slots: RealizedNetPerSlot,
    target: null | number,
): Repeatability {
    const completeMonths = statement.months
        .filter((month) => !month.isPartial)
        .map((month) => month.net);
    const slotNets = slots.months.map((month) => month.netPerSlot);
    return {
        overall: statsOf(completeMonths, target),
        perSlot: statsOf(slotNets, target),
    };
}

function statsOf(
    values: readonly number[],
    target: null | number,
): null | RepeatabilityStats {
    if (values.length === 0) return null;
    const count = values.length;
    const positive = values.filter((value) => value > 0).length;
    return {
        best: usdCents(Math.max(...values)),
        count,
        mean: roundCents(values.reduce((sum, value) => sum + value, 0) / count),
        shareAtOrAboveTarget:
            target === null
                ? null
                : values.filter((value) => value >= target).length / count,
        sharePositive: positive / count,
        standardDeviation: roundCents(standardDeviation(values)),
        worst: usdCents(Math.min(...values)),
    };
}
