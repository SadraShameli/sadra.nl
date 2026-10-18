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
