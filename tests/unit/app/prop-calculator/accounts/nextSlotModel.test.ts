import { beforeAll, describe, expect, it } from 'vitest';

import {
    type DocumentedRunFigures,
    type OverviewOutcome,
    OverviewOutcomeKind,
    type OverviewRequest,
    OverviewRequestGroup,
    overviewRequestKey,
    OverviewRequestKind,
    type PayoutSizeOptimumFigures,
} from '~/app/(app)/prop-calculator/_workers/overviewWorkerMessages';
import { uniformSlotEngine } from '~/app/(app)/prop-calculator/accounts/_components/overview/engineSlot';
import { type OverviewEngine } from '~/app/(app)/prop-calculator/accounts/_components/overview/overviewModel';
import {
    nextSlotModelOf,
    nextSlotRequestsOf,
} from '~/app/(app)/prop-calculator/accounts/next-slot/nextSlotModel';
import { formatCurrency, formatPercent } from '~/lib/format';
import {
    AccountEventKind,
    AccountStatus,
    AccountTracking,
    BankrollTransferKind,
    FirmEngagementReason,
    FirmEngagementStatus,
} from '~/lib/prop-accounts/core';
import {
    NextSlotListingKind,
    NextSlotSortKey,
} from '~/lib/prop-accounts/planning';
import {
    ALL_FIRMS,
    CumulativeAmountTrigger,
    dollars,
    FirmAccountPolicy,
    PolicySourceKind,
    PolicyVerification,
    serializePlanId,
    UnverifiedFirmAccountPolicy,
} from '~/lib/prop-calculator';
import {
    AssumptionBias,
    AssumptionKind,
    assumptionText,
    type CumulativePayoutTriggerAssumption,
    DEFAULT_RULEBOOK,
    SizingObjective,
} from '~/lib/prop-calculator/advisor';
import { LiveTransferContinuationKind } from '~/lib/prop-calculator/simulator';

import {
    account,
    EVAL_PLAN,
    event,
    firmEngagement,
    ledger,
    transfer,
} from '../../../lib/prop-accounts/metrics/ledgerFixtures';

type Answer = (request: OverviewRequest) => OverviewOutcome | undefined;

const TODAY = '2026-09-30';

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

function answerAll(overrides: Partial<DocumentedRunFigures> = {}): Answer {
    return (request) => ({
        key: overviewRequestKey(request),
        kind: OverviewOutcomeKind.Succeeded,
        result:
            request.kind === OverviewRequestKind.DocumentedRun
                ? {
                      figures: { ...documentedFigures(), ...overrides },
                      kind: OverviewRequestKind.DocumentedRun,
                  }
                : {
                      figures: optimumFigures(),
                      kind: OverviewRequestKind.PayoutSizeOptimum,
                  },
    });
}

function documentedFigures(): DocumentedRunFigures {
    return {
        anyPayoutGivenFundedProbability: { standardError: 0, value: 0.5 },
        attemptPassProbability: estimate(0.3),
        costPerAttempt: estimate(100),
        costPerFundedAccount: 300,
        expectedMonthlyNet: estimate(300),
        expectedMonthlyRealizedNet: estimate(280),
        expectedNetPerAttempt: estimate(50),
        expectedPayoutPerFundedAccount: { standardError: 0, value: 800 },
        fundedBustProbability: estimate(0.2),
        fundedHorizonDays: 120,
        fundedPayoutCountDistribution: [0.5, 0.5],
        fundedSurvivalProbability: estimate(0.55),
        minRetainedCushion: 2000,
        payoutRequestSize: 500,
        payoutsPerFundedAccount: { standardError: 0, value: 0.5 },
        trials: 2000,
    };
}

function engineOf(
    requests: readonly OverviewRequest[],
    answer: Answer,
): OverviewEngine {
    const outcomes = new Map<string, OverviewOutcome>();
    for (const request of requests) {
        const outcome = answer(request);
        if (outcome !== undefined) {
            outcomes.set(overviewRequestKey(request), outcome);
        }
    }
    return { failure: null, outcomes };
}

function estimate(value: number) {
    return { standardError: 1, value };
}

function gradedAnswer(): Answer {
    const order = new Map<string, number>();
    return (request) => {
        const index = order.get(request.planSerial) ?? order.size;
        order.set(request.planSerial, index);
        if (request.kind !== OverviewRequestKind.DocumentedRun) {
            return answerAll()(request);
        }
        return answerAll({
            expectedMonthlyNet: estimate(300 + index),
            expectedMonthlyRealizedNet: estimate(280 + index),
            expectedNetPerAttempt: estimate(500 - index),
        })(request);
    };
}

function keysOf(model: ReturnType<typeof modelFor>): readonly string[] {
    return model.ranked.map((row) => row.key);
}

