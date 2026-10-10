import { readFileSync } from 'node:fs';
import path from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';

import {
    type AccountFromStateFigures,
    type DocumentedRunFigures,
    overviewAccountRequestsFor,
    OverviewOutcomeKind,
    overviewOutcomeOf,
    overviewPlanKey,
    overviewPlanValueRequestsFor,
    type OverviewPreviousAccount,
    overviewProjectionRequestsFor,
    type OverviewRequest,
    OverviewRequestGroup,
    overviewRequestKey,
    OverviewRequestKind,
    overviewRequestsByGroup,
    overviewRequestSchema,
    overviewRequestsFor,
    overviewRetireRequestsFor,
    overviewValueChainRequestsFor,
    type PayoutSizeOptimumFigures,
    type PlanValuesFigures,
    type PortfolioProjectionFigures,
    type ValueChainFigures,
    ValueChainStepOutcomeKind,
    withPreviousAccount,
} from '~/app/(app)/prop-calculator/_workers/overviewWorkerMessages';
import {
    CENTS_PER_DOLLAR,
    CumulativeAmountTrigger,
    dollars,
    effectivePayoutRequest,
    findFirm,
    FirmAccountPolicy,
    FirmId,
    InstrumentSymbol,
    type LiveTransitionTrigger,
    MffuVariant,
    NO_PLAN_OPT_INS,
    PayoutRequestPolicy,
    type Plan,
    PolicySourceKind,
    PolicyVerification,
    serializePlanId,
    TopStepVariant,
    TradingPhase,
} from '~/lib/prop-calculator';
import {
    AccountReconstruction,
    type AccountSnapshotInput,
    AdviceSource,
    DashboardBalanceConvention,
    DEFAULT_RULEBOOK,
    enginePolicyKey,
    LifetimePayoutCapBasis,
    NO_PENDING_PAYOUT_COUNTS,
    PayoutSizeSweepResultKind,
    RebuyLagBasis,
    ReconstructedLiveKind,
    RiskDisplayUnit,
    runNextPayoutProjection,
    runPayoutSizeSweep,
    SizingStage,
    StartBasis,
    toSimInputs,
} from '~/lib/prop-calculator/advisor';
import {
    applicableTimelineGaps,
    DOCUMENTED_POLICY_TIMELINE_GAP_TEXT,
    DocumentedPolicyTimelineGap,
    documentedPolicyTimelineInputs,
} from '~/lib/prop-calculator/advisor/policy';
import {
    evalStartAccount,
    freshFundedAccount,
    fundedTrackerAfterMilestonePayout,
    MilestoneKind,
    milestoneState,
    requestNowValue,
    requireValue,
    retireComparison,
    RetireComparisonBasis,
    startStateOf,
    valueAtState,
    valueChain,
    ValueChainStepKind,
    type ValueResult,
    ValueResultKind,
} from '~/lib/prop-calculator/advisor/value';
import { ALL_FIRMS } from '~/lib/prop-calculator/firms';
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

const CONFIRMED_SOURCE = {
    fetchedOn: '2026-09-01',
    quote: 'a synthetic test quote',
    sourceKind: PolicySourceKind.LiveFetch,
    url: 'https://example.test/policy',
    verification: PolicyVerification.Confirmed,
} as const;

class OptInTriggerPolicy extends FirmAccountPolicy {
    constructor(private readonly trigger: LiveTransitionTrigger) {
        super();
    }

    override liveTriggersFor(plan: Plan): readonly LiveTransitionTrigger[] {
        return plan.takesFundedReset ? [this.trigger] : [];
    }
}

class StubTriggerPolicy extends FirmAccountPolicy {
    constructor(private readonly triggers: readonly LiveTransitionTrigger[]) {
        super();
    }

    override liveTriggersFor(): readonly LiveTransitionTrigger[] {
        return this.triggers;
    }
}

function withFirmAccountPolicy<T>(
    firmId: FirmId,
    policy: FirmAccountPolicy,
    run: () => T,
): T {
    const firm = findFirm(firmId) as unknown as {
        accountPolicy: FirmAccountPolicy;
    };
    const original = firm.accountPolicy;
    firm.accountPolicy = policy;
    try {
        return run();
    } finally {
        firm.accountPolicy = original;
    }
}

