import {
    type DocumentedPolicySpec,
    toSimInputs,
} from '~/lib/prop-calculator/advisor/policy';
import {
    type ReconstructedAccount,
    type ReconstructedFundedOrEvalAccount,
    ReconstructedLiveKind,
} from '~/lib/prop-calculator/advisor/ReconstructedAccount';
import {
    type ContractCount,
    contractLimitAt,
    contractsAtStop,
    type PositionSizingConfig,
    resolvePositionSizing,
    TRADING_DAYS_PER_MONTH,
    TradingPhase,
} from '~/lib/prop-calculator/core';
import { simulate } from '~/lib/prop-calculator/simulator';
import { type UncertainValue } from '~/lib/prop-calculator/stats';

import { tradeValueSwing, type TradeValueSwingResult } from './TradeValueSwing';
import { requireValue } from './ValueChain';
import {
    conservativeGapStandardError,
    notModeled,
    type ValueNotModeledResult,
    ValueResultKind,
    ValueUnavailableReason,
} from './ValueEstimate';

export enum RiskCandidateBasis {
    Simulator = 'simulator',
}

export const RISK_CANDIDATE_LABEL =
    'one-step comparison, documented sizing afterwards';

export interface RiskCandidatePlacement {
    readonly contracts: ContractCount | null;
    readonly intendedRisk: number;
    readonly placedRisk: number;
}

export interface RiskCandidateRequest {
    readonly riskGrid: readonly number[];
    readonly rr: number;
}

export interface RiskCandidateRow {
    readonly continuationValue: UncertainValue;
    readonly monthlyNetCharge: number;
    readonly netOfDurationCharge: number;
    readonly placement: RiskCandidatePlacement;
    readonly swing: TradeValueSwingResult;
}

export type RiskCandidateValuesOutcome =
    RiskCandidateValuesResult | ValueNotModeledResult;

export interface RiskCandidateValuesResult {
    readonly basis: RiskCandidateBasis;
    readonly kind: ValueResultKind.Candidates;
    readonly label: typeof RISK_CANDIDATE_LABEL;
    readonly rows: readonly RiskCandidateRow[];
}

export function continuationValue(
    p: number,
    vWin: number,
    vLoss: number,
): number {
    return p * vWin + (1 - p) * vLoss;
}

export function riskCandidateValues(
    account: ReconstructedAccount,
    spec: DocumentedPolicySpec,
    request: RiskCandidateRequest,
): RiskCandidateValuesOutcome {
    if (account.kind === ReconstructedLiveKind.Live) {
        return notModeled(ValueUnavailableReason.LiveNotModeled);
    }

    const positionSizing = resolvePositionSizing(
        spec.enginePolicy.instrument,
        spec.enginePolicy.stopPoints,
    );
    const maxContracts = maxContractsFor(account, positionSizing);
    const monthlyNetCharge = monthlyNetChargeFor(account, spec);

    const rows = request.riskGrid.map((intendedRisk): RiskCandidateRow => {
        const placement = placementOf(
            intendedRisk,
            positionSizing,
            maxContracts,
        );
        const swing = swingFor(account, spec, placement.placedRisk, request.rr);
        const value = continuationValue(
            swing.winProbability,
            swing.afterWin.creditInclusive.value,
            swing.afterLoss.creditInclusive.value,
        );
        const standardError = conservativeGapStandardError(
            swing.afterWin.creditInclusive.standardError,
            swing.afterLoss.creditInclusive.standardError,
        );
        return {
            continuationValue: { standardError, value },
            monthlyNetCharge,
            netOfDurationCharge: value - monthlyNetCharge,
            placement,
            swing,
        };
    });

    return {
        basis: RiskCandidateBasis.Simulator,
        kind: ValueResultKind.Candidates,
        label: RISK_CANDIDATE_LABEL,
        rows: rows.toSorted(
            (a, b) => b.netOfDurationCharge - a.netOfDurationCharge,
        ),
    };
}

function maxContractsFor(
    account: ReconstructedFundedOrEvalAccount,
    positionSizing: null | PositionSizingConfig,
): ContractCount | null {
    return positionSizing === null
        ? null
        : contractLimitAt(
              account.plan.contractLimits,
              account.kind,
              positionSizing.instrument.isMicro,
              account.plan.tierProfitContext(account.state),
          );
}

function monthlyNetChargeFor(
    account: ReconstructedFundedOrEvalAccount,
    spec: DocumentedPolicySpec,
): number {
    const freshOutputs = simulate(toSimInputs(account.plan, spec));
    const tradesPerDay =
        account.kind === TradingPhase.Funded
            ? spec.rulebook.funded.tradesPerDayMax
            : spec.rulebook.strategy.tradesPerDayMax;
    return (
        freshOutputs.expectedMonthlyNet / TRADING_DAYS_PER_MONTH / tradesPerDay
    );
}

function placementOf(
    intendedRisk: number,
    positionSizing: null | PositionSizingConfig,
    maxContracts: ContractCount | null,
): RiskCandidatePlacement {
    if (positionSizing === null) {
        return { contracts: null, intendedRisk, placedRisk: intendedRisk };
    }
    const placed = contractsAtStop(intendedRisk, positionSizing, maxContracts);
    return {
        contracts: placed.contracts,
        intendedRisk,
        placedRisk: placed.placedRisk,
    };
}

function swingFor(
    account: ReconstructedFundedOrEvalAccount,
    spec: DocumentedPolicySpec,
    risk: number,
    rr: number,
): TradeValueSwingResult {
    return requireValue(tradeValueSwing(account, spec, { risk, rr }));
}
