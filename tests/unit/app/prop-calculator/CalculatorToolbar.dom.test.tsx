import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { CalculatorProvider } from '~/app/(app)/prop-calculator/_components/CalculatorProvider';
import { CalculatorToolbar } from '~/app/(app)/prop-calculator/_components/CalculatorToolbar';
import { shareLinkForQuery } from '~/app/(app)/prop-calculator/_components/shareLink';
import { routes } from '~/lib/site/routes';

const navigation = vi.hoisted(() => ({
    pathname: '/',
    router: { replace: vi.fn<(href: string) => void>() },
}));

vi.mock('next/navigation', () => ({
    usePathname: () => navigation.pathname,
    useRouter: () => navigation.router,
    useSearchParams: () => new URLSearchParams(window.location.search),
}));

vi.mock('~/lib/auth/client', () => ({
    useSession: () => ({ data: null, error: null, isPending: false }),
}));

vi.mock('~/trpc/react', () => ({
    api: {
        propAccounts: {
            bankroll: {
                summary: { useQuery: () => ({ data: undefined }) },
            },
            rulebook: {
                get: { useQuery: () => ({ data: undefined }) },
            },
        },
    },
}));

vi.mock('~/app/(app)/prop-calculator/_components/ShareLinkButton', () => ({
    default: ({
        buildLink,
    }: {
        buildLink: (origin: string, pathname: string) => string;
    }) => (
        <button
            data-link={buildLink(ORIGIN, PATHNAME)}
            data-testid="share-link"
            type="button"
        />
    ),
}));

vi.mock('~/app/(app)/prop-calculator/_components/SavedScenarios', () => ({
    default: () => <div data-testid="saved-scenarios" />,
}));

const ORIGIN = 'https://sadra.test';
const PATHNAME = '/prop-calculator/simulator';

describe('CalculatorToolbar', () => {
    let container: HTMLDivElement;
    let root: Root;

    function render(ownQuery?: string) {
        act(() => {
            root.render(
                <CalculatorProvider>
                    <CalculatorToolbar ownQuery={ownQuery} />
                </CalculatorProvider>,
            );
        });
    }

    function shareLink(): string | undefined {
        return container.querySelector<HTMLElement>(
            '[data-testid="share-link"]',
        )?.dataset.link;
    }

    beforeEach(() => {
        vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
        window.history.replaceState(null, '', routes.propCalculator.simulator);
        navigation.pathname = routes.propCalculator.simulator;
        window.sessionStorage.clear();
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

    it('builds the link from its own query and mounts no saved scenarios on an own-codec tool', () => {
        render('stop=12&risk=300');
        expect(shareLink()).toBe(
            shareLinkForQuery(ORIGIN, PATHNAME, 'stop=12&risk=300'),
        );
        expect(shareLink()).toBe(`${ORIGIN}${PATHNAME}?stop=12&risk=300`);
        expect(
            container.querySelectorAll('[data-testid="share-link"]'),
        ).toHaveLength(1);
        expect(
            container.querySelector('[data-testid="saved-scenarios"]'),
        ).toBeNull();
    });

    it('treats an empty own query as the own-codec branch with a bare link', () => {
        render('');
        expect(shareLink()).toBe(`${ORIGIN}${PATHNAME}`);
        expect(
            container.querySelector('[data-testid="saved-scenarios"]'),
        ).toBeNull();
    });

    it('mounts the share link and the saved scenarios through the provider on a calculator tool', () => {
        render();
        expect(
            container.querySelectorAll('[data-testid="share-link"]'),
        ).toHaveLength(1);
        expect(
            container.querySelectorAll('[data-testid="saved-scenarios"]'),
        ).toHaveLength(1);
        const link = shareLink() ?? '';
        expect(link.startsWith(`${ORIGIN}${PATHNAME}?`)).toBe(true);
        const query = new URL(link).searchParams;
        expect(query.get('firm')).not.toBeNull();
        expect(query.get('wr')).not.toBeNull();
    });
});