function withTopStepTriggers<T>(
    triggers: readonly LiveTransitionTrigger[],
    run: () => T,
): T {
    return withFirmAccountPolicy(
        FirmId.TopStep,
        new StubTriggerPolicy(triggers),
        run,
    );
}

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
        expect(request.spec.enginePolicy.payoutRequestOverride).toBeNull();
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

    it('ignores the display preferences of the rulebook, so changing the highlight window or the risk unit never re-runs a request (PT-68c)', () => {
        const base = documentedOf(requestsFor());
        const withDisplay = (display: typeof base.spec.rulebook.display) => ({
            ...base,
            spec: {
                ...base.spec,
                rulebook: { ...base.spec.rulebook, display },
            },
        });
        const { display } = base.spec.rulebook;
        expect(
            overviewRequestKey(
                withDisplay({
                    ...display,
                    nextPayoutHighlightDays:
                        display.nextPayoutHighlightDays + 1,
                }),
            ),
        ).toBe(overviewRequestKey(base));
        expect(overviewRequestKey(withDisplay({ ...display }))).toBe(
            overviewRequestKey(base),
        );
        const otherUnit =
            display.riskUnit === RiskDisplayUnit.AccountDollars
                ? RiskDisplayUnit.EvAtStake
                : RiskDisplayUnit.AccountDollars;
        expect(
            overviewRequestKey(
                withDisplay({ ...display, riskUnit: otherUnit }),
            ),
        ).toBe(overviewRequestKey(base));
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

    it('reports the funded bust probability of the same simulate call so the optimum is compared bust against bust', () => {
        const request = smallRun(documentedOf(requestsFor()));
        const figures = succeededDocumented(request);
        const direct = simulate(toSimInputs(TOPSTEP_50K, request.spec));
        expect(figures.fundedBustProbability).toEqual(
            direct.estimates.fundedBustProbability,
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
            overviewRequestKey(
                withPolicy(two, { retainedCushionRequest: 2500 }),
            ),
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
            expect(
                DOCUMENTED_POLICY_TIMELINE_GAP_TEXT[gap].length,
            ).toBeGreaterThan(0);
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
            riskPerTrade:
                request.spec.rulebook.funded.riskCents / CENTS_PER_DOLLAR,
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

describe('the projection timeline gaps come from the one shared rule', () => {
    it('reports exactly what applicableTimelineGaps returns for the request spec', () => {
        const base = tinyProjection();
        const request = withPolicy(base, {
            intradayPathStepsPerR: 10,
            rebuyLagBasis: RebuyLagBasis.Measured,
            rebuyLagDays: 6,
        });
        expect(succeededProjection(request).timelineGaps).toEqual(
            applicableTimelineGaps(request.spec, TOPSTEP_50K),
        );
    });

    it('lists the cumulative trigger gap for a plan with a confirmed trigger, resolved by the worker (PT-36t, F-145)', () => {
        const trigger = new CumulativeAmountTrigger(
            dollars(100_000),
            CONFIRMED_SOURCE,
        );
        expect(
            withTopStepTriggers(
                [trigger],
                () => succeededProjection(tinyProjection()).timelineGaps,
            ),
        ).toEqual([DocumentedPolicyTimelineGap.CumulativePayoutTrigger]);
        expect(succeededProjection(tinyProjection()).timelineGaps).toEqual([]);
    });

    it('resolves the trigger on the plan with its opt-ins, not the registry plan (PT-36t)', () => {
        const optInPlan = ALL_FIRMS.flatMap((firm) => firm.plans).find(
            (plan) => plan.fundedReset !== null && !plan.isInstantFunded,
        );
        if (optInPlan === undefined) {
            throw new Error('expected a plan that offers a funded reset');
        }
        const trigger = new CumulativeAmountTrigger(
            dollars(100_000),
            CONFIRMED_SOURCE,
        );
        const base = tinyProjection(optInPlan);
        withFirmAccountPolicy(
            optInPlan.id.firm,
            new OptInTriggerPolicy(trigger),
            () => {
                expect(succeededProjection(base).timelineGaps).toEqual([]);
                expect(
                    succeededProjection({
                        ...base,
                        optIns: { ...base.optIns, takesFundedReset: true },
                    }).timelineGaps,
                ).toEqual([
                    DocumentedPolicyTimelineGap.CumulativePayoutTrigger,
                ]);
            },
        );
    });

    it('keeps no private timeline gap rule or tolerance of its own', () => {
        const source = readFileSync(
            path.join(
                process.cwd(),
                'src',
                'app',
                '(app)',
                'prop-calculator',
                '_workers',
                'overviewWorkerMessages.ts',
            ),
            'utf8',
        );
        expect(source).not.toContain('FUNDED_RR_TOLERANCE');
        expect(source).not.toContain('timelineGapsOf');
    });

    it('leaves the sizing refusal to the timeline inputs, with no second check of its own (PT-68g)', () => {
        const source = readFileSync(
            path.join(
                process.cwd(),
                'src',
                'app',
                '(app)',
                'prop-calculator',
                '_workers',
                'overviewWorkerMessages.ts',
            ),
            'utf8',
        );
        expect(source).not.toContain('simInputsSizingIssue');
    });
});

const FUNDED_SNAPSHOT: AccountSnapshotInput = {
    asOf: '2026-03-02',
    balance: dollars(52_000),
    dashboardConvention: DashboardBalanceConvention.Nominal,
    firstFundedTradeOn: '2026-01-05',
    highestEodBalance: dollars(52_000),
    highestIntradayBalance: dollars(52_000),
    payoutsTaken: 0,
    stage: SizingStage.Funded,
    tradingDays: 12,
};

const EVAL_SNAPSHOT: AccountSnapshotInput = {
    asOf: '2026-03-02',
    balance: dollars(50_800),
    dashboardConvention: DashboardBalanceConvention.Nominal,
    highestEodBalance: dollars(50_800),
    highestIntradayBalance: dollars(50_800),
    stage: SizingStage.Eval,
    tradingDays: 5,
};

function accountPlanInput(snapshot: AccountSnapshotInput) {
    return {
        account: snapshot,
        firmId: TOPSTEP_50K.id.firm,
        measuredRebuyLag: null,
        optIns: NO_PLAN_OPT_INS,
        pendingPayoutCounts: NO_PENDING_PAYOUT_COUNTS,
        planSerial: serializePlanId(TOPSTEP_50K.id),
    };
}

function accountRequestFor(snapshot: AccountSnapshotInput): OverviewRequest {
    const [first] = overviewAccountRequestsFor(
        [accountPlanInput(snapshot)],
        DEFAULT_RULEBOOK,
    );
    if (first === undefined) throw new Error('no account request');
    return { ...first, spec: { ...first.spec, run: TINY_RUN } };
}

function milestoneValueOf(figures: AccountFromStateFigures): ValueResult {
    const { value } = figures.milestone;
    if (value.kind !== ValueChainStepOutcomeKind.Value) {
        throw new Error(`expected a milestone value, got: ${value.reason}`);
    }
    return value.value;
}

function planValueRequestFor(): OverviewRequest {
    const [first] = overviewPlanValueRequestsFor(
        [
            {
                firmId: TOPSTEP_50K.id.firm,
                measuredRebuyLag: null,
                optIns: NO_PLAN_OPT_INS,
                planSerial: serializePlanId(TOPSTEP_50K.id),
            },
        ],
        DEFAULT_RULEBOOK,
    );
    if (first === undefined) throw new Error('no plan-values request');
    return { ...first, spec: { ...first.spec, run: TINY_RUN } };
}

function rebuiltAccount(snapshot: AccountSnapshotInput) {
    return AccountReconstruction.rebuild(
        snapshot,
        TOPSTEP_50K,
        null,
        NO_PENDING_PAYOUT_COUNTS,
    );
}

function succeededAccount(request: OverviewRequest): AccountFromStateFigures {
    const outcome = overviewOutcomeOf(request);
    if (outcome.kind !== OverviewOutcomeKind.Succeeded) {
        throw new Error(`expected success, got: ${outcome.reason}`);
    }
    if (outcome.result.kind !== OverviewRequestKind.AccountFromState) {
        throw new Error('expected an account-from-state result');
    }
    return outcome.result.figures;
}

function succeededPlanValues(request: OverviewRequest): PlanValuesFigures {
    const outcome = overviewOutcomeOf(request);
    if (outcome.kind !== OverviewOutcomeKind.Succeeded) {
        throw new Error(`expected success, got: ${outcome.reason}`);
    }
    if (outcome.result.kind !== OverviewRequestKind.PlanValues) {
        throw new Error('expected a plan-values result');
    }
    return outcome.result.figures;
}

describe('overviewAccountRequestsFor (PT-37, F-87)', () => {
    it('emits one account-from-state request per account state carrying the snapshot and only the spec, surviving structuredClone', () => {
        const requests = overviewAccountRequestsFor(
            [accountPlanInput(FUNDED_SNAPSHOT)],
            DEFAULT_RULEBOOK,
        );
        expect(requests.map((request) => request.kind)).toEqual([
            OverviewRequestKind.AccountFromState,
        ]);
        const [request] = requests;
        expect(request?.account).toEqual(FUNDED_SNAPSHOT);
        expect(request?.spec.start).toBeUndefined();
        expect(request?.accounts).toBeUndefined();
        expect(structuredClone(request)).toEqual(request);
        for (const candidate of requests) {
            expect(
                overviewRequestSchema.parse(structuredClone(candidate)),
            ).toEqual(candidate);
        }
    });

    it('builds the same documented spec the fresh documented run uses for the plan', () => {
        const [account] = overviewAccountRequestsFor(
            [accountPlanInput(FUNDED_SNAPSHOT)],
            DEFAULT_RULEBOOK,
        );
        expect(account?.spec).toEqual(documentedOf(requestsFor()).spec);
    });

    it('keys the request per account state and full policy, and collapses identical states', () => {
        const same = overviewAccountRequestsFor(
            [
                accountPlanInput(FUNDED_SNAPSHOT),
                accountPlanInput({ ...FUNDED_SNAPSHOT }),
            ],
            DEFAULT_RULEBOOK,
        );
        expect(same).toHaveLength(1);
        const moved = overviewAccountRequestsFor(
            [
                accountPlanInput(FUNDED_SNAPSHOT),
                accountPlanInput({
                    ...FUNDED_SNAPSHOT,
                    balance: dollars(52_500),
                    highestEodBalance: dollars(52_500),
                    highestIntradayBalance: dollars(52_500),
                }),
            ],
            DEFAULT_RULEBOOK,
        );
        expect(moved).toHaveLength(2);
        const [first, second] = moved;
        if (first === undefined || second === undefined) return;
        expect(overviewRequestKey(first)).not.toBe(overviewRequestKey(second));
        const [other] = overviewAccountRequestsFor(
            [accountPlanInput(FUNDED_SNAPSHOT)],
            {
                ...DEFAULT_RULEBOOK,
                payout: { ...DEFAULT_RULEBOOK.payout, requestCents: 120_000 },
            },
        );
        expect(other).toBeDefined();
        if (other === undefined) return;
        expect(overviewRequestKey(other)).not.toBe(overviewRequestKey(first));
        const documentedKey = overviewRequestKey(documentedOf(requestsFor()));
        expect(overviewRequestKey(first)).not.toBe(documentedKey);
    });

    it('skips an account that is already live: there is no from-state live model', () => {
        const live = { ...FUNDED_SNAPSHOT, stage: SizingStage.Live };
        expect(
            overviewAccountRequestsFor(
                [accountPlanInput(live)],
                DEFAULT_RULEBOOK,
            ),
        ).toEqual([]);
        expect(
            overviewRetireRequestsFor(
                [accountPlanInput(live)],
                DEFAULT_RULEBOOK,
            ),
        ).toEqual([]);
    });

    it('skips a plan the engine no longer models instead of throwing', () => {
        expect(
            overviewAccountRequestsFor(
                [
                    {
                        ...accountPlanInput(FUNDED_SNAPSHOT),
                        planSerial: 'no-such-plan',
                    },
                ],
                DEFAULT_RULEBOOK,
            ),
        ).toEqual([]);
    });
});

describe('overviewRequestSchema account requests (PT-37)', () => {
    it('rejects an account request without its account state, and an account state on another kind', () => {
        const request = accountRequestFor(FUNDED_SNAPSHOT);
        const withoutAccount = { ...request, account: undefined };
        expect(overviewRequestSchema.safeParse(withoutAccount).success).toBe(
            false,
        );
        const documented = documentedOf(requestsFor());
        expect(
            overviewRequestSchema.safeParse({
                ...documented,
                account: FUNDED_SNAPSHOT,
            }).success,
        ).toBe(false);
    });

    it('accepts every request kind its builder emits, so the worker validates what the pages send', () => {
        const planInput = {
            firmId: TOPSTEP_50K.id.firm,
            measuredRebuyLag: null,
            optIns: NO_PLAN_OPT_INS,
            planSerial: TOPSTEP_SERIAL,
        };
        const requests = [
            ...overviewAccountRequestsFor(
                [accountPlanInput(FUNDED_SNAPSHOT)],
                DEFAULT_RULEBOOK,
            ),
            ...overviewRetireRequestsFor(
                [accountPlanInput(FUNDED_SNAPSHOT)],
                DEFAULT_RULEBOOK,
            ),
            ...overviewPlanValueRequestsFor([planInput], DEFAULT_RULEBOOK),
            ...overviewValueChainRequestsFor([planInput], DEFAULT_RULEBOOK),
        ];
        expect(requests.map((request) => request.kind)).toEqual([
            OverviewRequestKind.AccountFromState,
            OverviewRequestKind.RetireComparison,
            OverviewRequestKind.PlanValues,
            OverviewRequestKind.ValueChain,
        ]);
        for (const request of requests) {
            expect(
                overviewRequestSchema.parse(structuredClone(request)),
            ).toEqual(request);
        }
    });

    it('requires an account state for exactly the kinds of the accounts group, and refuses one on every other kind', () => {
        const withAccount = accountRequestFor(FUNDED_SNAPSHOT);
        const withoutAccount = documentedOf(requestsFor());
        for (const kind of Object.values(OverviewRequestKind)) {
            const isAccountKind =
                overviewRequestsByGroup([{ ...withAccount, kind }])[
                    OverviewRequestGroup.Accounts
                ].length === 1;
            const isProjection =
                kind === OverviewRequestKind.PortfolioProjection;
            const accountsCount = isProjection ? { accounts: 1 } : {};
            const accepted = overviewRequestSchema.safeParse({
                ...(isAccountKind ? withAccount : withoutAccount),
                ...accountsCount,
                kind,
            });
            expect(accepted.success, kind).toBe(true);
            const refused = overviewRequestSchema.safeParse({
                ...(isAccountKind ? withoutAccount : withAccount),
                ...accountsCount,
                kind,
            });
            expect(refused.success, kind).toBe(false);
        }
    });

    it('rejects an account state with an unknown key or a bad stage', () => {
        const request = accountRequestFor(FUNDED_SNAPSHOT);
        expect(
            overviewRequestSchema.safeParse({
                ...request,
                account: { ...FUNDED_SNAPSHOT, extra: 1 },
            }).success,
        ).toBe(false);
        expect(
            overviewRequestSchema.safeParse({
                ...request,
                account: { ...FUNDED_SNAPSHOT, stage: 'retired' },
            }).success,
        ).toBe(false);
    });

    it('rejects a from-state start inside the spec: the worker builds the start from the snapshot', () => {
        const request = accountRequestFor(FUNDED_SNAPSHOT);
        const funded = rebuiltAccount(FUNDED_SNAPSHOT);
        if (funded.kind === ReconstructedLiveKind.Live)
            throw new Error('expected a funded account');
        expect(
            overviewRequestSchema.safeParse({
                ...request,
                spec: {
                    ...request.spec,
                    start: startStateOf(TOPSTEP_50K, funded),
                },
            }).success,
        ).toBe(false);
    });
});

describe('overviewOutcomeOf account requests (PT-37, F-87, F-88)', () => {
    it('values an eval account from its own state, with SEs, labelled from state, and has no next payout', () => {
        const request = accountRequestFor(EVAL_SNAPSHOT);
        const figures = succeededAccount(request);
        expect(figures.stage).toBe(SizingStage.Eval);
        expect(figures.startBasis).toBe(StartBasis.FromState);
        expect(figures.trials).toBe(TINY_RUN.trials);
        expect(figures.nextPayout).toBeNull();
        expect(figures.valueNow.kind).toBe(ValueResultKind.Value);
        expect(figures.valueNow.trials).toBe(TINY_RUN.trials);
        expect(figures.valueNow.seed).toBe(TINY_RUN.seed);
        expect(figures.valueNow.creditInclusive.standardError).not.toBeNull();
        expect(figures.valueNow.creditFree.standardError).not.toBeNull();
        const direct = valueAtState(
            rebuiltAccount(EVAL_SNAPSHOT),
            request.spec,
        );
        expect(figures.valueNow).toEqual(direct);
    });

    it('runs the milestone value at the same seed and trials, from a state that starts a new session, and names the eval gaps', () => {
        const request = accountRequestFor(EVAL_SNAPSHOT);
        const figures = succeededAccount(request);
        expect(figures.milestone.kind).toBe(MilestoneKind.Eval);
        expect(figures.milestone.debited).toBeNull();
        expect(figures.milestone.received).toBeNull();
        const milestoneValue = milestoneValueOf(figures);
        expect(milestoneValue.seed).toBe(figures.valueNow.seed);
        expect(milestoneValue.trials).toBe(figures.valueNow.trials);
        const account = rebuiltAccount(EVAL_SNAPSHOT);
        const milestone = milestoneState(account, request.spec);
        if (milestone.kind !== MilestoneKind.Eval) {
            throw new Error('expected an eval milestone');
        }
        expect(figures.milestone.unmetGates).toEqual(milestone.unmetGates);
        if (account.kind === ReconstructedLiveKind.Live) {
            throw new Error('expected an eval account');
        }
        const sessionStart = { ...milestone.state, todayPnL: 0 };
        expect(milestoneValue).toEqual(
            valueAtState(
                {
                    ...account,
                    cushion: sessionStart.balance - sessionStart.threshold,
                    state: sessionStart,
                },
                request.spec,
            ),
        );
    });

    it('values a funded account from state, projects its next payout through the same engine call, and runs the milestone after the payout', () => {
        const request = accountRequestFor(FUNDED_SNAPSHOT);
        const figures = succeededAccount(request);
        expect(figures.stage).toBe(SizingStage.Funded);
        expect(figures.milestone.kind).toBe(MilestoneKind.Funded);
        expect(figures.milestone.debited).toBe(
            effectivePayoutRequest(
                TOPSTEP_50K,
                DEFAULT_RULEBOOK.payout.requestCents / CENTS_PER_DOLLAR,
            ),
        );
        expect(milestoneValueOf(figures).seed).toBe(figures.valueNow.seed);

        const account = rebuiltAccount(FUNDED_SNAPSHOT);
        if (account.kind !== TradingPhase.Funded)
            throw new Error('expected funded');
        const start = startStateOf(account.plan, account);
        if (start.phase !== TradingPhase.Funded) {
            throw new Error('expected a funded start');
        }
        const direct = runNextPayoutProjection(account.plan, {
            base: toSimInputs(account.plan, request.spec),
            policy: request.spec.enginePolicy,
            source: AdviceSource.NextPayoutProjection,
            start,
        });
        expect(figures.nextPayout).toEqual(direct);
        expect(figures.nextPayout?.trials).toBe(TINY_RUN.trials);
        expect(figures.valueNow).toEqual(valueAtState(account, request.spec));
    });

    it('adds the cash the trader receives at the funded milestone to the continuation value, so the milestone is comparable with the value now', () => {
        const request = accountRequestFor(FUNDED_SNAPSHOT);
        const figures = succeededAccount(request);
        const account = rebuiltAccount(FUNDED_SNAPSHOT);
        if (account.kind !== TradingPhase.Funded)
            throw new Error('expected funded');
        const milestone = milestoneState(account, request.spec);
        if (milestone.kind !== MilestoneKind.Funded) {
            throw new Error('expected a funded milestone');
        }
        const continuation = requireValue(
            valueAtState(
                {
                    ...account,
                    cushion:
                        milestone.state.balance - milestone.state.threshold,
                    fundedTracker: fundedTrackerAfterMilestonePayout(milestone),
                    state: milestone.state,
                },
                request.spec,
            ),
        );
        const received = TOPSTEP_50K.payoutFromProfit(milestone.debited, 0);
        expect(received).toBeGreaterThan(0);
        expect(figures.milestone.received).toBe(received);
        const value = milestoneValueOf(figures);
        expect(value.creditFree).toEqual({
            standardError: continuation.creditFree.standardError,
            value: continuation.creditFree.value + received,
        });
        expect(value.creditInclusive).toEqual({
            standardError: continuation.creditInclusive.standardError,
            value: continuation.creditInclusive.value + received,
        });
    });

    it('still values the account now and projects its next payout when the funded milestone cannot start (TopStep 50K at 50,300, a first payout request would bust it)', () => {
        const nearThreshold: AccountSnapshotInput = {
            ...FUNDED_SNAPSHOT,
            balance: dollars(50_300),
            highestEodBalance: dollars(50_300),
            highestIntradayBalance: dollars(50_300),
        };
        const request = accountRequestFor(nearThreshold);
        const outcome = overviewOutcomeOf(request);
        if (outcome.kind !== OverviewOutcomeKind.Succeeded) {
            throw new Error(`expected success, got: ${outcome.reason}`);
        }
        if (outcome.result.kind !== OverviewRequestKind.AccountFromState) {
            throw new Error('expected an account-from-state result');
        }
        const { figures } = outcome.result;
        expect(figures.valueNow.kind).toBe(ValueResultKind.Value);
        expect(figures.valueNow).toEqual(
            valueAtState(rebuiltAccount(nearThreshold), request.spec),
        );
        expect(figures.nextPayout).not.toBeNull();
        expect(figures.milestone.kind).toBe(MilestoneKind.Funded);
        expect(figures.milestone.debited).not.toBeNull();
        expect(figures.milestone.value.kind).toBe(
            ValueChainStepOutcomeKind.Unavailable,
        );
        if (
            figures.milestone.value.kind !==
            ValueChainStepOutcomeKind.Unavailable
        ) {
            return;
        }
        expect(figures.milestone.value.reason).toMatch(/busted/i);
        expect(structuredClone(outcome)).toEqual(outcome);
    });

    it('reports the credit-inclusive and credit-free from-state values as separate figures', () => {
        const { valueNow } = succeededAccount(
            accountRequestFor(FUNDED_SNAPSHOT),
        );
        expect(Object.keys(valueNow)).toEqual(
            expect.arrayContaining(['creditFree', 'creditInclusive']),
        );
        expect(valueNow.creditFree).not.toBe(valueNow.creditInclusive);
    });

    it('returns a typed failure with the engine text, found before the run, when the sizing is refused', () => {
        const base = accountRequestFor(FUNDED_SNAPSHOT);
        const request: OverviewRequest = {
            ...base,
            spec: {
                ...base.spec,
                enginePolicy: {
                    ...base.spec.enginePolicy,
                    instrument: InstrumentSymbol.ES,
                    stopPoints: 500,
                },
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
    });

    it('returns a typed failure, not a throw, for a snapshot the engine cannot rebuild', () => {
        const peakless: AccountSnapshotInput = {
            ...FUNDED_SNAPSHOT,
            highestEodBalance: undefined,
            highestIntradayBalance: undefined,
        };
        const outcome = overviewOutcomeOf(accountRequestFor(peakless));
        expect(outcome.kind).toBe(OverviewOutcomeKind.Failed);
        if (outcome.kind !== OverviewOutcomeKind.Failed) return;
        expect(outcome.reason).toMatch(/highest/i);
    });

    it('returns a typed failure for a live account: there is no from-state live value model', () => {
        const outcome = overviewOutcomeOf({
            ...accountRequestFor(FUNDED_SNAPSHOT),
            account: { ...FUNDED_SNAPSHOT, stage: SizingStage.Live },
        });
        expect(outcome.kind).toBe(OverviewOutcomeKind.Failed);
        if (outcome.kind !== OverviewOutcomeKind.Failed) return;
        expect(outcome.reason).toMatch(/live/i);
    });

    it('returns a typed failure naming the serial when the plan is no longer modeled', () => {
        const outcome = overviewOutcomeOf({
            ...accountRequestFor(FUNDED_SNAPSHOT),
            planSerial: 'no-such-plan',
        });
        expect(outcome.kind).toBe(OverviewOutcomeKind.Failed);
        if (outcome.kind !== OverviewOutcomeKind.Failed) return;
        expect(outcome.reason).toContain('no-such-plan');
    });

    it('returns a result that survives structuredClone, keyed by its request key', () => {
        const request = accountRequestFor(FUNDED_SNAPSHOT);
        const outcome = overviewOutcomeOf(request);
        expect(structuredClone(outcome)).toEqual(outcome);
        expect(outcome.key).toBe(overviewRequestKey(request));
    });
});

describe('overviewPlanValueRequestsFor (PT-37, F-V16, F-V17)', () => {
    it('emits one plan-values request per plan carrying only the spec, deduped, surviving structuredClone', () => {
        const input = {
            firmId: TOPSTEP_50K.id.firm,
            measuredRebuyLag: null,
            optIns: NO_PLAN_OPT_INS,
            planSerial: TOPSTEP_SERIAL,
        };
        const requests = overviewPlanValueRequestsFor(
            [input, input],
            DEFAULT_RULEBOOK,
        );
        expect(requests.map((request) => request.kind)).toEqual([
            OverviewRequestKind.PlanValues,
        ]);
        const [request] = requests;
        expect(request?.account).toBeUndefined();
        expect(request?.spec.start).toBeUndefined();
        expect(structuredClone(request)).toEqual(request);
        expect(request?.spec).toEqual(documentedOf(requestsFor()).spec);
    });

    it('keys the plan values apart from the documented run of the same plan', () => {
        const documentedKey = overviewRequestKey(documentedOf(requestsFor()));
        expect(overviewRequestKey(planValueRequestFor())).not.toBe(
            documentedKey,
        );
    });

    it('skips a plan the engine no longer models', () => {
        expect(
            overviewPlanValueRequestsFor(
                [
                    {
                        firmId: FirmId.TopStep,
                        measuredRebuyLag: null,
                        optIns: NO_PLAN_OPT_INS,
                        planSerial: 'no-such-plan',
                    },
                ],
                DEFAULT_RULEBOOK,
            ),
        ).toEqual([]);
    });

    it('values a fresh eval and a fresh funded account of the plan with SEs and reports the retry fee', () => {
        const request = planValueRequestFor();
        const figures = succeededPlanValues(request);
        expect(figures.valueFreshEval).toEqual(
            valueAtState(evalStartAccount(TOPSTEP_50K), request.spec),
        );
        expect(figures.freshFundedValue).toEqual(
            valueAtState(freshFundedAccount(TOPSTEP_50K), request.spec),
        );
        expect(figures.retryFee).toBe(TOPSTEP_50K.retryFee());
        expect(figures.trials).toBe(TINY_RUN.trials);

        expect(
            figures.valueFreshEval.creditInclusive.standardError,
        ).not.toBeNull();
        expect(
            figures.freshFundedValue.creditInclusive.standardError,
        ).not.toBeNull();
        expect(structuredClone(overviewOutcomeOf(request))).toEqual(
            overviewOutcomeOf(request),
        );
    });

    it('leaves expectedNetPerAttempt with its SE on the documented-run figures EJ9 reads', () => {
        const request = smallRun(documentedOf(requestsFor()));
        const figures = succeededDocumented(request);
        expect(figures.expectedNetPerAttempt.standardError).toEqual(
            expect.any(Number),
        );
    });
});

describe('overviewRetireRequestsFor (PT-37, QV-19 information)', () => {
    it('emits one retire-comparison request per account state and runs the PT-65 comparison against a fresh account of the same plan', () => {
        const [base] = overviewRetireRequestsFor(
            [accountPlanInput(FUNDED_SNAPSHOT)],
            DEFAULT_RULEBOOK,
        );
        if (base === undefined) throw new Error('no retire request');
        expect(base.kind).toBe(OverviewRequestKind.RetireComparison);
        const request: OverviewRequest = {
            ...base,
            spec: { ...base.spec, run: TINY_RUN },
        };
        const outcome = overviewOutcomeOf(request);
        if (outcome.kind !== OverviewOutcomeKind.Succeeded) {
            throw new Error(`expected success, got: ${outcome.reason}`);
        }
        if (outcome.result.kind !== OverviewRequestKind.RetireComparison) {
            throw new Error('expected a retire-comparison result');
        }
        const direct = retireComparison(
            rebuiltAccount(FUNDED_SNAPSHOT),
            request.spec,
            { isCapacityBound: false, replacementPlan: TOPSTEP_50K },
        );
        expect(outcome.result.figures).toEqual(direct);
        expect(outcome.result.figures.basis).toBe(
            RetireComparisonBasis.Simulator,
        );
        expect(structuredClone(outcome)).toEqual(outcome);
        expect(overviewRequestKey(request)).not.toBe(
            overviewRequestKey(accountRequestFor(FUNDED_SNAPSHOT)),
        );
    });
});

function everyKind(): readonly OverviewRequest[] {
    const projection = projectionRequestsFor(TOPSTEP_50K, 2);
    return [
        ...requestsFor(),
        ...projection,
        planValueRequestFor(),
        ...overviewValueChainRequestsFor(
            [
                {
                    firmId: TOPSTEP_50K.id.firm,
                    measuredRebuyLag: null,
                    optIns: NO_PLAN_OPT_INS,
                    planSerial: TOPSTEP_SERIAL,
                },
            ],
            DEFAULT_RULEBOOK,
        ),
        accountRequestFor(FUNDED_SNAPSHOT),
        ...overviewRetireRequestsFor(
            [accountPlanInput(FUNDED_SNAPSHOT)],
            DEFAULT_RULEBOOK,
        ),
    ];
}

describe('overviewRequestsByGroup (PT-37)', () => {
    it('sends every request kind to exactly one group and drops none', () => {
        const requests = everyKind();
        expect(new Set(requests.map((request) => request.kind))).toEqual(
            new Set(Object.values(OverviewRequestKind)),
        );
        const groups = overviewRequestsByGroup(requests);
        const grouped = Object.values(OverviewRequestGroup).flatMap(
            (group) => groups[group],
        );
        expect(grouped).toHaveLength(requests.length);
        expect(new Set(grouped)).toEqual(new Set(requests));
    });

    it('keeps the fresh policy runs, the fresh projection, the fresh plan values and the per-account runs in separate groups so one input change recomputes only its own group', () => {
        const groups = overviewRequestsByGroup(everyKind());
        expect(groups[OverviewRequestGroup.Policy].map((r) => r.kind)).toEqual([
            OverviewRequestKind.DocumentedRun,
            OverviewRequestKind.PayoutSizeOptimum,
        ]);
        expect(
            groups[OverviewRequestGroup.Projection].map((r) => r.kind),
        ).toEqual([OverviewRequestKind.PortfolioProjection]);
        expect(groups[OverviewRequestGroup.Values].map((r) => r.kind)).toEqual([
            OverviewRequestKind.PlanValues,
            OverviewRequestKind.ValueChain,
        ]);
        expect(
            groups[OverviewRequestGroup.Accounts].map((r) => r.kind),
        ).toEqual([
            OverviewRequestKind.AccountFromState,
            OverviewRequestKind.RetireComparison,
        ]);
    });
});

function chainFigures(request: OverviewRequest): ValueChainFigures {
    const outcome = overviewOutcomeOf(request);
    if (outcome.kind !== OverviewOutcomeKind.Succeeded) {
        throw new Error(`expected success, got: ${outcome.reason}`);
    }
    if (outcome.result.kind !== OverviewRequestKind.ValueChain) {
        throw new Error('expected a value-chain result');
    }
    return outcome.result.figures;
}

function chainRequestFor(plan: Plan): OverviewRequest {
    const [first] = overviewValueChainRequestsFor(
        [
            {
                firmId: plan.id.firm,
                measuredRebuyLag: null,
                optIns: NO_PLAN_OPT_INS,
                planSerial: serializePlanId(plan.id),
            },
        ],
        DEFAULT_RULEBOOK,
    );
    if (first === undefined) throw new Error('no value-chain request');
    return { ...first, spec: { ...first.spec, run: TINY_RUN } };
}

describe('overviewValueChainRequestsFor (PT-37, F-V18)', () => {
    it('emits one value-chain request per plan, deduped, carrying only the spec and keyed apart from the plan values', () => {
        const input = {
            firmId: TOPSTEP_50K.id.firm,
            measuredRebuyLag: null,
            optIns: NO_PLAN_OPT_INS,
            planSerial: TOPSTEP_SERIAL,
        };
        const requests = overviewValueChainRequestsFor(
            [input, input],
            DEFAULT_RULEBOOK,
        );
        expect(requests.map((request) => request.kind)).toEqual([
            OverviewRequestKind.ValueChain,
        ]);
        expect(requests[0]?.account).toBeUndefined();
        expect(structuredClone(requests[0])).toEqual(requests[0]);
        expect(overviewRequestKey(chainRequestFor(TOPSTEP_50K))).not.toBe(
            overviewRequestKey(planValueRequestFor()),
        );
    });

    it('values the four chain steps of a plan exactly as the PT-65 chain does', () => {
        const plan = requirePlan(
            findFirm(FirmId.Mffu)?.findPlan({
                accountSize: 50_000,
                firm: FirmId.Mffu,
                variant: MffuVariant.RapidEod,
            }),
            'expected the MFF Rapid EOD 50K plan to resolve',
        );
        const request = chainRequestFor(plan);
        const figures = chainFigures(request);
        expect(figures.trials).toBe(TINY_RUN.trials);
        expect(figures.steps.map((step) => step.kind)).toEqual([
            ValueChainStepKind.EvalStart,
            ValueChainStepKind.FreshFunded,
            ValueChainStepKind.FirstPayoutEligible,
            ValueChainStepKind.PostFirstPayout,
        ]);
        const direct = valueChain(plan, request.spec).steps;
        expect(
            figures.steps.map((step) =>
                step.outcome.kind === ValueChainStepOutcomeKind.Value
                    ? step.outcome.value
                    : null,
            ),
        ).toEqual(direct.map((step) => step.value));
    });

    it('reports a step the engine cannot start from as an unavailable step with its reason, keeping the steps that can run', () => {
        const figures = chainFigures(chainRequestFor(TOPSTEP_50K));
        const [evalStart, freshFunded] = figures.steps;
        expect(evalStart?.outcome.kind).toBe(ValueChainStepOutcomeKind.Value);
        expect(freshFunded?.outcome.kind).toBe(ValueChainStepOutcomeKind.Value);
        for (const step of figures.steps) {
            if (step.outcome.kind === ValueChainStepOutcomeKind.Unavailable) {
                expect(step.outcome.reason.length).toBeGreaterThan(0);
            }
        }
        expect(structuredClone(figures)).toEqual(figures);
    });
});

describe('the funded milestone is the lib request-now value (PT-37b)', () => {
    it('reports the cash and the milestone value the lib request-now function builds, with its standard errors unchanged', () => {
        const request = accountRequestFor(FUNDED_SNAPSHOT);
        const figures = succeededAccount(request);
        const account = rebuiltAccount(FUNDED_SNAPSHOT);
        if (account.kind !== TradingPhase.Funded)
            throw new Error('expected funded');
        const milestone = milestoneState(account, request.spec);
        if (milestone.kind !== MilestoneKind.Funded) {
            throw new Error('expected a funded milestone');
        }
        const direct = requestNowValue(account, milestone, request.spec);
        expect(figures.milestone.received).toBe(direct.traderReceives);
        expect(milestoneValueOf(figures)).toEqual(direct.requestNow);
    });

    it('keeps no copy of the request-now construction or the session reset in the worker messages', () => {
        const source = readFileSync(
            path.join(
                process.cwd(),
                'src',
                'app',
                '(app)',
                'prop-calculator',
                '_workers',
                'overviewWorkerMessages.ts',
            ),
            'utf8',
        );
        expect(source).toContain('requestNowValue');
        expect(source).not.toContain('fundedTrackerAfterMilestonePayout');
        expect(source).not.toContain('withCashReceived');
        expect(source).not.toContain('fundedContinuationValueOf');
        expect(source).not.toContain('resetForNewDay');
    });
});

describe('a value chain step that throws fails only the steps that depend on it (PT-37b, PT-67b re-review LOW)', () => {
    const UNKEEPABLE_CUSHION = 200_000;

    function unkeepableCushionRequest(): OverviewRequest {
        const request = chainRequestFor(TOPSTEP_50K);
        return {
            ...request,
            spec: {
                ...request.spec,
                enginePolicy: {
                    ...request.spec.enginePolicy,
                    retainedCushionRequest: UNKEEPABLE_CUSHION,
                },
            },
        };
    }

    it('lets the chain request succeed when no first payout eligible account can keep the retained cushion', () => {
        const outcome = overviewOutcomeOf(unkeepableCushionRequest());
        expect(outcome.kind).toBe(OverviewOutcomeKind.Succeeded);
    });

    it('marks only the two steps built from the eligible account unavailable, with the lib reason, and keeps eval start and fresh funded', () => {
        const figures = chainFigures(unkeepableCushionRequest());
        const byKind = new Map(
            figures.steps.map((step) => [step.kind, step.outcome] as const),
        );
        expect(byKind.get(ValueChainStepKind.EvalStart)?.kind).toBe(
            ValueChainStepOutcomeKind.Value,
        );
        expect(byKind.get(ValueChainStepKind.FreshFunded)?.kind).toBe(
            ValueChainStepOutcomeKind.Value,
        );
        for (const kind of [
            ValueChainStepKind.FirstPayoutEligible,
            ValueChainStepKind.PostFirstPayout,
        ]) {
            const outcome = byKind.get(kind);
            expect(outcome?.kind).toBe(ValueChainStepOutcomeKind.Unavailable);
            expect(
                outcome?.kind === ValueChainStepOutcomeKind.Unavailable
                    ? outcome.reason
                    : '',
            ).toMatch(/no first-payout-eligible account/u);
        }
        expect(figures.steps.map((step) => step.kind)).toEqual([
            ValueChainStepKind.EvalStart,
            ValueChainStepKind.FreshFunded,
            ValueChainStepKind.FirstPayoutEligible,
            ValueChainStepKind.PostFirstPayout,
        ]);
    });
});

describe('the overview chain is the lib value chain (PT-67e, F-V17, F-V18)', () => {
    const MFF_RAPID_EOD_50K = requirePlan(
        findFirm(FirmId.Mffu)?.findPlan({
            accountSize: 50_000,
            firm: FirmId.Mffu,
            variant: MffuVariant.RapidEod,
        }),
        'expected the MFF Rapid EOD 50K plan to resolve',
    );
    const UNKEEPABLE_CUSHION = 200_000;

    function unkeepableRequestFor(plan: Plan): OverviewRequest {
        const request = chainRequestFor(plan);
        return {
            ...request,
            spec: {
                ...request.spec,
                enginePolicy: {
                    ...request.spec.enginePolicy,
                    retainedCushionRequest: UNKEEPABLE_CUSHION,
                },
            },
        };
    }

    it('carries every built step with the assumptions the lib chain gives it, the eligible step included', () => {
        const request = chainRequestFor(MFF_RAPID_EOD_50K);
        const figures = chainFigures(request);
        const direct = valueChain(MFF_RAPID_EOD_50K, request.spec);
        expect(direct.failedSteps).toEqual([]);
        expect(
            figures.steps.map((step) => [step.kind, step.assumptions]),
        ).toEqual(direct.steps.map((step) => [step.kind, step.assumptions]));
        const eligible = figures.steps.find(
            (step) => step.kind === ValueChainStepKind.FirstPayoutEligible,
        );
        expect(eligible?.assumptions.length).toBeGreaterThan(1);
        expect(structuredClone(figures)).toEqual(figures);
    });

    it('says the firm minimum raised the request on a plan whose minimum is above the rulebook size, instead of calling it your own entry (PT-42c, F-136)', () => {
        const request = chainRequestFor(MFF_PRO_50K);
        const direct = valueChain(MFF_PRO_50K, {
            ...request.spec,
            run: TINY_RUN,
        });
        const eligible = direct.steps.find(
            (step) => step.kind === ValueChainStepKind.FirstPayoutEligible,
        );
        const text = (eligible?.assumptions ?? []).join('\n');

        expect(text).toContain(
            "Documented request $1,000.00 from the rulebook's payout size, raised from $500.00 to the firm minimum",
        );
        expect(text).not.toContain('your payout request entry');
    });

    it('reports a failed step with the lib reason and no assumptions, in the fixed step order', () => {
        const request = unkeepableRequestFor(MFF_RAPID_EOD_50K);
        const figures = chainFigures(request);
        const direct = valueChain(MFF_RAPID_EOD_50K, request.spec);
        expect(direct.failedSteps.length).toBeGreaterThan(0);
        expect(figures.steps.map((step) => step.kind)).toEqual([
            ValueChainStepKind.EvalStart,
            ValueChainStepKind.FreshFunded,
            ValueChainStepKind.FirstPayoutEligible,
            ValueChainStepKind.PostFirstPayout,
        ]);
        for (const failure of direct.failedSteps) {
            const step = figures.steps.find(
                (candidate) => candidate.kind === failure.kind,
            );
            expect(step?.assumptions).toEqual([]);
            expect(step?.outcome).toEqual({
                kind: ValueChainStepOutcomeKind.Unavailable,
                reason: failure.reason,
            });
        }
    });

    it('assembles no chain step of its own: the worker messages call the lib valueChain and none of the step builders', () => {
        const source = readFileSync(
            path.join(
                process.cwd(),
                'src',
                'app',
                '(app)',
                'prop-calculator',
                '_workers',
                'overviewWorkerMessages.ts',
            ),
            'utf8',
        );
        expect(source).toMatch(/\bvalueChain\(/u);
        expect(source).not.toContain('firstPayoutEligibleAccount');
        expect(source).not.toContain('postFirstPayoutAccount');
        expect(source).not.toContain('lazily');
    });
});

describe('the documented run names the cumulative trigger it priced (PT-36p, F-145)', () => {
    const request = {
        ...documentedOf(requestsFor()),
        spec: { ...documentedOf(requestsFor()).spec, run: TINY_RUN },
    };

    it('carries the typed priced-trigger assumption with the amount and the firm source', () => {
        const figures = withTopStepTriggers(
            [new CumulativeAmountTrigger(dollars(100_000), CONFIRMED_SOURCE)],
            () => succeededDocumented(request),
        );
        expect(figures.cumulativePayoutTrigger).toMatchObject({
            amount: 100_000,
            source: {
                fetchedOn: CONFIRMED_SOURCE.fetchedOn,
                quote: CONFIRMED_SOURCE.quote,
                url: CONFIRMED_SOURCE.url,
            },
        });
    });

    it('carries none for a firm with no confirmed cumulative trigger', () => {
        expect(succeededDocumented(request)).not.toHaveProperty(
            'cumulativePayoutTrigger',
        );
    });
});

describe('the payout-size optimum names the cumulative trigger it priced (PT-36r, F-145)', () => {
    const request = {
        ...optimumOf(requestsFor()),
        spec: { ...optimumOf(requestsFor()).spec, run: TINY_RUN },
    };

    it('carries the typed priced-trigger assumption with the amount and the firm source', () => {
        const figures = withTopStepTriggers(
            [new CumulativeAmountTrigger(dollars(100_000), CONFIRMED_SOURCE)],
            () => succeededOptimum(request),
        );
        expect(figures.cumulativePayoutTrigger).toMatchObject({
            amount: 100_000,
            source: {
                fetchedOn: CONFIRMED_SOURCE.fetchedOn,
                quote: CONFIRMED_SOURCE.quote,
                url: CONFIRMED_SOURCE.url,
            },
        });
    });

    it('carries none for a firm with no confirmed cumulative trigger', () => {
        expect(succeededOptimum(request)).not.toHaveProperty(
            'cumulativePayoutTrigger',
        );
    });
});

const PREVIOUS_EVAL_SNAPSHOT: AccountSnapshotInput = {
    ...EVAL_SNAPSHOT,
    asOf: '2026-03-01',
    balance: dollars(51_300),
    highestEodBalance: dollars(51_300),
    highestIntradayBalance: dollars(51_300),
    tradingDays: 4,
};

const PREVIOUS_EVAL: OverviewPreviousAccount = {
    account: PREVIOUS_EVAL_SNAPSHOT,
    pendingPayoutCounts: NO_PENDING_PAYOUT_COUNTS,
};

function accountRequestWithPrevious(
    previous: null | OverviewPreviousAccount = PREVIOUS_EVAL,
): OverviewRequest {
    const [first] = overviewAccountRequestsFor(
        [
            {
                ...accountPlanInput(EVAL_SNAPSHOT),
                ...(previous !== null && { previous }),
            },
        ],
        DEFAULT_RULEBOOK,
    );
    if (first === undefined) throw new Error('no account request');
    return { ...first, spec: { ...first.spec, run: TINY_RUN } };
}

describe('the account-from-state request carries the previous snapshot (PT-90, F-V29)', () => {
    it('copies the previous account onto the account-from-state request and survives structuredClone and the schema', () => {
        const request = accountRequestWithPrevious();
        expect(request.previous).toEqual(PREVIOUS_EVAL);
        expect(structuredClone(request)).toEqual(request);
        expect(overviewRequestSchema.parse(structuredClone(request))).toEqual(
            request,
        );
    });

    it('leaves the previous account off a request built without one', () => {
        expect('previous' in accountRequestWithPrevious(null)).toBe(false);
    });

    it('never puts the previous account on the retire comparison request of the same input', () => {
        const [retire] = overviewRetireRequestsFor(
            [{ ...accountPlanInput(EVAL_SNAPSHOT), previous: PREVIOUS_EVAL }],
            DEFAULT_RULEBOOK,
        );
        expect(retire?.kind).toBe(OverviewRequestKind.RetireComparison);
        expect(retire !== undefined && 'previous' in retire).toBe(false);
    });

    it('keys the request by the previous account and its counts', () => {
        const without = overviewRequestKey(accountRequestWithPrevious(null));
        const withPrevious = overviewRequestKey(accountRequestWithPrevious());
        expect(withPrevious).not.toBe(without);
        expect(withPrevious).toBe(
            overviewRequestKey(
                accountRequestWithPrevious({
                    account: { ...PREVIOUS_EVAL_SNAPSHOT },
                    pendingPayoutCounts: { ...NO_PENDING_PAYOUT_COUNTS },
                }),
            ),
        );
        const movedBalance = accountRequestWithPrevious({
            ...PREVIOUS_EVAL,
            account: { ...PREVIOUS_EVAL_SNAPSHOT, balance: dollars(51_000) },
        });
        expect(overviewRequestKey(movedBalance)).not.toBe(withPrevious);
        const otherCounts = accountRequestWithPrevious({
            ...PREVIOUS_EVAL,
            pendingPayoutCounts: {
                otherAccountsPendingPayoutCount: 1,
                pendingPayoutCount: 1,
            },
        });
        expect(overviewRequestKey(otherCounts)).not.toBe(withPrevious);
    });

    it('attaches the previous account with withPreviousAccount and returns the request itself for none', () => {
        const plain = accountRequestWithPrevious(null);
        expect(withPreviousAccount(plain, null)).toBe(plain);
        expect(withPreviousAccount(undefined, PREVIOUS_EVAL)).toBeUndefined();
        expect(withPreviousAccount(plain, PREVIOUS_EVAL)).toEqual({
            ...plain,
            previous: PREVIOUS_EVAL,
        });
    });

    it('accepts a previous account only on the account-from-state kind', () => {
        const withPrevious = accountRequestWithPrevious();
        expect(overviewRequestSchema.safeParse(withPrevious).success).toBe(
            true,
        );
        expect(
            overviewRequestSchema.safeParse({
                ...withPrevious,
                kind: OverviewRequestKind.RetireComparison,
            }).success,
        ).toBe(false);
        const documented = documentedOf(requestsFor());
        expect(
            overviewRequestSchema.safeParse({
                ...documented,
                previous: PREVIOUS_EVAL,
            }).success,
        ).toBe(false);
    });

    it('rejects a previous account with no counts, an unknown key or a bad stage', () => {
        const request = accountRequestWithPrevious();
        expect(
            overviewRequestSchema.safeParse({
                ...request,
                previous: { account: PREVIOUS_EVAL_SNAPSHOT },
            }).success,
        ).toBe(false);
        expect(
            overviewRequestSchema.safeParse({
                ...request,
                previous: { ...PREVIOUS_EVAL, extra: 1 },
            }).success,
        ).toBe(false);
        expect(
            overviewRequestSchema.safeParse({
                ...request,
                previous: {
                    ...PREVIOUS_EVAL,
                    account: { ...PREVIOUS_EVAL_SNAPSHOT, stage: 'retired' },
                },
            }).success,
        ).toBe(false);
    });
});

describe('overviewOutcomeOf values the previous snapshot beside the latest (PT-90, F-V29)', () => {
    const request = accountRequestWithPrevious();
    const unvaluablePrevious = accountRequestWithPrevious({
        ...PREVIOUS_EVAL,
        account: { ...PREVIOUS_EVAL_SNAPSHOT, stage: SizingStage.Live },
    });
    let outcome: ReturnType<typeof overviewOutcomeOf>;
    let figures: AccountFromStateFigures;
    let plain: AccountFromStateFigures;
    let unvaluable: AccountFromStateFigures;

    beforeAll(() => {
        outcome = overviewOutcomeOf(request);
        figures = succeededAccount(request);
        plain = succeededAccount(accountRequestWithPrevious(null));
        unvaluable = succeededAccount(unvaluablePrevious);
    }, 10_000);

    it('reports the value at the previous snapshot with the same trials and seed as the latest value, from the same spec', () => {
        const { valueAtPrevious } = figures;
        if (valueAtPrevious?.kind !== ValueChainStepOutcomeKind.Value) {
            throw new Error('expected a value at the previous snapshot');
        }
        expect(valueAtPrevious.value.trials).toBe(figures.valueNow.trials);
        expect(valueAtPrevious.value.seed).toBe(figures.valueNow.seed);
        expect(valueAtPrevious.value).toEqual(
            valueAtState(rebuiltAccount(PREVIOUS_EVAL_SNAPSHOT), request.spec),
        );
        expect(figures.valueNow).toEqual(
            valueAtState(rebuiltAccount(EVAL_SNAPSHOT), request.spec),
        );
    });

    it('leaves every other figure as it is without the previous account, and runs no previous value', () => {
        expect('valueAtPrevious' in plain).toBe(false);
        const { valueAtPrevious: ignored, ...rest } = figures;
        expect(ignored).toBeDefined();
        expect(rest).toEqual(plain);
    });

    it('keeps a previous snapshot the engine cannot value as a failure for that account, with the latest value intact', () => {
        expect(unvaluable.valueNow.kind).toBe(ValueResultKind.Value);
        const { valueAtPrevious } = unvaluable;
        if (valueAtPrevious?.kind !== ValueChainStepOutcomeKind.Unavailable) {
            throw new Error('expected an unavailable previous value');
        }
        expect(valueAtPrevious.reason.length).toBeGreaterThan(0);
    });

    it('returns a result that survives structuredClone', () => {
        expect(structuredClone(outcome)).toEqual(outcome);
    });
});
