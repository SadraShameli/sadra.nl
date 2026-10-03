import { availableParallelism } from 'node:os';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
    computeFundedStateValue,
    FundedWorkerSession,
} from '~/lib/prop-calculator/core/FundedStateValue';

import {
    coarseAlphaConfig,
    POOL_TEST_TIMEOUT_MS,
    POOL_TEST_WORKER_COUNT,
    registryAlphaStandard,
} from './fundedWorkerFixtures';

describe('the funded worker pool reports a heartbeat per worker, which its wait uses instead of a fixed dispatch deadline (WP58f)', () => {
    const session = new FundedWorkerSession({
        maxWorkers: POOL_TEST_WORKER_COUNT,
    });
    let workerCount = 0;

    beforeAll(async () => {
        const solve = computeFundedStateValue(
            coarseAlphaConfig(await registryAlphaStandard()),
            session,
        );
        workerCount = solve.workerCount;
    }, POOL_TEST_TIMEOUT_MS);

    afterAll(() => {
        session.release();
    });

    it.skipIf(availableParallelism() < 2)(
        'has every worker of the pool beat at least once by the end of a solve',
        () => {
            const beats = session.heartbeatCounts();

            expect(workerCount).toBeGreaterThan(0);
            expect(beats).toHaveLength(workerCount);
            for (const beat of beats) {
                expect(beat).toBeGreaterThan(0);
            }
        },
    );

    it('reports no heartbeats before any pool is started', () => {
        expect(
            new FundedWorkerSession({ maxWorkers: 1 }).heartbeatCounts(),
        ).toStrictEqual([]);
    });
});
