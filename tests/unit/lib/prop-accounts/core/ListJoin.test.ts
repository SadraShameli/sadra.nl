import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

import { joinWithAnd } from '~/lib/prop-accounts/core';

const ROOT = path.resolve(import.meta.dirname, '../../../../..');

const CALLERS = [
    'src/lib/prop-accounts/alerts/TierChangeRule.ts',
    'src/app/(app)/prop-calculator/accounts/_components/overview/overviewModel.ts',
];

describe('joinWithAnd', () => {
    it('joins no, one, two and three parts the way the alert and overview text reads', () => {
        expect(joinWithAnd([])).toBe('');
        expect(joinWithAnd(['the daily loss limit'])).toBe(
            'the daily loss limit',
        );
        expect(joinWithAnd(['accounts', 'payouts'])).toBe(
            'accounts and payouts',
        );
        expect(joinWithAnd(['accounts', 'events', 'payouts'])).toBe(
            'accounts, events and payouts',
        );
    });

    it('keeps a part that contains a comma whole', () => {
        expect(joinWithAnd(['a, b', 'c'])).toBe('a, b and c');
    });
});

describe('one list-join helper', () => {
    it.each(CALLERS)(
        '%s joins through joinWithAnd and has no copy of its own',
        (file) => {
            const source = readFileSync(path.resolve(ROOT, file), 'utf8');
            expect(source.includes('joinWithAnd(')).toBe(true);
            expect(source.includes('slice(0, -1).join(\', \')')).toBe(false);
            expect(source.includes('function joinWithAnd')).toBe(false);
        },
    );
});
