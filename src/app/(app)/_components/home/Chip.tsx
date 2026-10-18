import { type ReactNode } from 'react';

import { cn } from '~/lib/utilities';

export function Chip({
    children,
    className,
}: {
    readonly children: ReactNode;
    readonly className?: string;
}) {
    return (
        <span
            className={cn(
                'app-home__chip',
                'inline-flex items-center gap-2 rounded-full border glass px-3 py-2 type-micro tracking-[0.18em] text-ink',
                className,
            )}
        >
            {children}
        </span>
    );
}
