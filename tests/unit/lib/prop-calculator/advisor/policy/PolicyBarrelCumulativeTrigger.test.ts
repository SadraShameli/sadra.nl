import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

import * as advisor from '~/lib/prop-calculator/advisor';
import * as policy from '~/lib/prop-calculator/advisor/policy';

const ADVISOR_BARREL = path.join(
    process.cwd(),
    'src/lib/prop-calculator/advisor/index.ts',
);

describe('the cumulative trigger helpers live on the policy barrel (PT-73c addendum C)', () => {
    it('exports verifiedCumulativeTriggerOf and pricedCumulativeTriggerAssumptionOf from the policy barrel', () => {
        expect(typeof policy.verifiedCumulativeTriggerOf).toBe('function');
        expect(typeof policy.pricedCumulativeTriggerAssumptionOf).toBe(
            'function',
        );
    });

    it('still reaches both through the advisor barrel, as the same functions', () => {
        expect(advisor.verifiedCumulativeTriggerOf).toBe(
            policy.verifiedCumulativeTriggerOf,
        );
        expect(advisor.pricedCumulativeTriggerAssumptionOf).toBe(
            policy.pricedCumulativeTriggerAssumptionOf,
        );
    });

    it('keeps no explicit re-export from the policy internals in the advisor barrel', () => {
        const text = readFileSync(ADVISOR_BARREL, 'utf8');

        expect(text).not.toContain('./policy/documentedPolicySimInputs');
    });
});
