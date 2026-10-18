import { act, use } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import Footer from '~/app/(app)/_components/Footer';
import { homepageContent, siteContent } from '~/lib/site/content';
import { routes } from '~/lib/site/routes';

import { resolveServerTree } from './resolveServerTree';

interface NavigationState {
    pathname: null | string;
}

const navigation = vi.hoisted((): NavigationState => ({
    pathname: '/',
}));

const UNKNOWN_PATHNAME = Promise.withResolvers<string>().promise;

vi.mock('next/navigation', () => ({
    usePathname: (): string => navigation.pathname ?? use(UNKNOWN_PATHNAME),
}));

vi.mock('next/cache', async (importOriginal) => {
    const stubs = await import('./nextRequestStubs');
    return stubs.nextCacheWithoutCacheComponents(importOriginal);
});

const FROZEN_NOW = new Date('2026-10-18T12:00:00Z');
const COPYRIGHT = `© 2026 ${siteContent.manifest.name}`;

const { closing } = homepageContent;

describe('Footer', () => {
    let container: HTMLDivElement;
    let root: Root;

    async function render(pathname: null | string) {
        navigation.pathname = pathname;
        const tree = await resolveServerTree(<Footer />);
        act(() => {
            root.render(tree);
        });
    }

    function footer(): HTMLElement {
        const footers = container.querySelectorAll('footer');
        expect(footers).toHaveLength(1);
        const [only] = footers;
        if (only === undefined) throw new Error('no footer rendered');
        return only;
    }

    function linksIn(label: string): HTMLAnchorElement[] {
        return [
            ...footer().querySelectorAll<HTMLAnchorElement>(
                `nav[aria-label="${CSS.escape(label)}"] a`,
            ),
        ];
    }

    function expectCompact() {
        const element = footer();
        expect(element.textContent).toContain(COPYRIGHT);
        expect(
            linksIn('Fine print').map((link) => [
                link.textContent,
                link.getAttribute('href'),
            ]),
        ).toEqual([
            ['Privacy', routes.legal.privacy],
            ['Terms', routes.legal.terms],
            ['Contact', routes.contact],
        ]);
        expect(
            linksIn('Elsewhere').map((link) => [
                link.getAttribute('aria-label'),
                link.getAttribute('href'),
                link.querySelector('svg') === null,
            ]),
        ).toEqual(
            siteContent.socialLinks.map((profile) => [
                profile.title,
                profile.url,
                false,
            ]),
        );
        expect(element.textContent).not.toContain(closing.contactLabel);
        expect(element.textContent).not.toContain('NYSE');
        for (const word of closing.marquee) {
            expect(element.textContent).not.toContain(word);
        }
        expect(element.querySelector('nav[aria-label="Index"]')).toBeNull();
    }

    beforeEach(() => {
        vi.useFakeTimers({ now: FROZEN_NOW, toFake: ['Date'] });
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
        vi.useRealTimers();
    });

    it.each([routes.home, routes.portfolio, routes.resume.index])(
        'ends %s with the full closing footer',
        async (pathname) => {
            await render(pathname);

            const element = footer();
            const contact = [
                ...element.querySelectorAll<HTMLAnchorElement>('a'),
            ].find((link) => link.textContent === closing.contactLabel);
            expect(contact?.getAttribute('href')).toBe(routes.contact);
            for (const label of ['Index', 'Tools', 'Elsewhere', 'Fine print']) {
                expect(linksIn(label).length).toBeGreaterThan(0);
            }
            expect(element.textContent).toContain(COPYRIGHT);
            expect(element.textContent).toContain(closing.madeBy);
            for (const word of closing.marquee) {
                expect(element.textContent).toContain(word);
            }
        },
    );

    it.each([
        routes.contact,
        routes.legal.privacy,
        routes.auth.login,
        routes.profile,
        routes.accounting.index,
        routes.lifting.index,
        routes.propCalculator.index,
        routes.tradeChecklist.index,
    ])(
        'ends %s with one quiet row of copyright, fine print and social icons',
        async (pathname) => {
            await render(pathname);

            expectCompact();
        },
    );

    it('shows the compact footer while the pathname is still unknown', async () => {
        await render(null);

        expectCompact();
    });

    it('lays Index and The desk across the phone width and Elsewhere beside Fine print', async () => {
        await render(routes.home);

        const element = footer();
        const column = (label: string) => {
            const nav = element.querySelector(
                `nav[aria-label="${CSS.escape(label)}"]`,
            );
            if (nav === null) throw new Error(`no ${label} column`);
            return nav.classList;
        };
        const grid = element.querySelector('nav[aria-label="Index"]')
            ?.parentElement?.classList;
        expect(grid?.contains('grid-cols-2')).toBe(true);
        for (const label of ['Index', 'Tools']) {
            expect(column(label).contains('col-span-2')).toBe(true);
            expect(column(label).contains('md:col-span-1')).toBe(true);
        }
        for (const label of ['Elsewhere', 'Fine print']) {
            expect(column(label).contains('col-span-2')).toBe(false);
        }
    });
});
