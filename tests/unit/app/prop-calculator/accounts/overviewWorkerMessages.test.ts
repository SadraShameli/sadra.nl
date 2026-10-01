import { describe, expect, it } from 'vitest';

import {
    type DocumentedRunFigures,
    OverviewOutcomeKind,
    overviewOutcomeOf,
    overviewPlanKey,
    overviewProjectionRequestsFor,
    type OverviewRequest,
    overviewRequestKey,
    OverviewRequestKind,
    overviewRequestSchema,
    overviewRequestsFor,
    type PayoutSizeOptimumFigures,
    type PortfolioProjectionFigures,
} from '~/app/(app)/prop-calculator/_workers/overviewWorkerMessages';
import {
    CENTS_PER_DOLLAR,
    effectivePayoutRequest,
    findFirm,
    FirmId,
    InstrumentSymbol,
    MffuVariant,
    NO_PLAN_OPT_INS,
    PayoutRequestPolicy,
    type Plan,
    serializePlanId,
    TopStepVariant,
} from '~/lib/prop-calculator';
import {
    AdviceSource,
    DEFAULT_RULEBOOK,
    enginePolicyKey,
    LifetimePayoutCapBasis,
    PayoutSizeSweepResultKind,
    RebuyLagBasis,
    runPayoutSizeSweep,
    StartBasis,
    toSimInputs,
} from '~/lib/prop-calculator/advisor';
import {
    DOCUMENTED_POLICY_TIMELINE_GAP_TEXT,
    DocumentedPolicyTimelineGap,
    documentedPolicyTimelineInputs,
} from '~/lib/prop-calculator/advisor/policy';
import { simulatePortfolioTimeline } from '~/lib/prop-calculator/portfolioTimeline';
import {
    SIM_INPUTS_REFUSAL_PREFIX,
    simInputsSizingIssue,
    simulate,
} from '~/lib/prop-calculator/simulator';

function requirePlan(value: null | Plan | undefined, message: string): Plan {
    if (value === null || value === undefined) throw new Error(message);
    return value;
}

const TOPSTEP_50K = requirePlan(
    findFirm(FirmId.TopStep)?.findPlanBySerial(
        serializePlanId({
            accountSize: 50_000,
            firm: FirmId.TopStep,
            variant: TopStepVariant.StandardStandard,
        }),
    ),
    'expected the TopStep 50K Standard/Standard plan to resolve',
);

const MFF_PRO_50K = requirePlan(
    findFirm(FirmId.Mffu)?.findPlan({
        accountSize: 50_000,
        firm: FirmId.Mffu,
        variant: MffuVariant.Pro,
    }),
    'expected the MFF Pro 50K plan to resolve',
);

const TOPSTEP_SERIAL = serializePlanId(TOPSTEP_50K.id);
const MFF_SERIAL = serializePlanId(MFF_PRO_50K.id);
const SMALL_RUN = { maxEvalDays: 150, seed: 7, trials: 200 } as const;
const TINY_RUN = { maxEvalDays: 150, seed: 7, trials: 30 } as const;

function documentedOf(requests: readonly OverviewRequest[]): OverviewRequest {
    const found = requests.find(
        (request) => request.kind === OverviewRequestKind.DocumentedRun,
    );
    if (found === undefined) throw new Error('no documented-run request');
    return found;
}

function optimumOf(requests: readonly OverviewRequest[]): OverviewRequest {
    const found = requests.find(
        (request) => request.kind === OverviewRequestKind.PayoutSizeOptimum,
    );
    if (found === undefined) throw new Error('no payout-size-optimum request');
    return found;
}

function requestsFor(
    plan: Plan = TOPSTEP_50K,
    overrides: {
        readonly measuredRebuyLag?: { days: number; samples: number };
    } = {},
): readonly OverviewRequest[] {
    return overviewRequestsFor(
        [
            {
                firmId: plan.id.firm,
                measuredRebuyLag: overrides.measuredRebuyLag ?? null,
                optIns: NO_PLAN_OPT_INS,
                planSerial: serializePlanId(plan.id),
            },
        ],
        DEFAULT_RULEBOOK,
    );
}

