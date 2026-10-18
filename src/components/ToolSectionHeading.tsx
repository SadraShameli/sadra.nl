import { type ReactNode, type Ref } from 'react';

import { type TitleTag } from '~/components/ui/title-tag';
import { cn } from '~/lib/utilities';

export function ToolSectionHeading({
    as: Tag = 'h2',
    children,
    className,
    id,
    ref,
}: {
    readonly as?: TitleTag;
    readonly children: ReactNode;
    readonly className?: string;
    readonly id?: string;
    readonly ref?: Ref<HTMLHeadingElement>;
}) {
    return (
        <Tag
            className={cn(
                'm-0 type-display-item text-ink',
                ref !== undefined && 'outline-none',
                className,
            )}
            id={id}
            ref={ref}
            tabIndex={ref === undefined ? undefined : -1}
        >
            {children}
        </Tag>
    );
}
