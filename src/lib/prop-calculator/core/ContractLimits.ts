import { type ContractCount, type Dollars } from './units';

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

export function maxContractsAt(
    config: ContractLimitConfig | null,
    balance: number,
): ContractCount | null {
    if (config === null) return null;
    if (config.kind === ContractLimitKind.Flat) return config.maxContracts;
    let best: ContractLimitTier | undefined;
    for (const tier of config.tiers) {
        if (
            balance >= tier.minBalance &&
            (!best || tier.minBalance > best.minBalance)
        ) {
            best = tier;
        }
    }
    return best?.maxContracts ?? config.tiers[0]?.maxContracts ?? null;
}

export function minStopPoints(
    riskDollars: number,
    contracts: number,
    pointValue: number,
): null | number {
    if (riskDollars <= 0 || contracts <= 0 || pointValue <= 0) return null;
    return riskDollars / (contracts * pointValue);
}
