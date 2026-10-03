import { availableParallelism } from 'node:os';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import {
    dollars,
    INSTRUMENTS,
    InstrumentSymbol,
    points,
} from '~/lib/prop-calculator/core';
import {
    computeFundedStateValue,
    findRegistryPlanId,
    FundedWorkerSession,
} from '~/lib/prop-calculator/core/FundedStateValue';

import {
    POOL_TEST_TIMEOUT_MS,
    POOL_TEST_WORKER_COUNT,
    registryTopStep,
} from './fundedWorkerFixtures';

interface InjectedWake {
    readonly flags: Int32Array;
    readonly workerIndex: number;
}

class StaleWakeInjector {
    private lastInjected: InjectedWake | null = null;

    injectedCount = 0;

    readonly movedOnWhilePending: boolean[] = [];

    wait(
        flags: Int32Array,
        workerIndex: number,
        expected: number,
        timeoutMs: number | undefined,
        realWait: typeof Atomics.wait,
    ): 'not-equal' | 'ok' | 'timed-out' {
        const previous = this.lastInjected;
        this.lastInjected = null;
        const isSameFlags = previous !== null && previous.flags === flags;
        const isReWait = isSameFlags && previous.workerIndex === workerIndex;
        if (isReWait) this.movedOnWhilePending.push(false);
        if (isSameFlags && workerIndex > previous.workerIndex) {
            this.movedOnWhilePending.push(
                Atomics.load(flags, previous.workerIndex) === expected,
            );
        }
        if (!isReWait && Atomics.load(flags, workerIndex) === expected) {
            this.injectedCount++;
            this.lastInjected = { flags, workerIndex };
            return 'ok';
        }
        return realWait(flags, workerIndex, expected, timeoutMs);
    }
}

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

const REPEATED_SOLVE_COUNT = 6;

const TOP_STEP_PARITY_GROUP_COUNT = 24;

type FundedSolve = ReturnType<typeof computeFundedStateValue>;

function expectedDefaultWorkerCount(): number {
    return availableParallelism() > 1
        ? new FundedWorkerSession().plannedWorkerCount(
              TOP_STEP_PARITY_GROUP_COUNT,
          )
        : 0;
}

