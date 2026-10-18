import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

import {
    CumulativeAmountTrigger,
    DiscretionaryTrigger,
    dollars,
    findFirm,
    FirmAccountPolicy,
    FirmId,
    type LiveTransitionTrigger,
    LiveTriggerKind,
    NotCheckedLiveTransitionTrigger,
    PayoutCountPerAccountTrigger,
    PayoutCountTotalTrigger,
    type Plan,
    PolicySourceKind,
    PolicyVerification,
    SingleDayProfitTrigger,
    TopStepVariant,
} from '~/lib/prop-calculator';
import {
    areLiveTriggersEnginePriced,
    LiveTriggerCoverage,
    liveTriggerLimitsFor,
} from '~/lib/prop-calculator/advisor/PayoutAdvice';

const CONFIRMED_SOURCE = {
    fetchedOn: '2026-09-01',
    quote: 'a synthetic test quote',
    sourceKind: PolicySourceKind.LiveFetch,
    url: 'https://example.test/policy',
    verification: PolicyVerification.Confirmed,
} as const;

const UNCONFIRMED_SOURCE = {
    verification: PolicyVerification.NeedsPaste,
} as const;

class StubTriggerPolicy extends FirmAccountPolicy {
    constructor(private readonly triggers: readonly LiveTransitionTrigger[]) {
        super();
    }

    override liveTriggersFor(): readonly LiveTransitionTrigger[] {
        return this.triggers;
    }
}

function topStepPlan(): Plan {
    const plan = findFirm(FirmId.TopStep)?.findPlan({
        accountSize: 50_000,
        firm: FirmId.TopStep,
        variant: TopStepVariant.StandardStandard,
    });
    if (plan === undefined) throw new Error('TopStep 50K plan missing');
    return plan;
}

const PLAN = topStepPlan();

const CONFIRMED_BY_KIND: Readonly<
    Record<LiveTriggerKind, LiveTransitionTrigger>
> = {
    [LiveTriggerKind.CumulativeAmount]: new CumulativeAmountTrigger(
        dollars(100_000),
        CONFIRMED_SOURCE,
    ),
    [LiveTriggerKind.Discretionary]: new DiscretionaryTrigger(CONFIRMED_SOURCE),
    [LiveTriggerKind.NotChecked]: new NotCheckedLiveTransitionTrigger(),
    [LiveTriggerKind.PayoutCountPerAccount]: new PayoutCountPerAccountTrigger(
        3,
        CONFIRMED_SOURCE,
    ),
    [LiveTriggerKind.PayoutCountTotal]: new PayoutCountTotalTrigger(
        10,
        CONFIRMED_SOURCE,
    ),
    [LiveTriggerKind.SingleDayProfit]: new SingleDayProfitTrigger(
        dollars(500),
        true,
        false,
        CONFIRMED_SOURCE,
    ),
};

const ENGINE_PRICED: Readonly<Record<LiveTriggerKind, boolean>> = {
    [LiveTriggerKind.CumulativeAmount]: true,
    [LiveTriggerKind.Discretionary]: false,
    [LiveTriggerKind.NotChecked]: false,
    [LiveTriggerKind.PayoutCountPerAccount]: true,
    [LiveTriggerKind.PayoutCountTotal]: false,
    [LiveTriggerKind.SingleDayProfit]: false,
};

function areEnginePriced(triggers: readonly LiveTransitionTrigger[]): boolean {
    return areLiveTriggersEnginePriced(new StubTriggerPolicy(triggers), PLAN);
}

describe('one definition of engine-priced live triggers (PT-36q, F-145)', () => {
    it('classifies every trigger kind', () => {
        for (const kind of Object.values(LiveTriggerKind)) {
            expect(
                areEnginePriced([CONFIRMED_BY_KIND[kind]]),
                `a confirmed ${kind} trigger`,
            ).toBe(ENGINE_PRICED[kind]);
        }
    });

    it('does not count a cumulative trigger the firm source does not confirm, because the engine never prices it', () => {
        const unconfirmed = new CumulativeAmountTrigger(
            dollars(100_000),
            UNCONFIRMED_SOURCE,
        );
        expect(areEnginePriced([unconfirmed])).toBe(false);
    });

    it('is true for a confirmed per-account count beside a confirmed cumulative trigger', () => {
        expect(
            areEnginePriced([
                CONFIRMED_BY_KIND[LiveTriggerKind.PayoutCountPerAccount],
                CONFIRMED_BY_KIND[LiveTriggerKind.CumulativeAmount],
            ]),
        ).toBe(true);
    });

    it('is false as soon as one trigger no sweep prices sits beside the priced ones', () => {
        expect(
            areEnginePriced([
                CONFIRMED_BY_KIND[LiveTriggerKind.CumulativeAmount],
                CONFIRMED_BY_KIND[LiveTriggerKind.PayoutCountTotal],
            ]),
        ).toBe(false);
    });

    it('is false with no trigger at all, since nothing was priced', () => {
        expect(areEnginePriced([])).toBe(false);
        expect(areLiveTriggersEnginePriced(undefined, PLAN)).toBe(false);
    });

    it('never calls a confirmed cumulative trigger enforced by the documented payout rule, which does not check the request against it', () => {
        expect(
            liveTriggerLimitsFor(
                new StubTriggerPolicy([
                    CONFIRMED_BY_KIND[LiveTriggerKind.CumulativeAmount],
                ]),
                PLAN,
                null,
            ).coverage,
        ).toBe(LiveTriggerCoverage.NotChecked);
    });

    it('leaves no private trigger-kind check in the funded advisor', () => {
        const text = readFileSync(
            path.join(
                process.cwd(),
                'src/lib/prop-calculator/advisor/FundedSizingAdvisor.ts',
            ),
            'utf8',
        );
        expect(text).not.toContain('areLiveTriggersChecked');
        expect(text).not.toContain('instanceof CumulativeAmountTrigger');
        expect(text).not.toContain('instanceof PayoutCountPerAccountTrigger');
    });
});
