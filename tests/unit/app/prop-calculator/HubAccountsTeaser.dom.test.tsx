import { act, useSyncExternalStore } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { HubAccountsTeaser } from '~/app/(app)/prop-calculator/_components/hub/HubAccountsTeaser';
import { type AccountListAccount } from '~/app/(app)/prop-calculator/accounts/_components/accountListFilters';
import {
    accountStatesForRows,
    type OverviewSnapshotRow,
    portfolioAlerts,
} from '~/app/(app)/prop-calculator/accounts/_components/overview/overviewModel';
import {
    AccountStage,
    AccountStatus,
    AccountTracking,
    AlertKind,
    DashboardBalanceConvention,
    FeeKind,
    formatUsdCents,
    type LedgerAccountRow,
    type LedgerFeeRow,
    type LedgerPayoutRow,
    NO_ACCOUNT_STATES,
    PayoutStatus,
    usdCents,
} from '~/lib/prop-accounts';
import {
    ALL_FIRMS,
    CENTS_PER_DOLLAR,
    findFirm,
    FirmId,
    MffuVariant,
    serializePlanId,
} from '~/lib/prop-calculator';
import { DEFAULT_RULEBOOK } from '~/lib/prop-calculator/advisor';
import { loginRedirectFor } from '~/lib/site/privateRoutes';
import { routes } from '~/lib/site/routes';

interface FakeQuery {
    data: unknown;
    error: null | { message: string };
    isError: boolean;
}

interface FakeSession {
    data: null | { user: { id: string } };
    error: Error | null;
    isPending: boolean;
    refetch: () => Promise<void>;
}

type TeaserAccount = AccountListAccount & LedgerAccountRow;

const TODAY = '2026-09-26';
const USER_ID = 'user-a';

const harness = vi.hoisted(() => {
    const listeners = new Set<() => void>();
    const queries = new Map<string, FakeQuery>();
    const queryCalls: string[] = [];
    const store: { session: FakeSession } = {
        session: {
            data: null,
            error: null,
            isPending: false,
            refetch: () => Promise.resolve(),
        },
    };
    return {
        queries,
        query: (name: string) => ({
            useQuery: () => {
                queryCalls.push(name);
                return (
                    queries.get(name) ?? {
                        data: undefined,
                        error: null,
                        isError: false,
                    }
                );
            },
        }),
        queryCalls,
        setSession(next: Partial<FakeSession>) {
            store.session = { ...store.session, ...next };
            for (const listener of listeners) listener();
        },
        store,
        subscribe: (listener: () => void) => {
            listeners.add(listener);
            return () => {
                listeners.delete(listener);
            };
        },
    };
});

vi.mock('~/lib/auth/client', () => ({
    useSession: () =>
        useSyncExternalStore(harness.subscribe, () => harness.store.session),
}));

vi.mock('~/trpc/react', () => ({
    api: {
        propAccounts: {
            account: { list: harness.query('account.list') },
            copyGroup: { list: harness.query('copyGroup.list') },
            event: { list: harness.query('event.list') },
            fee: { list: harness.query('fee.list') },
            payout: { list: harness.query('payout.list') },
            rulebook: { get: harness.query('rulebook.get') },
            snapshot: { latestForAll: harness.query('snapshot.latestForAll') },
        },
    },
}));

const { firm, plan } = firstModeledPlan();

function fee(id: string, kind: FeeKind, cents: number): LedgerFeeRow {
    return {
        accountId: 'active-a',
        amountCents: usdCents(cents),
        id,
        kind,
        paidOn: '2026-09-02',
        userId: USER_ID,
    };
}

function firstModeledPlan() {
    const [first] = ALL_FIRMS;
    const [firstPlan] = first?.plans ?? [];
    if (first === undefined || firstPlan === undefined) {
        throw new Error('no modeled plan');
    }
    return { firm: first, plan: firstPlan };
}

function mffProPlan() {
    const firm = findFirm(FirmId.Mffu);
    if (firm === undefined) throw new Error('MFF firm missing');
    const plan = firm.findPlan({
        accountSize: 50_000,
        firm: FirmId.Mffu,
        variant: MffuVariant.Pro,
    });
    if (!plan) throw new Error('MFF Pro plan missing');
    return plan;
}

function paidPayout(
    id: string,
    grossCents: number,
    netCents: null | number,
): LedgerPayoutRow {
    return {
        accountId: 'active-a',
        approvedOn: null,
        grossCents: usdCents(grossCents),
        id,
        netCents: netCents === null ? null : usdCents(netCents),
        paidOn: '2026-09-20',
        requestedOn: '2026-09-18',
        status: PayoutStatus.Paid,
        userId: USER_ID,
    };
}

