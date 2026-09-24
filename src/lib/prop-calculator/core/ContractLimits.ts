import { type ContractCount, type Dollars } from './lib/units';
import {
    selectTier,
    TierBasis,
    tierBreakpoints,
    type TierProfitContext,
    tierProfitFor,
} from './TierBasis';

export enum ContractLimitKind {
    Flat = 'flat',
    Tiered = 'tiered',
}

export type ContractLimitConfig =
    | {
          readonly kind: ContractLimitKind.Flat;
          readonly maxContracts: ContractCount;
      }
    | {
          readonly kind: ContractLimitKind.Tiered;
          readonly tierBasis?: TierBasis;
          readonly tiers: readonly ContractLimitTier[];
      };

export interface ContractLimits {
    readonly evalMicros: ContractCount | null;
    readonly evalMinis: ContractCount;
    readonly fundedMicros: ContractLimitConfig | null;
    readonly fundedMinis: ContractLimitConfig | null;
}

export interface ContractLimitTier {
    readonly maxContracts: ContractCount;
    readonly minBalance: Dollars;
}

export interface LiveContractLimits {
    readonly micros: ContractLimitConfig;
    readonly minis: ContractLimitConfig;
}

export function contractLimitTierBreakpoints(
    config: ContractLimitConfig | null,
    basis: TierBasis,
): readonly number[] {
    return config?.kind === ContractLimitKind.Tiered &&
        (config.tierBasis ?? TierBasis.LiveProfit) === basis
        ? tierBreakpoints(config.tiers.map((tier) => tier.minBalance))
        : [];
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
    return required !== null && required <= options.maxStopPoints;
}

export function maxContractsAt(
    config: ContractLimitConfig | null,
    context: TierProfitContext,
): ContractCount | null {
    if (config === null) return null;
    if (config.kind === ContractLimitKind.Flat) return config.maxContracts;
    const tierProfit = tierProfitFor(
        config.tierBasis ?? TierBasis.LiveProfit,
        context,
    );
    return (
        selectTier(config.tiers, tierProfit, (tier) => tier.minBalance)
            ?.maxContracts ?? null
    );
}

export function minStopPoints(
    riskDollars: number,
    contracts: number,
    pointValue: number,
): null | number {
    return riskDollars <= 0 || contracts <= 0 || pointValue <= 0
        ? null
        : riskDollars / (contracts * pointValue);
}
