import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

import { routes } from '~/lib/site/routes';

import { hasPageFile, propCalculatorAppDir } from './appPageFiles';
import { hasToolPage, toolPageRoutes } from './toolPageFiles';

const TOOL_PAGE_FILES = path.join(
    process.cwd(),
    'tests',
    'unit',
    'app',
    'prop-calculator',
    'toolPageFiles.ts',
);

describe('the prop-calculator page lookup helpers (PT-11j)', () => {
    it('toolPageFiles checks for a page file through the shared hasPageFile only', () => {
        const source = readFileSync(TOOL_PAGE_FILES, 'utf8');
        expect(source).toMatch(
            /import\s*\{[^}]*\bhasPageFile\b[^}]*\}\s*from\s*'\.\/appPageFiles'/,
        );
        expect(source).not.toMatch(/\bexistsSync\b/);
        expect(source).not.toMatch(/function\s+hasPageFile\b/);
    });

    it('agrees with the shared lookup for every tool page it lists', () => {
        const toolsRoot = propCalculatorAppDir('(tools)');
        const prefix = `${routes.propCalculator.index}/`;
        const listed = toolPageRoutes();
        expect(listed.length).toBeGreaterThan(0);
        for (const route of listed) {
            expect(hasToolPage(route)).toBe(true);
            expect(hasPageFile(toolsRoot, route.slice(prefix.length))).toBe(
                true,
            );
        }
    });

    it('finds no tool page outside the prop-calculator prefix or for a missing segment', () => {
        expect(hasToolPage('/elsewhere/simulator')).toBe(false);
        expect(hasToolPage(`${routes.propCalculator.index}/no-such-tool`)).toBe(
            false,
        );
    });
});
