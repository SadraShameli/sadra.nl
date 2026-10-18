import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const APP_ROOT = path.join(process.cwd(), 'src', 'app');
const KIND_ONLY_TEXT = /\bassumptionLabel\(|\bisInputAssumption\b/u;

function sourceFiles(directory: string): string[] {
    return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
        const full = path.join(directory, entry.name);
        if (entry.isDirectory()) return sourceFiles(full);
        return /\.tsx?$/u.test(entry.name) ? full : [];
    });
}

describe('every page renders an assumption through the shared assumption text', () => {
    it('keeps no kind-only label path that would drop an assumption payload such as the widened ladder step', () => {
        const offenders = sourceFiles(APP_ROOT)
            .filter((file) => KIND_ONLY_TEXT.test(readFileSync(file, 'utf8')))
            .map((file) => path.relative(APP_ROOT, file));
        expect(offenders).toEqual([]);
    });
});
