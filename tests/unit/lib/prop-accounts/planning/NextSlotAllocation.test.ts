import { describe, expect, it } from 'vitest';

import {
    ScaleGateStatus,
    ScaleGateUnmetCondition,
} from '~/lib/prop-accounts/bankroll';
import {
    AccountEventKind,
    AccountStage,
    AccountStatus,
    AccountTracking,
    FirmEngagementReason,
    FirmEngagementStatus,
} from '~/lib/prop-accounts/core';
import {
    type NextSlotAllocation,
    nextSlotAllocation,
    type NextSlotCandidate,
    nextSlotCandidatePlans,
    type NextSlotDocumentedFigures,
    NextSlotEngineKind,
    type NextSlotEngineSlot,
    NextSlotExclusionReason,
    type NextSlotInputs,
    NextSlotListingKind,
    type NextSlotOptimumFigures,
    nextSlotPlansNeedingOptimum,
    NextSlotScaleMark,
    NextSlotSizingBasis,
} from '~/lib/prop-accounts/planning';
import {
    ALL_FIRMS,
    CumulativeAmountTrigger,
    DiscretionaryTrigger,
    dollars,
    effectivePayoutRequest,
    EvalPurchaseEffect,
    FirmAccountPolicy,
    FirmId,
    FixedCooldown,
    fraction,
    InstrumentSymbol,
    type LiveExclusivityPolicy,
    type LiveTransitionTrigger,
    type Plan,
    PlanAvailability,
    PolicySourceKind,
    PolicyVerification,
    serializePlanId,
    SimAccountEffect,
    TRADING_DAYS_PER_MONTH,
} from '~/lib/prop-calculator';
import {
    type AccountCapPolicy,
    AccountCapPolicyKind,
    type SharedPoolPolicy,
} from '~/lib/prop-calculator';
import {
    DEFAULT_RULEBOOK,
    type EnginePolicy,
    HARD_RULE_2_MIN_RETAINED_CUSHION_CENTS,
    LifetimePayoutCapBasis,
    PayoutRequestNotice,
    RebuyLagBasis,
    SizingObjective,
} from '~/lib/prop-calculator/advisor';
import { batchLossClosedForm } from '~/lib/prop-calculator/economics';

import {
    account,
    EVAL_PLAN,
    event,
    firmEngagement,
    ledger,
    OTHER_FIRM_EVAL_PLAN,
    type PlanEntry,
    SAME_FIRM_SECOND_EVAL_PLAN,
} from '../metrics/ledgerFixtures';

const TODAY = '2026-09-30';

const CONFIRMED_SOURCE = {
    fetchedOn: '2026-09-20',
    quote: 'a synthetic confirmed quote',
    sourceKind: PolicySourceKind.UserPaste,
    url: 'https://example.test/policy',
    verification: PolicyVerification.Confirmed,
} as const;

const BLOCKING_EXCLUSIVITY: LiveExclusivityPolicy = {
    cooldown: new FixedCooldown(30),
    evalPurchaseEffect: EvalPurchaseEffect.Blocked,
    household: false,
    simAccountEffect: SimAccountEffect.Closed,
    source: CONFIRMED_SOURCE,
};

const ENGINE_POLICY: EnginePolicy = {
    commissionPerRoundTrip: 0,
    fundedHorizonDays: 120,
    lifetimePayoutCapBasis: LifetimePayoutCapBasis.VerifiedNoCountTrigger,
    lifetimePayoutCapOverride: null,
    payoutRequestOverride: 500,
    rebuyLagBasis: RebuyLagBasis.AssumedZero,
    rebuyLagDays: 0,
    retainedCushionRequest: 2000,
};

class VerifiedPolicy extends FirmAccountPolicy {
    constructor(
        private readonly options: {
            readonly exclusivity?: LiveExclusivityPolicy;
            readonly pool?: SharedPoolPolicy;
            readonly triggers?: readonly LiveTransitionTrigger[];
        } = {},
    ) {
        super();
    }

    override capPolicyFor(plan: Plan): AccountCapPolicy {
        return this.options.pool ?? super.capPolicyFor(plan);
    }

    override liveExclusivityFor(plan: Plan): LiveExclusivityPolicy {
        return this.options.exclusivity ?? super.liveExclusivityFor(plan);
    }

    override liveTriggersFor(): readonly LiveTransitionTrigger[] {
        return (
            this.options.triggers ?? [
                new CumulativeAmountTrigger(dollars(100_000), CONFIRMED_SOURCE),
            ]
        );
    }
}

function allocate(overrides: Partial<NextSlotInputs> = {}): NextSlotAllocation {
    return nextSlotAllocation({
        availableCents: null,
        bankroll: DEFAULT_RULEBOOK.bankroll,
        candidates: [],
        ledger: ledger({}),
        objective: SizingObjective.MonthlyNet,
        requestedPayoutDollars: 500,
        scaleGate: null,
        today: TODAY,
        ...overrides,
    });
}

function candidateOf(
    entry: PlanEntry,
    options: {
        readonly documented?: NextSlotEngineSlot<NextSlotDocumentedFigures>;
        readonly enginePolicy?: EnginePolicy;
        readonly monthlyNet?: number;
        readonly optimum?: NextSlotEngineSlot<NextSlotOptimumFigures>;
        readonly optimumNet?: number;
    } = {},
): NextSlotCandidate {
    return {
        documented:
            options.documented ??
            ready(documentedFigures({ monthlyNet: options.monthlyNet })),
        enginePolicy: options.enginePolicy ?? ENGINE_POLICY,
        firm: entry.firm,
        optimum:
            options.optimum ??
            ready(optimumFigures(options.optimumNet ?? options.monthlyNet ?? 300)),
        plan: entry.plan,
    };
}

function containing(text: string): unknown {
    return expect.stringContaining(text);
}

function costSlot(
    cost: number,
): NextSlotEngineSlot<NextSlotDocumentedFigures> {
    const figures = documentedFigures({ costPerAttempt: estimate(cost) });
    return ready(figures);
}

function creditSensitiveSlot(): NextSlotEngineSlot<NextSlotOptimumFigures> {
    const figures = optimumFigures(300, { creditSensitive: true });
    return ready(figures);
}

function documentedFigures(
    overrides: Partial<NextSlotDocumentedFigures> & {
        readonly monthlyNet?: number;
    } = {},
): NextSlotDocumentedFigures {
    const { monthlyNet = 300, ...rest } = overrides;
    const anyPayout = rest.anyPayoutGivenFundedProbability?.value ?? 0.5;
    return {
        anyPayoutGivenFundedProbability: { standardError: 0.01, value: 0.5 },
        attemptPassProbability: estimate(0.3),
        costPerAttempt: estimate(100),
        expectedMonthlyNet: estimate(monthlyNet),
        expectedMonthlyRealizedNet: estimate(monthlyNet - 20),
        expectedNetPerAttempt: estimate(50),
        expectedPayoutPerFundedAccount: { standardError: 5, value: 800 },
        fundedBustProbability: estimate(0.2),
        fundedPayoutCountDistribution: [1 - anyPayout, anyPayout],
        minRetainedCushion: 2000,
        payoutRequestSize: 500,
        payoutsPerFundedAccount: { standardError: 0.05, value: anyPayout },
        trials: 2000,
        ...rest,
    };
}

function entryOf(ref: { firm: PlanEntry['firm']; plan: Plan }): PlanEntry {
    return {
        firm: ref.firm,
        plan: ref.plan,
        serial: serializePlanId(ref.plan.id),
    };
}

function estimate(value: number): { standardError: number; value: number } {
    return { standardError: 1, value };
}

function expectedLoss(figures: NextSlotDocumentedFigures): null | number {
    return batchLossClosedForm({
        attemptCost: dollars(figures.costPerAttempt.value),
        attempts: 50,
        pAttemptPays: fraction(
            figures.attemptPassProbability.value *
                figures.anyPayoutGivenFundedProbability.value,
        ),
        valuePerPayingAttempt: dollars(
            figures.expectedPayoutPerFundedAccount.value /
                figures.anyPayoutGivenFundedProbability.value,
        ),
    }).value;
}

function fundedAccounts(entry: PlanEntry, count: number) {
    return Array.from({ length: count }, () =>
        account(entry, { fundedOn: '2026-09-02', stage: AccountStage.Funded }),
    );
}

