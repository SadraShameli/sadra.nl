import { type FirmPolicySource } from './FirmPolicySource';

export enum ConductCategory {
    AccountRolling = 'account-rolling',
    ExcessivePurchases = 'excessive-purchases',
    InconsistentSizing = 'inconsistent-sizing',
    MaxSizeMostTrades = 'max-size-most-trades',
    Microscalping = 'microscalping',
    NewsSizing = 'news-sizing',
    RapidRebuys = 'rapid-rebuys',
    ScalingCircumvention = 'scaling-circumvention',
}

export interface ConductPattern {
    readonly category: ConductCategory;
    readonly consequence: string;
    readonly source: FirmPolicySource;
}

const AGGRESSIVE_SIZING_CATEGORIES: ReadonlySet<ConductCategory> = new Set([
    ConductCategory.InconsistentSizing,
    ConductCategory.MaxSizeMostTrades,
    ConductCategory.Microscalping,
    ConductCategory.NewsSizing,
]);

const REBUY_CATEGORIES: ReadonlySet<ConductCategory> = new Set([
    ConductCategory.AccountRolling,
    ConductCategory.ExcessivePurchases,
    ConductCategory.RapidRebuys,
    ConductCategory.ScalingCircumvention,
]);

export function isAggressiveSizingConcern(pattern: ConductPattern): boolean {
    return AGGRESSIVE_SIZING_CATEGORIES.has(pattern.category);
}

export function isRebuyConcern(pattern: ConductPattern): boolean {
    return REBUY_CATEGORIES.has(pattern.category);
}
