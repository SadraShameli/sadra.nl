import { type ReactNode } from 'react';

import { AccordionContent } from '~/components/ui/accordion';
import { cn } from '~/lib/utilities';

import { NavGroupColumn } from './NavGroupColumn';
import { NavProductCard } from './NavProductCard';
import { type NavItem, NavItemKind } from './siteNavigation';

export const NAV_MENU_SCROLL_CLASS =
    'max-h-[calc(100svh-7rem)] overflow-y-auto';

interface NavMenuPanelProperties {
    readonly extra: ReactNode;
    readonly menu: NavItem;
}

export function DesktopMenuPanel({ extra, menu }: NavMenuPanelProperties) {
    switch (menu.kind) {
        case NavItemKind.Groups: {
            return (
                <div
                    className={cn(
                        'flex w-max max-w-[calc(100vw-2rem)] flex-wrap gap-x-10 gap-y-8 p-6',
                        NAV_MENU_SCROLL_CLASS,
                    )}
                >
                    {menu.groups.map((group) => (
                        <NavGroupColumn group={group} key={group.label} />
                    ))}
                    {extra}
                </div>
            );
        }
        case NavItemKind.Products: {
            return (
                <div
                    className={cn(
                        'grid w-max max-w-[calc(100vw-2rem)] grid-cols-2 gap-3 p-4 lg:grid-cols-3 xl:auto-cols-fr xl:grid-flow-col xl:grid-cols-none',
                        NAV_MENU_SCROLL_CLASS,
                    )}
                >
                    {menu.products.map((product) => (
                        <NavProductCard key={product.id} product={product} />
                    ))}
                    {extra}
                </div>
            );
        }
    }
}

export function PhoneMenuPanel({ extra, menu }: NavMenuPanelProperties) {
    switch (menu.kind) {
        case NavItemKind.Groups: {
            return (
                <AccordionContent className="flex flex-col gap-5 px-4">
                    {menu.groups.map((group) => (
                        <NavGroupColumn group={group} key={group.label} />
                    ))}
                    {extra}
                </AccordionContent>
            );
        }
        case NavItemKind.Products: {
            return (
                <AccordionContent className="grid grid-cols-2 gap-2 px-2">
                    {menu.products.map((product) => (
                        <NavProductCard key={product.id} product={product} />
                    ))}
                    {extra}
                </AccordionContent>
            );
        }
    }
}
