import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

import { GRID_COUNT_TOLERANCE } from '~/lib/prop-calculator/core';

describe('the grid count tolerance is one shared constant (PT-68g)', () => {
    it('is exported through the core barrel, so the advisors count grid levels the way the search does', () => {
        expect(GRID_COUNT_TOLERANCE).toBe(1e-9);
    });

    it('is not redeclared by the eval sizing advisor', () => {
        const source = readFileSync(
            path.join(
                process.cwd(),
                'src',
                'lib',
                'prop-calculator',
                'advisor',
                'EvalSizingAdvisor.ts',
            ),
            'utf8',
        );

        expect(source).toContain('GRID_COUNT_TOLERANCE');
        expect(source).not.toContain('GRID_LEVEL_TOLERANCE');
    });
});
