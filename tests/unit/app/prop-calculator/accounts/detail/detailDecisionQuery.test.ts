import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const ACCOUNTS = path.join(
    process.cwd(),
    'src',
    'app',
    '(app)',
    'prop-calculator',
    'accounts',
);

function sourceOf(...segments: string[]): string {
    return readFileSync(path.join(ACCOUNTS, ...segments), 'utf8');
}

describe('the detail page reads one decision query (PT-68e)', () => {
    it('does not prefetch the latest-decisions list, and still prefetches the decision ledger list once', () => {
        const page = sourceOf('[id]', 'page.tsx');

        expect(page).not.toContain('decision.latestForAll');
        expect(page.match(/decision\.list\.prefetch\(/g)).toHaveLength(1);
    });

    it('does not read the latest-decisions list in the detail view', () => {
        const view = sourceOf(
            '_components',
            'detail',
            'AccountDetailView.tsx',
        );

        expect(view).not.toContain('decision.latestForAll');
        expect(view).toContain('decision.list.useQuery(LEDGER_LIST_INPUT)');
    });
});
