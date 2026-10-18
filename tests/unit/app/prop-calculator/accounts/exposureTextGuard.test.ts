import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const APP_ROOT = path.join(process.cwd(), 'src', 'app');
const SHARED_TEXT = path.join(
    '(app)',
    'prop-calculator',
    'accounts',
    '_components',
    'accountStateReasonText.ts',
);

function filesMatching(pattern: RegExp): string[] {
    return sourceFiles(APP_ROOT)
        .filter((file) => pattern.test(readFileSync(file, 'utf8')))
        .map((file) => path.relative(APP_ROOT, file));
}

function sourceFiles(directory: string): string[] {
    return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
        const full = path.join(directory, entry.name);
        if (entry.isDirectory()) return sourceFiles(full);
        return /\.tsx?$/u.test(entry.name) ? full : [];
    });
}

describe('one exposure reason text for the overview, the copy groups and the accounts pages', () => {
    it('spells the live exposure text only in the shared reason module', () => {
        expect(
            filesMatching(/sizing is not modeled yet for live accounts/u),
        ).toEqual([SHARED_TEXT]);
    });

    it('defines the exposure reason text only in the shared reason module', () => {
        expect(filesMatching(/function exposureUnavailableText\(/u)).toEqual([
            SHARED_TEXT,
        ]);
    });
});
