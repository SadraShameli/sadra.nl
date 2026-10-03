import {
    computeEvalStateValue,
    type EvalStateValueConfig,
    type EvalStateValueResult,
} from './EvalStateValue';
import {
    computeFundedStateValue,
    type FundedStateValueConfig,
    type FundedStateValueResult,
    FundedWorkerSession,
} from './FundedStateValue';
import { dollars, type Fraction0to1 } from './lib/units';
import { type RenewalCycleObjective } from './RenewalCycleObjective';

export enum RateSearchStatus {
    Converged = 'converged',
    SolveCapReached = 'solve-cap-reached',
}

export interface AverageRewardConfig {
    readonly evalGrid?: EvalGridConfig;
    readonly fundedGrid?: FundedGridConfig;
    readonly fundedWorkers?: FundedWorkerSession;
    readonly maxSolves: number;
    readonly maxWorkers?: number;
    readonly objective: RenewalCycleObjective;
    readonly rateTolerancePerDay?: number;
    readonly rrRatio: number;
    readonly startRatePerDay?: number;
    readonly winrate: Fraction0to1;
}

export interface AverageRewardSolution {
    readonly evalResult: EvalStateValueResult;
    readonly fundedResult: FundedStateValueResult;
    readonly ratePerDay: number;
    readonly status: RateSearchStatus;
    readonly trace: readonly AverageRewardTracePoint[];
}

export interface AverageRewardTracePoint {
    readonly cycleValue: number;
    readonly ratePerDay: number;
}

export type EvalGridConfig = Pick<
    EvalStateValueConfig,
    | 'actionStepDollars'
    | 'commission'
    | 'cushionStepDollars'
    | 'maxActionDollars'
    | 'positionSizing'
    | 'profitStepDollars'
    | 'rungSizing'
    | 'stopRule'
    | 'tradesPerDay'
>;

export type FundedGridConfig = Pick<
    FundedStateValueConfig,
    | 'actionStepMultiple'
    | 'commission'
    | 'convergenceTolerance'
    | 'cushionStepMultiple'
    | 'cycleBestDayBucketCount'
    | 'maxActionMultiple'
    | 'maxCushionMultiple'
    | 'maxIterationsPerLevel'
    | 'maxPreLockOffsetMultiple'
    | 'maxTailCushionMultiple'
    | 'minRetainedCushion'
    | 'payoutRegimeCap'
    | 'payoutRequestPolicy'
    | 'payoutRequestSize'
    | 'positionSizing'
    | 'rungSizing'
    | 'stopRule'
    | 'tailCushionStepMultiple'
    | 'tradesPerDay'
>;

export interface RateProbe extends RatePoint {
    readonly errorBound: number;
}

export interface RateSearchConfig<Probe extends RateProbe> {
    readonly evaluate: (ratePerDay: number) => Probe;
    readonly isSeeded: boolean;
    readonly maxCycleDays: number;
    readonly maxSolves: number;
    readonly minCycleDays: number;
    readonly startRatePerDay: number;
    readonly tolerancePerDay: number;
}

export interface RateSearchOutcome<Probe extends RateProbe> {
    readonly best: Probe;
    readonly status: RateSearchStatus;
    readonly trace: readonly RatePoint[];
}

export interface SolvedFundedValues {
    readonly ratePerDay: number;
    readonly stateValues: Float64Array;
}

interface CycleEvaluation extends RateProbe {
    readonly evalResult: EvalStateValueResult;
    readonly fundedResult: FundedStateValueResult;
}

interface RateBracket {
    readonly hi: number;
    readonly lo: number;
}

interface RatePoint {
    readonly h: number;
    readonly ratePerDay: number;
}

const DEFAULT_RATE_TOLERANCE_PER_DAY = 0.05;
const DEFAULT_START_RATE_PER_DAY = 0;
const ERROR_BOUND_STOP_SHARE = 0.5;
const MIN_QUADRATIC_POINTS = 3;
const SEEDED_SLOPE_PRIOR_SHARE_OF_LONGEST_CYCLE = 0.15;
const ZERO_ORDER_WARM_START_MAX_RATE_STEP_PER_DAY = 25;
const UNBOUNDED_BRACKET: RateBracket = { hi: Infinity, lo: -Infinity };

