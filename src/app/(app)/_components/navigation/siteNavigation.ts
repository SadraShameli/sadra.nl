import { type Route } from 'next';
import { type UrlObject } from 'node:url';

import {
    ACCOUNTING_EYEBROW,
    ACCOUNTING_NAV,
} from '~/app/(app)/accounting/_components/AccountingSection';
import { LIFTING_NAV } from '~/app/(app)/lifting/_components/liftingNav';
import { LINKED_TOOL_CATALOG } from '~/app/(app)/prop-calculator/_components/toolCatalog';
import { ACCOUNTS_NAV_ITEMS } from '~/app/(app)/prop-calculator/accounts/_components/accountsNavItems';
import { TRADE_CHECKLIST_NAV } from '~/app/(app)/trade-checklist/_components/tradeChecklistNav';
import {
    portfolioContent,
    portfolioSectionHref,
    siteTool,
    siteToolTitle,
    ToolTicker,
} from '~/lib/site/content';
import {
    homeSection,
    homeSectionHref,
    HomeSectionId,
} from '~/lib/site/homeSections';
import { routes, sameOriginRoute } from '~/lib/site/routes';

export enum NavItemKind {
    Groups = 'groups',
    HomeSection = 'home-section',
    Products = 'products',
}

export enum NavMenuId {
    About = 'about',
    Portfolio = 'portfolio',
    SensorHub = 'sensor-hub',
    Tools = 'tools',
}

export enum NavProductId {
    Accounting = 'accounting',
    Lifting = 'lifting',
    PropAccounts = 'prop-accounts',
    PropCalculator = 'prop-calculator',
    TradeChecklist = 'trade-checklist',
}

export interface NavGroup {
    readonly href?: NavHref;
    readonly label: string;
    readonly links: readonly NavLink[];
}

export interface NavHomeSectionLink extends NavItemBase {
    readonly kind: NavItemKind.HomeSection;
    readonly section: HomeSectionId;
}

export type NavItem = NavHomeSectionLink | NavMenu;

export interface NavLink {
    readonly href: NavHref;
    readonly label: string;
}

export type NavMenu = NavGroupsMenu | NavProductsMenu;

export interface NavProduct {
    readonly description: string;
    readonly href: NavHref;
    readonly id: NavProductId;
    readonly label: string;
    readonly links: readonly NavLink[];
}

interface NavGroupsMenu extends NavItemBase {
    readonly groups: readonly NavGroup[];
    readonly kind: NavItemKind.Groups;
}

type NavHref = Route | UrlObject;

interface NavItemBase {
    readonly id: NavMenuId;
    readonly label: string;
}

interface NavProductsMenu extends NavItemBase {
    readonly kind: NavItemKind.Products;
    readonly products: readonly NavProduct[];
}

interface PathLink {
    readonly href: string;
    readonly label: string;
}

const ALL_TOOLS_LABEL = 'All tools';

function pathLinks(items: readonly PathLink[]): NavLink[] {
    return items.map((item) => ({
        href: sameOriginRoute(item.href, ''),
        label: item.label,
    }));
}

function siteToolProduct(
    ticker: ToolTicker,
    id: NavProductId,
    links: readonly NavLink[],
): NavProduct {
    const tool = siteTool(ticker);
    return {
        description: tool.description,
        href: sameOriginRoute(tool.href, ''),
        id,
        label: tool.shortTitle,
        links,
    };
}

