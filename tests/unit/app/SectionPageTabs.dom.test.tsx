import { act } from 'react';
import { createRoot, hydrateRoot, type Root } from 'react-dom/client';
import { renderToString } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { type RouteSubnavItem } from '~/app/(app)/_components/RouteSubnav';
import { subnavGroup } from '~/app/(app)/_components/routeSubnavLinks';
import { SectionPageTabs } from '~/app/(app)/_components/SectionPageTabs';

const navigation = vi.hoisted(() => ({ pathname: '/' }));

vi.mock('next/navigation', () => ({
    usePathname: () => navigation.pathname,
}));

const ITEMS: readonly RouteSubnavItem[] = [
    { href: '/section', label: 'Today' },
    subnavGroup('Progress', [
        { href: '/section/analytics', label: 'Analytics' },
        { href: '/section/body', label: 'Body' },
        { href: '/section/goals', label: 'Goals' },
    ]),
    subnavGroup('Plans', [
        { href: '/section/programs', label: 'Programs' },
        { href: '/section/routines', label: 'Routines' },
    ]),
];

describe('SectionPageTabs', () => {
    let container: HTMLDivElement;
    let root: Root;

    function render(pathname: string) {
        navigation.pathname = pathname;
        act(() => {
            root.render(
                <SectionPageTabs items={ITEMS} label="Section pages" />,
            );
        });
    }

    function tabs(): HTMLAnchorElement[] {
        return [
            ...container.querySelectorAll<HTMLAnchorElement>(':scope nav a'),
        ];
    }

    beforeEach(() => {
        vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
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

    it('renders the pages of the current group as one labelled row of links', () => {
        render('/section/body');
        const navs = container.querySelectorAll('nav');
        expect(navs).toHaveLength(1);
        expect(navs[0]?.getAttribute('aria-label')).toBe('Section pages');
        expect(
            tabs().map((tab) => [tab.textContent, tab.getAttribute('href')]),
        ).toEqual([
            ['Analytics', '/section/analytics'],
            ['Body', '/section/body'],
            ['Goals', '/section/goals'],
        ]);
    });

    it('marks only the current page with aria-current', () => {
        render('/section/body');
        expect(
            tabs()
                .filter((tab) => tab.getAttribute('aria-current') === 'page')
                .map((tab) => tab.textContent),
        ).toEqual(['Body']);
    });

    it('shows the group of the first page when that page is current', () => {
        render('/section/programs');
        expect(tabs().map((tab) => tab.textContent)).toEqual([
            'Programs',
            'Routines',
        ]);
        expect(tabs().map((tab) => tab.getAttribute('aria-current'))).toEqual([
            'page',
            null,
        ]);
    });

    it('renders nothing on a page outside every group', () => {
        render('/section');
        expect(container.getHTML()).toBe('');
    });

    it('renders nothing on a child route of a grouped page', () => {
        render('/section/programs/starting-strength');
        expect(container.getHTML()).toBe('');
    });

    describe('a group wider than the screen', () => {
        const TAB_WIDTH_PX = 100;
        const STRIP_WIDTH_PX = 300;
        const WIDE_ITEMS: readonly RouteSubnavItem[] = [
            subnavGroup('Plan', [
                { href: '/plan/cash-flow', label: 'Cash flow' },
                { href: '/plan/bankroll', label: 'Bankroll' },
                { href: '/plan/planner', label: 'Planner' },
                { href: '/plan/optimizer', label: 'Optimizer' },
                { href: '/plan/payouts', label: 'Payouts' },
            ]),
        ];

        function renderWide(pathname: string) {
            navigation.pathname = pathname;
            act(() => {
                root.render(
                    <SectionPageTabs items={WIDE_ITEMS} label="Plan pages" />,
                );
            });
        }

        beforeEach(() => {
            vi.spyOn(
                HTMLElement.prototype,
                'clientWidth',
                'get',
            ).mockImplementation(function width(this: HTMLElement) {
                return this.tagName === 'NAV' ? STRIP_WIDTH_PX : TAB_WIDTH_PX;
            });
            vi.spyOn(
                HTMLElement.prototype,
                'scrollWidth',
                'get',
            ).mockImplementation(function width(this: HTMLElement) {
                return this.tagName === 'NAV'
                    ? TAB_WIDTH_PX * this.querySelectorAll('a').length
                    : TAB_WIDTH_PX;
            });
            vi.spyOn(
                HTMLElement.prototype,
                'offsetWidth',
                'get',
            ).mockReturnValue(TAB_WIDTH_PX);
            vi.spyOn(
                HTMLElement.prototype,
                'offsetLeft',
                'get',
            ).mockImplementation(function left(this: HTMLElement) {
                const siblings = [...(this.parentElement?.children ?? [])];
                return siblings.indexOf(this) * TAB_WIDTH_PX;
            });
        });

        afterEach(() => {
            vi.restoreAllMocks();
        });

        it('scrolls the current page to the middle of the strip', () => {
            const scrollTo = vi
                .spyOn(HTMLElement.prototype, 'scrollTo')
                .mockReturnValue(undefined);
            renderWide('/plan/cash-flow');
            renderWide('/plan/optimizer');
            expect(scrollTo).toHaveBeenLastCalledWith({
                left: 3 * TAB_WIDTH_PX - (STRIP_WIDTH_PX - TAB_WIDTH_PX) / 2,
            });
        });

        it('fades the edge that hides more pages', () => {
            vi.spyOn(HTMLElement.prototype, 'scrollTo').mockReturnValue(
                undefined,
            );
            renderWide('/plan/cash-flow');
            expect(scrollStripOf(container).className).toContain(
                'mask-r-from-90%',
            );
            expect(scrollStripOf(container).className).not.toContain(
                'mask-l-from-90%',
            );
            Object.defineProperty(scrollStripOf(container), 'scrollLeft', {
                configurable: true,
                value: STRIP_WIDTH_PX - TAB_WIDTH_PX,
            });
            act(() => {
                scrollStripOf(container).dispatchEvent(new Event('scroll'));
            });
            expect(scrollStripOf(container).className).toContain(
                'mask-l-from-90%',
            );
            expect(scrollStripOf(container).className).not.toContain(
                'mask-r-from-90%',
            );
        });
    });

    describe('pages that carry a query', () => {
        const QUERY_ITEMS: readonly RouteSubnavItem[] = [
            subnavGroup('Plan', [
                {
                    carriesQuery: true,
                    href: '/section/bankroll',
                    label: 'Bankroll',
                    query: 'firm=apex',
                },
                {
                    carriesQuery: true,
                    href: '/section/cash-flow',
                    label: 'Cash flow',
                    query: 'firm=apex',
                },
            ]),
        ];

        it('links the bare pages on the server, so hydration matches, then adds each query in the browser', async () => {
            navigation.pathname = '/section/bankroll';
            const element = (
                <SectionPageTabs items={QUERY_ITEMS} label="Plan pages" />
            );
            act(() => {
                root.unmount();
            });
            container.innerHTML = renderToString(element);
            expect(tabs().map((tab) => tab.getAttribute('href'))).toEqual([
                '/section/bankroll',
                '/section/cash-flow',
            ]);
            const errors = vi.spyOn(console, 'error');
            await act(async () => {
                root = hydrateRoot(container, element);
                await Promise.resolve();
            });
            expect(errors).not.toHaveBeenCalled();
            expect(tabs().map((tab) => tab.getAttribute('href'))).toEqual([
                '/section/bankroll?firm=apex',
                '/section/cash-flow?firm=apex',
            ]);
        });
    });
});

function scrollStripOf(container: HTMLElement): HTMLElement {
    const nav = container.querySelector(':scope nav');
    if (!(nav instanceof HTMLElement)) throw new TypeError('No nav');
    return nav;
}
