import { readFileSync } from 'node:fs';
import path from 'node:path';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

vi.mock('next/navigation', () => ({
    usePathname: () => '/prop-calculator/accounts',
    useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
    useSearchParams: () => new URLSearchParams(),
}));

import { QueryErrorNotice } from '~/app/(app)/prop-calculator/accounts/_components/QueryErrorNotice';

describe('QueryErrorNotice', () => {
    it('renders the title and the message', () => {
        const markup = renderToStaticMarkup(
            createElement(QueryErrorNotice, {
                message: 'network is down',
                title: 'The ledger could not be loaded',
            }),
        );
        expect(markup).toContain('The ledger could not be loaded');
        expect(markup).toContain('network is down');
    });
});

describe('query-error notice duplication guard (PT-62e / PT-58f)', () => {
    it('is the only place the rounds and ledger pages render a query-error banner', () => {
        const ledgerText = readFileSync(
            path.join(
                process.cwd(),
                'src/app/(app)/prop-calculator/accounts/ledger/LedgerView.tsx',
            ),
            'utf8',
        );
        const roundsText = readFileSync(
            path.join(
                process.cwd(),
                'src/app/(app)/prop-calculator/accounts/rounds/RoundsView.tsx',
            ),
            'utf8',
        );
        for (const text of [ledgerText, roundsText]) {
            expect(text).not.toContain('TriangleAlert');
            expect(text).toMatch(
                /import\s*{\s*QueryErrorNotice\s*}\s*from\s*'~\/app\/\(app\)\/prop-calculator\/accounts\/_components\/QueryErrorNotice'/,
            );
        }
    });
});
