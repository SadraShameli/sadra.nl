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
    const completeMonths = statement.months.filter((month) => !month.isPartial);
    return {
        overall: statsOf(
            completeMonths.map((month) => month.net),
            completeMonths.map(() => target),
        ),
        perSlot: statsOf(
            slots.months.map((month) => month.netPerSlot),
            slots.months.map((month) =>
                perSlotTargetOf(target, month.slotMonths),
            ),
        ),
    };
}

function perSlotTargetOf(
    portfolioTarget: null | number,
    slotMonths: number,
): null | number {
    return portfolioTarget === null ? null : portfolioTarget / slotMonths;
}

function statsOf(
    values: readonly number[],
    targets: readonly (null | number)[],
): null | RepeatabilityStats {
    if (values.length === 0) return null;
    const count = values.length;
    const positive = values.filter((value) => value > 0).length;
    const hasTarget = targets.some((value) => value !== null);
    const atOrAboveTarget = values.filter((value, index) => {
        const target = targets[index] ?? null;
        return target !== null && value >= target;
    }).length;
    return {
        best: usdCents(Math.max(...values)),
        count,
        mean: roundCents(values.reduce((sum, value) => sum + value, 0) / count),
        shareAtOrAboveTarget: hasTarget ? atOrAboveTarget / count : null,
        sharePositive: positive / count,
        standardDeviation: roundCents(standardDeviation(values)),
        worst: usdCents(Math.min(...values)),
    };
}
