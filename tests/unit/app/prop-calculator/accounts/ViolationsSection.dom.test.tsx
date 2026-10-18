import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ViolationsSection } from '~/app/(app)/prop-calculator/accounts/_components/detail/ViolationsSection';
import { formatDisplayDate } from '~/lib/format';
import {
    RuleViolationKind,
    usdCents,
    ViolationSource,
} from '~/lib/prop-accounts';
import { type RouterOutputs } from '~/trpc/react';

import {
    dialogTitled,
    findDialogTitled,
    typeInto,
} from '../../../components/formDialog';
import {
    chooseRowAction,
    confirmRowAction,
    openRowActions,
    rowActionLabels,
} from '../../../components/rowActionsMenu';
import { pickOption } from './pickOption';

type ViolationRow = RouterOutputs['propAccounts']['violation']['list'][number];

const ACCOUNT_ID = 'a1111111-1111-4111-8111-111111111111';
const DECISION_ID = 'd2222222-2222-4222-8222-222222222222';
const VIOLATION_ID = 'e3333333-3333-4333-8333-333333333333';
const VIOLATION_ROW_LABEL =
    'the Position above the documented size violation of 12 Sep 2026';

interface FakeQuery {
    data: unknown;
    error: Error | null;
    isError: boolean;
    isPending: boolean;
}

const harness = vi.hoisted(() => {
    const queries = new Map<string, FakeQuery>();
    const mutate = new Map<
        string,
        ReturnType<typeof vi.fn<(input: unknown) => void>>
    >();
    const mutateAsync = new Map<
        string,
        ReturnType<typeof vi.fn<() => Promise<unknown>>>
    >();
    const invalidate = vi.fn(() => Promise.resolve());
    const pending: FakeQuery = {
        data: undefined,
        error: null,
        isError: false,
        isPending: true,
    };
    function mutateOf(name: string) {
        const existing = mutate.get(name);
        if (existing !== undefined) return existing;
        const created = vi.fn<(input: unknown) => void>();
        mutate.set(name, created);
        return created;
    }
    function mutateAsyncOf(name: string) {
        const existing = mutateAsync.get(name);
        if (existing !== undefined) return existing;
        const created = vi.fn<() => Promise<unknown>>(() =>
            Promise.resolve({}),
        );
        mutateAsync.set(name, created);
        return created;
    }
    return {
        invalidate,
        mutateAsyncOf,
        mutateOf,
        mutation: (name: string) => ({
            useMutation: (options?: {
                onError?: (error: unknown) => void;
                onSuccess?: () => Promise<void> | void;
            }) => ({
                isPending: false,
                mutate: (input: unknown) => {
                    mutateOf(name)(input);
                    void options?.onSuccess?.();
                },
                mutateAsync: mutateAsyncOf(name),
            }),
        }),
        queries,
        query: (name: string) => ({
            useQuery: () => queries.get(name) ?? pending,
        }),
        reset() {
            queries.clear();
            mutate.clear();
            mutateAsync.clear();
            invalidate.mockClear();
        },
    };
});

vi.mock('sonner', () => ({
    toast: { error: vi.fn(), success: vi.fn() },
}));

vi.mock('~/trpc/react', () => ({
    api: {
        propAccounts: {
            decision: {
                listForAccount: harness.query('decision.listForAccount'),
            },
            violation: {
                create: harness.mutation('violation.create'),
                remove: harness.mutation('violation.remove'),
                update: harness.mutation('violation.update'),
            },
        },
        useUtils: () => ({
            propAccounts: { invalidate: harness.invalidate },
        }),
    },
}));

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

function decision() {
    return {
        acceptedRiskCents: 25_000,
        accountId: ACCOUNT_ID,
        actualRiskCents: null,
        decidedOn: '2026-09-10',
        headlineRiskCents: 25_000,
        id: DECISION_ID,
    };
}