export function searchRateRoot<Probe extends RateProbe>(
    config: RateSearchConfig<Probe>,
): RateSearchOutcome<Probe> {
    const {
        evaluate,
        maxCycleDays: tMax,
        maxSolves,
        minCycleDays: tMin,
        tolerancePerDay: tolerance,
    } = config;
    const firstSlopeDays = config.isSeeded
        ? Math.min(
              tMax,
              Math.max(tMin, SEEDED_SLOPE_PRIOR_SHARE_OF_LONGEST_CYCLE * tMax),
          )
        : tMax;

    function narrowBracket(
        bracket: RateBracket,
        point: RatePoint,
    ): RateBracket {
        const boundAtTMax = point.ratePerDay + point.h / tMax;
        const boundAtTMin = point.ratePerDay + point.h / tMin;
        return {
            hi: Math.min(bracket.hi, Math.max(boundAtTMax, boundAtTMin)),
            lo: Math.max(bracket.lo, Math.min(boundAtTMax, boundAtTMin)),
        };
    }

    function nextCandidate(
        trace: readonly RatePoint[],
        bracket: RateBracket,
    ): number {
        const last = requireLast(trace);
        if (trace.length === 1) {
            return last.ratePerDay + last.h / firstSlopeDays;
        }
        const previous = trace.at(-2);
        if (previous === undefined) {
            throw new Error(
                'solveAverageRewardPolicy: missing previous trace point',
            );
        }
        const slope =
            (last.h - previous.h) / (last.ratePerDay - previous.ratePerDay);
        const secant =
            slope === 0 || !Number.isFinite(slope)
                ? (bracket.lo + bracket.hi) / 2
                : last.ratePerDay - last.h / slope;
        const quadratic =
            trace.length >= MIN_QUADRATIC_POINTS
                ? quadraticRoot(trace.slice(-MIN_QUADRATIC_POINTS), bracket)
                : null;
        if (quadratic !== null) return quadratic;
        return Number.isFinite(secant) &&
            secant >= bracket.lo &&
            secant <= bracket.hi
            ? secant
            : (bracket.lo + bracket.hi) / 2;
    }

    function isWithinSolveError(probe: Probe): boolean {
        return Math.abs(probe.h) <= ERROR_BOUND_STOP_SHARE * probe.errorBound;
    }

    let best = evaluate(config.startRatePerDay);
    const trace: RatePoint[] = [ratePointOf(best)];
    let bracket = narrowBracket(UNBOUNDED_BRACKET, best);
    let status = RateSearchStatus.SolveCapReached;

    if (bracket.hi - bracket.lo <= tolerance || isWithinSolveError(best)) {
        status = RateSearchStatus.Converged;
    } else {
        while (trace.length < maxSolves) {
            const previousRatePerDay = requireLast(trace).ratePerDay;
            const candidate = nextCandidate(trace, bracket);
            const point = evaluate(candidate);
            trace.push(ratePointOf(point));
            if (Math.abs(point.h) < Math.abs(best.h)) best = point;
            bracket = narrowBracket(bracket, point);
            const isSecantStep = trace.length > 2;
            const step = Math.abs(point.ratePerDay - previousRatePerDay);
            if (
                bracket.hi - bracket.lo <= tolerance ||
                (isSecantStep && step <= tolerance) ||
                isWithinSolveError(point)
            ) {
                status = RateSearchStatus.Converged;
                break;
            }
        }
    }

    return { best, status, trace };
}

export function secantWarmStart(
    recent: readonly SolvedFundedValues[],
    ratePerDay: number,
): Float64Array | undefined {
    const older = recent.at(-2);
    const newer = recent.at(-1);
    if (newer === undefined) return undefined;
    if (older === undefined) {
        return Math.abs(ratePerDay - newer.ratePerDay) <=
            ZERO_ORDER_WARM_START_MAX_RATE_STEP_PER_DAY
            ? new Float64Array(newer.stateValues)
            : undefined;
    }
    const rateStep = newer.ratePerDay - older.ratePerDay;
    if (
        rateStep === 0 ||
        older.stateValues.length !== newer.stateValues.length
    ) {
        return undefined;
    }
    const slope = (ratePerDay - newer.ratePerDay) / rateStep;
    const guess = new Float64Array(newer.stateValues.length);
    for (let key = 0; key < guess.length; key++) {
        const newerValue = newer.stateValues[key] ?? 0;
        guess[key] =
            newerValue + slope * (newerValue - (older.stateValues[key] ?? 0));
    }
    return guess;
}

export function solveAverageRewardPolicy(
    config: AverageRewardConfig,
): AverageRewardSolution {
    if (config.fundedWorkers !== undefined) {
        return searchRate(config, config.fundedWorkers);
    }
    const fundedWorkers = new FundedWorkerSession({
        maxWorkers: config.maxWorkers,
    });
    try {
        return searchRate(config, fundedWorkers);
    } finally {
        fundedWorkers.release();
    }
}

