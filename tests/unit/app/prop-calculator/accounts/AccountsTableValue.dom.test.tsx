import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type {
    OverviewRequest,
    OverviewResult,
} from '~/app/(app)/prop-calculator/_workers/overviewWorkerMessages';

import {
    type DocumentedRunFigures,
    OverviewRequestKind,
    ValueChainStepOutcomeKind,
} from '~/app/(app)/prop-calculator/_workers/overviewWorkerMessages';
import {
    AccountEventKind,
    AccountStage,
    AccountStatus,
    AccountTracking,
    DashboardBalanceConvention,
    FeeKind,
    usdCents,
} from '~/lib/prop-accounts';
import {
    findFirm,
    FirmId,
    type Plan,
    serializePlanId,
    TopStepVariant,
} from '~/lib/prop-calculator';
import {
    DEFAULT_RULEBOOK,
    type NextPayoutProjection,
    SizingStage,
    StartBasis,
} from '~/lib/prop-calculator/advisor';
import {
    MilestoneKind,
    ValueResultKind,
} from '~/lib/prop-calculator/advisor/value';

import {
    AccountDetailValuesProbe,
    AccountsTable,
    DetailHeaderFiguresWithData,
} from './AccountsTableWithData';

interface FakeQuery {
    data: unknown;
    error: Error | null;
    isError: boolean;
    isPending: boolean;
}

interface ValueFixture {
    readonly days?: number;
    readonly payingTrials?: number;
    readonly value: number;
}

const TODAY = '2026-09-28';
const USER_ID = 'user-a';
const FRESH_EVAL_VALUE = 1000;

const harness = vi.hoisted(() => {
    const queries = new Map<string, FakeQuery>();
    const pending: FakeQuery = {
        data: undefined,
        error: null,
        isError: false,
        isPending: true,
    };
    return {
        failure: null as null | string,
        mutation: () => ({
            useMutation: () => ({ isPending: false, mutate: vi.fn() }),
        }),
        queries,
        query: (name: string) => ({
            useQuery: () => queries.get(name) ?? pending,
        }),
        resultFor: (_request: OverviewRequest): null | OverviewResult => null,
    };
});

vi.mock('next/navigation', () => ({
    usePathname: () => '/prop-calculator/accounts',
    useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
    useSearchParams: () => new URLSearchParams(),
}));

vi.mock('~/app/(app)/prop-calculator/_components/useTodayIsoDate', () => ({
    useTodayIsoDate: () => '2026-09-28',
}));

vi.mock(
    '~/app/(app)/prop-calculator/accounts/_components/overview/useOverviewWorker',
    async () => {
        const messages =
            await import('~/app/(app)/prop-calculator/_workers/overviewWorkerMessages');
        return {
            useOverviewWorker: (requests: readonly OverviewRequest[]) => ({
                failure: harness.failure,
                outcomes: new Map(
                    requests.flatMap((request) => {
                        const result = harness.resultFor(request);
                        const key = messages.overviewRequestKey(request);
                        return result === null
                            ? []
                            : [
                                  [
                                      key,
                                      {
                                          key,
                                          kind: messages.OverviewOutcomeKind
                                              .Succeeded,
                                          result,
                                      },
                                  ] as const,
                              ];
                    }),
                ),
            }),
        };
    },
);

vi.mock('~/trpc/react', () => ({
    api: {
        propAccounts: {
            account: {
                archive: harness.mutation(),
                list: harness.query('account.list'),
                remove: harness.mutation(),
                unarchive: harness.mutation(),
            },
            bankroll: { list: harness.query('bankroll.list') },
            copyGroup: { list: harness.query('copyGroup.list') },
            decision: { list: harness.query('decision.list') },
            event: { list: harness.query('event.list') },
            externalFirm: { list: harness.query('externalFirm.list') },
            fee: { list: harness.query('fee.list') },
            payout: { list: harness.query('payout.list') },
            rulebook: { get: harness.query('rulebook.get') },
            snapshot: {
                latestForAll: harness.query('snapshot.latestForAll'),
                latestTwoForAll: harness.query('snapshot.latestForAll'),
            },
            violation: { list: harness.query('violation.list') },
        },
        useUtils: () => ({
            propAccounts: {
                account: { get: { cancel: vi.fn() }, invalidate: vi.fn() },
                invalidate: vi.fn(),
            },
        }),
    },
}));

function topStep(): Plan {
    const plan = findFirm(FirmId.TopStep)?.findPlan({
        accountSize: 50_000,
        firm: FirmId.TopStep,
        variant: TopStepVariant.StandardStandard,
    });
    if (!plan) throw new Error('TopStep 50K plan missing');
    return plan;
}

const PLAN = topStep();
const RETRY_FEE = PLAN.retryFee();

function answer(data: unknown): FakeQuery {
    return { data, error: null, isError: false, isPending: false };
}

