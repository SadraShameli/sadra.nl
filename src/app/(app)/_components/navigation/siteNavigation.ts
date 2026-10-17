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
    siteToolTitle,
    ToolTicker,
} from '~/lib/site/content';
import {
    homeSection,
    homeSectionHref,
    HomeSectionId,
} from '~/lib/site/homeSections';
import { routes, sameOriginRoute } from '~/lib/site/routes';

export enum NavMenuId {
    About = 'about',
    Portfolio = 'portfolio',
    SensorHub = 'sensor-hub',
    Tools = 'tools',
}

export interface NavGroup {
    readonly href?: NavHref;
    readonly label: string;
    readonly links: readonly NavLink[];
}

export interface NavMenu {
    readonly groups: readonly NavGroup[];
    readonly id: NavMenuId;
    readonly label: string;
}

type NavHref = Route | UrlObject;

interface NavLink {
    readonly href: NavHref;
    readonly label: string;
}

interface PathLink {
    readonly href: string;
    readonly label: string;
}

function homeSectionLinks(ids: readonly HomeSectionId[]): NavLink[] {
    return ids.map((id) => ({
        href: homeSectionHref(id),
        label: homeSection(id).indexLabel,
    }));
}

function pathLinks(items: readonly PathLink[]): NavLink[] {
    return items.map((item) => ({
        href: sameOriginRoute(item.href, ''),
        label: item.label,
    }));
}

export const NAV_MENUS: readonly NavMenu[] = [
    {
        groups: [
            {
                href: sameOriginRoute(routes.propCalculator.index, ''),
                label: siteToolTitle(ToolTicker.PropCalculator),
                links: pathLinks(
                    LINKED_TOOL_CATALOG.map((entry) => ({
                        href: entry.route,
                        label: entry.label,
                    })),
                ),
            },
            {
                href: sameOriginRoute(routes.propCalculator.accounts.index, ''),
                label: 'Prop accounts',
                links: pathLinks(ACCOUNTS_NAV_ITEMS),
            },
            {
                href: sameOriginRoute(routes.tradeChecklist.index, ''),
                label: siteToolTitle(ToolTicker.Checklist),
                links: pathLinks(TRADE_CHECKLIST_NAV),
            },
            {
                href: sameOriginRoute(routes.lifting.index, ''),
                label: siteToolTitle(ToolTicker.Lifting),
                links: pathLinks(LIFTING_NAV),
            },
        ],
        id: NavMenuId.Tools,
        label: 'Tools',
    },
    {
        groups: [
            {
                href: homeSectionHref(HomeSectionId.SensorHub),
                label: homeSection(HomeSectionId.SensorHub).indexLabel,
                links: homeSectionLinks([
                    HomeSectionId.Readings,
                    HomeSectionId.Recordings,
                ]),
            },
        ],
        id: NavMenuId.SensorHub,
        label: 'Sensor Hub',
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
        label: 'About',
    },
];

export const ACCOUNTING_NAV_GROUP: NavGroup = {
    href: sameOriginRoute(routes.accounting.index, ''),
    label: ACCOUNTING_EYEBROW,
    links: pathLinks(ACCOUNTING_NAV),
};

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
