import { type ReactNode } from 'react';

import { cn } from '~/lib/utilities';

export function FilterToolbar({
    children,
    className,
    label,
}: {
    readonly children: ReactNode;
    readonly className?: string;
    readonly label: string;
}) {
    return (
        <div
            aria-label={label}
            className={cn(
                'app-filter-toolbar',
                'flex flex-wrap items-center gap-2',
                className,
            )}
            role="group"
        >
            {children}
        </div>
    );
}
