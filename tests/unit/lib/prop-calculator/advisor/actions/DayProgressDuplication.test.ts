import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const SOURCE_ROOT = path.resolve(import.meta.dirname, '../../../../../../src');

const DAY_PROGRESS_DEFINITION = /function dayProgress\w*\s*\(/;

function sourceFiles(directory: string): string[] {
    return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
        const full = path.join(directory, entry.name);
        if (entry.isDirectory()) return sourceFiles(full);
        return /\.tsx?$/.test(entry.name) ? full : [];
    });
}

describe('day progress is computed in one place (PT-67b step 3)', () => {
    const files = sourceFiles(SOURCE_ROOT).map((file) => ({
        file: path.relative(SOURCE_ROOT, file),
        text: readFileSync(file, 'utf8'),
    }));

    it('defines the day progress helper only in advisor/actions/DayProgress.ts', () => {
        expect(
            files
                .filter(({ text }) => DAY_PROGRESS_DEFINITION.test(text))
                .map(({ file }) => file.split(path.sep).join('/')),
        ).toEqual(['lib/prop-calculator/advisor/actions/DayProgress.ts']);
    });

    it('walks the documented ladder by loss count only there', () => {
        expect(
            files
                .filter(({ text }) => text.includes('rungs[Math.min('))
                .map(({ file }) => file.split(path.sep).join('/')),
        ).toEqual(['lib/prop-calculator/advisor/actions/DayProgress.ts']);
    });
});
