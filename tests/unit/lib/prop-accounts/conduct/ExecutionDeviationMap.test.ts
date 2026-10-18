import { describe, expect, it } from 'vitest';

import {
    EXECUTION_DEVIATION_VIOLATION_KIND,
    executionDeviationViolationKindOf,
} from '~/lib/prop-accounts/conduct';
import { RuleViolationKind } from '~/lib/prop-accounts/core';
import { EXECUTION_DEVIATION_VALUES } from '~/lib/trading/types';

function compare(a: string, b: string): number {
    return a.localeCompare(b);
}

describe('EXECUTION_DEVIATION_VIOLATION_KIND', () => {
    it('has exactly one entry per journal execution deviation', () => {
        expect(
            Object.keys(EXECUTION_DEVIATION_VIOLATION_KIND).toSorted(compare),
        ).toEqual([...EXECUTION_DEVIATION_VALUES].toSorted(compare));
    });

    it('maps sizing up to the Oversize account-rule violation', () => {
        expect(executionDeviationViolationKindOf('sized-up')).toBe(
            RuleViolationKind.Oversize,
        );
    });

    it.each([
        'sized-down',
        'moved-stop-early',
        'moved-stop-to-be',
        'chased-entry',
        'exited-before-target',
        'exited-past-target',
        'entered-late',
        'no-fill',
    ] as const)(
        'never turns the journal execution deviation %s into an account-rule violation',
        (deviation) => {
            expect(executionDeviationViolationKindOf(deviation)).toBeNull();
        },
    );
});