function needing(
    entries: readonly PlanEntry[],
    ledgerValue = ledger({}),
    options: ConstructorParameters<typeof VerifiedPolicy>[0] = {},
): ReadonlySet<string> {
    return verified(
        entries,
        () =>
            nextSlotPlansNeedingOptimum({
                candidates: entries.map((entry) => ({
                    enginePolicy: ENGINE_POLICY,
                    firm: entry.firm,
                    plan: entry.plan,
                })),
                ledger: ledgerValue,
                today: TODAY,
            }),
        options,
    );
}

function notRankedRow(allocation: NextSlotAllocation, entry: PlanEntry) {
    const row = allocation.notRanked.find(
        (candidate) => candidate.planSerial === entry.serial,
    );
    if (row === undefined) {
        throw new Error(`expected ${entry.serial} to be listed as not ranked`);
    }
    return row;
}

function optimumFigures(
    monthlyNet: number,
    overrides: Partial<NextSlotOptimumFigures> = {},
): NextSlotOptimumFigures {
    return {
        creditSensitive: false,
        evaluatedSizes: 12,
        expectedMonthlyNet: estimate(monthlyNet),
        expectedMonthlyRealizedNet: estimate(monthlyNet - 20),
        fundedBustProbability: estimate(0.4),
        requestSize: 750,
        ...overrides,
    };
}

function rankedRow(allocation: NextSlotAllocation, entry: PlanEntry) {
    const row = allocation.ranked.find(
        (candidate) => candidate.planSerial === entry.serial,
    );
    if (row === undefined) {
        throw new Error(`expected ${entry.serial} to be ranked`);
    }
    return row;
}

function rankedSerials(allocation: NextSlotAllocation): readonly string[] {
    return allocation.ranked.map((row) => row.planSerial);
}

function ready<Figures>(figures: Figures): NextSlotEngineSlot<Figures> {
    return { figures, kind: NextSlotEngineKind.Ready };
}

function requestSlot(
    plan: Plan,
): NextSlotEngineSlot<NextSlotDocumentedFigures> {
    const payoutRequestSize = effectivePayoutRequest(plan, 500);
    return ready(documentedFigures({ payoutRequestSize }));
}

function rowWith(entry: PlanEntry, minRetainedCushion: number) {
    const documented = ready(documentedFigures({ minRetainedCushion }));
    const allocation = verified([entry], () =>
        allocate({ candidates: [candidateOf(entry, { documented })] }),
    );
    return rankedRow(allocation, entry).figures;
}

function verified<T>(
    entries: readonly PlanEntry[],
    run: () => T,
    options: ConstructorParameters<typeof VerifiedPolicy>[0] = {},
): T {
    return withPolicies(
        new Map(
            entries.map((entry) => [entry.firm, new VerifiedPolicy(options)]),
        ),
        run,
    );
}

function withPolicies<T>(
    policies: ReadonlyMap<PlanEntry['firm'], FirmAccountPolicy>,
    run: () => T,
): T {
    const originals = policies
        .keys()
        .map((firm) => [firm, firm.accountPolicy] as const)
        .toArray();
    for (const [firm, policy] of policies) {
        (firm as { accountPolicy: FirmAccountPolicy }).accountPolicy = policy;
    }
    try {
        return run();
    } finally {
        for (const [firm, original] of originals) {
            (firm as { accountPolicy: FirmAccountPolicy }).accountPolicy =
                original;
        }
    }
}

const THREE_PLANS = [EVAL_PLAN, SAME_FIRM_SECOND_EVAL_PLAN, OTHER_FIRM_EVAL_PLAN];

const ABOVE_REQUEST_PLANS = [
    {
        citation:
            'src/lib/prop-calculator/firms/tradeify/Tradeify.ts:237 and :242 (payoutLadder.minRequestAmount)',
        firmId: FirmId.Tradeify,
        label: '$50K \u{B7} Lightning Funded',
        minimum: 1000,
    },
    {
        citation: 'src/lib/prop-calculator/firms/mffu/MyFundedFutures.ts:211',
        firmId: FirmId.Mffu,
        label: '$50K \u{B7} Pro',
        minimum: 1000,
    },
    {
        citation:
            'src/lib/prop-calculator/firms/alphafutures/AlphaFutures.ts:47 (ADVANCED_SIZES minPayoutRequest)',
        firmId: FirmId.AlphaFutures,
        label: '$50K \u{B7} Advanced',
        minimum: 1000,
    },
] as const;

describe('nextSlotCandidatePlans', () => {
    it('lists only purchasable plans and leaves out every call-up-only plan', () => {
        const refs = nextSlotCandidatePlans();
        const allPlans = ALL_FIRMS.flatMap((firm) => firm.plans);
        const callUpOnly = allPlans.filter(
            (plan) => plan.availability === PlanAvailability.CallUpOnly,
        );
        expect(callUpOnly.length).toBeGreaterThan(0);
        expect(refs.length).toBeGreaterThan(0);
        expect(refs.every((ref) => ref.plan.isPurchasable)).toBe(true);
        for (const plan of callUpOnly) {
            expect(refs.map((ref) => ref.plan)).not.toContain(plan);
        }
        expect(refs).toHaveLength(
            allPlans.filter((plan) => plan.isPurchasable).length,
        );
    });

    it('pairs every plan with the firm that sells it', () => {
        const refs = nextSlotCandidatePlans();
        expect(refs.length).toBeGreaterThan(0);
        for (const ref of refs) {
            expect(ref.firm.plans).toContain(ref.plan);
        }
    });
});

describe('nextSlotAllocation ranking', () => {
    it('ranks verified plans by credit-inclusive documented monthly net and shows both monthly figures and the payout-size optimum beside it', () => {
        const allocation = verified(THREE_PLANS, () =>
            allocate({
                candidates: [
                    candidateOf(EVAL_PLAN, { monthlyNet: 200, optimumNet: 210 }),
                    candidateOf(SAME_FIRM_SECOND_EVAL_PLAN, {
                        monthlyNet: 400,
                        optimumNet: 410,
                    }),
                    candidateOf(OTHER_FIRM_EVAL_PLAN, {
                        monthlyNet: 300,
                        optimumNet: 310,
                    }),
                ],
            }),
        );
        expect(rankedSerials(allocation)).toEqual([
            SAME_FIRM_SECOND_EVAL_PLAN.serial,
            OTHER_FIRM_EVAL_PLAN.serial,
            EVAL_PLAN.serial,
        ]);
        expect(allocation.ranked.map((row) => row.rank)).toEqual([1, 2, 3]);
        const top = allocation.ranked[0];
        expect(top?.figures.documented.creditInclusive.value).toBe(400);
        expect(top?.figures.documented.creditFree.value).toBe(380);
        expect(top?.figures.optimum?.creditInclusive.value).toBe(410);
        expect(top?.figures.optimum?.creditFree.value).toBe(390);
        expect(top?.figures.optimum?.requestSize).toBe(750);
        expect(allocation.notRanked).toEqual([]);
    });

    it('marks every rank payout-policy sensitive when the optimum order differs and none when the orders agree', () => {
        const flipped = verified(THREE_PLANS, () =>
            allocate({
                candidates: [
                    candidateOf(EVAL_PLAN, { monthlyNet: 300, optimumNet: 100 }),
                    candidateOf(SAME_FIRM_SECOND_EVAL_PLAN, {
                        monthlyNet: 200,
                        optimumNet: 400,
                    }),
                    candidateOf(OTHER_FIRM_EVAL_PLAN, {
                        monthlyNet: 100,
                        optimumNet: 300,
                    }),
                ],
            }),
        );
        expect(flipped.optimumComparable).toBe(true);
        expect(rankedRow(flipped, EVAL_PLAN)).toMatchObject({
            documentedRank: 1,
            optimumRank: 3,
            payoutPolicySensitive: true,
        });
        expect(rankedRow(flipped, SAME_FIRM_SECOND_EVAL_PLAN)).toMatchObject({
            documentedRank: 2,
            optimumRank: 1,
            payoutPolicySensitive: true,
        });
        const agreeing = verified(THREE_PLANS, () =>
            allocate({
                candidates: [
                    candidateOf(EVAL_PLAN, { monthlyNet: 300, optimumNet: 330 }),
                    candidateOf(SAME_FIRM_SECOND_EVAL_PLAN, {
                        monthlyNet: 200,
                        optimumNet: 230,
                    }),
                    candidateOf(OTHER_FIRM_EVAL_PLAN, {
                        monthlyNet: 100,
                        optimumNet: 130,
                    }),
                ],
            }),
        );
        expect(
            agreeing.ranked.map((row) => row.payoutPolicySensitive),
        ).toEqual([false, false, false]);
    });

    it('withholds the order comparison when one plan has no payout-size optimum, and still ranks it by the documented figure', () => {
        const allocation = verified(THREE_PLANS, () =>
            allocate({
                candidates: [
                    candidateOf(EVAL_PLAN, { monthlyNet: 300, optimumNet: 100 }),
                    candidateOf(SAME_FIRM_SECOND_EVAL_PLAN, {
                        monthlyNet: 200,
                        optimum: {
                            kind: NextSlotEngineKind.Refused,
                            reason: 'the sweep refused these inputs',
                        },
                    }),
                    candidateOf(OTHER_FIRM_EVAL_PLAN, {
                        monthlyNet: 100,
                        optimumNet: 300,
                    }),
                ],
            }),
        );
        expect(allocation.optimumComparable).toBe(false);
        expect(rankedSerials(allocation)).toEqual([
            EVAL_PLAN.serial,
            SAME_FIRM_SECOND_EVAL_PLAN.serial,
            OTHER_FIRM_EVAL_PLAN.serial,
        ]);
        for (const row of allocation.ranked) {
            expect(row.optimumRank).toBeNull();
            expect(row.payoutPolicySensitive).toBe(false);
        }
        expect(
            rankedRow(allocation, SAME_FIRM_SECOND_EVAL_PLAN).figures.optimum,
        ).toBeNull();
    });

    it('carries the credit-sensitive flag of the optimum onto the row', () => {
        const allocation = verified([EVAL_PLAN], () =>
            allocate({
                candidates: [
                    candidateOf(EVAL_PLAN, { optimum: creditSensitiveSlot() }),
                ],
            }),
        );
        expect(rankedRow(allocation, EVAL_PLAN).figures.creditSensitive).toBe(
            true,
        );
    });
});

