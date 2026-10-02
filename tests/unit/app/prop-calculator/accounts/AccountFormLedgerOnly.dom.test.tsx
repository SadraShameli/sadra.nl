import { act } from 'react';
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
import { AccountDetailView } from '~/app/(app)/prop-calculator/accounts/_components/detail/AccountDetailView';
import {
    AccountStage,
    AccountStatus,
    AccountTracking,
    DashboardBalanceConvention,
    firmKeyId,
    FirmKeyKind,
    UpgradeChangeKind,
    upgradeChangeText,
} from '~/lib/prop-accounts';
import {
    ALL_FIRMS,
    findFirm,
    FirmId,
    NO_PLAN_OPT_INS,
    type Plan,
    serializePlanId,
    type TradingFirm,
} from '~/lib/prop-calculator';

import { AccountsTable } from './AccountsTableWithData';

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
                            isPending: false,
                            mutate: vi.fn(),
                            mutateAsync: mutateAsyncOf(name),
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

interface FirmPlan {
    readonly firm: TradingFirm;
    readonly plan: Plan;
}

const USER_ID = 'user-a';
const UNMODELED_SIZE = 150_000;
const LEDGER_ID = '0b6f3c1e-1d2a-4c3b-9e8f-7a6b5c4d3e2f';
const HOLA = { id: '5d1e2f3a-4b5c-4d6e-8f70-81a2b3c4d5e6', name: 'Hola Prime' };
const COPY_GROUP_ID = '7c2d9e4f-3a1b-4c5d-8e6f-9a0b1c2d3e4f';
const EVENTS_SECTION_NOTE = 'Events section on the account page';
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

function fiftyKPlan(): FirmPlan {
    for (const firm of ALL_FIRMS) {
        const plan = firm.plans.find(
            (candidate) =>
                !candidate.isInstantFunded &&
                firm.plans.every(
                    (sibling) => !isUnmodeledSize(sibling.id.accountSize),
                ),
        );
        if (plan !== undefined) return { firm, plan };
    }
    throw new Error('no plan without a modeled 150K size');
}

function isUnmodeledSize(accountSize: number): boolean {
    return accountSize === UNMODELED_SIZE;
}

const FIFTY_K = fiftyKPlan();

function chooseSelectValue(scope: ParentNode, value: string) {
    const select = [...scope.querySelectorAll('select')].find((candidate) =>
        [...candidate.options].some((option) => option.value === value),
    );
    if (select === undefined) throw new Error(`no select offering ${value}`);
    act(() => {
        Object.getOwnPropertyDescriptor(
            HTMLSelectElement.prototype,
            'value',
        )?.set?.call(select, value);
        select.dispatchEvent(new Event('change', { bubbles: true }));
    });
}

function element(scope: ParentNode, selector: string): HTMLElement {
    const found = scope.querySelector<HTMLElement>(selector);
    if (found === null) throw new Error(`nothing matches ${selector}`);
    return found;
}

function input(scope: ParentNode, selector: string): HTMLInputElement {
    const found = scope.querySelector<HTMLInputElement>(selector);
    if (found === null) throw new Error(`no input ${selector}`);
    return found;
}

function optionOf(scope: ParentNode, value: string): HTMLOptionElement {
    const option = [...scope.querySelectorAll('option')].find(
        (candidate) => candidate.value === value,
    );
    if (option === undefined) throw new Error(`no option ${value}`);
    return option;
}

function query(data: unknown): FakeQuery {
    return { data, error: null, isError: false, isPending: false };
}

function storedLedgerOnly(overrides: Record<string, unknown> = {}) {
    return {
        accountSize: 150_000,
        archivedAt: null,
        copyGroupId: null,
        createdAt: new Date('2026-08-01T12:00:00Z'),
        dashboardConvention: DashboardBalanceConvention.Nominal,
        externalAlias: null,
        externalFirmId: null,
        firmId: FIFTY_K.firm.id,
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
        purchasedOn: '2026-08-03',
        readIssues: [],
        replacesAccountId: null,
        roundId: null,
        stage: AccountStage.Funded,
        status: AccountStatus.Active,
        tags: [],
        tracking: AccountTracking.LedgerOnly,
        updatedAt: new Date('2026-08-01T12:00:00Z'),
        userId: USER_ID,
        ...overrides,
    };
}

