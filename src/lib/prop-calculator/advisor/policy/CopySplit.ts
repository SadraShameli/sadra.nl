import { formatCurrency } from '~/lib/format';
import {
    objectiveApplicability,
    RankingSurface,
} from '~/lib/prop-calculator/advisor/actions/ObjectiveApplicability';
import { applyEnginePolicy } from '~/lib/prop-calculator/advisor/EnginePolicyBuilder';
import { DEFAULT_RULEBOOK } from '~/lib/prop-calculator/advisor/Rulebook';
import { SizingObjective } from '~/lib/prop-calculator/advisor/SizingObjective';
import {
    CENTS_PER_DOLLAR,
    contractsAtStop,
    type DayStopRule,
    DayStopRuleKind,
    evalContractLimit,
    formatOneContractRisk,
    formatWholeCentDollars,
    isBelowOneContract,
    type PositionSizingConfig,
    resolvePositionSizing,
} from '~/lib/prop-calculator/core';
import {
    type SimInputs,
    simInputsSizingIssue,
    type SimOutputs,
    simulate,
} from '~/lib/prop-calculator/simulator';
import { type UncertainValue } from '~/lib/prop-calculator/stats';

import {
    type EnginePolicy,
    LifetimePayoutCapBasis,
    RebuyLagBasis,
} from './EnginePolicy';

export enum CopySplitRowKind {
    Refused = 'refused',
    Simulated = 'simulated',
}

export type CopySplitCandidate =
    CopySplitRefusedCandidate | CopySplitSimulatedCandidate;

export interface CopySplitPlacement {
    readonly contracts: number;
    readonly placedRiskPerAccount: number;
}

export interface CopySplitRefusedCandidate {
    readonly kind: CopySplitRowKind.Refused;
    readonly reason: string;
    readonly riskPerAccount: number;
    readonly splitCount: number;
}

export type CopySplitRefusedRow = CopySplitRefusedCandidate;

export interface CopySplitResult extends RankedCopySplitRows {
    readonly basisLines: readonly string[];
    readonly trialsPerSplit: number;
}

export type CopySplitRow = CopySplitRefusedRow | CopySplitSimulatedRow;

export interface CopySplitSimulatedCandidate {
    readonly inputs: SimInputs;
    readonly kind: CopySplitRowKind.Simulated;
    readonly placement: CopySplitPlacement | null;
    readonly riskPerAccount: number;
    readonly splitCount: number;
}

export interface CopySplitSimulatedRow {
    readonly cycleNet: UncertainValue;
    readonly daysToPassP50: number;
    readonly kind: CopySplitRowKind.Simulated;
    readonly netPerFeeDollar: null | number;
    readonly passRate: number;
    readonly placement: CopySplitPlacement | null;
    readonly riskPerAccount: number;
    readonly splitCount: number;
    readonly totalFees: number;
    readonly totalMonthlyNet: UncertainValue;
    readonly trials: number;
}

export interface RankedCopySplitRows {
    readonly indistinguishableSplits: readonly number[];
    readonly note: null | string;
    readonly objective: SizingObjective;
    readonly requestedObjective: SizingObjective;
    readonly rows: readonly CopySplitRow[];
}

export const COPY_SPLIT_MIN_TRIALS = 50;
export const COPY_SPLIT_NOISE_SIGMAS = 2;
export const COPY_SPLIT_CORRELATION_NOTE =
    'the copies are engine copies that take identical trades, so they win and bust together: splitting does not diversify the group, it only changes the size of each account';

export const SIZING_OBJECTIVE_LABEL: Readonly<Record<SizingObjective, string>> =
    {
        [SizingObjective.CycleCash]: 'cycle cash',
        [SizingObjective.MonthlyNet]: 'monthly net',
        [SizingObjective.RuinFirst]: 'ruin first',
    };

export function copySplitBasisLines(
    base: SimInputs,
    policy: EnginePolicy,
): string[] {
    const lines = [
        `win rate ${(base.winrate * 100).toFixed(0)}% at 1:${base.rrRatio}, ${base.fundedHorizonDays} funded days`,
        fundedRiskLine(base),
        payoutLine(base, policy),
    ];
    const dayStopLine = dayStopBasisLine(base.dayStop);
    if (dayStopLine !== null) lines.push(dayStopLine);
    lines.push(
        policy.rebuyLagBasis === RebuyLagBasis.AssumedZero
            ? 'rebuy lag is assumed zero, which is optimistic'
            : `rebuy lag ${policy.rebuyLagDays} days, measured`,
    );
    if (
        policy.lifetimePayoutCapBasis ===
        LifetimePayoutCapBasis.LiveTriggersNotChecked
    ) {
        lines.push(
            'lifetime payout cap triggers are not checked against the live help center',
        );
    }
    if (resolvePositionSizing(base.instrument, base.stopPoints) === null) {
        lines.push(
            'no instrument and stop, so risk is not rounded to whole contracts',
        );
    }
    lines.push(COPY_SPLIT_CORRELATION_NOTE);
    return lines;
}

