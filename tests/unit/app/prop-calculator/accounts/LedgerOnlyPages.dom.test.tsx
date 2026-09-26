import { act, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import {
    afterEach,
    beforeEach,
    describe,
    expect,
    it,
    type Mock,
    vi,
} from 'vitest';

import {
    AccountCreator,
    AccountEditor,
} from '~/app/(app)/prop-calculator/accounts/_components/AccountForm';
import { AccountsTable } from '~/app/(app)/prop-calculator/accounts/_components/AccountsTable';
import { AccountDetailView } from '~/app/(app)/prop-calculator/accounts/_components/detail/AccountDetailView';
import { OverviewView } from '~/app/(app)/prop-calculator/accounts/_components/overview/OverviewView';
import { LEDGER_ONLY_SNAPSHOT_NOTICE } from '~/app/(app)/prop-calculator/accounts/_components/snapshotFieldRules';
import { ImportView } from '~/app/(app)/prop-calculator/accounts/import/ImportView';
import { LedgerView } from '~/app/(app)/prop-calculator/accounts/ledger/LedgerView';
import {
    AccountEventKind,
    AccountStage,
    AccountStatus,
    AccountTracking,
    DashboardBalanceConvention,
    FeeKind,
    firmKeyId,
    FirmKeyKind,
    PayoutStatus,
    SnapshotField,
    SnapshotSource,
    UNLISTED_FIRM_LABEL,
} from '~/lib/prop-accounts';
import { ALL_FIRMS, NO_PLAN_OPT_INS } from '~/lib/prop-calculator';

interface FakeQuery {
    data: unknown;
    error: Error | null;
    isError: boolean;
    isPending: boolean;
}

const harness = vi.hoisted(() => {
    const queries = new Map<string, FakeQuery>();
    const mutations = new Map<
        string,
        Mock<(input?: unknown) => Promise<unknown>>
    >();
    const pending: FakeQuery = {
        data: undefined,
        error: null,
        isError: false,
        isPending: true,
    };
    function mutateAsyncOf(path: string) {
        const existing = mutations.get(path);
        if (existing !== undefined) return existing;
        const created = vi.fn((_input?: unknown) =>
            Promise.resolve<unknown>({ id: 'created' }),
        );
        mutations.set(path, created);
        return created;
    }
    function node(path: readonly string[]): unknown {
        return new Proxy(
            {},
            {
                get(_target, key) {
                    if (typeof key !== 'string') return;
                    const name = path.join('.');
                    if (key === 'useQuery') {
                        return () => queries.get(name) ?? pending;
                    }
                    if (key === 'useMutation') {
                        return () => ({
                            error: null,
                            isPending: false,
                            mutate: (input: unknown) => {
                                void mutateAsyncOf(name)(input);
                            },
                            mutateAsync: mutateAsyncOf(name),
                            reset: vi.fn(),
                        });
                    }
                    return key === 'invalidate' || key === 'cancel'
                        ? () => Promise.resolve()
                        : node([...path, key]);
                },
            },
        );
    }
    return {
        api: {
            propAccounts: node(['propAccounts']),
            useUtils: () => ({ propAccounts: node(['utils']) }),
        },
        mutateAsyncOf,
        queries,
        reset() {
            queries.clear();
            mutations.clear();
        },
    };
});

vi.mock('next/navigation', () => ({
    usePathname: () => '/prop-calculator/accounts',
    useRouter: () => ({ push: vi.fn(), refresh: vi.fn(), replace: vi.fn() }),
    useSearchParams: () => new URLSearchParams(),
}));

vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

vi.mock('~/trpc/react', () => ({ api: harness.api }));

const TODAY = '2026-09-26';
const USER_ID = 'user-a';
const LEDGER_ID = '0b6f3c1e-1d2a-4c3b-9e8f-7a6b5c4d3e2f';
const FEE_ID = '6f8a0c2e-4b6d-4e8f-9a1c-3d5f7b9e1a3c';
const HOLA = { id: '5d1e2f3a-4b5c-4d6e-8f70-81a2b3c4d5e6', name: 'Hola Prime' };
const SEAT = {
    id: 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d',
    name: 'Funded Seat',
};
const LISTED_FIRM = firstListedFirm();
const LEDGER_ONLY_SNAPSHOT_KEYS: ReadonlySet<string> = new Set([
    'accountId',
    'asOf',
    'balanceCents',
    'cumulativePayoutCents',
    'dashboardFloorCents',
    'payoutsTaken',
    'source',
]);
const DETAIL_QUERIES = [
    'propAccounts.account.list',
    'propAccounts.snapshot.listForAccount',
    'propAccounts.payout.list',
    'propAccounts.fee.list',
    'propAccounts.event.listForAccount',
    'propAccounts.event.list',
    'propAccounts.copyGroup.list',
    'propAccounts.snapshot.latestForAll',
];

function answer(data: unknown): FakeQuery {
    return { data, error: null, isError: false, isPending: false };
}

function atHola(overrides: Record<string, unknown> = {}) {
    return ledgerOnlyAccount({
        externalFirmId: HOLA.id,
        firmId: null,
        label: 'Hola one',
        planLabel: 'Hola 100K',
        ...overrides,
    });
}

function buttonLabelled(scope: ParentNode, label: string): HTMLButtonElement {
    const button = [...scope.querySelectorAll('button')].find(
        (candidate) =>
            candidate.getAttribute('aria-label') === label ||
            candidate.textContent.trim() === label,
    );
    if (button === undefined) throw new Error(`no button ${label}`);
    return button;
}

function element(scope: ParentNode, selector: string): HTMLElement {
    const found = scope.querySelector<HTMLElement>(selector);
    if (found === null) throw new Error(`nothing matches ${selector}`);
    return found;
}

function expectSavedLedgerOnlySnapshot(expected: Record<string, unknown>) {
    const create = harness.mutateAsyncOf('propAccounts.snapshot.create');
    expect(create).toHaveBeenCalledTimes(1);
    const [[saved]] = create.mock.calls as [[Record<string, unknown>]];
    expect(saved).toMatchObject(expected);
    expect(
        Object.entries(saved).filter(
            ([key, value]) =>
                value !== null && !LEDGER_ONLY_SNAPSHOT_KEYS.has(key),
        ),
    ).toEqual([]);
}

function firstListedFirm() {
    const [firm] = ALL_FIRMS;
    if (firm === undefined) throw new Error('no listed firm');
    return firm;
}

function holaFee() {
    return {
        accountId: LEDGER_ID,
        amountCents: 20_000,
        createdAt: new Date(`${TODAY}T12:00:00Z`),
        id: FEE_ID,
        kind: FeeKind.EvalPurchase,
        note: null,
        paidOn: '2026-09-01',
        updatedAt: new Date(`${TODAY}T12:00:00Z`),
        userId: USER_ID,
    };
}

function inputLabelled(scope: ParentNode, label: string): HTMLElement {
    const labelElement = [...scope.querySelectorAll('label')].find(
        (candidate) => candidate.textContent.trim() === label,
    );
    const control =
        labelElement === undefined
            ? null
            : document.querySelector<HTMLElement>(
                  `#${CSS.escape(labelElement.htmlFor)}`,
              );
    if (control === null) throw new Error(`no control labelled ${label}`);
    return control;
}

function ledgerOnlyAccount(overrides: Record<string, unknown> = {}) {
    return {
        accountSize: 100_000,
        archivedAt: null,
        copyGroupId: null,
        createdAt: new Date('2026-09-01T12:00:00Z'),
        dashboardConvention: DashboardBalanceConvention.Nominal,
        externalAlias: null,
        externalFirmId: null,
        firmId: LISTED_FIRM.id,
        firstFundedTradeOn: null,
        fundedOn: null,
        id: LEDGER_ID,
        label: 'Big one',
        liveStartBalanceCents: null,
        notes: null,
        optIns: NO_PLAN_OPT_INS,
        personalRules: {},
        planLabel: 'Rapid 150K',
        planRulesFingerprint: null,
        planSerial: null,
        purchasedOn: '2026-09-01',
        readIssues: [],
        replacesAccountId: null,
        roundId: null,
        stage: AccountStage.Funded,
        status: AccountStatus.Active,
        tags: [],
        tracking: AccountTracking.LedgerOnly,
        updatedAt: new Date('2026-09-01T12:00:00Z'),
        userId: USER_ID,
        ...overrides,
    };
}

function offeredOptionTexts(): readonly string[] {
    return [...document.querySelectorAll<HTMLElement>('[role="option"]')].map(
        (option) => option.textContent.trim(),
    );
}

function optionOf(scope: ParentNode, value: string): HTMLOptionElement {
    const option = [...scope.querySelectorAll('option')].find(
        (candidate) => candidate.value === value,
    );
    if (option === undefined) throw new Error(`no option ${value}`);
    return option;
}

async function pickOption(trigger: HTMLElement, optionText: string) {
    await act(async () => {
        trigger.focus();
        trigger.dispatchEvent(
            new KeyboardEvent('keydown', { bubbles: true, key: 'Enter' }),
        );
    });
    const option = [
        ...document.querySelectorAll<HTMLElement>('[role="option"]'),
    ].find((candidate) => candidate.textContent.trim() === optionText);
    if (option === undefined) throw new Error(`no option ${optionText}`);
    await act(async () => {
        option.focus();
        option.dispatchEvent(
            new KeyboardEvent('keydown', { bubbles: true, key: 'Enter' }),
        );
    });
}

async function settle() {
    await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 0));
    });
}