async function submitForm(scope: ParentNode) {
    const form = element(scope, 'form');
    await act(async () => {
        form.dispatchEvent(
            new Event('submit', { bubbles: true, cancelable: true }),
        );
        await new Promise((resolve) => setTimeout(resolve, 0));
    });
}

function typeInto(input: HTMLInputElement, value: string) {
    act(() => {
        Object.getOwnPropertyDescriptor(
            HTMLInputElement.prototype,
            'value',
        )?.set?.call(input, value);
        input.dispatchEvent(new Event('input', { bubbles: true }));
    });
}

describe('the account form in ledger-only mode', () => {
    let container: HTMLDivElement;
    let root: Root;

    function renderCreator() {
        act(() => {
            root.render(
                <AccountCreator
                    initialFirm={FIFTY_K.firm.id}
                    initialOptIns={NO_PLAN_OPT_INS}
                    initialPlan={serializePlanId(FIFTY_K.plan.id)}
                />,
            );
        });
    }

    function skipSnapshot() {
        const includeSnapshot = element(container, '#account-include-snapshot');
        if (includeSnapshot.getAttribute('aria-checked') === 'true') {
            act(() => {
                includeSnapshot.click();
            });
        }
    }

    function toggleLedgerOnly() {
        act(() => {
            element(container, '#account-ledger-only').click();
        });
    }

    beforeEach(() => {
        vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
        harness.reset();
        harness.queries.set('propAccounts.account.list', query([]));
        harness.queries.set('propAccounts.copyGroup.list', query([]));
        harness.queries.set('propAccounts.externalFirm.list', query([HOLA]));
        harness
            .mutateAsyncOf('propAccounts.externalFirm.create')
            .mockImplementation((input: unknown) =>
                Promise.resolve({
                    id: 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d',
                    name: (input as { name: string }).name,
                }),
            );
        container = document.createElement('div');
        document.body.append(container);
        root = createRoot(container);
        renderCreator();
        typeInto(input(container, 'input[name="label"]'), 'Big one');
    });

    afterEach(() => {
        act(() => {
            root.unmount();
        });
        document.body.replaceChildren();
        vi.unstubAllGlobals();
    });

    it('keeps unmodeled sizes disabled until the toggle switches to ledger-only fields', () => {
        expect(optionOf(container, '150000').disabled).toBe(true);
        expect(container.querySelector('input[name="planLabel"]')).toBeNull();
        toggleLedgerOnly();
        expect(
            element(container, '#account-ledger-only').getAttribute(
                'aria-checked',
            ),
        ).toBe('true');
        expect(optionOf(container, '150000').disabled).toBe(false);
        expect(
            container.querySelector('input[name="planLabel"]'),
        ).not.toBeNull();
        expect(
            container.querySelector('input[name="ledgerSize"]'),
        ).not.toBeNull();
        expect(
            container.querySelector('#account-include-snapshot'),
        ).not.toBeNull();
        expect(container.textContent).toContain(
            'The engine never values a ledger-only account',
        );
    });

    it('offers the listed firms and your own firms in one firm picker', () => {
        toggleLedgerOnly();
        const own = firmKeyId({
            externalFirmId: HOLA.id,
            kind: FirmKeyKind.External,
        });
        expect(optionOf(container, own).textContent).toBe('Hola Prime');
        expect(
            optionOf(
                container,
                firmKeyId({ firmId: FirmId.Lucid, kind: FirmKeyKind.Modeled }),
            ).textContent,
        ).toBe(findFirm(FirmId.Lucid)?.displayName);
    });

    it('saves a ledger-only account at a listed firm with a size the engine does not model', async () => {
        toggleLedgerOnly();
        chooseSelectValue(container, '150000');
        expect(input(container, 'input[name="ledgerSize"]').value).toBe(
            '150000',
        );
        const planLabel = input(container, 'input[name="planLabel"]');
        expect(planLabel.value).toContain('$150K');
        typeInto(planLabel, 'Rapid 150K');
        skipSnapshot();
        await submitForm(container);
        const create = harness.mutateAsyncOf('propAccounts.account.create');
        expect(create).toHaveBeenCalledTimes(1);
        expect(create).toHaveBeenCalledWith(
            expect.objectContaining({
                accountSize: 150_000,
                externalFirmId: null,
                firmId: FIFTY_K.firm.id,
                label: 'Big one',
                planLabel: 'Rapid 150K',
                tracking: AccountTracking.LedgerOnly,
            }),
        );
    });

    it('saves a ledger-only account at one of your firms with a free size', async () => {
        toggleLedgerOnly();
        chooseSelectValue(
            container,
            firmKeyId({ externalFirmId: HOLA.id, kind: FirmKeyKind.External }),
        );
        typeInto(input(container, 'input[name="ledgerSize"]'), '123,457');
        typeInto(input(container, 'input[name="planLabel"]'), 'Hola 125K');
        skipSnapshot();
        await submitForm(container);
        expect(
            harness.mutateAsyncOf('propAccounts.account.create'),
        ).toHaveBeenCalledWith(
            expect.objectContaining({
                accountSize: 123_457,
                externalFirmId: HOLA.id,
                firmId: null,
                planLabel: 'Hola 125K',
                tracking: AccountTracking.LedgerOnly,
            }),
        );
    });

    it('adds a firm of your own from the picker and selects it', async () => {
        toggleLedgerOnly();
        typeInto(input(container, '#account-new-firm'), 'Funded Seat');
        await act(async () => {
            element(container, '#account-new-firm-add').click();
            await new Promise((resolve) => setTimeout(resolve, 0));
        });
        expect(
            harness.mutateAsyncOf('propAccounts.externalFirm.create'),
        ).toHaveBeenCalledWith({ name: 'Funded Seat' });
        typeInto(input(container, 'input[name="ledgerSize"]'), '100000');
        typeInto(input(container, 'input[name="planLabel"]'), 'Seat 100K');
        skipSnapshot();
        await submitForm(container);
        expect(
            harness.mutateAsyncOf('propAccounts.account.create'),
        ).toHaveBeenCalledWith(
            expect.objectContaining({
                externalFirmId: 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d',
                firmId: null,
            }),
        );
    });

    it('hides the copy group in ledger-only mode and saves no copy group', async () => {
        harness.queries.set(
            'propAccounts.copyGroup.list',
            query([{ id: COPY_GROUP_ID, name: 'Apex copy' }]),
        );
        renderCreator();
        chooseSelectValue(container, COPY_GROUP_ID);
        toggleLedgerOnly();
        expect(
            [...container.querySelectorAll('option')].some(
                (option) => option.value === COPY_GROUP_ID,
            ),
        ).toBe(false);
        typeInto(input(container, 'input[name="label"]'), 'Big one');
        typeInto(input(container, 'input[name="planLabel"]'), 'Rapid 150K');
        skipSnapshot();
        await submitForm(container);
        expect(
            harness.mutateAsyncOf('propAccounts.account.create'),
        ).toHaveBeenCalledWith(
            expect.objectContaining({
                copyGroupId: null,
                tracking: AccountTracking.LedgerOnly,
            }),
        );
    });

    it('restores a modeled plan of its own size when the toggle is turned off again', async () => {
        toggleLedgerOnly();
        chooseSelectValue(container, '150000');
        toggleLedgerOnly();
        expect(
            element(container, '#account-ledger-only').getAttribute(
                'aria-checked',
            ),
        ).toBe('false');
        skipSnapshot();
        await submitForm(container);
        const create = harness.mutateAsyncOf('propAccounts.account.create');
        expect(create).toHaveBeenCalledTimes(1);
        const [[saved]] = create.mock.calls as [
            [{ accountSize: number; planSerial: string; tracking: string }],
        ];
        expect(saved.tracking).toBe(AccountTracking.Modeled);
        expect(saved.accountSize).not.toBe(UNMODELED_SIZE);
        expect(
            FIFTY_K.firm.findPlanBySerial(saved.planSerial)?.id.accountSize,
        ).toBe(saved.accountSize);
    });

    it('says where to record a bust, a closure or the end of the account', () => {
        toggleLedgerOnly();
        expect(container.textContent).toContain(EVENTS_SECTION_NOTE);
    });

    it('refuses a size that is not a whole dollar amount and saves nothing', async () => {
        toggleLedgerOnly();
        typeInto(input(container, 'input[name="ledgerSize"]'), '12.5');
        typeInto(input(container, 'input[name="planLabel"]'), 'Odd');
        skipSnapshot();
        await submitForm(container);
        expect(
            harness.mutateAsyncOf('propAccounts.account.create'),
        ).not.toHaveBeenCalled();
        expect(
            input(container, 'input[name="ledgerSize"]').getAttribute(
                'aria-invalid',
            ),
        ).toBe('true');
    });

    it('shows a plain notice instead of blocking account creation when the firm list fails to load', () => {
        harness.queries.set('propAccounts.externalFirm.list', {
            data: undefined,
            error: new Error('Failed to fetch'),
            isError: true,
            isPending: false,
        });
        renderCreator();
        expect(container.textContent).toContain(
            'Your firms could not be loaded',
        );
        expect(container.textContent).toContain('Failed to fetch');
        expect(container.querySelector('form')).not.toBeNull();
    });
});

