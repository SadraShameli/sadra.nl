import { availableParallelism } from 'node:os';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
    dollars,
    PayoutRequestPolicy,
    type PlanOptIns,
    withPlanOptIns,
} from '~/lib/prop-calculator/core';
import {
    computeFundedStateValue,
    findRegistryPlanId,
    FundedWorkerSession,
    withRegistryPlanOptIns,
} from '~/lib/prop-calculator/core/FundedStateValue';

import {
    coarseAlphaConfig,
    coarseMffuProConfig,
    POOL_TEST_TIMEOUT_MS,
    POOL_TEST_WORKER_COUNT,
    registryAlphaStandard,
    registryMffuPro,
} from './fundedWorkerFixtures';

const RESET_TAKEN: PlanOptIns = {
    takesFundedReset: true,
    takesOneTimeEarlyWithdrawal: false,
};
const EARLY_WITHDRAWAL_TAKEN: PlanOptIns = {
    takesFundedReset: false,
    takesOneTimeEarlyWithdrawal: true,
};

describe('an opted-in Alpha Futures plan keeps the worker pool on one FundedWorkerSession (optimize dp --funded-reset; WP17e follow-up: peak memory across rate solves; PT-47a and PT-47b: the payout request size and policy reach the workers; WP58d: the cushion tail is pinned off at the 2 drawdown fine top; PT-T1b: the cases share one pool started in beforeAll, since a pool start costs 3 to 8 s, and the day cost reuse case and the look-alike case moved here from an FTMO Growth and an MFF Pro grid so that the file starts two pools, not five)', () => {
    const session = new FundedWorkerSession({
        maxWorkers: POOL_TEST_WORKER_COUNT,
    });
    let coldSolve: null | ReturnType<typeof computeFundedStateValue> = null;

    beforeAll(async () => {
        const registry = await registryAlphaStandard();
        coldSolve = computeFundedStateValue(
            coarseAlphaConfig(withRegistryPlanOptIns(registry, RESET_TAKEN)),
            session,
        );
    }, POOL_TEST_TIMEOUT_MS);

    afterAll(() => {
        session.release();
    });

    it('recognizes the opted-in registry plan by its registry id, and never a look-alike built with withOverrides', async () => {
        const registry = await registryAlphaStandard();
        const optedIn = withRegistryPlanOptIns(registry, RESET_TAKEN);

        expect(optedIn.takesFundedReset).toBe(true);
        expect(findRegistryPlanId(optedIn)).toStrictEqual(registry.id);
        expect(
            findRegistryPlanId(withPlanOptIns(registry, RESET_TAKEN)),
        ).toBeNull();
        expect(
            withRegistryPlanOptIns(registry, {
                takesFundedReset: false,
                takesOneTimeEarlyWithdrawal: false,
            }),
        ).toBe(registry);
    });

    it('solves it on workers that rebuild the same opt-ins, to exactly the single-threaded value', async () => {
        const registry = await registryAlphaStandard();
        const pooled = computeFundedStateValue(
            coarseAlphaConfig(withRegistryPlanOptIns(registry, RESET_TAKEN)),
            session,
        );
        const alone = computeFundedStateValue(
            coarseAlphaConfig(withPlanOptIns(registry, RESET_TAKEN)),
        );

        expect(pooled.workerCount > 0).toBe(availableParallelism() > 1);
        expect(alone.workerCount).toBe(0);
        expect(pooled.initialValue).toBe(alone.initialValue);
        expect(coldSolve?.initialValue).toBe(alone.initialValue);
    });

    it('starts exactly the capped number of workers, and the capped pool still solves to the single-threaded value bit for bit', async () => {
        const registry = await registryAlphaStandard();
        const alone = computeFundedStateValue(
            coarseAlphaConfig(withPlanOptIns(registry, RESET_TAKEN)),
        );

        expect(coldSolve?.workerCount).toBe(
            availableParallelism() > 1 ? POOL_TEST_WORKER_COUNT : 0,
        );
        expect(coldSolve?.initialValue).toBe(alone.initialValue);
    });

    it('starts its workers once for two solves at different day costs, and each solve equals one single-threaded run of the same plan (WP17e follow-up; PT-T1b: the pool was started by the beforeAll solve)', async () => {
        const registry = await registryAlphaStandard();
        const optedIn = withRegistryPlanOptIns(registry, RESET_TAKEN);
        const alone = withPlanOptIns(registry, RESET_TAKEN);
        const atZero = computeFundedStateValue(
            { ...coarseAlphaConfig(optedIn), dayCost: 0 },
            session,
        );
        const atFifty = computeFundedStateValue(
            { ...coarseAlphaConfig(optedIn), dayCost: 50 },
            session,
        );
        const hasWorkers = availableParallelism() > 1;

        expect(session.startedPoolCount).toBe(hasWorkers ? 1 : 0);
        expect(atFifty.workerCount > 0).toBe(hasWorkers);
        expect(atZero.initialValue).toBe(
            computeFundedStateValue({
                ...coarseAlphaConfig(alone),
                dayCost: 0,
            }).initialValue,
        );
        expect(atFifty.initialValue).toBe(
            computeFundedStateValue({
                ...coarseAlphaConfig(alone),
                dayCost: 50,
            }).initialValue,
        );
        expect(atFifty.initialValue).not.toBeCloseTo(atZero.initialValue, 2);
    });

    it('solves it with a request size on the session to exactly the single-threaded value, which differs from the unsized value', async () => {
        const registry = await registryAlphaStandard();
        const requestSize = dollars(1000);
        const pooled = computeFundedStateValue(
            {
                ...coarseAlphaConfig(
                    withRegistryPlanOptIns(registry, RESET_TAKEN),
                ),
                payoutRequestSize: requestSize,
            },
            session,
        );
        const alone = computeFundedStateValue({
            ...coarseAlphaConfig(withPlanOptIns(registry, RESET_TAKEN)),
            payoutRequestSize: requestSize,
        });
        const unsized = computeFundedStateValue(
            coarseAlphaConfig(withPlanOptIns(registry, RESET_TAKEN)),
        );

        expect(pooled.workerCount > 0).toBe(availableParallelism() > 1);
        expect(alone.workerCount).toBe(0);
        expect(pooled.initialValue).toBe(alone.initialValue);
        expect(pooled.initialValue).not.toBeCloseTo(unsized.initialValue, 2);
    });

    it('solves it with a policy and a request size on the session to exactly the single-threaded value', async () => {
        const registry = await registryAlphaStandard();
        const requestSize = dollars(1000);
        const pooled = computeFundedStateValue(
            {
                ...coarseAlphaConfig(
                    withRegistryPlanOptIns(registry, RESET_TAKEN),
                ),
                payoutRequestPolicy: PayoutRequestPolicy.FullRequestOnly,
                payoutRequestSize: requestSize,
            },
            session,
        );
        const alone = computeFundedStateValue({
            ...coarseAlphaConfig(withPlanOptIns(registry, RESET_TAKEN)),
            payoutRequestPolicy: PayoutRequestPolicy.FullRequestOnly,
            payoutRequestSize: requestSize,
        });

        expect(pooled.workerCount > 0).toBe(availableParallelism() > 1);
        expect(alone.workerCount).toBe(0);
        expect(pooled.initialValue).toBe(alone.initialValue);
    });

    it('never hands a same-grid plan the workers cannot rebuild to a shared session pool: it solves single-threaded to its own value (PT-T1b: the look-alike is the registry plan taken off the registry without its opt-in, which runs on the pool that the opted-in registry plan just used and is released by it)', async () => {
        const registry = await registryAlphaStandard();
        const first = computeFundedStateValue(
            coarseAlphaConfig(withRegistryPlanOptIns(registry, RESET_TAKEN)),
            session,
        );
        const lookAlikePlan = registry.withOverrides({});
        const second = computeFundedStateValue(
            coarseAlphaConfig(lookAlikePlan),
            session,
        );

        expect(first.workerCount > 0).toBe(availableParallelism() > 1);
        expect(second.workerCount).toBe(0);
        expect(second.initialValue).toBe(
            computeFundedStateValue(coarseAlphaConfig(lookAlikePlan))
                .initialValue,
        );
        expect(second.initialValue).not.toBeCloseTo(first.initialValue, 2);
    });
});

