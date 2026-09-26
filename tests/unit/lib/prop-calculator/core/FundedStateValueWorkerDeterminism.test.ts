import { describe, expect, it, vi } from 'vitest';

import { ALL_FIRMS } from '~/lib/prop-calculator';
import { dollars, FirmId } from '~/lib/prop-calculator/core';
import {
    computeFundedStateValue,
    findRegistryPlanId,
    warmFirmsRegistryCache,
} from '~/lib/prop-calculator/core/FundedStateValue';

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
    actionStepMultiple: 1,
    cushionStepMultiple: 1,
    dayCost: 5,
    evalInitialValue: 0,
    feePerAttempt: dollars(0),
    maxActionMultiple: 1,
    meanHorizonDays: 100,
    payoutRegimeCap: 1,
    rrRatio: 2,
    tradesPerDay: 1,
    winrate: 0.4,
};

function topStepRegistryPlan() {
    const plan = ALL_FIRMS.find((firm) => firm.id === FirmId.TopStep)?.plans[0];
    if (!plan) throw new Error('TopStep firm not registered');
    return plan;
}

describe('funded DP worker dispatch is deterministic (N-70)', () => {
    it('gives the same TopStep regime-1 value on every worker solve, bit for bit equal to the single-threaded solve', async () => {
        await warmFirmsRegistryCache();
        const plan = topStepRegistryPlan();
        expect(findRegistryPlanId(plan)).toEqual(plan.id);
        const config = TOP_STEP_PARITY_CONFIG;
        const singleThreaded = computeFundedStateValue({
            ...config,
            plan: plan.withOverrides({}),
        });
        expect(singleThreaded.workerCount).toBe(0);

        for (let solve = 0; solve < 8; solve++) {
            const workerSolve = computeFundedStateValue({ ...config, plan });
            expect(workerSolve.workerCount).toBeGreaterThan(1);
            expect(workerSolve.sweepCount).toBe(singleThreaded.sweepCount);
            expect(workerSolve.initialValue).toBe(singleThreaded.initialValue);
        }
    }, 120_000);

    it('makes the worker pool wait again, instead of reading results, when a worker wake-up arrives while that worker is still pending', async () => {
        await warmFirmsRegistryCache();
        const plan = topStepRegistryPlan();
        const singleThreaded = computeFundedStateValue({
            ...TOP_STEP_PARITY_CONFIG,
            plan: plan.withOverrides({}),
        });

        const injector = new StaleWakeInjector();
        const realWait = Atomics.wait.bind(Atomics);
        const waitSpy = vi
            .spyOn(Atomics, 'wait')
            .mockImplementation((typedArray, index, value, timeout) =>
                typeof value === 'number' && typedArray instanceof Int32Array
                    ? injector.wait(typedArray, index, value, timeout, realWait)
                    : realWait(typedArray, index, value, timeout),
            );
        let workerSolve: ReturnType<typeof computeFundedStateValue>;
        try {
            workerSolve = computeFundedStateValue({
                ...TOP_STEP_PARITY_CONFIG,
                plan,
            });
        } finally {
            waitSpy.mockRestore();
        }

        expect(workerSolve.workerCount).toBeGreaterThan(1);
        expect(injector.injectedCount).toBeGreaterThan(0);
        expect(injector.movedOnWhilePending.length).toBeGreaterThan(0);
        expect(injector.movedOnWhilePending).toContain(false);
        expect(injector.movedOnWhilePending).not.toContain(true);
        expect(workerSolve.sweepCount).toBe(singleThreaded.sweepCount);
        expect(workerSolve.initialValue).toBe(singleThreaded.initialValue);
    }, 120_000);
});
