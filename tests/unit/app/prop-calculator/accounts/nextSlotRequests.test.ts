import { describe, expect, it } from 'vitest';

import {
    OverviewOutcomeKind,
    overviewOutcomeOf,
    type OverviewRequest,
    overviewRequestKey,
    OverviewRequestKind,
    overviewRequestsFor,
    overviewWorkerRequestSchema,
} from '~/app/(app)/prop-calculator/_workers/overviewWorkerMessages';
import { nextSlotRequestsOf } from '~/app/(app)/prop-calculator/accounts/next-slot/nextSlotModel';
import {
    AccountEventKind,
    AccountStage,
    AccountStatus,
    FirmEngagementReason,
    FirmEngagementStatus,
} from '~/lib/prop-accounts/core';
import { rebuyLagDefault, replacementStats } from '~/lib/prop-accounts/metrics';
import {
    nextSlotCandidatePlans,
    type NextSlotPlanRef,
} from '~/lib/prop-accounts/planning';
import {
    ALL_FIRMS,
    CENTS_PER_DOLLAR,
    CumulativeAmountTrigger,
    dollars,
    effectivePayoutRequest,
    FirmAccountPolicy,
    LifetimePayoutCapOverrideKind,
    NO_PLAN_OPT_INS,
    PayoutRequestPolicy,
    PlanAvailability,
    PolicySourceKind,
    PolicyVerification,
    serializePlanId,
    type TradingFirm,
} from '~/lib/prop-calculator';
import {
    DEFAULT_RULEBOOK,
    enginePolicyKey,
    LifetimePayoutCapBasis,
    RebuyLagBasis,
    toSimInputs,
} from '~/lib/prop-calculator/advisor';

import {
    account,
    EVAL_PLAN,
    event,
    firmEngagement,
    ledger,
    OTHER_FIRM_EVAL_PLAN,
} from '../../../lib/prop-accounts/metrics/ledgerFixtures';

const TODAY = '2026-09-30';

const SMALL_RUN = { maxEvalDays: 150, seed: 7, trials: 200 } as const;

const UNSOLD_SERIALS = ALL_FIRMS.flatMap((firm) => firm.plans)
    .filter((plan) => plan.availability !== PlanAvailability.Purchasable)
    .map((plan) => serializePlanId(plan.id));

const RULEBOOK_REQUEST =
    DEFAULT_RULEBOOK.payout.requestCents / CENTS_PER_DOLLAR;

class CappedAtFivePolicy extends FirmAccountPolicy {
    override lifetimePayoutCapOverride() {
        return { cap: 5, kind: LifetimePayoutCapOverrideKind.Capped } as const;
    }
}

class VerifiedPolicy extends FirmAccountPolicy {
    override liveTriggersFor() {
        return [
            new CumulativeAmountTrigger(dollars(100_000), {
                fetchedOn: '2026-09-20',
                quote: 'a synthetic confirmed quote',
                sourceKind: PolicySourceKind.UserPaste,
                url: 'https://example.test/policy',
                verification: PolicyVerification.Confirmed,
            }),
        ];
    }
}

function keysOf(requests: readonly OverviewRequest[]): readonly string[] {
    return requests.map((request) => overviewRequestKey(request));
}

function refSerial(ref: NextSlotPlanRef): string {
    return serializePlanId(ref.plan.id);
}

function requestsOf(
    requests: readonly OverviewRequest[],
    kind: OverviewRequestKind,
): readonly OverviewRequest[] {
    return requests.filter((request) => request.kind === kind);
}

function withPolicy<T>(
    firm: TradingFirm,
    policy: FirmAccountPolicy,
    run: () => T,
): T {
    const writable = firm as { accountPolicy: FirmAccountPolicy };
    const original = writable.accountPolicy;
    writable.accountPolicy = policy;
    try {
        return run();
    } finally {
        writable.accountPolicy = original;
    }
}

