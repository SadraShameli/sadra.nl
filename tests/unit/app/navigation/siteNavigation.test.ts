import { describe, expect, it } from 'vitest';

import {
    ACCOUNTING_NAV_PRODUCT,
    HOME_SECTION_MENU,
    NAV_ITEMS,
    type NavItem,
    NavItemKind,
    type NavLink,
    navMenuForPath,
    NavMenuId,
    type NavProduct,
    NavProductId,
} from '~/app/(app)/_components/navigation/siteNavigation';
import {
    ACCOUNTING_EYEBROW,
    ACCOUNTING_NAV,
} from '~/app/(app)/accounting/_components/AccountingSection';
import { LIFTING_NAV } from '~/app/(app)/lifting/_components/liftingNav';
import {
    LINKED_TOOL_CATALOG,
    ToolId,
} from '~/app/(app)/prop-calculator/_components/toolCatalog';
import { ACCOUNTS_NAV_ITEMS } from '~/app/(app)/prop-calculator/accounts/_components/accountsNavItems';
import { TRADE_CHECKLIST_NAV } from '~/app/(app)/trade-checklist/_components/tradeChecklistNav';
import { siteTools, ToolTicker } from '~/lib/site/content';
import { homeSection, HomeSectionId } from '~/lib/site/homeSections';
import { routes, sameOriginRoute } from '~/lib/site/routes';

interface PathItem {
    readonly href: string;
    readonly label: string;
}

const PUBLIC_PRODUCTS: readonly NavProductId[] = [
    NavProductId.PropCalculator,
    NavProductId.PropAccounts,
    NavProductId.TradeChecklist,
    NavProductId.Lifting,
];

function navItem(id: NavMenuId): NavItem {
    const item = NAV_ITEMS.find((entry) => entry.id === id);
    if (item === undefined) throw new Error(`no navbar item ${id}`);
    return item;
}

function pathLinksOf(items: readonly PathItem[]): NavLink[] {
    return items.map((item) => ({
        href: sameOriginRoute(item.href, ''),
        label: item.label,
    }));
}

function siteToolDescription(ticker: ToolTicker): string | undefined {
    return siteTools.find((tool) => tool.ticker === ticker)?.description;
}

function toolsProduct(id: NavProductId): NavProduct {
    const product = toolsProducts().find((entry) => entry.id === id);
    if (product === undefined) throw new Error(`no product ${id}`);
    return product;
}

function toolsProducts(): readonly NavProduct[] {
    const tools = navItem(NavMenuId.Tools);
    if (tools.kind !== NavItemKind.Products) {
        throw new Error('Tools is not a product menu');
    }
    return tools.products;
}

describe('the navbar items', () => {
    it('reads Tools, Sensor Hub, Portfolio, About from left to right', () => {
        expect(NAV_ITEMS.map((item) => item.id)).toEqual([
            NavMenuId.Tools,
            NavMenuId.SensorHub,
            NavMenuId.Portfolio,
            NavMenuId.About,
        ]);
    });

    it('makes Sensor Hub a direct link to the home Sensor Hub section', () => {
        expect(navItem(NavMenuId.SensorHub)).toEqual({
            id: NavMenuId.SensorHub,
            kind: NavItemKind.HomeSection,
            label: homeSection(HomeSectionId.SensorHub).indexLabel,
            section: HomeSectionId.SensorHub,
        });
    });

    it('keeps Portfolio and About as small group menus', () => {
        for (const id of [NavMenuId.Portfolio, NavMenuId.About]) {
            const item = navItem(id);
            expect(item.kind).toBe(NavItemKind.Groups);
            if (item.kind !== NavItemKind.Groups) continue;
            expect(item.groups).toHaveLength(1);
            expect(item.groups[0]?.links.length).toBeGreaterThan(0);
        }
    });
});

