'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Suspense, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

import {
    activeSubnavHref,
    subnavHref,
    subnavItemKey,
    type SubnavLink,
    subnavLinkAttributes,
} from '~/app/(app)/_components/routeSubnavLinks';
import { useSlidingIndicator } from '~/app/(app)/_components/useSlidingIndicator';
import {
    scrollStripFadeClass,
    useScrollStrip,
} from '~/components/useScrollStrip';
import { cn } from '~/lib/utilities';

const SUBNAV_SLOT_SELECTOR = '#navbar-subnav-slot';
const ACTIVE_ITEM_SELECTOR = '[aria-current="page"]';

export interface RouteSubnavItem extends SubnavLink {
    label: string;
}

interface ClickedItem {
    readonly fromPathname: string;
    readonly href: string;
}

interface RouteSubnavProperties {
    ariaLabel?: string;
    className?: string;
    items: readonly RouteSubnavItem[];
    query?: string;
}

export function RouteSubnav(properties: RouteSubnavProperties) {
    return (
        <Suspense fallback={null}>
            <RouteSubnavPortal {...properties} />
        </Suspense>
    );
}

function RouteSubnavBar({
    ariaLabel,
    className,
    items,
    query = '',
}: RouteSubnavProperties) {
    const pathname = usePathname();
    const listReference = useRef<HTMLDivElement>(null);
    const indicatorReference = useRef<HTMLSpanElement>(null);
    const itemReferences = useRef(new Map<string, HTMLAnchorElement>());
    const [clicked, setClicked] = useState<ClickedItem | null>(null);
    const activeHref = activeSubnavHref(pathname, items);
    const highlightedHref =
        clicked?.fromPathname === pathname ? clicked.href : activeHref;
    const edges = useScrollStrip(listReference, {
        activeKey: activeHref,
        activeSelector: ACTIVE_ITEM_SELECTOR,
    });

    useSlidingIndicator(indicatorReference, itemReferences, highlightedHref);

    return (
        <div className="flex justify-center px-4 pb-3">
            <nav
                aria-label={ariaLabel}
                className={cn(
                    'max-w-capsule min-w-0 rounded-full border glass p-1.5',
                    className,
                )}
            >
                <div
                    className={cn(
                        'relative flex scrollbar-none items-center gap-0.5 overflow-x-auto',
                        scrollStripFadeClass(edges),
                    )}
                    ref={listReference}
                >
                    <span
                        aria-hidden
                        className="pointer-events-none absolute top-0 left-0 rounded-full bg-surface-high opacity-0 transition-[transform,width,height,opacity] duration-300 ease-out motion-reduce:transition-none"
                        ref={indicatorReference}
                    />
                    {items.map((item) => {
                        const key = subnavItemKey(item);
                        return (
                            <Link
                                {...subnavLinkAttributes(item, activeHref)}
                                className="relative shrink-0 rounded-full px-3.5 py-2 text-sm font-medium whitespace-nowrap text-ink-nav focus-camel transition-colors hover:text-ink aria-[current=page]:text-ink"
                                href={subnavHref(item, query)}
                                key={key}
                                onClick={() =>
                                    setClicked({
                                        fromPathname: pathname,
                                        href: key,
                                    })
                                }
                                prefetch={item.prefetch}
                                ref={(element) => {
                                    if (element === null) {
                                        itemReferences.current.delete(key);
                                    } else {
                                        itemReferences.current.set(
                                            key,
                                            element,
                                        );
                                    }
                                }}
                            >
                                {item.label}
                            </Link>
                        );
                    })}
                </div>
            </nav>
        </div>
    );
}

function RouteSubnavPortal(properties: RouteSubnavProperties) {
    const [slot, setSlot] = useState<Element | null>(null);

    useEffect(() => {
        const target = document.querySelector(SUBNAV_SLOT_SELECTOR);
        if (target) {
            setSlot(target);
            return;
        }
        const observer = new MutationObserver(() => {
            const found = document.querySelector(SUBNAV_SLOT_SELECTOR);
            if (!found) {
                return;
            }

            setSlot(found);
            observer.disconnect();
        });
        observer.observe(document.body, { childList: true, subtree: true });
        return () => observer.disconnect();
    }, []);

    return slot === null
        ? null
        : createPortal(<RouteSubnavBar {...properties} />, slot);
}
