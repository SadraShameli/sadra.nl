import { readFileSync } from 'node:fs';
import path from 'node:path';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

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
    ApexVariant,
    findFirm,
    FirmId,
    serializePlanId,
} from '~/lib/prop-calculator';
import { DEFAULT_RULEBOOK } from '~/lib/prop-calculator/advisor';

const TODAY = '2026-09-26';
const PREVIOUS_SNAPSHOT_DATE = '2026-09-01';
const USER_ID = 'user-a';
const OWN_ID = '0b6f3c1e-1d2a-4c3b-9e8f-7a6b5c4d3e2f';
const SIBLING_ID = '5b0c3f7e-8a51-4c4e-9f0a-3d0f1c2b4a61';
const ARCHIVED_ID = '7d2e4f6a-9b1c-4d3e-8f5a-6b7c8d9e0f1a';

interface FakeQuery {
    data: unknown;
    error: Error | null;
    isError: boolean;
    isPending: boolean;
}


const harness = vi.hoisted(() => {
    const queries = new Map<string, FakeQuery>();
    const requested = new Set<string>();
    const mutate = new Map<string, ReturnType<typeof vi.fn>>();
    const mutateAsync = new Map<string, ReturnType<typeof vi.fn>>();
    const invalidate = vi.fn(() => Promise.resolve());
    const pending: FakeQuery = {
        data: undefined,
        error: null,
        isError: false,
        isPending: true,
    };
    function mutateOf(name: string) {
        const existing = mutate.get(name);
        if (existing !== undefined) return existing;
        const created = vi.fn();
        mutate.set(name, created);
        return created;
    }
    function mutateAsyncOf(name: string) {
        const existing = mutateAsync.get(name);
        if (existing !== undefined) return existing;
        const created = vi.fn(() => Promise.resolve({}));
        mutateAsync.set(name, created);
        return created;
    }
    return {
        invalidate,
        mutateAsyncOf,
        mutateOf,
        mutation: (name: string) => ({
            useMutation: () => ({
                isPending: false,
                mutate: mutateOf(name),
                mutateAsync: mutateAsyncOf(name),
            }),
        }),
        queries,
        query: (name: string) => ({
            useQuery: () => {
                requested.add(name);
                return queries.get(name) ?? pending;
            },
        }),
        requested,
        reset() {
            queries.clear();
            requested.clear();
            mutate.clear();
            mutateAsync.clear();
            invalidate.mockClear();
        },
        scopedQuery: (name: string) => ({
            useQuery: (input?: { accountId?: string }) => {
                requested.add(name);
                return (
                    queries.get(
                        input?.accountId === undefined ? `${name}.ledger` : name,
                    ) ?? pending
                );
            },
        }),
    };
});

vi.mock('next/navigation', () => ({
    usePathname: () => '/prop-calculator/accounts',
    useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
    useSearchParams: () => new URLSearchParams(),
}));

vi.mock('sonner', () => ({
    toast: { error: vi.fn(), success: vi.fn() },
}));

vi.mock('~/trpc/react', () => ({
    api: {
        propAccounts: {
            account: {
                archive: harness.mutation('account.archive'),
                get: harness.query('account.get'),
                list: harness.query('account.list'),
                remove: harness.mutation('account.remove'),
                unarchive: harness.mutation('account.unarchive'),
                upgradeToModeled: harness.mutation('account.upgradeToModeled'),
            },
            bankroll: { list: harness.query('bankroll.list') },
            copyGroup: { list: harness.query('copyGroup.list') },
            decision: {
                latestForAll: harness.query('decision.latestForAll'),
                list: harness.query('decision.list'),
                listForAccount: harness.query('decision.listForAccount'),
            },
            event: {
                list: harness.query('event.list'),
                listForAccount: harness.query('event.listForAccount'),
                record: harness.mutation('event.record'),
            },
            externalFirm: { list: harness.query('externalFirm.list') },
            fee: {
                create: harness.mutation('fee.create'),
                list: harness.query('fee.list'),
                remove: harness.mutation('fee.remove'),
                update: harness.mutation('fee.update'),
            },
            firmEngagement: {
                set: harness.mutation('firmEngagement.set'),
            },
            payout: {
                create: harness.mutation('payout.create'),
                list: harness.scopedQuery('payout.list'),
                remove: harness.mutation('payout.remove'),
                update: harness.mutation('payout.update'),
            },
            rulebook: { get: harness.query('rulebook.get') },
            snapshot: {
                create: harness.mutation('snapshot.create'),
                latestForAll: harness.query('snapshot.latestForAll'),
                latestTwoForAll: harness.query('snapshot.latestTwoForAll'),
                listForAccount: harness.query('snapshot.listForAccount'),
                remove: harness.mutation('snapshot.remove'),
            },
            violation: {
                create: harness.mutation('violation.create'),
                list: harness.query('violation.list'),
                remove: harness.mutation('violation.remove'),
                update: harness.mutation('violation.update'),
            },
        },
        useUtils: () => ({
            propAccounts: {
                account: {
                    get: { cancel: harness.invalidate },
                    invalidate: harness.invalidate,
                },
                invalidate: harness.invalidate,
            },
        }),
    },
}));


