import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const REPO_ROOT = path.resolve(import.meta.dirname, '../../../../..');
const SIMULATOR_DIR = path.join(REPO_ROOT, 'src/lib/prop-calculator/simulator');
const ADVISOR_DIR = path.join(REPO_ROOT, 'src/lib/prop-calculator/advisor');
const ADVISOR_IMPORT =
    /from\s+'(?:~\/lib\/prop-calculator\/advisor|[./]+\/advisor)/;

function sourceFilesUnder(directory: string): string[] {
    return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
        const full = path.join(directory, entry.name);
        if (entry.isDirectory()) return sourceFilesUnder(full);
        return /\.tsx?$/.test(entry.name) ? full : [];
    });
}

describe('simulator layering (PT-73c)', () => {
    it('reads at least the simulator files this guard is meant to cover', () => {
        const names = sourceFilesUnder(SIMULATOR_DIR).map((file) =>
            path.basename(file),
        );

        expect(names).toContain('LiveTransfer.ts');
        expect(names).toContain('engine.ts');
    });

    it('never imports from the advisor anywhere under simulator/', () => {
        const offenders = sourceFilesUnder(SIMULATOR_DIR).filter((file) =>
            ADVISOR_IMPORT.test(readFileSync(file, 'utf8')),
        );

        expect(offenders.map((file) => path.relative(REPO_ROOT, file))).toEqual(
            [],
        );
    });

    it('no longer keeps the live applicability map in the advisor folder', () => {
        const advisorFiles = sourceFilesUnder(ADVISOR_DIR).map((file) =>
            path.basename(file),
        );

        expect(advisorFiles).not.toContain('LivePlanApplicability.ts');
    });

    it('lets the simulator read the live applicability map through the firms barrel', () => {
        const text = readFileSync(
            path.join(SIMULATOR_DIR, 'LiveTransfer.ts'),
            'utf8',
        );

        expect(text).toMatch(/from '~\/lib\/prop-calculator\/firms'/);
    });
});
