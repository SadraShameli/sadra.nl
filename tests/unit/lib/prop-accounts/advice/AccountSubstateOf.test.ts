import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

import { AccountStatus, accountSubstateOf } from '~/lib/prop-accounts';
import { AccountSubstate } from '~/lib/prop-calculator/advisor';

const VIEW_MODEL = path.join(
    process.cwd(),
    'src',
    'app',
    '(app)',
    'prop-calculator',
    'accounts',
    '_components',
    'advice',
    'adviceViewModel.ts',
);

describe('accountSubstateOf (PT-19i, F-118)', () => {
    it('maps Suspended to the Suspended substate', () => {
        expect(accountSubstateOf(AccountStatus.Suspended)).toBe(
            AccountSubstate.Suspended,
        );
    });

    it('maps every other status to null, so the account is sized', () => {
        const others = Object.values(AccountStatus).filter(
            (status) => status !== AccountStatus.Suspended,
        );
        expect(others.length).toBeGreaterThan(0);
        for (const status of others) {
            expect(accountSubstateOf(status)).toBeNull();
        }
    });

    it('is the one status map: the advice view model defines none', () => {
        expect(readFileSync(VIEW_MODEL, 'utf8')).not.toMatch(
            /function accountSubstateOf\b/,
        );
    });
});