vi.mock(
    '~/app/(app)/prop-calculator/accounts/_components/detail/detailState',
    async (importOriginal) => {
        const actual = await importOriginal<typeof DetailStateModule>();
        return {
            ...actual,
            previousReconstructionOf: vi.fn(actual.previousReconstructionOf),
            stateCardOf: vi.fn(actual.stateCardOf),
        };
    },
);

const { AccountDetailView } =
    await import('~/app/(app)/prop-calculator/accounts/_components/detail/AccountDetailView');
const { previousReconstructionOf, stateCardOf } =
    await import('~/app/(app)/prop-calculator/accounts/_components/detail/detailState');

const PLAN = apexEod50k();

function account(id: string, overrides: Record<string, unknown> = {}) {
    return {
        accountSize: 50_000,
        archivedAt: null,
        copyGroupId: null,
        createdAt: new Date('2026-08-01T12:00:00Z'),
        dashboardConvention: DashboardBalanceConvention.Nominal,
        externalAlias: null,
        externalFirmId: null,
        firmId: FirmId.Apex,
        firstFundedTradeOn: null,
        fundedOn: null,
        id,
        label: id,
        liveStartBalanceCents: null,
        notes: null,
        optIns: {},
        personalRules: {},
        planLabel: null,
        planRulesFingerprint: null,
        planSerial: serializePlanId(PLAN.id),
        purchasedOn: '2026-08-03',
        readIssues: [],
        replacesAccountId: null,
        stage: AccountStage.Eval,
        status: AccountStatus.Active,
        tags: [],
        tracking: AccountTracking.Modeled,
        updatedAt: new Date('2026-08-01T12:00:00Z'),
        userId: USER_ID,
        ...overrides,
    };
}

function answer(data: unknown): FakeQuery {
    return { data, error: null, isError: false, isPending: false };
}

function answerEverything(
    ledgerPayouts: FakeQuery,
    accounts: readonly Record<string, unknown>[] = [
        account(OWN_ID),
        account(SIBLING_ID),
        account(ARCHIVED_ID, { archivedAt: new Date('2026-09-01T12:00:00Z') }),
    ],
) {
    harness.queries.set('account.get', answer(account(OWN_ID)));
    harness.queries.set('account.list', answer(accounts));
    harness.queries.set(
        'snapshot.listForAccount',
        answer([
            snapshot('s2', '2026-09-20', 5_100_000),
            snapshot('s1', PREVIOUS_SNAPSHOT_DATE, 5_000_000),
        ]),
    );
    harness.queries.set('payout.list', answer([]));
    harness.queries.set('payout.list.ledger', ledgerPayouts);
    harness.queries.set('fee.list', answer([]));
    harness.queries.set('violation.list', answer([]));
    harness.queries.set('decision.listForAccount', answer([]));
    harness.queries.set('event.listForAccount', answer([purchased(OWN_ID)]));
    harness.queries.set(
        'event.list',
        answer([OWN_ID, SIBLING_ID, ARCHIVED_ID].map(purchased)),
    );
    harness.queries.set('rulebook.get', answer(DEFAULT_RULEBOOK));
    harness.queries.set('copyGroup.list', answer([]));
    harness.queries.set('bankroll.list', answer([]));
    harness.queries.set('decision.latestForAll', answer([]));
    harness.queries.set('decision.list', answer([]));
    harness.queries.set('snapshot.latestForAll', answer([]));
    harness.queries.set('snapshot.latestTwoForAll', answer([]));
    harness.queries.set('externalFirm.list', answer([]));
}