function answerEverything(
    accounts: readonly Record<string, unknown>[],
    snapshots: readonly ReturnType<typeof snapshotOf>[],
    fees: readonly Record<string, unknown>[] = [],
    laterEvents: readonly Record<string, unknown>[] = [],
) {
    harness.queries.set('account.list', answer(accounts));
    harness.queries.set('bankroll.list', answer([]));
    harness.queries.set('copyGroup.list', answer([]));
    harness.queries.set('decision.list', answer([]));
    harness.queries.set(
        'event.list',
        answer([
            ...accounts.map((row) => ({
                accountId: row.id,
                createdAt: new Date('2026-09-01T12:00:00Z'),
                id: `event-${String(row.id)}`,
                kind: AccountEventKind.Purchased,
                occurredOn: row.purchasedOn,
                userId: USER_ID,
            })),
            ...laterEvents,
        ]),
    );
    harness.queries.set('externalFirm.list', answer([]));
    harness.queries.set('fee.list', answer(fees));
    harness.queries.set('payout.list', answer([]));
    harness.queries.set('rulebook.get', answer(DEFAULT_RULEBOOK));
    harness.queries.set('snapshot.latestForAll', answer(snapshots));
    harness.queries.set('violation.list', answer([]));
}

function captureRequests() {
    const requested: OverviewRequest[] = [];
    harness.resultFor = (request) => {
        requested.push(request);
        return null;
    };
    return requested;
}

function documentedFigures(): DocumentedRunFigures {
    return {
        anyPayoutGivenFundedProbability: { standardError: 0.01, value: 0.4 },
        attemptPassProbability: { standardError: 0.02, value: 0.3 },
        costPerAttempt: { standardError: 1, value: 120 },
        costPerFundedAccount: 777,
        expectedMonthlyNet: { standardError: 11, value: 1234 },
        expectedMonthlyRealizedNet: { standardError: 9, value: 1111 },
        expectedNetPerAttempt: { standardError: 5, value: 55 },
        expectedPayoutPerFundedAccount: { standardError: 20, value: 900 },
        fundedBustProbability: { standardError: 0.02, value: 0.2 },
        fundedHorizonDays: 252,
        fundedPayoutCountDistribution: [0.6, 0.2, 0.1, 0.05, 0.03, 0.02],
        fundedSurvivalProbability: { standardError: 0.03, value: 0.55 },
        minRetainedCushion: 2750,
        payoutRequestSize: 1250,
        payoutsPerFundedAccount: { standardError: 0.1, value: 1.5 },
        trials: 2000,
    };
}

function fundedAccount(id: string, label: string) {
    return modeledAccount(id, label, {
        firstFundedTradeOn: '2026-08-03',
        fundedOn: '2026-08-03',
        stage: AccountStage.Funded,
    });
}

function ledgerOnlyAccount(id: string, label: string) {
    return modeledAccount(id, label, {
        accountSize: 150_000,
        externalFirmId: '5d1e2f3a-4b5c-4d6e-8f70-81a2b3c4d5e6',
        firmId: null,
        planLabel: 'Hola 150K',
        planSerial: null,
        stage: AccountStage.Funded,
        tracking: AccountTracking.LedgerOnly,
    });
}

function maxRiskOf(request: OverviewRequest | undefined) {
    return request?.spec.enginePolicy.personalCaps?.maxRiskPerTrade;
}

function modeledAccount(
    id: string,
    label: string,
    overrides: Record<string, unknown> = {},
) {
    return {
        accountSize: PLAN.id.accountSize,
        archivedAt: null,
        copyGroupId: null,
        dashboardConvention: DashboardBalanceConvention.Nominal,
        externalFirmId: null,
        firmId: FirmId.TopStep,
        firstFundedTradeOn: null,
        fundedOn: null,
        id,
        label,
        liveStartBalanceCents: null,
        notes: null,
        optIns: {},
        planLabel: null,
        planSerial: serializePlanId(PLAN.id),
        purchasedOn: '2026-09-01',
        readIssues: [],
        replacesAccountId: null,
        stage: AccountStage.Eval,
        status: AccountStatus.Active,
        tags: [],
        tracking: AccountTracking.Modeled,
        userId: USER_ID,
        ...overrides,
    };
}

function projection(days: number, payingTrials = 2000): NextPayoutProjection {
    return {
        accountLostBeforeFirstPayoutProbability: 0.1,
        accountLostBeforeFirstPayoutStandardError: 0.01,
        alreadyEligible: false,
        expectedCalendarDaysToFirstPayout: { standardError: 0.4, value: days },
        expectedResetFeeBeforeFirstPayout: { standardError: 1, value: 0 },
        expectedSessionDaysToFirstPayout: {
            standardError: 0.3,
            value: (days * 5) / 7,
        },
        firstPayoutCausedBreachProbability: 0.02,
        firstPayoutCausedBreachStandardError: 0.01,
        payingTrials,
        trials: 2000,
    };
}

function requestsOfKind(
    requested: readonly OverviewRequest[],
    kind: OverviewRequestKind,
) {
    return requested.filter((request) => request.kind === kind);
}

