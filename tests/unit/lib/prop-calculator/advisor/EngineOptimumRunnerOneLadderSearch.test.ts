import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const REPO_ROOT = path.resolve(import.meta.dirname, '../../../../..');

function sourceOf(relativePath: string): string {
    return readFileSync(path.join(REPO_ROOT, relativePath), 'utf8');
}

describe('one ladder search implementation (PT-68i, F-V16)', () => {
    const runner = sourceOf(
        'src/lib/prop-calculator/advisor/EngineOptimumRunner.ts',
    );

    it('the engine optimum runner searches through runLadderSearch only', () => {
        expect(runner.match(/runLadderSearch\(/g)).toHaveLength(1);
        expect(runner).not.toContain('buildLadderGrid');
        expect(runner).not.toContain('canonicaliseGrid');
        expect(runner).not.toContain('ladderFrontier');
        expect(runner).not.toContain('rankedBy');
        expect(runner).not.toContain('LADDER_SEARCH_DEFAULT_TOP_N');
        expect(runner).not.toContain('.toSorted(');
    });

    it('the ranking tail lives in the core ladder search only', () => {
        const core = sourceOf('src/lib/prop-calculator/core/LadderSearch.ts');

        expect(core.match(/byPassRate:/g)).toHaveLength(2);
        expect(core.match(/ladderFrontier\(scorable\)/g)).toHaveLength(1);
    });
});