describe('nextSlotAllocation payout request above the $500 request', () => {
    const rankable = nextSlotCandidatePlans();
    const above = rankable.filter(
        (ref) => effectivePayoutRequest(ref.plan, 500) > 500,
    );

    it('pins today’s four plans whose minimum request exceeds $500, with the file each minimum comes from', () => {
        expect(
            above.map((ref) => ({
                firmId: ref.firm.id,
                label: ref.plan.label,
                minimum: effectivePayoutRequest(ref.plan, 500),
            })),
        ).toEqual(
            ABOVE_REQUEST_PLANS.map(({ firmId, label, minimum }) => ({
                firmId,
                label,
                minimum,
            })),
        );
        for (const pinned of ABOVE_REQUEST_PLANS) {
            expect(pinned.citation).toContain('src/lib/prop-calculator/firms/');
        }
    });

    it('leaves out FundedNext FNL:003 Instant, whose $800 minimum (FundedNext.ts:41 and :269) is above $500 but which is discontinued', () => {
        const fnl003 = ALL_FIRMS.find((firm) => firm.id === FirmId.FundedNext)
            ?.plans.find((plan) => plan.label.includes('FNL:003'));
        expect(fnl003).toBeDefined();
        expect(fnl003?.availability).toBe(PlanAvailability.Discontinued);
        if (fnl003 === undefined) throw new Error('expected FNL:003');
        expect(effectivePayoutRequest(fnl003, 500)).toBe(800);
        expect(rankable.map((ref) => ref.plan)).not.toContain(fnl003);
    });

    it('carries the firm minimum notice on each of those plans, with the minimum as the simulated request, and none on a plan at or below $500', () => {
        const entries: PlanEntry[] = above.map((ref) => ({
            firm: ref.firm,
            plan: ref.plan,
            serial: serializePlanId(ref.plan.id),
        }));
        const allocation = verified(
            entries,
            () =>
                allocate({
                    candidates: [
                        ...entries.map((entry) =>
                            candidateOf(entry, {
                                documented: requestSlot(entry.plan),
                            }),
                        ),
                        candidateOf(EVAL_PLAN),
                    ],
                }),
            {},
        );
        for (const entry of entries) {
            const row = [...allocation.ranked, ...allocation.notRanked].find(
                (candidate) => candidate.planSerial === entry.serial,
            );
            expect(row?.figures?.firmMinimumAboveRequest).toEqual({
                kind: PayoutRequestNotice.FirmMinimumAboveRequest,
                minimumRequestAmount: effectivePayoutRequest(entry.plan, 500),
                requestedAmount: 500,
            });
            expect(row?.figures?.documented.requestSize).toBe(
                effectivePayoutRequest(entry.plan, 500),
            );
        }
        const plain = [...allocation.ranked, ...allocation.notRanked].find(
            (candidate) => candidate.planSerial === EVAL_PLAN.serial,
        );
        expect(plain?.figures?.firmMinimumAboveRequest).toBeNull();
    });
});

describe('nextSlotAllocation free slots', () => {
    const planCap = EVAL_PLAN.firm.maxFundedAccounts(EVAL_PLAN.plan);

    it('subtracts the funded slots in use from the plan cap, counting suspended accounts', () => {
        const rows = [
            ...fundedAccounts(EVAL_PLAN, planCap - 2),
            account(EVAL_PLAN, {
                stage: AccountStage.Funded,
                status: AccountStatus.Suspended,
            }),
            account(EVAL_PLAN, {
                stage: AccountStage.Funded,
                status: AccountStatus.Busted,
            }),
            account(EVAL_PLAN),
        ];
        const allocation = verified([EVAL_PLAN], () =>
            allocate({
                candidates: [candidateOf(EVAL_PLAN)],
                ledger: ledger({ accounts: rows }),
            }),
        );
        expect(planCap).toBeGreaterThan(2);
        expect(rankedRow(allocation, EVAL_PLAN).freeSlots).toBe(1);
    });

    it('excludes a plan whose slots are all in use with the used and cap figures in the reason', () => {
        const allocation = verified([EVAL_PLAN], () =>
            allocate({
                candidates: [candidateOf(EVAL_PLAN)],
                ledger: ledger({ accounts: fundedAccounts(EVAL_PLAN, planCap) }),
            }),
        );
        expect(allocation.ranked).toEqual([]);
        const row = notRankedRow(allocation, EVAL_PLAN);
        expect(row.kind).toBe(NextSlotListingKind.Excluded);
        expect(row.reasons).toEqual([
            expect.objectContaining({
                detail: containing(`${planCap} of ${planCap}`),
                reason: NextSlotExclusionReason.NoFreeSlot,
            }),
        ]);
    });

    it('counts the plan itself as unheld when nothing is bought, giving every slot free', () => {
        const allocation = verified([EVAL_PLAN], () =>
            allocate({ candidates: [candidateOf(EVAL_PLAN)] }),
        );
        expect(rankedRow(allocation, EVAL_PLAN).freeSlots).toBe(planCap);
    });

    it('limits a plan that holds no accounts by the shared pool another plan of the firm has used', () => {
        const pool: SharedPoolPolicy = {
            excludedPlans: [],
            household: false,
            kind: AccountCapPolicyKind.SharedPool,
            members: [EVAL_PLAN.serial, SAME_FIRM_SECOND_EVAL_PLAN.serial],
            poolSize: 5,
            reduction: null,
            subCaps: [],
        };
        const allocation = verified(
            [EVAL_PLAN],
            () =>
                allocate({
                    candidates: [
                        candidateOf(EVAL_PLAN),
                        candidateOf(SAME_FIRM_SECOND_EVAL_PLAN),
                    ],
                    ledger: ledger({ accounts: fundedAccounts(EVAL_PLAN, 4) }),
                }),
            { pool },
        );
        expect(rankedRow(allocation, SAME_FIRM_SECOND_EVAL_PLAN).freeSlots).toBe(
            Math.min(
                SAME_FIRM_SECOND_EVAL_PLAN.firm.maxFundedAccounts(
                    SAME_FIRM_SECOND_EVAL_PLAN.plan,
                ),
                1,
            ),
        );
        expect(rankedRow(allocation, EVAL_PLAN).freeSlots).toBe(
            Math.min(planCap - 4, 1),
        );
    });

    it('lists a firm whose cap scope is unverified and does not rank it', () => {
        const allocation = allocate({ candidates: [candidateOf(EVAL_PLAN)] });
        expect(allocation.ranked).toEqual([]);
        const row = notRankedRow(allocation, EVAL_PLAN);
        expect(row.kind).toBe(NextSlotListingKind.Unverified);
        expect(row.reasons.map((reason) => reason.reason)).toContain(
            NextSlotExclusionReason.CapScopeUnverified,
        );
        expect(row.figures?.documented.creditInclusive.value).toBe(300);
    });
});

