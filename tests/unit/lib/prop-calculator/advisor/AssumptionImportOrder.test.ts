import { beforeEach, describe, expect, it, vi } from 'vitest';

async function loadAdvisorSchema(): Promise<unknown> {
    const { assumptionSchema } = await import('~/lib/prop-calculator/advisor');
    return assumptionSchema;
}

async function loadAssumptionSchema(): Promise<unknown> {
    const { assumptionSchema } =
        await import('~/lib/prop-calculator/advisor/Assumption');
    return assumptionSchema;
}

describe('the assumption schema builds in every module load order (PT-73d)', () => {
    beforeEach(() => {
        vi.resetModules();
    });

    it('loads Assumption.ts first', async () => {
        expect(await loadAssumptionSchema()).toBeDefined();
    });

    it('loads the advisor barrel before the simulator barrel', async () => {
        const schema = await loadAdvisorSchema();
        await import('~/lib/prop-calculator/simulator');

        expect(schema).toBeDefined();
    });

    it('loads the simulator barrel before the advisor barrel', async () => {
        await import('~/lib/prop-calculator/simulator');

        expect(await loadAdvisorSchema()).toBeDefined();
    });
});
