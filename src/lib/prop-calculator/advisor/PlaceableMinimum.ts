import {
    type Dollars,
    dollars,
    floorToWholeCents,
    type InstrumentSymbol,
    ONE_CENT,
    oneContractRisk,
    PolicySizing,
    resolvePositionSizing,
} from '~/lib/prop-calculator/core';

const UNIT_COUNT_TOLERANCE = 1e-9;

export interface SizingPlacement {
    readonly instrument?: InstrumentSymbol | undefined;
    readonly stopPoints?: number | undefined;
}

const ADVISOR_CARD_SIZING = PolicySizing.WholeContracts;

export function advisorPlaceableMinimum(
    placement: null | SizingPlacement | undefined,
): Dollars {
    return placeableMinimumFor(ADVISOR_CARD_SIZING, placement);
}

export function floorToPlaceableUnit(amount: number, unit: number): number {
    return floorToWholeCents(
        Math.floor(amount / unit + UNIT_COUNT_TOLERANCE) * unit,
    );
}

export function placeableMinimumFor(
    sizing: PolicySizing,
    placement: null | SizingPlacement | undefined,
): Dollars {
    if (placement && sizing === PolicySizing.WholeContracts) {
        const resolved = resolvePositionSizing(
            placement.instrument,
            placement.stopPoints,
        );
        if (resolved) return dollars(oneContractRisk(resolved));
    }
    return ONE_CENT;
}