describe('nextSlotAllocation live triggers', () => {
    it('lists a plan with an unverified live trigger as live trigger unverified and does not rank it, even with the cap scope verified', () => {
        const allocation = withPolicies(
            new Map([
                [
                    EVAL_PLAN.firm,
                    new (class extends FirmAccountPolicy {})(),
                ],
            ]),
            () => allocate({ candidates: [candidateOf(EVAL_PLAN)] }),
        );
        const row = notRankedRow(allocation, EVAL_PLAN);
        expect(row.kind).toBe(NextSlotListingKind.Unverified);
        expect(row.reasons.map((reason) => reason.reason)).toEqual([
            NextSlotExclusionReason.LiveTriggerUnverified,
        ]);
        expect(row.reasons[0]?.detail).toContain('live trigger unverified');
    });

    it('treats a trigger whose source is not confirmed as unverified', () => {
        const allocation = verified(
            [EVAL_PLAN],
            () => allocate({ candidates: [candidateOf(EVAL_PLAN)] }),
            {
                triggers: [
                    new DiscretionaryTrigger({
                        verification: PolicyVerification.NeedsPaste,
                    }),
                ],
            },
        );
        expect(notRankedRow(allocation, EVAL_PLAN).reasons).toEqual([
            expect.objectContaining({
                reason: NextSlotExclusionReason.LiveTriggerUnverified,
            }),
        ]);
    });
});

describe('nextSlotAllocation exclusions', () => {
    it('excludes a firm under a verified live exclusivity that blocks new evaluation purchases', () => {
        const live = account(EVAL_PLAN, { stage: AccountStage.Live });
        const allocation = verified(
            THREE_PLANS,
            () =>
                allocate({
                    candidates: [
                        candidateOf(EVAL_PLAN),
                        candidateOf(SAME_FIRM_SECOND_EVAL_PLAN),
                        candidateOf(OTHER_FIRM_EVAL_PLAN),
                    ],
                    ledger: ledger({ accounts: [live] }),
                }),
            { exclusivity: BLOCKING_EXCLUSIVITY },
        );
        expect(rankedSerials(allocation)).toEqual([OTHER_FIRM_EVAL_PLAN.serial]);
        for (const entry of [EVAL_PLAN, SAME_FIRM_SECOND_EVAL_PLAN]) {
            const row = notRankedRow(allocation, entry);
            expect(row.kind).toBe(NextSlotListingKind.Excluded);
            expect(row.reasons).toEqual([
                expect.objectContaining({
                    reason: NextSlotExclusionReason.LiveExclusivity,
                }),
            ]);
        }
    });

    it('excludes a firm in a verified cooldown after a live bust and returns it to the ranking once the cooldown ends', () => {
        const busted = account(EVAL_PLAN, {
            stage: AccountStage.Live,
            status: AccountStatus.Busted,
        });
        const events = [
            event(busted, AccountEventKind.MovedLive, '2026-08-01'),
            event(busted, AccountEventKind.Busted, '2026-09-20'),
        ];
        const during = verified(
            [EVAL_PLAN],
            () =>
                allocate({
                    candidates: [candidateOf(EVAL_PLAN)],
                    ledger: ledger({ accounts: [busted], events }),
                    today: '2026-09-30',
                }),
            { exclusivity: BLOCKING_EXCLUSIVITY },
        );
        expect(notRankedRow(during, EVAL_PLAN).reasons).toEqual([
            expect.objectContaining({
                reason: NextSlotExclusionReason.Cooldown,
            }),
        ]);
        const after = verified(
            [EVAL_PLAN],
            () =>
                allocate({
                    candidates: [candidateOf(EVAL_PLAN)],
                    ledger: ledger({ accounts: [busted], events }),
                    today: '2026-11-15',
                }),
            { exclusivity: BLOCKING_EXCLUSIVITY },
        );
        expect(rankedSerials(after)).toEqual([EVAL_PLAN.serial]);
    });

    it('ignores an exclusivity rule whose source is not confirmed', () => {
        const live = account(EVAL_PLAN, { stage: AccountStage.Live });
        const allocation = verified(
            [EVAL_PLAN],
            () =>
                allocate({
                    candidates: [candidateOf(EVAL_PLAN)],
                    ledger: ledger({ accounts: [live] }),
                }),
            {
                exclusivity: {
                    ...BLOCKING_EXCLUSIVITY,
                    source: { verification: PolicyVerification.NeedsPaste },
                },
            },
        );
        expect(rankedSerials(allocation)).toEqual([EVAL_PLAN.serial]);
    });

    it.each([
        [FirmEngagementStatus.Paused, NextSlotExclusionReason.FirmPaused],
        [FirmEngagementStatus.Retired, NextSlotExclusionReason.FirmRetired],
    ])(
        'excludes a firm you marked %s with that reason, even while its policy is unverified',
        (status, reason) => {
            const allocation = allocate({
                candidates: [
                    candidateOf(EVAL_PLAN),
                    candidateOf(OTHER_FIRM_EVAL_PLAN),
                ],
                ledger: ledger({
                    firmEngagements: [
                        firmEngagement('', '2026-09-01', status, {
                            externalFirmId: null,
                            firmId: EVAL_PLAN.firm.id,
                            reason: FirmEngagementReason.LowExpectedValue,
                        }),
                    ],
                }),
            });
            const row = notRankedRow(allocation, EVAL_PLAN);
            expect(row.kind).toBe(NextSlotListingKind.Excluded);
            expect(row.reasons).toEqual([
                expect.objectContaining({ reason }),
            ]);
            expect(
                allocation.notRanked.find(
                    (candidate) =>
                        candidate.planSerial === OTHER_FIRM_EVAL_PLAN.serial,
                )?.kind,
            ).toBe(NextSlotListingKind.Unverified);
        },
    );

    it('keeps a firm marked active in the ranking', () => {
        const allocation = verified([EVAL_PLAN], () =>
            allocate({
                candidates: [candidateOf(EVAL_PLAN)],
                ledger: ledger({
                    firmEngagements: [
                        firmEngagement('', '2026-09-01', FirmEngagementStatus.Active, {
                            externalFirmId: null,
                            firmId: EVAL_PLAN.firm.id,
                        }),
                    ],
                }),
            }),
        );
        expect(rankedSerials(allocation)).toEqual([EVAL_PLAN.serial]);
    });

    it('lists a spec the engine refused as not rankable with the refusal text and never ranks it', () => {
        const allocation = verified([EVAL_PLAN, OTHER_FIRM_EVAL_PLAN], () =>
            allocate({
                candidates: [
                    candidateOf(EVAL_PLAN, {
                        documented: {
                            kind: NextSlotEngineKind.Refused,
                            reason: 'the stop is below one tick',
                        },
                    }),
                    candidateOf(OTHER_FIRM_EVAL_PLAN),
                ],
            }),
        );
        expect(rankedSerials(allocation)).toEqual([OTHER_FIRM_EVAL_PLAN.serial]);
        const row = notRankedRow(allocation, EVAL_PLAN);
        expect(row.kind).toBe(NextSlotListingKind.Refused);
        expect(row.reasons).toEqual([
            {
                detail: 'not rankable: the stop is below one tick',
                reason: NextSlotExclusionReason.NotRankable,
            },
        ]);
        expect(row.figures).toBeNull();
    });

    it('lists a plan whose engine run is still pending and one whose run failed without ranking either', () => {
        const allocation = verified(THREE_PLANS, () =>
            allocate({
                candidates: [
                    candidateOf(EVAL_PLAN, {
                        documented: { kind: NextSlotEngineKind.Pending },
                    }),
                    candidateOf(SAME_FIRM_SECOND_EVAL_PLAN, {
                        documented: {
                            kind: NextSlotEngineKind.Failed,
                            reason: 'worker crashed',
                        },
                    }),
                    candidateOf(OTHER_FIRM_EVAL_PLAN),
                ],
            }),
        );
        expect(rankedSerials(allocation)).toEqual([OTHER_FIRM_EVAL_PLAN.serial]);
        expect(notRankedRow(allocation, EVAL_PLAN).kind).toBe(
            NextSlotListingKind.Pending,
        );
        expect(notRankedRow(allocation, EVAL_PLAN).reasons[0]?.reason).toBe(
            NextSlotExclusionReason.EnginePending,
        );
        const failed = notRankedRow(allocation, SAME_FIRM_SECOND_EVAL_PLAN);
        expect(failed.kind).toBe(NextSlotListingKind.Refused);
        expect(failed.reasons).toEqual([
            expect.objectContaining({
                detail: containing('worker crashed'),
                reason: NextSlotExclusionReason.EngineFailed,
            }),
        ]);
    });

    it('excludes a plan whose attempt cost exceeds the available bankroll and keeps every plan when no bankroll is known', () => {
        const candidates = [
            candidateOf(EVAL_PLAN, { documented: costSlot(100) }),
            candidateOf(OTHER_FIRM_EVAL_PLAN, { documented: costSlot(30) }),
        ];
        const tight = verified([EVAL_PLAN, OTHER_FIRM_EVAL_PLAN], () =>
            allocate({ availableCents: 5000, candidates }),
        );
        expect(rankedSerials(tight)).toEqual([OTHER_FIRM_EVAL_PLAN.serial]);
        const row = notRankedRow(tight, EVAL_PLAN);
        expect(row.kind).toBe(NextSlotListingKind.Excluded);
        expect(row.reasons).toEqual([
            expect.objectContaining({
                reason: NextSlotExclusionReason.Unaffordable,
            }),
        ]);
        const unknown = verified([EVAL_PLAN, OTHER_FIRM_EVAL_PLAN], () =>
            allocate({ availableCents: null, candidates }),
        );
        expect(unknown.ranked).toHaveLength(2);
    });

    it('does not count a ledger-only account in slots or capacity, discloses it and does not throw', () => {
        const ledgerOnly = account(EVAL_PLAN, {
            accountSize: 150_000,
            planLabel: 'Hola Prime 150K',
            planSerial: null,
            stage: AccountStage.Funded,
            tracking: AccountTracking.LedgerOnly,
        });
        const allocation = verified([EVAL_PLAN], () =>
            allocate({
                bankroll: {
                    ...DEFAULT_RULEBOOK.bankroll,
                    dailyAccountCapacity: 1,
                },
                candidates: [candidateOf(EVAL_PLAN)],
                ledger: ledger({ accounts: [ledgerOnly] }),
            }),
        );
        expect(allocation.ledgerOnlyAccounts).toBe(1);
        expect(rankedRow(allocation, EVAL_PLAN).freeSlots).toBe(
            EVAL_PLAN.firm.maxFundedAccounts(EVAL_PLAN.plan),
        );
        expect(allocation.capacity).toEqual({
            activeUnits: 0,
            limit: 1,
            remaining: 1,
        });
        expect(
            allocation.disclosures.some((text) =>
                text.includes('1 ledger-only account'),
            ),
        ).toBe(true);
    });
});

