import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import Navbar from '~/app/(app)/_components/Navbar';
import { NavProductCard } from '~/app/(app)/_components/navigation/NavProductCard';
import {
    ACCOUNTING_NAV_PRODUCT,
    NAV_ITEMS,
    NavItemKind,
    NavMenuId,
    type NavProduct,
    NavProductId,
} from '~/app/(app)/_components/navigation/siteNavigation';
import { HOME_SECTIONS, HomeSectionId } from '~/lib/site/homeSections';
import { routes } from '~/lib/site/routes';

const navigation = vi.hoisted(() => ({ pathname: '/' }));

vi.mock('next/navigation', () => ({
    usePathname: () => navigation.pathname,
}));

const SENSOR_HUB_HREF = '/?project=sensor-hub#portfolio';
const PORTFOLIO_TRIGGER_BOX = new DOMRect(320, 8, 96, 40);
const SENSOR_HUB_TRIGGER_BOX = new DOMRect(416, 8, 96, 40);
const VIEWPORT_HEIGHT = 1000;

class SilentResizeObserver {
    disconnect(): void {
        return;
    }

    observe(): void {
        return;
    }

    unobserve(): void {
        return;
    }
}

function cardLinks(card: HTMLElement): string[] {
    return [...card.querySelectorAll(':scope li a')].map(
        (link) => link.textContent,
    );
}

function cardsIn(scope: HTMLElement): HTMLElement[] {
    return [...scope.querySelectorAll<HTMLElement>(':scope [data-product]')];
}

function cardTitle(card: HTMLElement): HTMLAnchorElement {
    const title = card.querySelector<HTMLAnchorElement>(
        ':scope [data-slot="item-title"] a',
    );
    if (title === null) throw new Error('card has no title link');
    return title;
}

function desktopList(): HTMLElement {
    const list = document.querySelector<HTMLElement>(
        'nav[aria-label="Main"] ul',
    );
    if (list === null) throw new Error('no desktop navbar list');
    return list;
}

function desktopTrigger(label: string): HTMLButtonElement {
    const trigger = [...desktopList().querySelectorAll('button')].find(
        (candidate) => candidate.textContent === label,
    );
    if (trigger === undefined) throw new Error(`no ${label} trigger`);
    return trigger;
}

function homeLink(): HTMLAnchorElement {
    const link = document.querySelector<HTMLAnchorElement>(
        'a[aria-label="Home"]',
    );
    if (link === null) throw new Error('no Home link');
    return link;
}

function indicator(): HTMLElement {
    const span = homeLink().parentElement?.querySelector<HTMLElement>(
        ':scope > span[aria-hidden]',
    );
    if (span === null || span === undefined) {
        throw new Error('no sliding indicator');
    }
    return span;
}

async function nextFrame(): Promise<void> {
    await new Promise((resolve) => requestAnimationFrame(resolve));
}

function phoneMenu(): HTMLElement {
    const menu = document.querySelector<HTMLElement>(
        '[data-slot="popover-content"]',
    );
    if (menu === null) throw new Error('the phone menu is closed');
    return menu;
}

function phoneTrigger(label: string): HTMLButtonElement {
    const trigger = [
        ...phoneMenu().querySelectorAll<HTMLButtonElement>(
            '[data-slot="accordion-trigger"]',
        ),
    ].find((candidate) => candidate.textContent === label);
    if (trigger === undefined) throw new Error(`no phone ${label} trigger`);
    return trigger;
}

function placeSections(activeSection: HomeSectionId | null): void {
    const activeIndex = HOME_SECTIONS.findIndex(
        (section) => section.id === activeSection,
    );
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(
        function (this: HTMLElement) {
            const sectionIndex = HOME_SECTIONS.findIndex(
                (section) => document.querySelector(`#${section.id}`) === this,
            );
            if (sectionIndex !== -1) {
                const top =
                    sectionIndex <= activeIndex ? 0 : VIEWPORT_HEIGHT * 2;
                return new DOMRect(0, top, 1200, VIEWPORT_HEIGHT);
            }
            if (this instanceof HTMLButtonElement) {
                if (this.textContent === 'Portfolio')
                    return PORTFOLIO_TRIGGER_BOX;
                if (this.textContent === 'Sensor Hub')
                    return SENSOR_HUB_TRIGGER_BOX;
            }
            return new DOMRect(0, 0, 0, 0);
        },
    );
}

function productsMenu(): readonly NavProduct[] {
    const tools = NAV_ITEMS.find((item) => item.id === NavMenuId.Tools);
    if (tools?.kind !== NavItemKind.Products) {
        throw new Error('Tools is not a product menu');
    }
    return tools.products;
}

