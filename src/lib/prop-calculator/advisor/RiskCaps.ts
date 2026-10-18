import {
    type ContractCount,
    contracts,
    type Dollars,
} from '~/lib/prop-calculator/core';

import { type PersonalCaps } from './PersonalCaps';

export interface RiskCaps extends PersonalCaps {
    readonly affordable: Dollars;
    readonly maxContracts: ContractCount | null;
}

export function contractLimitOf(limit: null | number): ContractCount | null {
    return limit === null ? null : contracts(limit);
}

export function riskCaps(
    affordable: Dollars,
    maxContracts: ContractCount | null,
    personal: PersonalCaps,
): RiskCaps {
    return { ...personal, affordable, maxContracts };
}