function ownedAccounts() {
    return [
        account(EVAL_PLAN, { copyGroupId: 'group-a' }),
        account(EVAL_PLAN, { copyGroupId: 'group-a' }),
        account(OTHER_FIRM_EVAL_PLAN),
        account(OTHER_FIRM_EVAL_PLAN, { archivedAt: new Date('2026-09-01') }),
        account(OTHER_FIRM_EVAL_PLAN, { status: AccountStatus.Busted }),
    ];
}

describe('nextSlotAllocation capacity', () => {
    const bankroll = { ...DEFAULT_RULEBOOK.bankroll, dailyAccountCapacity: 4 };

    it('counts a copy group once and leaves archived and ended accounts out when it caps the recommended slots', () => {
        const allocation = verified(THREE_PLANS, () =>
            allocate({
                bankroll,
                candidates: [
                    candidateOf(SAME_FIRM_SECOND_EVAL_PLAN, { monthlyNet: 500 }),
                    candidateOf(OTHER_FIRM_EVAL_PLAN, { monthlyNet: 100 }),
                ],
                ledger: ledger({ accounts: ownedAccounts() }),
            }),
        );
        expect(allocation.capacity).toEqual({
            activeUnits: 2,
            limit: 4,
            remaining: 2,
        });
        const [first, second] = allocation.ranked;
        expect(first?.allocatableSlots).toBe(Math.min(first?.freeSlots ?? 0, 2));
        expect(second?.allocatableSlots).toBe(
            Math.min(second?.freeSlots ?? 0, 2 - (first?.allocatableSlots ?? 0)),
        );
    });

    it('caps every recommendation at zero with a capacity reason once capacity is full', () => {
        const allocation = verified(THREE_PLANS, () =>
            allocate({
                bankroll: { ...bankroll, dailyAccountCapacity: 2 },
                candidates: [candidateOf(SAME_FIRM_SECOND_EVAL_PLAN)],
                ledger: ledger({ accounts: ownedAccounts() }),
            }),
        );
        expect(allocation.capacity?.remaining).toBe(0);
        const [row] = allocation.ranked;
        expect(row?.allocatableSlots).toBe(0);
        expect(row?.limitedBy).toBe(NextSlotExclusionReason.Capacity);
    });

    it('leaves recommendations at the free slots when no capacity is set', () => {
        const allocation = verified(THREE_PLANS, () =>
            allocate({ candidates: [candidateOf(SAME_FIRM_SECOND_EVAL_PLAN)] }),
        );
        expect(allocation.capacity).toBeNull();
        const [row] = allocation.ranked;
        expect(row?.allocatableSlots).toBe(row?.freeSlots);
        expect(row?.limitedBy).toBeNull();
    });
});

describe('nextSlotAllocation objective', () => {
    const PAYING = documentedFigures({
        anyPayoutGivenFundedProbability: { standardError: 0, value: 0.5 },
        attemptPassProbability: estimate(0.1),
        costPerAttempt: estimate(100),
        expectedNetPerAttempt: estimate(200),
        expectedPayoutPerFundedAccount: { standardError: 0, value: 3000 },
        monthlyNet: 500,
    });
    const STEADY = documentedFigures({
        anyPayoutGivenFundedProbability: { standardError: 0, value: 0.9 },
        attemptPassProbability: estimate(0.4),
        costPerAttempt: estimate(100),
        expectedNetPerAttempt: estimate(60),
        expectedPayoutPerFundedAccount: { standardError: 0, value: 400 },
        monthlyNet: 300,
    });
    const LOSING = documentedFigures({
        anyPayoutGivenFundedProbability: { standardError: 0, value: 0.5 },
        attemptPassProbability: estimate(0.2),
        costPerAttempt: estimate(100),
        expectedNetPerAttempt: estimate(-20),
        expectedPayoutPerFundedAccount: { standardError: 0, value: 400 },
        monthlyNet: 900,
    });
    const candidates = () => [
        candidateOf(EVAL_PLAN, { documented: ready(PAYING) }),
        candidateOf(SAME_FIRM_SECOND_EVAL_PLAN, { documented: ready(STEADY) }),
        candidateOf(OTHER_FIRM_EVAL_PLAN, { documented: ready(LOSING) }),
    ];
    const AVAILABLE_CENTS = 500_000;

    it('ranks by monthly net under the default objective', () => {
        const allocation = verified(THREE_PLANS, () =>
            allocate({ availableCents: AVAILABLE_CENTS, candidates: candidates() }),
        );
        expect(rankedSerials(allocation)).toEqual([
            OTHER_FIRM_EVAL_PLAN.serial,
            EVAL_PLAN.serial,
            SAME_FIRM_SECOND_EVAL_PLAN.serial,
        ]);
    });

    it('under RuinFirst ranks positive-EV plans by lower batch loss risk at the bankroll, then non-positive-EV plans last with the reason', () => {
        const allocation = verified(THREE_PLANS, () =>
            allocate({
                availableCents: AVAILABLE_CENTS,
                candidates: candidates(),
                objective: SizingObjective.RuinFirst,
            }),
        );
        expect(rankedSerials(allocation)).toEqual([
            SAME_FIRM_SECOND_EVAL_PLAN.serial,
            EVAL_PLAN.serial,
            OTHER_FIRM_EVAL_PLAN.serial,
        ]);
        expect(allocation.ranked.map((row) => row.isNonPositiveExpectedValue)).toEqual(
            [false, false, true],
        );
        expect(
            rankedRow(allocation, SAME_FIRM_SECOND_EVAL_PLAN).figures
                .batchLossProbability,
        ).toBeCloseTo(expectedLoss(STEADY) ?? NaN, 12);
        expect(
            rankedRow(allocation, EVAL_PLAN).figures.batchLossProbability,
        ).toBeCloseTo(expectedLoss(PAYING) ?? NaN, 12);
        expect(
            rankedRow(allocation, SAME_FIRM_SECOND_EVAL_PLAN).figures
                .batchLossProbability,
        ).toBeLessThan(
            rankedRow(allocation, EVAL_PLAN).figures.batchLossProbability ?? 0,
        );
    });

    it('never changes the documented figures or sizing the slot reports, whatever the objective', () => {
        const byObjective = [
            SizingObjective.MonthlyNet,
            SizingObjective.CycleCash,
            SizingObjective.RuinFirst,
        ].map((objective) =>
            verified(THREE_PLANS, () =>
                allocate({
                    availableCents: AVAILABLE_CENTS,
                    candidates: candidates(),
                    objective,
                }),
            ),
        );
        const [first] = byObjective;
        if (first === undefined) throw new Error('expected an allocation');
        const baseline = rankedRow(first, EVAL_PLAN).figures.documented;
        for (const allocation of byObjective) {
            expect(rankedRow(allocation, EVAL_PLAN).figures.documented).toEqual(
                baseline,
            );
            expect(
                rankedRow(allocation, EVAL_PLAN).figures.documented.requestSize,
            ).toBe(500);
            expect(
                rankedRow(allocation, EVAL_PLAN).figures.sizingBasis,
            ).toBe(NextSlotSizingBasis.Unsized);
        }
    });

    it('ranks by cycle net under CycleCash', () => {
        const allocation = verified(THREE_PLANS, () =>
            allocate({
                candidates: candidates(),
                objective: SizingObjective.CycleCash,
            }),
        );
        expect(rankedSerials(allocation)).toEqual([
            EVAL_PLAN.serial,
            SAME_FIRM_SECOND_EVAL_PLAN.serial,
            OTHER_FIRM_EVAL_PLAN.serial,
        ]);
    });

    it('shows no batch loss risk without a bankroll and falls back to monthly net among positive-EV plans under RuinFirst', () => {
        const allocation = verified(THREE_PLANS, () =>
            allocate({
                candidates: candidates(),
                objective: SizingObjective.RuinFirst,
            }),
        );
        expect(
            allocation.ranked.map((row) => row.figures.batchLossProbability),
        ).toEqual([null, null, null]);
        expect(rankedSerials(allocation)).toEqual([
            EVAL_PLAN.serial,
            SAME_FIRM_SECOND_EVAL_PLAN.serial,
            OTHER_FIRM_EVAL_PLAN.serial,
        ]);
    });

    it('reports the chance an attempt never pays beside the cycle net', () => {
        const allocation = verified([EVAL_PLAN], () =>
            allocate({ candidates: [candidateOf(EVAL_PLAN, { documented: ready(PAYING) })] }),
        );
        const { figures } = rankedRow(allocation, EVAL_PLAN);
        expect(figures.noPayoutProbability).toBeCloseTo(1 - 0.1 * 0.5, 12);
        expect(figures.cycleNet.value).toBe(200);
    });
});

