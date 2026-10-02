import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

import * as advisor from '~/lib/prop-calculator/advisor';
import { RankingSurface } from '~/lib/prop-calculator/advisor/actions/ObjectiveApplicability';
import {
    SIZING_OBJECTIVE_LABEL,
    SizingObjective,
} from '~/lib/prop-calculator/advisor/SizingObjective';

const ADVISOR_ROOT = path.join(
    process.cwd(),
    'src',
    'lib',
    'prop-calculator',
    'advisor',
);

describe('SIZING_OBJECTIVE_LABEL (PT-63b)', () => {
    it('sits next to SizingObjective and names every objective once', () => {
        expect(SIZING_OBJECTIVE_LABEL).toStrictEqual({
            [SizingObjective.CycleCash]: 'cycle cash',
            [SizingObjective.MonthlyNet]: 'monthly net',
            [SizingObjective.RuinFirst]: 'ruin first',
        });
        for (const label of Object.values(SIZING_OBJECTIVE_LABEL)) {
            expect(label).not.toContain('\u{2014}');
        }
    });

    it('is exported by the advisor barrel', () => {
        expect(advisor.SIZING_OBJECTIVE_LABEL).toBe(SIZING_OBJECTIVE_LABEL);
    });

    it('is declared once, in SizingObjective.ts and not in the copy split', () => {
        const objectiveText = readFileSync(
            path.join(ADVISOR_ROOT, 'SizingObjective.ts'),
            'utf8',
        );
        const copySplitText = readFileSync(
            path.join(ADVISOR_ROOT, 'policy', 'CopySplit.ts'),
            'utf8',
        );
        expect(objectiveText).toMatch(/export const SIZING_OBJECTIVE_LABEL/);
        expect(copySplitText).not.toMatch(/const SIZING_OBJECTIVE_LABEL/);
    });
});

describe('RankingSurface members (PT-63b)', () => {
    it('names the risk tables and the copy split', () => {
        expect(RankingSurface.RiskTable).toBe('risk-table');
        expect(RankingSurface.CopySplit).toBe('copy-split');
    });
});