function smallRun(request: OverviewRequest): OverviewRequest {
    return { ...request, spec: { ...request.spec, run: SMALL_RUN } };
}

function succeededDocumented(request: OverviewRequest): DocumentedRunFigures {
    const outcome = overviewOutcomeOf(request);
    if (outcome.kind !== OverviewOutcomeKind.Succeeded) {
        throw new Error(`expected success, got: ${outcome.reason}`);
    }
    if (outcome.result.kind !== OverviewRequestKind.DocumentedRun) {
        throw new Error('expected a documented-run result');
    }
    return outcome.result.figures;
}

function succeededOptimum(request: OverviewRequest): PayoutSizeOptimumFigures {
    const outcome = overviewOutcomeOf(request);
    if (outcome.kind !== OverviewOutcomeKind.Succeeded) {
        throw new Error(`expected success, got: ${outcome.reason}`);
    }
    if (outcome.result.kind !== OverviewRequestKind.PayoutSizeOptimum) {
        throw new Error('expected a payout-size-optimum result');
    }
    return outcome.result.figures;
}

describe('overviewRequestsFor', () => {
    it('emits one documented-run and one payout-size-optimum request per plan, each surviving structuredClone', () => {
        const requests = requestsFor();
        expect(requests.map((request) => request.kind)).toEqual([
            OverviewRequestKind.DocumentedRun,
            OverviewRequestKind.PayoutSizeOptimum,
        ]);
        for (const request of requests) {
            expect(structuredClone(request)).toEqual(request);
            expect(request.firmId).toBe(FirmId.TopStep);
            expect(request.planSerial).toBe(TOPSTEP_SERIAL);
            expect(request.spec.planSerial).toBe(TOPSTEP_SERIAL);
            expect(request).not.toHaveProperty('plan');
        }
    });

    it('carries the TopStep retained cushion of 2,000, never $0, into the engine inputs', () => {
        const request = documentedOf(requestsFor());
        expect(request.spec.enginePolicy.retainedCushionRequest).toBe(2000);
        expect(toSimInputs(TOPSTEP_50K, request.spec).minRetainedCushion).toBe(
            2000,
        );
    });

    it('carries the MFF Pro effective request of 1,000 under FullRequestOnly', () => {
        const request = documentedOf(requestsFor(MFF_PRO_50K));
        const rulebookRequest =
            DEFAULT_RULEBOOK.payout.requestCents / CENTS_PER_DOLLAR;
        expect(effectivePayoutRequest(MFF_PRO_50K, rulebookRequest)).toBe(1000);
        expect(request.spec.enginePolicy.payoutRequestOverride).toBe(1000);
        const inputs = toSimInputs(MFF_PRO_50K, request.spec);
        expect(inputs.payoutRequestPolicy).toBe(
            PayoutRequestPolicy.FullRequestOnly,
        );
        expect(inputs.payoutRequestSize).toBe(1000);
    });

    it('builds the engine policy once per plan: the same plan listed twice gives one request pair', () => {
        const input = {
            firmId: FirmId.TopStep,
            measuredRebuyLag: null,
            optIns: NO_PLAN_OPT_INS,
            planSerial: TOPSTEP_SERIAL,
        };
        const requests = overviewRequestsFor([input, input], DEFAULT_RULEBOOK);
        expect(requests).toHaveLength(2);
        const other = overviewRequestsFor(
            [
                input,
                {
                    ...input,
                    firmId: FirmId.Mffu,
                    planSerial: MFF_SERIAL,
                },
            ],
            DEFAULT_RULEBOOK,
        );
        expect(other).toHaveLength(4);
        expect(new Set(other.map((one) => overviewRequestKey(one))).size).toBe(
            4,
        );
    });

    it('skips a plan the engine no longer models instead of throwing', () => {
        const requests = overviewRequestsFor(
            [
                {
                    firmId: FirmId.TopStep,
                    measuredRebuyLag: null,
                    optIns: NO_PLAN_OPT_INS,
                    planSerial: 'no-such-plan',
                },
            ],
            DEFAULT_RULEBOOK,
        );
        expect(requests).toEqual([]);
    });

    it('uses the measured rebuy lag when there is one and an assumed zero otherwise, labelled in the policy', () => {
        const measured = documentedOf(
            requestsFor(TOPSTEP_50K, {
                measuredRebuyLag: { days: 4.5, samples: 3 },
            }),
        );
        expect(measured.spec.enginePolicy.rebuyLagBasis).toBe(
            RebuyLagBasis.Measured,
        );
        expect(measured.spec.enginePolicy.rebuyLagDays).toBe(4.5);
        const assumed = documentedOf(requestsFor());
        expect(assumed.spec.enginePolicy.rebuyLagBasis).toBe(
            RebuyLagBasis.AssumedZero,
        );
        expect(assumed.spec.enginePolicy.rebuyLagDays).toBe(0);
    });

    it('starts fresh and states no instrument or stop, the declared fractional basis', () => {
        const request = documentedOf(requestsFor());
        expect(request.spec.start).toBeUndefined();
        expect(request.spec.enginePolicy.instrument).toBeUndefined();
        expect(request.spec.enginePolicy.stopPoints).toBeUndefined();
    });

    it('labels the lifetime cap basis as not checked for a firm with no verified count trigger', () => {
        const request = documentedOf(requestsFor());
        expect(request.spec.enginePolicy.lifetimePayoutCapBasis).toBe(
            LifetimePayoutCapBasis.LiveTriggersNotChecked,
        );
    });
});

