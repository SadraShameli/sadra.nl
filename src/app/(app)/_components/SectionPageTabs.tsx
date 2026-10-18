'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Suspense, useRef } from 'react';

import {
    activeSubnavGroup,
    subnavHref,
    type SubnavLink,
} from '~/app/(app)/_components/routeSubnavLinks';
import { TABS_LIST_CLASS, TABS_TRIGGER_CLASS } from '~/components/ui/tabs';
import { useIsClient } from '~/components/useIsClient';
import {
    scrollStripFadeClass,
    useScrollStrip,
} from '~/components/useScrollStrip';
import { sameOriginRoute } from '~/lib/site/routes';
import { cn } from '~/lib/utilities';

const ACTIVE_PAGE_SELECTOR = '[aria-current="page"]';

interface SectionPageTabsProperties {
    readonly items: readonly SubnavLink[];
    readonly label: string;
}

export function SectionPageTabs(properties: SectionPageTabsProperties) {
    return (
        <Suspense fallback={null}>
            <SectionPageTabsAtPath {...properties} />
        </Suspense>
    );
}

function SectionPageTabsAtPath({ items, label }: SectionPageTabsProperties) {
    const pathname = usePathname();
    const isClient = useIsClient();
    const stripReference = useRef<HTMLElement>(null);
    const edges = useScrollStrip(stripReference, {
        activeKey: pathname,
        activeSelector: ACTIVE_PAGE_SELECTOR,
    });
    const pages = activeSubnavGroup(pathname, items)?.pages;
    if (pages === undefined) return null;
    return (
        <nav
            aria-label={label}
            className={cn(
                'relative -mx-1 max-w-full scrollbar-none overflow-x-auto px-1 pb-1',
                scrollStripFadeClass(edges),
            )}
            ref={stripReference}
        >
            <div className={cn(TABS_LIST_CLASS, 'inline-flex w-max')}>
                {pages.map((page) => (
                    <Link
                        aria-current={
                            page.href === pathname ? 'page' : undefined
                        }
                        className={cn(
                            TABS_TRIGGER_CLASS,
                            'aria-[current=page]:selected-option',
                        )}
                        href={
                            isClient
                                ? subnavHref(page, '')
                                : sameOriginRoute(page.href, '')
                        }
                        key={page.href}
                        prefetch={page.prefetch}
                    >
                        {page.label}
                    </Link>
                ))}
            </div>
        </nav>
    );
}
