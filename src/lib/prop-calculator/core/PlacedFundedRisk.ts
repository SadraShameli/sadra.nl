import { formatGateCurrency } from '~/lib/format';

import { type InstrumentSymbol } from './Instruments';
import {
    CENT_ROUNDING_TOLERANCE_IN_CENTS,
    CENTS_PER_DOLLAR,
    type ContractCount,
    contracts,
    floorToWholeCents,
} from './lib/units';
import { type Plan } from './Plan';
import {
    contractLimitAt,
    isBelowOneContract,
    oneContractRisk,
    type PositionSizingConfig,
    resolvePositionSizing,
    wholeContractRisk,
} from './PositionSizing';
import { TradingPhase } from './TradingPhase';

export interface PlacedFundedRisk {
    contracts: ContractCount;
    isCapped: boolean;
    positionSizing: PositionSizingConfig;
    risk: number;
}

export interface PlacedFundedRiskInputs {
    fundedRiskPerTrade?: number | undefined;
    instrument?: InstrumentSymbol | undefined;
    riskPerTrade: number;
    stopPoints?: number | undefined;
}

export const FUNDED_START_TIER_CONTRACT_LIMIT =
    'the funded contract limit at the start tier';

export function formatOneContractRisk(
    positionSizing: PositionSizingConfig,
): string {
    return formatGateCurrency(
        Math.ceil(
            oneContractRisk(positionSizing) * CENTS_PER_DOLLAR -
                CENT_ROUNDING_TOLERANCE_IN_CENTS,
        ) / CENTS_PER_DOLLAR,
    );
}

export function formatWholeCentDollars(amount: number): string {
    return formatGateCurrency(floorToWholeCents(amount));
}

export function fundedStartContractLimit(
    plan: Plan,
    positionSizing: PositionSizingConfig,
): ContractCount | null {
    const state = plan.initialState();
    plan.beginFundedPhase(state);
    return contractLimitAt(
        plan.contractLimits,
        TradingPhase.Funded,
        positionSizing.instrument.isMicro,
        plan.tierProfitContext(state),
    );
}

export function placedFundedRisk(
    inputs: PlacedFundedRiskInputs,
    plan?: Plan,
): null | PlacedFundedRisk {
    const positionSizing = resolvePositionSizing(
        inputs.instrument,
        inputs.stopPoints,
    );
    return positionSizing === null
        ? null
        : placedFundedRiskAt(
              inputs.fundedRiskPerTrade ?? inputs.riskPerTrade,
              positionSizing,
              plan,
          );
}

export function placedFundedRiskAt(
    fundedRisk: number,
    positionSizing: PositionSizingConfig,
    plan?: Plan,
): PlacedFundedRisk {
    const placeableRisk = isBelowOneContract(fundedRisk, positionSizing)
        ? 0
        : fundedRisk;
    const uncapped = wholeContractRisk(placeableRisk, positionSizing, null);
    const risk = wholeContractRisk(
        placeableRisk,
        positionSizing,
        plan === undefined
            ? null
            : fundedStartContractLimit(plan, positionSizing),
    );
    return {
        contracts: contracts(
            Math.round(risk / oneContractRisk(positionSizing)),
        ),
        isCapped: risk < uncapped,
        positionSizing,
        risk,
    };
}