function modelFor(
    options: {
        readonly answer?: Answer;
        readonly ledger?: ReturnType<typeof ledger>;
        readonly objective?: SizingObjective;
        readonly requests?: readonly OverviewRequest[];
        readonly rulebook?: typeof DEFAULT_RULEBOOK;
        readonly sortKey?: NextSlotSortKey;
        readonly trades?: number;
    } = {},
) {
    return withAllFirmsVerified(() => {
        const portfolio = options.ledger ?? ledger({});
        const rulebook = options.rulebook ?? DEFAULT_RULEBOOK;
        const requests =
            options.requests ?? nextSlotRequestsOf(portfolio, rulebook, TODAY);
        return nextSlotModelOf({
            engine: engineOf(requests, options.answer ?? answerAll()),
            ledger: portfolio,
            objective: options.objective,
            requests,
            rulebook,
            sortKey: options.sortKey,
            today: TODAY,
            trades: options.trades ?? 0,
        });
    });
}

function optimumFigures(): PayoutSizeOptimumFigures {
    return {
        creditSensitive: false,
        evaluatedSizes: 5,
        expectedMonthlyNet: estimate(320),
        expectedMonthlyRealizedNet: estimate(300),
        fundedBustProbability: estimate(0.4),
        requestSize: 750,
    };
}

function perHourOf(model: ReturnType<typeof modelFor>): readonly number[] {
    return model.ranked.map((row) =>
        Number(row.perScreenHour.replaceAll(/[^\d.]/gu, '')),
    );
}

