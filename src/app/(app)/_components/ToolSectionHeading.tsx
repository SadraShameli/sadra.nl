import { type ReactNode } from 'react';

import { type TitleTag } from '~/components/ui/title-tag';
import { cn } from '~/lib/utilities';

export function ToolSectionHeading({
    as: Tag = 'h2',
    children,
    className,
    id,
}: {
    readonly as?: TitleTag;
    readonly children: ReactNode;
    readonly className?: string;
    readonly id?: string;
}) {
    return (
        <Tag
            className={cn('m-0 type-display-item text-ink', className)}
            id={id}
        >
            {children}
        </Tag>
    );
}
