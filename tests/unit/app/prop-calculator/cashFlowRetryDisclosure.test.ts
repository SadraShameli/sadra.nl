import { describe, expect, it } from 'vitest';

import {
    kpiDescriptions,
    panelDescriptions,
} from '~/app/(app)/prop-calculator/_components/kpiDescriptions';
import { FirmId, RetryKind } from '~/lib/prop-calculator/core';
import { ALL_FIRMS } from '~/lib/prop-calculator/firms';

const rebuyOnlyPlans = ALL_FIRMS.flatMap((firm) =>
    firm.plans
        .filter((plan) => plan.fees.retry === RetryKind.Rebuy)
        .map((plan) => ({ firmId: firm.id, label: plan.label })),
);

describe('N-12 (WP35): the re-buy-only plans the retry copy names are the plans the engine forces onto the re-buy path', () => {
    it('are the Apex plans and MFF Builder only', () => {
        expect(
            new Set(rebuyOnlyPlans.map((plan) => plan.firmId)),
        ).toStrictEqual(new Set([FirmId.Apex, FirmId.Mffu]));
        const mffRebuyOnly = rebuyOnlyPlans.filter(
            (plan) => plan.firmId === FirmId.Mffu,
        );
        expect(mffRebuyOnly.length).toBeGreaterThan(0);
        for (const plan of mffRebuyOnly) {
            expect(plan.label).toContain('Builder');
        }
    });
});

describe('N-12 (WP35): the Cash Flow popover discloses how the timeline bills bundles and retries', () => {
    const text = panelDescriptions.cashFlow;

    it('says optimize dp re-bundles every lockstep renewal while the timeline discounts only each slot first card (U16)', () => {
        expect(text).toContain(
            "the bundle discount applies only to each account slot's first card, on its first eval purchase and its activation",
        );
        expect(text).toContain(
            "unlike the CLI's optimize dp, which re-buys copy-traded accounts together and applies the bundle to every renewal",
        );
    });

    it('says each retry fee is booked on the day the failed attempt ends and the rest of the eval spend is spread over the eval days', () => {
        expect(text).toContain(
            'each retry fee is booked on the day its failed attempt ends',
        );
        expect(text).toContain(
            "the first eval fee, the subscription months and the activation are spread evenly over the card's eval days",
        );
    });

    it('says re-buy-only plans retry at the re-buy, naming only the plans the engine treats that way', () => {
        expect(text).toContain(
            'or at the re-buy when the plan has no reset or every retry on it is a re-buy (Apex, MFF Builder)',
        );
    });

    it('says a card keeps retrying for as long as the timeline has days left', () => {
        expect(text).toContain('for as long as the timeline has days left');
    });
});

describe('N-12 (WP35): the fees KPI is right for plans where every retry is a re-buy', () => {
    const text = kpiDescriptions.totalCost;

    it('no longer says every retry is the cheaper of a reset and a re-buy', () => {
        expect(text).not.toContain(
            'includes the retry fee (the cheaper of a reset and a re-buy) for each failed attempt',
        );
    });

    it('names the re-buy for re-buy-only plans and the cheaper path for the rest', () => {
        expect(text).toContain(
            'a re-buy on plans where every retry is a re-buy (Apex, MFF Builder), otherwise the cheaper of a reset and a re-buy',
        );
    });

    it('does not claim every MFF plan retries at the eval price, since non-Builder MFF plans take the cheaper path', () => {
        expect(text).not.toContain('(Apex, MFF)');
        expect(text).not.toContain('a re-buy at the eval price');
    });

    it('bills a retry only for a failed attempt that is followed by another attempt', () => {
        expect(text).toContain(
            'for each failed attempt, bust or timeout, that is followed by another attempt',
        );
    });
});
