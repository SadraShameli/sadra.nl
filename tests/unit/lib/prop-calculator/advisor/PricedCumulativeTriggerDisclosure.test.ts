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
    TopStepVariant,
} from '~/lib/prop-calculator';
import {
    AdviceSource,
    assumptionText,
    buildEnginePolicy,
    DEFAULT_RULEBOOK,
    type DocumentedPolicySpec,
    runPayoutSizeSweep,
} from '~/lib/prop-calculator/advisor';
import { PayoutSizeSweepResultKind } from '~/lib/prop-calculator/advisor/PayoutSizeSweep';
import {
    freshFundedAccount,
    fundedValueEstimate,
    MilestoneKind,
    milestoneState,
    requestNowValue,
    retireComparison,
    RetireComparisonBasis,
    riskCandidateValues,
    valueAtState,
    ValueResultKind,
} from '~/lib/prop-calculator/advisor/value';

const VERIFIED_LIMIT = 100_000;

const CONFIRMED_SOURCE = {
    fetchedOn: '2026-09-01',
    quote: 'a synthetic test quote',
    sourceKind: PolicySourceKind.LiveFetch,
    url: 'https://example.test/policy',
    verification: PolicyVerification.Confirmed,
} as const;

const CONFIRMED_TRIGGER = new CumulativeAmountTrigger(
    dollars(VERIFIED_LIMIT),
    CONFIRMED_SOURCE,
);

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