describe('nextSlotRequestsOf', () => {
    const requests = nextSlotRequestsOf(ledger({}), DEFAULT_RULEBOOK, TODAY);
    const plans = nextSlotCandidatePlans();

    it('asks for one documented-run request per rankable plan and none for a call-up-only or discontinued plan', () => {
        expect(plans.length).toBeGreaterThan(0);
        expect(
            requestsOf(requests, OverviewRequestKind.DocumentedRun),
        ).toHaveLength(plans.length);
        const rankableSerials = new Set(plans.map(refSerial));
        for (const request of requests) {
            expect(rankableSerials.has(request.planSerial)).toBe(true);
        }
        expect(UNSOLD_SERIALS.length).toBeGreaterThan(0);
        for (const serial of UNSOLD_SERIALS) {
            expect(requests.map((request) => request.planSerial)).not.toContain(
                serial,
            );
        }
    });

    it('carries specs only: every request survives structuredClone and the worker request schema unchanged', () => {
        expect(requests.length).toBeGreaterThan(0);
        expect(structuredClone(requests)).toEqual(requests);
        expect(overviewWorkerRequestSchema.parse({ requests })).toEqual({
            requests,
        });
        for (const request of requests) {
            expect(request).not.toHaveProperty('plan');
            expect(request.optIns).toEqual(NO_PLAN_OPT_INS);
        }
    });

    it('keys every request by plan, kind and engine policy, with no key twice', () => {
        expect(requests.length).toBeGreaterThan(0);
        const keys = keysOf(requests);
        expect(new Set(keys).size).toBe(keys.length);
        for (const request of requests) {
            const parsed = JSON.parse(overviewRequestKey(request)) as {
                kind: string;
                planSerial: string;
                policy: string;
            };
            expect(parsed.planSerial).toBe(request.planSerial);
            expect(parsed.kind).toBe(request.kind);
            expect(parsed.policy).toBe(
                enginePolicyKey(request.spec.enginePolicy),
            );
        }
    });

    it('asks for the payout-size optimum only for plans that pass every check made before the engine runs', () => {
        expect(
            requestsOf(requests, OverviewRequestKind.PayoutSizeOptimum),
        ).toEqual([]);
        const ref = plans[0];
        if (ref === undefined) throw new Error('expected a rankable plan');
        const verified = withPolicy(ref.firm, new VerifiedPolicy(), () =>
            nextSlotRequestsOf(ledger({}), DEFAULT_RULEBOOK, TODAY),
        );
        const firmSerials = new Set(
            plans
                .filter((candidate) => candidate.firm.id === ref.firm.id)
                .map(refSerial),
        );
        const optimumSerials = new Set(
            requestsOf(verified, OverviewRequestKind.PayoutSizeOptimum).map(
                (request) => request.planSerial,
            ),
        );
        expect(firmSerials.size).toBeGreaterThan(0);
        expect(optimumSerials).toEqual(firmSerials);
        expect(
            requestsOf(verified, OverviewRequestKind.DocumentedRun),
        ).toHaveLength(plans.length);
        const paused = withPolicy(ref.firm, new VerifiedPolicy(), () =>
            nextSlotRequestsOf(
                ledger({
                    firmEngagements: [
                        firmEngagement(
                            '',
                            '2026-09-01',
                            FirmEngagementStatus.Paused,
                            {
                                externalFirmId: null,
                                firmId: ref.firm.id,
                                reason: FirmEngagementReason.LowExpectedValue,
                            },
                        ),
                    ],
                }),
                DEFAULT_RULEBOOK,
                TODAY,
            ),
        );
        expect(
            requestsOf(paused, OverviewRequestKind.PayoutSizeOptimum),
        ).toEqual([]);
    });

    it('dedupes with the keys the overview asks for when the user holds the plan, so a held plan is computed once', () => {
        const held = plans[0];
        if (held === undefined) throw new Error('expected a rankable plan');
        const { nextSlot, overviewRequests } = withPolicy(
            held.firm,
            new VerifiedPolicy(),
            () => ({
                nextSlot: nextSlotRequestsOf(
                    ledger({}),
                    DEFAULT_RULEBOOK,
                    TODAY,
                ),
                overviewRequests: overviewRequestsFor(
                    [
                        {
                            firmId: held.firm.id,
                            measuredRebuyLag: null,
                            optIns: NO_PLAN_OPT_INS,
                            planSerial: refSerial(held),
                        },
                    ],
                    DEFAULT_RULEBOOK,
                ),
            }),
        );
        expect(overviewRequests).toHaveLength(2);
        const nextSlotKeys = new Set(keysOf(nextSlot));
        for (const key of keysOf(overviewRequests)) {
            expect(nextSlotKeys.has(key)).toBe(true);
        }
    });

    it('asks for the same requests whatever the ledger holds when no plan has a measured rebuy lag', () => {
        const withAccount = nextSlotRequestsOf(
            ledger({
                accounts: [account(EVAL_PLAN, { stage: AccountStage.Funded })],
            }),
            DEFAULT_RULEBOOK,
            TODAY,
        );
        expect(requests.length).toBeGreaterThan(0);
        expect(keysOf(withAccount)).toEqual(keysOf(requests));
    });

    it('runs every plan on one rebuy lag, the sample-weighted measured lag across the plans you hold, so held and unheld plans are compared on the same basis', () => {
        const prior = account(EVAL_PLAN, {
            purchasedOn: '2026-08-03',
            status: AccountStatus.Busted,
        });
        const replacement = account(EVAL_PLAN, {
            purchasedOn: '2026-08-13',
            replacesAccountId: prior.id,
        });
        const measuredLedger = ledger({
            accounts: [prior, replacement],
            events: [event(prior, AccountEventKind.Busted, '2026-08-10')],
        });
        const measured = rebuyLagDefault(
            replacementStats(measuredLedger),
            EVAL_PLAN.serial,
        );
        expect(measured.basis).toBe(RebuyLagBasis.Measured);
        const measuredRequests = nextSlotRequestsOf(
            measuredLedger,
            DEFAULT_RULEBOOK,
            TODAY,
        );
        const lagsOf = (list: readonly OverviewRequest[]) =>
            new Set(
                list.map(
                    (request) =>
                        `${request.spec.enginePolicy.rebuyLagBasis}:${String(request.spec.enginePolicy.rebuyLagDays)}`,
                ),
            );
        expect(lagsOf(measuredRequests)).toEqual(
            new Set([`${RebuyLagBasis.Measured}:${String(measured.days)}`]),
        );
        expect(
            measuredRequests.some(
                (request) => request.planSerial === OTHER_FIRM_EVAL_PLAN.serial,
            ),
        ).toBe(true);
        expect(lagsOf(requests)).toEqual(
            new Set([`${RebuyLagBasis.AssumedZero}:0`]),
        );
    });

    it('carries the rulebook retained cushion of at least $2,000, FullRequestOnly and the effective request in every spec', () => {
        expect(requests.length).toBeGreaterThan(0);
        for (const request of requests) {
            const plan = plans.find(
                (ref) => refSerial(ref) === request.planSerial,
            )?.plan;
            if (plan === undefined) throw new Error('plan not found');
            const { enginePolicy } = request.spec;
            expect(enginePolicy.retainedCushionRequest).toBeGreaterThanOrEqual(
                2000,
            );
            expect(enginePolicy.payoutRequestOverride).toBe(
                effectivePayoutRequest(plan, RULEBOOK_REQUEST),
            );
            if (request.kind === OverviewRequestKind.DocumentedRun) {
                expect(
                    toSimInputs(plan, request.spec).payoutRequestPolicy,
                ).toBe(PayoutRequestPolicy.FullRequestOnly);
            }
        }
    });

    it('runs every rankable plan whose minimum request is above $500 at its minimum, never at $500', () => {
        const above = plans.filter(
            (ref) => effectivePayoutRequest(ref.plan, RULEBOOK_REQUEST) > 500,
        );
        expect(above.length).toBeGreaterThan(0);
        for (const ref of above) {
            const minimum = effectivePayoutRequest(ref.plan, RULEBOOK_REQUEST);
            const documented = requests.find(
                (request) =>
                    request.planSerial === refSerial(ref) &&
                    request.kind === OverviewRequestKind.DocumentedRun,
            );
            if (documented === undefined) throw new Error('no documented run');
            expect(documented.spec.enginePolicy.payoutRequestOverride).toBe(
                minimum,
            );
            const outcome = overviewOutcomeOf({
                ...documented,
                spec: { ...documented.spec, run: SMALL_RUN },
            });
            expect(outcome.kind).toBe(OverviewOutcomeKind.Succeeded);
            if (
                outcome.kind === OverviewOutcomeKind.Succeeded &&
                outcome.result.kind === OverviewRequestKind.DocumentedRun
            ) {
                expect(outcome.result.figures.payoutRequestSize).toBe(minimum);
            }
        }
    });

    it('carries a verified lifetime payout count trigger into the engine policy of a firm that has one', () => {
        const ref = plans[0];
        if (ref === undefined) throw new Error('expected a rankable plan');
        const capped = withPolicy(ref.firm, new CappedAtFivePolicy(), () =>
            nextSlotRequestsOf(ledger({}), DEFAULT_RULEBOOK, TODAY),
        );
        const request = capped.find(
            (candidate) =>
                candidate.planSerial === refSerial(ref) &&
                candidate.kind === OverviewRequestKind.DocumentedRun,
        );
        expect(request?.spec.enginePolicy.lifetimePayoutCapBasis).toBe(
            LifetimePayoutCapBasis.VerifiedCountTrigger,
        );
        expect(request?.spec.enginePolicy.lifetimePayoutCapOverride).toBe(5);
        expect(
            requests.find(
                (candidate) =>
                    candidate.planSerial === refSerial(ref) &&
                    candidate.kind === OverviewRequestKind.DocumentedRun,
            )?.spec.enginePolicy.lifetimePayoutCapBasis,
        ).toBe(LifetimePayoutCapBasis.LiveTriggersNotChecked);
    });
});
