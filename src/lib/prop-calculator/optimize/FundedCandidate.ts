import { z } from 'zod';

import {
    type DayStopRule,
    formatWholeCentDollars,
    fraction,
    FUNDED_START_TIER_CONTRACT_LIMIT,
    ladderRungsSchema,
    type PlacedFundedRisk,
    placedFundedRiskAt,
    type Plan,
    policySizingOf,
    type PositionSizingConfig,
    TradingPhase,
} from '~/lib/prop-calculator/core';
import { type SimInputs, simInputsSizingIssue } from '~/lib/prop-calculator/simulator';

export enum FundedCandidateBuildKind {
    Built = 'built',
    Refused = 'refused',
}

export enum FundedCandidateRefusal {
    InvalidLists = 'invalid-lists',
    LadderRungBelowOneContract = 'ladder-rung-below-one-contract',
    NoCandidates = 'no-candidates',
    PercentNeedsStop = 'percent-needs-stop',
}

export interface FundedCandidate {
    label: string;
    overrides: Partial<SimInputs>;
}

export const DEFAULT_FUNDED_FLAT_CANDIDATES: readonly number[] = [
    150, 200, 250, 300, 400, 500,
];

export const DEFAULT_FUNDED_PERCENT_CANDIDATES: readonly number[] = [
    5, 7.5, 10, 15,
];

export const fundedFlatCandidateSchema = z.number().positive();

export const fundedPercentCandidateSchema = z.number().positive().max(100);

export const fundedCandidateListsSchema = z.object({
    flat: z
        .array(fundedFlatCandidateSchema)
        .readonly()
        .default(DEFAULT_FUNDED_FLAT_CANDIDATES),
    fundedLadder: ladderRungsSchema.nullable(),
    percent: z.array(fundedPercentCandidateSchema).readonly().optional(),
});

export interface BuiltFundedCandidates {
    candidates: FundedCandidate[];
    flatsBelowOneContract: number[];
    kind: FundedCandidateBuildKind.Built;
    placedFlats: number[];
}

export type FundedCandidateBuild =
    BuiltFundedCandidates | RefusedFundedCandidates;

export interface FundedCandidateOptions extends z.input<
    typeof fundedCandidateListsSchema
> {
    plan: null | Plan;
    positionSizing: null | PositionSizingConfig;
    stopRule: DayStopRule;
}

export type FundedCandidateRefusalDetail =
    | {
          flatsBelowOneContract: number[];
          kind: FundedCandidateRefusal.NoCandidates;
      }
    | {
          issues: string;
          kind: FundedCandidateRefusal.InvalidLists;
      }
    | {
          kind: FundedCandidateRefusal.LadderRungBelowOneContract;
          ladder: number[];
          positionSizing: PositionSizingConfig;
          rungsBelowOneContract: number[];
      }
    | {
          kind: FundedCandidateRefusal.PercentNeedsStop;
          percent: number[];
      };

export interface RefusedFundedCandidates {
    kind: FundedCandidateBuildKind.Refused;
    refusal: FundedCandidateRefusalDetail;
}

type CandidateSizingOverrides = Pick<
    SimInputs,
    'fundedCushionPercent' | 'fundedRiskPerTrade'
>;