describe('overviewRequestKey', () => {
    it('is stable for the same request and keys the payout-size optimum separately from the documented run', () => {
        const requests = requestsFor();
        const documented = documentedOf(requests);
        const optimum = optimumOf(requests);
        expect(overviewRequestKey(documented)).toBe(
            overviewRequestKey(structuredClone(documented)),
        );
        expect(overviewRequestKey(documented)).not.toBe(
            overviewRequestKey(optimum),
        );
    });

    it('carries the engine policy key of the request', () => {
        const documented = documentedOf(requestsFor());
        const parsed: unknown = JSON.parse(overviewRequestKey(documented));
        expect(parsed).toMatchObject({
            policy: enginePolicyKey(documented.spec.enginePolicy),
        });
    });

    it('puts the instrument and stop in the key, and differs from the unsized basis', () => {
        const unsized = documentedOf(requestsFor());
        const sized: OverviewRequest = {
            ...unsized,
            spec: {
                ...unsized.spec,
                enginePolicy: {
                    ...unsized.spec.enginePolicy,
                    instrument: InstrumentSymbol.ES,
                    stopPoints: 10,
                },
            },
        };
        const longerStop: OverviewRequest = {
            ...sized,
            spec: {
                ...sized.spec,
                enginePolicy: { ...sized.spec.enginePolicy, stopPoints: 12 },
            },
        };
        const keys = [unsized, sized, longerStop].map((request) =>
            overviewRequestKey(request),
        );
        expect(new Set(keys).size).toBe(3);
    });

    it('changes with every policy, run and rulebook field that reaches the engine', () => {
        const base = documentedOf(requestsFor());
        const baseKey = overviewRequestKey(base);
        const policy = base.spec.enginePolicy;
        const variants: readonly OverviewRequest[] = [
            withPolicy(base, { commissionPerRoundTrip: 2 }),
            withPolicy(base, { fundedHorizonDays: 100 }),
            withPolicy(base, { intradayPathStepsPerR: 10 }),
            withPolicy(base, {
                lifetimePayoutCapBasis:
                    LifetimePayoutCapBasis.VerifiedCountTrigger,
                lifetimePayoutCapOverride: 3,
            }),
            withPolicy(base, {
                payoutRequestOverride:
                    (policy.payoutRequestOverride ?? 500) + 250,
            }),
            withPolicy(base, {
                rebuyLagBasis: RebuyLagBasis.Measured,
                rebuyLagDays: 6,
            }),
            withPolicy(base, { retainedCushionRequest: 2500 }),
            {
                ...base,
                spec: { ...base.spec, run: { ...base.spec.run, trials: 999 } },
            },
            {
                ...base,
                spec: { ...base.spec, run: { ...base.spec.run, seed: 1 } },
            },
            {
                ...base,
                spec: {
                    ...base.spec,
                    run: { ...base.spec.run, maxEvalDays: 90 },
                },
            },
            {
                ...base,
                spec: {
                    ...base.spec,
                    rulebook: {
                        ...base.spec.rulebook,
                        strategy: {
                            ...base.spec.rulebook.strategy,
                            winrate: base.spec.rulebook.strategy.winrate + 0.05,
                        },
                    },
                },
            },
            {
                ...base,
                spec: {
                    ...base.spec,
                    rulebook: {
                        ...base.spec.rulebook,
                        funded: {
                            ...base.spec.rulebook.funded,
                            riskCents:
                                base.spec.rulebook.funded.riskCents + 5000,
                        },
                    },
                },
            },
            { ...base, optIns: { ...base.optIns, takesFundedReset: true } },
        ];
        const keys = variants.map((variant) => overviewRequestKey(variant));
        for (const key of keys) expect(key).not.toBe(baseKey);
        expect(new Set(keys).size).toBe(keys.length);
    });
});

