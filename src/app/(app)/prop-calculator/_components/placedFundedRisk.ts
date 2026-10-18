import { formatCurrency } from '~/lib/format';
import {
    placedFundedRisk as enginePlacedFundedRisk,
    FUNDED_START_TIER_CONTRACT_LIMIT,
    type InstrumentSymbol,
    type PlacedFundedRisk,
    type Plan,
} from '~/lib/prop-calculator';

export interface PlacedFundedRiskInputs {
    instrument: InstrumentSymbol | undefined;
    plan: Plan;
    riskPerTrade: number;
    stopPoints: number | undefined;
}

export function describePlacedFundedRisk({
    contracts,
    isCapped,
    positionSizing,
    risk,
}: PlacedFundedRisk): string {
    const capNote = isCapped
        ? `, capped at ${FUNDED_START_TIER_CONTRACT_LIMIT}`
        : '';
    return `Funded risk placed in whole contracts: ${contracts} ${positionSizing.instrument.symbol} at a ${positionSizing.stopPoints} point stop, ${formatCurrency(risk)} per trade${capNote}.`;
}

export function placedFundedRisk({
    plan,
    ...inputs
}: PlacedFundedRiskInputs): null | PlacedFundedRisk {
    return enginePlacedFundedRisk(inputs, plan);
}
