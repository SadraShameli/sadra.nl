'use client';

import { House, Menu, X } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { type MouseEvent, type ReactNode, useRef, useState } from 'react';

import { ColorModeToggle } from '~/components/ColorModeToggle';
import {
    Accordion,
    AccordionContent,
    AccordionItem,
    AccordionTrigger,
} from '~/components/ui/Accordion';
import { Button } from '~/components/ui/Button';
import {
    NavigationMenu,
    NavigationMenuContent,
    NavigationMenuItem,
    NavigationMenuList,
    NavigationMenuTrigger,
} from '~/components/ui/NavigationMenu';
import {
    Popover,
    PopoverContent,
    PopoverTrigger,
} from '~/components/ui/Popover';
import { SocialIcon } from '~/components/ui/SocialIcon';
import { siteContent } from '~/lib/site/content';
import { routes } from '~/lib/site/routes';
import { cn } from '~/lib/utilities';

import { NavGroupColumn } from './navigation/NavGroupColumn';
import {
    HOME_SECTION_MENU,
    NAV_MENUS,
    type NavMenu,
    navMenuForPath,
    type NavMenuId,
} from './navigation/siteNavigation';
import {
    type ActiveHomeNavItem,
    HomeNavTarget,
    useActiveHomeNavItem,
} from './useActiveHomeNavItem';
import { useHeaderHeightVariable } from './useHeaderHeightVariable';
import { useSlidingIndicator } from './useSlidingIndicator';

export type NavMenuExtras = Readonly<Partial<Record<NavMenuId, ReactNode>>>;

type NavbarHighlight = HomeNavTarget | NavMenuId;

const CLOSED_MENU = '';

