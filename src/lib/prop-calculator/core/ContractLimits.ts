export interface ContractLimits {
    readonly evalMicros: null | number;
    readonly evalMinis: number;
    readonly fundedMicros: null | number;
    readonly fundedMinis: null | number;
}

export function isRungPlaceable(options: {
    contracts: number;
    maxStopPoints: number;
    pointValue: number;
    riskDollars: number;
}): boolean {
    const required = minStopPoints(
        options.riskDollars,
        options.contracts,
        options.pointValue,
    );
    if (required === null) return false;
    return required <= options.maxStopPoints;
}

export function minStopPoints(
    riskDollars: number,
    contracts: number,
    pointValue: number,
): null | number {
    if (riskDollars <= 0 || contracts <= 0 || pointValue <= 0) return null;
    return riskDollars / (contracts * pointValue);
}