async function flush() {
    await act(async () => {
        await new Promise((resolve) => {
            setTimeout(resolve, 0);
        });
    });
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

async function submit(scope: ParentNode, label: string) {
    await act(async () => {
        const button = buttonLabelled(scope, label);
        button.focus();
        button.click();
    });
    await flush();
}

function violation(): ViolationRow {
    return {
        accountId: ACCOUNT_ID,
        costCents: usdCents(5000),
        createdAt: new Date('2026-09-12T12:00:00Z'),
        decisionId: null,
        id: VIOLATION_ID,
        kind: RuleViolationKind.Oversize,
        note: 'sized up after a loss',
        occurredOn: '2026-09-12',
        source: ViolationSource.Manual,
        updatedAt: new Date('2026-09-12T12:00:00Z'),
        userId: 'user-a',
    };
}

describe('ViolationsSection', () => {
    let container: HTMLDivElement;
    let root: Root;

    beforeEach(() => {
        vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
        harness.reset();
        harness.queries.set('decision.listForAccount', answer([decision()]));
        container = document.createElement('div');
        document.body.append(container);
        root = createRoot(container);
    });

    afterEach(() => {
        act(() => {
            root.unmount();
        });
        container.remove();
    });

    function render(
        rows: readonly ViolationRow[] | undefined,
        canRecord = true,
    ) {
        act(() => {
            root.render(
                <ViolationsSection
                    accountId={ACCOUNT_ID}
                    canRecord={canRecord}
                    onFailure={vi.fn()}
                    query={{ data: rows, error: null }}
                />,
            );
        });
    }

    it('says no violations are recorded yet when the list is empty', () => {
        render([]);
        expect(container.textContent).toContain(
            'No rule violations recorded yet.',
        );
    });

    it('lists a violation with its date, kind label, cost and note', () => {
        render([violation()]);
        expect(container.textContent).toContain('12 Sep 2026');
        expect(container.textContent).toContain(
            'Position above the documented size',
        );
        expect(container.textContent).toContain('$50');
        expect(container.textContent).toContain('sized up after a loss');
    });

    function openAddDialog(): HTMLElement {
        act(() => {
            buttonLabelled(container, 'Add violation').click();
        });
        return dialogTitled('Add a violation');
    }

    it('shows the ForcedRecovery disclaimer that a documented step-up after a loss is not a violation', async () => {
        render([]);
        const dialog = openAddDialog();
        await pickOption(
            inputLabelled(dialog, 'Kind'),
            'Risk above the documented rung to recover a loss',
        );
        expect(dialog.textContent).toContain(
            "the documented ladder's step up after a loss is not a violation",
        );
    });

    it('shows only the plain kind label for a kind with no disclaimer', async () => {
        render([]);
        const dialog = openAddDialog();
        await pickOption(
            inputLabelled(dialog, 'Kind'),
            'Position above the documented size',
        );
        expect(dialog.textContent).not.toContain('is not a violation');
    });

    it('creates a violation with a blank cost and no linked decision as null, then closes the dialog', async () => {
        render([]);
        const dialog = openAddDialog();
        await pickOption(
            inputLabelled(dialog, 'Kind'),
            'Took an unplanned trade to win back a loss',
        );
        typeInto(inputLabelled(dialog, 'Date'), '2026-09-15');
        await submit(dialog, 'Add violation');
        expect(findDialogTitled('Add a violation')).toBeNull();
        expect(harness.mutateAsyncOf('violation.create')).toHaveBeenCalledWith({
            accountId: ACCOUNT_ID,
            costCents: null,
            decisionId: null,
            kind: RuleViolationKind.ChasedLoss,
            note: null,
            occurredOn: '2026-09-15',
        });
    });

    it('lists only this account decisions in the linked-decision select', async () => {
        render([]);
        const dialog = openAddDialog();
        await pickOption(
            inputLabelled(dialog, 'Linked decision'),
            `Decision on ${formatDisplayDate(decision().decidedOn)}`,
        );
        typeInto(inputLabelled(dialog, 'Date'), '2026-09-15');
        await submit(dialog, 'Add violation');
        expect(harness.mutateAsyncOf('violation.create')).toHaveBeenCalledWith(
            expect.objectContaining({ decisionId: DECISION_ID }),
        );
    });

    it('starts editing a violation from its row menu, prefills the dialog and saves through violation.update', async () => {
        render([violation()]);
        chooseRowAction(VIOLATION_ROW_LABEL, 'Edit');
        const dialog = dialogTitled('Edit violation');
        expect((inputLabelled(dialog, 'Cost') as HTMLInputElement).value).toBe(
            '50',
        );
        typeInto(inputLabelled(dialog, 'Note'), 'edited note');
        await submit(dialog, 'Save violation');
        expect(harness.mutateAsyncOf('violation.update')).toHaveBeenCalledWith({
            costCents: 5000,
            decisionId: null,
            id: VIOLATION_ID,
            kind: RuleViolationKind.Oversize,
            note: 'edited note',
            occurredOn: '2026-09-12',
        });
    });

    it('removes a violation from its row menu only once the delete dialog is confirmed', () => {
        render([violation()]);
        chooseRowAction(VIOLATION_ROW_LABEL, 'Delete');
        expect(harness.mutateOf('violation.remove')).not.toHaveBeenCalled();
        confirmRowAction('Delete');
        expect(harness.mutateOf('violation.remove')).toHaveBeenCalledWith({
            id: VIOLATION_ID,
        });
    });

    it('hides the form when recording is not allowed', () => {
        render([], false);
        expect(container.textContent).not.toContain('Add violation');
        expect(document.querySelector('form')).toBeNull();
    });

    it('offers only Delete in the row menu when recording is not allowed', () => {
        render([violation()], false);
        openRowActions(VIOLATION_ROW_LABEL);
        expect(rowActionLabels()).toEqual(['Delete']);
    });
});
