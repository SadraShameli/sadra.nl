import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { DeleteAccountDialog } from '~/app/(app)/profile/_components/DeleteAccountDialog';
import { routes } from '~/lib/site/routes';

interface Mounted {
    readonly container: HTMLDivElement;
    readonly root: Root;
}

const navigation = vi.hoisted(() => ({
    push: vi.fn(),
    refresh: vi.fn(),
}));

const auth = vi.hoisted(() => ({
    deleteUser: vi.fn(() => Promise.resolve({ data: { success: true } })),
}));

vi.mock('next/navigation', () => ({
    useRouter: () => ({ push: navigation.push, refresh: navigation.refresh }),
}));

vi.mock('~/lib/auth/client', () => ({
    authClient: { deleteUser: auth.deleteUser },
}));

const SCENARIO_LIST_KEY = [
    ['propAccounts', 'scenario', 'list'],
    { type: 'query' },
] as const;
const ACCOUNT_LIST_KEY = [
    ['propAccounts', 'account', 'list'],
    { input: { includeArchived: false }, type: 'query' },
] as const;

const mounted: Mounted[] = [];

function buttonNamed(name: string, within: ParentNode): HTMLButtonElement {
    const button = [...within.querySelectorAll('button')].find(
        (node) => node.textContent.trim() === name,
    );
    if (button === undefined) throw new TypeError(`no ${name} button`);
    return button;
}

function cachedQueryCount(client: QueryClient): number {
    return client.getQueryCache().getAll().length;
}

async function confirmDelete(): Promise<void> {
    await act(async () => {
        buttonNamed('Delete account', document.body).click();
        await settle();
    });
    const dialog = document.body.querySelector('[role="alertdialog"]');
    if (dialog === null) throw new TypeError('no confirmation dialog');
    await act(async () => {
        buttonNamed('Delete account', dialog).click();
        await settle();
    });
}

async function renderWith(client: QueryClient): Promise<void> {
    const container = document.createElement('div');
    document.body.append(container);
    const root = createRoot(container);
    mounted.push({ container, root });
    await act(async () => {
        root.render(
            <QueryClientProvider client={client}>
                <DeleteAccountDialog />
            </QueryClientProvider>,
        );
        await settle();
    });
}

function seededClient(): QueryClient {
    const client = new QueryClient();
    client.setQueryData(SCENARIO_LIST_KEY, [
        { id: 'scenario-1', name: 'Private scenario', query: 'firm=apex' },
    ]);
    client.setQueryData(ACCOUNT_LIST_KEY, [{ id: 'account-1', label: 'Eval' }]);
    return client;
}

async function settle(): Promise<void> {
    await new Promise((resolve) => setTimeout(resolve, 0));
}

beforeEach(() => {
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
    vi.clearAllMocks();
});

afterEach(async () => {
    for (const { container, root } of mounted.splice(0)) {
        await act(async () => {
            root.unmount();
            await settle();
        });
        container.remove();
    }
    document.body.replaceChildren();
    vi.unstubAllGlobals();
});

describe('DeleteAccountDialog', () => {
    it("drops the deleted user's cached prop-accounts queries once the account is deleted", async () => {
        const client = seededClient();
        const cachedAtDelete: number[] = [];
        auth.deleteUser.mockImplementationOnce(() => {
            cachedAtDelete.push(cachedQueryCount(client));
            return Promise.resolve({ data: { success: true } });
        });
        await renderWith(client);
        expect(cachedQueryCount(client)).toBe(2);

        await confirmDelete();

        expect(auth.deleteUser).toHaveBeenCalledTimes(1);
        expect(cachedAtDelete).toEqual([2]);
        expect(client.getQueryData(SCENARIO_LIST_KEY)).toBeUndefined();
        expect(client.getQueryData(ACCOUNT_LIST_KEY)).toBeUndefined();
        expect(cachedQueryCount(client)).toBe(0);
        expect(navigation.push).toHaveBeenCalledWith(routes.home);
        expect(navigation.refresh).toHaveBeenCalledTimes(1);
    });
});
