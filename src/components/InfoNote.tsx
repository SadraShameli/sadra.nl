import { type ComponentProps, type ReactNode } from 'react';

import InfoPopover from '~/components/ui/info-popover';
import { cn } from '~/lib/utilities';

type InfoNoteProperties = ComponentProps<'div'> & {
    readonly children: ReactNode;
    readonly info?: ReactNode;
    readonly infoTitle?: string;
};

export function InfoNote({
    children,
    className,
    info,
    infoTitle,
    ...properties
}: InfoNoteProperties) {
    return (
        <div
            className={cn(
                'app-info-note',
                'flex items-center gap-1.5 text-sm text-ink-muted',
                className,
            )}
            {...properties}
        >
            <span className="min-w-0">{children}</span>
            {info !== undefined && infoTitle !== undefined && (
                <InfoPopover title={infoTitle}>{info}</InfoPopover>
            )}
        </div>
    );
}