function apexEod50k() {
    const plan = findFirm(FirmId.Apex)?.findPlan({
        accountSize: 50_000,
        firm: FirmId.Apex,
        variant: ApexVariant.Eod,
    });
    if (plan === undefined) throw new Error('no Apex EOD 50K plan');
    return plan;
}

function payout(accountId: string, index: number, status: PayoutStatus) {
    const day = `2026-09-${String(index + 1).padStart(2, '0')}`;
    return {
        accountId,
        createdAt: new Date(`${day}T12:00:00Z`),
        grossCents: usdCents(50_000),
        id: `payout-${accountId}-${String(index)}`,
        netCents: null,
        note: null,
        paidOn: status === PayoutStatus.Paid ? day : null,
        requestedOn: day,
        status,
        updatedAt: new Date(`${day}T12:00:00Z`),
        userId: USER_ID,
    };
}

function purchased(accountId: string) {
    return {
        accountId,
        createdAt: new Date('2026-08-03T12:00:00Z'),
        detail: { changes: [], note: null },
        id: `event-${accountId}`,
        kind: AccountEventKind.Purchased,
        occurredOn: '2026-08-03',
        updatedAt: new Date('2026-08-03T12:00:00Z'),
        userId: USER_ID,
    };
}

function snapshot(id: string, asOf: string, balanceCents: number) {
    return {
        accountId: OWN_ID,
        asOf,
        balanceAtLastPayoutCents: null,
        balanceCents,
        createdAt: new Date(`${asOf}T12:00:00Z`),
        cumulativePayoutCents: null,
        cycleBestDayProfitCents: null,
        dashboardFloorCents: null,
        evalBestDayProfitCents: null,
        floorAtLastPayoutCents: null,
        highestEodBalanceCents: null,
        highestIntradayBalanceCents: null,
        id,
        lastPayoutOn: null,
        lastTradedOn: null,
        payoutsTaken: null,
        qualifyingDaysSinceLastPayout: null,
        source: 'manual',
        tradingDays: null,
        updatedAt: new Date(`${asOf}T12:00:00Z`),
        userId: USER_ID,
    };
}

