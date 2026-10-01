import { describe, expect, it } from 'vitest';

import { ApexVariant, FirmId, type Plan } from '~/lib/prop-calculator';
import { AccountSubstate, SizingStage } from '~/lib/prop-calculator/advisor';
import {
    adviceCoverageOf,
    AdviceCoverageOutcomeKind,
    AdviceCoverageUnsupportedReason,
} from '~/lib/prop-calculator/advisor/actions';
import { findFirm } from '~/lib/prop-calculator/firms';

const TODAY = '2026-01-12';

function apexEodPlan(): Plan {
    const plan = findFirm(FirmId.Apex)?.findPlan({
        accountSize: 50_000,
        firm: FirmId.Apex,
        variant: ApexVariant.Eod,
    });
    if (!plan) throw new Error('Apex EOD 50K plan not found');
    return plan;
}

describe('adviceCoverageOf (PT-24b: promoted from AdviceCoverage.test.ts)', () => {
    it('is Unsupported with Suspended for any plan and stage, without building a snapshot', () => {
        const outcome = adviceCoverageOf(
            apexEodPlan(),
            SizingStage.Funded,
            AccountSubstate.Suspended,
            TODAY,
        );
        expect(outcome).toStrictEqual({
            kind: AdviceCoverageOutcomeKind.Unsupported,
            reason: AdviceCoverageUnsupportedReason.Suspended,
        });
    });

    it('yields Advice with a headline for a fresh funded account', () => {
        const outcome = adviceCoverageOf(
            apexEodPlan(),
            SizingStage.Funded,
            AccountSubstate.Fresh,
            TODAY,
        );
        expect(outcome.kind).toBe(AdviceCoverageOutcomeKind.Advice);
        if (outcome.kind !== AdviceCoverageOutcomeKind.Advice) return;
        expect(outcome.advice.headline.length).toBeGreaterThan(0);
        expect(outcome.advice.stage).toBe(SizingStage.Funded);
    });

    it('yields Advice with a headline for a fresh eval account', () => {
        const outcome = adviceCoverageOf(
            apexEodPlan(),
            SizingStage.Eval,
            AccountSubstate.Fresh,
            TODAY,
        );
        expect(outcome.kind).toBe(AdviceCoverageOutcomeKind.Advice);
        if (outcome.kind !== AdviceCoverageOutcomeKind.Advice) return;
        expect(outcome.advice.stage).toBe(SizingStage.Eval);
    });
});
