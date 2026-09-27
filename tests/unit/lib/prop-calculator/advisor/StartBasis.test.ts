import { describe, expect, it } from 'vitest';

import { StartBasis } from '~/lib/prop-calculator/advisor/StartBasis';

describe('StartBasis (F-118..F-129, PD-42 type declaration)', () => {
    it('distinguishes a fresh eval/funded start from a reconstructed account state', () => {
        expect(new Set(Object.values(StartBasis))).toEqual(
            new Set(['fresh', 'from-state']),
        );
    });
});