export default function Navbar({
    accountLink,
    menuExtras,
}: {
    readonly accountLink: ReactNode;
    readonly menuExtras: NavMenuExtras;
}) {
    const pathname = usePathname();
    const navReference = useRef<HTMLElement>(null);
    const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
    const [openMenu, setOpenMenu] = useState(CLOSED_MENU);
    const [isSwitchingMenu, setIsSwitchingMenu] = useState(false);
    const changeMenu = (next: string) => {
        setIsSwitchingMenu(openMenu !== CLOSED_MENU && next !== CLOSED_MENU);
        setOpenMenu(next);
    };
    useHeaderHeightVariable(navReference);
    const { activeItem, pin } = useActiveHomeNavItem();
    const indicatorReference = useRef<HTMLSpanElement>(null);
    const itemReferences = useRef(new Map<NavbarHighlight, HTMLElement>());
    useSlidingIndicator(
        indicatorReference,
        itemReferences,
        navbarHighlight(pathname, activeItem),
    );
    const registerItem =
        (item: NavbarHighlight) => (element: HTMLElement | null) => {
            if (element === null) itemReferences.current.delete(item);
            else itemReferences.current.set(item, element);
        };

    return (
        <header
            className={cn('app-shell__navbar', 'sticky inset-x-0 top-0 z-50')}
            ref={navReference}
        >
            <div className="@container flex justify-center px-4 pt-4.5 pb-3">
                <NavigationMenu
                    aria-label="Main"
                    className="w-full max-w-capsule"
                    data-switching={isSwitchingMenu}
                    delayDuration={80}
                    onValueChange={changeMenu}
                    value={openMenu}
                >
                    <div className="flex w-full items-center justify-between gap-1.5 rounded-4xl border glass p-2 md:flex-wrap md:justify-center @capsule:justify-between">
                        <div className="relative flex items-center gap-0.5">
                            <span
                                aria-hidden
                                className="pointer-events-none absolute top-0 left-0 rounded-full bg-surface-high opacity-0 transition-[transform,width,height,opacity] duration-300 ease-out motion-reduce:transition-none"
                                ref={indicatorReference}
                            />
                            <Button
                                asChild
                                className={cn(
                                    'app-shell__home',
                                    'relative aria-[current=location]:text-ink',
                                )}
                                size="icon-tap"
                                variant="capsule"
                            >
                                <Link
                                    aria-current={
                                        activeItem === HomeNavTarget.Top
                                            ? 'location'
                                            : undefined
                                    }
                                    aria-label="Home"
                                    href={routes.home}
                                    onClick={() => pin(HomeNavTarget.Top)}
                                    ref={registerItem(HomeNavTarget.Top)}
                                >
                                    <House aria-hidden strokeWidth={1.6} />
                                </Link>
                            </Button>
                            <NavigationMenuList className="hidden md:flex">
                                {NAV_MENUS.map((menu) => (
                                    <NavigationMenuItem
                                        key={menu.id}
                                        value={menu.id}
                                    >
                                        <NavigationMenuTrigger
                                            ref={registerItem(menu.id)}
                                        >
                                            {menu.label}
                                        </NavigationMenuTrigger>
                                        <NavigationMenuContent
                                            onClick={(event) => {
                                                if (isLinkClick(event)) {
                                                    changeMenu(CLOSED_MENU);
                                                }
                                            }}
                                        >
                                            <MenuPanel
                                                extra={menuExtras[menu.id]}
                                                menu={menu}
                                            />
                                        </NavigationMenuContent>
                                    </NavigationMenuItem>
                                ))}
                            </NavigationMenuList>
                        </div>

                        <CapsuleDivider />

                        <div className="flex items-center gap-1">
                            <div className="hidden items-center gap-1 md:flex">
                                <SocialLinks />
                            </div>
                            <ColorModeToggle className="app-shell__color-mode" />
                            {accountLink}
                            <Popover
                                onOpenChange={setIsMobileMenuOpen}
                                open={isMobileMenuOpen}
                            >
                                <PopoverTrigger asChild>
                                    <Button
                                        aria-label={
                                            isMobileMenuOpen
                                                ? 'Close menu'
                                                : 'Open menu'
                                        }
                                        className="app-shell__menu-toggle md:hidden"
                                        size="icon-tap"
                                        type="button"
                                        variant="capsule"
                                    >
                                        {isMobileMenuOpen ? (
                                            <X aria-hidden strokeWidth={1.6} />
                                        ) : (
                                            <Menu
                                                aria-hidden
                                                strokeWidth={1.6}
                                            />
                                        )}
                                    </Button>
                                </PopoverTrigger>
                                <PopoverContent
                                    align="end"
                                    className="max-h-[calc(100svh-7rem)] w-[calc(100vw-2rem)] max-w-sm overflow-y-auto rounded-3xl border glass p-2"
                                    onClick={(event) => {
                                        if (isLinkClick(event)) {
                                            setIsMobileMenuOpen(false);
                                        }
                                    }}
                                    sideOffset={12}
                                >
                                    <Accordion collapsible type="single">
                                        {NAV_MENUS.map((menu) => (
                                            <AccordionItem
                                                className="border-line"
                                                key={menu.id}
                                                value={menu.id}
                                            >
                                                <AccordionTrigger className="px-4 py-3 text-base font-medium text-ink hover:no-underline">
                                                    {menu.label}
                                                </AccordionTrigger>
                                                <AccordionContent className="flex flex-col gap-5 px-4">
                                                    {menu.groups.map(
                                                        (group) => (
                                                            <NavGroupColumn
                                                                group={group}
                                                                key={
                                                                    group.label
                                                                }
                                                            />
                                                        ),
                                                    )}
                                                    {menuExtras[menu.id]}
                                                </AccordionContent>
                                            </AccordionItem>
                                        ))}
                                    </Accordion>
                                    <div className="mt-2 flex items-center gap-1 px-2 pt-2">
                                        <SocialLinks />
                                    </div>
                                </PopoverContent>
                            </Popover>
                        </div>
                    </div>
                </NavigationMenu>
            </div>
            <div className={'app-shell__subnav-slot'} id="navbar-subnav-slot" />
        </header>
    );
}

function CapsuleDivider() {
    return (
        <span aria-hidden className="mx-1.5 hidden h-6 w-px bg-line md:block" />
    );
}

function isLinkClick(event: MouseEvent<HTMLElement>): boolean {
    return (
        event.target instanceof Element && event.target.closest('a') !== null
    );
}

function MenuPanel({
    extra,
    menu,
}: {
    readonly extra: ReactNode;
    readonly menu: NavMenu;
}) {
    return (
        <div className="flex w-max max-w-[calc(100vw-2rem)] flex-wrap gap-x-10 gap-y-8 p-6">
            {menu.groups.map((group) => (
                <NavGroupColumn group={group} key={group.label} />
            ))}
            {extra}
        </div>
    );
}

function navbarHighlight(
    pathname: string,
    activeItem: ActiveHomeNavItem | null,
): NavbarHighlight | null {
    if (activeItem === null) return navMenuForPath(pathname);
    return activeItem === HomeNavTarget.Top
        ? HomeNavTarget.Top
        : HOME_SECTION_MENU[activeItem];
}

function SocialLinks() {
    return siteContent.socialLinks.map((profile) => (
        <Button
            asChild
            className="app-shell__social-link"
            key={profile.url}
            size="icon-tap"
            variant="capsule"
        >
            <Link aria-label={profile.title} href={profile.url}>
                <SocialIcon platform={profile.platform} />
            </Link>
        </Button>
    ));
}
