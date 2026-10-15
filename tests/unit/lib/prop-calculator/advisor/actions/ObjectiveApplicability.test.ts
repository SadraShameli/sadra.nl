import { describe, expect, it } from 'vitest';

import {
    objectiveApplicability,
    ObjectiveApplicabilityVerdict,
    RankingSurface,
} from '~/lib/prop-calculator/advisor/actions/ObjectiveApplicability';
import { SizingObjective } from '~/lib/prop-calculator/advisor/SizingObjective';

describe('objectiveApplicability (F-V15, Hard Rule 3, Hard Rule 5, Mistake 10)', () => {
    it('lets RuinFirst apply on NextSlot and Compare', () => {
        for (const surface of [
            RankingSurface.NextSlot,
            RankingSurface.Compare,
        ]) {
            const result = objectiveApplicability(
                SizingObjective.RuinFirst,
                surface,
            );
            expect(result.verdict).toBe(
                ObjectiveApplicabilityVerdict.Applicable,
            );
            expect(result.effectiveObjective).toBe(SizingObjective.RuinFirst);
            expect(result.reason).toBeNull();
        }
    });

    it('falls back RuinFirst to MonthlyNet on every sizing surface, with a reason that says what the eval and funded sizing rules are', () => {
        const sizingSurfaces = [
            RankingSurface.FundedRiskSweep,
            RankingSurface.Dp,
            RankingSurface.Ladder,
            RankingSurface.Advice,
            RankingSurface.DocumentedRules,
            RankingSurface.RiskTable,
            RankingSurface.CopySplit,
        ];
        for (const surface of sizingSurfaces) {
            const result = objectiveApplicability(
                SizingObjective.RuinFirst,
                surface,
            );
            expect(result.verdict).toBe(
                ObjectiveApplicabilityVerdict.NotApplicable,
            );
            expect(result.effectiveObjective).toBe(SizingObjective.MonthlyNet);
            expect(result.reason).toMatch(
                /evals risk the most the constraints allow/,
            );
            expect(result.reason).toMatch(/funded risk is a fixed amount/);
            expect(result.reason).not.toMatch(/hard rule|mistake \d/i);
        }
    });

    it('lets MonthlyNet and CycleCash apply on every surface unchanged', () => {
        for (const objective of [
            SizingObjective.MonthlyNet,
            SizingObjective.CycleCash,
        ]) {
            for (const surface of Object.values(RankingSurface)) {
                const result = objectiveApplicability(objective, surface);
                expect(result.verdict).toBe(
                    ObjectiveApplicabilityVerdict.Applicable,
                );
                expect(result.effectiveObjective).toBe(objective);
                expect(result.reason).toBeNull();
            }
        }
    });
});
