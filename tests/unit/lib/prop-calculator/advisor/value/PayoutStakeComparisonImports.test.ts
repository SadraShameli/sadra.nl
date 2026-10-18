import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

import { importSpecifiersOf } from '../../../../importSpecifiers';

const SOURCE = readFileSync(
    path.join(
        process.cwd(),
        'src',
        'lib',
        'prop-calculator',
        'advisor',
        'value',
        'PayoutStakeComparison.ts',
    ),
    'utf8',
);

describe('PayoutStakeComparison reaches the simulator through its barrel (PT-73f)', () => {
    const specifiers = importSpecifiersOf(SOURCE).map(
        (specifier) => specifier.specifier,
    );

    it('does not deep-import the simulator defaults the barrel already exports', () => {
        expect(specifiers).not.toContain(
            '~/lib/prop-calculator/simulator/SimDefaults',
        );
    });
});