describe('nextSlotAllocation sizing basis and time efficiency', () => {
    it('labels a documented run with no instrument and stop as unsized and discloses it as optimistic', () => {
        const allocation = verified([EVAL_PLAN], () =>
            allocate({ candidates: [candidateOf(EVAL_PLAN)] }),
        );
        expect(rankedRow(allocation, EVAL_PLAN).figures.sizingBasis).toBe(
            NextSlotSizingBasis.Unsized,
        );
        expect(
            allocation.disclosures.some((text) => text.includes('unsized')),
        ).toBe(true);
    });

    it('labels a run with an instrument and stop as sized at that stop', () => {
        const allocation = verified([EVAL_PLAN], () =>
            allocate({
                candidates: [
                    candidateOf(EVAL_PLAN, {
                        enginePolicy: {
                            ...ENGINE_POLICY,
                            instrument: InstrumentSymbol.MNQ,
                            stopPoints: 20,
                        },
                    }),
                ],
            }),
        );
        expect(rankedRow(allocation, EVAL_PLAN).figures.sizingBasis).toBe(
            NextSlotSizingBasis.InstrumentStop,
        );
    });

    it('shows dollars per screen hour as a second key only when accounts per session and session hours are both set', () => {
        const withHours = verified([EVAL_PLAN], () =>
            allocate({
                bankroll: {
                    ...DEFAULT_RULEBOOK.bankroll,
                    accountsPerSession: 2,
                    sessionHoursPerDay: 4,
                },
                candidates: [candidateOf(EVAL_PLAN, { monthlyNet: 400 })],
            }),
        );
        expect(
            rankedRow(withHours, EVAL_PLAN).figures.netPerScreenHour,
        ).toBeCloseTo((400 * 2) / (TRADING_DAYS_PER_MONTH * 4), 10);
        const without = verified([EVAL_PLAN], () =>
            allocate({
                bankroll: {
                    ...DEFAULT_RULEBOOK.bankroll,
                    accountsPerSession: 2,
                },
                candidates: [candidateOf(EVAL_PLAN)],
            }),
        );
        expect(
            rankedRow(without, EVAL_PLAN).figures.netPerScreenHour,
        ).toBeNull();
    });
});

describe('nextSlotAllocation scale gate', () => {
    const SMALLER_HELD = account(EVAL_PLAN, {
        accountSize: EVAL_PLAN.plan.id.accountSize - 25_000,
    });

    function allocateWithGate(
        gate: NextSlotInputs['scaleGate'],
        held = SMALLER_HELD,
    ) {
        return verified([EVAL_PLAN], () =>
            allocate({
                candidates: [candidateOf(EVAL_PLAN)],
                ledger: ledger({ accounts: [held] }),
                scaleGate: gate,
            }),
        );
    }

    it('marks a size larger than any the user holds at the firm while the scale gate is not ready, with each unmet condition', () => {
        const allocation = allocateWithGate({
            status: ScaleGateStatus.NotEnoughSample,
            unmetConditions: [
                ScaleGateUnmetCondition.FundedAccountsBelowThreshold,
            ],
        });
        expect(rankedRow(allocation, EVAL_PLAN).scaleMark).toEqual({
            mark: NextSlotScaleMark.ScaleGateNotMet,
            unmetConditions: [
                ScaleGateUnmetCondition.FundedAccountsBelowThreshold,
            ],
        });
    });

    it('marks thresholds not set while the user has set no sample thresholds', () => {
        const allocation = allocateWithGate({
            status: ScaleGateStatus.ThresholdsNotSet,
            unmetConditions: [],
        });
        expect(rankedRow(allocation, EVAL_PLAN).scaleMark).toEqual({
            mark: NextSlotScaleMark.ThresholdsNotSet,
            unmetConditions: [],
        });
    });

    it('leaves a plan unmarked when the gate is ready, the size is not larger, or the firm is not held', () => {
        expect(
            rankedRow(
                allocateWithGate({
                    status: ScaleGateStatus.Ready,
                    unmetConditions: [],
                }),
                EVAL_PLAN,
            ).scaleMark,
        ).toBeNull();
        const notReady = {
            status: ScaleGateStatus.NotPositiveAfterCost,
            unmetConditions: [ScaleGateUnmetCondition.PooledNetNotBeyondNoise],
        } as const;
        const sameSize = account(EVAL_PLAN, {
            accountSize: EVAL_PLAN.plan.id.accountSize,
        });
        const sameSizeAllocation = allocateWithGate(notReady, sameSize);
        expect(rankedRow(sameSizeAllocation, EVAL_PLAN).scaleMark).toBeNull();
        const unheld = verified([EVAL_PLAN], () =>
            allocate({
                candidates: [candidateOf(EVAL_PLAN)],
                scaleGate: notReady,
            }),
        );
        expect(rankedRow(unheld, EVAL_PLAN).scaleMark).toBeNull();
    });
});

describe('nextSlotAllocation determinism', () => {
    it('gives the same placement for the same inputs and orders the not-ranked list by firm and plan', () => {
        const inputs = {
            candidates: [
                candidateOf(OTHER_FIRM_EVAL_PLAN),
                candidateOf(SAME_FIRM_SECOND_EVAL_PLAN),
                candidateOf(EVAL_PLAN),
            ],
        };
        const first = allocate(inputs);
        const second = allocate(inputs);
        expect(first.notRanked).toHaveLength(3);
        expect(first).toEqual(second);
        expect(first.notRanked.map((row) => row.firmName)).toEqual(
            first.notRanked.map((row) => row.firmName).toSorted((a, b) =>
                a.localeCompare(b),
            ),
        );
    });

    it('does not mutate its inputs', () => {
        const frozen = Object.freeze([candidateOf(EVAL_PLAN)]);
        const allocation = verified([EVAL_PLAN], () =>
            allocate({ candidates: frozen }),
        );
        expect(allocation.ranked).toHaveLength(1);
        expect(frozen).toHaveLength(1);
    });
});


