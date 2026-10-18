'use client';

import {
    createContext,
    type ReactNode,
    useContext,
    useEffect,
    useState,
} from 'react';

import { HEADER_SCROLL_MARGIN } from '~/app/(app)/_components/headerHeight';
import { ToolPanel } from '~/components/ToolPanel';
import { ToolSectionHeading } from '~/components/ToolSectionHeading';
import InfoPopover from '~/components/ui/info-popover';
import { type FirmId } from '~/lib/prop-calculator';
import { type LegacySection } from '~/lib/site/legacyCalculatorLinks';
import { cn } from '~/lib/utilities';

type SectionComputingReporter = (isComputing: boolean) => void;

const SectionComputingContext = createContext<null | SectionComputingReporter>(
    null,
);

interface ToolSectionProperties {
    children: ReactNode;
    className?: string;
    description?: ReactNode;
    id: `rules-${FirmId}` | LegacySection;
    info?: ReactNode;
    isComputing?: boolean;
    isPanel?: boolean;
    srOnlyHeading?: boolean;
    title: string;
}

export function ToolSection({
    children,
    className,
    description,
    id,
    info,
    isComputing = false,
    isPanel = false,
    srOnlyHeading = false,
    title,
}: ToolSectionProperties) {
    const [isContentComputing, setIsContentComputing] = useState(false);
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
            {isPanel ? (
                <ToolPanel
                    description={description}
                    info={info}
                    isComputing={isComputing || isContentComputing}
                    title={title}
                    titleId={headingId}
                >
                    <SectionComputingContext value={setIsContentComputing}>
                        {children}
                    </SectionComputingContext>
                </ToolPanel>
            ) : (
                <>
                    {info === undefined ? (
                        heading
                    ) : (
                        <div className="flex items-center gap-2">
                            {heading}
                            <InfoPopover title={title}>{info}</InfoPopover>
                        </div>
                    )}
                    {children}
                </>
            )}
        </section>
    );
}

export function useSectionComputing(isComputing: boolean): void {
    const report = useContext(SectionComputingContext);
    useEffect(() => {
        if (report === null) return;
        report(isComputing);
        return () => {
            report(false);
        };
    }, [isComputing, report]);
}
