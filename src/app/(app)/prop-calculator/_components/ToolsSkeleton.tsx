'use client';

import { usePathname } from 'next/navigation';

import { InputsBesideResults } from '~/components/InputsBesideResults';
import { PageHeaderSkeleton } from '~/components/PageSkeleton';
import { Skeleton } from '~/components/ui/skeleton';
import { cn } from '~/lib/utilities';

import { PanelSkeleton, PanelSkeletonSize } from './PanelSkeleton';
import { toolForPathname } from './toolCatalog';
import { toolNavItems } from './toolNavItems';
import { ToolEntryHeader, toolGroupTabs } from './ToolPageHeading';

const SKELETON_NAV_ITEMS = toolNavItems('');

export function ToolsPageSkeleton() {
    const entry = toolForPathname(usePathname());
    return (
        <main
            aria-busy="true"
            className={cn('app-prop-calculator', 'container pt-spacing pb-24')}
        >
            {entry === null ? (
                <PageHeaderSkeleton />
            ) : (
                <ToolEntryHeader
                    actions={
                        entry.sharesState ? (
                            <Skeleton className="h-9 w-40 shrink-0" />
                        ) : undefined
                    }
                    entry={entry}
                    tabs={toolGroupTabs(entry, SKELETON_NAV_ITEMS)}
                />
            )}
            <div className="mb-10 flex flex-col gap-6">
                <PanelSkeleton size={PanelSkeletonSize.Bar} />
                <InputsBesideResults
                    inputs={<PanelSkeleton />}
                    results={<PanelSkeleton size={PanelSkeletonSize.Aside} />}
                />
            </div>
        </main>
    );
}
