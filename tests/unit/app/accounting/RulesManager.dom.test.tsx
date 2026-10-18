import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { RulesManager } from '~/app/(app)/accounting/_components/RulesManager';

import {
    cancelDialog,
    dialogTitled,
    submitDialog,
    typeInto,
} from '../../components/formDialog';
import {
    chooseRowAction,
    clickRowAction,
    confirmRowAction,
    isRowActionDisabled,
    openRowActions,
} from '../../components/rowActionsMenu';

const backend = vi.hoisted(() => {
    const ledger = { id: '4000', label: '4000 Office' };
    const rule = (id: string, match: string, sortOrder: number) => ({
        currency: null,
        dateFrom: null,
        dateTo: null,
        direction: 'OUT',
        display: `${match} counterpart`,
        id,
        ledger,
        match,
        matchType: 'contains',
        maxAmount: null,
        minAmount: null,
        sortOrder,
        taxCode: 'BI_EU_INK',
    });
    return {
        bankAccounts: [{ currency: 'EUR', id: 'bank-eur', ledger }],
        deleteBankAccount: vi.fn(),
        deleteRule: vi.fn(),
        isBacktestFetching: false,
        reorderRules: vi.fn(),
        rules: [rule('rule-a', 'amazon', 0), rule('rule-b', 'bol', 1)],
        source: undefined as
            | undefined
            | { id: string; isActive: boolean; kind: string; label: string },
        updateRule: vi.fn(),
    };
});

vi.mock('~/trpc/react', () => {
    const invalidate = { invalidate: vi.fn() };
    return {
        api: {
            accounting: {
                bankAccounts: {
                    delete: mutationHook(backend.deleteBankAccount),
                    list: {
                        useQuery: () => ({
                            data: backend.bankAccounts,
                            isPending: false,
                        }),
                    },
                    upsert: mutationHook(vi.fn()),
                },
                ledgers: { list: { useQuery: () => ({ data: [] }) } },
                rules: {
                    backtest: {
                        useQuery: () => ({
                            data: undefined,
                            isFetching: backend.isBacktestFetching,
                        }),
                    },
                    create: mutationHook(vi.fn()),
                    delete: mutationHook(backend.deleteRule),
                    list: {
                        useQuery: () => ({
                            data: backend.rules,
                            isPending: false,
                        }),
                    },
                    reorder: mutationHook(backend.reorderRules),
                    update: mutationHook(backend.updateRule),
                },
                taxCodes: {
                    list: {
                        useQuery: () => ({
                            data: [{ code: 'BI_EU_INK', label: 'EU purchase' }],
                            isPending: false,
                        }),
                    },
                },
            },
            useUtils: () => ({
                accounting: {
                    bankAccounts: { list: invalidate },
                    rules: { list: invalidate },
                },
            }),
        },
    };
});

vi.mock('~/app/(app)/accounting/_components/useActiveCredentials', () => ({
    useActiveCredentials: () => ({
        accounting: {
            id: 'books',
            isActive: true,
            kind: 'eboekhouden',
            label: 'Books',
        },
        isLoading: false,
        source: backend.source,
        sources: [],
    }),
}));

function mutationHook(mutate: (input: unknown) => void) {
    return {
        useMutation: () => ({
            isPending: false,
            mutate,
            variables: undefined,
        }),
    };
}

describe('the rules manager rows', () => {
    let container: HTMLDivElement;
    let root: Root;

    beforeEach(() => {
        vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
        container = document.createElement('div');
        document.body.append(container);
        root = createRoot(container);
        act(() => {
            root.render(<RulesManager />);
        });
    });

    afterEach(() => {
        act(() => {
            root.unmount();
        });
        document.body.replaceChildren();
        backend.isBacktestFetching = false;
        backend.source = undefined;
        vi.clearAllMocks();
        vi.unstubAllGlobals();
    });

    it('titles each rule card with its match', () => {
        const titles = [
            ...container.querySelectorAll(':scope tbody th[scope="row"]'),
        ].map((cell) => cell.textContent);
        expect(titles).toEqual(['EUR', 'amazon', 'bol']);
    });

    it('moves a rule down in priority from its row menu', () => {
        openRowActions('amazon');
        expect(isRowActionDisabled('Move up')).toBe(true);
        clickRowAction('Move down');
        expect(backend.reorderRules).toHaveBeenCalledWith({
            credentialId: 'books',
            orderedIds: ['rule-b', 'rule-a'],
        });
    });

    it('keeps the last rule from moving further down', () => {
        openRowActions('bol');
        expect(isRowActionDisabled('Move down')).toBe(true);
        expect(isRowActionDisabled('Move up')).toBe(false);
    });

    it('locks reordering while the rules are filtered', () => {
        const search = container.querySelector<HTMLInputElement>(
            ':scope input[aria-label="Search rules…"]',
        );
        if (search === null) throw new TypeError('no rules search');
        typeInto(search, 'amazon');
        openRowActions('amazon');
        expect(isRowActionDisabled('Move down')).toBe(true);
    });

    it('asks before deleting a rule', () => {
        chooseRowAction('amazon', 'Delete');
        expect(backend.deleteRule).not.toHaveBeenCalled();
        expect(document.body.textContent).toContain(
            'Delete the rule for “amazon”?',
        );
        confirmRowAction('Delete');
        expect(backend.deleteRule).toHaveBeenCalledWith({ id: 'rule-a' });
    });

    it('edits a rule in its dialog and saves it unchanged', async () => {
        chooseRowAction('amazon', 'Edit');
        dialogTitled('Edit rule');
        await submitDialog(
            'Save changes',
            () => new Promise((resolve) => setTimeout(resolve, 0)),
        );
        expect(backend.updateRule).toHaveBeenCalledWith({
            currency: null,
            dateFrom: null,
            dateTo: null,
            direction: 'OUT',
            display: 'amazon counterpart',
            id: 'rule-a',
            ledger: { id: '4000', label: '4000 Office' },
            match: 'amazon',
            matchType: 'contains',
            maxAmount: null,
            minAmount: null,
            taxCode: 'BI_EU_INK',
        });
    });

    it('hands focus back to the rule row menu when its edit dialog closes', async () => {
        const trigger = openRowActions('amazon');
        clickRowAction('Edit');
        dialogTitled('Edit rule');
        cancelDialog();
        await act(async () => {
            await new Promise((resolve) => setTimeout(resolve, 10));
        });
        expect(document.activeElement).toBe(trigger);
    });

    it('announces the running backtest to assistive technology', () => {
        backend.source = {
            id: 'wise',
            isActive: true,
            kind: 'wise',
            label: 'Wise',
        };
        backend.isBacktestFetching = true;
        act(() => {
            root.render(<RulesManager />);
        });
        chooseRowAction('amazon', 'Edit');
        const status = dialogTitled('Edit rule').querySelector(
            ':scope [role="status"][aria-busy="true"]',
        );
        expect(status?.getAttribute('aria-label')).toBe(
            'Checking against the last 90 days',
        );
    });

    it('asks before deleting a bank account', () => {
        chooseRowAction('EUR bank account', 'Delete');
        expect(backend.deleteBankAccount).not.toHaveBeenCalled();
        expect(document.body.textContent).toContain(
            'Delete the EUR bank account?',
        );
        confirmRowAction('Delete');
        expect(backend.deleteBankAccount).toHaveBeenCalledWith({
            id: 'bank-eur',
        });
    });
});
