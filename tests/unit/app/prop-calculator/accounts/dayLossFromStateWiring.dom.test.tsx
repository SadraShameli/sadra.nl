import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
    type OverviewRequest,
    OverviewRequestKind,
} from '~/app/(app)/prop-calculator/_workers/overviewWorkerMessages';
import {
    useAccountDetailValues,
    useAccountValuesWithEngine,
} from '~/app/(app)/prop-calculator/accounts/_components/useAccountValues';
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
    FirmId,
    MffuVariant,
    type Plan,
    type PlanId,
    serializePlanId,
} from '~/lib/prop-calculator';
import { DEFAULT_RULEBOOK } from '~/lib/prop-calculator/advisor';


interface FakeQuery {
    data: unknown;
    error: Error | null;
    isError: boolean;
    isPending: boolean;
}

const USER_ID = 'user-a';
const ACCOUNT_ID = 'alpha';
const SIBLING_ID = 'bravo';
const MFF_PRO_ID: PlanId = {
    accountSize: 50_000,
    firm: FirmId.Mffu,
    variant: MffuVariant.Pro,
};

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

const workerBox = vi.hoisted(() => ({
    requests: [] as readonly OverviewRequest[],
}));

vi.mock(
    '~/app/(app)/prop-calculator/accounts/_components/overview/useOverviewWorker',
    () => ({
        useOverviewWorker: (requests: readonly OverviewRequest[]) => {
            workerBox.requests = requests;
            return { failure: null, outcomes: new Map() };
        },
    }),
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

function requirePlan(): Plan {
    const plan = findFirm(MFF_PRO_ID.firm)?.findPlan(MFF_PRO_ID);
    if (plan === undefined) throw new Error('no MFF Pro 50K plan');
    return plan;
}

const PLAN = requirePlan();

function accountRow(id: string, overrides: Record<string, unknown> = {}) {
    return {
        accountSize: PLAN.id.accountSize,
        archivedAt: null,
        copyGroupId: null,
        dashboardConvention: DashboardBalanceConvention.Nominal,
        externalFirmId: null,
        firmId: FirmId.Mffu,
        firstFundedTradeOn: null,
        fundedOn: null,
        id,
        label: id,
        liveStartBalanceCents: null,
        notes: null,
        optIns: {},
        planLabel: null,
        planSerial: serializePlanId(PLAN.id),
        purchasedOn: '2026-08-01',
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

function answer(data: unknown): FakeQuery {
    return { data, error: null, isError: false, isPending: false };
}

function answerEverything({
    accounts,
    payouts = [],
    snapshots,
}: {
    readonly accounts: readonly Record<string, unknown>[];
    readonly payouts?: readonly Record<string, unknown>[];
    readonly snapshots: readonly Record<string, unknown>[];
}) {
    harness.queries.set('account.list', answer(accounts));
    harness.queries.set('bankroll.list', answer([]));
    harness.queries.set('copyGroup.list', answer([]));
    harness.queries.set('decision.list', answer([]));
    harness.queries.set(
        'event.list',
        answer(
            accounts.map((row) => ({
                accountId: row.id,
                createdAt: new Date('2026-08-01T12:00:00Z'),
                id: `event-${String(row.id)}`,
                kind: AccountEventKind.Purchased,
                occurredOn: row.purchasedOn,
                userId: USER_ID,
            })),
        ),
    );
    harness.queries.set('externalFirm.list', answer([]));
    harness.queries.set('fee.list', answer([]));
    harness.queries.set('payout.list', answer(payouts));
    harness.queries.set('rulebook.get', answer(DEFAULT_RULEBOOK));
    harness.queries.set('snapshot.latestForAll', answer(snapshots));
    harness.queries.set('violation.list', answer([]));
}

function DetailProbe() {
    useAccountDetailValues({ accountId: ACCOUNT_ID, userId: USER_ID });
    return null;
}

function fromStateRequests() {
    return workerBox.requests.filter(
        (request) => request.kind === OverviewRequestKind.AccountFromState,
    );
}

function ListProbe() {
    useAccountValuesWithEngine({ userId: USER_ID });
    return null;
}

function onlyFromStateRequest(): OverviewRequest {
    const requests = fromStateRequests();
    expect(requests).toHaveLength(1);
    const [request] = requests;
    if (request === undefined) throw new Error('no from-state request');
    return request;
}

function requestedPayout(accountId: string, requestedOn: string) {
    return {
        accountId,
        approvedOn: null,
        grossCents: usdCents(50_000),
        id: `payout-${accountId}-${requestedOn}`,
        netCents: null,
        paidOn: null,
        requestedOn,
        status: PayoutStatus.Requested,
        userId: USER_ID,
    };
}

function singleAccount(
    snapshots: readonly Record<string, unknown>[],
    overrides: Record<string, unknown> = {},
) {
    answerEverything({
        accounts: [accountRow(ACCOUNT_ID, overrides)],
        snapshots,
    });
}

function snapshotRow(accountId: string, asOf: string, balance: number) {
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
        highestEodBalanceCents: usdCents(5_130_000),
        highestIntradayBalanceCents: null,
        id: `snapshot-${accountId}-${asOf}`,
        lastPayoutOn: null,
        lastTradedOn: null,
        payoutsTaken: 0,
        qualifyingDaysSinceLastPayout: null,
        tradingDays: 4,
        userId: USER_ID,
    };
}

describe('the accounts pages attach the previous snapshot only to a one-day eval loss (PT-90, F-V29)', () => {
    let container: HTMLDivElement;
    let root: Root;

    function render(node: React.ReactNode) {
        act(() => {
            root.render(node);
        });
    }

    beforeEach(() => {
        vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
        harness.queries.clear();
        workerBox.requests = [];
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

    it('carries the previous snapshot of an eval account that lost money since the previous trading day', () => {
        singleAccount([
            snapshotRow(ACCOUNT_ID, '2026-09-24', 51_300),
            snapshotRow(ACCOUNT_ID, '2026-09-25', 50_300),
        ]);
        render(<ListProbe />);
        const request = onlyFromStateRequest();
        expect(request.account?.asOf).toBe('2026-09-25');
        expect(request.account?.balance).toBe(50_300);
        expect(request.previous?.account.asOf).toBe('2026-09-24');
        expect(request.previous?.account.balance).toBe(51_300);
    });

    it('counts the sibling payout requests as they stood at the previous date, not today', () => {
        answerEverything({
            accounts: [
                accountRow(ACCOUNT_ID),
                accountRow(SIBLING_ID, { purchasedOn: '2026-08-02' }),
            ],
            payouts: [requestedPayout(SIBLING_ID, '2026-09-25')],
            snapshots: [
                snapshotRow(ACCOUNT_ID, '2026-09-24', 51_300),
                snapshotRow(ACCOUNT_ID, '2026-09-25', 50_300),
            ],
        });
        render(<ListProbe />);
        const request = onlyFromStateRequest();
        expect(
            request.pendingPayoutCounts?.otherAccountsPendingPayoutCount,
        ).toBe(1);
        expect(
            request.previous?.pendingPayoutCounts
                .otherAccountsPendingPayoutCount,
        ).toBe(0);
    });

    it('carries no previous snapshot for an eval account that gained money', () => {
        singleAccount([
            snapshotRow(ACCOUNT_ID, '2026-09-24', 50_300),
            snapshotRow(ACCOUNT_ID, '2026-09-25', 51_300),
        ]);
        render(<ListProbe />);
        expect(onlyFromStateRequest().previous).toBeUndefined();
    });

    it('carries no previous snapshot for a funded account that lost money', () => {
        singleAccount(
            [
                snapshotRow(ACCOUNT_ID, '2026-09-24', 51_300),
                snapshotRow(ACCOUNT_ID, '2026-09-25', 50_300),
            ],
            { fundedOn: '2026-09-01', stage: AccountStage.Funded },
        );
        render(<ListProbe />);
        expect(onlyFromStateRequest().previous).toBeUndefined();
    });

    it('carries no previous snapshot when the two snapshots are more than one trading day apart', () => {
        singleAccount([
            snapshotRow(ACCOUNT_ID, '2026-09-22', 51_300),
            snapshotRow(ACCOUNT_ID, '2026-09-25', 50_300),
        ]);
        render(<ListProbe />);
        expect(onlyFromStateRequest().previous).toBeUndefined();
    });

    it('carries no previous snapshot on the one-account detail request, which has its own set', () => {
        singleAccount([
            snapshotRow(ACCOUNT_ID, '2026-09-24', 51_300),
            snapshotRow(ACCOUNT_ID, '2026-09-25', 50_300),
        ]);
        render(<DetailProbe />);
        expect(onlyFromStateRequest().previous).toBeUndefined();
    });
});
