import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useAccountValuesWithEngine } from '~/app/(app)/prop-calculator/accounts/_components/useAccountValues';
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
    type Plan,
    PolicySourceKind,
    PolicyVerification,
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
const USER_ID = 'user-a';

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

vi.mock(
    '~/app/(app)/prop-calculator/accounts/_components/overview/useOverviewWorker',
    () => ({
        useOverviewWorker: () => ({ failure: null, outcomes: new Map() }),
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

function accountRow(
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
        firstFundedTradeOn: '2025-12-01',
        fundedOn: '2025-12-01',
        id,
        label,
        liveStartBalanceCents: null,
        notes: null,
        optIns: {},
        planLabel: null,
        planSerial: serializePlanId(PLAN.id),
        purchasedOn: '2025-11-01',
        readIssues: [],
        replacesAccountId: null,
        stage: AccountStage.Funded,
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

function answerEverything(
    accounts: readonly Record<string, unknown>[],
    snapshots: readonly Record<string, unknown>[],
    payouts: readonly Record<string, unknown>[],
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
                createdAt: new Date('2025-11-01T12:00:00Z'),
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

function BoardProbe() {
    const { values } = useAccountValuesWithEngine({ userId: USER_ID });
    return (
        <pre data-testid="board">
            {JSON.stringify(
                values.boards?.readiness.rows.map((row) => ({
                    accountId: row.accountId,
                    kind: row.kind,
                    reason: 'reason' in row ? row.reason.kind : null,
                })),
            )}
        </pre>
    );
}

function eligibleSnapshot(accountId: string) {
    return {
        accountId,
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
        id: `snapshot-${accountId}`,
        lastPayoutOn: null,
        lastTradedOn: null,
        payoutsTaken: null,
        qualifyingDaysSinceLastPayout: 30,
        tradingDays: 40,
        userId: USER_ID,
    };
}

function paidPayout(accountId: string, index: number) {
    const day = String(index + 1).padStart(2, '0');
    return {
        accountId,
        approvedOn: null,
        grossCents: usdCents(50_000),
        id: `payout-${accountId}-${String(index)}`,
        netCents: usdCents(45_000),
        paidOn: `2026-08-${day}`,
        requestedOn: `2026-08-${day}`,
        status: PayoutStatus.Paid,
        userId: USER_ID,
    };
}

function twoAccounts(paid: number, status?: AccountStatus) {
    answerEverything(
        [
            accountRow('alpha', 'Alpha', status ? { status } : {}),
            accountRow('bravo', 'Bravo'),
        ],
        [eligibleSnapshot('alpha')],
        Array.from({ length: paid }, (_unused, index) =>
            paidPayout('bravo', index),
        ),
    );
}

function withPolicy<T>(run: () => T): T {
    const firm = findFirm(FirmId.TopStep) as unknown as {
        accountPolicy: FirmAccountPolicy;
    };
    const original = firm.accountPolicy;
    firm.accountPolicy = new StubTriggerPolicy([
        new PayoutCountTotalTrigger(10, CONFIRMED_SOURCE),
    ]);
    try {
        return run();
    } finally {
        firm.accountPolicy = original;
    }
}

describe('the account list passes the firm payout count to the advice and the board (PT-36g, F-145)', () => {
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

    function boardRows(): readonly {
        readonly accountId: string;
        readonly kind: string;
        readonly reason: null | string;
    }[] {
        const text =
            container.querySelector('[data-testid="board"]')?.textContent ??
            '[]';
        return JSON.parse(text) as never;
    }

    beforeEach(() => {
        vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
        harness.queries.clear();
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

    it('offers the payout and lists the account eligible while the firm count is low', () => {
        twoAccounts(3);
        withPolicy(() => {
            render(<AccountsTable userId={USER_ID} />);
        });
        expect(rowOf('Alpha').textContent).toContain('Request payout');
        withPolicy(() => {
            render(<BoardProbe />);
        });
        expect(boardRows()).toEqual([
            { accountId: 'alpha', kind: 'eligible', reason: null },
        ]);
    });

    it('stops offering the payout and blocks the board row once the firm count reaches the verified trigger', () => {
        twoAccounts(9);
        withPolicy(() => {
            render(<AccountsTable userId={USER_ID} />);
        });
        expect(rowOf('Alpha').textContent).not.toContain('Request payout');
        withPolicy(() => {
            render(<BoardProbe />);
        });
        expect(boardRows()).toEqual([
            {
                accountId: 'alpha',
                kind: 'blocked',
                reason: 'would-trigger-live',
            },
        ]);
    });

    it('leaves a suspended account out of the payout readiness board', () => {
        twoAccounts(3, AccountStatus.Suspended);
        render(<BoardProbe />);
        expect(boardRows()).toEqual([]);
    });

    it('says a suspended account is suspended, not that it is not modeled', () => {
        twoAccounts(3, AccountStatus.Suspended);
        render(<AccountDetailValuesProbe accountId="alpha" userId={USER_ID} />);
        const { textContent: text } = container;
        expect(text).toContain(
            'Suspended: no sizing until the account is Active again',
        );
        expect(text).not.toContain('Not modeled for this account');
        expect(text).not.toContain('Request payout');
    });
});
