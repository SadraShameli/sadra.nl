import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

import * as advisor from '~/lib/prop-calculator/advisor';
import { isPlacementChecked } from '~/lib/prop-calculator/advisor/PlaceableMinimum';
import { SizingStage } from '~/lib/prop-calculator/advisor/SizingStage';

const ADVISOR_DIR = path.join(process.cwd(), 'src/lib/prop-calculator/advisor');

function sourceOf(relativePath: string): string {
    return readFileSync(path.join(ADVISOR_DIR, relativePath), 'utf8');
}

describe('isPlacementChecked lives with the placeable minimum (PT-73c addendum B)', () => {
    it('checks placement on a funded and a live account, never on an evaluation', () => {
        expect(isPlacementChecked(SizingStage.Funded)).toBe(true);
        expect(isPlacementChecked(SizingStage.Live)).toBe(true);
        expect(isPlacementChecked(SizingStage.Eval)).toBe(false);
    });

    it('is exported through the advisor barrel as the same function', () => {
        expect(advisor.isPlacementChecked).toBe(isPlacementChecked);
    });

    it('is declared in exactly one advisor file, PlaceableMinimum.ts', () => {
        expect(sourceOf('PlaceableMinimum.ts')).toContain(
            'export function isPlacementChecked',
        );
        expect(sourceOf('DailyPlanCard.ts')).not.toContain(
            'function isPlacementChecked',
        );
    });

    it('is read by the next-trade risk check from PlaceableMinimum, not from the daily plan card', () => {
        const source = sourceOf('actions/NextTradeRiskCheck.ts');

        expect(source).not.toMatch(
            /import \{[^}]*isPlacementChecked[^}]*\} from '[^']*DailyPlanCard'/,
        );
    });

    it('is the one test the advise CLI uses to decide whether a placement is shown', () => {
        const source = readFileSync(
            path.join(process.cwd(), 'src/cli/commands/prop/advise/command.ts'),
            'utf8',
        );

        expect(source).toContain('isPlacementChecked(advice.stage)');
        expect(source).not.toContain('advice.stage === SizingStage.Funded');
    });
});
