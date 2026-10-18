import { describe, expect, it } from 'vitest';

import { CONFLUENCE_GROUPS } from '~/lib/trading/defaults';
import { DOL_CONFLUENCE_KEYS } from '~/lib/trading/types';

describe('the entry-step confluence groups', () => {
    it('labels the liquidity group so it does not repeat the step 4 DOL type question', () => {
        const liquidity = CONFLUENCE_GROUPS.find((group) =>
            group.items.includes(DOL_CONFLUENCE_KEYS[0]),
        );
        expect(liquidity?.label).toBe('DOL confluences present');
        expect(liquidity?.hint).toBe(
            'Liquidity levels stacked at the entry, besides the main draw you picked in step 4.',
        );
    });
});
