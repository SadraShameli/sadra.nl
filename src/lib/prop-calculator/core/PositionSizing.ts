import {
    type ContractLimitConfig,
    type ContractLimits,
    maxContractsAt,
} from './ContractLimits';
import {
    INSTRUMENTS,
    type InstrumentSpec,
    type InstrumentSymbol,
    siblingInstrumentOf,
} from './Instruments';
import {
    CENT_ROUNDING_TOLERANCE_IN_CENTS,
    CENTS_PER_DOLLAR,
    type ContractCount,
    contracts,
    floorToWholeCents,
    points,
    type Points,
} from './lib/units';
import { type TierProfitContext } from './TierBasis';
import { TradingPhase } from './TradingPhase';

export enum MismatchSeverity {
    ExceedsPlannedRisk = 'exceedsPlannedRisk',
    ExceedsRoom = 'exceedsRoom',
    None = 'none',
}

export interface ContractsAtStopResult {
    readonly contracts: ContractCount;
    readonly fittingContracts: ContractCount;
    readonly isCapped: boolean;
    readonly leftover: number;
    readonly placedRisk: number;
}

export interface PositionSizingConfig {
    instrument: InstrumentSpec;
    stopPoints: Points;
}

export interface SiblingInstrumentRiskInput {
    readonly contracts: ContractCount;
    readonly instrument: InstrumentSpec;
    readonly room: number;
    readonly stopPoints: Points;
}

export interface SiblingInstrumentRiskResult {
    readonly severity: MismatchSeverity;
    readonly sibling: InstrumentSpec | null;
    readonly siblingRisk: null | number;
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

export function contractsAtStop(
    risk: number,
    positionSizing: PositionSizingConfig,
    maxContracts: ContractCount | null,
): ContractsAtStopResult {
    const fittingContracts = wholeContractCount(risk, positionSizing);
    const isCapped = maxContracts !== null && fittingContracts > maxContracts;
    const placedContracts = isCapped
        ? contracts(Math.max(0, maxContracts))
        : fittingContracts;
    const riskPerContract = oneContractRisk(positionSizing);
    const placedRisk = floorToWholeCents(placedContracts * riskPerContract);
    return {
        contracts: placedContracts,
        fittingContracts,
        isCapped,
        leftover: floorToWholeCents(risk - placedRisk),
        placedRisk,
    };
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

export function siblingInstrumentRisk(
    input: SiblingInstrumentRiskInput,
): SiblingInstrumentRiskResult {
    const { contracts: contractCount, instrument, room, stopPoints } = input;
    const sibling = siblingInstrumentOf(instrument.symbol);
    if (sibling === null) {
        return {
            severity: MismatchSeverity.None,
            sibling: null,
            siblingRisk: null,
        };
    }
    const plannedRisk = contractCount * instrument.pointValue * stopPoints;
    const siblingRisk = contractCount * sibling.pointValue * stopPoints;
    const severity =
        siblingRisk > room
            ? MismatchSeverity.ExceedsRoom
            : siblingRisk > plannedRisk
              ? MismatchSeverity.ExceedsPlannedRisk
              : MismatchSeverity.None;
    return { severity, sibling, siblingRisk };
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
