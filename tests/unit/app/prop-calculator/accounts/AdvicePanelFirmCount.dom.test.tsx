import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type * as UseAccountAdviceModule from '~/app/(app)/prop-calculator/accounts/_components/advice/useAccountAdvice';
import type * as DetailStateModule from '~/app/(app)/prop-calculator/accounts/_components/detail/detailState';

import {
    AccountEventKind,
    AccountStage,
    AccountStatus,
    AccountTracking,
    DashboardBalanceConvention,
    PayoutStatus,
    usdCents,
} from '~/lib/prop-accounts';
import {
    findFirm,
    FirmAccountPolicy,
    FirmId,
    type LiveTransitionTrigger,
    PayoutCountTotalTrigger,
    PolicySourceKind,
    PolicyVerification,
    serializePlanId,
    TopStepVariant,
} from '~/lib/prop-calculator';
import {
    AssumptionKind,
    DEFAULT_RULEBOOK,
    PayoutBlockReasonKind,
    PayoutRequestDecisionKind,
    PendingPayoutCountsStatus,
} from '~/lib/prop-calculator/advisor';

const USER_ID = 'user-a';
const ACCOUNT_ID = 'account-a';
const TODAY = '2026-09-28';
const SIBLING_ID = 'account-b';
const ARCHIVED_ID = 'account-c';
const FIRM_TOTAL_CAP = 5;

function topStepPlan() {
    const plan = findFirm(FirmId.TopStep)?.findPlan({
        accountSize: 50_000,
        firm: FirmId.TopStep,
        variant: TopStepVariant.StandardStandard,
    });
    if (plan === undefined) throw new Error('no TopStep 50K plan');
    return plan;
}

const PLAN = topStepPlan();

interface FakeQuery {
    data: unknown;
    error: Error | null;
    isError: boolean;
    isPending: boolean;
}

const harness = vi.hoisted(() => {
    const queries = new Map<string, FakeQuery>();
    const pending: FakeQuery = {
        data: undefined,
        error: null,
        isError: false,
        isPending: true,
    };
    return {
        mutation: () => ({
            useMutation: () => ({ isPending: false, mutate: vi.fn() }),
        }),
        queries,
        query: (name: string) => ({
            useQuery: () => queries.get(name) ?? pending,
        }),
        scopedQuery: (name: string) => ({
            useQuery: (input?: { accountId?: string }) =>
                queries.get(
                    input?.accountId === undefined ? `${name}.ledger` : name,
                ) ?? pending,
        }),
    };
});

const adviceBox = vi.hoisted(() => ({ inputs: [] as unknown[] }));

vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

vi.mock('~/app/(app)/prop-calculator/_components/useTodayIsoDate', () => ({
    useTodayIsoDate: () => '2026-09-28',
}));

vi.mock('~/lib/auth/client', () => ({
    useSession: () => ({
        data: { user: { id: 'user-a' } },
        error: null,
        isPending: false,
    }),
}));

vi.mock('next/navigation', () => ({
    usePathname: () => '/prop-calculator/accounts',
    useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
    useSearchParams: () => new URLSearchParams(),
}));

vi.mock('~/trpc/react', () => ({
    api: {
        propAccounts: {
            account: {
                get: harness.query('account.get'),
                list: harness.query('account.list'),
            },
            decision: {
                create: harness.mutation(),
                listForAccount: harness.query('decision.listForAccount'),
                recordActual: harness.mutation(),
            },
            event: {
                list: harness.query('event.list'),
                listForAccount: harness.query('event.listForAccount'),
            },
            payout: { list: harness.scopedQuery('payout.list') },
            rulebook: { get: harness.query('rulebook.get') },
            snapshot: {
                listForAccount: harness.query('snapshot.listForAccount'),
            },
            violation: {
                create: harness.mutation(),
                list: harness.query('violation.list'),
            },
        },
        useUtils: () => ({
            propAccounts: {
                decision: { invalidate: vi.fn() },
                invalidate: vi.fn(),
            },
        }),
    },
}));

vi.mock(
    '~/app/(app)/prop-calculator/accounts/_components/advice/useAccountAdvice',
    async (importOriginal) => {
        const actual = await importOriginal<typeof UseAccountAdviceModule>();
        return {
            ...actual,
            useAccountAdvice: (input: {
                advisor: { assemble: (results: []) => unknown };
            }) => {
                adviceBox.inputs.push(input);
                return {
                    advice: input.advisor.assemble([]),
                    failedOptima: [],
                    phase: 'ready',
                    values: { phase: 'idle' },
                };
            },
        };
    },
);

vi.mock(
    '~/app/(app)/prop-calculator/accounts/_components/detail/detailState',
    async (importOriginal) => {
        const actual = await importOriginal<typeof DetailStateModule>();
        return { ...actual, stateCardOf: vi.fn(actual.stateCardOf) };
    },
);

const { AdvicePanel } =
    await import('~/app/(app)/prop-calculator/accounts/_components/advice/AdvicePanel');
const { stateCardOf } =
    await import('~/app/(app)/prop-calculator/accounts/_components/detail/detailState');

