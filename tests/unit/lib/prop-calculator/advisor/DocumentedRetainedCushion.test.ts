import { describe, expect, it } from 'vitest';

import {
    buildEnginePolicy,
    DEFAULT_RULEBOOK,
    documentedRetainedCushionResolution,
    RetainedCushionBasis,
    type RulebookParameters,
} from '~/lib/prop-calculator/advisor';
import { FirmId, MffuVariant } from '~/lib/prop-calculator/core';
import { findFirm } from '~/lib/prop-calculator/firms';

const PLAN = (() => {
    const plan = findFirm(FirmId.Mffu)?.findPlan({
        accountSize: 50_000,
        firm: FirmId.Mffu,
        variant: MffuVariant.RapidEod,
    });
    if (!plan) throw new Error('MFF Rapid EOD 50K plan not found');
    return plan;
})();

const { policy: POLICY } = buildEnginePolicy({
    fundedHorizonDays: 90,
    plan: PLAN,
    positionSizing: null,
    rulebook: DEFAULT_RULEBOOK,
});

function rulebookWith(retainedCushionCents: number): RulebookParameters {
    return {
        ...DEFAULT_RULEBOOK,
        payout: { ...DEFAULT_RULEBOOK.payout, retainedCushionCents },
    };
}

function specWith(
    retainedCushionCents: number,
    retainedCushionRequest: null | number,
) {
    return {
        enginePolicy: { ...POLICY, retainedCushionRequest },
        rulebook: rulebookWith(retainedCushionCents),
    };
}

describe('documentedRetainedCushionResolution (PT-19i review, one cushion basis for the sweep warning and the value chain)', () => {
    it('names the rulebook size when the policy retains exactly what the rulebook resolves to', () => {
        expect(
            documentedRetainedCushionResolution(specWith(900_000, 9000)),
        ).toStrictEqual({
            amount: 9000,
            basis: RetainedCushionBasis.RulebookSize,
        });
    });

    it('names the personal override when the policy retains more than the rulebook resolves to', () => {
        expect(
            documentedRetainedCushionResolution(specWith(900_000, 12_000)),
        ).toStrictEqual({
            amount: 12_000,
            basis: RetainedCushionBasis.PersonalOverride,
        });
    });

    it('names the personal override when the policy retains less than the rulebook resolves to', () => {
        expect(
            documentedRetainedCushionResolution(specWith(900_000, 2000)),
        ).toStrictEqual({
            amount: 2000,
            basis: RetainedCushionBasis.PersonalOverride,
        });
    });

    it('names the rulebook size at the raw rulebook cushion when the policy carries no request', () => {
        expect(
            documentedRetainedCushionResolution(specWith(900_000, null)),
        ).toStrictEqual({
            amount: 9000,
            basis: RetainedCushionBasis.RulebookSize,
        });
    });

    it('names the rulebook size for a zero cushion kept below Hard Rule 2 on purpose', () => {
        const rulebook = {
            ...DEFAULT_RULEBOOK,
            payout: {
                ...DEFAULT_RULEBOOK.payout,
                allowBelowHardRule2: true,
                retainedCushionCents: 0,
            },
        };
        expect(
            documentedRetainedCushionResolution({
                enginePolicy: { ...POLICY, retainedCushionRequest: 0 },
                rulebook,
            }),
        ).toStrictEqual({
            amount: 0,
            basis: RetainedCushionBasis.RulebookSize,
        });
    });
});
