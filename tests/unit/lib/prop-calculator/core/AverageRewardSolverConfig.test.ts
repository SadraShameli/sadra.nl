import { availableParallelism } from 'node:os';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type * as EvalStateValueModule from '~/lib/prop-calculator/core/EvalStateValue';
import type * as FundedStateValueModule from '~/lib/prop-calculator/core/FundedStateValue';

import { FirmId, fraction, TopStepVariant } from '~/lib/prop-calculator/core';
import { solveAverageRewardPolicy } from '~/lib/prop-calculator/core/AverageRewardSolver';
import {
    balancedWorkerCount,
    type FundedWorkerSession,
} from '~/lib/prop-calculator/core/FundedStateValue';
import { RenewalCycleObjective } from '~/lib/prop-calculator/core/RenewalCycleObjective';
import { TopStep } from '~/lib/prop-calculator/firms/topstep/TopStep';

const solverProbe = vi.hoisted(() => ({
    entryCostOf: (_ratePerDay: number): number => 0,
    evalSlopeDays: 0,
    evalZeroRatePerDay: 0,
    fundedRates: [] as number[],
    isReleased: [] as boolean[],
    sessions: [] as unknown[],
}));

vi.mock('~/lib/prop-calculator/core/FundedStateValue', async (original) => {
    const actual = await original<typeof FundedStateValueModule>();
    class RecordingSession extends actual.FundedWorkerSession {
        constructor(
            options?: ConstructorParameters<
                typeof actual.FundedWorkerSession
            >[0],
        ) {
            super(options);
            solverProbe.sessions.push(this);
            solverProbe.isReleased.push(false);
        }

        override release(): void {
            solverProbe.isReleased[solverProbe.sessions.indexOf(this)] = true;
            super.release();
        }
    }
    return {
        ...actual,
        computeFundedStateValue: (config: { dayCost?: number }) => {
            solverProbe.fundedRates.push(config.dayCost ?? NaN);
            return {
                initialValue: 0,
                stateValues: new Float64Array(1),
                unconvergedLevelCount: 0,
                valueErrorBound: 0,
            };
        },
        FundedWorkerSession: RecordingSession,
    };
});

vi.mock('~/lib/prop-calculator/core/EvalStateValue', async (original) => ({
    ...(await original<typeof EvalStateValueModule>()),
    computeEvalStateValue: () => {
        const ratePerDay = solverProbe.fundedRates.at(-1) ?? NaN;
        return {
            initialValue:
                solverProbe.entryCostOf(ratePerDay) +
                solverProbe.evalSlopeDays *
                    (solverProbe.evalZeroRatePerDay - ratePerDay),
        };
    },
}));

const MAX_SOLVES = 2;
const ROOT_RATE_PER_DAY = 300;
const SLOPE_DAYS = 20;
const SEED_RATE_PER_DAY = 270;

function topStepObjective(): RenewalCycleObjective {
    const plan = new TopStep().findPlan({
        accountSize: 50_000,
        firm: FirmId.TopStep,
        variant: TopStepVariant.NoFeeStandard,
    });
    if (!plan) throw new Error('TopStep no-fee-standard 50K plan not found');
    const objective = new RenewalCycleObjective({
        fundedHorizonDays: 252,
        maxEvalDays: 15,
        plan,
        rebuyLagDays: 0,
    });
    solverProbe.entryCostOf = (ratePerDay) => objective.entryCost(ratePerDay);
    solverProbe.evalSlopeDays = SLOPE_DAYS;
    solverProbe.evalZeroRatePerDay = ROOT_RATE_PER_DAY;
    return objective;
}

describe('solveAverageRewardPolicy takes the worker cap and the seed rate from its config (WP66a R4 and R5)', () => {
    afterEach(() => {
        solverProbe.fundedRates.length = 0;
        solverProbe.isReleased.length = 0;
        solverProbe.sessions.length = 0;
    });

    it('gives its own funded worker session the maxWorkers cap, and releases it when the solve ends', () => {
        const objective = topStepObjective();

        solveAverageRewardPolicy({
            maxSolves: MAX_SOLVES,
            maxWorkers: 4,
            objective,
            rrRatio: 2,
            winrate: fraction(0.4),
        });

        const [session] = solverProbe.sessions as FundedWorkerSession[];
        expect(solverProbe.sessions).toHaveLength(1);
        const cappedCores = Math.min(4, availableParallelism());
        expect(session?.plannedWorkerCount(240)).toBe(
            balancedWorkerCount(240, cappedCores),
        );
        expect(solverProbe.isReleased).toStrictEqual([true]);
    });

    it('rejects a zero maxWorkers with the session message instead of solving uncapped', () => {
        expect(() =>
            solveAverageRewardPolicy({
                maxSolves: MAX_SOLVES,
                maxWorkers: 0,
                objective: topStepObjective(),
                rrRatio: 2,
                winrate: fraction(0.4),
            }),
        ).toThrow(
            'FundedWorkerSession: maxWorkers must be a positive integer, got 0',
        );
    });

    it('starts the rate search at startRatePerDay and then takes the seeded slope-prior step, not the conservative one of h over the longest cycle', () => {
        const objective = topStepObjective();

        const { trace } = solveAverageRewardPolicy({
            maxSolves: MAX_SOLVES,
            objective,
            rrRatio: 2,
            startRatePerDay: SEED_RATE_PER_DAY,
            winrate: fraction(0.4),
        });

        const first = trace[0];
        const second = trace[1];
        expect(first?.ratePerDay).toBe(SEED_RATE_PER_DAY);
        expect(first?.cycleValue).toBeCloseTo(
            SLOPE_DAYS * (ROOT_RATE_PER_DAY - SEED_RATE_PER_DAY),
            6,
        );
        expect(second?.ratePerDay).toBeGreaterThan(
            SEED_RATE_PER_DAY +
                (first?.cycleValue ?? 0) / objective.maxExpectedCycleDays(),
        );
    });

    it('starts at rate 0 and takes the conservative first step when no seed is given', () => {
        const objective = topStepObjective();

        const { trace } = solveAverageRewardPolicy({
            maxSolves: MAX_SOLVES,
            objective,
            rrRatio: 2,
            winrate: fraction(0.4),
        });

        const first = trace[0];
        expect(first?.ratePerDay).toBe(0);
        expect(trace[1]?.ratePerDay).toBeCloseTo(
            (first?.cycleValue ?? 0) / objective.maxExpectedCycleDays(),
            9,
        );
    });
});
