import {
    computeEvalStateValue,
    type EvalStateValueConfig,
    type EvalStateValueResult,
} from './EvalStateValue';
import {
    computeFundedStateValue,
    type FundedStateValueConfig,
    type FundedStateValueResult,
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
    readonly maxSolves: number;
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

interface CycleEvaluation {
    readonly evalResult: EvalStateValueResult;
    readonly fundedResult: FundedStateValueResult;
    readonly h: number;
    readonly ratePerDay: number;
}

type EvalGridConfig = Pick<
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

type FundedGridConfig = Pick<
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
    | 'minRetainedCushion'
    | 'payoutRegimeCap'
    | 'positionSizing'
    | 'rungSizing'
    | 'stopRule'
    | 'tradesPerDay'
>;

interface RateBracket {
    readonly hi: number;
    readonly lo: number;
}

const DEFAULT_RATE_TOLERANCE_PER_DAY = 0.05;
const DEFAULT_START_RATE_PER_DAY = 0;
const UNBOUNDED_BRACKET: RateBracket = { hi: Infinity, lo: -Infinity };

export function solveAverageRewardPolicy(
    config: AverageRewardConfig,
): AverageRewardSolution {
    const { objective } = config;
    if (!Number.isSafeInteger(config.maxSolves) || config.maxSolves < 1) {
        throw new Error(
            `solveAverageRewardPolicy requires maxSolves >= 1, got ${config.maxSolves}`,
        );
    }
    const tolerance =
        config.rateTolerancePerDay ?? DEFAULT_RATE_TOLERANCE_PER_DAY;
    const tMin = objective.minCycleDays();
    const tMax = objective.maxExpectedCycleDays();

    function evaluateRate(ratePerDay: number): CycleEvaluation {
        const fundedResult = computeFundedStateValue({
            ...config.fundedGrid,
            dayCost: ratePerDay,
            evalInitialValue: 0,
            feePerAttempt: dollars(0),
            meanHorizonDays: objective.fundedHorizonDays,
            plan: objective.plan,
            rrRatio: config.rrRatio,
            winrate: config.winrate,
        });
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
            terminalValueAtPass:
                fundedResult.initialValue - objective.activationCost(),
            winrate: config.winrate,
        });
        const h = evalResult.initialValue - objective.entryCost(ratePerDay);
        return { evalResult, fundedResult, h, ratePerDay };
    }

    function narrowBracket(
        bracket: RateBracket,
        point: CycleEvaluation,
    ): RateBracket {
        const boundAtTMax = point.ratePerDay + point.h / tMax;
        const boundAtTMin = point.ratePerDay + point.h / tMin;
        return {
            hi: Math.min(bracket.hi, Math.max(boundAtTMax, boundAtTMin)),
            lo: Math.max(bracket.lo, Math.min(boundAtTMax, boundAtTMin)),
        };
    }

    function nextCandidate(
        trace: readonly CycleEvaluation[],
        bracket: RateBracket,
    ): number {
        const last = requireLast(trace);
        if (trace.length === 1) {
            return last.ratePerDay + last.h / tMax;
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
        return Number.isFinite(secant) &&
            secant >= bracket.lo &&
            secant <= bracket.hi
            ? secant
            : (bracket.lo + bracket.hi) / 2;
    }

    const firstPoint = evaluateRate(
        config.startRatePerDay ?? DEFAULT_START_RATE_PER_DAY,
    );
    const trace: CycleEvaluation[] = [firstPoint];
    let bracket = narrowBracket(UNBOUNDED_BRACKET, firstPoint);
    let status = RateSearchStatus.SolveCapReached;

    if (bracket.hi - bracket.lo <= tolerance) {
        status = RateSearchStatus.Converged;
    } else {
        while (trace.length < config.maxSolves) {
            const previousRatePerDay = requireLast(trace).ratePerDay;
            const candidate = nextCandidate(trace, bracket);
            const point = evaluateRate(candidate);
            trace.push(point);
            bracket = narrowBracket(bracket, point);
            const step = Math.abs(point.ratePerDay - previousRatePerDay);
            if (bracket.hi - bracket.lo <= tolerance || step <= tolerance) {
                status = RateSearchStatus.Converged;
                break;
            }
        }
    }

    let best = firstPoint;
    for (const point of trace) {
        if (Math.abs(point.h) < Math.abs(best.h)) best = point;
    }

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

function requireLast(trace: readonly CycleEvaluation[]): CycleEvaluation {
    const last = trace.at(-1);
    if (last === undefined) {
        throw new Error('solveAverageRewardPolicy: empty trace');
    }
    return last;
}
