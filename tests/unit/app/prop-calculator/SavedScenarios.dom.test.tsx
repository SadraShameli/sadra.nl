import { act, useSyncExternalStore } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { defaultCalculatorState } from '~/app/(app)/prop-calculator/_components/calculatorReducer';
import SavedScenarios from '~/app/(app)/prop-calculator/_components/SavedScenarios';
import { ALL_FIRMS } from '~/lib/prop-calculator/firms';

interface FakeSession {
    data: null | { user: { id: string } };
    error: Error | null;
    isPending: boolean;
    isRefetching: boolean;
    refetch: () => Promise<void>;
}

const harness = vi.hoisted(() => {
    const listeners = new Set<() => void>();
    const refetch = vi.fn(() => Promise.resolve());
    const store = {
        session: {
            data: null,
            error: null,
            isPending: false,
            isRefetching: false,
            refetch,
        } as FakeSession,
    };
    return {
        refetch,
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

const scenarioApi = vi.hoisted(() => ({
    importMany: vi.fn((scenarios: { name: string; query: string }[]) =>
        Promise.resolve({ imported: scenarios, skippedNames: [] }),
    ),
    listRows: [] as {
        id: string;
        name: string;
        query: string;
        updatedAt: Date;
        userId: string;
    }[],
    remove: vi.fn(() => Promise.resolve({ ok: true })),
    removeAll: vi.fn(() => Promise.resolve({ removed: 0 })),
    save: vi.fn(() => Promise.resolve()),
    utilities: {
        propAccounts: {
            scenario: {
                list: {
                    fetch: vi.fn(() => Promise.resolve([])),
                    invalidate: vi.fn(() => Promise.resolve()),
                },
            },
        },
    },
}));

vi.mock('~/lib/auth/client', () => ({
    useSession: () =>
        useSyncExternalStore(harness.subscribe, () => harness.store.session),
}));

vi.mock('~/trpc/react', () => ({
    api: {
        propAccounts: {
            scenario: {
                importMany: {
                    useMutation: () => ({
                        isPending: false,
                        mutateAsync: scenarioApi.importMany,
                    }),
                },
                list: {
                    useQuery: () => ({
                        data: scenarioApi.listRows,
                        error: null,
                        isError: false,
                    }),
                },
                remove: {
                    useMutation: () => ({
                        isPending: false,
                        mutateAsync: scenarioApi.remove,
                    }),
                },
                removeAll: {
                    useMutation: () => ({
                        isPending: false,
                        mutateAsync: scenarioApi.removeAll,
                    }),
                },
                save: {
                    useMutation: () => ({
                        isPending: false,
                        mutateAsync: scenarioApi.save,
                    }),
                },
            },
        },
        useUtils: () => scenarioApi.utilities,
    },
}));

vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

const LOADING_TEXT = 'Loading saved scenarios...';
const LOCAL_HEADING = 'Saved';
const ACCOUNT_HEADING = 'Saved to your account';

async function flush() {
    await act(async () => {
        await Promise.resolve();
    });
}

function nameInput(): HTMLInputElement {
    const input = document.body.querySelector<HTMLInputElement>(
        'input[placeholder="Name"]',
    );
    if (input === null) throw new Error('no name input');
    return input;
}

function panelText(): string {
    return document.body.textContent;
}

function sectionHeadings(): string[] {
    return [...document.body.querySelectorAll('span')]
        .map((span) => span.textContent)
        .filter((text) => text === LOCAL_HEADING || text === ACCOUNT_HEADING);
}

async function setSession(next: Partial<FakeSession>) {
    act(() => {
        harness.setSession(next);
    });
    await flush();
}

function typeName(text: string) {
    const input = nameInput();
    act(() => {
        Reflect.set(HTMLInputElement.prototype, 'value', text, input);
        input.dispatchEvent(new Event('input', { bubbles: true }));
    });
}

describe('SavedScenarios session stores', () => {
    let container: HTMLDivElement;
    let root: Root;

    beforeEach(() => {
        vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
        window.localStorage.clear();
        harness.refetch.mockClear();
        scenarioApi.importMany.mockClear();
        scenarioApi.remove.mockClear();
        scenarioApi.removeAll.mockClear();
        scenarioApi.save.mockClear();
        scenarioApi.listRows = [];
        harness.store.session = {
            data: null,
            error: null,
            isPending: false,
            isRefetching: false,
            refetch: harness.refetch,
        };
        container = document.createElement('div');
        document.body.append(container);
        root = createRoot(container);
    });

    afterEach(() => {
        act(() => {
            root.unmount();
        });
        container.remove();
        vi.unstubAllGlobals();
    });

    async function openPanel() {
        act(() => {
            root.render(
                <SavedScenarios
                    firms={ALL_FIRMS}
                    onLoad={vi.fn()}
                    state={defaultCalculatorState()}
                />,
            );
        });
        const trigger = [...container.querySelectorAll('button')].find(
            (button) => button.textContent.includes('Saved scenarios'),
        );
        if (trigger === undefined) throw new Error('no saved scenarios button');
        act(() => {
            trigger.click();
        });
        await flush();
        await flush();
    }

    it('shows the browser panel to an anonymous visitor', async () => {
        await openPanel();
        expect(sectionHeadings()).toEqual([LOCAL_HEADING]);
        expect(panelText()).toContain('No saved scenarios yet.');
    });

    it('keeps the browser panel and its typed name through an anonymous session refetch', async () => {
        await openPanel();
        typeName('Morning plan');

        await setSession({ isPending: true, isRefetching: true });
        expect(panelText()).not.toContain(LOADING_TEXT);
        expect(sectionHeadings()).toEqual([LOCAL_HEADING]);
        expect(nameInput().value).toBe('Morning plan');

        await setSession({ isPending: false, isRefetching: false });
        expect(sectionHeadings()).toEqual([LOCAL_HEADING]);
        expect(nameInput().value).toBe('Morning plan');
    });

    it('keeps the browser panel and its typed name when an anonymous session refetch fails', async () => {
        await openPanel();
        typeName('Morning plan');

        await setSession({ isPending: true, isRefetching: true });
        await setSession({
            error: new Error('offline'),
            isPending: false,
            isRefetching: false,
        });
        expect(panelText()).not.toContain(
            'Could not check whether you are signed in',
        );
        expect(sectionHeadings()).toEqual([LOCAL_HEADING]);
        expect(nameInput().value).toBe('Morning plan');

        await setSession({ error: null });
        expect(sectionHeadings()).toEqual([LOCAL_HEADING]);
        expect(nameInput().value).toBe('Morning plan');
    });

    it('switches to the account panel when a failed anonymous refetch later finds a signed-in user', async () => {
        await openPanel();
        await setSession({ error: new Error('offline') });
        await setSession({
            data: { user: { id: 'user-1' } },
            error: null,
        });
        expect(sectionHeadings()).toEqual([ACCOUNT_HEADING]);
    });

    it('shows the session error when a signed-in refetch fails and drops the user', async () => {
        harness.store.session = {
            ...harness.store.session,
            data: { user: { id: 'user-1' } },
        };
        await openPanel();
        await setSession({ data: null, error: new Error('offline') });
        expect(panelText()).toContain(
            'Could not check whether you are signed in',
        );
        expect(sectionHeadings()).toEqual([]);
    });

    it('switches to the account panel when the refetch finds a signed-in user', async () => {
        await openPanel();
        await setSession({ isPending: true, isRefetching: true });
        await setSession({
            data: { user: { id: 'user-1' } },
            isPending: false,
            isRefetching: false,
        });
        expect(sectionHeadings()).toEqual([ACCOUNT_HEADING]);
    });

    it('shows the loading state before the first session check settles', async () => {
        harness.store.session = {
            ...harness.store.session,
            isPending: true,
            isRefetching: true,
        };
        await openPanel();
        expect(panelText()).toContain(LOADING_TEXT);
        expect(sectionHeadings()).toEqual([]);
    });

    it('shows the loading state again when a failed session check is retried', async () => {
        harness.store.session = {
            ...harness.store.session,
            error: new Error('offline'),
        };
        await openPanel();
        expect(panelText()).toContain(
            'Could not check whether you are signed in',
        );
        const retry = [...document.body.querySelectorAll('button')].find(
            (button) => button.textContent === 'Try again',
        );
        if (retry === undefined) throw new Error('no retry button');
        act(() => {
            retry.click();
        });
        expect(harness.refetch).toHaveBeenCalledTimes(1);
        await setSession({ error: null, isPending: true, isRefetching: true });
        expect(panelText()).toContain(LOADING_TEXT);
    });

    it('shows the account panel to a signed-in user', async () => {
        harness.store.session = {
            ...harness.store.session,
            data: { user: { id: 'user-1' } },
        };
        await openPanel();
        expect(sectionHeadings()).toEqual([ACCOUNT_HEADING]);
    });

    it('imports the browser scenarios of a signed-in user in one importMany call, never one save per scenario', async () => {
        window.localStorage.setItem(
            'propCalc.scenarios.v1',
            JSON.stringify([
                { name: 'Apex', params: 'firm=apex', savedAt: 2 },
                { name: 'Topstep', params: 'firm=topstep', savedAt: 1 },
            ]),
        );
        harness.store.session = {
            ...harness.store.session,
            data: { user: { id: 'user-1' } },
        };
        await openPanel();
        await flush();
        expect(scenarioApi.importMany.mock.calls).toEqual([
            [
                [
                    { name: 'Apex', query: 'firm=apex' },
                    { name: 'Topstep', query: 'firm=topstep' },
                ],
            ],
        ]);
        expect(scenarioApi.save).not.toHaveBeenCalled();
    });

    it('clears every account scenario with one removeAll call, never one remove per scenario', async () => {
        scenarioApi.listRows = [
            {
                id: 'scenario-1',
                name: 'Apex',
                query: 'firm=apex',
                updatedAt: new Date('2026-09-20T00:00:00Z'),
                userId: 'user-1',
            },
            {
                id: 'scenario-2',
                name: 'Topstep',
                query: 'firm=topstep',
                updatedAt: new Date('2026-09-21T00:00:00Z'),
                userId: 'user-1',
            },
        ];
        harness.store.session = {
            ...harness.store.session,
            data: { user: { id: 'user-1' } },
        };
        await openPanel();
        const clearAll = [...document.body.querySelectorAll('button')].find(
            (button) => button.textContent === 'Clear all',
        );
        if (clearAll === undefined) throw new Error('no clear all button');
        act(() => {
            clearAll.click();
        });
        await flush();
        expect(scenarioApi.removeAll).toHaveBeenCalledTimes(1);
        expect(scenarioApi.remove).not.toHaveBeenCalled();
    });
});
