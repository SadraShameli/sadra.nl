import { type ContractLimits, maxContractsAt } from './ContractLimits';
import {
    INSTRUMENTS,
    type InstrumentSpec,
    type InstrumentSymbol,
} from './Instruments';
import { type ContractCount, points, type Points } from './lib/units';
import { type TierProfitContext } from './TierBasis';
import { TradingPhase } from './TradingPhase';

export interface PositionSizingConfig {
    instrument: InstrumentSpec;
    stopPoints: Points;
}

export function capRiskToContractLimit(
    intendedRisk: number,
    positionSizing: PositionSizingConfig,
    maxContracts: ContractCount | null,
): number {
    if (maxContracts === null) return intendedRisk;
    if (maxContracts <= 0) return 0;
    const riskPerContract = oneContractRisk(positionSizing);
    if (riskPerContract <= 0) return intendedRisk;
    const impliedContracts = intendedRisk / riskPerContract;
    return impliedContracts <= maxContracts
        ? intendedRisk
        : maxContracts * riskPerContract;
}

export function contractLimitAt(
    limits: ContractLimits | null,
    phase: TradingPhase,
    isMicro: boolean,
    context: TierProfitContext,
): ContractCount | null {
    if (limits === null) return null;
    switch (phase) {
        case TradingPhase.Eval: {
            return evalContractLimit(limits, isMicro);
        }
        case TradingPhase.Funded: {
            return maxContractsAt(
                isMicro ? limits.fundedMicros : limits.fundedMinis,
                context,
            );
        }
    }
}

export function evalContractLimit(
    limits: ContractLimits | null,
    isMicro: boolean,
): ContractCount | null {
    if (limits === null) return null;
    return isMicro ? limits.evalMicros : limits.evalMinis;
}

export function oneContractRisk(positionSizing: PositionSizingConfig): number {
    return positionSizing.instrument.pointValue * positionSizing.stopPoints;
}

export function resolvePositionSizing(
    instrument: InstrumentSymbol | undefined,
    stopPoints: number | undefined,
): null | PositionSizingConfig {
    return instrument === undefined ||
        stopPoints === undefined ||
        !Number.isFinite(stopPoints) ||
        stopPoints <= 0
        ? null
        : {
              instrument: INSTRUMENTS[instrument],
              stopPoints: points(stopPoints),
          };
}

export function wholeContractRisk(
    intendedRisk: number,
    positionSizing: PositionSizingConfig,
    maxContracts: ContractCount | null,
): number {
    if (intendedRisk <= 0) return 0;
    const riskPerContract = oneContractRisk(positionSizing);
    if (riskPerContract <= 0) return intendedRisk;
    const wholeContracts = Math.max(
        1,
        Math.floor(intendedRisk / riskPerContract),
    );
    const placedContracts =
        maxContracts === null
            ? wholeContracts
            : Math.min(wholeContracts, Math.max(0, maxContracts));
    return placedContracts * riskPerContract;
}
