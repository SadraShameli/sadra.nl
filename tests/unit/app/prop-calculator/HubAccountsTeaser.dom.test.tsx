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
    AccountEventKind,
    AccountStage,
    AccountStatus,
    AccountTracking,
    AlertKind,
    BankrollTransferKind,
    DashboardBalanceConvention,
    FeeKind,
    formatUsdCents,
    type LedgerAccountRow,
    type LedgerEventRow,
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

import {
    EVAL_PLAN,
    account as ledgerAccount,
    purchased,
    transfer,
} from '../../lib/prop-accounts/metrics/ledgerFixtures';

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
            bankroll: { list: harness.query('bankroll.list') },
            copyGroup: { list: harness.query('copyGroup.list') },
            decision: { list: harness.query('decision.list') },
            event: { list: harness.query('event.list') },
            fee: { list: harness.query('fee.list') },
            payout: { list: harness.query('payout.list') },
            rulebook: { get: harness.query('rulebook.get') },
            snapshot: {
                latestForAll: harness.query('snapshot.latestForAll'),
                latestTwoForAll: harness.query('snapshot.latestTwoForAll'),
            },
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
        dashboardConvention: DashboardBalanceConvention.Nominal,
        externalFirmId: null,
        firmId: firm.id,
        firstFundedTradeOn: null,
        fundedOn: null,
        id,
        label: id,
        liveStartBalanceCents: null,
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
            harness.queries.set('bankroll.list', answer([]));
            harness.queries.set('copyGroup.list', answer([]));
            harness.queries.set('decision.list', answer([]));
            harness.queries.set('rulebook.get', answer(DEFAULT_RULEBOOK));
            harness.queries.set('snapshot.latestTwoForAll', answer([]));
        });

        it('reads the latest two snapshots per account and never the latest-only list', () => {
            harness.queries.set('event.list', answer([]));
            render();
            expect(harness.queryCalls).toContain('snapshot.latestTwoForAll');
            expect(harness.queryCalls).not.toContain('snapshot.latestForAll');
        });

        it('counts the large day loss alert that needs the previous snapshot (PT-69c)', () => {
            const owner = ledgerAccount(EVAL_PLAN, {
                label: 'Losing eval',
                purchasedOn: '2026-09-01',
            });
            const row = {
                ...owner,
                dashboardConvention: DashboardBalanceConvention.Nominal,
                firstFundedTradeOn: null,
                liveStartBalanceCents: null,
            };
            const start = EVAL_PLAN.plan.accountSize;
            const peak = usdCents(Math.round((start + 600) * CENTS_PER_DOLLAR));
            const snapshotAt = (
                asOf: string,
                balance: number,
                tradingDays: number,
            ) =>
                ({
                    accountId: owner.id,
                    asOf,
                    balanceAtLastPayoutCents: null,
                    balanceCents: usdCents(
                        Math.round(balance * CENTS_PER_DOLLAR),
                    ),
                    createdAt: new Date(`${asOf}T00:00:00Z`),
                    cumulativePayoutCents: null,
                    cycleBestDayProfitCents: null,
                    dashboardFloorCents: null,
                    evalBestDayProfitCents: null,
                    floorAtLastPayoutCents: null,
                    highestEodBalanceCents: peak,
                    highestIntradayBalanceCents: peak,
                    id: `snapshot-${asOf}`,
                    lastPayoutOn: null,
                    lastTradedOn: null,
                    payoutsTaken: null,
                    qualifyingDaysSinceLastPayout: null,
                    tradingDays,
                    userId: USER_ID,
                }) as unknown as OverviewSnapshotRow;
            const previous = snapshotAt('2026-09-25', start + 600, 3);
            const latest = snapshotAt(TODAY, start - 900, 4);
            const rulebook = {
                ...DEFAULT_RULEBOOK,
                alerts: {
                    ...DEFAULT_RULEBOOK.alerts,
                    dayLossBankrollFraction: 0.0001,
                },
            };
            const transfers = [
                transfer(BankrollTransferKind.Deposit, 1_000_000, '2026-08-01'),
            ];
            harness.queries.set('account.list', answer([row]));
            harness.queries.set('fee.list', answer([]));
            harness.queries.set('payout.list', answer([]));
            harness.queries.set('event.list', answer([purchased(owner)]));
            harness.queries.set('bankroll.list', answer(transfers));
            harness.queries.set('rulebook.get', answer(rulebook));
            harness.queries.set(
                'snapshot.latestTwoForAll',
                answer([previous, latest]),
            );
            render();
            const accountStates = accountStatesForRows(
                USER_ID,
                TODAY,
                [row],
                [purchased(owner)],
                [],
                [previous, latest],
            );
            const listed = portfolioAlerts({
                accounts: [row],
                accountStates,
                availableBankrollCents: usdCents(1_000_000),
                copyGroups: [],
                decisions: [],
                events: [purchased(owner)],
                payouts: [],
                rulebook,
                snapshots: [previous, latest],
                today: TODAY,
            });
            expect(
                listed.some((alert) => alert.kind === AlertKind.LargeDayLoss),
            ).toBe(true);
            expect(statValue('Alerts')).toBe(String(listed.length));
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
                'snapshot.latestTwoForAll',
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
            expect(
                alerts.some((alert) => alert.kind === AlertKind.NearFloor),
            ).toBe(true);
            expect(statValue('Alerts')).toBe(String(alerts.length));
        });

        it('threads recorded events into the lifetime cap alert, not only into account state reconstruction', () => {
            const mff = mffProPlan();
            const active = teaserAccount('mff-active', {
                accountSize: mff.id.accountSize,
                firmId: mff.id.firm,
                planSerial: serializePlanId(mff.id),
                stage: AccountStage.Funded,
            });
            const movedLive = teaserAccount('mff-moved-live', {
                accountSize: mff.id.accountSize,
                firmId: mff.id.firm,
                planSerial: serializePlanId(mff.id),
                stage: AccountStage.Live,
            });
            const mffPayout = (
                id: string,
                accountId: string,
                cents: number,
                paidOn: string,
            ): LedgerPayoutRow => ({
                accountId,
                approvedOn: null,
                grossCents: usdCents(cents),
                id,
                netCents: usdCents(cents),
                paidOn,
                requestedOn: paidOn,
                status: PayoutStatus.Paid,
                userId: USER_ID,
            });
            const mffPayouts = [
                mffPayout('mff-p1', movedLive.id, 1_000_000, '2026-02-01'),
                mffPayout('mff-p2', movedLive.id, 9_500_000, '2026-08-01'),
            ];
            const movedLiveEvent: LedgerEventRow = {
                accountId: movedLive.id,
                createdAt: new Date('2026-06-01T00:00:00Z'),
                id: 'moved-live-event',
                kind: AccountEventKind.MovedLive,
                occurredOn: '2026-06-01',
                userId: USER_ID,
            };
            harness.queries.set('account.list', answer([active, movedLive]));
            harness.queries.set('fee.list', answer([]));
            harness.queries.set('payout.list', answer(mffPayouts));
            harness.queries.set('event.list', answer([]));
            render();
            const withoutEvent = Number(statValue('Alerts'));

            harness.queries.set('event.list', answer([movedLiveEvent]));
            render();
            const withEvent = Number(statValue('Alerts'));

            expect(withEvent).toBe(withoutEvent - 1);
        });

        it('shows a compact setup checklist with the done count and a link to the overview once the ledger rows are loaded (PT-69, F-V28)', () => {
            harness.queries.set('event.list', answer([]));
            render();
            expect(container.textContent).toContain(
                'Setup: 1 of 4 steps done.',
            );
            expect(container.textContent).toContain('Budget set: Missing');
            expect(container.textContent).not.toContain(
                'Expected value computed: Not checked yet',
            );
            expect(container.textContent).toContain(
                'Expected value: checked on the overview',
            );
            expect(container.textContent).toContain(
                'The count leaves out the steps checked on the overview.',
            );
            expect(
                [...container.querySelectorAll('a')]
                    .find((anchor) => anchor.textContent === 'Finish the setup')
                    ?.getAttribute('href'),
            ).toBe(routes.propCalculator.accounts.index);
        });

        it('links each setup step to the overview target and each missing item to its fix (PT-89, F-V28)', () => {
            harness.queries.set('event.list', answer([]));
            render();
            const hrefs = [...container.querySelectorAll('a')].map((anchor) =>
                anchor.getAttribute('href'),
            );
            expect(hrefs).toContain(routes.propCalculator.accounts.ledger);
            expect(hrefs).toContain(routes.propCalculator.rules);
            expect(hrefs).toContain(routes.propCalculator.accounts.review);
            const budget = [...container.querySelectorAll('a')].find(
                (anchor) => anchor.textContent === 'Budget set',
            );
            expect(budget?.getAttribute('href')).toBe(
                routes.propCalculator.accounts.ledger,
            );
            const evLink = [...container.querySelectorAll('a')].find(
                (anchor) =>
                    anchor.textContent ===
                    'Expected value: checked on the overview',
            );
            expect(evLink?.getAttribute('href')).toContain(
                routes.propCalculator.accounts.index,
            );
        });

        it('shows no setup checklist until the events are loaded, and still shows the totals', () => {
            render();
            expect(container.textContent).not.toContain('Setup:');
            expect(statValue('Spend')).toBe(formatUsdCents(usdCents(20_000)));
        });

        it('counts the new capacity alert in the same count the overview lists (PT-69, F-V27)', () => {
            const rulebook = {
                ...DEFAULT_RULEBOOK,
                bankroll: {
                    ...DEFAULT_RULEBOOK.bankroll,
                    dailyAccountCapacity: 1,
                },
            };
            harness.queries.set('rulebook.get', answer(rulebook));
            render();
            const listed = portfolioAlerts({
                accounts: ACCOUNTS,
                accountStates: NO_ACCOUNT_STATES,
                copyGroups: [],
                payouts: PAYOUTS,
                rulebook,
                snapshots: [],
                today: TODAY,
            });
            expect(
                listed.some(
                    (alert) => alert.kind === AlertKind.CapacityExceeded,
                ),
            ).toBe(true);
            expect(statValue('Alerts')).toBe(String(listed.length));
        });

        it('keeps the totals and marks only the alert count unavailable when the bankroll transfers fail to load', () => {
            harness.queries.set('bankroll.list', {
                data: undefined,
                error: { message: 'transfers down' },
                isError: true,
            });
            render();
            expect(statValue('Spend')).toBe(formatUsdCents(usdCents(20_000)));
            expect(statValue('Alerts')).toBe('n/a');
            expect(container.textContent).toContain(
                'The alert count could not be checked: transfers down',
            );
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