describe('overviewPlanKey', () => {
    it('is the same for both request kinds of a plan and differs by opt-ins', () => {
        const requests = requestsFor();
        const [documented, optimum] = [
            documentedOf(requests),
            optimumOf(requests),
        ];
        expect(overviewPlanKey(documented)).toBe(overviewPlanKey(optimum));
        expect(
            overviewPlanKey({
                ...documented,
                optIns: { ...documented.optIns, takesFundedReset: true },
            }),
        ).not.toBe(overviewPlanKey(documented));
    });
});

describe('overviewRequestSchema', () => {
    it('round-trips a built request', () => {
        for (const request of requestsFor()) {
            expect(
                overviewRequestSchema.parse(structuredClone(request)),
            ).toEqual(request);
        }
    });

    it('rejects a request with a from-state start, since the overview is a fresh-start run', () => {
        const request = documentedOf(requestsFor());
        const withStart = {
            ...request,
            spec: {
                ...request.spec,
                start: {
                    phase: 'eval',
                    state: {
                        balance: 50_000,
                        peak: 50_000,
                        threshold: 48_000,
                    },
                },
            },
        };
        expect(overviewRequestSchema.safeParse(withStart).success).toBe(false);
    });

    it('rejects an unknown request kind and extra keys', () => {
        const request = documentedOf(requestsFor());
        expect(
            overviewRequestSchema.safeParse({ ...request, kind: 'nope' })
                .success,
        ).toBe(false);
        expect(
            overviewRequestSchema.safeParse({ ...request, plan: {} }).success,
        ).toBe(false);
    });
});