function quadraticRoot(
    points: readonly RatePoint[],
    bracket: RateBracket,
): null | number {
    const [oldest, previous, last] = points;
    if (oldest === undefined || previous === undefined || last === undefined) {
        return null;
    }
    const earlierSlope =
        (previous.h - oldest.h) / (previous.ratePerDay - oldest.ratePerDay);
    const latestSlope =
        (last.h - previous.h) / (last.ratePerDay - previous.ratePerDay);
    const curvature =
        (latestSlope - earlierSlope) / (last.ratePerDay - oldest.ratePerDay);
    const slopeAtLast =
        latestSlope + curvature * (last.ratePerDay - previous.ratePerDay);
    const discriminant = slopeAtLast ** 2 - 4 * curvature * last.h;
    if (
        curvature === 0 ||
        discriminant < 0 ||
        !Number.isFinite(curvature) ||
        !Number.isFinite(discriminant)
    ) {
        return null;
    }
    const root = Math.sqrt(discriminant);
    const candidates = [
        last.ratePerDay + (-slopeAtLast + root) / (2 * curvature),
        last.ratePerDay + (-slopeAtLast - root) / (2 * curvature),
    ].filter(
        (candidate) =>
            Number.isFinite(candidate) &&
            candidate >= bracket.lo &&
            candidate <= bracket.hi,
    );
    return candidates.length === 0
        ? null
        : candidates.reduce((nearest, candidate) =>
              Math.abs(candidate - last.ratePerDay) <
              Math.abs(nearest - last.ratePerDay)
                  ? candidate
                  : nearest,
          );
}

function ratePointOf(point: RatePoint): RatePoint {
    return { h: point.h, ratePerDay: point.ratePerDay };
}

function requireLast(trace: readonly RatePoint[]): RatePoint {
    const last = trace.at(-1);
    if (last === undefined) {
        throw new Error('solveAverageRewardPolicy: empty trace');
    }
    return last;
}

function searchRate(
    config: AverageRewardConfig,
    fundedWorkers: FundedWorkerSession,
): AverageRewardSolution {
    const { objective } = config;
    if (!Number.isSafeInteger(config.maxSolves) || config.maxSolves < 1) {
        throw new Error(
            `solveAverageRewardPolicy requires maxSolves >= 1, got ${config.maxSolves}`,
        );
    }

    const recentFundedValues: SolvedFundedValues[] = [];

    function evaluateRate(ratePerDay: number): CycleEvaluation {
        const fundedResult = computeFundedStateValue(
            {
                ...config.fundedGrid,
                dayCost: ratePerDay,
                discounts: objective.discounts,
                evalInitialValue: 0,
                feePerAttempt: dollars(0),
                meanHorizonDays: objective.fundedHorizonDays,
                plan: objective.plan,
                rrRatio: config.rrRatio,
                warmStartValues: secantWarmStart(
                    recentFundedValues,
                    ratePerDay,
                ),
                winrate: config.winrate,
            },
            fundedWorkers,
        );
        recentFundedValues.push({
            ratePerDay,
            stateValues: fundedResult.stateValues,
        });
        if (recentFundedValues.length > 2) recentFundedValues.shift();
        if (fundedResult.unconvergedLevelCount > 0) {
            throw new Error(
                `solveAverageRewardPolicy: ${fundedResult.unconvergedLevelCount} funded level(s) failed to converge at ratePerDay=${ratePerDay}; the average-reward estimate would be biased`,
            );
        }
        const evalResult = computeEvalStateValue({
            ...config.evalGrid,
            dayCost: (day: number) => objective.evalDayCost(ratePerDay, day),
            maxEvalDays: objective.maxEvalDays,
            plan: objective.plan,
            rrRatio: config.rrRatio,
            terminalValueAtFail: (failedAttemptDays: number) =>
                objective.entryCost(ratePerDay) -
                objective.retryCost(ratePerDay, failedAttemptDays),
            terminalValueAtPass:
                fundedResult.initialValue - objective.activationCost(),
            winrate: config.winrate,
        });
        const h = evalResult.initialValue - objective.entryCost(ratePerDay);
        return {
            errorBound: fundedResult.valueErrorBound,
            evalResult,
            fundedResult,
            h,
            ratePerDay,
        };
    }

    const { best, status, trace } = searchRateRoot({
        evaluate: evaluateRate,
        isSeeded: (config.startRatePerDay ?? DEFAULT_START_RATE_PER_DAY) !== 0,
        maxCycleDays: objective.maxExpectedCycleDays(),
        maxSolves: config.maxSolves,
        minCycleDays: objective.minCycleDays(),
        startRatePerDay: config.startRatePerDay ?? DEFAULT_START_RATE_PER_DAY,
        tolerancePerDay:
            config.rateTolerancePerDay ?? DEFAULT_RATE_TOLERANCE_PER_DAY,
    });

    return {
        evalResult: best.evalResult,
        fundedResult: best.fundedResult,
        ratePerDay: best.ratePerDay,
        status,
        trace: trace.map((point) => ({
            cycleValue: point.h,
            ratePerDay: point.ratePerDay,
        })),
    };
}