function snapshotOf(
    accountId: string,
    balance: number,
    asOf = TODAY,
    overrides: Record<string, unknown> = {},
) {
    return {
        accountId,
        asOf,
        balanceAtLastPayoutCents: null,
        balanceCents: usdCents(balance * 100),
        createdAt: new Date(`${asOf}T12:00:00Z`),
        cumulativePayoutCents: null,
        cycleBestDayProfitCents: null,
        dashboardFloorCents: null,
        evalBestDayProfitCents: null,
        floorAtLastPayoutCents: null,
        highestEodBalanceCents: usdCents(Math.max(balance, 50_000) * 100),
        highestIntradayBalanceCents: usdCents(Math.max(balance, 50_000) * 100),
        id: `snapshot-${accountId}-${asOf}`,
        lastPayoutOn: null,
        lastTradedOn: null,
        payoutsTaken: null,
        qualifyingDaysSinceLastPayout: null,
        tradingDays: null,
        userId: USER_ID,
        ...overrides,
    };
}

function useValues(table: ReadonlyMap<string, ValueFixture>) {
    harness.resultFor = (request) => {
        switch (request.kind) {
            case OverviewRequestKind.AccountFromState: {
                const { account } = request;
                if (account === undefined) return null;
                const fixture = table.get(
                    valueKey(
                        account.stage === SizingStage.Eval
                            ? SizingStage.Eval
                            : SizingStage.Funded,
                        account.balance,
                    ),
                );
                if (fixture === undefined) return null;
                return {
                    figures: {
                        milestone: {
                            debited: null,
                            kind: MilestoneKind.Eval,
                            received: null,
                            unmetGates: [],
                            value: {
                                kind: ValueChainStepOutcomeKind.Value,
                                value: valueOf(fixture.value + 500),
                            },
                        },
                        nextPayout:
                            account.stage === SizingStage.Eval ||
                            fixture.days === undefined
                                ? null
                                : projection(
                                      fixture.days,
                                      fixture.payingTrials,
                                  ),
                        stage:
                            account.stage === SizingStage.Eval
                                ? SizingStage.Eval
                                : SizingStage.Funded,
                        startBasis: StartBasis.FromState,
                        trials: 2000,
                        valueNow: valueOf(fixture.value),
                    },
                    kind: OverviewRequestKind.AccountFromState,
                };
            }
            case OverviewRequestKind.DocumentedRun: {
                return {
                    figures: documentedFigures(),
                    kind: OverviewRequestKind.DocumentedRun,
                };
            }
            case OverviewRequestKind.PayoutSizeOptimum:
            case OverviewRequestKind.PortfolioProjection:
            case OverviewRequestKind.RetireComparison:
            case OverviewRequestKind.ValueChain: {
                return null;
            }
            case OverviewRequestKind.PlanValues: {
                return {
                    figures: {
                        freshFundedValue: valueOf(2000),
                        retryFee: RETRY_FEE,
                        trials: 2000,
                        valueFreshEval: valueOf(FRESH_EVAL_VALUE),
                    },
                    kind: OverviewRequestKind.PlanValues,
                };
            }
        }
    };
}

function valueKey(stage: SizingStage, balance: number): string {
    return `${stage}:${String(balance)}`;
}

function valueOf(creditFree: number) {
    return {
        creditFree: { standardError: 70, value: creditFree },
        creditInclusive: { standardError: 70, value: creditFree + 150 },
        kind: ValueResultKind.Value as const,
        seed: 42,
        trials: 2000,
    };
}