describe('the Tools product cards', () => {
    it('shows the four public products in order', () => {
        expect(toolsProducts().map((product) => product.id)).toEqual(
            PUBLIC_PRODUCTS,
        );
    });

    it('gives every product a name, a one-line description and a landing page', () => {
        for (const product of [...toolsProducts(), ACCOUNTING_NAV_PRODUCT]) {
            expect(product.label.trim().length).toBeGreaterThan(0);
            expect(product.description.trim().length).toBeGreaterThan(0);
            expect(product.description).not.toContain('\n');
            expect(product.links.length).toBeGreaterThan(0);
        }
        expect(
            toolsProducts().map((product) => [product.id, product.href]),
        ).toEqual([
            [NavProductId.PropCalculator, routes.propCalculator.index],
            [NavProductId.PropAccounts, routes.propCalculator.accounts.index],
            [NavProductId.TradeChecklist, routes.tradeChecklist.index],
            [NavProductId.Lifting, routes.lifting.index],
        ]);
    });

    it('reuses the site tool descriptions for the calculator, the checklist and the lifting tracker', () => {
        expect(toolsProduct(NavProductId.PropCalculator).description).toBe(
            siteToolDescription(ToolTicker.PropCalculator),
        );
        expect(toolsProduct(NavProductId.TradeChecklist).description).toBe(
            siteToolDescription(ToolTicker.Checklist),
        );
        expect(toolsProduct(NavProductId.Lifting).description).toBe(
            siteToolDescription(ToolTicker.Lifting),
        );
    });

    it('lists the four featured calculator tools, then All tools on the hub', () => {
        const featured = LINKED_TOOL_CATALOG.filter((entry) => entry.featured);
        expect(featured.map((entry) => entry.id)).toEqual([
            ToolId.Simulator,
            ToolId.Compare,
            ToolId.Bankroll,
            ToolId.StrategyLab,
        ]);
        expect(toolsProduct(NavProductId.PropCalculator).links).toEqual([
            ...pathLinksOf(
                featured.map((entry) => ({
                    href: entry.route,
                    label: entry.label,
                })),
            ),
            {
                href: sameOriginRoute(routes.propCalculator.index, ''),
                label: 'All tools',
            },
        ]);
    });

    it('reads each product list from the section nav of that product', () => {
        expect(toolsProduct(NavProductId.PropAccounts).links).toEqual(
            pathLinksOf(ACCOUNTS_NAV_ITEMS),
        );
        expect(toolsProduct(NavProductId.TradeChecklist).links).toEqual(
            pathLinksOf(TRADE_CHECKLIST_NAV),
        );
        expect(toolsProduct(NavProductId.Lifting).links).toEqual(
            pathLinksOf(LIFTING_NAV),
        );
        expect(ACCOUNTING_NAV_PRODUCT.links).toEqual(
            pathLinksOf(ACCOUNTING_NAV),
        );
    });

    it('keeps the accounting importer out of the public cards', () => {
        expect(ACCOUNTING_NAV_PRODUCT).toMatchObject({
            href: routes.accounting.index,
            id: NavProductId.Accounting,
            label: ACCOUNTING_EYEBROW,
        });
        expect(
            toolsProducts().some(
                (product) => product.id === NavProductId.Accounting,
            ),
        ).toBe(false);
    });
});

describe('the navbar highlight', () => {
    it('highlights Sensor Hub for the sensor hub, readings and recordings sections', () => {
        expect(HOME_SECTION_MENU[HomeSectionId.SensorHub]).toBe(
            NavMenuId.SensorHub,
        );
        expect(HOME_SECTION_MENU[HomeSectionId.Readings]).toBe(
            NavMenuId.SensorHub,
        );
        expect(HOME_SECTION_MENU[HomeSectionId.Recordings]).toBe(
            NavMenuId.SensorHub,
        );
        expect(HOME_SECTION_MENU[HomeSectionId.Tools]).toBe(NavMenuId.Tools);
        expect(HOME_SECTION_MENU[HomeSectionId.About]).toBe(NavMenuId.About);
    });

    it('maps every product page to Tools and the other pages to their menu', () => {
        expect(navMenuForPath(routes.propCalculator.simulator)).toBe(
            NavMenuId.Tools,
        );
        expect(navMenuForPath(routes.propCalculator.accounts.index)).toBe(
            NavMenuId.Tools,
        );
        expect(navMenuForPath(routes.tradeChecklist.journal)).toBe(
            NavMenuId.Tools,
        );
        expect(navMenuForPath(routes.lifting.log)).toBe(NavMenuId.Tools);
        expect(navMenuForPath(routes.accounting.runs)).toBe(NavMenuId.Tools);
        expect(navMenuForPath(routes.portfolio)).toBe(NavMenuId.Portfolio);
        expect(navMenuForPath(routes.resume.index)).toBe(NavMenuId.Portfolio);
        expect(navMenuForPath(routes.contact)).toBe(NavMenuId.About);
        expect(navMenuForPath(routes.legal.privacy)).toBe(NavMenuId.About);
        expect(navMenuForPath('/unknown')).toBeNull();
        expect(navMenuForPath(`${routes.lifting.index}-other`)).toBeNull();
    });
});
