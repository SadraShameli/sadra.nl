import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type * as UseAccountValuesModule from '~/app/(app)/prop-calculator/accounts/_components/useAccountValues';

import {
    AccountStage,
    AccountStatus,
    AccountTracking,
} from '~/lib/prop-accounts';
import { ALL_FIRMS, serializePlanId } from '~/lib/prop-calculator';
import { routes } from '~/lib/site/routes';

import { AccountsTable } from './AccountsTableWithData';

interface FakeQuery {
    data: unknown;
    error: Error | null;
    isError: boolean;
    isPending: boolean;
}

const ALPHA_ID = '0b6f3c1e-1d2a-4c3b-9e8f-7a6b5c4d3e2f';
const BRAVO_ID = '5b0c3f7e-8a51-4c4e-9f0a-3d0f1c2b4a61';

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

vi.mock(
    '~/app/(app)/prop-calculator/accounts/_components/useAccountValues',
    async (importOriginal) => ({
        ...(await importOriginal<typeof UseAccountValuesModule>()),
        useAccountValuesWithEngine: () => ({
            values: { boards: null, columns: new Map(), notice: null },
        }),
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
            copyGroup: { list: harness.query('copyGroup.list') },
            externalFirm: { list: harness.query('externalFirm.list') },
            snapshot: {
                latestTwoForAll: harness.query('snapshot.latestTwoForAll'),
            },
        },
        useUtils: () => ({
            propAccounts: {
                account: { get: { cancel: vi.fn() }, invalidate: vi.fn() },
                invalidate: vi.fn(),
            },
        }),
    },
}));

const PLAN = ALL_FIRMS.flatMap((firm) => firm.plans)[0];

function account(id: string, label: string, planSerial?: string) {
    if (PLAN === undefined) throw new Error('no plan');
    return {
        accountSize: PLAN.id.accountSize,
        archivedAt: null,
        copyGroupId: null,
        externalFirmId: null,
        firmId: PLAN.id.firm,
        fundedOn: null,
        id,
        label,
        notes: null,
        optIns: {},
        planLabel: null,
        planSerial: planSerial ?? serializePlanId(PLAN.id),
        purchasedOn: '2026-09-01',
        readIssues: [],
        replacesAccountId: null,
        stage: PLAN.isInstantFunded ? AccountStage.Funded : AccountStage.Eval,
        status: AccountStatus.Active,
        tags: [],
        tracking: AccountTracking.Modeled,
        userId: 'user-a',
    };
}

function answer(data: unknown): FakeQuery {
    return { data, error: null, isError: false, isPending: false };
}

function element(scope: ParentNode, selector: string): HTMLElement {
    const found = scope.querySelector<HTMLElement>(selector);
    if (found === null) throw new Error(`nothing matches ${selector}`);
    return found;
}

function ledgerAccount(id: string, label: string, externalFirmId: string) {
    return {
        accountSize: 150_000,
        archivedAt: null,
        copyGroupId: null,
        externalFirmId,
        firmId: null,
        fundedOn: null,
        id,
        label,
        notes: null,
        optIns: {},
        planLabel: 'Hola 150K',
        planSerial: null,
        purchasedOn: '2026-09-01',
        readIssues: [],
        replacesAccountId: null,
        stage: AccountStage.Funded,
        status: AccountStatus.Active,
        tags: [],
        tracking: AccountTracking.LedgerOnly,
        userId: 'user-a',
    };
}

function offeredOptionTexts(): readonly string[] {
    return [...document.querySelectorAll<HTMLElement>('[role="option"]')].map(
        (option) => option.textContent.trim(),
    );
}

async function openListbox(trigger: HTMLElement) {
    await act(async () => {
        trigger.focus();
        trigger.dispatchEvent(
            new KeyboardEvent('keydown', { bubbles: true, key: 'Enter' }),
        );
    });
}

async function pickOption(trigger: HTMLElement, optionText: string) {
    await openListbox(trigger);
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

describe('AccountsTable', () => {
    let container: HTMLDivElement;
    let root: Root;

    function render() {
        act(() => {
            root.render(<AccountsTable />);
        });
    }

    beforeEach(() => {
        vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
        harness.queries.clear();
        harness.queries.set('copyGroup.list', answer([]));
        harness.queries.set('snapshot.latestTwoForAll', answer([]));
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

    it('links each account label to its detail page', () => {
        harness.queries.set(
            'account.list',
            answer([account(ALPHA_ID, 'Alpha'), account(BRAVO_ID, 'Bravo')]),
        );
        render();
        for (const [id, label] of [
            [ALPHA_ID, 'Alpha'],
            [BRAVO_ID, 'Bravo'],
        ] as const) {
            const link = container.querySelector<HTMLAnchorElement>(
                `a[href="${CSS.escape(routes.propCalculator.accounts.detail(id))}"]`,
            );
            expect(link?.textContent).toBe(label);
        }
    });

    it('keeps the read-only marker on the row without repeating the overview unresolvable plan alert as a banner', () => {
        harness.queries.set(
            'account.list',
            answer([account(ALPHA_ID, 'Alpha', 'no-such-plan')]),
        );
        render();
        expect(container.textContent).toContain('Read-only.');
        expect(container.textContent).not.toContain('Read-only account: Alpha');
        expect(container.querySelectorAll('[role="alert"]')).toHaveLength(0);
    });

    it('keeps the table and shows the error beside it when a refetch of the accounts fails', () => {
        harness.queries.set('account.list', {
            data: [account(ALPHA_ID, 'Alpha')],
            error: new Error('Failed to fetch'),
            isError: true,
            isPending: false,
        });
        render();
        expect(container.querySelector('table')).not.toBeNull();
        expect(container.textContent).toContain('Alpha');
        expect(container.textContent).toContain(
            'The accounts could not be refreshed',
        );
        expect(container.textContent).toContain('Failed to fetch');
    });

    it('shows only the error when the accounts never loaded', () => {
        harness.queries.set('account.list', {
            data: undefined,
            error: new Error('Failed to fetch'),
            isError: true,
            isPending: false,
        });
        render();
        expect(container.querySelector('table')).toBeNull();
        expect(container.textContent).toContain(
            'The accounts could not be loaded',
        );
    });

    it('offers each firm you added in the firm filter', async () => {
        const externalFirmId = '5d1e2f3a-4b5c-4d6e-8f70-81a2b3c4d5e6';
        harness.queries.set(
            'externalFirm.list',
            answer([{ id: externalFirmId, name: 'Hola Prime' }]),
        );
        harness.queries.set(
            'account.list',
            answer([account(ALPHA_ID, 'Alpha')]),
        );
        render();
        const trigger = element(container, '#accounts-filter-firm');
        await openListbox(trigger);
        expect(offeredOptionTexts()).toContain('Hola Prime');
    });

    it('filters ledger-only accounts at a firm you added the same as a listed firm', async () => {
        const externalFirmId = '5d1e2f3a-4b5c-4d6e-8f70-81a2b3c4d5e6';
        harness.queries.set(
            'externalFirm.list',
            answer([{ id: externalFirmId, name: 'Hola Prime' }]),
        );
        harness.queries.set(
            'account.list',
            answer([
                account(ALPHA_ID, 'Alpha'),
                ledgerAccount(BRAVO_ID, 'Bravo', externalFirmId),
            ]),
        );
        render();
        const trigger = element(container, '#accounts-filter-firm');
        await pickOption(trigger, 'Hola Prime');
        expect(container.textContent).toContain('Bravo');
        expect(container.textContent).not.toContain('Alpha');
    });
});
