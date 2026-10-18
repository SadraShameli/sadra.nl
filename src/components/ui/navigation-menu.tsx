'use client';

import * as NavigationMenuPrimitive from '@radix-ui/react-navigation-menu';
import { ChevronDown } from 'lucide-react';
import * as React from 'react';

import { cn } from '~/lib/utilities';

const OPEN_TRIGGER_SELECTOR =
    '[data-slot=navigation-menu-trigger][data-state=open]';
const OPEN_CONTENT_SELECTOR =
    '[data-slot=navigation-menu-content][data-state=open]';
const CENTERING_DIVISOR = 2;

function useViewportAnchor(
    rootReference: React.RefObject<HTMLElement | null>,
    anchorReference: React.RefObject<HTMLDivElement | null>,
): void {
    React.useLayoutEffect(() => {
        const root = rootReference.current;
        const anchor = anchorReference.current;
        if (root === null || anchor === null) return;
        const place = () => {
            const trigger = root.querySelector(OPEN_TRIGGER_SELECTOR);
            const content = anchor.querySelector(OPEN_CONTENT_SELECTOR);
            if (trigger === null || content === null) return;
            const { width } = content.getBoundingClientRect();
            const rootBox = root.getBoundingClientRect();
            const triggerBox = trigger.getBoundingClientRect();
            const room = rootBox.width - width;
            const centered =
                triggerBox.left -
                rootBox.left +
                (triggerBox.width - width) / CENTERING_DIVISOR;
            const left = `${String(
                room < 0
                    ? room / CENTERING_DIVISOR
                    : Math.min(Math.max(centered, 0), room),
            )}px`;
            if (anchor.style.left !== left) anchor.style.left = left;
        };
        place();
        const contentObserver = new MutationObserver(place);
        contentObserver.observe(anchor, {
            attributeFilter: ['data-state', 'style'],
            attributes: true,
            childList: true,
            subtree: true,
        });
        const rootObserver = new ResizeObserver(place);
        rootObserver.observe(root);
        return () => {
            contentObserver.disconnect();
            rootObserver.disconnect();
        };
    }, [anchorReference, rootReference]);
}

const NavigationMenu = React.forwardRef<
    React.ComponentRef<typeof NavigationMenuPrimitive.Root>,
    React.ComponentPropsWithoutRef<typeof NavigationMenuPrimitive.Root>
>(({ children, className, ...properties }, reference) => {
    const rootReference = React.useRef<HTMLElement | null>(null);
    const anchorReference = React.useRef<HTMLDivElement | null>(null);
    useViewportAnchor(rootReference, anchorReference);
    return (
        <NavigationMenuPrimitive.Root
            className={cn('group/menu relative', className)}
            ref={(node) => {
                rootReference.current = node;
                if (typeof reference === 'function') reference(node);
                else if (reference !== null) reference.current = node;
            }}
            {...properties}
        >
            {children}
            <div
                className="absolute top-full left-0 z-10 hidden pt-3 ease-out group-data-[switching=true]/menu:transition-[left] group-data-[switching=true]/menu:duration-200 motion-reduce:transition-none md:block"
                ref={anchorReference}
            >
                <NavigationMenuPrimitive.Viewport className="relative h-(--radix-navigation-menu-viewport-height) w-(--radix-navigation-menu-viewport-width) overflow-hidden rounded-4xl border glass transition-none duration-100 ease-out group-data-[switching=true]/menu:transition-[width,height] group-data-[switching=true]/menu:duration-200 data-[state=closed]:animate-out data-[state=closed]:fade-out data-[state=open]:animate-in data-[state=open]:fade-in motion-reduce:animate-none motion-reduce:transition-none" />
            </div>
        </NavigationMenuPrimitive.Root>
    );
});
NavigationMenu.displayName = NavigationMenuPrimitive.Root.displayName;

const NavigationMenuList = React.forwardRef<
    React.ComponentRef<typeof NavigationMenuPrimitive.List>,
    React.ComponentPropsWithoutRef<typeof NavigationMenuPrimitive.List>
>(({ className, ...properties }, reference) => (
    <NavigationMenuPrimitive.List
        className={cn('m-0 flex list-none items-center gap-0.5 p-0', className)}
        ref={reference}
        {...properties}
    />
));
NavigationMenuList.displayName = NavigationMenuPrimitive.List.displayName;

const NavigationMenuItem = NavigationMenuPrimitive.Item;

const NAVIGATION_MENU_ITEM_CLASS =
    'relative inline-flex items-center gap-1 rounded-full px-3.5 py-2.5 text-[15px] leading-[1.2] font-medium whitespace-nowrap text-ink-nav focus-camel transition-colors hover:text-ink';

const NavigationMenuLink = React.forwardRef<
    React.ComponentRef<typeof NavigationMenuPrimitive.Link>,
    React.ComponentPropsWithoutRef<typeof NavigationMenuPrimitive.Link>
>(({ className, ...properties }, reference) => (
    <NavigationMenuPrimitive.Link
        className={cn(
            NAVIGATION_MENU_ITEM_CLASS,
            'aria-[current=location]:text-ink aria-[current=page]:text-ink',
            className,
        )}
        data-slot="navigation-menu-link"
        ref={reference}
        {...properties}
    />
));
NavigationMenuLink.displayName = NavigationMenuPrimitive.Link.displayName;

const NavigationMenuTrigger = React.forwardRef<
    React.ComponentRef<typeof NavigationMenuPrimitive.Trigger>,
    React.ComponentPropsWithoutRef<typeof NavigationMenuPrimitive.Trigger>
>(({ children, className, ...properties }, reference) => (
    <NavigationMenuPrimitive.Trigger
        className={cn(
            NAVIGATION_MENU_ITEM_CLASS,
            'group data-[state=open]:text-ink',
            className,
        )}
        data-slot="navigation-menu-trigger"
        ref={reference}
        {...properties}
    >
        {children}
        <ChevronDown
            aria-hidden
            className="size-3.5 transition duration-200 group-data-[state=open]:rotate-180"
            strokeWidth={1.6}
        />
    </NavigationMenuPrimitive.Trigger>
));
NavigationMenuTrigger.displayName = NavigationMenuPrimitive.Trigger.displayName;

const NavigationMenuContent = React.forwardRef<
    React.ComponentRef<typeof NavigationMenuPrimitive.Content>,
    React.ComponentPropsWithoutRef<typeof NavigationMenuPrimitive.Content>
>(({ className, ...properties }, reference) => (
    <NavigationMenuPrimitive.Content
        className={cn('top-0 left-0 md:absolute', className)}
        data-slot="navigation-menu-content"
        ref={reference}
        {...properties}
    />
));
NavigationMenuContent.displayName = NavigationMenuPrimitive.Content.displayName;

export {
    NavigationMenu,
    NavigationMenuContent,
    NavigationMenuItem,
    NavigationMenuLink,
    NavigationMenuList,
    NavigationMenuTrigger,
};