export function copySplitCandidates(
    base: SimInputs,
    policy: EnginePolicy,
    totalRisk: number,
    splits: readonly number[],
): CopySplitCandidate[] {
    assertValidSplits(totalRisk, splits);
    const trials = copySplitTrials(base.trials, splits);
    const positionSizing = resolvePositionSizing(
        base.instrument,
        base.stopPoints,
    );
    return splits.map((splitCount) =>
        candidateFor(
            base,
            policy,
            positionSizing,
            splitCount,
            totalRisk / splitCount,
            trials,
        ),
    );
}

export function copySplitTrials(
    trialBudget: number,
    splits: readonly number[],
): number {
    const accounts = splits.reduce((sum, split) => sum + split, 0);
    return Math.max(
        COPY_SPLIT_MIN_TRIALS,
        Math.floor(trialBudget / Math.max(1, accounts)),
    );
}

export function rankCopySplitRows(
    rows: readonly CopySplitRow[],
    requestedObjective: SizingObjective,
): RankedCopySplitRows {
    const applicability = objectiveApplicability(
        requestedObjective,
        RankingSurface.Advice,
    );
    const objective = applicability.effectiveObjective;
    const simulated = rows
        .filter(isSimulated)
        .toSorted((a, b) => compareRows(a, b, objective));
    const refused = rows.filter((row) => !isSimulated(row));
    return {
        indistinguishableSplits: indistinguishableFromBest(
            simulated,
            objective,
        ),
        note: applicability.reason,
        objective,
        requestedObjective,
        rows: [...simulated, ...refused],
    };
}

export function runCopySplit(
    base: SimInputs,
    policy: EnginePolicy,
    totalRisk: number,
    splits: readonly number[],
    objective: SizingObjective,
): CopySplitResult {
    const candidates = copySplitCandidates(base, policy, totalRisk, splits);
    const rows = candidates.map((candidate): CopySplitRow =>
        candidate.kind === CopySplitRowKind.Refused
            ? candidate
            : simulatedRow(candidate, simulate(candidate.inputs)),
    );
    return {
        ...rankCopySplitRows(rows, objective),
        basisLines: copySplitBasisLines(base, policy),
        trialsPerSplit: copySplitTrials(base.trials, splits),
    };
}

function assertValidSplits(totalRisk: number, splits: readonly number[]): void {
    if (!Number.isFinite(totalRisk) || totalRisk <= 0) {
        throw new RangeError(
            `copySplitCandidates: total risk must be a positive number, got ${totalRisk}`,
        );
    }
    if (splits.length === 0) {
        throw new RangeError(
            'copySplitCandidates: pass at least one split (an account count)',
        );
    }
    for (const split of splits) {
        if (!Number.isSafeInteger(split) || split < 1) {
            throw new RangeError(
                `copySplitCandidates: every split must be a whole number of accounts of at least 1, got ${split}`,
            );
        }
    }
    if (new Set(splits).size !== splits.length) {
        throw new RangeError(
            'copySplitCandidates: a split appears more than once',
        );
    }
}

function belowOneContractReason(
    riskPerAccount: number,
    positionSizing: null | PositionSizingConfig,
): null | string {
    return positionSizing === null ||
        !isBelowOneContract(riskPerAccount, positionSizing)
        ? null
        : `risk per account ${formatWholeCentDollars(riskPerAccount)} is below one ${positionSizing.instrument.symbol} contract's risk at a ${positionSizing.stopPoints} point stop (${formatOneContractRisk(positionSizing)}): this split would never trade in whole contracts, and rounding it up would risk more than asked`;
}

function candidateFor(
    base: SimInputs,
    policy: EnginePolicy,
    positionSizing: null | PositionSizingConfig,
    splitCount: number,
    riskPerAccount: number,
    trials: number,
): CopySplitCandidate {
    const refusal = belowOneContractReason(riskPerAccount, positionSizing);
    if (refusal !== null) {
        return refused(splitCount, riskPerAccount, refusal);
    }
    const inputs = applyEnginePolicy(base.plan, policy, {
        ...base,
        copyAccounts: splitCount,
        ...(base.dayStop !== undefined && {
            dayStop: splitDayStop(base.dayStop, splitCount),
        }),
        fundedRiskPerTrade: fundedRiskPerAccount(base),
        riskPerTrade: riskPerAccount,
        trials,
    });
    const sizingIssue = simInputsSizingIssue(inputs);
    if (sizingIssue !== null) {
        return refused(splitCount, riskPerAccount, sizingIssue);
    }
    return {
        inputs,
        kind: CopySplitRowKind.Simulated,
        placement: placementOf(inputs, positionSizing, riskPerAccount),
        riskPerAccount,
        splitCount,
    };
}

