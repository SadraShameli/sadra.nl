import { Slot } from '@radix-ui/react-slot';
import * as React from 'react';

import { cn } from '~/lib/utilities';

function Empty({ className, ...properties }: React.ComponentProps<'div'>) {
    return (
        <div
            className={cn(
                'flex min-w-0 flex-1 animate-in flex-col items-center justify-center gap-6 rounded-lg border-dashed p-6 text-center text-balance duration-300 fade-in-0 md:p-12',
                className,
            )}
            data-slot="empty"
            {...properties}
        />
    );
}

function EmptyContent({
    className,
    ...properties
}: React.ComponentProps<'div'>) {
    return (
        <div
            className={cn('flex flex-col items-center gap-2', className)}
            data-slot="empty-content"
            {...properties}
        />
    );
}

function EmptyDescription({
    className,
    ...properties
}: React.ComponentProps<'p'>) {
    return (
        <p
            className={cn('max-w-sm text-xs text-muted-foreground', className)}
            data-slot="empty-description"
            {...properties}
        />
    );
}

function EmptyHeader({
    className,
    ...properties
}: React.ComponentProps<'div'>) {
    return (
        <div
            className={cn(
                'flex max-w-sm flex-col items-center gap-2 text-center',
                className,
            )}
            data-slot="empty-header"
            {...properties}
        />
    );
}

function EmptyMedia({
    asChild = false,
    className,
    variant = 'default',
    ...properties
}: React.ComponentProps<'div'> & {
    asChild?: boolean;
    variant?: 'default' | 'icon';
}) {
    const Comp = asChild ? Slot : 'div';
    return (
        <Comp
            className={cn(
                'mb-2 flex shrink-0 items-center justify-center',
                variant === 'icon' &&
                    'size-10 rounded-full bg-muted/40 text-muted-foreground [&_svg]:size-5',
                className,
            )}
            data-slot="empty-media"
            data-variant={variant}
            {...properties}
        />
    );
}

function EmptyTitle({ className, ...properties }: React.ComponentProps<'div'>) {
    return (
        <div
            className={cn('text-sm font-medium text-foreground', className)}
            data-slot="empty-title"
            {...properties}
        />
    );
}

export {
    Empty,
    EmptyContent,
    EmptyDescription,
    EmptyHeader,
    EmptyMedia,
    EmptyTitle,
};