const CONFIRMED_SOURCE = {
    fetchedOn: '2026-09-01',
    quote: 'a synthetic test quote',
    sourceKind: PolicySourceKind.LiveFetch,
    url: 'https://example.test/policy',
    verification: PolicyVerification.Confirmed,
} as const;

class StubTriggerPolicy extends FirmAccountPolicy {
    constructor(private readonly triggers: readonly LiveTransitionTrigger[]) {
        super();
    }

    override liveTriggersFor(): readonly LiveTransitionTrigger[] {
        return this.triggers;
    }
}

function account(id: string, overrides: Record<string, unknown> = {}) {
    return {
        accountSize: 50_000,
        archivedAt: null,
        copyGroupId: null,
        createdAt: new Date('2025-11-01T12:00:00Z'),
        dashboardConvention: DashboardBalanceConvention.Nominal,
        externalAlias: null,
        externalFirmId: null,
        firmId: FirmId.TopStep,
        firstFundedTradeOn: '2025-12-01',
        fundedOn: '2025-12-01',
        id,
        label: id,
        liveStartBalanceCents: null,
        notes: null,
        optIns: {},
        personalRules: {},
        planLabel: null,
        planRulesFingerprint: null,
        planSerial: serializePlanId(PLAN.id),
        purchasedOn: '2025-11-01',
        readIssues: [],
        replacesAccountId: null,
        stage: AccountStage.Funded,
        status: AccountStatus.Active,
        tags: [],
        tracking: AccountTracking.Modeled,
        updatedAt: new Date('2025-11-01T12:00:00Z'),
        userId: USER_ID,
        ...overrides,
    };
}

function answer(data: unknown): FakeQuery {
    return { data, error: null, isError: false, isPending: false };
}

function answerEverything(ledgerPayouts: readonly Record<string, unknown>[]) {
    const accounts = [
        account(ACCOUNT_ID),
        account(SIBLING_ID),
        account(ARCHIVED_ID, {
            archivedAt: new Date('2026-01-01T12:00:00Z'),
            status: AccountStatus.Busted,
        }),
    ];
    harness.queries.set('account.get', answer(account(ACCOUNT_ID)));
    harness.queries.set('account.list', answer(accounts));
    harness.queries.set('snapshot.listForAccount', answer([snapshot()]));
    harness.queries.set(
        'event.list',
        answer(
            accounts.map((row) => ({
                accountId: row.id,
                createdAt: new Date('2025-11-01T12:00:00Z'),
                id: `event-${row.id}`,
                kind: AccountEventKind.Purchased,
                occurredOn: '2025-11-01',
                userId: USER_ID,
            })),
        ),
    );
    harness.queries.set('event.listForAccount', answer([]));
    harness.queries.set('payout.list', answer([]));
    harness.queries.set('payout.list.ledger', answer(ledgerPayouts));
    harness.queries.set('rulebook.get', answer(DEFAULT_RULEBOOK));
    harness.queries.set('decision.listForAccount', answer([]));
    harness.queries.set('violation.list', answer([]));
}

function assumptionKindsOfLastInput(): readonly string[] {
    const input = adviceBox.inputs.at(-1) as
        | undefined
        | {
              advisor: {
                  assemble: (results: []) => {
                      assumptions: readonly { kind: string }[];
                  };
              };
          };
    if (input === undefined) throw new Error('the panel built no advisor');
    return input.advisor
        .assemble([])
        .assumptions.map((assumption) => assumption.kind);
}

function documentedOfLastInput() {
    const input = adviceBox.inputs.at(-1) as
        | undefined
        | {
              advisor: {
                  assemble: (results: []) => {
                      payoutAdvice: null | {
                          documented: {
                              kind: string;
                              reason?: { kind: string };
                          };
                      };
                  };
              };
          };
    if (input === undefined) throw new Error('the panel built no advisor');
    return input.advisor.assemble([]).payoutAdvice?.documented;
}

function payout(
    accountId: string,
    index: number,
    status: PayoutStatus,
): Record<string, unknown> {
    const day = `2026-08-${String(index + 1).padStart(2, '0')}`;
    return {
        accountId,
        approvedOn: null,
        grossCents: usdCents(50_000),
        id: `payout-${accountId}-${String(index)}`,
        netCents: status === PayoutStatus.Paid ? usdCents(45_000) : null,
        paidOn: status === PayoutStatus.Paid ? day : null,
        requestedOn: day,
        status,
        userId: USER_ID,
    };
}

function snapshot() {
    return {
        accountId: ACCOUNT_ID,
        asOf: TODAY,
        balanceAtLastPayoutCents: null,
        balanceCents: usdCents(5_600_000),
        createdAt: new Date(`${TODAY}T12:00:00Z`),
        cumulativePayoutCents: null,
        cycleBestDayProfitCents: null,
        dashboardFloorCents: null,
        evalBestDayProfitCents: null,
        floorAtLastPayoutCents: null,
        highestEodBalanceCents: usdCents(5_600_000),
        highestIntradayBalanceCents: usdCents(5_600_000),
        id: 'snap-1',
        lastPayoutOn: null,
        lastTradedOn: null,
        payoutsTaken: null,
        qualifyingDaysSinceLastPayout: 30,
        tradingDays: 40,
        updatedAt: new Date(`${TODAY}T12:00:00Z`),
        userId: USER_ID,
    };
}