describe('the account detail page counts the firm payouts like the board (PT-36k, F-145)', () => {
    let container: HTMLDivElement;
    let root: Root;

    function render() {
        act(() => {
            root.render(<AccountDetailView id={OWN_ID} userId={USER_ID} />);
        });
    }

    beforeEach(() => {
        vi.useFakeTimers({
            now: new Date(`${TODAY}T12:00:00Z`),
            toFake: ['Date'],
        });
        vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
        harness.reset();
        vi.mocked(stateCardOf).mockClear();
        vi.mocked(previousReconstructionOf).mockClear();
        container = document.createElement('div');
        document.body.append(container);
        root = createRoot(container);
    });

    afterEach(() => {
        act(() => {
            root.unmount();
        });
        document.body.replaceChildren();
        vi.useRealTimers();
        vi.unstubAllGlobals();
    });

    it('hands the state card and the previous reconstruction the firm count of every account, archived ones included', () => {
        answerEverything(
            answer([
                payout(SIBLING_ID, 0, PayoutStatus.Paid),
                payout(SIBLING_ID, 1, PayoutStatus.Paid),
                payout(ARCHIVED_ID, 2, PayoutStatus.Requested),
                payout(ARCHIVED_ID, 3, PayoutStatus.Requested),
            ]),
        );

        render();

        const expected = {
            asOf: TODAY,
            firmId: FirmId.Apex,
            paidPayoutsSinceLastLiveAccount: 2,
            requestedPayoutsSinceLastLiveAccount: 2,
        };
        const stateCalls = vi.mocked(stateCardOf).mock.calls;
        const previousCalls = vi.mocked(previousReconstructionOf).mock.calls;
        expect(stateCalls.length).toBeGreaterThan(0);
        expect(previousCalls.length).toBeGreaterThan(0);
        for (const call of stateCalls) {
            expect(call[6]).toMatchObject(expected);
        }
    });

    it('hands the previous reconstruction the firm count at the previous snapshot date, not today', () => {
        answerEverything(
            answer([
                payout(SIBLING_ID, 0, PayoutStatus.Paid),
                payout(SIBLING_ID, 1, PayoutStatus.Paid),
                payout(ARCHIVED_ID, 2, PayoutStatus.Requested),
                payout(ARCHIVED_ID, 3, PayoutStatus.Requested),
            ]),
        );

        render();

        const previousCalls = vi.mocked(previousReconstructionOf).mock.calls;
        expect(previousCalls.length).toBeGreaterThan(0);
        for (const call of previousCalls) {
            expect(call[5]).toBe(PREVIOUS_SNAPSHOT_DATE);
            expect(call[6]).toMatchObject({
                asOf: PREVIOUS_SNAPSHOT_DATE,
                firmId: FirmId.Apex,
                paidPayoutsSinceLastLiveAccount: 1,
                requestedPayoutsSinceLastLiveAccount: 0,
            });
        }
    });

    it('counts a payout requested before the previous snapshot and paid after it as requested at that date', () => {
        answerEverything(
            answer([
                {
                    ...payout(SIBLING_ID, 9, PayoutStatus.Paid),
                    requestedOn: '2026-08-20',
                },
            ]),
        );

        render();

        const previousCalls = vi.mocked(previousReconstructionOf).mock.calls;
        const stateCalls = vi.mocked(stateCardOf).mock.calls;
        expect(previousCalls.length).toBeGreaterThan(0);
        for (const call of previousCalls) {
            expect(call[6]).toMatchObject({
                asOf: PREVIOUS_SNAPSHOT_DATE,
                paidPayoutsSinceLastLiveAccount: 0,
                requestedPayoutsSinceLastLiveAccount: 1,
            });
        }
        for (const call of stateCalls) {
            expect(call[6]).toMatchObject({
                asOf: TODAY,
                paidPayoutsSinceLastLiveAccount: 1,
                requestedPayoutsSinceLastLiveAccount: 0,
            });
        }
    });

    it('says the firm count could not be loaded, and shows no state read from a count it does not have, when the firm payout ledger failed', () => {
        answerEverything({
            data: undefined,
            error: new Error('ledger exploded'),
            isError: true,
            isPending: false,
        });

        render();

        expect(container.textContent).toContain(
            'The firm payout count could not be loaded',
        );
        expect(container.textContent).toContain('ledger exploded');
        expect(vi.mocked(stateCardOf)).not.toHaveBeenCalled();
        expect(vi.mocked(previousReconstructionOf)).not.toHaveBeenCalled();
    });

    it.each([
        ['account.list', 'accounts list exploded'],
        ['event.list', 'ledger events exploded'],
    ])(
        'says the firm count could not be loaded, not a skeleton forever, when the ledger query %s failed',
        (queryName, message) => {
            answerEverything(answer([]));
            harness.queries.set(queryName, {
                data: undefined,
                error: new Error(message),
                isError: true,
                isPending: false,
            });

            render();

            expect(container.textContent).toContain(
                'The firm payout count could not be loaded',
            );
            expect(container.textContent).toContain(message);
            expect(
                container.querySelector(
                    '[aria-label="Loading the account state"]',
                ),
            ).toBeNull();
            expect(vi.mocked(stateCardOf)).not.toHaveBeenCalled();
        },
    );

    it('waits for the firm payout ledger instead of reading a missing count as zero', () => {
        answerEverything({
            data: undefined,
            error: null,
            isError: false,
            isPending: true,
        });

        render();

        expect(vi.mocked(stateCardOf)).not.toHaveBeenCalled();
        expect(
            container.querySelector('[aria-label="Loading the account state"]'),
        ).not.toBeNull();
    });

    it('says the firm count could not be computed when the accounts list holds no account of the firm', () => {
        answerEverything(answer([]), []);

        render();

        expect(container.textContent).toContain(
            'The firm payout count could not be loaded',
        );
        expect(vi.mocked(stateCardOf)).not.toHaveBeenCalled();
    });
});

describe('no caller reads a firm count of its own account only (PT-36k, F-145)', () => {
    const base = path.resolve(
        import.meta.dirname,
        '../../../../../src/app/(app)/prop-calculator/accounts/_components/detail',
    );

    it.each(['detailState.ts', 'AccountDetailView.tsx'])(
        'keeps no ownFirmCountOf in %s',
        (file) => {
            expect(readFileSync(path.join(base, file), 'utf8')).not.toContain(
                'ownFirmCountOf',
            );
        },
    );
});