describe('nextSlotAllocation slots to fill', () => {
    const roomy = { ...DEFAULT_RULEBOOK.bankroll, dailyAccountCapacity: 1000 };

    it('gives a plan with a non-positive expected value per attempt no slots to fill even with spare capacity, and says why', () => {
        const losing = documentedFigures({
            expectedNetPerAttempt: estimate(-20),
            monthlyNet: 900,
        });
        const allocation = verified(THREE_PLANS, () =>
            allocate({
                bankroll: roomy,
                candidates: [
                    candidateOf(EVAL_PLAN, { documented: ready(losing) }),
                    candidateOf(SAME_FIRM_SECOND_EVAL_PLAN, { monthlyNet: 300 }),
                ],
            }),
        );
        expect(rankedSerials(allocation)[0]).toBe(EVAL_PLAN.serial);
        const bad = rankedRow(allocation, EVAL_PLAN);
        expect(bad.isNonPositiveExpectedValue).toBe(true);
        expect(bad.allocatableSlots).toBe(0);
        expect(bad.limitedBy).toBe(NextSlotExclusionReason.NonPositiveExpectedValue);
        const good = rankedRow(allocation, SAME_FIRM_SECOND_EVAL_PLAN);
        expect(good.allocatableSlots).toBe(good.freeSlots);
        expect(good.limitedBy).toBeNull();
    });

    it('gives a plan with a negative documented monthly net no slots to fill', () => {
        const allocation = verified([EVAL_PLAN], () =>
            allocate({
                bankroll: roomy,
                candidates: [candidateOf(EVAL_PLAN, { monthlyNet: -50 })],
            }),
        );
        const row = rankedRow(allocation, EVAL_PLAN);
        expect(row.allocatableSlots).toBe(0);
        expect(row.limitedBy).toBe(NextSlotExclusionReason.NonPositiveExpectedValue);
    });

    it('gives a size whose scale gate is not met, or whose thresholds are not set, no slots to fill', () => {
        const smallerHeld = account(EVAL_PLAN, {
            accountSize: EVAL_PLAN.plan.id.accountSize - 25_000,
        });
        for (const gate of [
            {
                status: ScaleGateStatus.NotEnoughSample,
                unmetConditions: [
                    ScaleGateUnmetCondition.FundedAccountsBelowThreshold,
                ],
            },
            { status: ScaleGateStatus.ThresholdsNotSet, unmetConditions: [] },
        ] as const) {
            const allocation = verified([EVAL_PLAN], () =>
                allocate({
                    candidates: [candidateOf(EVAL_PLAN)],
                    ledger: ledger({ accounts: [smallerHeld] }),
                    scaleGate: gate,
                }),
            );
            const row = rankedRow(allocation, EVAL_PLAN);
            expect(row.scaleMark).not.toBeNull();
            expect(row.allocatableSlots).toBe(0);
            expect(row.limitedBy).toBe(NextSlotExclusionReason.ScaleGateNotMet);
        }
    });

    it('counts the evaluations in progress on a plan beside its free funded slots without changing them', () => {
        const allocation = verified([EVAL_PLAN], () =>
            allocate({
                candidates: [candidateOf(EVAL_PLAN)],
                ledger: ledger({
                    accounts: [
                        account(EVAL_PLAN),
                        account(EVAL_PLAN),
                        account(EVAL_PLAN, { status: AccountStatus.Busted }),
                        ...fundedAccounts(EVAL_PLAN, 1),
                    ],
                }),
            }),
        );
        const row = rankedRow(allocation, EVAL_PLAN);
        expect(row.inFlightEvaluations).toBe(2);
        expect(row.freeSlots).toBe(
            EVAL_PLAN.firm.maxFundedAccounts(EVAL_PLAN.plan) - 1,
        );
    });

    it('discloses that slots to fill is an upper bound filled from the top of the ranking and does not count evaluations in progress', () => {
        const allocation = verified([EVAL_PLAN], () =>
            allocate({ candidates: [candidateOf(EVAL_PLAN)] }),
        );
        expect(allocation.disclosures).toContainEqual(
            containing('upper bound'),
        );
        expect(allocation.disclosures).toContainEqual(
            containing('across firms'),
        );
        expect(allocate({ candidates: [] }).disclosures).not.toContainEqual(
            containing('upper bound'),
        );
    });
});

describe('nextSlotAllocation RuinFirst with a missing batch loss', () => {
    const SAFE = documentedFigures({
        expectedPayoutPerFundedAccount: { standardError: 0, value: 2000 },
        monthlyNet: 100,
    });
    const RISKY = documentedFigures({
        expectedPayoutPerFundedAccount: { standardError: 0, value: 400 },
        monthlyNet: 300,
    });
    const NO_COST = documentedFigures({
        costPerAttempt: estimate(0),
        monthlyNet: 250,
    });
    const AVAILABLE_CENTS = 500_000;

    function rankWith(order: readonly PlanEntry[]) {
        const figures = new Map([
            [EVAL_PLAN.serial, SAFE],
            [OTHER_FIRM_EVAL_PLAN.serial, NO_COST],
            [SAME_FIRM_SECOND_EVAL_PLAN.serial, RISKY],
        ]);
        return rankedSerials(
            verified(THREE_PLANS, () =>
                allocate({
                    availableCents: AVAILABLE_CENTS,
                    candidates: order.map((entry) =>
                        candidateOf(entry, {
                            documented: ready(
                                figures.get(entry.serial) ?? SAFE,
                            ),
                        }),
                    ),
                    objective: SizingObjective.RuinFirst,
                }),
            ),
        );
    }

    it('puts rows with a known loss risk first by that risk and rows with none after them, whatever order the candidates come in', () => {
        expect(expectedLoss(SAFE)).not.toBeNull();
        expect(expectedLoss(RISKY)).not.toBeNull();
        expect(expectedLoss(SAFE) ?? 1).toBeLessThan(expectedLoss(RISKY) ?? 0);
        const expected = [
            EVAL_PLAN.serial,
            SAME_FIRM_SECOND_EVAL_PLAN.serial,
            OTHER_FIRM_EVAL_PLAN.serial,
        ];
        const orders: readonly (readonly PlanEntry[])[] = [
            [EVAL_PLAN, SAME_FIRM_SECOND_EVAL_PLAN, OTHER_FIRM_EVAL_PLAN],
            [EVAL_PLAN, OTHER_FIRM_EVAL_PLAN, SAME_FIRM_SECOND_EVAL_PLAN],
            [SAME_FIRM_SECOND_EVAL_PLAN, EVAL_PLAN, OTHER_FIRM_EVAL_PLAN],
            [SAME_FIRM_SECOND_EVAL_PLAN, OTHER_FIRM_EVAL_PLAN, EVAL_PLAN],
            [OTHER_FIRM_EVAL_PLAN, EVAL_PLAN, SAME_FIRM_SECOND_EVAL_PLAN],
            [OTHER_FIRM_EVAL_PLAN, SAME_FIRM_SECOND_EVAL_PLAN, EVAL_PLAN],
        ];
        for (const order of orders) {
            expect(rankWith(order)).toEqual(expected);
        }
    });
});

