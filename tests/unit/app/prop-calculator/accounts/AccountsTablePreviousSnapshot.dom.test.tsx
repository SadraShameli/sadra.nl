import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type {
    OverviewRequest,
    OverviewResult,
} from '~/app/(app)/prop-calculator/_workers/overviewWorkerMessages';

import { OverviewRequestKind } from '~/app/(app)/prop-calculator/_workers/overviewWorkerMessages';
import {
    AccountEventKind,
    AccountStage,
    AccountStatus,
    AccountTracking,
    DashboardBalanceConvention,
    usdCents,
} from '~/lib/prop-accounts';
import {
    findFirm,
    FirmId,
    type Plan,
    serializePlanId,
    TopStepVariant,
} from '~/lib/prop-calculator';
import { DEFAULT_RULEBOOK } from '~/lib/prop-calculator/advisor';

import {
    AccountDetailValuesProbe,
    AccountsTable,
} from './AccountsTableWithData';

interface FakeQuery {
    data: unknown;
    error: Error | null;
    isError: boolean;
    isPending: boolean;
}

const TODAY = '2026-09-28';
const FRIDAY = '2026-09-25';
const WEDNESDAY = '2026-09-23';
const USER_ID = 'user-a';
const OPENING = 51_300;
const AFTER_LOSS = 50_300;

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
    () => ({
        useOverviewWorker: (requests: readonly OverviewRequest[]) => {
            for (const request of requests) harness.resultFor(request);
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

function answer(data: unknown): FakeQuery {
    return { data, error: null, isError: false, isPending: false };
}

function answerEverything(
    accounts: readonly Record<string, unknown>[],
    snapshots: readonly ReturnType<typeof snapshotOf>[],
) {
    harness.queries.set('account.list', answer(accounts));
    harness.queries.set('bankroll.list', answer([]));
    harness.queries.set('copyGroup.list', answer([]));
    harness.queries.set('decision.list', answer([]));
    harness.queries.set(
        'event.list',
        answer(
            accounts.map((row) => ({
                accountId: row.id,
                createdAt: new Date('2026-09-01T12:00:00Z'),
                id: `event-${String(row.id)}`,
                kind: AccountEventKind.Purchased,
                occurredOn: row.purchasedOn,
                userId: USER_ID,
            })),
        ),
    );
    harness.queries.set('externalFirm.list', answer([]));
    harness.queries.set('fee.list', answer([]));
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

function fromStateRequestAt(
    requested: readonly OverviewRequest[],
    balance: number,
): OverviewRequest | undefined {
    return requested.find(
        (request) =>
            request.kind === OverviewRequestKind.AccountFromState &&
            request.account?.balance === balance,
    );
}

function modeledAccount(id: string, overrides: Record<string, unknown> = {}) {
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
        label: id,
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

function snapshotOf(accountId: string, balance: number, asOf: string) {
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
        highestEodBalanceCents: usdCents(Math.max(balance, 51_300) * 100),
        highestIntradayBalanceCents: usdCents(Math.max(balance, 51_300) * 100),
        id: `snapshot-${accountId}-${asOf}`,
        lastPayoutOn: null,
        lastTradedOn: null,
        payoutsTaken: null,
        qualifyingDaysSinceLastPayout: null,
        tradingDays: null,
        userId: USER_ID,
    };
}

describe('the accounts table sends the previous snapshot only for a one-day eval loss (PT-90, F-V29)', () => {
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

    it('attaches the previous snapshot to an eval account that lost money since the previous trading day', () => {
        answerEverything(
            [modeledAccount('loser')],
            [
                snapshotOf('loser', OPENING, FRIDAY),
                snapshotOf('loser', AFTER_LOSS, TODAY),
            ],
        );
        const requested = captureRequests();
        render(<AccountsTable userId={USER_ID} />);

        const request = fromStateRequestAt(requested, AFTER_LOSS);
        expect(request?.previous?.account.asOf).toBe(FRIDAY);
        expect(request?.previous?.account.balance).toBe(OPENING);
        expect(request?.account?.asOf).toBe(TODAY);
    });

    it('attaches nothing to an eval account that gained money', () => {
        answerEverything(
            [modeledAccount('winner')],
            [
                snapshotOf('winner', AFTER_LOSS, FRIDAY),
                snapshotOf('winner', OPENING, TODAY),
            ],
        );
        const requested = captureRequests();
        render(<AccountsTable userId={USER_ID} />);

        const request = fromStateRequestAt(requested, OPENING);
        expect(request).toBeDefined();
        expect(request?.previous).toBeUndefined();
    });

    it('attaches nothing to a funded account that lost money', () => {
        answerEverything(
            [
                modeledAccount('funded', {
                    firstFundedTradeOn: '2026-08-03',
                    fundedOn: '2026-08-03',
                    stage: AccountStage.Funded,
                }),
            ],
            [
                snapshotOf('funded', OPENING, FRIDAY),
                snapshotOf('funded', AFTER_LOSS, TODAY),
            ],
        );
        const requested = captureRequests();
        render(<AccountsTable userId={USER_ID} />);

        const request = fromStateRequestAt(requested, AFTER_LOSS);
        expect(request).toBeDefined();
        expect(request?.previous).toBeUndefined();
    });

    it('attaches nothing when the two snapshots are more than one trading day apart', () => {
        answerEverything(
            [modeledAccount('gap')],
            [
                snapshotOf('gap', OPENING, WEDNESDAY),
                snapshotOf('gap', AFTER_LOSS, TODAY),
            ],
        );
        const requested = captureRequests();
        render(<AccountsTable userId={USER_ID} />);

        const request = fromStateRequestAt(requested, AFTER_LOSS);
        expect(request).toBeDefined();
        expect(request?.previous).toBeUndefined();
    });

    it('attaches nothing to an eval account with a single snapshot', () => {
        answerEverything(
            [modeledAccount('single')],
            [snapshotOf('single', AFTER_LOSS, TODAY)],
        );
        const requested = captureRequests();
        render(<AccountsTable userId={USER_ID} />);

        const request = fromStateRequestAt(requested, AFTER_LOSS);
        expect(request).toBeDefined();
        expect(request?.previous).toBeUndefined();
    });

    it('keeps the previous snapshot off the detail page request, which has its own request set', () => {
        answerEverything(
            [modeledAccount('loser')],
            [
                snapshotOf('loser', OPENING, FRIDAY),
                snapshotOf('loser', AFTER_LOSS, TODAY),
            ],
        );
        const requested = captureRequests();
        render(<AccountDetailValuesProbe accountId="loser" userId={USER_ID} />);

        expect(requested.length).toBeGreaterThan(0);
        expect(
            requested.filter((request) => request.previous !== undefined),
        ).toEqual([]);
    });
});
