import { TriangleAlert } from 'lucide-react';
import { type ComponentProps } from 'react';

import { cn } from '~/lib/utilities';

export function WarningNote({
    children,
    className,
    ...properties
}: ComponentProps<'span'>) {
    return (
        <span
            className={cn(
                'app-warning-note',
                'inline-flex items-start gap-1.5 text-ink',
                className,
            )}
            {...properties}
        >
            <TriangleAlert
                aria-hidden
                className="mt-[0.2em] size-[1em] shrink-0"
            />
            <span className="min-w-0">{children}</span>
        </span>
    );
}
