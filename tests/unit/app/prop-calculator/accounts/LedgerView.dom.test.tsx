import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { LedgerView } from '~/app/(app)/prop-calculator/accounts/ledger/LedgerView';
import {
    AccountStage,
    AccountStatus,
    AccountTracking,
    BankrollTransferKind,
    DashboardBalanceConvention,
    ReportedPayoutBasis,
} from '~/lib/prop-accounts';
import {
    ALL_FIRMS,
    NO_PLAN_OPT_INS,
    serializePlanId,
} from '~/lib/prop-calculator';

interface FakeQuery {
    data: unknown;
    error: null | { message: string };
    isError: boolean;
    isPending: boolean;
}

function firstModeledPlan() {
    const [firm] = ALL_FIRMS;
    const [plan] = firm?.plans ?? [];
    if (firm === undefined || plan === undefined) {
        throw new Error('no modeled plan for the ledger view test');
    }
    return { firm, plan };
}

const { firm: FIRM, plan: PLAN } = firstModeledPlan();
const USER_ID = 'user-a';
const ACCOUNT_ID = '2a4c6e8f-1b3d-4f5a-9c7e-0d2f4a6c8e1b';
const TRANSFER_ID = '5b0c3f7e-8a51-4c4e-9f0a-3d0f1c2b4a61';
const STATEMENT_ID = '9c1d2e3f-4a5b-4c6d-8e7f-0a1b2c3d4e5f';

const harness = vi.hoisted(() => {
    const queries = new Map<string, FakeQuery>();
    const mutate = new Map<string, ReturnType<typeof vi.fn>>();
    const pending: FakeQuery = {
        data: undefined,
        error: null,
        isError: false,
        isPending: true,
    };
    function mutateOf(name: string) {
        const existing = mutate.get(name);
        if (existing !== undefined) return existing;
        const created = vi.fn(() => Promise.resolve({}));
        mutate.set(name, created);
        return created;
    }
    return {
        mutateOf,
        mutation: (name: string) => ({
            useMutation: () => ({
                isPending: false,
                mutate: mutateOf(name),
                mutateAsync: mutateOf(name),
            }),
        }),
        queries,
        query: (name: string) => ({
            useQuery: () => queries.get(name) ?? pending,
        }),
        reset() {
            queries.clear();
            mutate.clear();
        },
    };
});

vi.mock('next/navigation', () => ({
    usePathname: () => '/prop-calculator/accounts/ledger',
    useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
    useSearchParams: () => new URLSearchParams(),
}));

vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

vi.mock('~/lib/auth/client', () => ({
    useSession: () => ({
        data: { user: { id: USER_ID } },
        error: null,
        isPending: false,
    }),
}));

vi.mock('~/trpc/react', () => ({
    api: {
        propAccounts: {
            account: { list: harness.query('account.list') },
            bankroll: {
                create: harness.mutation('bankroll.create'),
                list: harness.query('bankroll.list'),
                remove: harness.mutation('bankroll.remove'),
                update: harness.mutation('bankroll.update'),
            },
            externalFirm: { list: harness.query('externalFirm.list') },
            fee: { list: harness.query('fee.list') },
            firmStatement: {
                create: harness.mutation('firmStatement.create'),
                list: harness.query('firmStatement.list'),
                remove: harness.mutation('firmStatement.remove'),
                update: harness.mutation('firmStatement.update'),
            },
            payout: { list: harness.query('payout.list') },
        },
        useUtils: () => ({
            propAccounts: { invalidate: () => Promise.resolve() },
        }),
    },
}));

function account(overrides: Record<string, unknown> = {}) {
    return {
        accountSize: PLAN.id.accountSize,
        archivedAt: null,
        copyGroupId: null,
        createdAt: new Date('2026-06-01T12:00:00Z'),
        dashboardConvention: DashboardBalanceConvention.Nominal,
        externalAlias: null,
        externalFirmId: null,
        firmId: FIRM.id,
        firstFundedTradeOn: null,
        fundedOn: null,
        id: ACCOUNT_ID,
        label: 'Alpha',
        liveStartBalanceCents: null,
        notes: null,
        optIns: NO_PLAN_OPT_INS,
        personalRules: {},
        planLabel: null,
        planRulesFingerprint: null,
        planSerial: serializePlanId(PLAN.id),
        purchasedOn: '2026-06-01',
        readIssues: [],
        replacesAccountId: null,
        roundId: null,
        stage: AccountStage.Funded,
        status: AccountStatus.Active,
        tags: [],
        tracking: AccountTracking.Modeled,
        updatedAt: new Date('2026-06-01T12:00:00Z'),
        userId: USER_ID,
        ...overrides,
    };
}