const TOOLS_NAV_PRODUCTS: readonly NavProduct[] = [
    siteToolProduct(ToolTicker.PropCalculator, NavProductId.PropCalculator, [
        ...pathLinks(
            LINKED_TOOL_CATALOG.filter((entry) => entry.featured).map(
                (entry) => ({ href: entry.route, label: entry.label }),
            ),
        ),
        ...pathLinks([
            { href: routes.propCalculator.index, label: ALL_TOOLS_LABEL },
        ]),
    ]),
    {
        description:
            'Every prop account with its stage, its spend and the payouts received.',
        href: sameOriginRoute(routes.propCalculator.accounts.index, ''),
        id: NavProductId.PropAccounts,
        label: 'Prop accounts',
        links: pathLinks(ACCOUNTS_NAV_ITEMS),
    },
    siteToolProduct(
        ToolTicker.Checklist,
        NavProductId.TradeChecklist,
        pathLinks(TRADE_CHECKLIST_NAV),
    ),
    siteToolProduct(
        ToolTicker.Lifting,
        NavProductId.Lifting,
        pathLinks(LIFTING_NAV),
    ),
];

export const ACCOUNTING_NAV_PRODUCT: NavProduct = {
    description:
        'Bank and card transactions, previewed and posted to the books.',
    href: sameOriginRoute(routes.accounting.index, ''),
    id: NavProductId.Accounting,
    label: ACCOUNTING_EYEBROW,
    links: pathLinks(ACCOUNTING_NAV),
};

export const NAV_ITEMS: readonly NavItem[] = [
    {
        id: NavMenuId.Tools,
        kind: NavItemKind.Products,
        label: 'Tools',
        products: TOOLS_NAV_PRODUCTS,
    },
    {
        id: NavMenuId.SensorHub,
        kind: NavItemKind.HomeSection,
        label: homeSection(HomeSectionId.SensorHub).indexLabel,
        section: HomeSectionId.SensorHub,
    },
    {
        groups: [
            {
                href: sameOriginRoute(routes.portfolio, ''),
                label: siteToolTitle(ToolTicker.Portfolio),
                links: portfolioContent.sections.map((section) => ({
                    href: portfolioSectionHref(section.id),
                    label: section.eyebrow,
                })),
            },
        ],
        id: NavMenuId.Portfolio,
        kind: NavItemKind.Groups,
        label: 'Portfolio',
    },
    {
        groups: [
            {
                label: 'About',
                links: [
                    {
                        href: homeSectionHref(HomeSectionId.About),
                        label: 'About me',
                    },
                    ...pathLinks([
                        { href: routes.contact, label: 'Contact' },
                        { href: routes.legal.privacy, label: 'Privacy policy' },
                        { href: routes.legal.terms, label: 'Terms of use' },
                    ]),
                ],
            },
        ],
        id: NavMenuId.About,
        kind: NavItemKind.Groups,
        label: 'About',
    },
];

export const RESUME_NAV_GROUP: NavGroup = {
    href: sameOriginRoute(routes.resume.index, ''),
    label: 'Resume',
    links: pathLinks([{ href: routes.resume.index, label: 'PDF resumes' }]),
};

export const HOME_SECTION_MENU: Readonly<Record<HomeSectionId, NavMenuId>> = {
    [HomeSectionId.About]: NavMenuId.About,
    [HomeSectionId.Readings]: NavMenuId.SensorHub,
    [HomeSectionId.Recordings]: NavMenuId.SensorHub,
    [HomeSectionId.SensorHub]: NavMenuId.SensorHub,
    [HomeSectionId.Tools]: NavMenuId.Tools,
};

const PATH_MENUS: readonly (readonly [string, NavMenuId])[] = [
    [routes.propCalculator.index, NavMenuId.Tools],
    [routes.tradeChecklist.index, NavMenuId.Tools],
    [routes.lifting.index, NavMenuId.Tools],
    [routes.accounting.index, NavMenuId.Tools],
    [routes.portfolio, NavMenuId.Portfolio],
    [routes.resume.index, NavMenuId.Portfolio],
    [routes.contact, NavMenuId.About],
    [routes.legal.privacy, NavMenuId.About],
    [routes.legal.terms, NavMenuId.About],
];

export function navMenuForPath(pathname: string): NavMenuId | null {
    const match = PATH_MENUS.find(
        ([prefix]) => pathname === prefix || pathname.startsWith(`${prefix}/`),
    );
    return match === undefined ? null : match[1];
}
