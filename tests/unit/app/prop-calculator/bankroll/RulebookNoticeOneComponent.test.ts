import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const APP_ROOT = path.join(process.cwd(), 'src/app/(app)/prop-calculator');
const SOURCE_FILE = /\.tsx?$/;
const NOTICE_CALL = /(?<![.\w])rulebookSourceNotice\(/;
const COMPONENT_HOME = '_components/bankroll/RulebookSourceNotice.tsx';
const FUNCTION_HOME = '_components/bankroll/rulebookSource.ts';
const SURFACES = [
    '_components/OptimalRiskTable.tsx',
    '_components/CopySplitSection.tsx',
];

function filesUnder(directory: string): string[] {
    return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
        const full = path.join(directory, entry.name);
        if (entry.isDirectory()) return filesUnder(full);
        return SOURCE_FILE.test(entry.name) ? full : [];
    });
}

function sourceOf(relative: string): string {
    return readFileSync(path.join(APP_ROOT, relative), 'utf8');
}

describe('one rulebook source notice component (PT-36q, F-V15)', () => {
    it('reads the notice content only inside the shared component', () => {
        const callers = filesUnder(APP_ROOT)
            .filter((full) => NOTICE_CALL.test(readFileSync(full, 'utf8')))
            .map((full) =>
                path.relative(APP_ROOT, full).split(path.sep).join('/'),
            )
            .filter((file) => file !== FUNCTION_HOME)
            .toSorted((left, right) => left.localeCompare(right));
        expect(callers).toStrictEqual([COMPONENT_HOME]);
    });

    it.each(SURFACES)('renders the shared component in %s', (surface) => {
        const text = sourceOf(surface);
        expect(text).toContain('<RulebookSourceNotice');
        expect(text).not.toContain('rulebookNotice');
    });
});
