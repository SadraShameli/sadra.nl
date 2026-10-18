import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

import * as advisor from '~/lib/prop-calculator/advisor';
import { fundedRetainedCushionResolution } from '~/lib/prop-calculator/advisor/PayoutRequestRule';

const VALUE_CHAIN_SOURCE = readFileSync(
    path.join(
        process.cwd(),
        'src',
        'lib',
        'prop-calculator',
        'advisor',
        'value',
        'ValueChain.ts',
    ),
    'utf8',
);

describe('fundedRetainedCushionResolution on the advisor barrel (PT-67e)', () => {
    it('is exported from the advisor barrel as the same function', () => {
        expect(advisor.fundedRetainedCushionResolution).toBe(
            fundedRetainedCushionResolution,
        );
    });

    it('is imported by the value chain through the barrel, not from the rule file', () => {
        expect(
            VALUE_CHAIN_SOURCE.includes(
                "from '~/lib/prop-calculator/advisor/PayoutRequestRule'",
            ),
        ).toBe(false);
        expect(
            /import \{[^}]*\bdocumentedRetainedCushionResolution\b[^}]*\} from '~\/lib\/prop-calculator\/advisor';/u.test(
                VALUE_CHAIN_SOURCE,
            ),
        ).toBe(true);
    });
});