describe('overviewOutcomeOf', () => {
    it('runs the documented policy fresh and reports the figures of the same simulate call', () => {
        const request = smallRun(documentedOf(requestsFor()));
        const figures = succeededDocumented(request);
        const direct = simulate(toSimInputs(TOPSTEP_50K, request.spec));
        expect(figures.trials).toBe(SMALL_RUN.trials);
        expect(figures.fundedHorizonDays).toBe(
            request.spec.enginePolicy.fundedHorizonDays,
        );
        expect(figures.expectedMonthlyNet).toEqual(
            direct.estimates.expectedMonthlyNet,
        );
        expect(figures.expectedMonthlyRealizedNet).toEqual(
            direct.estimates.expectedMonthlyRealizedNet,
        );
        expect(figures.attemptPassProbability).toEqual(
            direct.estimates.attemptPassProbability,
        );
        expect(figures.fundedSurvivalProbability).toEqual(
            direct.estimates.fundedSurvivalProbability,
        );
        expect(figures.anyPayoutGivenFundedProbability).toEqual(
            direct.estimates.anyPayoutGivenFundedProbability,
        );
        expect(figures.payoutsPerFundedAccount).toEqual(
            direct.estimates.payoutsPerFundedAccount,
        );
        expect(figures.expectedPayoutPerFundedAccount).toEqual(
            direct.estimates.expectedPayoutPerFundedAccount,
        );
        expect(figures.costPerAttempt).toEqual(direct.estimates.costPerAttempt);
        expect(figures.expectedNetPerAttempt).toEqual(
            direct.estimates.expectedNetPerAttempt,
        );
        expect(figures.costPerFundedAccount).toBe(direct.costPerFundedAccount);
        expect(figures.fundedPayoutCountDistribution).toEqual(
            direct.fundedPayoutCountDistribution,
        );
    });

    it('reports the engine-resolved retained cushion and payout request it ran with', () => {
        const request = smallRun(documentedOf(requestsFor(MFF_PRO_50K)));
        const figures = succeededDocumented(request);
        const inputs = toSimInputs(MFF_PRO_50K, request.spec);
        expect(figures.minRetainedCushion).toBe(inputs.minRetainedCushion);
        expect(figures.minRetainedCushion).toBeGreaterThanOrEqual(2000);
        expect(figures.payoutRequestSize).toBe(1000);
    });

    it('returns a result that survives structuredClone', () => {
        const request = smallRun(documentedOf(requestsFor()));
        const outcome = overviewOutcomeOf(request);
        expect(structuredClone(outcome)).toEqual(outcome);
    });

    it('keys every outcome by its request key', () => {
        const request = smallRun(documentedOf(requestsFor()));
        expect(overviewOutcomeOf(request).key).toBe(
            overviewRequestKey(request),
        );
    });

    it('runs the PT-32 payout-size sweep for the optimum request and reports its winner', () => {
        const request = smallRun(optimumOf(requestsFor()));
        const figures = succeededOptimum(request);
        const direct = runPayoutSizeSweep(TOPSTEP_50K, {
            source: AdviceSource.PayoutSizeSweep,
            spec: request.spec,
        });
        if (direct.kind !== PayoutSizeSweepResultKind.Optimum) {
            throw new Error('the direct sweep found no optimum');
        }
        const { winner } = direct.optimum;
        if (winner.kind !== StartBasis.Fresh) {
            throw new Error('expected a fresh-start winner row');
        }
        expect(figures.requestSize).toBe(winner.requestSize);
        expect(figures.creditSensitive).toBe(direct.optimum.creditSensitive);
        expect(figures.expectedMonthlyNet).toEqual(
            winner.out.estimates.expectedMonthlyNet,
        );
        expect(figures.expectedMonthlyRealizedNet).toEqual(
            winner.out.estimates.expectedMonthlyRealizedNet,
        );
        expect(figures.fundedBustProbability).toEqual(
            winner.out.estimates.fundedBustProbability,
        );
        expect(figures.evaluatedSizes).toBe(direct.optimum.rows.length);
    });

    it('returns a typed failure with the engine text, not a throw, when the sizing is refused', () => {
        const base = documentedOf(requestsFor());
        for (const kind of [
            OverviewRequestKind.DocumentedRun,
            OverviewRequestKind.PayoutSizeOptimum,
        ]) {
            const request: OverviewRequest = {
                ...base,
                kind,
                spec: {
                    ...base.spec,
                    enginePolicy: {
                        ...base.spec.enginePolicy,
                        instrument: InstrumentSymbol.ES,
                        stopPoints: 500,
                    },
                    run: SMALL_RUN,
                },
            };
            const outcome = overviewOutcomeOf(request);
            expect(outcome.kind).toBe(OverviewOutcomeKind.Failed);
            if (outcome.kind !== OverviewOutcomeKind.Failed) return;
            expect(outcome.reason.length).toBeGreaterThan(0);
            expect(outcome.reason.startsWith(SIM_INPUTS_REFUSAL_PREFIX)).toBe(
                false,
            );
            expect(outcome.key).toBe(overviewRequestKey(request));
        }
    });

    it('returns a typed failure naming the serial when the plan is no longer modeled', () => {
        const request: OverviewRequest = {
            ...documentedOf(requestsFor()),
            planSerial: 'no-such-plan',
        };
        const outcome = overviewOutcomeOf(request);
        expect(outcome.kind).toBe(OverviewOutcomeKind.Failed);
        if (outcome.kind !== OverviewOutcomeKind.Failed) return;
        expect(outcome.reason).toContain('no-such-plan');
    });
});