describe('Navbar', () => {
    let container: HTMLDivElement;
    let root: Root;

    async function render(pathname: string): Promise<void> {
        navigation.pathname = pathname;
        await act(async () => {
            root.render(
                <Navbar
                    accountLink={null}
                    menuExtras={{
                        [NavMenuId.Tools]: (
                            <NavProductCard product={ACCOUNTING_NAV_PRODUCT} />
                        ),
                    }}
                />,
            );
            await nextFrame();
        });
    }

    beforeEach(() => {
        vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
        vi.stubGlobal('ResizeObserver', SilentResizeObserver);
        vi.stubGlobal('innerHeight', VIEWPORT_HEIGHT);
        for (const section of HOME_SECTIONS) {
            const element = document.createElement('section');
            element.id = section.id;
            document.body.append(element);
        }
        placeSections(null);
        container = document.createElement('div');
        document.body.append(container);
        root = createRoot(container);
    });

    afterEach(() => {
        act(() => {
            root.unmount();
        });
        document.body.replaceChildren();
        vi.restoreAllMocks();
        vi.unstubAllGlobals();
    });

    it('renders every navigation group as a dropdown and links Sensor Hub to its project', async () => {
        await render(routes.home);
        expect(
            [...desktopList().querySelectorAll('button')].map(
                (trigger) => trigger.textContent,
            ),
        ).toEqual(['Tools', 'Portfolio', 'Sensor Hub', 'About']);
        await act(async () => {
            desktopTrigger('Sensor Hub').click();
            await nextFrame();
        });
        expect(
            document.querySelector(`a[href="${CSS.escape(SENSOR_HUB_HREF)}"]`),
        ).not.toBeNull();
    });

    it('opens Tools as product cards with a description and the section links of each product', async () => {
        await render(routes.home);
        await act(async () => {
            desktopTrigger('Tools').click();
            await nextFrame();
        });
        const cards = cardsIn(document.body);
        expect(cards.map((card) => card.dataset.product)).toEqual([
            ...productsMenu().map((product) => product.id),
            NavProductId.Accounting,
        ]);
        for (const [index, product] of [
            ...productsMenu(),
            ACCOUNTING_NAV_PRODUCT,
        ].entries()) {
            const card = cards[index];
            if (card === undefined) throw new Error(`no card ${product.id}`);
            expect(cardTitle(card).textContent).toBe(product.label);
            expect(cardTitle(card).getAttribute('href')).toBe(product.href);
            expect(card.textContent).toContain(product.description);
            expect(cardLinks(card)).toEqual(
                product.links.map((link) => link.label),
            );
        }
        const calculator = cards[0];
        if (calculator === undefined) throw new Error('no calculator card');
        expect(cardLinks(calculator)).toEqual([
            'Simulator',
            'Compare',
            'Bankroll',
            'Strategy lab',
            'All tools',
        ]);
    });

    it('moves the arrow-key focus across all dropdown triggers', async () => {
        await render(routes.home);
        const tools = desktopTrigger('Tools');
        tools.focus();
        await act(async () => {
            tools.dispatchEvent(
                new KeyboardEvent('keydown', {
                    bubbles: true,
                    key: 'ArrowRight',
                }),
            );
            await new Promise((resolve) => setTimeout(resolve, 0));
        });
        expect(document.activeElement).toBe(desktopTrigger('Portfolio'));
        await act(async () => {
            desktopTrigger('Portfolio').dispatchEvent(
                new KeyboardEvent('keydown', {
                    bubbles: true,
                    key: 'ArrowRight',
                }),
            );
            await new Promise((resolve) => setTimeout(resolve, 0));
        });
        expect(document.activeElement).toBe(desktopTrigger('Sensor Hub'));
    });

    it.each([
        {
            box: PORTFOLIO_TRIGGER_BOX,
            label: 'Portfolio',
            section: HomeSectionId.Portfolio,
        },
        {
            box: SENSOR_HUB_TRIGGER_BOX,
            label: 'Sensor Hub',
            section: HomeSectionId.SensorHub,
        },
        {
            box: SENSOR_HUB_TRIGGER_BOX,
            label: 'Sensor Hub',
            section: HomeSectionId.Readings,
        },
        {
            box: SENSOR_HUB_TRIGGER_BOX,
            label: 'Sensor Hub',
            section: HomeSectionId.Recordings,
        },
    ])(
        'marks the menu and slides the indicator under it while $section is on screen',
        async ({ box, label, section }) => {
            placeSections(section);
            await render(routes.home);
            expect(desktopTrigger(label).getAttribute('aria-current')).toBe(
                'location',
            );
            expect(indicator().style.opacity).toBe('1');
            expect(indicator().style.width).toBe(`${String(box.width)}px`);
            expect(indicator().style.transform).toBe(
                `translate(${String(box.x)}px, ${String(box.y)}px)`,
            );
        },
    );

    it('leaves Sensor Hub unmarked on the home top and on other pages', async () => {
        await render(routes.home);
        expect(homeLink().getAttribute('aria-current')).toBe('location');
        expect(desktopTrigger('Sensor Hub').hasAttribute('aria-current')).toBe(
            false,
        );
        await render(routes.propCalculator.simulator);
        expect(desktopTrigger('Sensor Hub').hasAttribute('aria-current')).toBe(
            false,
        );
    });

    it('shows the phone Tools menu as a two-up grid of product tiles', async () => {
        await render(routes.home);
        const toggle = document.querySelector<HTMLButtonElement>(
            'button[aria-label="Open menu"]',
        );
        if (toggle === null) throw new Error('no phone menu toggle');
        await act(async () => {
            toggle.click();
            await nextFrame();
        });
        expect(
            [
                ...phoneMenu().querySelectorAll(
                    '[data-slot="accordion-trigger"]',
                ),
            ].map((trigger) => trigger.textContent),
        ).toEqual(['Tools', 'Portfolio', 'Sensor Hub', 'About']);
        await act(async () => {
            phoneTrigger('Tools').click();
            await nextFrame();
        });
        const tiles = cardsIn(phoneMenu());
        const grid = tiles[0]?.parentElement;
        expect(grid?.className).toContain('grid-cols-2');
        expect(tiles.map((tile) => cardTitle(tile).textContent)).toEqual([
            ...productsMenu().map((product) => product.label),
            ACCOUNTING_NAV_PRODUCT.label,
        ]);
        for (const tile of tiles) {
            expect(cardTitle(tile).className).toContain('max-md:after:inset-0');
        }
    });
});