describe('funded DP worker dispatch is deterministic and agrees with the single-threaded solve (N-70; WP58d: the cushion tail is pinned off at the 3 drawdown fine top, because the real TopStep plan solve ran about 9x slower, 10.5 s to 96 s per file, with the default 30 drawdown tail and this suite studies worker determinism, not the grid; PT-T1b: the cases share one worker pool through a FundedWorkerSession started in beforeAll on one regime-1 grid with a 20 day horizon, since a pool start costs 3 to 5 s, and the first solve of that fresh pool is kept and compared with the single-threaded solve so cold start stays covered)', () => {
    const session = new FundedWorkerSession({
        maxWorkers: POOL_TEST_WORKER_COUNT + 1,
    });
    let coldSolve: FundedSolve | null = null;
    let singleThreadedSolve: FundedSolve | null = null;

    async function singleThreaded(): Promise<FundedSolve> {
        const registryPlan = await registryTopStep();
        singleThreadedSolve ??= computeFundedStateValue({
            ...TOP_STEP_PARITY_CONFIG,
            plan: registryPlan.withOverrides({}),
        });
        return singleThreadedSolve;
    }

    beforeAll(async () => {
        coldSolve = computeFundedStateValue(
            { ...TOP_STEP_PARITY_CONFIG, plan: await registryTopStep() },
            session,
        );
    }, POOL_TEST_TIMEOUT_MS);

    afterAll(() => {
        session.release();
    });

    it('gives a freshly started pool the single-threaded value on its very first solve: the cold solve has the same sweep count, state count and initialValue bit for bit', async () => {
        const alone = await singleThreaded();

        expect(session.startedPoolCount).toBe(1);
        expect(coldSolve?.workerCount).toBeGreaterThan(1);
        expect(alone.workerCount).toBe(0);
        expect(coldSolve?.sweepCount).toBe(alone.sweepCount);
        expect(coldSolve?.reachedStateCount).toBe(alone.reachedStateCount);
        expect(coldSolve?.initialValue).toBe(alone.initialValue);
    });

    it('worker parity: a real registry plan (findRegistryPlanId resolves it, so tryCreateWorkerPool genuinely dispatches to worker threads once the grid clears MIN_PARALLEL_GRID_CELLS) and the identical plan taken out of the registry via withOverrides({}) (which cannot resolve back to its own id, so it runs single-threaded) produce the same initialValue with dayCost != 0 and a horizon, proving dayCost and meanHorizonDays reach workers through SerializableFundedConfig, toSerializableConfig and runFundedWorkerBootstrap correctly', async () => {
        const registryPlan = await registryTopStep();
        expect(findRegistryPlanId(registryPlan)).toEqual(registryPlan.id);

        const offRegistryPlan = registryPlan.withOverrides({});
        expect(findRegistryPlanId(offRegistryPlan)).toBeNull();

        const workerResult = computeFundedStateValue(
            { ...TOP_STEP_PARITY_CONFIG, plan: registryPlan },
            session,
        );
        const singleThreadedResult = await singleThreaded();

        expect(workerResult.workerCount).toBeGreaterThan(1);
        expect(singleThreadedResult.workerCount).toBe(0);
        expect(workerResult.initialValue).toBeCloseTo(
            singleThreadedResult.initialValue,
            6,
        );
    });

    it('worker parity at a non-default cycleBaselineFineRangeMultiple: the multiple sets the cycle-baseline grid size and so the shared key layout, so the workers must receive it and agree with the single-threaded solve', async () => {
        const livePlan = await registryTopStep();
        const workerResult = computeFundedStateValue(
            { ...TOP_STEP_PARITY_CONFIG, plan: livePlan },
            session,
        );
        const singleThreadedResult = await singleThreaded();
        const defaultMultipleResult = computeFundedStateValue({
            ...TOP_STEP_PARITY_CONFIG,
            cycleBaselineFineRangeMultiple: undefined,
            plan: livePlan.withOverrides({}),
        });
        expect(defaultMultipleResult.reachedStateCount).not.toBe(
            singleThreadedResult.reachedStateCount,
        );
        expect(workerResult.reachedStateCount).toBe(
            singleThreadedResult.reachedStateCount,
        );
        expect(workerResult.initialValue).toBeCloseTo(
            singleThreadedResult.initialValue,
            6,
        );
    });

    it.skipIf(availableParallelism() < POOL_TEST_WORKER_COUNT + 1)(
        'gives the same TopStep regime-1 value at two different worker counts, bit for bit, because the dispatch order never reaches the values',
        async () => {
            const plan = await registryTopStep();
            const smallerSession = new FundedWorkerSession({
                maxWorkers: POOL_TEST_WORKER_COUNT,
            });
            try {
                const smaller = computeFundedStateValue(
                    { ...TOP_STEP_PARITY_CONFIG, plan },
                    smallerSession,
                );
                const larger = computeFundedStateValue(
                    { ...TOP_STEP_PARITY_CONFIG, plan },
                    session,
                );

                expect(smaller.workerCount).toBe(POOL_TEST_WORKER_COUNT);
                expect(larger.workerCount).toBe(POOL_TEST_WORKER_COUNT + 1);
                expect(smaller.sweepCount).toBe(larger.sweepCount);
                expect(smaller.reachedStateCount).toBe(
                    larger.reachedStateCount,
                );
                expect(smaller.initialValue).toBe(larger.initialValue);
            } finally {
                smallerSession.release();
            }
        },
    );

    it('gives the same TopStep regime-1 value on every worker solve, bit for bit equal to the single-threaded solve', async () => {
        const plan = await registryTopStep();
        const alone = await singleThreaded();
        expect(alone.workerCount).toBe(0);

        for (let solve = 0; solve < REPEATED_SOLVE_COUNT; solve++) {
            const workerSolve = computeFundedStateValue(
                { ...TOP_STEP_PARITY_CONFIG, plan },
                session,
            );
            expect(workerSolve.workerCount).toBeGreaterThan(1);
            expect(workerSolve.sweepCount).toBe(alone.sweepCount);
            expect(workerSolve.initialValue).toBe(alone.initialValue);
        }
        expect(session.startedPoolCount).toBe(1);
    });

    it('makes the worker pool wait again, instead of reading results, when a worker wake-up arrives while that worker is still pending', async () => {
        const plan = await registryTopStep();
        const alone = await singleThreaded();

        const injector = new StaleWakeInjector();
        const realWait = Atomics.wait.bind(Atomics);
        const waitSpy = vi
            .spyOn(Atomics, 'wait')
            .mockImplementation((typedArray, index, value, timeout) =>
                typeof value === 'number' && typedArray instanceof Int32Array
                    ? injector.wait(typedArray, index, value, timeout, realWait)
                    : realWait(typedArray, index, value, timeout),
            );
        let workerSolve: FundedSolve;
        try {
            workerSolve = computeFundedStateValue(
                { ...TOP_STEP_PARITY_CONFIG, plan },
                session,
            );
        } finally {
            waitSpy.mockRestore();
        }

        expect(workerSolve.workerCount).toBeGreaterThan(1);
        expect(injector.injectedCount).toBeGreaterThan(0);
        expect(injector.movedOnWhilePending.length).toBeGreaterThan(0);
        expect(injector.movedOnWhilePending).toContain(false);
        expect(injector.movedOnWhilePending).not.toContain(true);
        expect(workerSolve.sweepCount).toBe(alone.sweepCount);
        expect(workerSolve.initialValue).toBe(alone.initialValue);
    });
});

