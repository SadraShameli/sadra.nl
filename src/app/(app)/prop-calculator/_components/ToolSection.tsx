import { type ReactNode } from 'react';

import { HEADER_SCROLL_MARGIN } from '~/app/(app)/_components/headerHeight';
import { ToolSectionHeading } from '~/app/(app)/_components/ToolSectionHeading';
import InfoPopover from '~/components/ui/InfoPopover';
import { type FirmId } from '~/lib/prop-calculator';
import { type LegacySection } from '~/lib/site/legacyCalculatorLinks';
import { cn } from '~/lib/utilities';

interface ToolSectionProperties {
    children: ReactNode;
    className?: string;
    id: `rules-${FirmId}` | LegacySection;
    info?: ReactNode;
    srOnlyHeading?: boolean;
    title: string;
}

export function ToolSection({
    children,
    className,
    id,
    info,
    srOnlyHeading = false,
    title,
}: ToolSectionProperties) {
    const headingId = `${id}-heading`;
    const heading = (
        <ToolSectionHeading
            className={srOnlyHeading ? 'sr-only' : undefined}
            id={headingId}
        >
            {title}
        </ToolSectionHeading>
    );
    return (
        <section
            aria-labelledby={headingId}
            className={cn(
                `app-prop-calculator__section-${id}`,
                'flex flex-col gap-4',
                HEADER_SCROLL_MARGIN,
                className,
            )}
            id={id}
        >
            {info === undefined ? (
                heading
            ) : (
                <div className="flex items-center gap-2">
                    {heading}
                    <InfoPopover title={title}>{info}</InfoPopover>
                </div>
            )}
            {children}
        </section>
    );
}
