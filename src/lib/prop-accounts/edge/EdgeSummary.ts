import { z } from 'zod';

import { fraction } from '~/lib/prop-calculator';
import { type StrategyAssumptions } from '~/lib/prop-calculator/advisor';
import { expectancyPerTradeR } from '~/lib/prop-calculator/economics';
import {
    binomialStandardError,
    NOISE_STANDARD_ERRORS,
} from '~/lib/prop-calculator/stats';
import { accountDateSchema } from '~/lib/schemas/propAccounts';
import { expectancyR, type LightAssessment } from '~/lib/trading/analytics';

export { COUNTED_OUTCOMES } from '~/lib/trading/analytics';

export enum EdgeDrift {
    Above = 'above',
    Below = 'below',
    NoTrades = 'no-trades',
    TooFewTrades = 'too-few-trades',
    WithinNoise = 'within-noise',
}

export const DRIFT_STANDARD_ERRORS = NOISE_STANDARD_ERRORS;
export const MAX_EDGE_TRADES = 5000;
export const MIN_EXPECTED_WINS_AND_LOSSES = 5;

export type EdgeAssumptions = Pick<StrategyAssumptions, 'rr' | 'winrate'>;

export interface EdgeMetric {
    readonly assumed: number;
    readonly drift: EdgeDrift;
    readonly observed: null | number;
    readonly standardError: null | number;
}

export interface EdgeRangeCheck {
    readonly issues: ReadonlyMap<EdgeRangeField, string>;
    readonly isValid: boolean;
}

export interface EdgeSummary {
    readonly expectancyR: EdgeMetric;
    readonly measuredRewardToRisk: MeasuredRewardToRisk | null;
    readonly rewardToRisk: number;
    readonly sampleSize: number;
    readonly winRate: EdgeMetric;
}

export interface MeasuredRewardToRisk {
    readonly sampleSize: number;
    readonly value: number;
}

const edgeMetricSchema = z.object({
    assumed: z.number(),
    drift: z.enum(EdgeDrift),
    observed: z.number().nullable(),
    standardError: z.number().nonnegative().nullable(),
}) satisfies z.ZodType<EdgeMetric>;

const measuredRewardToRiskSchema = z.object({
    sampleSize: z.number().int().positive(),
    value: z.number().positive(),
}) satisfies z.ZodType<MeasuredRewardToRisk>;

export const edgeRangeSchema = z
    .object({
        from: accountDateSchema.optional(),
        to: accountDateSchema.optional(),
    })
    .refine(({ from, to }) => isEdgeRangeOrdered(from, to), {
        message: 'the range ends before it starts',
        path: ['to'],
    });

export type EdgeRange = z.input<typeof edgeRangeSchema>;

export type EdgeRangeField = keyof EdgeRange;

const edgeRangeFieldSchema = edgeRangeSchema.keyof();

export const ALL_JOURNAL_DAYS: EdgeRange = {};

export const edgeSummarySchema = z.object({
    expectancyR: edgeMetricSchema,
    measuredRewardToRisk: measuredRewardToRiskSchema.nullable(),
    rewardToRisk: z.number().positive(),
    sampleSize: z.number().int().nonnegative(),
    winRate: edgeMetricSchema,
}) satisfies z.ZodType<EdgeSummary>;

export function checkEdgeRange(range: EdgeRange): EdgeRangeCheck {
    const parsed = edgeRangeSchema.safeParse(range);
    const issues = new Map<EdgeRangeField, string>();
    const rangeIssues = parsed.error?.issues ?? [];
    for (const issue of rangeIssues) {
        const field = edgeRangeFieldSchema.safeParse(issue.path[0]);
        if (field.success && !issues.has(field.data)) {
            issues.set(field.data, issue.message);
        }
    }
    return { issues, isValid: parsed.success };
}

export function edgeSummary(
    rows: readonly LightAssessment[],
    assumptions: EdgeAssumptions,
): EdgeSummary {
    const { rr, winrate } = assumptions;
    const journal = expectancyR([...rows]);
    const n = journal.sample;
    const winRateError = binomialStandardError(winrate, n);
    const expectedWins = n * winrate;
    const isSampleEnough =
        Math.min(expectedWins, n - expectedWins) >=
        MIN_EXPECTED_WINS_AND_LOSSES;
    const assumedExpectancyR =
        expectancyPerTradeR(fraction(winrate), rr).value ??
        winrate * rr - (1 - winrate);
    return {
        expectancyR: edgeMetric(
            assumedExpectancyR,
            journal.avgR,
            (rr + 1) * winRateError,
            n,
            isSampleEnough,
        ),
        measuredRewardToRisk: measuredRewardToRiskOf(rows),
        rewardToRisk: rr,
        sampleSize: n,
        winRate: edgeMetric(
            winrate,
            journal.winRate,
            winRateError,
            n,
            isSampleEnough,
        ),
    };
}

function countedOutcomeR(
    rows: readonly LightAssessment[],
    outcome: string,
): number[] {
    return rows
        .filter(
            (row): row is LightAssessment & { outcomeR: number } =>
                row.outcome === outcome &&
                row.outcomeR !== null &&
                Number.isFinite(row.outcomeR),
        )
        .map((row) => row.outcomeR);
}

function driftOf(
    assumed: number,
    observed: number,
    standardError: number,
    isSampleEnough: boolean,
): EdgeDrift {
    if (!isSampleEnough) return EdgeDrift.TooFewTrades;
    const gap = observed - assumed;
    if (Math.abs(gap) <= DRIFT_STANDARD_ERRORS * standardError) {
        return EdgeDrift.WithinNoise;
    }
    return gap > 0 ? EdgeDrift.Above : EdgeDrift.Below;
}

function edgeMetric(
    assumed: number,
    observed: number,
    standardError: number,
    sampleSize: number,
    isSampleEnough: boolean,
): EdgeMetric {
    return sampleSize === 0
        ? {
              assumed,
              drift: EdgeDrift.NoTrades,
              observed: null,
              standardError: null,
          }
        : {
              assumed,
              drift: driftOf(assumed, observed, standardError, isSampleEnough),
              observed,
              standardError,
          };
}

function isEdgeRangeOrdered(
    from: string | undefined,
    to: string | undefined,
): boolean {
    return from === undefined || to === undefined || from <= to;
}

function mean(values: readonly number[]): number {
    return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function measuredRewardToRiskOf(
    rows: readonly LightAssessment[],
): MeasuredRewardToRisk | null {
    const wins = countedOutcomeR(rows, 'win');
    const losses = countedOutcomeR(rows, 'loss');
    if (
        wins.length < MIN_EXPECTED_WINS_AND_LOSSES ||
        losses.length < MIN_EXPECTED_WINS_AND_LOSSES
    ) {
        return null;
    }
    const averageWin = mean(wins);
    const averageLoss = mean(losses);
    if (!(averageWin > 0) || !(averageLoss < 0)) return null;
    return {
        sampleSize: wins.length + losses.length,
        value: averageWin / Math.abs(averageLoss),
    };
}
