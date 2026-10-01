import { act, type ReactNode, useContext } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { type ComputationCache } from '~/app/(app)/prop-calculator/_components/computationCache';
import { ComputationCacheContext } from '~/app/(app)/prop-calculator/_components/useDebouncedSimulation';

const ACCOUNT_ID = '3f0c1a52-8b6e-4c8f-9d2a-5e1b7a9c4d10';

const probe = vi.hoisted(() => ({
    seen: [] as (ComputationCache | null)[],
}));

vi.mock('~/lib/auth/server', () => ({
    getServerSession: () => Promise.resolve({ user: { id: 'user-1' } }),
}));

vi.mock('next/navigation', () => ({
    notFound: () => {
        throw new Error('unexpected notFound');
    },
    redirect: (href: string) => {
        throw new Error(`unexpected redirect to ${href}`);
    },
}));

vi.mock('~/trpc/server', () => {
    const prefetch = { prefetch: () => Promise.resolve() };
    return {
        api: {
            propAccounts: {
                account: { get: prefetch, list: prefetch },
                copyGroup: { list: prefetch },
                decision: { listForAccount: prefetch },
                event: { list: prefetch, listForAccount: prefetch },
                externalFirm: { list: prefetch },
                fee: { list: prefetch },
                payout: { list: prefetch },
                rulebook: { get: prefetch },
                snapshot: { latestForAll: prefetch, listForAccount: prefetch },
            },
        },
        HydrateClient: ({ children }: { children: ReactNode }) => children,
    };
});

vi.mock(
    '~/app/(app)/prop-calculator/accounts/_components/detail/AccountDetailView',
    () => ({ AccountDetailView: () => null }),
);

vi.mock(
    '~/app/(app)/prop-calculator/accounts/_components/advice/AdvicePanel',
    () => ({
        AdvicePanel: () => {
            probe.seen.push(useContext(ComputationCacheContext));
            return null;
        },
    }),
);

vi.mock(
    '~/app/(app)/prop-calculator/accounts/_components/AccountsSubnav',
    () => ({ AccountsSubnav: () => null }),
);

const { default: PropAccountDetailPage } = await import(
    '~/app/(app)/prop-calculator/accounts/[id]/page'
);
const { default: PropAccountsLayout } = await import(
    '~/app/(app)/prop-calculator/accounts/layout'
);

function CacheProbe() {
    probe.seen.push(useContext(ComputationCacheContext));
    return null;
}

describe('the accounts pages share one computation cache (PT-34c, PT-21c)', () => {
    let container: HTMLDivElement;
    let root: Root;

    async function renderInLayout(children: ReactNode) {
        const tree = await PropAccountsLayout({ children });
        act(() => {
            root.render(tree);
        });
    }

    async function renderPage() {
        const page = await PropAccountDetailPage({
            params: Promise.resolve({ id: ACCOUNT_ID }),
        });
        await renderInLayout(page);
    }

    beforeEach(() => {
        vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
        probe.seen = [];
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

    it('gives the advice panel a shared computation cache', async () => {
        await renderPage();

        expect(probe.seen.at(-1)).not.toBeNull();
    });

    it('hands the same cache to the advice panel after navigating away and back', async () => {
        await renderPage();
        const first = probe.seen.at(-1);

        act(() => {
            root.unmount();
        });
        root = createRoot(container);
        await renderPage();

        expect(first).not.toBeNull();
        expect(probe.seen.at(-1)).toBe(first);
    });

    it('gives the overview and every other accounts page the same cache as the account page', async () => {
        await renderPage();
        const advice = probe.seen.at(-1);

        act(() => {
            root.unmount();
        });
        root = createRoot(container);
        await renderInLayout(<CacheProbe />);

        expect(advice).not.toBeNull();
        expect(probe.seen.at(-1)).toBe(advice);
    });
});
