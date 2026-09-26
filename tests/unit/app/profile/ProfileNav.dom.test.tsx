import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ProfileNav } from '~/app/(app)/profile/_components/ProfileNav';
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
    signOut: vi.fn(() => Promise.resolve({ data: { success: true } })),
}));

vi.mock('next/navigation', () => ({
    useRouter: () => ({ push: navigation.push, refresh: navigation.refresh }),
}));

vi.mock('~/lib/auth/client', () => ({
    authClient: { signOut: auth.signOut },
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

function cachedQueryCount(client: QueryClient): number {
    return client.getQueryCache().getAll().length;
}

async function clickSignOut(): Promise<void> {
    const button = [...document.querySelectorAll('button')].find((node) =>
        /sign out/i.test(node.textContent),
    );
    if (button === undefined) throw new TypeError('no sign out button');
    await act(async () => {
        button.click();
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
                <ProfileNav
                    activeTab="account"
                    email="owner@example.com"
                    isAdmin={false}
                    isRoot={false}
                    name="Owner"
                />
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
    vi.unstubAllGlobals();
});

describe('ProfileNav sign out', () => {
    it("drops the signed-in user's cached queries once the session ends", async () => {
        const client = seededClient();
        const cachedAtSignOut: number[] = [];
        auth.signOut.mockImplementationOnce(() => {
            cachedAtSignOut.push(cachedQueryCount(client));
            return Promise.resolve({ data: { success: true } });
        });
        await renderWith(client);
        expect(cachedQueryCount(client)).toBe(2);

        await clickSignOut();

        expect(auth.signOut).toHaveBeenCalledTimes(1);
        expect(cachedAtSignOut).toEqual([2]);
        expect(client.getQueryData(SCENARIO_LIST_KEY)).toBeUndefined();
        expect(client.getQueryData(ACCOUNT_LIST_KEY)).toBeUndefined();
        expect(cachedQueryCount(client)).toBe(0);
        expect(navigation.push).toHaveBeenCalledWith(routes.home);
        expect(navigation.refresh).toHaveBeenCalledTimes(1);
    });
});
