export enum RoiBasis {
    AnnualisedOnCost = 'annualised-on-cost',
    TotalOnCost = 'total-on-cost',
}

export interface Roi {
    readonly basis: RoiBasis;
    readonly value: number;
}

export const ROI_BASIS_LABEL: Record<RoiBasis, string> = {
    [RoiBasis.AnnualisedOnCost]: 'Annual ROI on fees',
    [RoiBasis.TotalOnCost]: 'ROI on cost',
};

export function annualisedRoiOnCost(monthlyNet: number, cost: number): Roi {
    return {
        basis: RoiBasis.AnnualisedOnCost,
        value: cost > 0 ? (monthlyNet * 12) / cost : 0,
    };
}

export function totalRoiOnCost(net: number, cost: number): Roi {
    return {
        basis: RoiBasis.TotalOnCost,
        value: cost > 0 ? net / cost : 0,
    };
}
