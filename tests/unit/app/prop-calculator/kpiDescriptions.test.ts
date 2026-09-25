import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

import {
    kpiDescriptions,
    panelDescriptions,
} from '~/app/(app)/prop-calculator/_components/kpiDescriptions';

const EM_DASH = '\u{2014}';
const PROP_CALCULATOR_WEB_ROOT = path.join(
    process.cwd(),
    'src',
    'app',
    '(app)',
    'prop-calculator',
);

function sourceFilesUnder(directory: string): string[] {
    return readdirSync(directory, { recursive: true, withFileTypes: true })
        .filter((entry) => entry.isFile() && /\.tsx?$/.test(entry.name))
        .map((entry) => path.join(entry.parentPath, entry.name));
}

describe('kpiDescriptions and panelDescriptions (WP21b: no em dashes in writing)', () => {
    it('no KPI or panel description contains an em dash', () => {
        const withEmDash = [
            ...Object.entries(kpiDescriptions),
            ...Object.entries(panelDescriptions),
        ]
            .filter(([, text]) => text.includes(EM_DASH))
            .map(([key]) => key);
        expect(withEmDash).toEqual([]);
    });
});

describe('prop calculator web text (WP23: no em dashes in writing)', () => {
    it('no page, panel or helper under the prop calculator web tree contains an em dash', () => {
        const withEmDash = sourceFilesUnder(PROP_CALCULATOR_WEB_ROOT).flatMap(
            (file) =>
                readFileSync(file, 'utf8')
                    .split('\n')
                    .map((line, index) => ({ index, line }))
                    .filter(({ line }) => line.includes(EM_DASH))
                    .map(
                        ({ index }) =>
                            `${file.slice(PROP_CALCULATOR_WEB_ROOT.length + 1)}:${index + 1}`,
                    ),
        );
        expect(withEmDash).toEqual([]);
    });
});