function projectionRequestsFor(
    plan: Plan = TOPSTEP_50K,
    accounts = 2,
    overrides: {
        readonly measuredRebuyLag?: { days: number; samples: number };
    } = {},
): readonly OverviewRequest[] {
    return overviewProjectionRequestsFor(
        [
            {
                accounts,
                firmId: plan.id.firm,
                measuredRebuyLag: overrides.measuredRebuyLag ?? null,
                optIns: NO_PLAN_OPT_INS,
                planSerial: serializePlanId(plan.id),
            },
        ],
        DEFAULT_RULEBOOK,
    );
}

function succeededProjection(
    request: OverviewRequest,
): PortfolioProjectionFigures {
    const outcome = overviewOutcomeOf(request);
    if (outcome.kind !== OverviewOutcomeKind.Succeeded) {
        throw new Error(`expected success, got: ${outcome.reason}`);
    }
    if (outcome.result.kind !== OverviewRequestKind.PortfolioProjection) {
        throw new Error('expected a portfolio-projection result');
    }
    return outcome.result.figures;
}

function tinyProjection(
    plan: Plan = TOPSTEP_50K,
    accounts = 2,
): OverviewRequest {
    const [first] = projectionRequestsFor(plan, accounts);
    if (first === undefined) throw new Error('no projection request');
    return { ...first, spec: { ...first.spec, run: TINY_RUN } };
}

function withFundedTrades(tradesPerDayMax: number): OverviewRequest {
    const base = tinyProjection();
    return {
        ...base,
        spec: {
            ...base.spec,
            rulebook: {
                ...base.spec.rulebook,
                funded: {
                    ...base.spec.rulebook.funded,
                    tradesPerDayMax,
                },
            },
        },
    };
}

function withPolicy(
    request: OverviewRequest,
    changes: Partial<OverviewRequest['spec']['enginePolicy']>,
): OverviewRequest {
    return {
        ...request,
        spec: {
            ...request.spec,
            enginePolicy: { ...request.spec.enginePolicy, ...changes },
        },
    };
}

