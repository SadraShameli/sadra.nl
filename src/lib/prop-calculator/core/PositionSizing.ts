import {
    type ContractLimitConfig,
    type ContractLimits,
    maxContractsAt,
} from './ContractLimits';
import {
    INSTRUMENTS,
    type InstrumentSpec,
    type InstrumentSymbol,
} from './Instruments';
import {
    CENT_ROUNDING_TOLERANCE_IN_CENTS,
    CENTS_PER_DOLLAR,
    type ContractCount,
    contracts,
    points,
    type Points,
} from './lib/units';
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
                fundedContractLimit(limits, isMicro),
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

export function fundedContractLimit(
    limits: ContractLimits | null,
    isMicro: boolean,
): ContractLimitConfig | null {
    if (limits === null) return null;
    return isMicro ? limits.fundedMicros : limits.fundedMinis;
}

export function isBelowOneContract(
    intendedRisk: number,
    positionSizing: PositionSizingConfig,
): boolean {
    return (
        intendedRisk > 0 &&
        wholeContractCount(intendedRisk, positionSizing) === 0
    );
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

export function wholeContractCount(
    intendedRisk: number,
    positionSizing: PositionSizingConfig,
): ContractCount {
    const riskPerContract = oneContractRisk(positionSizing);
    return contracts(
        intendedRisk <= 0 || riskPerContract <= 0
            ? 0
            : Math.floor(
                  (intendedRisk * CENTS_PER_DOLLAR +
                      CENT_ROUNDING_TOLERANCE_IN_CENTS) /
                      (riskPerContract * CENTS_PER_DOLLAR),
              ),
    );
}

export function wholeContractRisk(
    intendedRisk: number,
    positionSizing: PositionSizingConfig,
    maxContracts: ContractCount | null,
): number {
    if (intendedRisk <= 0) return 0;
    const riskPerContract = oneContractRisk(positionSizing);
    if (riskPerContract <= 0) return intendedRisk;
    const fittingContracts = wholeContractCount(intendedRisk, positionSizing);
    const wholeContracts = Math.max(1, fittingContracts);
    const placedContracts =
        maxContracts === null
            ? wholeContracts
            : Math.min(wholeContracts, Math.max(0, maxContracts));
    const placedRisk = placedContracts * riskPerContract;
    return placedContracts <= fittingContracts
        ? Math.min(placedRisk, intendedRisk)
        : placedRisk;
}
