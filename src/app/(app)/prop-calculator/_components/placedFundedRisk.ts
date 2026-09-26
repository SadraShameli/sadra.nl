import { formatCurrency } from '~/lib/format';
import {
    type ContractCount,
    contractLimitAt,
    type InstrumentSymbol,
    oneContractRisk,
    type Plan,
    type PositionSizingConfig,
    resolvePositionSizing,
    TradingPhase,
    wholeContractRisk,
} from '~/lib/prop-calculator';

export interface PlacedFundedRisk {
    contracts: number;
    isCapped: boolean;
    risk: number;
    stopPoints: number;
    symbol: InstrumentSymbol;
}

export interface PlacedFundedRiskInputs {
    instrument: InstrumentSymbol | undefined;
    plan: Plan;
    riskPerTrade: number;
    stopPoints: number | undefined;
}

export function describePlacedFundedRisk(placed: PlacedFundedRisk): string {
    const capNote = placed.isCapped
        ? ', capped at the funded contract limit at the start tier'
        : '';
    return `Funded risk placed in whole contracts: ${placed.contracts} ${placed.symbol} at a ${placed.stopPoints} point stop, ${formatCurrency(placed.risk)} per trade${capNote}.`;
}

export function placedFundedRisk({
    instrument,
    plan,
    riskPerTrade,
    stopPoints,
}: PlacedFundedRiskInputs): null | PlacedFundedRisk {
    const positionSizing = resolvePositionSizing(instrument, stopPoints);
    if (positionSizing === null) return null;
    const contractRisk = oneContractRisk(positionSizing);
    const isBelowOneContract = riskPerTrade < contractRisk;
    const uncapped = isBelowOneContract
        ? 0
        : wholeContractRisk(riskPerTrade, positionSizing, null);
    const risk = isBelowOneContract
        ? 0
        : wholeContractRisk(
              riskPerTrade,
              positionSizing,
              fundedStartContractLimit(plan, positionSizing),
          );
    return {
        contracts: Math.round(risk / contractRisk),
        isCapped: risk < uncapped,
        risk,
        stopPoints: positionSizing.stopPoints,
        symbol: positionSizing.instrument.symbol,
    };
}

function fundedStartContractLimit(
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
