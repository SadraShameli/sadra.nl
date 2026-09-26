import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { AccountsTable } from '~/app/(app)/prop-calculator/accounts/_components/AccountsTable';
import { AccountStage, AccountStatus } from '~/lib/prop-accounts';
import { ALL_FIRMS, serializePlanId } from '~/lib/prop-calculator';
import { routes } from '~/lib/site/routes';

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
            snapshot: { latestForAll: harness.query('snapshot.latestForAll') },
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
        firmId: PLAN.id.firm,
        fundedOn: null,
        id,
        label,
        notes: null,
        optIns: {},
        planSerial: planSerial ?? serializePlanId(PLAN.id),
        purchasedOn: '2026-09-01',
        readIssues: [],
        replacesAccountId: null,
        stage: PLAN.isInstantFunded ? AccountStage.Funded : AccountStage.Eval,
        status: AccountStatus.Active,
        tags: [],
        userId: 'user-a',
    };
}

function answer(data: unknown): FakeQuery {
    return { data, error: null, isError: false, isPending: false };
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
        harness.queries.set('snapshot.latestForAll', answer([]));
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
});
