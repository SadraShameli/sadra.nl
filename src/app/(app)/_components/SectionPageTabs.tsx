'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Suspense } from 'react';

import {
    activeSubnavGroup,
    subnavHref,
    type SubnavLink,
} from '~/app/(app)/_components/routeSubnavLinks';
import { TABS_LIST_CLASS, TABS_TRIGGER_CLASS } from '~/components/ui/tabs';
import { cn } from '~/lib/utilities';

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
    const pages = activeSubnavGroup(pathname, items)?.pages;
    if (pages === undefined) return null;
    return (
        <nav
            aria-label={label}
            className="-mx-1 max-w-full overflow-x-auto px-1 pb-1"
        >
            <div className={cn(TABS_LIST_CLASS, 'inline-flex w-max')}>
                {pages.map((page) => (
                    <Link
                        aria-current={
                            page.href === pathname ? 'page' : undefined
                        }
                        className={cn(
                            TABS_TRIGGER_CLASS,
                            'aria-[current=page]:selected-pill',
                        )}
                        href={subnavHref(page, '')}
                        key={page.href}
                    >
                        {page.label}
                    </Link>
                ))}
            </div>
        </nav>
    );
}