function withCap<T>(run: () => T): T {
    const firm = findFirm(FirmId.TopStep) as unknown as {
        accountPolicy: FirmAccountPolicy;
    };
    const original = firm.accountPolicy;
    firm.accountPolicy = new StubTriggerPolicy([
        new PayoutCountTotalTrigger(FIRM_TOTAL_CAP, CONFIRMED_SOURCE),
    ]);
    try {
        return run();
    } finally {
        firm.accountPolicy = original;
    }
}

describe('the advice panel counts the firm payouts requested at sibling and archived accounts like the board (PT-36k, F-145)', () => {
    let container: HTMLDivElement;
    let root: Root;

    function render() {
        act(() => {
            root.render(<AdvicePanel id={ACCOUNT_ID} />);
        });
    }

    beforeEach(() => {
        vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
        harness.queries.clear();
        vi.mocked(stateCardOf).mockClear();
        adviceBox.inputs = [];
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

    it('blocks the fifth firm payout when two are paid at a sibling and two are requested at an archived account', () => {
        answerEverything([
            payout(SIBLING_ID, 0, PayoutStatus.Paid),
            payout(SIBLING_ID, 1, PayoutStatus.Paid),
            payout(ARCHIVED_ID, 2, PayoutStatus.Requested),
            payout(ARCHIVED_ID, 3, PayoutStatus.Requested),
        ]);

        withCap(render);

        expect(documentedOfLastInput()).toMatchObject({
            kind: PayoutRequestDecisionKind.NotEligible,
            reason: { kind: PayoutBlockReasonKind.WouldTriggerLive },
        });
    });

    it('still requests while one fewer sibling request leaves the next payout under the cap', () => {
        answerEverything([
            payout(SIBLING_ID, 0, PayoutStatus.Paid),
            payout(SIBLING_ID, 1, PayoutStatus.Paid),
            payout(ARCHIVED_ID, 2, PayoutStatus.Requested),
        ]);

        withCap(render);

        expect(documentedOfLastInput()?.kind).toBe(
            PayoutRequestDecisionKind.Request,
        );
    });

    it('never lets the own-account count it builds on a failed firm ledger decide the live trigger', () => {
        answerEverything([]);
        harness.queries.set(
            'payout.list',
            answer([
                payout(ACCOUNT_ID, 0, PayoutStatus.Requested),
                payout(ACCOUNT_ID, 1, PayoutStatus.Requested),
                payout(ACCOUNT_ID, 2, PayoutStatus.Requested),
                payout(ACCOUNT_ID, 3, PayoutStatus.Requested),
            ]),
        );
        harness.queries.set('payout.list.ledger', {
            data: undefined,
            error: new Error('ledger exploded'),
            isError: true,
            isPending: false,
        });

        withCap(render);

        expect(container.textContent).toContain(
            'The firm payout count could not be loaded',
        );
        expect(documentedOfLastInput()).not.toMatchObject({
            reason: { kind: PayoutBlockReasonKind.WouldTriggerLive },
        });
    });

    it('passes the typed not-checked count, never a count built from its own account, to the state card when the firm ledger failed', () => {
        answerEverything([]);
        harness.queries.set(
            'payout.list',
            answer([payout(ACCOUNT_ID, 0, PayoutStatus.Requested)]),
        );
        harness.queries.set('payout.list.ledger', {
            data: undefined,
            error: new Error('ledger exploded'),
            isError: true,
            isPending: false,
        });

        withCap(render);

        const calls = vi.mocked(stateCardOf).mock.calls;
        expect(calls.length).toBeGreaterThan(0);
        for (const call of calls) {
            expect(call[6]).toEqual({
                status: PendingPayoutCountsStatus.NotChecked,
            });
        }
    });

    it('lists the unknown firm count as an assumption of the advice when the firm ledger failed', () => {
        answerEverything([]);
        harness.queries.set('payout.list.ledger', {
            data: undefined,
            error: new Error('ledger exploded'),
            isError: true,
            isPending: false,
        });

        withCap(render);

        expect(assumptionKindsOfLastInput()).toContain(
            AssumptionKind.FirmPayoutCountNotChecked,
        );
    });

    it('lists no unknown-count assumption when the ledger loaded', () => {
        answerEverything([payout(SIBLING_ID, 0, PayoutStatus.Paid)]);

        withCap(render);

        expect(assumptionKindsOfLastInput()).not.toContain(
            AssumptionKind.FirmPayoutCountNotChecked,
        );
    });

    it('passes the firm count itself when the ledger loaded', () => {
        answerEverything([payout(SIBLING_ID, 0, PayoutStatus.Paid)]);

        withCap(render);

        const calls = vi.mocked(stateCardOf).mock.calls;
        expect(calls.length).toBeGreaterThan(0);
        for (const call of calls) {
            expect(call[6]).toMatchObject({
                firmId: FirmId.TopStep,
                paidPayoutsSinceLastLiveAccount: 1,
            });
        }
    });
});