function withAllFirmsVerified<T>(run: () => T): T {
    const originals = ALL_FIRMS.map(
        (firm) => [firm, firm.accountPolicy] as const,
    );
    for (const firm of ALL_FIRMS) {
        (firm as { accountPolicy: FirmAccountPolicy }).accountPolicy =
            new VerifiedPolicy();
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

describe('nextSlotModelOf with an unverified policy', () => {
    const requests = nextSlotRequestsOf(ledger({}), DEFAULT_RULEBOOK, TODAY);

    it('lists every plan of a firm with the unverified default policy and ranks none of them, even with every engine run answered', () => {
        expect(
            ALL_FIRMS.every(
                (firm) =>
                    firm.accountPolicy instanceof UnverifiedFirmAccountPolicy,
            ),
        ).toBe(true);
        const model = nextSlotModelOf({
            engine: engineOf(requests, answerAll()),
            ledger: ledger({}),
            requests,
            rulebook: DEFAULT_RULEBOOK,
            today: TODAY,
            trades: 0,
        });
        expect(model.ranked).toEqual([]);
        expect(model.unverified.length).toBeGreaterThan(0);
        expect(model.computed).toBe(model.requested);
        expect(model.isProvisional).toBe(false);
        const planSerials = new Set(
            ALL_FIRMS.flatMap((firm) =>
                firm.plans.map((plan) => serializePlanId(plan.id)),
            ),
        );
        for (const row of model.unverified) {
            expect(planSerials.has(row.key)).toBe(true);
            expect(row.documentedNet).toContain('$300');
            expect(row.reasons.join(' ')).toContain('live trigger unverified');
        }
    });

    it('lists a plan whose engine run was refused as not rankable with the refusal text', () => {
        const model = nextSlotModelOf({
            engine: engineOf(requests, (request) =>
                request.kind === OverviewRequestKind.DocumentedRun
                    ? {
                          key: overviewRequestKey(request),
                          kind: OverviewOutcomeKind.Failed,
                          reason: 'the stop is below one tick',
                      }
                    : undefined,
            ),
            ledger: ledger({}),
            requests,
            rulebook: DEFAULT_RULEBOOK,
            today: TODAY,
            trades: 0,
        });
        const refused = model.allocation.notRanked.filter((row) =>
            row.reasons.some((reason) =>
                reason.detail.includes(
                    'not rankable: the stop is below one tick',
                ),
            ),
        );
        expect(refused.length).toBeGreaterThan(0);
        expect(
            refused.every((row) => row.kind === NextSlotListingKind.Unverified),
        ).toBe(true);
    });

    it('shows every plan as still computing before any engine run has answered and as provisional', () => {
        const model = nextSlotModelOf({
            engine: { failure: null, outcomes: new Map() },
            ledger: ledger({}),
            requests,
            rulebook: DEFAULT_RULEBOOK,
            today: TODAY,
            trades: 0,
        });
        expect(model.computed).toBe(0);
        expect(model.ranked).toEqual([]);
        expect(model.requested).toBe(requests.length);
        expect(model.isProvisional).toBe(true);
    });
});

function engineWithGroupFailure(
    group: OverviewRequestGroup,
    reason: string,
): OverviewEngine {
    return {
        failure: reason,
        groupFailures: {
            ...uniformSlotEngine(null).groupFailures,
            [group]: reason,
        },
        outcomes: new Map(),
    };
}

function listedReasonsOf(model: ReturnType<typeof verifiedModelWith>): string {
    return [
        ...model.excluded,
        ...model.pending,
        ...model.refused,
        ...model.unverified,
    ]
        .flatMap((row) => row.reasons)
        .join(' ');
}

function verifiedModelWith(engine: OverviewEngine) {
    return withAllFirmsVerified(() => {
        const portfolio = ledger({});
        const requests = nextSlotRequestsOf(portfolio, DEFAULT_RULEBOOK, TODAY);
        return nextSlotModelOf({
            engine,
            ledger: portfolio,
            requests,
            rulebook: DEFAULT_RULEBOOK,
            today: TODAY,
            trades: 0,
        });
    });
}

describe('nextSlotModelOf when one request group of the overview worker failed', () => {
    it('keeps its policy runs pending and shows no failure while only a group it never requests failed', () => {
        const model = verifiedModelWith(
            engineWithGroupFailure(
                OverviewRequestGroup.Values,
                'the values worker crashed',
            ),
        );
        expect(model.engineFailure).toBeNull();
        expect(listedReasonsOf(model)).not.toContain(
            'the values worker crashed',
        );
        expect(model.pending.length).toBeGreaterThan(0);
    });

    it('names a failure of the policy group it requests on the page and on each affected row', () => {
        const model = verifiedModelWith(
            engineWithGroupFailure(
                OverviewRequestGroup.Policy,
                'the policy worker crashed',
            ),
        );
        expect(model.engineFailure).toBe('the policy worker crashed');
        expect(listedReasonsOf(model)).toContain(
            'the engine run failed: the policy worker crashed',
        );
    });
});

describe('nextSlotModelOf ranked rows', () => {
    it('writes a ranked row with its figures, labels, optimum risk and the rebuy lag basis', () => {
        const model = modelFor();
        expect(model.ranked.length).toBeGreaterThan(0);
        expect(model.requested).toBeGreaterThan(model.ranked.length);
        const [first] = model.ranked;
        if (first === undefined) throw new Error('expected a ranked row');
        expect(first.rank).toBe('1');
        expect(first.documentedNet).toBe(
            `${formatCurrency(300)} (SE ${formatCurrency(1)})`,
        );
        expect(first.creditFree).toBe(
            `${formatCurrency(280)} (SE ${formatCurrency(1)})`,
        );
        expect(first.optimumNet).toBe(
            `${formatCurrency(320)} (SE ${formatCurrency(1)})`,
        );
        expect(first.optimumRequest).toBe(formatCurrency(750));
        expect(first.optimumBust).toBe(formatPercent(0.4));
        expect(first.optimumRank).toMatch(/^\d+ of \d+$/);
        expect(first.sizing).toBe('Unsized, optimistic');
        expect(first.labels).toEqual(
            expect.arrayContaining([
                'Fresh start',
                '2,000 trials',
                `Retained cushion ${formatCurrency(2000)} (engine-resolved)`,
                'No live count trigger (verified)',
                'Rebuy lag 0 days (assumed, optimistic)',
            ]),
        );
        expect(first.noPayout).toBe(formatPercent(1 - 0.3 * 0.5));
        expect(first.batchLoss).toBe('n/a');
        expect(first.perScreenHour).toBe('n/a');
    });

    it('says why the optimum differs from the documented request and sets its funded bust against the documented run funded bust', () => {
        const [first] = modelFor().ranked;
        expect(first?.optimumNote).toContain(
            `asks ${formatCurrency(750)} instead of the documented`,
        );
        expect(first?.optimumNote).toContain(
            `${formatPercent(0.4)} of all simulated attempts`,
        );
        expect(first?.optimumNote).toContain(
            `against ${formatPercent(0.2)} of all simulated attempts at the documented request`,
        );
        expect(first?.optimumNote).toContain('funded bust');
        expect(first?.optimumNote).not.toContain('funded bust probability');
        expect(first?.optimumNote).not.toContain('survival');
        expect(first?.optimumNote).toContain('5 sizes tried');
    });

    it('labels a cushion the engine raised to the plan floor with the request it came from, and warns below Hard Rule 2', () => {
        const model = modelFor({
            answer: answerAll({ minRetainedCushion: 1000 }),
        });
        const raised = model.ranked.find((row) =>
            row.labels.some((label) => label.includes('engine-resolved from')),
        );
        expect(raised).toBeDefined();
        expect(
            raised?.labels.some((label) =>
                label.includes(`${formatCurrency(1000)} requested`),
            ),
        ).toBe(true);
        const warned = model.ranked.filter((row) =>
            row.notes.some((note) => note.includes('Hard Rule 2')),
        );
        expect(warned.length).toBeGreaterThan(0);
        for (const row of model.ranked) {
            const isAtMinimum = row.labels.some((label) =>
                label.startsWith(`Retained cushion ${formatCurrency(2000)} `),
            );
            expect(warned.includes(row)).toBe(!isAtMinimum);
        }
    });

    it('applies the bankroll: shows the batch loss risk, switches the objective below the threshold and excludes a plan it cannot afford', () => {
        const funded = ledger({
            transfers: [
                transfer(BankrollTransferKind.Deposit, 1_000_000, '2026-08-01'),
            ],
        });
        const switching = modelFor({
            ledger: funded,
            rulebook: {
                ...DEFAULT_RULEBOOK,
                bankroll: {
                    ...DEFAULT_RULEBOOK.bankroll,
                    objectiveSwitchCents: 5_000_000,
                },
            },
        });
        expect(switching.objective).toBe(SizingObjective.RuinFirst);
        expect(switching.objectiveChoiceNote).toContain('Chosen automatically');
        expect(switching.ranked.length).toBeGreaterThan(0);
        expect(switching.ranked.every((row) => row.batchLoss !== 'n/a')).toBe(
            true,
        );
        const plain = modelFor({ ledger: funded });
        expect(plain.objective).toBe(SizingObjective.MonthlyNet);
        expect(plain.objectiveChoiceNote).toBeNull();
        const broke = modelFor({
            ledger: ledger({
                transfers: [
                    transfer(BankrollTransferKind.Deposit, 5000, '2026-08-01'),
                ],
            }),
        });
        expect(broke.ranked).toEqual([]);
        expect(broke.excluded.length).toBeGreaterThan(0);
        expect(broke.excluded[0]?.reasons.join(' ')).toContain(
            'above your available bankroll',
        );
    });

    it('notes the daily capacity and limits the slots to fill by it', () => {
        const model = modelFor({
            ledger: ledger({
                accounts: [account(EVAL_PLAN, { purchasedOn: '2026-09-20' })],
            }),
            rulebook: {
                ...DEFAULT_RULEBOOK,
                bankroll: {
                    ...DEFAULT_RULEBOOK.bankroll,
                    dailyAccountCapacity: 3,
                },
            },
        });
        expect(model.capacityNote).toBe(
            'Capacity: 1 of 3 daily accounts in use (a copy group counts once), 2 left.',
        );
        const [first] = model.ranked;
        const free = Number(first?.freeSlots);
        expect(first?.allocatable).toBe(String(Math.min(2, free)));
        expect(first?.capacityNote).toBe(
            free > 2 ? 'Limited by your daily account capacity.' : null,
        );
    });

    it('names each slot limit with its own text and blames capacity only for a capacity limit', () => {
        const capacity = {
            ...DEFAULT_RULEBOOK,
            bankroll: {
                ...DEFAULT_RULEBOOK.bankroll,
                dailyAccountCapacity: 1,
            },
        };
        const heldPlan = ledger({
            accounts: [account(EVAL_PLAN, { purchasedOn: '2026-09-20' })],
        });
        const noEv = modelFor({
            answer: answerAll({ expectedNetPerAttempt: estimate(-5) }),
            ledger: heldPlan,
            rulebook: capacity,
        });
        expect(noEv.ranked.length).toBeGreaterThan(0);
        for (const row of noEv.ranked) {
            expect(row.allocatable).toBe('0');
            expect(row.nonPositiveNote).toBe(
                'Expected value per attempt is not positive.',
            );
            expect(row.capacityNote).toBeNull();
        }
        const negativeMonthly = modelFor({
            answer: answerAll({ expectedMonthlyNet: estimate(-10) }),
            ledger: heldPlan,
            rulebook: capacity,
        });
        expect(negativeMonthly.ranked.length).toBeGreaterThan(0);
        for (const row of negativeMonthly.ranked) {
            expect(row.allocatable).toBe('0');
            expect(row.nonPositiveNote).toContain(
                'credit-inclusive monthly net is not positive',
            );
            expect(row.nonPositiveNote).not.toContain('per attempt');
            expect(row.capacityNote).toBeNull();
        }
        const capped = modelFor({ ledger: heldPlan, rulebook: capacity });
        expect(capped.ranked.length).toBeGreaterThan(0);
        for (const row of capped.ranked) {
            expect(row.allocatable).toBe('0');
            expect(row.capacityNote).toBe(
                'Limited by your daily account capacity.',
            );
            expect(row.nonPositiveNote).toBeNull();
        }
    });

    it('never says a row is limited by capacity when no daily capacity is set', () => {
        const base = DEFAULT_RULEBOOK.bankroll.dailyAccountCapacity;
        expect(base).toBeNull();
        const scaleGated = modelFor({
            ledger: ledger({
                accounts: [
                    account(EVAL_PLAN, {
                        accountSize: 1,
                        purchasedOn: '2026-09-20',
                    }),
                ],
            }),
        });
        expect(scaleGated.ranked.some((row) => row.scaleNote !== null)).toBe(
            true,
        );
        const answers = [
            modelFor(),
            scaleGated,
            modelFor({
                answer: answerAll({ expectedNetPerAttempt: estimate(-5) }),
            }),
            modelFor({
                answer: answerAll({ expectedMonthlyNet: estimate(-10) }),
            }),
        ];
        for (const model of answers) {
            expect(model.capacityNote).toBeNull();
            for (const row of model.ranked) {
                expect(row.capacityNote).toBeNull();
            }
        }
    });

    it('marks every larger size of a firm while the scale gate is not ready, with no slots to fill, and counts the evaluations in progress', () => {
        const model = modelFor({
            ledger: ledger({
                accounts: [
                    account(EVAL_PLAN, {
                        accountSize: 1,
                        purchasedOn: '2026-09-20',
                    }),
                ],
            }),
        });
        const marked = model.ranked.filter((row) => row.scaleNote !== null);
        expect(marked.length).toBeGreaterThan(0);
        for (const row of marked) {
            expect(row.scaleNote).toContain('sample thresholds not set');
            expect(row.allocatable).toBe('0');
        }
        expect(
            model.ranked.some((row) =>
                row.notes.some((note) =>
                    note.includes('evaluation in progress'),
                ),
            ),
        ).toBe(true);
    });

    it('lists a plan whose run was refused and a firm you paused, each with its reason, in separate sections', () => {
        const [serial] = nextSlotRequestsOf(
            ledger({}),
            DEFAULT_RULEBOOK,
            TODAY,
        ).map((request) => request.planSerial);
        if (serial === undefined) throw new Error('expected a request');
        const refusing = modelFor({
            answer: (request) =>
                request.planSerial === serial &&
                request.kind === OverviewRequestKind.DocumentedRun
                    ? {
                          key: overviewRequestKey(request),
                          kind: OverviewOutcomeKind.Failed,
                          reason: 'the stop is below one tick',
                      }
                    : answerAll()(request),
        });
        expect(refusing.refused.map((row) => row.key)).toEqual([serial]);
        expect(refusing.refused[0]?.reasons).toEqual([
            'not rankable: the stop is below one tick',
        ]);
        expect(refusing.ranked.map((row) => row.key)).not.toContain(serial);
        const paused = modelFor({
            ledger: ledger({
                firmEngagements: [
                    firmEngagement(
                        '',
                        '2026-09-01',
                        FirmEngagementStatus.Paused,
                        {
                            externalFirmId: null,
                            firmId: EVAL_PLAN.firm.id,
                            reason: FirmEngagementReason.LowExpectedValue,
                        },
                    ),
                ],
            }),
        });
        expect(paused.excluded.length).toBeGreaterThan(0);
        expect(paused.excluded[0]?.reasons[0]).toContain('Paused');
        expect(
            paused.ranked.some(
                (row) => row.firm === EVAL_PLAN.firm.displayName,
            ),
        ).toBe(false);
    });

    it('is provisional until every run has answered and stops being provisional once they all have', () => {
        const partial = modelFor({
            answer: (request) =>
                request.kind === OverviewRequestKind.DocumentedRun
                    ? answerAll()(request)
                    : undefined,
        });
        expect(partial.isProvisional).toBe(true);
        expect(partial.computed).toBeLessThan(partial.requested);
        expect(modelFor().isProvisional).toBe(false);
    });
});

function requestsFor(rulebook: typeof DEFAULT_RULEBOOK) {
    return withAllFirmsVerified(() =>
        nextSlotRequestsOf(ledger({}), rulebook, TODAY),
    );
}

describe('nextSlotModelOf objective override (PT-84, F-V15)', () => {
    const FUNDED_LEDGER = ledger({
        transfers: [
            transfer(BankrollTransferKind.Deposit, 1_000_000, '2026-08-01'),
        ],
    });
    const SWITCHING_RULEBOOK = {
        ...DEFAULT_RULEBOOK,
        bankroll: {
            ...DEFAULT_RULEBOOK.bankroll,
            objectiveSwitchCents: 5_000_000,
        },
    };
    let requests: ReturnType<typeof requestsFor>;
    let automatic: ReturnType<typeof modelFor>;

    beforeAll(() => {
        requests = requestsFor(DEFAULT_RULEBOOK);
        automatic = modelFor({ answer: gradedAnswer(), requests });
    });

    it('orders plans by cycle net under a CycleCash override and says the objective was chosen by the user', () => {
        const cycle = modelFor({
            answer: gradedAnswer(),
            objective: SizingObjective.CycleCash,
            requests,
        });
        expect(automatic.objective).toBe(SizingObjective.MonthlyNet);
        expect(automatic.automaticObjective).toBe(SizingObjective.MonthlyNet);
        expect(cycle.objective).toBe(SizingObjective.CycleCash);
        expect(cycle.allocation.objective).toBe(SizingObjective.CycleCash);
        expect(cycle.objectiveChoiceNote).toBe(
            'Chosen by you. Your bankroll would choose monthly net automatically.',
        );
        expect(automatic.objectiveChoiceNote).toBeNull();
        expect(keysOf(cycle)).toEqual(keysOf(automatic).toReversed());
    });

    it('keeps the automatic objective when none is chosen and says it is automatic', () => {
        const switching = modelFor({
            ledger: FUNDED_LEDGER,
            requests,
            rulebook: SWITCHING_RULEBOOK,
        });
        expect(switching.objective).toBe(SizingObjective.RuinFirst);
        expect(switching.automaticObjective).toBe(SizingObjective.RuinFirst);
        expect(switching.objectiveChoiceNote).toContain('Chosen automatically');
        expect(switching.objectiveChoiceNote).not.toContain('Chosen by you');
        expect(switching.objectiveFallbackNote).toBeNull();
    });

    it('lets the user override the automatic RuinFirst with MonthlyNet and names the automatic choice', () => {
        const overridden = modelFor({
            ledger: FUNDED_LEDGER,
            objective: SizingObjective.MonthlyNet,
            requests,
            rulebook: SWITCHING_RULEBOOK,
        });
        expect(overridden.objective).toBe(SizingObjective.MonthlyNet);
        expect(overridden.automaticObjective).toBe(SizingObjective.RuinFirst);
        expect(overridden.objectiveChoiceNote).toBe(
            'Chosen by you. Your bankroll would choose ruin first automatically.',
        );
    });

    it('keeps monthly net with a typed note when RuinFirst is chosen without a bankroll', () => {
        const ruin = modelFor({
            answer: gradedAnswer(),
            objective: SizingObjective.RuinFirst,
            requests,
        });
        expect(ruin.objective).toBe(SizingObjective.MonthlyNet);
        expect(ruin.allocation.objective).toBe(SizingObjective.MonthlyNet);
        expect(keysOf(ruin)).toEqual(keysOf(automatic));
        expect(ruin.objectiveFallbackNote).toContain('bankroll');
        expect(ruin.objectiveFallbackNote).toContain('monthly net');
        expect(automatic.objectiveFallbackNote).toBeNull();
    });

    it('ranks by batch loss risk when RuinFirst is chosen with a bankroll recorded', () => {
        const ruin = modelFor({
            ledger: FUNDED_LEDGER,
            objective: SizingObjective.RuinFirst,
            requests,
        });
        expect(ruin.objective).toBe(SizingObjective.RuinFirst);
        expect(ruin.objectiveFallbackNote).toBeNull();
        expect(ruin.ranked.every((row) => row.batchLoss !== 'n/a')).toBe(true);
    });
});

describe('nextSlotModelOf sort key (PT-84, F-V25)', () => {
    const HOURS_RULEBOOK = {
        ...DEFAULT_RULEBOOK,
        bankroll: {
            ...DEFAULT_RULEBOOK.bankroll,
            accountsPerSession: 2,
            sessionHoursPerDay: 4,
        },
    };
    const PARTIAL_HOURS_RULEBOOK = {
        ...DEFAULT_RULEBOOK,
        bankroll: {
            ...DEFAULT_RULEBOOK.bankroll,
            accountsPerSession: 2,
            sessionHoursPerDay: null,
        },
    };
    let requests: ReturnType<typeof requestsFor>;

    beforeAll(() => {
        requests = requestsFor(DEFAULT_RULEBOOK);
    });

    it('ranks by net per screen hour when the hour key is chosen and both hours are set', () => {
        const model = modelFor({
            answer: gradedAnswer(),
            objective: SizingObjective.CycleCash,
            requests,
            rulebook: HOURS_RULEBOOK,
            sortKey: NextSlotSortKey.Hour,
        });
        expect(model.isHourKeyAvailable).toBe(true);
        expect(model.sortKey).toBe(NextSlotSortKey.Hour);
        expect(model.sortNote).toContain('net per screen hour');
        const perHour = perHourOf(model);
        expect(perHour.length).toBeGreaterThan(1);
        expect(perHour).toEqual(perHour.toSorted((a, b) => b - a));
        const byObjective = modelFor({
            answer: gradedAnswer(),
            objective: SizingObjective.CycleCash,
            requests,
            rulebook: HOURS_RULEBOOK,
        });
        expect(byObjective.sortKey).toBe(NextSlotSortKey.Objective);
        expect(keysOf(model)).toEqual(keysOf(byObjective).toReversed());
    });

    it('offers no hour key and keeps the objective order while either hours input is missing', () => {
        const requested = modelFor({
            answer: gradedAnswer(),
            objective: SizingObjective.CycleCash,
            requests,
            rulebook: PARTIAL_HOURS_RULEBOOK,
            sortKey: NextSlotSortKey.Hour,
        });
        const plain = modelFor({
            answer: gradedAnswer(),
            objective: SizingObjective.CycleCash,
            requests,
            rulebook: PARTIAL_HOURS_RULEBOOK,
        });
        expect(requested.isHourKeyAvailable).toBe(false);
        expect(requested.sortKey).toBe(NextSlotSortKey.Objective);
        expect(keysOf(requested)).toEqual(keysOf(plain));
        expect(requested.sortNote).not.toContain('net per screen hour');
    });
});

describe('nextSlotModelOf ranking basis disclosure (PT-84, F-V15, F-V25)', () => {
    const CREDIT_BASIS = 'Ranked by the credit-inclusive monthly net';
    const FUNDED_LEDGER = ledger({
        transfers: [
            transfer(BankrollTransferKind.Deposit, 1_000_000, '2026-08-01'),
        ],
    });
    const HOURS_RULEBOOK = {
        ...DEFAULT_RULEBOOK,
        bankroll: {
            ...DEFAULT_RULEBOOK.bankroll,
            accountsPerSession: 2,
            sessionHoursPerDay: 4,
        },
    };
    let requests: ReturnType<typeof requestsFor>;

    beforeAll(() => {
        requests = requestsFor(DEFAULT_RULEBOOK);
    });

    function basisOf(model: ReturnType<typeof modelFor>): string {
        const basis = model.disclosures.find((text) =>
            text.startsWith('Ranked by'),
        );
        if (basis === undefined) throw new Error('expected a ranking basis');
        return basis;
    }

    it('says the order is the credit-inclusive monthly net only under MonthlyNet with the objective key', () => {
        const model = modelFor({ requests });
        expect(model.objective).toBe(SizingObjective.MonthlyNet);
        expect(model.sortKey).toBe(NextSlotSortKey.Objective);
        expect(basisOf(model)).toContain(CREDIT_BASIS);
        expect(basisOf(model)).toContain('command line');
    });

    it('describes the cycle net order under CycleCash instead of the monthly net order', () => {
        const model = modelFor({
            answer: gradedAnswer(),
            objective: SizingObjective.CycleCash,
            requests,
        });
        expect(basisOf(model)).toContain('cycle net');
        expect(basisOf(model)).not.toContain(CREDIT_BASIS);
        expect(basisOf(model)).not.toContain('command line');
    });

    it('describes the batch loss risk order under RuinFirst instead of the monthly net order', () => {
        const model = modelFor({
            ledger: FUNDED_LEDGER,
            objective: SizingObjective.RuinFirst,
            requests,
        });
        expect(model.objective).toBe(SizingObjective.RuinFirst);
        expect(basisOf(model)).toContain('batch loss risk');
        expect(basisOf(model)).not.toContain(CREDIT_BASIS);
    });

    it('keeps the monthly net description when RuinFirst falls back without a bankroll', () => {
        const model = modelFor({
            objective: SizingObjective.RuinFirst,
            requests,
        });
        expect(model.objective).toBe(SizingObjective.MonthlyNet);
        expect(basisOf(model)).toContain(CREDIT_BASIS);
    });

    it('describes the screen hour order under the Hour key, whatever the objective', () => {
        const model = modelFor({
            answer: gradedAnswer(),
            objective: SizingObjective.CycleCash,
            requests,
            rulebook: HOURS_RULEBOOK,
            sortKey: NextSlotSortKey.Hour,
        });
        expect(model.sortKey).toBe(NextSlotSortKey.Hour);
        expect(basisOf(model)).toContain('net per screen hour');
        expect(basisOf(model)).not.toContain(CREDIT_BASIS);
        expect(basisOf(model)).not.toContain('cycle net');
    });

    it('describes the objective order when the Hour key is requested but unavailable', () => {
        const model = modelFor({
            answer: gradedAnswer(),
            objective: SizingObjective.CycleCash,
            requests,
            sortKey: NextSlotSortKey.Hour,
        });
        expect(model.sortKey).toBe(NextSlotSortKey.Objective);
        expect(basisOf(model)).toContain('cycle net');
    });

    it('marks the objective as not applied while the Hour key orders the table, only when the objective differs from monthly net', () => {
        const cycle = modelFor({
            answer: gradedAnswer(),
            objective: SizingObjective.CycleCash,
            requests,
            rulebook: HOURS_RULEBOOK,
            sortKey: NextSlotSortKey.Hour,
        });
        expect(cycle.objectiveNotAppliedNote).toContain('cycle cash');
        expect(cycle.objectiveNotAppliedNote).toContain('monthly net');
        const monthly = modelFor({
            answer: gradedAnswer(),
            requests,
            rulebook: HOURS_RULEBOOK,
            sortKey: NextSlotSortKey.Hour,
        });
        expect(monthly.objectiveNotAppliedNote).toBeNull();
        const objectiveKey = modelFor({
            answer: gradedAnswer(),
            objective: SizingObjective.CycleCash,
            requests,
            rulebook: HOURS_RULEBOOK,
        });
        expect(objectiveKey.objectiveNotAppliedNote).toBeNull();
    });
});

describe('nextSlotModelOf capacity (PT-84, F-V27)', () => {
    it('counts an active ledger-only account in the capacity note and no longer says it is not counted', () => {
        const model = modelFor({
            ledger: ledger({
                accounts: [
                    account(EVAL_PLAN),
                    account(EVAL_PLAN),
                    account(EVAL_PLAN, {
                        planLabel: 'Hola 100K',
                        planSerial: null,
                        tracking: AccountTracking.LedgerOnly,
                    }),
                ],
            }),
            rulebook: {
                ...DEFAULT_RULEBOOK,
                bankroll: {
                    ...DEFAULT_RULEBOOK.bankroll,
                    dailyAccountCapacity: 5,
                },
            },
        });
        expect(model.capacityNote).toBe(
            'Capacity: 3 of 5 daily accounts in use (a copy group counts once), 2 left.',
        );
        expect(model.disclosures.join(' ')).not.toContain(
            'not counted in the slots in use or in your capacity',
        );
    });
});

describe('nextSlotModelOf assumptions', () => {
    it('states the strategy, funded phase, run size, commission and the shared rebuy lag basis behind every figure', () => {
        const { assumptions } = modelFor();
        const text = assumptions.join('\n');
        expect(text).toContain(`${formatPercent(0.4)} win rate`);
        expect(text).toContain('2 to 1 reward to risk');
        expect(text).toContain(`${formatCurrency(250)} risked`);
        expect(text).toContain('Every run simulates 2,000 trials');
        expect(text).toContain('Commission is zero, which is optimistic');
        expect(text).toContain('assumed rebuy lag of 0 days');
        expect(text).toContain('Hard Rule 2');
        expect(text).toContain('PAYOUT SIZING');
    });

    it('states the measured rebuy lag when the ledger has a replacement', () => {
        const prior = account(EVAL_PLAN, {
            purchasedOn: '2026-08-03',
            status: AccountStatus.Busted,
        });
        const replacement = account(EVAL_PLAN, {
            purchasedOn: '2026-08-13',
            replacesAccountId: prior.id,
        });
        const { assumptions } = modelFor({
            ledger: ledger({
                accounts: [prior, replacement],
                events: [event(prior, AccountEventKind.Busted, '2026-08-10')],
            }),
        });
        expect(assumptions.join('\n')).toContain(
            'sample-weighted average measured across your plans',
        );
    });
});

describe('nextSlotModelOf names the cumulative trigger it priced (PT-36r, F-145)', () => {
    const TRIGGER: CumulativePayoutTriggerAssumption = {
        amount: 100_000,
        bias: AssumptionBias.Neutral,
        continuation: LiveTransferContinuationKind.NotModeled,
        kind: AssumptionKind.CumulativePayoutTriggerPriced,
        notes: [],
        source: {
            fetchedOn: '2026-09-01',
            quote: 'a synthetic test quote',
            url: 'https://example.test/policy',
        },
    };

    const answerWithTrigger: Answer = (request) => ({
        key: overviewRequestKey(request),
        kind: OverviewOutcomeKind.Succeeded,
        result:
            request.kind === OverviewRequestKind.DocumentedRun
                ? {
                      figures: {
                          ...documentedFigures(),
                          cumulativePayoutTrigger: TRIGGER,
                      },
                      kind: OverviewRequestKind.DocumentedRun,
                  }
                : {
                      figures: {
                          ...optimumFigures(),
                          cumulativePayoutTrigger: TRIGGER,
                      },
                      kind: OverviewRequestKind.PayoutSizeOptimum,
                  },
    });

    it('lists the trigger behind the documented and the optimum figure of a ranked row', () => {
        const [first] = modelFor({ answer: answerWithTrigger }).ranked;
        expect(first?.liveTransferNotes).toStrictEqual([
            `Documented policy. ${assumptionText(TRIGGER)}`,
            `Payout-size optimum. ${assumptionText(TRIGGER)}`,
        ]);
    });

    it('lists none when no figure priced a trigger', () => {
        const [first] = modelFor().ranked;
        expect(first?.liveTransferNotes).toStrictEqual([]);
    });
});