function answer(data: unknown): FakeQuery {
    return { data, error: null, isError: false, isPending: false };
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

function failed(message: string): FakeQuery {
    return {
        data: undefined,
        error: { message },
        isError: true,
        isPending: false,
    };
}

function input(scope: ParentNode, selector: string): HTMLInputElement {
    const found = scope.querySelector<HTMLInputElement>(selector);
    if (found === null) throw new Error(`no input ${selector}`);
    return found;
}

function selectOffering(scope: ParentNode, value: string): HTMLSelectElement {
    const select = [...scope.querySelectorAll('select')].find((candidate) =>
        [...candidate.options].some((option) => option.value === value),
    );
    if (select === undefined) throw new Error(`no select offering ${value}`);
    return select;
}

async function submitForm(scope: ParentNode, label: string) {
    const form = element(scope, `form[aria-label="${label}"]`);
    await act(async () => {
        form.dispatchEvent(
            new Event('submit', { bubbles: true, cancelable: true }),
        );
        await new Promise((resolve) => setTimeout(resolve, 0));
    });
}

function typeInto(target: HTMLInputElement, value: string) {
    act(() => {
        Object.getOwnPropertyDescriptor(
            HTMLInputElement.prototype,
            'value',
        )?.set?.call(target, value);
        target.dispatchEvent(new Event('input', { bubbles: true }));
    });
}

describe('LedgerView bankroll and reconciliation (PT-58a3)', () => {
    let container: HTMLDivElement;
    let root: Root;

    function render() {
        act(() => {
            root.render(<LedgerView />);
        });
    }

    beforeEach(() => {
        vi.useFakeTimers({
            now: new Date('2026-09-26T12:00:00Z'),
            toFake: ['Date'],
        });
        vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
        harness.reset();
        harness.queries.set('account.list', answer([]));
        harness.queries.set('bankroll.list', answer([]));
        harness.queries.set('externalFirm.list', answer([]));
        harness.queries.set('fee.list', answer([]));
        harness.queries.set('firmStatement.list', answer([]));
        harness.queries.set('payout.list', answer([]));
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

    it('lists a recorded deposit and its amount', () => {
        harness.queries.set(
            'bankroll.list',
            answer([
                {
                    amountCents: 500_000,
                    id: TRANSFER_ID,
                    kind: BankrollTransferKind.Deposit,
                    note: null,
                    occurredOn: '2026-06-01',
                    userId: USER_ID,
                },
            ]),
        );
        render();
        expect(container.textContent).toContain('Deposit');
        expect(container.textContent).toContain('$5,000');
    });

    it('records a deposit through bankroll.create with exact cents', async () => {
        render();
        typeInto(input(container, 'input[placeholder="0.00"]'), '1,000.50');
        await submitForm(container, 'Add a transfer');
        expect(harness.mutateOf('bankroll.create')).toHaveBeenCalledWith({
            amountCents: 100_050,
            kind: BankrollTransferKind.Deposit,
            note: null,
            occurredOn: '2026-09-26',
        });
    });

    it('deletes a transfer through bankroll.remove', async () => {
        harness.queries.set(
            'bankroll.list',
            answer([
                {
                    amountCents: 200_000,
                    id: TRANSFER_ID,
                    kind: BankrollTransferKind.Withdrawal,
                    note: null,
                    occurredOn: '2026-06-01',
                    userId: USER_ID,
                },
            ]),
        );
        render();
        act(() => {
            buttonLabelled(
                container,
                'Delete the Personal withdrawal on 2026-06-01',
            ).click();
        });
        act(() => {
            buttonLabelled(document, 'Delete').click();
        });
        expect(harness.mutateOf('bankroll.remove')).toHaveBeenCalledWith({
            id: TRANSFER_ID,
        });
    });

    it('shows a firm reconciliation entry with the ledger total and the difference', () => {
        harness.queries.set('account.list', answer([account()]));
        harness.queries.set(
            'payout.list',
            answer([
                {
                    accountId: ACCOUNT_ID,
                    approvedOn: null,
                    grossCents: 100_000,
                    id: 'payout-1',
                    netCents: 90_000,
                    note: null,
                    paidOn: '2026-09-01',
                    requestedOn: '2026-08-25',
                    status: 'paid',
                    userId: USER_ID,
                },
            ]),
        );
        harness.queries.set(
            'firmStatement.list',
            answer([
                {
                    asOf: '2026-09-05',
                    basis: ReportedPayoutBasis.Net,
                    externalFirmId: null,
                    firmId: FIRM.id,
                    id: STATEMENT_ID,
                    note: null,
                    reportedPayoutCents: 100_000,
                    userId: USER_ID,
                },
            ]),
        );
        render();
        const row = element(container, '#prop-reconciliation-heading').closest(
            'section',
        );
        if (row === null) throw new Error('no reconciliation section');
        expect(row.textContent).toContain(FIRM.displayName);
        expect(row.textContent).toContain('$1,000');
        expect(row.textContent).toContain('$900');
        expect(row.textContent).toContain('$100');
    });

    it('records a firm statement through firmStatement.create with the picked firm', async () => {
        render();
        const form = element(
            container,
            'form[aria-label="Add a firm statement"]',
        );
        const firmValue = `modeled:${FIRM.id}`;
        chooseSelectValue(form, firmValue);
        chooseSelectValue(form, ReportedPayoutBasis.Net);
        typeInto(input(form, 'input[placeholder="0.00"]'), '2,500');
        await submitForm(container, 'Add a firm statement');
        expect(harness.mutateOf('firmStatement.create')).toHaveBeenCalledWith({
            asOf: '2026-09-26',
            basis: ReportedPayoutBasis.Net,
            externalFirmId: null,
            firmId: FIRM.id,
            note: null,
            reportedPayoutCents: 250_000,
        });
    });

    it('edits a firm statement in place through firmStatement.update', async () => {
        harness.queries.set('account.list', answer([account()]));
        harness.queries.set(
            'firmStatement.list',
            answer([
                {
                    asOf: '2026-09-05',
                    basis: ReportedPayoutBasis.Net,
                    externalFirmId: null,
                    firmId: FIRM.id,
                    id: STATEMENT_ID,
                    note: 'from the dashboard',
                    reportedPayoutCents: 100_000,
                    userId: USER_ID,
                },
            ]),
        );
        render();
        act(() => {
            buttonLabelled(
                container,
                'Edit the statement as of 2026-09-05',
            ).click();
        });
        const form = element(
            container,
            'form[aria-label="Edit firm statement"]',
        );
        expect(input(form, 'input[placeholder="0.00"]').value).toBe('1000');
        typeInto(input(form, 'input[placeholder="0.00"]'), '1,200');
        await submitForm(container, 'Edit firm statement');
        expect(harness.mutateOf('firmStatement.update')).toHaveBeenCalledWith({
            asOf: '2026-09-05',
            basis: ReportedPayoutBasis.Net,
            id: STATEMENT_ID,
            note: 'from the dashboard',
            reportedPayoutCents: 120_000,
        });
    });

    it('surfaces an accounts load failure instead of silently showing no discrepancies', () => {
        harness.queries.set('account.list', failed('accounts down'));
        harness.queries.set(
            'firmStatement.list',
            answer([
                {
                    asOf: '2026-09-05',
                    basis: ReportedPayoutBasis.Net,
                    externalFirmId: null,
                    firmId: FIRM.id,
                    id: STATEMENT_ID,
                    note: null,
                    reportedPayoutCents: 100_000,
                    userId: USER_ID,
                },
            ]),
        );
        render();
        const section = element(
            container,
            '#prop-reconciliation-heading',
        ).closest('section');
        if (section === null) throw new Error('no reconciliation section');
        expect(section.textContent).toContain('accounts down');
        expect(section.querySelector('table')).toBeNull();
    });

    it('surfaces a payouts load failure instead of silently showing no discrepancies', () => {
        harness.queries.set('account.list', answer([account()]));
        harness.queries.set('payout.list', failed('payouts down'));
        harness.queries.set(
            'firmStatement.list',
            answer([
                {
                    asOf: '2026-09-05',
                    basis: ReportedPayoutBasis.Net,
                    externalFirmId: null,
                    firmId: FIRM.id,
                    id: STATEMENT_ID,
                    note: null,
                    reportedPayoutCents: 100_000,
                    userId: USER_ID,
                },
            ]),
        );
        render();
        const section = element(
            container,
            '#prop-reconciliation-heading',
        ).closest('section');
        if (section === null) throw new Error('no reconciliation section');
        expect(section.textContent).toContain('payouts down');
        expect(section.querySelector('table')).toBeNull();
    });

    it('renders the deposit and withdrawal edit action as a pencil icon, not overflow text', () => {
        harness.queries.set(
            'bankroll.list',
            answer([
                {
                    amountCents: 200_000,
                    id: TRANSFER_ID,
                    kind: BankrollTransferKind.Withdrawal,
                    note: null,
                    occurredOn: '2026-06-01',
                    userId: USER_ID,
                },
            ]),
        );
        render();
        const editButton = buttonLabelled(
            container,
            'Edit the Personal withdrawal on 2026-06-01',
        );
        expect(editButton.querySelector('svg')).not.toBeNull();
        expect(editButton.textContent.trim()).toBe('');
    });

    it('starts a new statement with no basis chosen and blocks the submit with a message until one is picked', async () => {
        render();
        const form = element(
            container,
            'form[aria-label="Add a firm statement"]',
        );
        expect(selectOffering(form, ReportedPayoutBasis.Net).value).toBe('');
        chooseSelectValue(form, `modeled:${FIRM.id}`);
        typeInto(input(form, 'input[placeholder="0.00"]'), '2,500');
        await submitForm(container, 'Add a firm statement');
        expect(harness.mutateOf('firmStatement.create')).not.toHaveBeenCalled();
        expect(form.textContent).toContain(
            'Choose whether the reported total is gross or net',
        );
        chooseSelectValue(form, ReportedPayoutBasis.Gross);
        await submitForm(container, 'Add a firm statement');
        expect(harness.mutateOf('firmStatement.create')).toHaveBeenCalledWith(
            expect.objectContaining({ basis: ReportedPayoutBasis.Gross }),
        );
    });

    it('labels a difference beyond the tolerance in text and keeps the down-from-previous line', () => {
        harness.queries.set('account.list', answer([account()]));
        harness.queries.set(
            'payout.list',
            answer([
                {
                    accountId: ACCOUNT_ID,
                    approvedOn: null,
                    grossCents: 100_000,
                    id: 'payout-1',
                    netCents: 100_000,
                    note: null,
                    paidOn: '2026-09-01',
                    requestedOn: '2026-08-25',
                    status: 'paid',
                    userId: USER_ID,
                },
            ]),
        );
        const statement = (id: string, asOf: string, cents: number) => ({
            asOf,
            basis: ReportedPayoutBasis.Net,
            externalFirmId: null,
            firmId: FIRM.id,
            id,
            note: null,
            reportedPayoutCents: cents,
            userId: USER_ID,
        });
        harness.queries.set(
            'firmStatement.list',
            answer([
                statement(STATEMENT_ID, '2026-09-05', 100_000),
                statement('statement-2', '2026-09-10', 50_000),
            ]),
        );
        render();
        const section = element(
            container,
            '#prop-reconciliation-heading',
        ).closest('section');
        if (section === null) throw new Error('no reconciliation section');
        const rows = [...section.querySelectorAll(':scope tbody tr')];
        expect(rows).toHaveLength(2);
        expect(rows[0]?.textContent).not.toContain('Outside tolerance');
        expect(rows[0]?.textContent).not.toContain(
            'Down from the previous statement',
        );
        expect(rows[1]?.textContent).toContain('Outside tolerance');
        expect(rows[1]?.textContent).toContain(
            'Down from the previous statement',
        );
    });
});