export function buildFundedCandidates(
    options: FundedCandidateOptions,
): FundedCandidateBuild {
    const lists = fundedCandidateListsSchema.safeParse({
        flat: options.flat,
        fundedLadder: options.fundedLadder,
        percent: options.percent,
    });
    if (!lists.success) {
        return refused({
            issues: lists.error.issues.map((issue) => issue.message).join('; '),
            kind: FundedCandidateRefusal.InvalidLists,
        });
    }
    const { flat, fundedLadder, percent } = lists.data;
    const { plan, positionSizing, stopRule } = options;
    const isPlaced = (dollar: number): boolean =>
        candidateSizingIssue(flatOverrides(dollar), positionSizing) === null;
    const placedFlats = flat.filter(isPlaced);
    const flatsBelowOneContract = flat.filter((dollar) => !isPlaced(dollar));

    const percentCandidates = (
        percent ?? DEFAULT_FUNDED_PERCENT_CANDIDATES
    ).map((pct): FundedCandidate => ({
        label: `${pct}% cushion`,
        overrides: percentOverrides(pct),
    }));
    const isPercentRefused = percentCandidates.some(
        (candidate) =>
            candidateSizingIssue(candidate.overrides, positionSizing) !== null,
    );
    if (isPercentRefused && percent !== undefined) {
        return refused({
            kind: FundedCandidateRefusal.PercentNeedsStop,
            percent: [...percent],
        });
    }

    if (fundedLadder !== null && positionSizing !== null) {
        const rungsBelowOneContract = fundedLadder.filter(
            (rung) =>
                candidateSizingIssue(flatOverrides(rung), positionSizing) !==
                null,
        );
        if (rungsBelowOneContract.length > 0) {
            return refused({
                kind: FundedCandidateRefusal.LadderRungBelowOneContract,
                ladder: fundedLadder,
                positionSizing,
                rungsBelowOneContract,
            });
        }
    }

    const candidates = [
        ...placedFlats.map((dollar): FundedCandidate => ({
            label: flatLabel(dollar, positionSizing, plan),
            overrides: flatOverrides(dollar),
        })),
        ...(isPercentRefused ? [] : percentCandidates),
        ...(fundedLadder === null
            ? []
            : [ladderCandidate(fundedLadder, stopRule, positionSizing, plan)]),
    ];
    if (candidates.length === 0) {
        return refused({
            flatsBelowOneContract,
            kind: FundedCandidateRefusal.NoCandidates,
        });
    }
    return {
        candidates,
        flatsBelowOneContract,
        kind: FundedCandidateBuildKind.Built,
        placedFlats,
    };
}

export function fundedPlacementText(
    placed: readonly PlacedFundedRisk[],
    positionSizing: PositionSizingConfig,
): string {
    return `${placed.map((placement) => placement.contracts).join('/')} ${positionSizing.instrument.symbol} = ${placed.map((placement) => formatWholeCentDollars(placement.risk)).join('/')}`;
}

function candidateSizingIssue(
    overrides: CandidateSizingOverrides,
    positionSizing: null | PositionSizingConfig,
): null | string {
    return simInputsSizingIssue({
        ...overrides,
        instrument: positionSizing?.instrument.symbol,
        riskPerTrade: overrides.fundedRiskPerTrade ?? 0,
        stopPoints: positionSizing?.stopPoints,
    });
}

function flatLabel(
    dollar: number,
    positionSizing: null | PositionSizingConfig,
    plan: null | Plan,
): string {
    return positionSizing === null
        ? `flat $${dollar}`
        : `flat $${dollar} (${placementLabel([dollar], positionSizing, plan)})`;
}

function flatOverrides(dollar: number): CandidateSizingOverrides {
    return { fundedCushionPercent: undefined, fundedRiskPerTrade: dollar };
}

function ladderCandidate(
    ladder: number[],
    stopRule: DayStopRule,
    positionSizing: null | PositionSizingConfig,
    plan: null | Plan,
): FundedCandidate {
    const rungs = ladder.join('/');
    const overrides = {
        fundedCushionPercent: undefined,
        fundedDayPolicy: {
            ladder,
            maxLossesPerDay: null,
            sizing: policySizingOf(TradingPhase.Funded),
            stopRule,
        },
        fundedRiskPerTrade: undefined,
    } satisfies Partial<SimInputs>;
    return {
        label:
            positionSizing === null
                ? `ladder ${rungs}`
                : `ladder ${rungs} (${placementLabel(ladder, positionSizing, plan)})`,
        overrides,
    };
}

function percentOverrides(pct: number): CandidateSizingOverrides {
    return {
        fundedCushionPercent: fraction(pct / 100),
        fundedRiskPerTrade: undefined,
    };
}

function placementLabel(
    dollars: readonly number[],
    positionSizing: PositionSizingConfig,
    plan: null | Plan,
): string {
    const uncapped = dollars.map((dollar) =>
        placedFundedRiskAt(dollar, positionSizing),
    );
    const placed = dollars.map((dollar) =>
        placedFundedRiskAt(dollar, positionSizing, plan),
    );
    const capped = placed.some((placement) => placement.isCapped)
        ? `, capped at ${fundedPlacementText(placed, positionSizing)} by ${FUNDED_START_TIER_CONTRACT_LIMIT}`
        : '';
    return `${fundedPlacementText(uncapped, positionSizing)}${capped}`;
}

function refused(
    refusal: FundedCandidateRefusalDetail,
): RefusedFundedCandidates {
    return { kind: FundedCandidateBuildKind.Refused, refusal };
}
