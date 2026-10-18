import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import {
    importSpecifiersOf,
    resolveLocalSpecifier,
} from '../../importSpecifiers';
import { posixPath } from '../../posixPath';

const SOURCE_ROOT = fileURLToPath(new URL('../../../../src/', import.meta.url));
const APP_ROOT = path.join(SOURCE_ROOT, 'app', '(app)');
const TRADING_ACTIONS = path.join(SOURCE_ROOT, 'lib', 'trading', 'actions.ts');

function pagesUnder(directory: string): string[] {
    return readdirSync(directory, { recursive: true })
        .map(String)
        .filter((file) => path.basename(file) === 'page.tsx')
        .map((file) => path.join(directory, file));
}

const TRADING_PAGES = [
    ...pagesUnder(path.join(APP_ROOT, 'trade-checklist')),
    path.join(APP_ROOT, 'profile', 'page.tsx'),
];

describe('trading pages render without writing', () => {
    it('finds every trade checklist page and the profile page', () => {
        expect(TRADING_PAGES.length).toBeGreaterThanOrEqual(6);
    });

    it.each(
        TRADING_PAGES.map((page) =>
            posixPath(path.relative(SOURCE_ROOT, page)),
        ),
    )(
        '%s does not call a trading server action while rendering',
        (relativePage) => {
            const page = path.join(SOURCE_ROOT, relativePage);
            const resolvedImports = importSpecifiersOf(
                readFileSync(page, 'utf8'),
            )
                .map(({ specifier }) =>
                    resolveLocalSpecifier(page, specifier, SOURCE_ROOT),
                )
                .filter((resolved) => resolved !== null);
            expect(resolvedImports).not.toContain(TRADING_ACTIONS);
        },
    );
});
