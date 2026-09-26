import { describe, expect, it } from 'vitest';

import { defaultCalculatorState } from '~/app/(app)/prop-calculator/_components/calculatorReducer';
import { lifetimeCapPoolingGapNote } from '~/app/(app)/prop-calculator/_components/useLabSimulation';
import { FirmId, LifetimeCapScope, MffuVariant } from '~/lib/prop-calculator';
import { findFirm } from '~/lib/prop-calculator/firms';

const mffPro = findFirm(FirmId.Mffu)?.findPlan({
    accountSize: 50_000,
    firm: FirmId.Mffu,
    variant: MffuVariant.Pro,
});

if (mffPro === undefined) throw new Error('MFF Pro plan not found');

describe('lifetimeCapPoolingGapNote (PT-12h, F-110 REV-5)', () => {
    it('discloses the per-user cap gap on a multi-account MFF Pro scenario', () => {
        expect(lifetimeCapPoolingGapNote(mffPro, 2)).toBe(
            "$50K · Pro's $100,000 lifetime cap is per user; this projection pools it across your accounts, so combined payouts here never exceed $100,000.",
        );
    });

    it('says nothing for a single account, even on a pooled-cap plan', () => {
        expect(lifetimeCapPoolingGapNote(mffPro, 1)).toBeNull();
    });

    it('says nothing for a plan with no lifetime dollar cap', () => {
        const plan = defaultCalculatorState().plan;
        expect(lifetimeCapPoolingGapNote(plan, 5)).toBeNull();
    });

    it('says nothing for a per-account scope, even with multiple accounts', () => {
        const perAccount = mffPro.withOverrides({
            lifetimeDollarCapScope: LifetimeCapScope.PerAccount,
        });
        expect(lifetimeCapPoolingGapNote(perAccount, 2)).toBeNull();
    });

    it('says nothing for an unconfirmed scope, even with multiple accounts', () => {
        const unconfirmed = mffPro.withOverrides({
            lifetimeDollarCapScope: LifetimeCapScope.Unconfirmed,
        });
        expect(lifetimeCapPoolingGapNote(unconfirmed, 2)).toBeNull();
    });
});
