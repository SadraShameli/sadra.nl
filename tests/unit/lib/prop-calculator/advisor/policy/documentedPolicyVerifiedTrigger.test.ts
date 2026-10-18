import { describe, expect, it } from 'vitest';

import {
    CumulativeAmountTrigger,
    dollars,
    findFirm,
    FirmAccountPolicy,
    FirmId,
    type LiveTransitionTrigger,
    type Plan,
    PolicySourceKind,
    PolicyVerification,
    simulate,
    TopStepVariant,
} from '~/lib/prop-calculator';
import {
    AssumptionKind,
    DEFAULT_RULEBOOK,
    pricedCumulativeTriggerAssumptionOf,
    verifiedCumulativeTriggerOf,
} from '~/lib/prop-calculator/advisor';
import {
    type DocumentedPolicySpec,
    type EnginePolicy,
    LifetimePayoutCapBasis,
    RebuyLagBasis,
    toSimInputs,
} from '~/lib/prop-calculator/advisor/policy';

const CONFIRMED_SOURCE = {
    fetchedOn: '2026-09-01',
    quote: 'a synthetic test quote',
    sourceKind: PolicySourceKind.LiveFetch,
    url: 'https://example.test/policy',
    verification: PolicyVerification.Confirmed,
} as const;

const NEEDS_PASTE_SOURCE = {
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

const POLICY: EnginePolicy = {
    commissionPerRoundTrip: 0,
    fundedHorizonDays: 120,
    lifetimePayoutCapBasis: LifetimePayoutCapBasis.LiveTriggersNotChecked,
    lifetimePayoutCapOverride: null,
    payoutRequestOverride: null,
    rebuyLagBasis: RebuyLagBasis.AssumedZero,
    rebuyLagDays: 0,
    retainedCushionRequest: null,
};

const SPEC: DocumentedPolicySpec = {
    enginePolicy: POLICY,
    rulebook: DEFAULT_RULEBOOK,
    run: { maxEvalDays: 60, seed: 42, trials: 120 },
};

function withTriggers<T>(
    triggers: readonly LiveTransitionTrigger[],
    run: () => T,
): T {
    const firm = findFirm(FirmId.TopStep) as unknown as {
        accountPolicy: FirmAccountPolicy;
    };
    const original = firm.accountPolicy;
    firm.accountPolicy = new StubTriggerPolicy(triggers);
    try {
        return run();
    } finally {
        firm.accountPolicy = original;
    }
}

describe('toSimInputs prices the confirmed cumulative live trigger of the plan firm (PT-36p, F-145)', () => {
    it('hands a confirmed cumulative trigger to the simulator', () => {
        const inputs = withTriggers(
            [new CumulativeAmountTrigger(dollars(100_000), CONFIRMED_SOURCE)],
            () => toSimInputs(PLAN, SPEC),
        );
        expect(inputs.verifiedCumulativePayoutTrigger).toBe(100_000);
    });

    it('hands over the tightest of several confirmed triggers', () => {
        const inputs = withTriggers(
            [
                new CumulativeAmountTrigger(dollars(100_000), CONFIRMED_SOURCE),
                new CumulativeAmountTrigger(dollars(60_000), CONFIRMED_SOURCE),
            ],
            () => toSimInputs(PLAN, SPEC),
        );
        expect(inputs.verifiedCumulativePayoutTrigger).toBe(60_000);
    });

    it('ignores a cumulative trigger the firm source does not confirm', () => {
        const inputs = withTriggers(
            [new CumulativeAmountTrigger(dollars(100_000), NEEDS_PASTE_SOURCE)],
            () => toSimInputs(PLAN, SPEC),
        );
        expect(inputs).not.toHaveProperty('verifiedCumulativePayoutTrigger');
    });

    it('adds nothing for a firm with no cumulative trigger', () => {
        expect(toSimInputs(PLAN, SPEC)).not.toHaveProperty(
            'verifiedCumulativePayoutTrigger',
        );
    });

    it('moves the simulated figures: a tight confirmed trigger sends accounts live that run without one', () => {
        const without = simulate(toSimInputs(PLAN, SPEC));
        const tight = withTriggers(
            [new CumulativeAmountTrigger(dollars(1), CONFIRMED_SOURCE)],
            () => simulate(toSimInputs(PLAN, SPEC)),
        );
        expect(without.liveTransferProbability).toBe(0);
        expect(tight.liveTransferProbability).toBeGreaterThan(0);
    });
});

describe('verifiedCumulativeTriggerOf is the one reading of the confirmed cumulative trigger (PT-36p, F-145)', () => {
    const tighter = new CumulativeAmountTrigger(
        dollars(60_000),
        CONFIRMED_SOURCE,
    );
    const looser = new CumulativeAmountTrigger(
        dollars(100_000),
        CONFIRMED_SOURCE,
    );
    const unconfirmed = new CumulativeAmountTrigger(
        dollars(100_000),
        NEEDS_PASTE_SOURCE,
    );

    it('returns the tightest confirmed cumulative trigger with its source', () => {
        const policy = new StubTriggerPolicy([looser, tighter]);
        expect(verifiedCumulativeTriggerOf(policy, PLAN)).toStrictEqual({
            amount: 60_000,
            source: CONFIRMED_SOURCE,
        });
    });

    it('returns null for a trigger the firm source does not confirm', () => {
        const policy = new StubTriggerPolicy([unconfirmed]);
        expect(verifiedCumulativeTriggerOf(policy, PLAN)).toBeNull();
    });

    it('returns null without an account policy', () => {
        expect(verifiedCumulativeTriggerOf(undefined, PLAN)).toBeNull();
    });

    it('agrees with what toSimInputs hands the simulator', () => {
        const policy = new StubTriggerPolicy([tighter]);
        const inputs = withTriggers(policy.liveTriggersFor(), () =>
            toSimInputs(PLAN, SPEC),
        );
        expect(inputs.verifiedCumulativePayoutTrigger).toBe(
            verifiedCumulativeTriggerOf(policy, PLAN)?.amount,
        );
    });
});

describe('pricedCumulativeTriggerAssumptionOf names the trigger a simulation priced (PT-36p, F-145)', () => {
    it('builds the typed assumption from the priced inputs and the firm source', () => {
        const assumption = withTriggers(
            [new CumulativeAmountTrigger(dollars(100_000), CONFIRMED_SOURCE)],
            () => pricedCumulativeTriggerAssumptionOf(toSimInputs(PLAN, SPEC)),
        );
        expect(assumption).toMatchObject({
            amount: 100_000,
            kind: AssumptionKind.CumulativePayoutTriggerPriced,
            source: {
                fetchedOn: CONFIRMED_SOURCE.fetchedOn,
                quote: CONFIRMED_SOURCE.quote,
                url: CONFIRMED_SOURCE.url,
            },
        });
    });

    it('says nothing when the inputs price no cumulative trigger', () => {
        expect(
            pricedCumulativeTriggerAssumptionOf(toSimInputs(PLAN, SPEC)),
        ).toBeUndefined();
    });

    it('says nothing when the amount the inputs priced is not one the firm confirms', () => {
        const assumption = withTriggers(
            [new CumulativeAmountTrigger(dollars(100_000), CONFIRMED_SOURCE)],
            () =>
                pricedCumulativeTriggerAssumptionOf({
                    ...toSimInputs(PLAN, SPEC),
                    verifiedCumulativePayoutTrigger: 90_000,
                }),
        );
        expect(assumption).toBeUndefined();
    });
});
