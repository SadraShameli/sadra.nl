import { describe, expect, it } from 'vitest';

import { labScenarioSchema } from '~/lib/schemas/url';

const SCENARIO = {
    accounts: 4,
    correlation: 'grouped',
    dayStop: { kind: 'none' },
    groups: 2,
    id: 'sc-1',
    label: 'Test',
    riskPerTrade: 300,
    rrRatio: 2,
    tradesPerDay: 2,
    winrate: 0.5,
};

describe('N-13 deferred clamp: labScenarioSchema only accepts a group count the engine accepts', () => {
    it.each([0, -1, 1.5, 5, 2 ** 53])(
        'rejects groups %s for 4 accounts',
        (groups) => {
            expect(
                labScenarioSchema.safeParse({ ...SCENARIO, groups }).success,
            ).toBe(false);
        },
    );

    it.each([1, 2, 4])('accepts groups %s for 4 accounts', (groups) => {
        expect(
            labScenarioSchema.safeParse({ ...SCENARIO, groups }).success,
        ).toBe(true);
    });
});
