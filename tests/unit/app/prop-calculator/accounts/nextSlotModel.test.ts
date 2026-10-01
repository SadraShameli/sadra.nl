import { describe, expect, it } from 'vitest';

import {
    type DocumentedRunFigures,
    type OverviewOutcome,
    OverviewOutcomeKind,
    type OverviewRequest,
    overviewRequestKey,
    OverviewRequestKind,
    type PayoutSizeOptimumFigures,
} from '~/app/(app)/prop-calculator/_workers/overviewWorkerMessages';
import { type OverviewEngine } from '~/app/(app)/prop-calculator/accounts/_components/overview/overviewModel';
import {
    nextSlotModelOf,
    nextSlotRequestsOf,
} from '~/app/(app)/prop-calculator/accounts/next-slot/nextSlotModel';
import { formatCurrency, formatPercent } from '~/lib/format';
import {
    AccountEventKind,
    AccountStatus,
    BankrollTransferKind,
    FirmEngagementReason,
    FirmEngagementStatus,
} from '~/lib/prop-accounts/core';
import { NextSlotListingKind } from '~/lib/prop-accounts/planning';
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
import { DEFAULT_RULEBOOK } from '~/lib/prop-calculator/advisor';

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

function answerAll(
    overrides: Partial<DocumentedRunFigures> = {},
): Answer {
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

function modelFor(
    options: {
        readonly answer?: Answer;
        readonly ledger?: ReturnType<typeof ledger>;
        readonly rulebook?: typeof DEFAULT_RULEBOOK;
        readonly trades?: number;
    } = {},
) {
    return withAllFirmsVerified(() => {
        const portfolio = options.ledger ?? ledger({});
        const rulebook = options.rulebook ?? DEFAULT_RULEBOOK;
        const requests = nextSlotRequestsOf(portfolio, rulebook, TODAY);
        return nextSlotModelOf({
            engine: engineOf(requests, options.answer ?? answerAll()),
            ledger: portfolio,
            requests,
            rulebook,
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

function withAllFirmsVerified<T>(run: () => T): T {
    const originals = ALL_FIRMS.map((firm) => [firm, firm.accountPolicy] as const);
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
                (firm) => firm.accountPolicy instanceof UnverifiedFirmAccountPolicy,
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
                reason.detail.includes('not rankable: the stop is below one tick'),
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
        const model = modelFor({ answer: answerAll({ minRetainedCushion: 1000 }) });
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
        expect(switching.objectiveNote).toContain('ruin first');
        expect(switching.ranked.length).toBeGreaterThan(0);
        expect(
            switching.ranked.every((row) => row.batchLoss !== 'n/a'),
        ).toBe(true);
        expect(modelFor({ ledger: funded }).objectiveNote).toContain(
            'Objective: monthly net',
        );
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
            free > 2
                ? 'Limited by your daily account capacity.'
                : null,
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
            expect(row.capacityNote).toBe('Limited by your daily account capacity.');
            expect(row.nonPositiveNote).toBeNull();
        }
    });

    it('never says a row is limited by capacity when no daily capacity is set', () => {
        const base = DEFAULT_RULEBOOK.bankroll.dailyAccountCapacity;
        expect(base).toBeNull();
        const scaleGated = modelFor({
            ledger: ledger({
                accounts: [
                    account(EVAL_PLAN, { accountSize: 1, purchasedOn: '2026-09-20' }),
                ],
            }),
        });
        expect(scaleGated.ranked.some((row) => row.scaleNote !== null)).toBe(true);
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
                    account(EVAL_PLAN, { accountSize: 1, purchasedOn: '2026-09-20' }),
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
                row.notes.some((note) => note.includes('evaluation in progress')),
            ),
        ).toBe(true);
    });

    it('lists a plan whose run was refused and a firm you paused, each with its reason, in separate sections', () => {
        const [serial] = nextSlotRequestsOf(ledger({}), DEFAULT_RULEBOOK, TODAY).map(
            (request) => request.planSerial,
        );
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
                    firmEngagement('', '2026-09-01', FirmEngagementStatus.Paused, {
                        externalFirmId: null,
                        firmId: EVAL_PLAN.firm.id,
                        reason: FirmEngagementReason.LowExpectedValue,
                    }),
                ],
            }),
        });
        expect(paused.excluded.length).toBeGreaterThan(0);
        expect(paused.excluded[0]?.reasons[0]).toContain('Paused');
        expect(
            paused.ranked.some((row) => row.firm === EVAL_PLAN.firm.displayName),
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
