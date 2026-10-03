import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { CalculatorProvider } from '~/app/(app)/prop-calculator/_components/CalculatorProvider';
import {
    toolCatalogEntry,
    ToolId,
} from '~/app/(app)/prop-calculator/_components/toolCatalog';
import { ToolPageHeading } from '~/app/(app)/prop-calculator/_components/ToolPageHeading';
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
    default: () => <button data-testid="share-link" type="button" />,
}));

vi.mock('~/app/(app)/prop-calculator/_components/SavedScenarios', () => ({
    default: () => <div data-testid="saved-scenarios" />,
}));

describe('ToolPageHeading', () => {
    let container: HTMLDivElement;
    let root: Root;

    function render(element: React.ReactElement) {
        act(() => {
            root.render(<CalculatorProvider>{element}</CalculatorProvider>);
        });
    }

    function orderOf(selectors: string[]): number[] {
        const nodes = [...container.querySelectorAll('*')];
        return selectors.map((selector) => {
            const found = container.querySelector(selector);
            return found === null ? -1 : nodes.indexOf(found);
        });
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

    it('renders the h1, the blurb and then the toolbar for a state tool', () => {
        const entry = toolCatalogEntry(ToolId.Analysis);
        render(<ToolPageHeading toolId={ToolId.Analysis} />);
        expect(container.querySelectorAll(':scope h1')).toHaveLength(1);
        expect(container.querySelector(':scope h1')?.textContent).toBe(
            entry.label,
        );
        expect(container.querySelector(':scope header p')?.textContent).toBe(
            entry.blurb,
        );
        expect(
            container.querySelectorAll('[data-testid="share-link"]'),
        ).toHaveLength(1);
        expect(
            container.querySelectorAll('[data-testid="saved-scenarios"]'),
        ).toHaveLength(1);
        const [h1, blurb, share, saved] = orderOf([
            'h1',
            'header p',
            '[data-testid="share-link"]',
            '[data-testid="saved-scenarios"]',
        ]);
        expect(h1).toBeLessThan(blurb ?? -1);
        expect(blurb).toBeLessThan(share ?? -1);
        expect(share).toBeLessThan(saved ?? -1);
    });

    it('renders the share button only, with no saved scenarios, for an own-codec tool', () => {
        const entry = toolCatalogEntry(ToolId.PositionSize);
        render(
            <ToolPageHeading
                ownQuery="risk=300"
                toolId={ToolId.PositionSize}
            />,
        );
        expect(container.querySelector(':scope h1')?.textContent).toBe(
            entry.label,
        );
        expect(
            container.querySelectorAll('[data-testid="share-link"]'),
        ).toHaveLength(1);
        expect(
            container.querySelector('[data-testid="saved-scenarios"]'),
        ).toBeNull();
    });

    it('renders the h1 and no toolbar for the rules browser', () => {
        const entry = toolCatalogEntry(ToolId.Rules);
        expect(entry.sharesState).toBe(false);
        render(<ToolPageHeading toolId={ToolId.Rules} />);
        expect(container.querySelector(':scope h1')?.textContent).toBe(
            entry.label,
        );
        expect(container.querySelector(':scope header p')?.textContent).toBe(
            entry.blurb,
        );
        expect(
            container.querySelector('[data-testid="share-link"]'),
        ).toBeNull();
        expect(
            container.querySelector('[data-testid="saved-scenarios"]'),
        ).toBeNull();
    });
});
