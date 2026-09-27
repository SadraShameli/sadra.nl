import { type ContractCount, type Dollars } from '../core';
import { type PersonalCaps } from './PersonalCaps';

export interface RiskCaps extends PersonalCaps {
    readonly affordable: Dollars;
    readonly maxContracts: ContractCount | null;
}

export function riskCaps(
    affordable: Dollars,
    maxContracts: ContractCount | null,
    personal: PersonalCaps,
): RiskCaps {
    return { ...personal, affordable, maxContracts };
}
