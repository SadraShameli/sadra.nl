import { type ReactNode } from 'react';

import { HEADER_SCROLL_MARGIN } from '~/app/(app)/_components/headerHeight';
import { ToolPanel } from '~/components/ToolPanel';
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

export function OverviewPanel({
    children,
    contentClassName,
    description,
    info,
    section,
}: {
    readonly children: ReactNode;
    readonly contentClassName?: string;
    readonly description?: ReactNode;
    readonly info?: ReactNode;
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
                title={OVERVIEW_SECTION_TITLE[section]}
                titleId={headingId}
            >
                {children}
            </ToolPanel>
        </section>
    );
}
