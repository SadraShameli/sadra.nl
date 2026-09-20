import { describe, expect, it } from 'vitest';

import { FirmId } from '~/lib/prop-calculator/core';
import { findLivePlanBuilder } from '~/lib/prop-calculator/firms';

const MODELED_LIVE_FIRMS = [
    FirmId.AlphaFutures,
    FirmId.Apex,
    FirmId.FundedNext,
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
