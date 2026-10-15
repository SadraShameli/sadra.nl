'use client';

import { usePathname } from 'next/navigation';

import { PageHeaderSkeleton } from '~/components/PageSkeleton';
import { Skeleton } from '~/components/ui/Skeleton';
import { cn } from '~/lib/utilities';

import { PanelSkeleton, PanelSkeletonSize } from './PanelSkeleton';
import { toolForPathname } from './toolCatalog';
import { ToolHeaderFrame, ToolHeadingText } from './ToolPageHeading';

export function ToolsPageSkeleton() {
    const entry = toolForPathname(usePathname());
    return (
        <main
            aria-busy="true"
            className={cn('app-prop-calculator', 'container pt-spacing pb-24')}
        >
            <ToolHeaderFrame
                toolbar={
                    entry?.sharesState === true && (
                        <Skeleton className="h-9 w-40 shrink-0" />
                    )
                }
            >
                {entry === null ? (
                    <PageHeaderSkeleton className="mb-0" />
                ) : (
                    <ToolHeadingText entry={entry} />
                )}
            </ToolHeaderFrame>
            <div className="mb-10 flex flex-col gap-6">
                <PanelSkeleton size={PanelSkeletonSize.Bar} />
                <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]">
                    <PanelSkeleton />
                    <PanelSkeleton size={PanelSkeletonSize.Aside} />
                </div>
            </div>
        </main>
    );
}