describe('nextSlotAllocation batch loss risk', () => {
    const SKEWED = documentedFigures({
        anyPayoutGivenFundedProbability: { standardError: 0, value: 0.5 },
        attemptPassProbability: estimate(1),
        costPerAttempt: estimate(100),
        expectedPayoutPerFundedAccount: { standardError: 0, value: 180 },
        fundedPayoutCountDistribution: [0.5, 0.4, 0, 0, 0, 0.1],
        payoutsPerFundedAccount: { standardError: 0, value: 0.9 },
    });

    it('draws the loss from the spread of payouts per funded account instead of one value for every paying attempt', () => {
        const allocation = verified([EVAL_PLAN], () =>
            allocate({
                availableCents: 40_000,
                candidates: [
                    candidateOf(EVAL_PLAN, { documented: ready(SKEWED) }),
                ],
            }),
        );
        const loss = rankedRow(allocation, EVAL_PLAN).figures.batchLossProbability;
        expect(loss).toBeCloseTo(0.2625, 10);
        expect(loss).not.toBeCloseTo(0.3125, 3);
    });

    it('agrees with the one-value closed form when an account pays at most once', () => {
        const figures = documentedFigures({ monthlyNet: 300 });
        const allocation = verified([EVAL_PLAN], () =>
            allocate({
                availableCents: 500_000,
                candidates: [candidateOf(EVAL_PLAN, { documented: ready(figures) })],
            }),
        );
        expect(
            rankedRow(allocation, EVAL_PLAN).figures.batchLossProbability,
        ).toBeCloseTo(expectedLoss(figures) ?? NaN, 10);
    });

    it('is certain when no attempt can ever pay and the bankroll buys an attempt, and null when the cost is not positive', () => {
        const never = documentedFigures({
            fundedPayoutCountDistribution: [1],
            payoutsPerFundedAccount: { standardError: 0, value: 0 },
        });
        const allocation = verified([EVAL_PLAN], () =>
            allocate({
                availableCents: 40_000,
                candidates: [candidateOf(EVAL_PLAN, { documented: ready(never) })],
            }),
        );
        expect(
            rankedRow(allocation, EVAL_PLAN).figures.batchLossProbability,
        ).toBe(1);
        const free = verified([EVAL_PLAN], () =>
            allocate({
                availableCents: 40_000,
                candidates: [candidateOf(EVAL_PLAN, { documented: costSlot(0) })],
            }),
        );
        expect(
            rankedRow(free, EVAL_PLAN).figures.batchLossProbability,
        ).toBeNull();
    });

    it('discloses that every payout is taken at the average size, so the loss risk is optimistic, only when a loss risk is shown', () => {
        const shown = verified([EVAL_PLAN], () =>
            allocate({
                availableCents: 40_000,
                candidates: [candidateOf(EVAL_PLAN)],
            }),
        );
        expect(shown.disclosures).toContainEqual(containing('average payout'));
        const hidden = verified([EVAL_PLAN], () =>
            allocate({ candidates: [candidateOf(EVAL_PLAN)] }),
        );
        expect(hidden.disclosures).not.toContainEqual(containing('average payout'));
    });
});

describe('nextSlotAllocation payout-size optimum risk', () => {
    it('carries the funded bust probability and the evaluated sizes of the optimum and the funded bust of the documented run', () => {
        const optimum = ready(
            optimumFigures(300, {
                evaluatedSizes: 9,
                fundedBustProbability: estimate(0.82),
            }),
        );
        const allocation = verified([EVAL_PLAN], () =>
            allocate({ candidates: [candidateOf(EVAL_PLAN, { optimum })] }),
        );
        const { figures } = rankedRow(allocation, EVAL_PLAN);
        expect(figures.optimum?.fundedBustProbability.value).toBe(0.82);
        expect(figures.optimum?.evaluatedSizes).toBe(9);
        expect(figures.documentedFundedBust.value).toBe(0.2);
    });

    it('shows the optimum with the same retained cushion the documented run resolved to', () => {
        const allocation = verified([EVAL_PLAN], () =>
            allocate({ candidates: [candidateOf(EVAL_PLAN)] }),
        );
        const { figures } = rankedRow(allocation, EVAL_PLAN);
        expect(figures.optimum?.retainedCushion).toBe(
            figures.documented.retainedCushion,
        );
    });

    it('warns that the optimum can carry a high chance of losing the account when an optimum is shown', () => {
        const allocation = verified([EVAL_PLAN], () =>
            allocate({ candidates: [candidateOf(EVAL_PLAN)] }),
        );
        expect(allocation.disclosures).toContainEqual(
            containing('chance of losing the funded account'),
        );
        expect(allocation.disclosures).toContainEqual(
            containing('share of all simulated attempts'),
        );
    });
});

describe('nextSlotAllocation retained cushion', () => {
    const refs = nextSlotCandidatePlans();
    const atMinimum = refs.find(
        (ref) => ref.plan.defaultRetainedCushion() === 2000,
    );
    const floorBelowMinimum = refs.find(
        (ref) =>
            ref.plan.defaultRetainedCushion() > 0 &&
            ref.plan.defaultRetainedCushion() < 2000,
    );

    it('resolves a requested cushion below the plan floor up to the floor, keeps the request visible and marks it below Hard Rule 2', () => {
        if (floorBelowMinimum === undefined) {
            throw new Error('expected a plan with a floor below $2,000');
        }
        const floor = floorBelowMinimum.plan.defaultRetainedCushion();
        const { documented, isBelowHardRule2 } = rowWith(
            entryOf(floorBelowMinimum),
            floor - 500,
        );
        expect(documented.retainedCushion).toBe(floor);
        expect(documented.requestedCushion).toBe(floor - 500);
        expect(isBelowHardRule2).toBe(true);
    });

    it('carries the Hard Rule 2 minimum in dollars, the figure its below-minimum flag is judged against', () => {
        const allocation = verified([EVAL_PLAN], () =>
            allocate({ candidates: [candidateOf(EVAL_PLAN)] }),
        );
        expect(allocation.hardRule2MinCushion).toBe(
            HARD_RULE_2_MIN_RETAINED_CUSHION_CENTS / 100,
        );
    });

    it('does not mark a cushion at the Hard Rule 2 minimum', () => {
        if (atMinimum === undefined) throw new Error('expected a $2,000 plan');
        const { documented, isBelowHardRule2 } = rowWith(
            entryOf(atMinimum),
            2000,
        );
        expect(documented.retainedCushion).toBe(2000);
        expect(isBelowHardRule2).toBe(false);
        expect(HARD_RULE_2_MIN_RETAINED_CUSHION_CENTS).toBe(200_000);
    });
});

describe('nextSlotAllocation live trigger verdict', () => {
    it('lists a plan whose engine run did not check the live triggers as unverified even when the firm now lists confirmed triggers', () => {
        const allocation = verified([EVAL_PLAN], () =>
            allocate({
                candidates: [
                    candidateOf(EVAL_PLAN, {
                        enginePolicy: {
                            ...ENGINE_POLICY,
                            lifetimePayoutCapBasis:
                                LifetimePayoutCapBasis.LiveTriggersNotChecked,
                        },
                    }),
                ],
            }),
        );
        expect(allocation.ranked).toEqual([]);
        expect(notRankedRow(allocation, EVAL_PLAN).reasons).toEqual([
            expect.objectContaining({
                reason: NextSlotExclusionReason.LiveTriggerUnverified,
            }),
        ]);
    });

    it('does not rank a plan the firm may move live at its discretion, even with a confirmed source', () => {
        const allocation = verified(
            [EVAL_PLAN],
            () => allocate({ candidates: [candidateOf(EVAL_PLAN)] }),
            { triggers: [new DiscretionaryTrigger(CONFIRMED_SOURCE)] },
        );
        expect(allocation.ranked).toEqual([]);
        const row = notRankedRow(allocation, EVAL_PLAN);
        expect(row.kind).toBe(NextSlotListingKind.Unverified);
        expect(row.reasons).toEqual([
            expect.objectContaining({
                reason: NextSlotExclusionReason.LiveTriggerDiscretionary,
            }),
        ]);
        expect(row.reasons[0]?.detail).toContain('discretion');
    });
});

describe('nextSlotPlansNeedingOptimum', () => {
    it('asks only for the plans that pass every check made before the engine runs', () => {
        expect(needing([EVAL_PLAN, OTHER_FIRM_EVAL_PLAN])).toEqual(
            new Set([EVAL_PLAN.serial, OTHER_FIRM_EVAL_PLAN.serial]),
        );
    });

    it('asks for none of the plans of a firm with an unverified cap scope', () => {
        const none = nextSlotPlansNeedingOptimum({
            candidates: [
                {
                    enginePolicy: ENGINE_POLICY,
                    firm: EVAL_PLAN.firm,
                    plan: EVAL_PLAN.plan,
                },
            ],
            ledger: ledger({}),
            today: TODAY,
        });
        expect(none.size).toBe(0);
    });

    it('asks for none of the plans of a paused firm or of a plan with no free slot', () => {
        const paused = ledger({
            firmEngagements: [
                firmEngagement('', '2026-09-01', FirmEngagementStatus.Paused, {
                    externalFirmId: null,
                    firmId: EVAL_PLAN.firm.id,
                    reason: FirmEngagementReason.LowExpectedValue,
                }),
            ],
        });
        expect(needing([EVAL_PLAN], paused).size).toBe(0);
        const full = ledger({
            accounts: fundedAccounts(
                EVAL_PLAN,
                EVAL_PLAN.firm.maxFundedAccounts(EVAL_PLAN.plan),
            ),
        });
        expect(needing([EVAL_PLAN], full).size).toBe(0);
    });
});