function teaserAccount(
    id: string,
    overrides: Partial<TeaserAccount> = {},
): TeaserAccount {
    return {
        accountSize: plan.id.accountSize,
        archivedAt: null,
        copyGroupId: null,
        externalFirmId: null,
        firmId: firm.id,
        fundedOn: null,
        id,
        label: id,
        notes: null,
        optIns: {},
        planLabel: null,
        planSerial: serializePlanId(plan.id),
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

const ACCOUNTS: readonly TeaserAccount[] = [
    teaserAccount('active-a'),
    teaserAccount('active-b'),
    teaserAccount('archived', { archivedAt: new Date('2026-09-10') }),
    teaserAccount('unknown-plan', { planSerial: 'no-such-plan' }),
];
const FEES = [
    fee('fee-a', FeeKind.EvalPurchase, 15_000),
    fee('fee-b', FeeKind.Activation, 8000),
    fee('fee-c', FeeKind.Refund, 3000),
];
const PAYOUTS = [
    paidPayout('payout-net', 100_000, 90_000),
    paidPayout('payout-gross', 50_000, null),
];

function answer(data: unknown): FakeQuery {
    return { data, error: null, isError: false };
}

function statValue(label: string): null | string {
    const card = [...document.querySelectorAll('div')].find(
        (element) =>
            element.firstElementChild?.textContent === label &&
            element.children.length >= 2,
    );
    return card?.children[1]?.textContent ?? null;
}

describe('HubAccountsTeaser', () => {
    let container: HTMLDivElement;
    let root: Root;

    function render() {
        act(() => {
            root.render(<HubAccountsTeaser />);
        });
    }

    beforeEach(() => {
        vi.useFakeTimers({
            now: new Date(`${TODAY}T12:00:00Z`),
            toFake: ['Date'],
        });
        vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
        harness.queries.clear();
        harness.queryCalls.length = 0;
        harness.setSession({ data: null, error: null, isPending: false });
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

    it('signed out shows the sign-in call to action and runs no account query', () => {
        render();
        const link = container.querySelector('a');
        expect(link?.textContent).toBe('Sign in');
        expect(link?.getAttribute('href')).toBe(
            loginRedirectFor(routes.propCalculator.accounts.index),
        );
        expect(harness.queryCalls).toEqual([]);
    });

    it('offers a retry and runs no account query when the session check fails', () => {
        harness.setSession({ error: new Error('offline') });
        render();
        expect(container.querySelector('button')?.textContent).toBe(
            'Try again',
        );
        expect(harness.queryCalls).toEqual([]);
    });

    describe('signed in', () => {
        beforeEach(() => {
            harness.setSession({ data: { user: { id: USER_ID } } });
            harness.queries.set('account.list', answer(ACCOUNTS));
            harness.queries.set('fee.list', answer(FEES));
            harness.queries.set('payout.list', answer(PAYOUTS));
            harness.queries.set('copyGroup.list', answer([]));
            harness.queries.set('rulebook.get', answer(DEFAULT_RULEBOOK));
            harness.queries.set('snapshot.latestForAll', answer([]));
        });

        it('shows spend, payouts received, net and active accounts from the ledger rows', () => {
            render();
            expect(statValue('Spend')).toBe(formatUsdCents(usdCents(20_000)));
            expect(statValue('Payouts received')).toBe(
                formatUsdCents(usdCents(140_000)),
            );
            expect(statValue('Net')).toBe(formatUsdCents(usdCents(120_000)));
            expect(statValue('Active accounts')).toBe('3');
            expect(
                container.querySelector(
                    `a[href="${CSS.escape(routes.propCalculator.accounts.index)}"]`,
                )?.textContent,
            ).toBe('Open your accounts');
        });

        it('discloses paid payouts counted at gross because they have no net amount', () => {
            render();
            expect(container.textContent).toContain(
                '1 paid payout has no net amount, so the gross amount is counted as received.',
            );
        });

        it('shows no gross disclosure when every paid payout has a net amount', () => {
            harness.queries.set(
                'payout.list',
                answer([paidPayout('payout-net', 100_000, 90_000)]),
            );
            render();
            expect(container.textContent).not.toContain('no net amount');
        });

        it('counts the same alerts the overview lists, from the full evaluator', () => {
            render();
            const listed = portfolioAlerts({
                accounts: ACCOUNTS,
                accountStates: NO_ACCOUNT_STATES,
                copyGroups: [],
                payouts: PAYOUTS,
                rulebook: DEFAULT_RULEBOOK,
                snapshots: [],
                today: TODAY,
            }).length;
            expect(listed).toBeGreaterThan(1);
            expect(statValue('Alerts')).toBe(String(listed));
        });

        it('counts one more alert once a near-floor account state is reconstructed from real events and snapshots', () => {
            const plan = mffProPlan();
            const documentedRisk =
                DEFAULT_RULEBOOK.funded.riskCents / CENTS_PER_DOLLAR;
            const drawdownAmount = plan.fundedDrawdown.amount;
            const peak = plan.accountSize + 10_000;
            const threshold = peak - drawdownAmount;
            const nearFloorBalance = threshold + documentedRisk * 0.5;
            const nearFloorAccount = {
                ...teaserAccount('near-floor', {
                    accountSize: plan.accountSize,
                    firmId: plan.id.firm,
                    fundedOn: '2026-08-01',
                    planSerial: serializePlanId(plan.id),
                    purchasedOn: '2026-07-01',
                    stage: AccountStage.Funded,
                }),
                dashboardConvention: DashboardBalanceConvention.Nominal,
                firstFundedTradeOn: '2026-08-01',
                liveStartBalanceCents: null,
            } as unknown as ReturnType<typeof teaserAccount>;
            const nearFloorSnapshot = {
                accountId: 'near-floor',
                asOf: TODAY,
                balanceAtLastPayoutCents: null,
                balanceCents: usdCents(Math.round(nearFloorBalance * 100)),
                createdAt: new Date('2026-09-25T00:00:00Z'),
                cumulativePayoutCents: null,
                cycleBestDayProfitCents: null,
                dashboardFloorCents: null,
                evalBestDayProfitCents: null,
                floorAtLastPayoutCents: null,
                highestEodBalanceCents: usdCents(Math.round(peak * 100)),
                highestIntradayBalanceCents: null,
                id: 'snapshot-near-floor',
                lastPayoutOn: null,
                lastTradedOn: null,
                payoutsTaken: null,
                qualifyingDaysSinceLastPayout: null,
                tradingDays: 5,
                userId: USER_ID,
            } as unknown as OverviewSnapshotRow;

            const accountsWithNearFloor = [...ACCOUNTS, nearFloorAccount];
            harness.queries.set('account.list', answer(accountsWithNearFloor));
            harness.queries.set('event.list', answer([]));
            harness.queries.set(
                'snapshot.latestForAll',
                answer([nearFloorSnapshot]),
            );
            render();

            const accountStates = accountStatesForRows(
                USER_ID,
                TODAY,
                accountsWithNearFloor,
                [],
                PAYOUTS,
                [nearFloorSnapshot],
            );
            const alerts = portfolioAlerts({
                accounts: accountsWithNearFloor,
                accountStates,
                copyGroups: [],
                payouts: PAYOUTS,
                rulebook: DEFAULT_RULEBOOK,
                snapshots: [nearFloorSnapshot],
                today: TODAY,
            });
            expect(alerts.some((alert) => alert.kind === AlertKind.NearFloor)).toBe(
                true,
            );
            expect(statValue('Alerts')).toBe(String(alerts.length));
        });

        it('waits for the alert inputs before showing totals', () => {
            harness.queries.delete('rulebook.get');
            render();
            expect(statValue('Alerts')).toBeNull();
            expect(statValue('Spend')).toBeNull();
        });

        it('keeps the cash totals and marks only the alert count unavailable when an alert input fails', () => {
            harness.queries.set('rulebook.get', {
                data: undefined,
                error: { message: 'Your stored rulebook is not valid: x' },
                isError: true,
            });
            render();
            expect(statValue('Spend')).toBe(formatUsdCents(usdCents(20_000)));
            expect(statValue('Net')).toBe(formatUsdCents(usdCents(120_000)));
            expect(statValue('Alerts')).toBe('n/a');
            expect(container.textContent).toContain(
                'The alert count could not be checked: Your stored rulebook is not valid: x',
            );
            expect(container.textContent).not.toContain(
                'Your account totals could not be loaded',
            );
        });

        it('marks the alert count unavailable, not silently undercounted, when events fail to load', () => {
            harness.queries.set('event.list', {
                data: undefined,
                error: { message: 'Your events could not be loaded: x' },
                isError: true,
            });
            render();
            expect(statValue('Spend')).toBe(formatUsdCents(usdCents(20_000)));
            expect(statValue('Alerts')).toBe('n/a');
            expect(container.textContent).toContain(
                'The alert count could not be checked: Your events could not be loaded: x',
            );
        });

        it('shows the load error instead of totals when a query fails', () => {
            harness.queries.set('fee.list', {
                data: undefined,
                error: { message: 'boom' },
                isError: true,
            });
            render();
            expect(container.textContent).toContain(
                'Your account totals could not be loaded: boom',
            );
            expect(statValue('Spend')).toBeNull();
        });
    });
});
