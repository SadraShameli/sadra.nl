import { type LucideIcon } from 'lucide-react';
import { type ReactNode } from 'react';

import { HEADER_SCROLL_MARGIN } from '~/app/(app)/_components/headerHeight';
import { ToolPanel } from '~/components/ToolPanel';
import { EmptyState, EmptyStateSize } from '~/components/ui/empty-state';
import { Skeleton } from '~/components/ui/skeleton';
import { cn } from '~/lib/utilities';

import {
    OVERVIEW_SECTION_TITLE,
    overviewSectionAnchor,
    overviewSectionHeadingId,
    type OverviewSectionId,
} from './overviewSections';

export function InfoLines({
    label,
    lines,
}: {
    readonly label?: string;
    readonly lines: readonly string[];
}) {
    return (
        <ul aria-label={label} className="flex list-disc flex-col gap-1 pl-5">
            {lines.map((line) => (
                <li key={line}>{line}</li>
            ))}
        </ul>
    );
}

export function infoLinesOf(lines: readonly string[]): ReactNode {
    return lines.length === 0 ? undefined : <InfoLines lines={lines} />;
}

export function InfoStack({ children }: { readonly children: ReactNode }) {
    return <div className="flex flex-col gap-2">{children}</div>;
}

export function OverviewComputingPanel({
    section,
}: {
    readonly section: OverviewSectionId;
}) {
    return (
        <OverviewPanel isComputing section={section}>
            <Skeleton className="h-40 w-full" />
        </OverviewPanel>
    );
}

export function OverviewEmptyPanel({
    action,
    description,
    icon,
    section,
    title,
}: {
    readonly action?: ReactNode;
    readonly description?: ReactNode;
    readonly icon: LucideIcon;
    readonly section: OverviewSectionId;
    readonly title: string;
}) {
    return (
        <OverviewPanel section={section}>
            <EmptyState
                action={action}
                description={description}
                icon={icon}
                size={EmptyStateSize.Compact}
                title={title}
            />
        </OverviewPanel>
    );
}

export function OverviewPanel({
    children,
    contentClassName,
    description,
    info,
    isComputing = false,
    section,
}: {
    readonly children: ReactNode;
    readonly contentClassName?: string;
    readonly description?: ReactNode;
    readonly info?: ReactNode;
    readonly isComputing?: boolean;
    readonly section: OverviewSectionId;
}) {
    const headingId = overviewSectionHeadingId(section);
    return (
        <section
            aria-labelledby={headingId}
            className={cn(
                'app-prop-accounts__overview-card',
                HEADER_SCROLL_MARGIN,
            )}
            id={overviewSectionAnchor(section)}
        >
            <ToolPanel
                contentClassName={contentClassName}
                description={description}
                info={info}
                isComputing={isComputing}
                title={OVERVIEW_SECTION_TITLE[section]}
                titleId={headingId}
            >
                {children}
            </ToolPanel>
        </section>
    );
}
