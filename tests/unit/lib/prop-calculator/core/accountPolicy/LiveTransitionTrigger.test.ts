import { describe, expect, it } from 'vitest';

import {
    CumulativeAmountTrigger,
    DiscretionaryTrigger,
    dollars,
    LiveTriggerKind,
    type LiveTriggerProgress,
    NotCheckedLiveTransitionTrigger,
    PayoutCountPerAccountTrigger,
    PayoutCountTotalTrigger,
    PolicySourceKind,
    PolicyVerification,
    SingleDayProfitTrigger,
} from '~/lib/prop-calculator/core';

const NO_PROGRESS: LiveTriggerProgress = {
    cumulativePayoutDollars: dollars(0),
    largestSingleDayProfit: dollars(0),
    payoutCountAcrossFirm: 0,
    payoutCountThisAccount: 0,
};

const SOURCE = {
    fetchedOn: '2026-09-26',
    quote: 'quote',
    sourceKind: PolicySourceKind.LiveFetch,
    url: 'https://example.invalid',
    verification: PolicyVerification.Confirmed as const,
};

describe('LiveTransitionTrigger.distance', () => {
    it('PayoutCountPerAccount never goes below 0', () => {
        const trigger = new PayoutCountPerAccountTrigger(3, SOURCE);
        expect(trigger.kind).toBe(LiveTriggerKind.PayoutCountPerAccount);
        expect(
            trigger.distance({ ...NO_PROGRESS, payoutCountThisAccount: 1 }),
        ).toBe(2);
        expect(
            trigger.distance({ ...NO_PROGRESS, payoutCountThisAccount: 5 }),
        ).toBe(0);
    });

    it('PayoutCountTotal never goes below 0', () => {
        const trigger = new PayoutCountTotalTrigger(15, SOURCE);
        expect(
            trigger.distance({ ...NO_PROGRESS, payoutCountAcrossFirm: 20 }),
        ).toBe(0);
        expect(
            trigger.distance({ ...NO_PROGRESS, payoutCountAcrossFirm: 12 }),
        ).toBe(3);
    });

    it('SingleDayProfit never goes below 0 and carries its automatic and excessForfeited flags', () => {
        const trigger = new SingleDayProfitTrigger(
            dollars(10_000),
            true,
            true,
            SOURCE,
        );
        expect(trigger.isAutomatic).toBe(true);
        expect(trigger.isExcessForfeited).toBe(true);
        expect(
            trigger.distance({
                ...NO_PROGRESS,
                largestSingleDayProfit: dollars(11_000),
            }),
        ).toBe(0);
        expect(
            trigger.distance({
                ...NO_PROGRESS,
                largestSingleDayProfit: dollars(4000),
            }),
        ).toBe(6000);
    });

    it('CumulativeAmount never goes below 0', () => {
        const trigger = new CumulativeAmountTrigger(dollars(100_000), SOURCE);
        expect(
            trigger.distance({
                ...NO_PROGRESS,
                cumulativePayoutDollars: dollars(120_000),
            }),
        ).toBe(0);
        expect(
            trigger.distance({
                ...NO_PROGRESS,
                cumulativePayoutDollars: dollars(60_000),
            }),
        ).toBe(40_000);
    });

    it('Discretionary is always null', () => {
        const trigger = new DiscretionaryTrigger(SOURCE);
        expect(trigger.distance(NO_PROGRESS)).toBeNull();
    });

    it('NotChecked is always null and carries no source', () => {
        const trigger = new NotCheckedLiveTransitionTrigger();
        expect(trigger.kind).toBe(LiveTriggerKind.NotChecked);
        expect(trigger.source).toBeUndefined();
        expect(trigger.distance(NO_PROGRESS)).toBeNull();
    });
});
