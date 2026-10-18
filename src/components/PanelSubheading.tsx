import { type ReactNode } from 'react';

import InfoPopover from '~/components/ui/info-popover';
import { type TitleTag } from '~/components/ui/title-tag';
import { cn } from '~/lib/utilities';

export function PanelSubheading({
    as: Tag = 'h3',
    children,
    className,
    id,
    info,
}: {
    readonly as?: TitleTag;
    readonly children: ReactNode;
    readonly className?: string;
    readonly id?: string;
    readonly info?: ReactNode;
}) {
    const heading = (
        <Tag
            className={cn(
                'm-0 text-sm font-medium text-ink',
                info === undefined && className,
            )}
            id={id}
        >
            {children}
        </Tag>
    );
    if (info === undefined) return heading;
    return (
        <div className={cn('flex items-center gap-2', className)}>
            {heading}
            <InfoPopover
                title={
                    typeof children === 'string' ? children : 'About this part'
                }
            >
                {info}
            </InfoPopover>
        </div>
    );
}