describe('account list and detail header lead with value and next action (PT-68)', () => {
    let container: HTMLDivElement;
    let root: Root;

    function render(node: React.ReactNode) {
        act(() => {
            root.render(node);
        });
    }

    function rowOf(label: string): HTMLElement {
        const row = [
            ...container.querySelectorAll<HTMLElement>(':scope tbody tr'),
        ].find(
            (candidate) => candidate.querySelector('a')?.textContent === label,
        );
        if (row === undefined) throw new Error(`no row for ${label}`);
        return row;
    }

    function rowLabels(): readonly string[] {
        return [...container.querySelectorAll(':scope tbody tr')].map(
            (row) => row.querySelector('a')?.textContent ?? '',
        );
    }

    function headers(): readonly string[] {
        return [...container.querySelectorAll(':scope thead th')].map(
            (header) => header.textContent,
        );
    }

    beforeEach(() => {
        vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
        harness.queries.clear();
        harness.failure = null;
        harness.resultFor = () => null;
        container = document.createElement('div');
        document.body.append(container);
        root = createRoot(container);
    });

    afterEach(() => {
        act(() => {
            root.unmount();
        });
        document.body.replaceChildren();
        vi.unstubAllGlobals();
    });

    describe('AccountsTable', () => {
        it('leads with expected payouts and the next payout, ahead of the balance', () => {
            answerEverything(
                [fundedAccount('alpha', 'Alpha')],
                [snapshotOf('alpha', 52_000)],
            );
            useValues(
                new Map([
                    [
                        valueKey(SizingStage.Funded, 52_000),
                        { days: 3, value: 2500 },
                    ],
                ]),
            );
            render(<AccountsTable userId={USER_ID} />);
            const names = headers();
            const expected = names.indexOf('Expected payouts');
            const next = names.indexOf('Next payout');
            const balance = names.indexOf('Balance');
            expect(expected).toBeGreaterThan(-1);
            expect(next).toBeGreaterThan(expected);
            expect(balance).toBeGreaterThan(next);
            expect(names).toContain('Next action');
        });

        it('shows different expected payouts for two accounts with the same balance at different stages (V-70)', () => {
            answerEverything(
                [
                    modeledAccount('eval', 'Eval account'),
                    fundedAccount('funded', 'Funded account'),
                ],
                [snapshotOf('eval', 52_000), snapshotOf('funded', 52_000)],
            );
            useValues(
                new Map([
                    [valueKey(SizingStage.Eval, 52_000), { value: 1200 }],
                    [
                        valueKey(SizingStage.Funded, 52_000),
                        { days: 12, value: 2500 },
                    ],
                ]),
            );
            render(<AccountsTable userId={USER_ID} />);
            expect(rowOf('Eval account').textContent).toContain(
                '$1,200 (SE $70)',
            );
            expect(rowOf('Funded account').textContent).toContain(
                '$2,500 (SE $70)',
            );
            expect(rowOf('Eval account').textContent).not.toContain('$2,500');
        });

        it('orders the list by expected payouts, highest first, by default', () => {
            answerEverything(
                [
                    modeledAccount('low', 'Mike low'),
                    fundedAccount('high', 'Zulu high'),
                    modeledAccount('none', 'Alpha unvalued'),
                ],
                [snapshotOf('low', 50_500), snapshotOf('high', 52_000)],
            );
            useValues(
                new Map([
                    [valueKey(SizingStage.Eval, 50_500), { value: 1100 }],
                    [
                        valueKey(SizingStage.Funded, 52_000),
                        { days: 9, value: 2500 },
                    ],
                ]),
            );
            render(<AccountsTable userId={USER_ID} />);
            expect(rowLabels()).toEqual([
                'Zulu high',
                'Mike low',
                'Alpha unvalued',
            ]);
        });

        it('highlights a next payout inside the window and not one beyond it', () => {
            answerEverything(
                [
                    fundedAccount('soon', 'Soon'),
                    fundedAccount('later', 'Later'),
                ],
                [snapshotOf('soon', 52_000), snapshotOf('later', 53_000)],
            );
            useValues(
                new Map([
                    [
                        valueKey(SizingStage.Funded, 52_000),
                        { days: 3.4, value: 2500 },
                    ],
                    [
                        valueKey(SizingStage.Funded, 53_000),
                        { days: 40, value: 2400 },
                    ],
                ]),
            );
            render(<AccountsTable userId={USER_ID} />);
            expect(
                rowOf('Soon').querySelector('[data-soon="true"]')?.textContent,
            ).toBe('3.4 calendar days (SE 0.4)');
            expect(rowOf('Later').querySelector('[data-soon]')).toBeNull();
            expect(rowOf('Later').textContent).toContain(
                '40.0 calendar days (SE 0.4)',
            );
        });

        it('highlights a next payout by the window set in the rulebook, and names that window in the note (PT-68b)', () => {
            answerEverything(
                [fundedAccount('soon', 'Soon'), fundedAccount('mid', 'Mid')],
                [snapshotOf('soon', 52_000), snapshotOf('mid', 53_000)],
            );
            harness.queries.set(
                'rulebook.get',
                answer({
                    ...DEFAULT_RULEBOOK,
                    display: {
                        ...DEFAULT_RULEBOOK.display,
                        nextPayoutHighlightDays: 3,
                    },
                }),
            );
            useValues(
                new Map([
                    [
                        valueKey(SizingStage.Funded, 52_000),
                        { days: 2.5, value: 2500 },
                    ],
                    [
                        valueKey(SizingStage.Funded, 53_000),
                        { days: 5, value: 2400 },
                    ],
                ]),
            );
            render(<AccountsTable userId={USER_ID} />);
            expect(
                rowOf('Soon').querySelector('[data-soon="true"]')?.textContent,
            ).toBe('2.5 calendar days (SE 0.4)');
            expect(rowOf('Mid').querySelector('[data-soon]')).toBeNull();
            expect(rowOf('Mid').textContent).toContain('5.0 calendar days');
            expect(container.getHTML()).toContain(
                'within 3 calendar days and at least 50.0% of the simulated trials reach one',
            );
        });

        it('says what to do next with each account and never offers to retire one', () => {
            answerEverything(
                [
                    fundedAccount('fresh', 'Fresh funded'),
                    fundedAccount('stale', 'Stale funded'),
                    modeledAccount('bare', 'No snapshot'),
                ],
                [
                    snapshotOf('fresh', 52_000),
                    snapshotOf('stale', 52_000, '2026-08-01'),
                ],
            );
            useValues(
                new Map([
                    [
                        valueKey(SizingStage.Funded, 52_000),
                        { days: 9, value: 2500 },
                    ],
                ]),
            );
            render(<AccountsTable userId={USER_ID} />);
            expect(rowOf('Fresh funded').textContent).toContain(
                'Trade at the documented rung',
            );
            expect(rowOf('Stale funded').textContent).toContain(
                "Enter today's balance",
            );
            expect(rowOf('No snapshot').textContent).toContain(
                "Enter today's balance",
            );
            expect(rowOf('No snapshot').textContent).toContain('Not valued');
            expect(container.textContent).not.toContain('Retire this account');
        });

        it('shows a ledger-only account as not valued, with its reason, and as not modeled', () => {
            answerEverything(
                [
                    ledgerOnlyAccount('hola', 'Hola'),
                    fundedAccount('alpha', 'Alpha'),
                ],
                [snapshotOf('alpha', 52_000)],
            );
            useValues(
                new Map([
                    [
                        valueKey(SizingStage.Funded, 52_000),
                        { days: 9, value: 2500 },
                    ],
                ]),
            );
            render(<AccountsTable userId={USER_ID} />);
            const text = rowOf('Hola').textContent;
            expect(text).toContain('Not valued');
            expect(text).toContain('Ledger only: the engine does not model');
            expect(text).toContain('Not modeled for this account');
        });

        it('shows a fresh eval at risk if busted for exactly its retry fee', () => {
            answerEverything(
                [modeledAccount('fresh', 'Fresh eval')],
                [snapshotOf('fresh', 50_000)],
            );
            useValues(
                new Map([
                    [
                        valueKey(SizingStage.Eval, 50_000),
                        { value: FRESH_EVAL_VALUE },
                    ],
                ]),
            );
            render(<AccountsTable userId={USER_ID} />);
            expect(rowOf('Fresh eval').textContent).toContain(
                `At risk if busted: $${RETRY_FEE.toLocaleString('en-US')}`,
            );
        });

        it('shows an in-progress eval worth more than a fresh one at risk for more than the retry fee', () => {
            answerEverything(
                [modeledAccount('progress', 'Progress eval')],
                [snapshotOf('progress', 51_500)],
            );
            useValues(
                new Map([
                    [valueKey(SizingStage.Eval, 51_500), { value: 1400 }],
                ]),
            );
            render(<AccountsTable userId={USER_ID} />);
            expect(rowOf('Progress eval').textContent).toContain(
                `At risk if busted: $${(400 + RETRY_FEE).toLocaleString('en-US')}`,
            );
        });

        it('never shows the sum of the fees already paid as the amount at risk', () => {
            const paid = [
                [FeeKind.EvalPurchase, 15_000],
                [FeeKind.Activation, 13_000],
                [FeeKind.Reset, 8000],
                [FeeKind.Reset, 9100],
            ] as const;
            const paidTotal = paid.reduce((sum, [, cents]) => sum + cents, 0);
            expect(paidTotal / 100).not.toBe(RETRY_FEE);
            answerEverything(
                [modeledAccount('paid', 'Paid fees eval')],
                [snapshotOf('paid', 50_000)],
                paid.map(([kind, cents], index) => ({
                    accountId: 'paid',
                    amountCents: usdCents(cents),
                    id: `fee-${String(index)}`,
                    kind,
                    paidOn: '2026-09-05',
                    userId: USER_ID,
                })),
            );
            useValues(
                new Map([
                    [
                        valueKey(SizingStage.Eval, 50_000),
                        { value: FRESH_EVAL_VALUE },
                    ],
                ]),
            );
            render(<AccountsTable userId={USER_ID} />);
            const text = rowOf('Paid fees eval').textContent;
            expect(text).toContain(
                `At risk if busted: $${RETRY_FEE.toLocaleString('en-US')}`,
            );
            expect(text).not.toContain(
                `$${(paidTotal / 100).toLocaleString('en-US')}`,
            );
        });

        it('falls back to at least the retry fee while the worker values are missing', () => {
            answerEverything(
                [modeledAccount('slow', 'Slow eval')],
                [snapshotOf('slow', 51_500)],
            );
            render(<AccountsTable userId={USER_ID} />);
            expect(rowOf('Slow eval').textContent).toContain(
                `at least $${RETRY_FEE.toLocaleString('en-US')} (the retry fee; exact only at a fresh eval)`,
            );
        });

        it('shows the EV per attempt of an eval account, labelled modeled and not the ranking objective', () => {
            answerEverything(
                [modeledAccount('fresh', 'Fresh eval')],
                [snapshotOf('fresh', 50_000)],
            );
            useValues(
                new Map([
                    [
                        valueKey(SizingStage.Eval, 50_000),
                        { value: FRESH_EVAL_VALUE },
                    ],
                ]),
            );
            render(<AccountsTable userId={USER_ID} />);
            const text = rowOf('Fresh eval').textContent;
            expect(text).toContain('EV per attempt: $55 (SE $5)');
            expect(text).toContain('Pass rate: modeled');
            expect(text).toContain('not the ranking objective');
        });

        it('uses the realized pass rate in the EV per attempt once its sample threshold is met, and labels it', () => {
            const busts = ['f1', 'f2', 'f3'];
            answerEverything(
                [
                    modeledAccount('live', 'Live eval'),
                    fundedAccount('p1', 'Passed'),
                    ...busts.map((id) =>
                        modeledAccount(id, `Bust ${id}`, {
                            status: AccountStatus.Busted,
                        }),
                    ),
                ],
                [snapshotOf('live', 50_000)],
                [],
                [
                    {
                        accountId: 'p1',
                        createdAt: new Date('2026-09-10T12:00:00Z'),
                        id: 'event-p1-passed',
                        kind: AccountEventKind.EvalPassed,
                        occurredOn: '2026-09-10',
                        userId: USER_ID,
                    },
                    ...busts.map((id) => ({
                        accountId: id,
                        createdAt: new Date('2026-09-12T12:00:00Z'),
                        id: `event-${id}-busted`,
                        kind: AccountEventKind.Busted,
                        occurredOn: '2026-09-12',
                        userId: USER_ID,
                    })),
                ],
            );
            harness.queries.set(
                'rulebook.get',
                answer({
                    ...DEFAULT_RULEBOOK,
                    samples: {
                        ...DEFAULT_RULEBOOK.samples,
                        minEvalAttempts: 3,
                    },
                }),
            );
            useValues(
                new Map([
                    [
                        valueKey(SizingStage.Eval, 50_000),
                        { value: FRESH_EVAL_VALUE },
                    ],
                ]),
            );
            render(<AccountsTable userId={USER_ID} />);
            const text = rowOf('Live eval').textContent;
            expect(text).toContain('EV per attempt: $105');
            expect(text).toContain('Pass rate: realized, n = 4');
            expect(text).toContain('Funded value: engine');
        });

        it('discloses the share of trials that reach a payout and withholds the highlight when most do not', () => {
            answerEverything(
                [
                    fundedAccount('likely', 'Likely'),
                    fundedAccount('unlikely', 'Unlikely'),
                ],
                [snapshotOf('likely', 52_000), snapshotOf('unlikely', 53_000)],
            );
            useValues(
                new Map([
                    [
                        valueKey(SizingStage.Funded, 52_000),
                        { days: 3.4, payingTrials: 1600, value: 2500 },
                    ],
                    [
                        valueKey(SizingStage.Funded, 53_000),
                        { days: 3.4, payingTrials: 600, value: 2400 },
                    ],
                ]),
            );
            render(<AccountsTable userId={USER_ID} />);
            expect(
                rowOf('Likely').querySelector('[data-soon="true"]'),
            ).not.toBeNull();
            expect(rowOf('Likely').textContent).toContain(
                '1,600 of 2,000 trials reached a payout',
            );
            expect(rowOf('Unlikely').querySelector('[data-soon]')).toBeNull();
            expect(rowOf('Unlikely').textContent).toContain(
                '3.4 calendar days (SE 0.4)',
            );
            expect(rowOf('Unlikely').textContent).toContain(
                '600 of 2,000 trials reached a payout',
            );
            expect(rowOf('Unlikely').textContent).toContain(
                'Account lost before the first payout: 10.0% (SE 1.0%)',
            );
        });

        it('sends the personal payout override and retained cushion into the from-state request, and only for the account that has them', () => {
            const requests: OverviewRequest[] = [];
            answerEverything(
                [
                    modeledAccount('personal', 'Personal rules', {
                        firstFundedTradeOn: '2026-08-03',
                        fundedOn: '2026-08-03',
                        personalRules: {
                            payoutRequestOverrideCents: usdCents(120_000),
                            retainedCushionCents: usdCents(500_000),
                        },
                        stage: AccountStage.Funded,
                    }),
                    fundedAccount('plain', 'Plain rules'),
                ],
                [snapshotOf('personal', 52_000), snapshotOf('plain', 53_000)],
            );
            harness.resultFor = (request) => {
                requests.push(request);
                return null;
            };
            render(<AccountsTable userId={USER_ID} />);
            const policyOf = (balance: number) =>
                requests.find(
                    (request) =>
                        request.kind === OverviewRequestKind.AccountFromState &&
                        request.account?.balance === balance,
                )?.spec.enginePolicy;
            expect(policyOf(52_000)).toMatchObject({
                payoutRequestOverride: 1200,
                retainedCushionRequest: 5000,
            });
            const plain = policyOf(53_000);
            expect(plain?.payoutRequestOverride).not.toBe(1200);
            expect(plain?.retainedCushionRequest).not.toBe(5000);
        });

        it('keeps the order stable until every account is valued, then ranks by value', () => {
            answerEverything(
                [fundedAccount('a', 'Alpha'), fundedAccount('z', 'Zulu')],
                [snapshotOf('a', 52_000), snapshotOf('z', 53_000)],
            );
            useValues(
                new Map([
                    [
                        valueKey(SizingStage.Funded, 53_000),
                        { days: 9, value: 2500 },
                    ],
                ]),
            );
            render(<AccountsTable userId={USER_ID} />);
            expect(rowLabels()).toEqual(['Alpha', 'Zulu']);

            useValues(
                new Map([
                    [
                        valueKey(SizingStage.Funded, 52_000),
                        { days: 9, value: 900 },
                    ],
                    [
                        valueKey(SizingStage.Funded, 53_000),
                        { days: 9, value: 2500 },
                    ],
                ]),
            );
            render(<AccountsTable userId={USER_ID} />);
            expect(rowLabels()).toEqual(['Zulu', 'Alpha']);
        });

        it('keeps the table cells as cells while values compute and announces the work once', () => {
            answerEverything(
                [fundedAccount('a', 'Alpha'), fundedAccount('z', 'Zulu')],
                [snapshotOf('a', 52_000), snapshotOf('z', 53_000)],
            );
            render(<AccountsTable userId={USER_ID} />);
            expect(
                container.querySelectorAll(':scope tbody [role="status"]'),
            ).toHaveLength(0);
            expect(container.querySelectorAll('td[role]')).toHaveLength(0);
            expect(container.querySelectorAll('[role="status"]')).toHaveLength(
                1,
            );
            expect(
                container.querySelector('[aria-busy="true"]'),
            ).not.toBeNull();
        });

        it('shows the engine failure, not the retry fee, when an eval value could not be computed', () => {
            answerEverything(
                [modeledAccount('broken', 'Broken eval')],
                [snapshotOf('broken', 51_500)],
            );
            harness.failure = 'the worker crashed';
            render(<AccountsTable userId={USER_ID} />);
            const text = rowOf('Broken eval').textContent;
            expect(text).toContain(
                'At risk if busted is not available: the worker crashed',
            );
            expect(text).not.toContain('at least');
        });

        it('derives the owner from its own accounts when no user id is given', () => {
            answerEverything(
                [fundedAccount('alpha', 'Alpha')],
                [snapshotOf('alpha', 52_000)],
            );
            useValues(
                new Map([
                    [
                        valueKey(SizingStage.Funded, 52_000),
                        { days: 3, value: 2500 },
                    ],
                ]),
            );
            render(<AccountsTable />);
            expect(rowOf('Alpha').textContent).toContain('$2,500 (SE $70)');
        });

        it('says so when the accounts belong to more than one user', () => {
            answerEverything(
                [
                    fundedAccount('alpha', 'Alpha'),
                    modeledAccount('bravo', 'Bravo', {
                        stage: AccountStage.Funded,
                        userId: 'user-b',
                    }),
                ],
                [snapshotOf('alpha', 52_000)],
            );
            render(<AccountsTable />);
            expect(container.textContent).toContain('more than one user');
        });
    });

    describe('DetailHeaderFigures', () => {
        it('shows the same figures above the snapshot for an eval account', () => {
            answerEverything(
                [modeledAccount('progress', 'Progress eval')],
                [snapshotOf('progress', 51_500)],
            );
            useValues(
                new Map([
                    [valueKey(SizingStage.Eval, 51_500), { value: 1400 }],
                ]),
            );
            render(
                <DetailHeaderFiguresWithData accountId="progress" userId={USER_ID} />,
            );
            const text = container.textContent;
            expect(text).toContain('Next action');
            expect(text).toContain('Expected payouts');
            expect(text).toContain('$1,400 (SE $70)');
            expect(text).toContain(
                `At risk if busted: $${(400 + RETRY_FEE).toLocaleString('en-US')}`,
            );
            expect(text).toContain('EV per attempt: $55 (SE $5)');
            expect(text).not.toContain('Retire this account');
        });

        it('shows the next payout of a funded account, highlighted when it is near', () => {
            answerEverything(
                [fundedAccount('alpha', 'Alpha')],
                [snapshotOf('alpha', 52_000)],
            );
            useValues(
                new Map([
                    [
                        valueKey(SizingStage.Funded, 52_000),
                        { days: 3.4, value: 2500 },
                    ],
                ]),
            );
            render(<DetailHeaderFiguresWithData accountId="alpha" userId={USER_ID} />);
            expect(
                container.querySelector('[data-soon="true"]')?.textContent,
            ).toBe('3.4 calendar days (SE 0.4)');
            expect(container.textContent).toContain(
                'Trade at the documented rung',
            );
        });

        it('shows a ledger-only account as not valued with its reason', () => {
            answerEverything([ledgerOnlyAccount('hola', 'Hola')], []);
            render(<DetailHeaderFiguresWithData accountId="hola" userId={USER_ID} />);
            expect(container.textContent).toContain('Not valued');
            expect(container.textContent).toContain('Ledger only');
            expect(container.textContent).toContain(
                'Not modeled for this account',
            );
        });

        it('values only the account of the page, not every account', () => {
            const requested: OverviewRequest[] = [];
            answerEverything(
                [
                    fundedAccount('alpha', 'Alpha'),
                    modeledAccount('bravo', 'Bravo'),
                ],
                [snapshotOf('alpha', 52_000), snapshotOf('bravo', 51_500)],
            );
            harness.resultFor = (request) => {
                requested.push(request);
                return null;
            };
            render(<DetailHeaderFiguresWithData accountId="alpha" userId={USER_ID} />);
            const stages = requested
                .filter(
                    (request) =>
                        request.kind === OverviewRequestKind.AccountFromState,
                )
                .map((request) => request.account?.stage);
            expect(new Set(stages)).toEqual(new Set([SizingStage.Funded]));
        });
    });

    describe('a suspended account is never sized on the detail page (PT-19i, F-118)', () => {
        const SUSPENDED_ACTION_TEXTS = [
            'Trade at the documented rung',
            'Request payout',
            'Stop for today',
        ];

        it('builds no value request and no sizing next action for a suspended funded account', () => {
            answerEverything(
                [
                    {
                        ...fundedAccount('alpha', 'Alpha'),
                        status: AccountStatus.Suspended,
                    },
                ],
                [snapshotOf('alpha', 52_000)],
            );
            const requested = captureRequests();
            render(<AccountDetailValuesProbe accountId="alpha" userId={USER_ID} />);

            expect(requested).toEqual([]);
            for (const text of SUSPENDED_ACTION_TEXTS) {
                expect(container.textContent).not.toContain(text);
            }
            expect(container.textContent).toContain(
                'Not modeled for this account',
            );
        });

        it('builds no value request and no sizing next action for a suspended eval account', () => {
            answerEverything(
                [
                    {
                        ...modeledAccount('bravo', 'Bravo'),
                        status: AccountStatus.Suspended,
                    },
                ],
                [snapshotOf('bravo', 51_500)],
            );
            const requested = captureRequests();
            render(<AccountDetailValuesProbe accountId="bravo" userId={USER_ID} />);

            expect(requested).toEqual([]);
            for (const text of SUSPENDED_ACTION_TEXTS) {
                expect(container.textContent).not.toContain(text);
            }
        });

        it('still sizes the same account once it is active again', () => {
            answerEverything(
                [fundedAccount('alpha', 'Alpha')],
                [snapshotOf('alpha', 52_000)],
            );
            const requested = captureRequests();
            render(<AccountDetailValuesProbe accountId="alpha" userId={USER_ID} />);

            expect(
                requestsOfKind(requested, OverviewRequestKind.AccountFromState),
            ).toHaveLength(1);
            expect(container.textContent).toContain(
                'Trade at the documented rung',
            );
        });
    });

    describe('the personal max risk reaches every from-state request (PT-68g, F-V16)', () => {
        it('puts the personal max risk of the account on its list from-state request', () => {
            answerEverything(
                [
                    {
                        ...fundedAccount('alpha', 'Alpha'),
                        personalRules: { maxRiskPerTradeCents: 10_000 },
                    },
                ],
                [snapshotOf('alpha', 52_000)],
            );
            const requested = captureRequests();
            render(<AccountsTable userId={USER_ID} />);

            const fromState = requestsOfKind(
                requested,
                OverviewRequestKind.AccountFromState,
            );
            expect(fromState).toHaveLength(1);
            expect(maxRiskOf(fromState[0])).toBe(100);
        });

        it('puts the personal max risk on the from-state, chain and request of the detail page', () => {
            answerEverything(
                [
                    {
                        ...fundedAccount('alpha', 'Alpha'),
                        personalRules: { maxRiskPerTradeCents: 10_000 },
                    },
                ],
                [snapshotOf('alpha', 52_000)],
            );
            const requested = captureRequests();
            render(<AccountDetailValuesProbe accountId="alpha" userId={USER_ID} />);

            const fromState = requestsOfKind(
                requested,
                OverviewRequestKind.AccountFromState,
            );
            const chain = requestsOfKind(
                requested,
                OverviewRequestKind.ValueChain,
            );
            expect(fromState).toHaveLength(1);
            expect(chain).toHaveLength(1);
            expect(maxRiskOf(fromState[0])).toBe(100);
            expect(maxRiskOf(chain[0])).toBe(100);
        });

        it('leaves the from-state request without personal caps for an account that sets none', () => {
            answerEverything(
                [fundedAccount('alpha', 'Alpha')],
                [snapshotOf('alpha', 52_000)],
            );
            const requested = captureRequests();
            render(<AccountsTable userId={USER_ID} />);

            const [request] = requestsOfKind(
                requested,
                OverviewRequestKind.AccountFromState,
            );
            expect(request?.spec.enginePolicy).not.toHaveProperty(
                'personalCaps',
            );
        });
    });
});