const SPEC: DocumentedPolicySpec = {
    enginePolicy: buildEnginePolicy({
        fundedHorizonDays: 60,
        plan: PLAN,
        rulebook: DEFAULT_RULEBOOK,
    }).policy,
    rulebook: DEFAULT_RULEBOOK,
    run: { maxEvalDays: 40, seed: 11, trials: 30 },
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

const PRICED = {
    amount: VERIFIED_LIMIT,
    kind: 'cumulative-payout-trigger-priced',
    source: {
        fetchedOn: CONFIRMED_SOURCE.fetchedOn,
        quote: CONFIRMED_SOURCE.quote,
        url: CONFIRMED_SOURCE.url,
    },
};

function pricedAccount() {
    const account = freshFundedAccount(PLAN);
    account.state.balance = 51_500;
    return account;
}

function requestNowOf() {
    const account = pricedAccount();
    const milestone = milestoneState(account, SPEC);
    if (milestone.kind !== MilestoneKind.Funded) {
        throw new Error('expected a funded milestone');
    }
    return requestNowValue(account, milestone, SPEC);
}

function sweepOptimum() {
    const result = runPayoutSizeSweep(PLAN, {
        source: AdviceSource.PayoutSizeSweep,
        spec: SPEC,
    });
    if (result.kind !== PayoutSizeSweepResultKind.Optimum) {
        throw new Error('expected a payout-size optimum');
    }
    return result.optimum;
}

describe('every figure that prices a confirmed cumulative trigger carries the typed assumption (PT-36q, F-145)', () => {
    describe('the payout-size optimum', () => {
        it('names the trigger it priced', () => {
            const optimum = withTriggers([CONFIRMED_TRIGGER], sweepOptimum);
            expect(optimum.cumulativePayoutTrigger).toMatchObject(PRICED);
        });

        it('says nothing when no trigger is confirmed', () => {
            expect(sweepOptimum()).not.toHaveProperty(
                'cumulativePayoutTrigger',
            );
        });
    });

    describe('the funded value estimate', () => {
        it('names the trigger it priced', () => {
            const result = withTriggers([CONFIRMED_TRIGGER], () =>
                fundedValueEstimate(PLAN, SPEC, null),
            );
            expect(result.cumulativePayoutTrigger).toMatchObject(PRICED);
        });

        it('says nothing when no trigger is confirmed', () => {
            expect(fundedValueEstimate(PLAN, SPEC, null)).not.toHaveProperty(
                'cumulativePayoutTrigger',
            );
        });
    });

    describe('the value at a state', () => {
        it('names the trigger it priced, and the text says the simulation sends accounts live', () => {
            const outcome = withTriggers([CONFIRMED_TRIGGER], () =>
                valueAtState(pricedAccount(), SPEC),
            );
            if (outcome.kind !== ValueResultKind.Value) {
                throw new Error('expected a modeled value');
            }
            expect(outcome).toMatchObject({
                cumulativePayoutTrigger: PRICED,
            });
            const { cumulativePayoutTrigger } = outcome;
            if (cumulativePayoutTrigger === undefined) {
                throw new Error('expected the priced trigger');
            }
            expect(assumptionText(cumulativePayoutTrigger)).toContain(
                'The simulation sends an account live',
            );
        });

        it('says nothing when no trigger is confirmed', () => {
            expect(valueAtState(pricedAccount(), SPEC)).not.toHaveProperty(
                'cumulativePayoutTrigger',
            );
        });
    });

    describe('the retire comparison', () => {
        const request = { isCapacityBound: false, replacementPlan: PLAN };

        it('names the trigger priced for keeping the account and for the simulated replacement', () => {
            const outcome = withTriggers([CONFIRMED_TRIGGER], () =>
                retireComparison(pricedAccount(), SPEC, request),
            );
            expect(outcome).toMatchObject({
                basis: RetireComparisonBasis.Simulator,
                cumulativePayoutTrigger: PRICED,
                replacementCumulativePayoutTrigger: PRICED,
            });
        });

        it('names only the kept account when the replacement rate is a validated slot rate, which no simulation priced here', () => {
            const outcome = withTriggers([CONFIRMED_TRIGGER], () =>
                retireComparison(pricedAccount(), SPEC, {
                    ...request,
                    validatedSlotRate: { standardError: null, value: 1 },
                }),
            );
            expect(outcome).toMatchObject({
                basis: RetireComparisonBasis.AverageRewardDp,
                cumulativePayoutTrigger: PRICED,
            });
            expect(outcome).not.toHaveProperty(
                'replacementCumulativePayoutTrigger',
            );
        });

        it('flags a validated slot rate as trigger free when the keep rate priced the trigger', () => {
            const outcome = withTriggers([CONFIRMED_TRIGGER], () =>
                retireComparison(pricedAccount(), SPEC, {
                    ...request,
                    validatedSlotRate: { standardError: null, value: 1 },
                }),
            );
            expect(outcome).toMatchObject({ isSlotRateTriggerFree: true });
        });

        it('does not flag the simulated replacement, which priced the same trigger', () => {
            const outcome = withTriggers([CONFIRMED_TRIGGER], () =>
                retireComparison(pricedAccount(), SPEC, request),
            );
            expect(outcome).not.toHaveProperty('isSlotRateTriggerFree');
        });

        it('does not flag a validated slot rate when no trigger is confirmed', () => {
            const outcome = retireComparison(pricedAccount(), SPEC, {
                ...request,
                validatedSlotRate: { standardError: null, value: 1 },
            });
            expect(outcome).not.toHaveProperty('isSlotRateTriggerFree');
        });

        it('says nothing when no trigger is confirmed', () => {
            const outcome = retireComparison(pricedAccount(), SPEC, request);
            expect(outcome).not.toHaveProperty('cumulativePayoutTrigger');
            expect(outcome).not.toHaveProperty(
                'replacementCumulativePayoutTrigger',
            );
        });
    });

    describe('the risk candidates', () => {
        const request = { riskGrid: [100], rr: 2 };

        it('names the trigger they priced', () => {
            const outcome = withTriggers([CONFIRMED_TRIGGER], () =>
                riskCandidateValues(pricedAccount(), SPEC, request),
            );
            expect(outcome).toMatchObject({
                cumulativePayoutTrigger: PRICED,
            });
        });

        it('says nothing when no trigger is confirmed', () => {
            expect(
                riskCandidateValues(pricedAccount(), SPEC, request),
            ).not.toHaveProperty('cumulativePayoutTrigger');
        });
    });

    describe('the request-now value', () => {
        it('names the trigger on the request-now and the continuation figures', () => {
            const { continuation, requestNow } = withTriggers(
                [CONFIRMED_TRIGGER],
                requestNowOf,
            );
            expect(continuation.cumulativePayoutTrigger).toMatchObject(PRICED);
            expect(requestNow.cumulativePayoutTrigger).toMatchObject(PRICED);
        });

        it('says nothing when no trigger is confirmed', () => {
            const { continuation, requestNow } = requestNowOf();
            expect(continuation).not.toHaveProperty('cumulativePayoutTrigger');
            expect(requestNow).not.toHaveProperty('cumulativePayoutTrigger');
        });
    });
});
