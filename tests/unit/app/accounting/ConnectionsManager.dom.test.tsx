import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ConnectionsManager } from '~/app/(app)/accounting/_components/ConnectionsManager';

import { dialogTitled, submitDialog } from '../../components/formDialog';
import {
    chooseRowAction,
    clickRowAction,
    confirmRowAction,
    openRowActions,
    rowActionLabels,
} from '../../components/rowActionsMenu';

const backend = vi.hoisted(() => ({
    activate: vi.fn(),
    credentials: [
        storedCredential(
            '00000000-0000-4000-8000-00000000000a',
            'Books A',
            true,
        ),
        storedCredential(
            '00000000-0000-4000-8000-00000000000b',
            'Books B',
            false,
        ),
    ],
    remove: vi.fn(),
    test: vi.fn(() =>
        Promise.resolve({ detail: 'reachable', latencyMs: 5, ok: true }),
    ),
    update: vi.fn(() => Promise.resolve({ ok: true })),
}));

const toasts = vi.hoisted(() => ({ error: vi.fn(), success: vi.fn() }));

vi.mock('sonner', () => ({ toast: toasts }));

vi.mock('~/trpc/react', () => ({
    api: {
        accounting: {
            credentials: {
                delete: {
                    useMutation: () => ({
                        isPending: false,
                        mutate: backend.remove,
                    }),
                },
                list: {
                    useQuery: () => ({
                        data: backend.credentials,
                        isPending: false,
                    }),
                },
                setActive: {
                    useMutation: () => ({
                        isPending: false,
                        mutate: backend.activate,
                    }),
                },
                test: {
                    useMutation: () => ({
                        isPending: false,
                        mutateAsync: backend.test,
                    }),
                },
                update: {
                    useMutation: () => ({
                        error: null,
                        isPending: false,
                        mutateAsync: backend.update,
                    }),
                },
            },
        },
        useUtils: () => ({
            accounting: {
                credentials: { list: { invalidate: vi.fn() } },
                summary: { invalidate: vi.fn() },
            },
        }),
    },
}));

async function flush(): Promise<void> {
    await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 0));
    });
}

function storedCredential(id: string, label: string, isActive: boolean) {
    return {
        createdAt: '2026-09-01T00:00:00Z',
        id,
        isActive,
        kind: 'eboekhouden',
        label,
        lastUsedAt: null,
        meta: {},
    };
}

describe('the connections manager rows', () => {
    let container: HTMLDivElement;
    let root: Root;

    beforeEach(() => {
        vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
        container = document.createElement('div');
        document.body.append(container);
        root = createRoot(container);
        act(() => {
            root.render(<ConnectionsManager />);
        });
    });

    afterEach(() => {
        act(() => {
            root.unmount();
        });
        document.body.replaceChildren();
        vi.clearAllMocks();
        vi.unstubAllGlobals();
    });

    it('offers set active only on the credential that is not active', () => {
        openRowActions('Books A');
        expect(rowActionLabels()).toEqual(['Test', 'Edit', 'Delete']);
    });

    it('sets a credential active from its row menu', () => {
        openRowActions('Books B');
        expect(rowActionLabels()).toEqual([
            'Set active',
            'Test',
            'Edit',
            'Delete',
        ]);
        clickRowAction('Set active');
        expect(backend.activate).toHaveBeenCalledWith(
            { id: backend.credentials[1]?.id },
            expect.anything(),
        );
    });

    it('tests a credential from its row menu and reports the result', async () => {
        chooseRowAction('Books B', 'Test');
        await flush();
        expect(backend.test).toHaveBeenCalledWith({
            id: backend.credentials[1]?.id,
        });
        expect(toasts.success).toHaveBeenCalledWith(
            'Books B: OK · reachable · 5ms',
        );
    });

    it('asks before deleting a credential', () => {
        chooseRowAction('Books B', 'Delete');
        expect(backend.remove).not.toHaveBeenCalled();
        expect(document.body.textContent).toContain('Delete "Books B"?');
        confirmRowAction('Delete');
        expect(backend.remove).toHaveBeenCalledWith(
            { id: backend.credentials[1]?.id },
            expect.anything(),
        );
    });

    it('edits a credential in its dialog', async () => {
        chooseRowAction('Books B', 'Edit');
        dialogTitled('Edit credential');
        await submitDialog(
            'Save changes',
            () => new Promise((resolve) => setTimeout(resolve, 0)),
        );
        expect(backend.update).toHaveBeenCalledWith({
            id: backend.credentials[1]?.id,
            label: 'Books B',
            meta: {},
            secret: undefined,
        });
        expect(toasts.success).toHaveBeenCalledWith('Credential updated');
    });
});
