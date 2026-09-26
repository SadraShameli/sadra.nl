import { type ReactNode } from 'react';

import { type FirmId } from '~/lib/prop-calculator';
import { type LegacySection } from '~/lib/site/legacyCalculatorLinks';
import { cn } from '~/lib/utilities';

interface ToolSectionProperties {
    children: ReactNode;
    className?: string;
    id: `rules-${FirmId}` | LegacySection;
    srOnlyHeading?: boolean;
    title: string;
}

export function ToolSection({
    children,
    className,
    id,
    srOnlyHeading = false,
    title,
}: ToolSectionProperties) {
    const headingId = `${id}-heading`;
    return (
        <section
            aria-labelledby={headingId}
            className={cn(
                `app-prop-calculator__section-${id}`,
                'flex scroll-mt-26 flex-col gap-4',
                className,
            )}
            id={id}
        >
            <h2
                className={
                    srOnlyHeading
                        ? 'sr-only'
                        : 'text-lg font-semibold tracking-tight text-white'
                }
                id={headingId}
            >
                {title}
            </h2>
            {children}
        </section>
    );
}