describe('overviewProjectionRequestsFor (PT-33, F-87)', () => {
    it('emits one portfolio-projection request per plan carrying the account count and only the spec, surviving structuredClone', () => {
        const requests = projectionRequestsFor(TOPSTEP_50K, 3);
        expect(requests).toHaveLength(1);
        const [request] = requests;
        expect(request?.kind).toBe(OverviewRequestKind.PortfolioProjection);
        expect(request?.accounts).toBe(3);
        expect(request?.planSerial).toBe(TOPSTEP_SERIAL);
        expect(request?.spec.planSerial).toBe(TOPSTEP_SERIAL);
        expect(request?.spec.start).toBeUndefined();
        expect(request).not.toHaveProperty('plan');
        expect(structuredClone(request)).toEqual(request);
    });

    it('shares the documented engine policy with the documented-run request of the same plan', () => {
        const [projection] = projectionRequestsFor(TOPSTEP_50K, 2, {
            measuredRebuyLag: { days: 4.5, samples: 3 },
        });
        const documented = documentedOf(
            requestsFor(TOPSTEP_50K, {
                measuredRebuyLag: { days: 4.5, samples: 3 },
            }),
        );
        expect(projection?.spec.enginePolicy).toEqual(
            documented.spec.enginePolicy,
        );
        expect(projection?.spec.rulebook).toEqual(documented.spec.rulebook);
    });

    it('dedupes the same plan, opt-ins and policy listed twice and keeps different plans apart', () => {
        const input = {
            accounts: 2,
            firmId: FirmId.TopStep,
            measuredRebuyLag: null,
            optIns: NO_PLAN_OPT_INS,
            planSerial: TOPSTEP_SERIAL,
        };
        expect(
            overviewProjectionRequestsFor([input, input], DEFAULT_RULEBOOK),
        ).toHaveLength(1);
        const both = overviewProjectionRequestsFor(
            [
                input,
                {
                    ...input,
                    firmId: FirmId.Mffu,
                    planSerial: MFF_SERIAL,
                },
            ],
            DEFAULT_RULEBOOK,
        );
        expect(both).toHaveLength(2);
        expect(new Set(both.map((one) => overviewRequestKey(one))).size).toBe(
            2,
        );
    });

    it('skips a plan the engine no longer models and a plan with no active account', () => {
        expect(
            overviewProjectionRequestsFor(
                [
                    {
                        accounts: 2,
                        firmId: FirmId.TopStep,
                        measuredRebuyLag: null,
                        optIns: NO_PLAN_OPT_INS,
                        planSerial: 'no-such-plan',
                    },
                    {
                        accounts: 0,
                        firmId: FirmId.TopStep,
                        measuredRebuyLag: null,
                        optIns: NO_PLAN_OPT_INS,
                        planSerial: TOPSTEP_SERIAL,
                    },
                ],
                DEFAULT_RULEBOOK,
            ),
        ).toEqual([]);
    });

    it('keys the projection apart from the documented run and by account count and policy', () => {
        const [two] = projectionRequestsFor(TOPSTEP_50K, 2);
        const [three] = projectionRequestsFor(TOPSTEP_50K, 3);
        if (two === undefined || three === undefined) {
            throw new Error('no projection request');
        }
        const documented = documentedOf(requestsFor());
        const keys = [
            overviewRequestKey(two),
            overviewRequestKey(three),
            overviewRequestKey(documented),
            overviewRequestKey(withPolicy(two, { retainedCushionRequest: 2500 })),
        ];
        expect(new Set(keys).size).toBe(keys.length);
        expect(overviewRequestKey(two)).toBe(
            overviewRequestKey(structuredClone(two)),
        );
        expect(overviewPlanKey(two)).toBe(overviewPlanKey(documented));
    });
});

describe('overviewRequestSchema projection requests (PT-33)', () => {
    it('round-trips a projection request', () => {
        for (const request of projectionRequestsFor()) {
            expect(
                overviewRequestSchema.parse(structuredClone(request)),
            ).toEqual(request);
        }
    });

    it('rejects a projection request without an account count, a non-positive one, and an account count on another kind', () => {
        const [request] = projectionRequestsFor();
        const documented = documentedOf(requestsFor());
        expect(
            overviewRequestSchema.safeParse({ ...request, accounts: undefined })
                .success,
        ).toBe(false);
        expect(
            overviewRequestSchema.safeParse({ ...request, accounts: 0 })
                .success,
        ).toBe(false);
        expect(
            overviewRequestSchema.safeParse({ ...documented, accounts: 2 })
                .success,
        ).toBe(false);
    });

    it('rejects a projection request with a from-state start', () => {
        const [request] = projectionRequestsFor();
        expect(
            overviewRequestSchema.safeParse({
                ...request,
                spec: {
                    ...request?.spec,
                    start: {
                        phase: 'eval',
                        state: {
                            balance: 50_000,
                            peak: 50_000,
                            threshold: 48_000,
                        },
                    },
                },
            }).success,
        ).toBe(false);
    });
});

