import { type ContractLimits, maxContractsAt } from './ContractLimits';
import {
    INSTRUMENTS,
    type InstrumentSpec,
    type InstrumentSymbol,
} from './Instruments';
import { TradingPhase } from './TradingPhase';
import { type ContractCount, points, type Points } from './units';

export interface PositionSizingConfig {
    instrument: InstrumentSpec;
    stopPoints: Points;
}

export function capRiskToContractLimit(
    intendedRisk: number,
    positionSizing: PositionSizingConfig,
    maxContracts: ContractCount | null,
): number {
    if (maxContracts === null || maxContracts <= 0) return intendedRisk;
    const riskPerContract =
        positionSizing.instrument.pointValue * positionSizing.stopPoints;
    if (riskPerContract <= 0) return intendedRisk;
    const impliedContracts = intendedRisk / riskPerContract;
    if (impliedContracts <= maxContracts) return intendedRisk;
    return maxContracts * riskPerContract;
}

export function resolveContractLimit(
    limits: ContractLimits | null,
    phase: TradingPhase,
    isMicro: boolean,
    accountProfit: number,
): ContractCount | null {
    if (limits === null) return null;
    if (phase !== TradingPhase.Funded) {
        return isMicro ? limits.evalMicros : limits.evalMinis;
    }
    return maxContractsAt(
        isMicro ? limits.fundedMicros : limits.fundedMinis,
        accountProfit,
    );
}

export function resolvePositionSizing(
    instrument: InstrumentSymbol | undefined,
    stopPoints: number | undefined,
): null | PositionSizingConfig {
    if (instrument === undefined || stopPoints === undefined) return null;
    if (!Number.isFinite(stopPoints) || stopPoints <= 0) return null;
    return {
        instrument: INSTRUMENTS[instrument],
        stopPoints: points(stopPoints),
    };
}
