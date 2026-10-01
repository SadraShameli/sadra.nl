import { describe, expect, it } from 'vitest';

import { rankablePlans } from '~/lib/prop-calculator';
import { AccountSubstate, SizingStage } from '~/lib/prop-calculator/advisor';
import {
    adviceCoverageOf,
    AdviceCoverageOutcomeKind,
    AdviceCoverageUnsupportedReason,
} from '~/lib/prop-calculator/advisor/actions';
import { ALL_FIRMS } from '~/lib/prop-calculator/firms';

const TODAY = '2026-01-12';

describe('AdviceCoverage (F-V18, PT-74b step 6; source promoted to AdviceCoverageOf, PT-24b)', () => {
    for (const firm of ALL_FIRMS) {
        for (const plan of rankablePlans(firm.plans, true)) {
            for (const stage of Object.values(SizingStage)) {
                if (stage === SizingStage.Eval && plan.isInstantFunded) {
                    it(`${plan.label} (${stage}): instant-funded plans are unsupported, never throw`, () => {
                        const outcome = adviceCoverageOf(
                            plan,
                            stage,
                            AccountSubstate.Fresh,
                            TODAY,
                        );
                        expect(outcome.kind).toBe(
                            AdviceCoverageOutcomeKind.Unsupported,
                        );
                        if (outcome.kind === AdviceCoverageOutcomeKind.Advice) return;
                        expect(outcome.reason).toBe(
                            AdviceCoverageUnsupportedReason.InstantFundedNoEval,
                        );
                    });
                    continue;
                }
                for (const substate of Object.values(AccountSubstate)) {
                    it(`${firm.id}/${plan.label} x ${stage} x ${substate}: yields Advice or a typed unsupported reason, never a throw`, () => {
                        expect(() => {
                            const outcome = adviceCoverageOf(
                                plan,
                                stage,
                                substate,
                                TODAY,
                            );
                            expect([
                                AdviceCoverageOutcomeKind.Advice,
                                AdviceCoverageOutcomeKind.Unsupported,
                            ]).toContain(outcome.kind);
                        }).not.toThrow();
                    });
                }
            }
        }
    }
});