describe('an opted-in MFF Pro registry plan rebuilds its early withdrawal opt-in on the workers (optimize dp --early-withdrawal; WP58d: coarseMffuProConfig pins the cushion tail off at its own fine top, because the MFF Pro solves ran 144 s and 125 s instead of 2.2 s and 2.7 s with the default 30 drawdown tail and this test compares pooled to single-threaded values, not the grid; PT-T1b: the pool starts in beforeAll)', () => {
    const session = new FundedWorkerSession({
        maxWorkers: POOL_TEST_WORKER_COUNT,
    });
    let coldSolve: null | ReturnType<typeof computeFundedStateValue> = null;

    beforeAll(async () => {
        const registry = await registryMffuPro();
        coldSolve = computeFundedStateValue(
            coarseMffuProConfig(
                withRegistryPlanOptIns(registry, EARLY_WITHDRAWAL_TAKEN),
            ),
            session,
        );
    }, POOL_TEST_TIMEOUT_MS);

    afterAll(() => {
        session.release();
    });

    it('rebuilds the early withdrawal opt-in on the workers, whose own payouts take it: the pooled value equals the single-threaded one and differs from the plan without the opt-in (PT-T1b: the plan without the opt-in solves single-threaded)', async () => {
        const registry = await registryMffuPro();
        const pooled = computeFundedStateValue(
            coarseMffuProConfig(
                withRegistryPlanOptIns(registry, EARLY_WITHDRAWAL_TAKEN),
            ),
            session,
        );
        const alone = computeFundedStateValue(
            coarseMffuProConfig(
                withPlanOptIns(registry, EARLY_WITHDRAWAL_TAKEN),
            ),
        );
        const withoutOptIn = computeFundedStateValue(
            coarseMffuProConfig(registry.withOverrides({})),
        );

        expect(pooled.workerCount > 0).toBe(availableParallelism() > 1);
        expect(alone.workerCount).toBe(0);
        expect(withoutOptIn.workerCount).toBe(0);
        expect(pooled.initialValue).toBe(alone.initialValue);
        expect(coldSolve?.initialValue).toBe(alone.initialValue);
        expect(pooled.reachedStateCount).not.toBe(
            withoutOptIn.reachedStateCount,
        );
        expect(pooled.initialValue).not.toBeCloseTo(
            withoutOptIn.initialValue,
            2,
        );
    });
});

describe('a FundedWorkerSession worker cap', () => {
    it.each([0, -1, 1.5, NaN, Infinity])(
        'rejects the cap %s before any worker starts, instead of silently running with another count',
        (maxWorkers) => {
            expect(() => new FundedWorkerSession({ maxWorkers })).toThrow(
                'FundedWorkerSession: maxWorkers must be a positive integer',
            );
        },
    );

    it('accepts a cap of one worker, an empty options object and an omitted cap', () => {
        expect(() => new FundedWorkerSession({ maxWorkers: 1 })).not.toThrow();
        expect(() => new FundedWorkerSession({})).not.toThrow();
        expect(() => new FundedWorkerSession()).not.toThrow();
    });
});
