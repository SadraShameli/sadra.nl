import { describe, expect, it } from 'vitest';

import { dollars, FirmId } from '~/lib/prop-calculator/core';
import {
    findLivePlanBuilder,
    findLiveTransitionPlanBuilder,
    LUCID_LIVE_DEFAULT_CUSHION_PERCENT,
} from '~/lib/prop-calculator/firms';

const MODELED_LIVE_FIRMS = [
    FirmId.AlphaFutures,
    FirmId.Apex,
    FirmId.FundedNext,
    FirmId.Lucid,
    FirmId.Mffu,
    FirmId.TopStep,
    FirmId.Tpt,
    FirmId.Tradeify,
];

describe('findLivePlanBuilder', () => {
    it('resolves a builder for every firm with a modeled live account', () => {
        for (const id of MODELED_LIVE_FIRMS) {
            expect(findLivePlanBuilder(id)).toBeDefined();
        }
    });

    it('returns undefined for every firm without a modeled live account, instead of silently falling back to Apex', () => {
        const unmodeledFirms = Object.values(FirmId).filter(
            (id) => !MODELED_LIVE_FIRMS.includes(id),
        );
        expect(unmodeledFirms.length).toBeGreaterThan(0);
        for (const id of unmodeledFirms) {
            expect(findLivePlanBuilder(id)).toBeUndefined();
        }
    });
});

describe('findLiveTransitionPlanBuilder (N-54)', () => {
    it('resolves the Lucid Daily live builder, which pays the one-off transition credit', () => {
        const build = findLiveTransitionPlanBuilder(FirmId.Lucid);
        if (!build) throw new Error('Lucid has no transition builder');

        expect(
            build(LUCID_LIVE_DEFAULT_CUSHION_PERCENT, dollars(1000))
                .transitionPayout,
        ).toBe(1000);
    });

    it('resolves a transition builder for Lucid only', () => {
        const withCredit = Object.values(FirmId).filter(
            (id) => findLiveTransitionPlanBuilder(id) !== undefined,
        );

        expect(withCredit).toStrictEqual([FirmId.Lucid]);
    });
});
