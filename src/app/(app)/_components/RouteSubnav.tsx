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
import { cn } from '~/lib/utilities';

const SUBNAV_SLOT_SELECTOR = '#navbar-subnav-slot';
const CENTERING_DIVISOR = 2;
const FULLY_VISIBLE_RATIO = 0.99;

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

interface ScrollEdges {
    readonly hasMoreLeft: boolean;
    readonly hasMoreRight: boolean;
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
    const [edges, setEdges] = useState<ScrollEdges>({
        hasMoreLeft: false,
        hasMoreRight: false,
    });
    const activeHref = activeSubnavHref(pathname, items);
    const highlightedHref =
        clicked?.fromPathname === pathname ? clicked.href : activeHref;

    const firstItem = items.at(0);
    const firstKey =
        firstItem === undefined ? undefined : subnavItemKey(firstItem);
    const lastItem = items.at(-1);
    const lastKey =
        lastItem === undefined ? undefined : subnavItemKey(lastItem);

    useEffect(() => {
        const list = listReference.current;
        const first =
            firstKey === undefined
                ? undefined
                : itemReferences.current.get(firstKey);
        const last =
            lastKey === undefined
                ? undefined
                : itemReferences.current.get(lastKey);
        if (list === null || first === undefined || last === undefined) {
            return;
        }
        const observer = new IntersectionObserver(
            (entries) => {
                for (const entry of entries) {
                    const isClipped =
                        entry.intersectionRatio < FULLY_VISIBLE_RATIO;
                    setEdges((current) =>
                        entry.target === first
                            ? { ...current, hasMoreLeft: isClipped }
                            : { ...current, hasMoreRight: isClipped },
                    );
                }
            },
            { root: list, threshold: [FULLY_VISIBLE_RATIO] },
        );
        observer.observe(first);
        observer.observe(last);
        return () => observer.disconnect();
    }, [firstKey, lastKey]);

    useEffect(() => {
        const list = listReference.current;
        const active =
            activeHref === undefined
                ? undefined
                : itemReferences.current.get(activeHref);
        if (list === null || active === undefined) return;
        list.scrollTo({
            left:
                active.offsetLeft -
                (list.clientWidth - active.offsetWidth) / CENTERING_DIVISOR,
        });
    }, [activeHref]);

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
                        edges.hasMoreLeft && 'mask-l-from-90% mask-l-to-100%',
                        edges.hasMoreRight && 'mask-r-from-90% mask-r-to-100%',
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
