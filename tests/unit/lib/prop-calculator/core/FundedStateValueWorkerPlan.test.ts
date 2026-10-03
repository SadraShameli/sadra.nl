import type * as OsModule from 'node:os';

import { describe, expect, it, vi } from 'vitest';

import { FundedWorkerSession } from '~/lib/prop-calculator/core/FundedStateValue';

const MOCKED_CORE_COUNT = 32;
const TOP_STEP_DEFAULT_GROUP_COUNT = 240;
const PRE_WP66A_WORKER_CAP = 8;

vi.mock('node:os', async (importOriginal) => ({
    ...(await importOriginal<typeof OsModule>()),
    availableParallelism: () => MOCKED_CORE_COUNT,
}));

describe('the funded worker count on a 32 thread machine (WP66a R4)', () => {
    it('plans 30 workers for the 240 default-grid work groups, so every worker gets 8 groups, instead of the old fixed cap of 8 workers', () => {
        const planned = new FundedWorkerSession().plannedWorkerCount(
            TOP_STEP_DEFAULT_GROUP_COUNT,
        );

        expect(planned).toBe(30);
        expect(planned).toBeGreaterThan(PRE_WP66A_WORKER_CAP);
        expect(TOP_STEP_DEFAULT_GROUP_COUNT % planned).toBe(0);
    });

    it.each([
        [1, 1],
        [4, 4],
        [8, 8],
        [10, 10],
        [16, 16],
        [100, 30],
    ])(
        'a session capped at %i workers plans %i, never above its cap or the cores',
        (maxWorkers, expected) => {
            expect(
                new FundedWorkerSession({ maxWorkers }).plannedWorkerCount(
                    TOP_STEP_DEFAULT_GROUP_COUNT,
                ),
            ).toBe(expected);
        },
    );

    it.each([
        [1, 1],
        [7, 1],
        [15, 1],
        [16, 2],
        [24, 3],
        [100, 12],
        [239, 27],
        [256, 32],
    ])(
        'plans a grid of %i work groups as %i workers, so a worker never gets fewer than 8 groups to pay for its start (a 24 group grid took 30 s to start 24 workers on a busy machine and 0.5 s to solve on one thread)',
        (groupCount, expected) => {
            expect(
                new FundedWorkerSession().plannedWorkerCount(groupCount),
            ).toBe(expected);
        },
    );
});