describe("funded DP worker parity at the default cycle-baseline layout (PT-T1b: its own pool, because the default cycleBaselineFineRangeMultiple sizes a different shared key layout than the determinism grid; with payoutRegimeCap 1 the regime-1 levels carry TopStep's full cycle-baseline radix, its 50% balance-share cap can leave the balance above the payout floor)", () => {
    const session = new FundedWorkerSession({
        maxWorkers: POOL_TEST_WORKER_COUNT,
    });
    const pairConfig = {
        ...TOP_STEP_PARITY_CONFIG,
        cycleBaselineFineRangeMultiple: undefined,
    };
    let coldSolve: FundedSolve | null = null;

    beforeAll(async () => {
        coldSolve = computeFundedStateValue(
            { ...pairConfig, plan: await registryTopStep() },
            session,
        );
    }, POOL_TEST_TIMEOUT_MS);

    afterAll(() => {
        session.release();
    });

    it('decodes, solves and reads back every peak ratchet and cycle-baseline pair on the workers (an out-of-range read throws in the worker) and agrees with the single-threaded solve', async () => {
        const livePlan = await registryTopStep();
        expect(findRegistryPlanId(livePlan)).toEqual(livePlan.id);
        expect(livePlan.canLeaveBalanceAbovePayoutFloor()).toBe(true);

        const singleThreadedResult = computeFundedStateValue({
            ...pairConfig,
            plan: livePlan.withOverrides({}),
        });
        const warmResult = computeFundedStateValue(
            { ...pairConfig, plan: livePlan },
            session,
        );
        expect(singleThreadedResult.workerCount).toBe(0);
        for (const workerResult of [coldSolve, warmResult]) {
            expect(workerResult?.workerCount).toBeGreaterThan(1);
            expect(workerResult?.reachedStateCount).toBe(
                singleThreadedResult.reachedStateCount,
            );
            expect(workerResult?.initialValue).toBeCloseTo(
                singleThreadedResult.initialValue,
                6,
            );
        }
        expect(session.startedPoolCount).toBe(1);
    });
});

describe('funded DP worker pool start failure', () => {
    it('fails loud, instead of silently solving single-threaded, when the worker pool cannot be started (here a config value that cannot be structured-cloned to the workers)', async () => {
        const livePlan = await registryTopStep();
        const instrument = Object.assign(
            {},
            INSTRUMENTS[InstrumentSymbol.MNQ],
            { describe: () => 'not cloneable' },
        );
        expect(() =>
            computeFundedStateValue({
                actionStepMultiple: 1,
                cushionStepMultiple: 1,
                evalInitialValue: 0,
                feePerAttempt: dollars(0),
                maxActionMultiple: 1,
                payoutRegimeCap: 0,
                plan: livePlan,
                positionSizing: { instrument, stopPoints: points(20) },
                rrRatio: 2,
                tradesPerDay: 1,
                winrate: 0.4,
            }),
        ).toThrow(/could not start its worker pool/);
    });
});

describe('a FundedWorkerSession without a cap starts the default pool, one worker per core up to the work groups (PT-T1d: every other pooled case passes a smaller cap to stay cheap, so this one case keeps the default threaded; WP66a R4: the default was min(cores, 8) workers before the cap was lifted)', () => {
    const session = new FundedWorkerSession();
    let defaultSolve: FundedSolve | null = null;

    beforeAll(async () => {
        defaultSolve = computeFundedStateValue(
            { ...TOP_STEP_PARITY_CONFIG, plan: await registryTopStep() },
            session,
        );
    }, POOL_TEST_TIMEOUT_MS);

    afterAll(() => {
        session.release();
    });

    it('plans one balanced worker per core, at most one per 8 work groups, on the TopStep regime-1 grid and starts exactly one pool', () => {
        expect(defaultSolve?.workerCount).toBe(expectedDefaultWorkerCount());
        expect(session.startedPoolCount).toBe(
            availableParallelism() > 1 ? 1 : 0,
        );
        expect(Number.isFinite(defaultSolve?.initialValue)).toBe(true);
    });
});
