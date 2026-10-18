import { describe, expect, it } from 'vitest';

import {
    buildDocumentedDayPolicies,
    type DocumentedDayPolicies,
    resolveDocumentedRetainedCushion,
} from '~/lib/prop-calculator/advisor/policy';

function identity(value: DocumentedDayPolicies): DocumentedDayPolicies {
    return value;
}

describe('advisor/policy barrel: public surface', () => {
    it('re-exports buildDocumentedDayPolicies', () => {
        expect(typeof buildDocumentedDayPolicies).toBe('function');
    });

    it('re-exports resolveDocumentedRetainedCushion', () => {
        expect(typeof resolveDocumentedRetainedCushion).toBe('function');
    });

    it('re-exports the DocumentedDayPolicies type', () => {
        expect(typeof identity).toBe('function');
    });
});