describe('overviewOutcomeOf projection requests (PT-33, F-87)', () => {
    it('runs the portfolio timeline built from the documented spec and reports the same bands', () => {
        const request = tinyProjection(TOPSTEP_50K, 2);
        const figures = succeededProjection(request);
        const inputs = documentedPolicyTimelineInputs(
            TOPSTEP_50K,
            request.spec,
            2,
        );
        const direct = simulatePortfolioTimeline(inputs);
        expect(figures.timeline).toEqual(direct);
        expect(figures.accountsRequested).toBe(2);
        expect(figures.accountsSimulated).toBe(direct.accountsSimulated);
        expect(figures.trials).toBe(TINY_RUN.trials);
        expect(figures.minRetainedCushion).toBe(inputs.minRetainedCushion);
        expect(figures.payoutRequestSize).toBe(inputs.payoutRequestSize);
        expect(figures.timeline.days.at(-1)).toBe(figures.dayBudget);
    });

    it('simulates at most the plan funded account cap and says how many it simulated', () => {
        const request = tinyProjection(TOPSTEP_50K, 99);
        const figures = succeededProjection(request);
        expect(figures.accountsRequested).toBe(99);
        expect(figures.accountsSimulated).toBe(
            Math.min(99, TOPSTEP_50K.maxFundedAccounts),
        );
        expect(figures.accountsSimulated).toBeLessThan(99);
    });

    it('runs the rulebook trades per day uncapped: above ten a day the run is the documented policy as built and differs from ten a day', () => {
        const fifteen = withFundedTrades(15);
        const figures = succeededProjection(fifteen);
        expect(figures.timeline).toEqual(
            simulatePortfolioTimeline(
                documentedPolicyTimelineInputs(TOPSTEP_50K, fifteen.spec, 2),
            ),
        );
        expect(figures.timeline).not.toEqual(
            succeededProjection(withFundedTrades(10)).timeline,
        );
    });

    it('lists no unhonoured field when the policy has none, and each one the timeline cannot honour when it has', () => {
        const clean = succeededProjection(tinyProjection());
        expect(clean.timelineGaps).toEqual([]);
        const base = tinyProjection();
        const withLagAndSteps: OverviewRequest = withPolicy(base, {
            intradayPathStepsPerR: 10,
            rebuyLagBasis: RebuyLagBasis.Measured,
            rebuyLagDays: 6,
        });
        const gaps = succeededProjection(withLagAndSteps).timelineGaps;
        expect(gaps).toEqual([
            DocumentedPolicyTimelineGap.IntradayPathStepsPerR,
            DocumentedPolicyTimelineGap.RebuyLagDays,
        ]);
        const differentRr: OverviewRequest = {
            ...base,
            spec: {
                ...base.spec,
                rulebook: {
                    ...base.spec.rulebook,
                    funded: {
                        ...base.spec.rulebook.funded,
                        takeProfitCents:
                            base.spec.rulebook.funded.riskCents * 3,
                    },
                },
            },
        };
        expect(succeededProjection(differentRr).timelineGaps).toEqual([
            DocumentedPolicyTimelineGap.FundedRrDiffersFromStrategyRr,
        ]);
        for (const gap of gaps) {
            expect(DOCUMENTED_POLICY_TIMELINE_GAP_TEXT[gap].length).toBeGreaterThan(0);
        }
    });

    it('returns a typed failure with the engine sizing text, found before the run, when the sizing is refused', () => {
        const base = tinyProjection();
        const request: OverviewRequest = withPolicy(base, {
            instrument: InstrumentSymbol.ES,
            stopPoints: 500,
        });
        const issue = simInputsSizingIssue({
            instrument: InstrumentSymbol.ES,
            riskPerTrade: request.spec.rulebook.funded.riskCents / CENTS_PER_DOLLAR,
            stopPoints: 500,
        });
        expect(issue).not.toBeNull();
        const outcome = overviewOutcomeOf(request);
        expect(outcome.kind).toBe(OverviewOutcomeKind.Failed);
        if (outcome.kind !== OverviewOutcomeKind.Failed) return;
        expect(outcome.reason).toBe(issue);
        expect(outcome.reason).not.toContain('runAccountTimeline');
        expect(outcome.key).toBe(overviewRequestKey(request));
    });

    it('returns a typed failure naming the serial when the plan is no longer modeled', () => {
        const outcome = overviewOutcomeOf({
            ...tinyProjection(),
            planSerial: 'no-such-plan',
        });
        expect(outcome.kind).toBe(OverviewOutcomeKind.Failed);
        if (outcome.kind !== OverviewOutcomeKind.Failed) return;
        expect(outcome.reason).toContain('no-such-plan');
    });

    it('returns a result that survives structuredClone, keyed by its request key', () => {
        const request = tinyProjection();
        const outcome = overviewOutcomeOf(request);
        expect(structuredClone(outcome)).toEqual(outcome);
        expect(outcome.key).toBe(overviewRequestKey(request));
    });
});