describe('a stored ledger-only account', () => {
    let container: HTMLDivElement;
    let root: Root;

    beforeEach(() => {
        vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
        harness.reset();
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

    it('edits in ledger-only mode without letting the toggle switch it to modeled', async () => {
        harness.queries.set(
            'propAccounts.account.get',
            query(storedLedgerOnly()),
        );
        harness.queries.set('propAccounts.account.list', query([]));
        harness.queries.set('propAccounts.copyGroup.list', query([]));
        act(() => {
            root.render(<AccountEditor id={LEDGER_ID} />);
        });
        const toggle = element(container, '#account-ledger-only');
        expect(toggle.getAttribute('aria-checked')).toBe('true');
        expect(toggle.hasAttribute('disabled')).toBe(true);
        expect(input(container, 'input[name="planLabel"]').value).toBe(
            'Rapid 150K',
        );
        await submitForm(container);
        expect(
            harness.mutateAsyncOf('propAccounts.account.update'),
        ).toHaveBeenCalledWith(
            expect.objectContaining({
                accountSize: 150_000,
                id: LEDGER_ID,
                planLabel: 'Rapid 150K',
                tracking: AccountTracking.LedgerOnly,
            }),
        );
    });

    it('warns instead of silently falling back to an unlisted firm when the firm list fails to load', () => {
        harness.queries.set(
            'propAccounts.account.get',
            query(storedLedgerOnly({ externalFirmId: HOLA.id, firmId: null })),
        );
        harness.queries.set('propAccounts.account.list', query([]));
        harness.queries.set('propAccounts.copyGroup.list', query([]));
        harness.queries.set('propAccounts.externalFirm.list', {
            data: undefined,
            error: new Error('Failed to fetch'),
            isError: true,
            isPending: false,
        });
        act(() => {
            root.render(<AccountEditor id={LEDGER_ID} />);
        });
        expect(container.textContent).toContain(
            'Your firms could not be loaded',
        );
        expect(container.textContent).toContain('Failed to fetch');
        expect(container.querySelector('form')).toBeNull();
    });

    it('shows a ledger only badge and its plan label in the account list', () => {
        harness.queries.set(
            'propAccounts.account.list',
            query([
                storedLedgerOnly(),
                storedLedgerOnly({
                    externalFirmId: HOLA.id,
                    firmId: null,
                    id: '5b0c3f7e-8a51-4c4e-9f0a-3d0f1c2b4a61',
                    label: 'Hola one',
                    planLabel: 'Hola 100K',
                }),
            ]),
        );
        harness.queries.set('propAccounts.snapshot.latestForAll', query([]));
        harness.queries.set('propAccounts.copyGroup.list', query([]));
        act(() => {
            root.render(<AccountsTable />);
        });
        const rows = [...container.querySelectorAll(':scope tbody tr')];
        expect(rows).toHaveLength(2);
        for (const row of rows) {
            expect(row.textContent).toContain('Ledger only');
            expect(row.querySelector('a[aria-label^="Edit"]')).not.toBeNull();
        }
        const text = container.textContent;
        expect(text).toContain(FIFTY_K.firm.displayName);
        expect(text).toContain('Rapid 150K');
        expect(text).toContain('Hola 100K');
        expect(text).not.toContain('Read-only');
    });

    it('shows the plan label and a not modeled note instead of the engine plan rules on the detail page', () => {
        renderDetail(storedLedgerOnly());
        expect(container.textContent).toContain(EVENTS_SECTION_NOTE);
        const rules = element(
            container,
            'section[aria-labelledby="prop-account-rules-heading"]',
        );
        expect(rules.textContent).toContain('Rapid 150K');
        expect(rules.textContent).toContain('Ledger only');
        expect(rules.textContent).toContain('not modeled');
        expect(rules.textContent).not.toContain('Profit target');
        expect(container.textContent).not.toContain(
            'This account is read-only',
        );
        expect(element(container, 'h1').textContent).toBe('Big one');
    });

    it('upgrades a ledger-only account to a modeled plan from the detail page', async () => {
        renderDetail(
            storedLedgerOnly({ accountSize: FIFTY_K.plan.id.accountSize }),
        );
        chooseSelectValue(container, serializePlanId(FIFTY_K.plan.id));
        await clickUpgrade();
        expect(
            harness.mutateAsyncOf('propAccounts.account.upgradeToModeled'),
        ).toHaveBeenCalledWith({
            accountSize: FIFTY_K.plan.id.accountSize,
            confirmSizeOrFirmChange: false,
            firmId: FIFTY_K.firm.id,
            id: LEDGER_ID,
            optIns: NO_PLAN_OPT_INS,
            planSerial: serializePlanId(FIFTY_K.plan.id),
        });
    });

    it('starts the upgrade on a plan of the stored size at the stored firm', async () => {
        const size: number = FIFTY_K.plan.id.accountSize;
        const firstOfSize = FIFTY_K.firm.plans.find(
            (plan) => plan.id.accountSize === size,
        );
        renderDetail(storedLedgerOnly({ accountSize: size }));
        expect(container.querySelector('#account-upgrade-confirm')).toBeNull();
        await clickUpgrade();
        expect(
            harness.mutateAsyncOf('propAccounts.account.upgradeToModeled'),
        ).toHaveBeenCalledWith(
            expect.objectContaining({
                accountSize: size,
                confirmSizeOrFirmChange: false,
                firmId: FIFTY_K.firm.id,
                planSerial:
                    firstOfSize === undefined
                        ? undefined
                        : serializePlanId(firstOfSize.id),
            }),
        );
    });

    it('asks for an explicit confirmation before an upgrade changes the stored size', async () => {
        renderDetail(storedLedgerOnly({ accountSize: UNMODELED_SIZE }));
        expect(container.textContent).toContain(
            'This changes the account size from $150,000 to',
        );
        expect(
            element(container, '#account-upgrade').hasAttribute('disabled'),
        ).toBe(true);
        act(() => {
            element(container, '#account-upgrade-confirm').click();
        });
        await clickUpgrade();
        expect(
            harness.mutateAsyncOf('propAccounts.account.upgradeToModeled'),
        ).toHaveBeenCalledWith(
            expect.objectContaining({
                confirmSizeOrFirmChange: true,
                firmId: FIFTY_K.firm.id,
                id: LEDGER_ID,
            }),
        );
    });

    it('names a move to another listed firm in the words the server uses, and waits for a confirmation', () => {
        const other = ALL_FIRMS.find((firm) => firm.id !== FIFTY_K.firm.id);
        if (other === undefined) throw new Error('only one firm listed');
        renderDetail(
            storedLedgerOnly({ accountSize: FIFTY_K.plan.id.accountSize }),
        );
        chooseSelectValue(container, other.id);
        expect(container.textContent).toContain(
            `This changes ${upgradeChangeText(
                {
                    from: {
                        firmId: FIFTY_K.firm.id,
                        kind: FirmKeyKind.Modeled,
                    },
                    kind: UpgradeChangeKind.Firm,
                    to: other.id,
                },
                [],
            )}.`,
        );
        expect(
            element(container, '#account-upgrade').hasAttribute('disabled'),
        ).toBe(true);
    });

    it('names the firm of your own the account moves away from, and waits for a confirmation', async () => {
        harness.queries.set('propAccounts.externalFirm.list', query([HOLA]));
        renderDetail(
            storedLedgerOnly({
                accountSize: FIFTY_K.plan.id.accountSize,
                externalFirmId: HOLA.id,
                firmId: null,
            }),
        );
        chooseSelectValue(container, FIFTY_K.firm.id);
        expect(container.textContent).toContain(
            `This changes the firm from ${HOLA.name} to ${FIFTY_K.firm.displayName}.`,
        );
        expect(
            element(container, '#account-upgrade').hasAttribute('disabled'),
        ).toBe(true);
        act(() => {
            element(container, '#account-upgrade-confirm').click();
        });
        await clickUpgrade();
        expect(
            harness.mutateAsyncOf('propAccounts.account.upgradeToModeled'),
        ).toHaveBeenCalledWith(
            expect.objectContaining({
                confirmSizeOrFirmChange: true,
                firmId: FIFTY_K.firm.id,
                id: LEDGER_ID,
            }),
        );
    });

    it('announces the changes it asks to confirm and ties the checkbox and the upgrade button to them', () => {
        renderDetail(
            storedLedgerOnly({ accountSize: FIFTY_K.plan.id.accountSize }),
        );
        const status = element(
            container,
            '[role="status"]#account-upgrade-changes',
        );
        expect(status.textContent).toBe('');
        expect(
            element(container, '#account-upgrade').getAttribute(
                'aria-describedby',
            ),
        ).toBeNull();
        const other = ALL_FIRMS.find((firm) => firm.id !== FIFTY_K.firm.id);
        if (other === undefined) throw new Error('only one firm listed');
        chooseSelectValue(container, other.id);
        expect(
            element(container, '#account-upgrade-changes').textContent,
        ).toContain('This changes the firm from');
        expect(
            element(container, '#account-upgrade-confirm').getAttribute(
                'aria-describedby',
            ),
        ).toBe('account-upgrade-changes');
        expect(
            element(container, '#account-upgrade').getAttribute(
                'aria-describedby',
            ),
        ).toBe('account-upgrade-changes');
    });

    async function clickUpgrade() {
        await act(async () => {
            element(container, '#account-upgrade').click();
            await new Promise((resolve) => setTimeout(resolve, 0));
        });
    }

    function renderDetail(account: ReturnType<typeof storedLedgerOnly>) {
        harness.queries.set('propAccounts.account.get', query(account));
        for (const name of DETAIL_QUERIES) {
            harness.queries.set(name, query([]));
        }
        act(() => {
            root.render(<AccountDetailView id={LEDGER_ID} userId={USER_ID} />);
        });
    }
});
