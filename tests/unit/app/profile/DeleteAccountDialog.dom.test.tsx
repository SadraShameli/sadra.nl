import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { DeleteAccountDialog } from '~/app/(app)/profile/_components/DeleteAccountDialog';
import { EmailLink, emailLinkSentText } from '~/lib/auth/EmailLink';
import { routes } from '~/lib/site/routes';

import { stubLocationAssign } from '../stubLocationAssign';

interface Mounted {
    readonly container: HTMLDivElement;
    readonly root: Root;
}

const auth = vi.hoisted(() => ({
    deleteUser: vi.fn<
        (options?: {
            callbackURL?: string;
        }) => Promise<
            | { data: null; error: { message: string } }
            | { data: { success: boolean }; error: null }
        >
    >(() => Promise.resolve({ data: { success: true }, error: null })),
}));

const toast = vi.hoisted(() => ({ error: vi.fn(), success: vi.fn() }));

vi.mock('sonner', () => ({ toast }));

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

function buttonNamed(within: ParentNode): HTMLButtonElement {
    const button = [...within.querySelectorAll('button')].find(
        (node) => node.textContent.trim() === 'Delete account',
    );
    if (button === undefined) throw new TypeError('no Delete account button');
    return button;
}

function cachedQueryCount(client: QueryClient): number {
    return client.getQueryCache().getAll().length;
}

async function confirmDelete(): Promise<void> {
    await act(async () => {
        buttonNamed(document.body).click();
        await settle();
    });
    const dialog = document.body.querySelector('[role="alertdialog"]');
    if (dialog === null) throw new TypeError('no confirmation dialog');
    await act(async () => {
        buttonNamed(dialog).click();
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
    vi.restoreAllMocks();
});

describe('DeleteAccountDialog', () => {
    it('emails a confirmation link and keeps the account until it is opened', async () => {
        const client = seededClient();
        const assign = stubLocationAssign();
        await renderWith(client);

        await confirmDelete();

        expect(auth.deleteUser).toHaveBeenCalledWith({
            callbackURL: routes.home,
        });
        expect(toast.success).toHaveBeenCalledWith(
            emailLinkSentText(EmailLink.AccountDeletion),
        );
        expect(assign).not.toHaveBeenCalled();
        expect(cachedQueryCount(client)).toBe(2);
    });

    it('keeps the user on the page and shows why when deletion is refused', async () => {
        const client = seededClient();
        auth.deleteUser.mockResolvedValueOnce({
            data: null,
            error: {
                message:
                    'Session expired. Re-authenticate to perform this action.',
            },
        });
        const assign = stubLocationAssign();
        await renderWith(client);

        await confirmDelete();

        expect(assign).not.toHaveBeenCalled();
        expect(cachedQueryCount(client)).toBe(2);
        expect(toast.error).toHaveBeenCalledWith(
            'Session expired. Re-authenticate to perform this action.',
        );
    });
});