function typeInto(control: HTMLElement, value: string) {
    act(() => {
        Reflect.set(
            control instanceof HTMLTextAreaElement
                ? HTMLTextAreaElement.prototype
                : HTMLInputElement.prototype,
            'value',
            value,
            control,
        );
        control.dispatchEvent(new Event('input', { bubbles: true }));
    });
}

describe('ledger-only accounts across the accounts pages', () => {
    let container: HTMLDivElement;
    let root: Root;

    function render(node: ReactNode) {
        act(() => {
            root.render(node);
        });
    }

    function renderCreator() {
        render(
            <AccountCreator
                initialFirm={LISTED_FIRM.id}
                initialOptIns={NO_PLAN_OPT_INS}
                initialPlan={null}
            />,
        );
        typeInto(element(container, 'input[name="label"]'), 'Hola one');
        act(() => {
            element(container, '#account-ledger-only').click();
        });
    }

    function renderDetail(account: ReturnType<typeof ledgerOnlyAccount>) {
        harness.queries.set('propAccounts.account.get', answer(account));
        for (const name of DETAIL_QUERIES) {
            harness.queries.set(name, answer([]));
        }
        render(<AccountDetailView id={LEDGER_ID} userId={USER_ID} />);
    }

    function sectionTitled(title: string): HTMLElement {
        const section = [
            ...container.querySelectorAll<HTMLElement>(
                'section[aria-labelledby]',
            ),
        ].find(
            (candidate) =>
                container.querySelector(
                    `#${CSS.escape(candidate.getAttribute('aria-labelledby') ?? '')}`,
                )?.textContent === title,
        );
        if (section === undefined) throw new Error(`no section ${title}`);
        return section;
    }

    beforeEach(() => {
        vi.useFakeTimers({
            now: new Date(`${TODAY}T12:00:00Z`),
            toFake: ['Date'],
        });
        vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
        harness.reset();
        harness.queries.set('propAccounts.externalFirm.list', answer([HOLA]));
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

    describe('the account form', () => {
        beforeEach(() => {
            harness.queries.set('propAccounts.account.list', answer([]));
            harness.queries.set('propAccounts.copyGroup.list', answer([]));
        });

        it('lists your own firms from the firm router when creating a ledger-only account', () => {
            renderCreator();
            expect(
                optionOf(
                    container,
                    firmKeyId({
                        externalFirmId: HOLA.id,
                        kind: FirmKeyKind.External,
                    }),
                ).textContent,
            ).toBe(HOLA.name);
        });

        it('adds a firm of your own through the firm router and saves the account at it', async () => {
            harness
                .mutateAsyncOf('propAccounts.externalFirm.create')
                .mockResolvedValue({ ...SEAT, notes: null, userId: USER_ID });
            renderCreator();
            typeInto(element(container, '#account-new-firm'), SEAT.name);
            await act(async () => {
                element(container, '#account-new-firm-add').click();
                await new Promise((resolve) => setTimeout(resolve, 0));
            });
            expect(
                harness.mutateAsyncOf('propAccounts.externalFirm.create'),
            ).toHaveBeenCalledWith(
                expect.objectContaining({ name: SEAT.name }),
            );
            typeInto(element(container, 'input[name="ledgerSize"]'), '100000');
            typeInto(element(container, 'input[name="planLabel"]'), 'Seat');
            act(() => {
                element(container, '#account-include-snapshot').click();
            });
            await act(async () => {
                element(container, 'form').dispatchEvent(
                    new Event('submit', { bubbles: true, cancelable: true }),
                );
                await new Promise((resolve) => setTimeout(resolve, 0));
            });
            expect(
                harness.mutateAsyncOf('propAccounts.account.create'),
            ).toHaveBeenCalledWith(
                expect.objectContaining({
                    externalFirmId: SEAT.id,
                    firmId: null,
                    tracking: AccountTracking.LedgerOnly,
                }),
            );
        });

        it('takes an initial snapshot of a ledger-only account with only the fields the server keeps for it', async () => {
            renderCreator();
            expect(container.textContent).toContain(
                LEDGER_ONLY_SNAPSHOT_NOTICE,
            );
            expect(
                container.querySelector(
                    `#snapshot-${SnapshotField.TradingDays}`,
                ),
            ).toBeNull();
            typeInto(element(container, 'input[name="ledgerSize"]'), '100000');
            typeInto(
                element(container, 'input[name="planLabel"]'),
                'Hola 100K',
            );
            typeInto(
                element(container, `#snapshot-${SnapshotField.Balance}`),
                '101,234.56',
            );
            typeInto(
                element(container, `#snapshot-${SnapshotField.PayoutsTaken}`),
                '2',
            );
            await act(async () => {
                element(container, 'form').dispatchEvent(
                    new Event('submit', { bubbles: true, cancelable: true }),
                );
                await new Promise((resolve) => setTimeout(resolve, 0));
            });
            expect(
                harness.mutateAsyncOf('propAccounts.account.create'),
            ).toHaveBeenCalledTimes(1);
            expectSavedLedgerOnlySnapshot({
                accountId: 'created',
                asOf: TODAY,
                balanceCents: 10_123_456,
                cumulativePayoutCents: null,
                dashboardFloorCents: null,
                payoutsTaken: 2,
                source: SnapshotSource.Manual,
            });
        });

        it('refuses a ledger-only initial snapshot without a balance and saves nothing', async () => {
            renderCreator();
            typeInto(element(container, 'input[name="ledgerSize"]'), '100000');
            typeInto(
                element(container, 'input[name="planLabel"]'),
                'Hola 100K',
            );
            await act(async () => {
                element(container, 'form').dispatchEvent(
                    new Event('submit', { bubbles: true, cancelable: true }),
                );
                await new Promise((resolve) => setTimeout(resolve, 0));
            });
            expect(
                harness.mutateAsyncOf('propAccounts.account.create'),
            ).not.toHaveBeenCalled();
            expect(
                element(
                    container,
                    `#snapshot-${SnapshotField.Balance}`,
                ).getAttribute('aria-invalid'),
            ).toBe('true');
        });

        it('names the stored firm of your own when editing a ledger-only account', () => {
            harness.queries.set('propAccounts.account.get', answer(atHola()));
            render(<AccountEditor id={LEDGER_ID} />);
            const selected = [
                ...container.querySelectorAll<HTMLOptionElement>('option'),
            ].find(
                (option) =>
                    option.value ===
                    firmKeyId({
                        externalFirmId: HOLA.id,
                        kind: FirmKeyKind.External,
                    }),
            );
            expect(selected?.textContent).toBe(HOLA.name);
            expect(container.textContent).not.toContain(UNLISTED_FIRM_LABEL);
        });
    });

    it('names a firm of your own in the account list', () => {
        harness.queries.set('propAccounts.account.list', answer([atHola()]));
        harness.queries.set('propAccounts.snapshot.latestForAll', answer([]));
        harness.queries.set('propAccounts.copyGroup.list', answer([]));
        render(<AccountsTable />);
        const [row] = container.querySelectorAll(':scope tbody tr');
        expect(row?.textContent).toContain(HOLA.name);
        expect(container.textContent).not.toContain(UNLISTED_FIRM_LABEL);
    });

    it('names a firm of your own in the detail header and plan summary', () => {
        renderDetail(atHola());
        expect(element(container, 'header').textContent).toContain(HOLA.name);
        expect(sectionTitled('Plan rules').textContent).toContain(HOLA.name);
        expect(container.textContent).not.toContain(UNLISTED_FIRM_LABEL);
    });

    it('names a firm of your own on the overview and counts ledger-only accounts beside realized net per slot', () => {
        const account = atHola();
        harness.queries.set('propAccounts.account.list', answer([account]));
        harness.queries.set('propAccounts.copyGroup.list', answer([]));
        harness.queries.set(
            'propAccounts.event.list',
            answer([
                {
                    accountId: LEDGER_ID,
                    createdAt: new Date('2026-09-01T12:00:00Z'),
                    detail: { changes: [], note: null },
                    id: 'event-purchased',
                    kind: AccountEventKind.Purchased,
                    occurredOn: '2026-09-01',
                    updatedAt: new Date('2026-09-01T12:00:00Z'),
                    userId: USER_ID,
                },
            ]),
        );
        harness.queries.set('propAccounts.fee.list', answer([holaFee()]));
        harness.queries.set('propAccounts.payout.list', answer([]));
        harness.queries.set('propAccounts.snapshot.latestForAll', answer([]));
        harness.queries.set('propAccounts.rulebook.get', {
            data: undefined,
            error: new Error('rulebook not needed here'),
            isError: true,
            isPending: false,
        });
        render(<OverviewView userId={USER_ID} />);
        expect(sectionTitled('Costs').textContent).toContain(HOLA.name);
        expect(container.textContent).not.toContain(UNLISTED_FIRM_LABEL);
        expect(sectionTitled('Key figures').textContent).toContain(
            '1 ledger-only account not counted',
        );
    });

    it('checks a ledger-only import row against your own firms', async () => {
        harness.queries.set('propAccounts.account.list', answer([]));
        harness.queries.set('propAccounts.snapshot.latestForAll', answer([]));
        render(<ImportView />);
        typeInto(
            inputLabelled(container, 'CSV text'),
            [
                'label,firm,plan,accountSize,stage,purchasedOn,tracking',
                'Hola two,Hola Prime,Hola 100K,100000,funded,2026-09-01,ledger-only',
            ].join('\n'),
        );
        await settle();
        expect(container.textContent).toContain(
            'every row is ready to import.',
        );
        expect(container.textContent).not.toContain('add the firm first');
    });

    it('names a firm of your own in the ledger export', async () => {
        const blobs: Blob[] = [];
        Object.assign(URL, {
            createObjectURL: (blob: Blob) => {
                blobs.push(blob);
                return 'blob:ledger';
            },
            revokeObjectURL: vi.fn(),
        });
        harness.queries.set('propAccounts.account.list', answer([atHola()]));
        harness.queries.set('propAccounts.payout.list', answer([]));
        harness.queries.set('propAccounts.fee.list', answer([holaFee()]));
        render(<LedgerView />);
        act(() => {
            buttonLabelled(container, 'Export 1 row as CSV').click();
        });
        const [blob] = blobs;
        if (blob === undefined) throw new Error('nothing was exported');
        const text = await blob.text();
        expect(text).toContain(HOLA.name);
        expect(text).not.toContain(UNLISTED_FIRM_LABEL);
    });

    it('shows the payout approval date column and a payout lag table by firm', () => {
        harness.queries.set(
            'propAccounts.account.list',
            answer([ledgerOnlyAccount()]),
        );
        harness.queries.set(
            'propAccounts.payout.list',
            answer([
                {
                    accountId: LEDGER_ID,
                    approvedOn: '2026-09-05',
                    grossCents: 40_000,
                    id: 'payout-lag-1',
                    netCents: 40_000,
                    note: null,
                    paidOn: '2026-09-10',
                    requestedOn: '2026-09-01',
                    status: PayoutStatus.Paid,
                    userId: USER_ID,
                },
            ]),
        );
        harness.queries.set('propAccounts.fee.list', answer([]));
        render(<LedgerView />);
        const row = element(container, 'table tbody tr');
        expect(row.textContent).toContain('2026-09-05');
        expect(container.textContent).toContain('Payout lag by firm');
        expect(container.textContent).toContain('4.0 days');
        expect(container.textContent).toContain('9.0 days');
    });

    it('fails loud instead of quietly grouping a payout under an empty external firm when its account has neither a listed nor an external firm', () => {
        harness.queries.set(
            'propAccounts.account.list',
            answer([
                ledgerOnlyAccount({ externalFirmId: null, firmId: null }),
            ]),
        );
        harness.queries.set(
            'propAccounts.payout.list',
            answer([
                {
                    accountId: LEDGER_ID,
                    approvedOn: null,
                    grossCents: 10_000,
                    id: 'payout-broken',
                    netCents: 10_000,
                    note: null,
                    paidOn: '2026-09-05',
                    requestedOn: '2026-09-01',
                    status: PayoutStatus.Paid,
                    userId: USER_ID,
                },
            ]),
        );
        harness.queries.set('propAccounts.fee.list', answer([]));
        expect(() => {
            render(<LedgerView />);
        }).toThrow(/needs exactly one of a listed firm and an external firm/);
    });

    it('records a bust on a ledger-only account through the plan-free event path', async () => {
        renderDetail(ledgerOnlyAccount());
        const events = sectionTitled('Events');
        expect(events.textContent).not.toContain(
            "once the account's plan can be read again",
        );
        expect(events.textContent).toContain('ledger only');
        const trigger = inputLabelled(events, 'Event');
        await pickOption(trigger, 'Busted');
        await act(async () => {
            buttonLabelled(events, 'Record event').click();
            await new Promise((resolve) => setTimeout(resolve, 0));
        });
        expect(
            harness.mutateAsyncOf('propAccounts.event.record'),
        ).toHaveBeenCalledWith({
            accountId: LEDGER_ID,
            kind: AccountEventKind.Busted,
            note: null,
            occurredOn: TODAY,
        });
    });

    it('offers the busted, closed and concluded events on a ledger-only funded account', async () => {
        renderDetail(ledgerOnlyAccount());
        const events = sectionTitled('Events');
        await act(async () => {
            const trigger = inputLabelled(events, 'Event');
            trigger.focus();
            trigger.dispatchEvent(
                new KeyboardEvent('keydown', { bubbles: true, key: 'Enter' }),
            );
        });
        expect(offeredOptionTexts()).toEqual(
            expect.arrayContaining(['Busted', 'Closed', 'Concluded']),
        );
        expect(offeredOptionTexts()).not.toContain('Funded reset');
    });

    it('adds a snapshot to a ledger-only account from its snapshot history with only the ledger-only fields', async () => {
        renderDetail(ledgerOnlyAccount());
        const history = sectionTitled('Snapshot history');
        expect(history.textContent).toContain(LEDGER_ONLY_SNAPSHOT_NOTICE);
        expect(
            history.querySelector(`#snapshot-${SnapshotField.TradingDays}`),
        ).toBeNull();
        typeInto(
            element(history, `#snapshot-${SnapshotField.Balance}`),
            '98,500',
        );
        typeInto(
            element(history, `#snapshot-${SnapshotField.DashboardFloor}`),
            '96,000',
        );
        await act(async () => {
            buttonLabelled(history, 'Add snapshot').click();
            await new Promise((resolve) => setTimeout(resolve, 0));
        });
        expectSavedLedgerOnlySnapshot({
            accountId: LEDGER_ID,
            asOf: TODAY,
            balanceCents: 9_850_000,
            cumulativePayoutCents: null,
            dashboardFloorCents: 9_600_000,
            payoutsTaken: null,
            source: SnapshotSource.Manual,
        });
    });

    it('does not save a ledger-only snapshot without a balance', async () => {
        renderDetail(ledgerOnlyAccount());
        const history = sectionTitled('Snapshot history');
        await act(async () => {
            buttonLabelled(history, 'Add snapshot').click();
            await new Promise((resolve) => setTimeout(resolve, 0));
        });
        expect(
            harness.mutateAsyncOf('propAccounts.snapshot.create'),
        ).not.toHaveBeenCalled();
        expect(
            element(history, `#snapshot-${SnapshotField.Balance}`).getAttribute(
                'aria-invalid',
            ),
        ).toBe('true');
    });
});
