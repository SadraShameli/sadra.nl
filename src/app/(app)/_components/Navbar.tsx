'use client';

import { House, Menu, X } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
    type MouseEvent,
    type ReactNode,
    Suspense,
    useRef,
    useState,
} from 'react';

import { ColorModeToggle } from '~/components/ColorModeToggle';
import {
    Accordion,
    AccordionItem,
    AccordionTrigger,
} from '~/components/ui/accordion';
import { Button } from '~/components/ui/button';
import {
    NavigationMenu,
    NavigationMenuContent,
    NavigationMenuItem,
    NavigationMenuList,
    NavigationMenuTrigger,
} from '~/components/ui/navigation-menu';
import {
    Popover,
    PopoverAnchor,
    PopoverContent,
    PopoverTrigger,
} from '~/components/ui/popover';
import { siteContent } from '~/lib/site/content';
import { routes } from '~/lib/site/routes';
import { cn } from '~/lib/utilities';

import {
    DesktopMenuPanel,
    NAV_MENU_SCROLL_CLASS,
    PhoneMenuPanel,
} from './navigation/NavMenuPanels';
import {
    HOME_SECTION_MENU,
    NAV_ITEMS,
    navMenuForPath,
    type NavMenuId,
} from './navigation/siteNavigation';
import { SocialLinkButtons } from './SocialLinkButtons';
import {
    type ActiveHomeNavItem,
    HomeNavTarget,
    useActiveHomeNavItem,
} from './useActiveHomeNavItem';
import { useHeaderHeightVariable } from './useHeaderHeightVariable';
import { useSlidingIndicator } from './useSlidingIndicator';

type NavbarHighlight = HomeNavTarget | NavMenuId;

type NavMenuExtras = Readonly<Partial<Record<NavMenuId, ReactNode>>>;

const CLOSED_MENU = '';

const PHONE_MENU_ROW_CLASS = 'px-4 py-3 text-base font-medium text-ink';

interface NavbarProperties {
    readonly accountLink: ReactNode;
    readonly menuExtras: NavMenuExtras;
}

export default function Navbar(properties: NavbarProperties) {
    const headerReference = useRef<HTMLElement>(null);
    useHeaderHeightVariable(headerReference);
    return (
        <header
            className={cn('app-shell__navbar', 'sticky inset-x-0 top-0 z-50')}
            ref={headerReference}
        >
            <Suspense fallback={<NavbarView {...properties} pathname={null} />}>
                <NavbarAtPath {...properties} />
            </Suspense>
            <div className="app-shell__subnav-slot" id="navbar-subnav-slot" />
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

function NavbarAtPath(properties: NavbarProperties) {
    return <NavbarView {...properties} pathname={usePathname()} />;
}

function navbarHighlight(
    pathname: null | string,
    activeItem: ActiveHomeNavItem | null,
): NavbarHighlight | null {
    if (activeItem === null) {
        return pathname === null ? null : navMenuForPath(pathname);
    }
    return activeItem === HomeNavTarget.Top
        ? HomeNavTarget.Top
        : HOME_SECTION_MENU[activeItem];
}

function NavbarView({
    accountLink,
    menuExtras,
    pathname,
}: NavbarProperties & { readonly pathname: null | string }) {
    const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
    const [openMenu, setOpenMenu] = useState(CLOSED_MENU);
    const [isSwitchingMenu, setIsSwitchingMenu] = useState(false);
    const changeMenu = (next: string) => {
        setIsSwitchingMenu(openMenu !== CLOSED_MENU && next !== CLOSED_MENU);
        setOpenMenu(next);
    };
    const { activeItem, pin } = useActiveHomeNavItem(pathname === routes.home);
    const indicatorReference = useRef<HTMLSpanElement>(null);
    const itemReferences = useRef(new Map<NavbarHighlight, HTMLElement>());
    const highlight = navbarHighlight(pathname, activeItem);
    useSlidingIndicator(indicatorReference, itemReferences, highlight);
    const registerItem =
        (item: NavbarHighlight) => (element: HTMLElement | null) => {
            if (element === null) itemReferences.current.delete(item);
            else itemReferences.current.set(item, element);
        };

    return (
        <div className="@container flex justify-center px-4 pt-4.5 pb-3">
            <NavigationMenu
                aria-label="Main"
                className="w-full max-w-capsule"
                data-switching={isSwitchingMenu}
                delayDuration={80}
                onValueChange={changeMenu}
                value={openMenu}
            >
                <Popover
                    onOpenChange={setIsMobileMenuOpen}
                    open={isMobileMenuOpen}
                >
                    <PopoverAnchor asChild>
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
                                <span className="pr-2 pl-1 font-serif text-xl leading-none text-ink md:hidden">
                                    {siteContent.manifest.shortName}
                                </span>
                                <NavigationMenuList className="hidden md:flex">
                                    {NAV_ITEMS.map((item) => (
                                        <NavigationMenuItem
                                            key={item.id}
                                            value={item.id}
                                        >
                                            <NavigationMenuTrigger
                                                aria-current={
                                                    highlight === item.id
                                                        ? 'location'
                                                        : undefined
                                                }
                                                ref={registerItem(item.id)}
                                            >
                                                {item.label}
                                            </NavigationMenuTrigger>
                                            <NavigationMenuContent
                                                onClick={(event) => {
                                                    if (isLinkClick(event)) {
                                                        changeMenu(CLOSED_MENU);
                                                    }
                                                }}
                                            >
                                                <DesktopMenuPanel
                                                    extra={menuExtras[item.id]}
                                                    menu={item}
                                                />
                                            </NavigationMenuContent>
                                        </NavigationMenuItem>
                                    ))}
                                </NavigationMenuList>
                            </div>

                            <CapsuleDivider />

                            <div className="flex items-center gap-1">
                                <div className="hidden items-center gap-1 md:flex">
                                    <SocialLinkButtons className="app-shell__social-link" />
                                </div>
                                <ColorModeToggle className="app-shell__color-mode" />
                                {accountLink}
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
                                    className={cn(
                                        'w-(--radix-popper-anchor-width) rounded-4xl border glass p-2',
                                        NAV_MENU_SCROLL_CLASS,
                                    )}
                                    onClick={(event) => {
                                        if (isLinkClick(event)) {
                                            setIsMobileMenuOpen(false);
                                        }
                                    }}
                                    onOpenAutoFocus={(event) =>
                                        event.preventDefault()
                                    }
                                    sideOffset={12}
                                >
                                    <Accordion collapsible type="single">
                                        {NAV_ITEMS.map((item) => (
                                            <AccordionItem
                                                className="border-line"
                                                key={item.id}
                                                value={item.id}
                                            >
                                                <AccordionTrigger
                                                    className={cn(
                                                        PHONE_MENU_ROW_CLASS,
                                                        'hover:no-underline',
                                                    )}
                                                >
                                                    {item.label}
                                                </AccordionTrigger>
                                                <PhoneMenuPanel
                                                    extra={menuExtras[item.id]}
                                                    menu={item}
                                                />
                                            </AccordionItem>
                                        ))}
                                    </Accordion>
                                    <div className="mt-2 flex items-center gap-1 px-2 pt-2">
                                        <SocialLinkButtons className="app-shell__social-link" />
                                    </div>
                                </PopoverContent>
                            </div>
                        </div>
                    </PopoverAnchor>
                </Popover>
            </NavigationMenu>
        </div>
    );
}
