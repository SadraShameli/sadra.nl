import { availableParallelism } from 'node:os';
import { beforeAll, describe, expect, it } from 'vitest';

import { dollars } from '~/lib/prop-calculator/core';
import {
    balancedWorkerCount,
    computeFundedStateValue,
    FundedWorkerSession,
} from '~/lib/prop-calculator/core/FundedStateValue';

import { POOL_TEST_TIMEOUT_MS, registryTopStep } from './fundedWorkerFixtures';

const COUNT_CASES: readonly (readonly [number, number, number])[] = [
    [240, 32, 30],
    [240, 31, 30],
    [240, 16, 16],
    [240, 14, 14],
    [240, 8, 8],
    [240, 1, 1],
    [100, 32, 25],
    [7, 32, 7],
    [5, 3, 3],
    [2, 100, 2],
    [1, 8, 1],
];

const MAX_GROUPS_CHECKED = 300;
const MAX_CORES_CHECKED = 70;
const SOLVED_WORKER_CAPS = [1, 3];
const GROUPS_OF_THE_PARITY_GRID = 24;
const MIN_GROUPS_PER_WORKER = 8;

const TOP_STEP_PARITY_CONFIG = {
    actionStepMultiple: 0.5,
    cushionStepMultiple: 0.5,
    cycleBaselineFineRangeMultiple: 0,
    dayCost: 5,
    evalInitialValue: 0,
    feePerAttempt: dollars(0),
    maxActionMultiple: 1,
    maxCushionMultiple: 3,
    maxPreLockOffsetMultiple: 1,
    maxTailCushionMultiple: 3,
    meanHorizonDays: 20,
    payoutRegimeCap: 1,
    rrRatio: 2,
    tradesPerDay: 1,
    winrate: 0.4,
};

describe('the funded worker count is the fewest workers that keep the slowest worker as light as every core would (WP66a R4)', () => {
    it.each(COUNT_CASES)(
        'plans %i work groups on %i cores as %i workers',
        (groupCount, cores, expected) => {
            expect(balancedWorkerCount(groupCount, cores)).toBe(expected);
        },
    );

    it('never uses more workers than cores or groups, keeps the busiest worker as light as using every core would, and uses no worker that does not lighten it', () => {
        for (let groups = 1; groups <= MAX_GROUPS_CHECKED; groups++) {
            for (let cores = 1; cores <= MAX_CORES_CHECKED; cores++) {
                const workers = balancedWorkerCount(groups, cores);
                const busiest = Math.ceil(groups / workers);

                expect(workers).toBeGreaterThanOrEqual(1);
                expect(workers).toBeLessThanOrEqual(Math.min(groups, cores));
                expect(busiest).toBe(
                    Math.ceil(groups / Math.min(groups, cores)),
                );
                if (workers > 1) {
                    expect(Math.ceil(groups / (workers - 1))).toBeGreaterThan(
                        busiest,
                    );
                }
            }
        }
    });

    it.each([0, -1, 1.5, NaN])(
        'rejects %s work groups instead of planning a pool for them',
        (groupCount) => {
            expect(() => balancedWorkerCount(groupCount, 8)).toThrow(
                'balancedWorkerCount: groupCount must be a positive integer',
            );
        },
    );

    it('has a session without a cap plan one worker per available core up to one per 8 work groups, and a capped session never exceed its cap', () => {
        const uncapped = new FundedWorkerSession();
        const capped = new FundedWorkerSession({ maxWorkers: 4 });
        const hugeCap = new FundedWorkerSession({ maxWorkers: 10_000 });

        const uncappedCores = Math.min(
            availableParallelism(),
            240 / MIN_GROUPS_PER_WORKER,
        );
        expect(uncapped.plannedWorkerCount(240)).toBe(
            balancedWorkerCount(240, uncappedCores),
        );
        expect(hugeCap.plannedWorkerCount(240)).toBe(
            uncapped.plannedWorkerCount(240),
        );
        const cappedCores = Math.min(4, availableParallelism());
        expect(capped.plannedWorkerCount(240)).toBe(
            balancedWorkerCount(240, cappedCores),
        );
        expect(capped.plannedWorkerCount(2)).toBe(1);
    });
});

describe.skipIf(availableParallelism() < Math.max(...SOLVED_WORKER_CAPS))(
    'the funded DP gives bit-identical results at every worker count (WP66a R4)',
    () => {
        let alone: null | ReturnType<typeof computeFundedStateValue> = null;

        beforeAll(async () => {
            const plan = await registryTopStep();
            alone = computeFundedStateValue({
                ...TOP_STEP_PARITY_CONFIG,
                plan: plan.withOverrides({}),
            });
        }, POOL_TEST_TIMEOUT_MS);

        it.each(SOLVED_WORKER_CAPS)(
            'solves the TopStep regime-1 grid on a pool capped at %i workers to exactly the single-threaded sweeps, states and value',
            async (maxWorkers) => {
                const session = new FundedWorkerSession({ maxWorkers });
                try {
                    const pooled = computeFundedStateValue(
                        {
                            ...TOP_STEP_PARITY_CONFIG,
                            plan: await registryTopStep(),
                        },
                        session,
                    );

                    expect(alone?.workerCount).toBe(0);
                    expect(pooled.workerCount).toBe(
                        Math.min(
                            maxWorkers,
                            GROUPS_OF_THE_PARITY_GRID / MIN_GROUPS_PER_WORKER,
                        ),
                    );
                    expect(pooled.sweepCount).toBe(alone?.sweepCount);
                    expect(pooled.reachedStateCount).toBe(
                        alone?.reachedStateCount,
                    );
                    expect(pooled.initialValue).toBe(alone?.initialValue);
                } finally {
                    session.release();
                }
            },
        );
    },
);