function compareRows(
    a: CopySplitSimulatedRow,
    b: CopySplitSimulatedRow,
    objective: SizingObjective,
): number {
    const monthly = b.totalMonthlyNet.value - a.totalMonthlyNet.value;
    const accounts = a.splitCount - b.splitCount;
    switch (objective) {
        case SizingObjective.CycleCash: {
            return b.cycleNet.value - a.cycleNet.value || monthly || accounts;
        }
        case SizingObjective.MonthlyNet:
        case SizingObjective.RuinFirst: {
            return monthly || accounts;
        }
    }
}

function dayStopBasisLine(rule: DayStopRule | undefined): null | string {
    return rule?.kind === DayStopRuleKind.AfterTarget
        ? `after-target day cap ${formatCurrency(rule.dollars)} is a group total, so each account gets its share of it together with the risk`
        : null;
}

function fundedRiskLine(base: SimInputs): string {
    const amount = formatCurrency(fundedRiskPerAccount(base));
    return base.fundedRiskPerTrade === undefined
        ? `funded risk ${amount} per account, the Hard Rule 5 fixed amount, not divided by the split`
        : `funded risk ${amount} per account as given, not divided by the split`;
}

function fundedRiskPerAccount(base: SimInputs): number {
    return (
        base.fundedRiskPerTrade ??
        DEFAULT_RULEBOOK.funded.riskCents / CENTS_PER_DOLLAR
    );
}

function indistinguishableFromBest(
    sorted: readonly CopySplitSimulatedRow[],
    objective: SizingObjective,
): number[] {
    const [best, ...rest] = sorted;
    if (best === undefined) return [];
    const bestFigure = objectiveFigure(best, objective);
    return rest
        .filter((row) => {
            const figure = objectiveFigure(row, objective);
            if (
                bestFigure.standardError === null ||
                figure.standardError === null
            ) {
                return false;
            }
            const combined = Math.hypot(
                bestFigure.standardError,
                figure.standardError,
            );
            return (
                Math.abs(bestFigure.value - figure.value) <
                COPY_SPLIT_NOISE_SIGMAS * combined
            );
        })
        .map((row) => row.splitCount);
}

function isSimulated(row: CopySplitRow): row is CopySplitSimulatedRow {
    return row.kind === CopySplitRowKind.Simulated;
}

function objectiveFigure(
    row: CopySplitSimulatedRow,
    objective: SizingObjective,
): UncertainValue {
    return objective === SizingObjective.CycleCash
        ? row.cycleNet
        : row.totalMonthlyNet;
}

function payoutLine(base: SimInputs, policy: EnginePolicy): string {
    const request = policy.payoutRequestOverride ?? base.payoutRequestSize;
    const cushion = policy.retainedCushionRequest;
    const requestText =
        request === undefined
            ? 'payout request not set'
            : `payout request ${formatCurrency(request)}`;
    const cushionText =
        cushion === null
            ? 'retained cushion at the documented minimum'
            : `retained cushion request ${formatCurrency(cushion)}`;
    return `${requestText}, ${cushionText}`;
}

function placementOf(
    inputs: SimInputs,
    positionSizing: null | PositionSizingConfig,
    riskPerAccount: number,
): CopySplitPlacement | null {
    if (positionSizing === null) return null;
    const placed = contractsAtStop(
        riskPerAccount,
        positionSizing,
        evalContractLimit(
            inputs.plan.contractLimits,
            positionSizing.instrument.isMicro,
        ),
    );
    return {
        contracts: placed.contracts,
        placedRiskPerAccount: placed.placedRisk,
    };
}

function refused(
    splitCount: number,
    riskPerAccount: number,
    reason: string,
): CopySplitRefusedCandidate {
    return {
        kind: CopySplitRowKind.Refused,
        reason,
        riskPerAccount,
        splitCount,
    };
}

function simulatedRow(
    candidate: CopySplitSimulatedCandidate,
    out: SimOutputs,
): CopySplitSimulatedRow {
    return {
        cycleNet: {
            standardError: out.estimates.expectedNet.standardError,
            value: out.expectedNet,
        },
        daysToPassP50: out.daysToPassP50,
        kind: CopySplitRowKind.Simulated,
        netPerFeeDollar:
            out.expectedTotalCost > 0
                ? out.expectedNet / out.expectedTotalCost
                : null,
        passRate: out.evalPassProbability,
        placement: candidate.placement,
        riskPerAccount: candidate.riskPerAccount,
        splitCount: candidate.splitCount,
        totalFees: out.expectedTotalCost,
        totalMonthlyNet: {
            standardError: out.estimates.expectedMonthlyNet.standardError,
            value: out.expectedMonthlyNet,
        },
        trials: candidate.inputs.trials,
    };
}

function splitDayStop(rule: DayStopRule, splitCount: number): DayStopRule {
    return rule.kind === DayStopRuleKind.AfterTarget
        ? { ...rule, dollars: rule.dollars / splitCount }
        : rule;
}
