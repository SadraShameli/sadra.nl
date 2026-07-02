'use client';

import * as ScrollAreaPrimitive from '@radix-ui/react-scroll-area';
import * as React from 'react';

import { cn } from '~/lib/utils';

const ScrollArea = React.forwardRef<
    React.ComponentRef<typeof ScrollAreaPrimitive.Root>,
    React.ComponentPropsWithoutRef<typeof ScrollAreaPrimitive.Root>
>(({ children, className, ...properties }, reference) => (
    <ScrollAreaPrimitive.Root
        className={cn('relative overflow-hidden', className)}
        ref={reference}
        {...properties}
        type="always"
    >
        <ScrollAreaPrimitive.Viewport className="h-full w-full rounded-[inherit]">
            {children}
        </ScrollAreaPrimitive.Viewport>
        <ScrollBar />
        <ScrollAreaPrimitive.Corner />
    </ScrollAreaPrimitive.Root>
));
ScrollArea.displayName = ScrollAreaPrimitive.Root.displayName;

const ScrollBar = React.forwardRef<
    React.ComponentRef<typeof ScrollAreaPrimitive.ScrollAreaScrollbar>,
    React.ComponentPropsWithoutRef<
        typeof ScrollAreaPrimitive.ScrollAreaScrollbar
    >
>(({ className, orientation = 'vertical', ...properties }, reference) => (
    <ScrollAreaPrimitive.ScrollAreaScrollbar
        className={cn(
            'flex touch-none transition-colors select-none',
            orientation === 'vertical' &&
                'h-full w-2.5 border-l border-l-transparent p-px',
            orientation === 'horizontal' &&
                'h-2.5 flex-col border-t border-t-transparent p-px',
            className,
        )}
        orientation={orientation}
        ref={reference}
        {...properties}
    >
        <ScrollAreaPrimitive.ScrollAreaThumb className="relative flex-1 rounded-full bg-border" />
    </ScrollAreaPrimitive.ScrollAreaScrollbar>
));
ScrollBar.displayName = ScrollAreaPrimitive.ScrollAreaScrollbar.displayName;

export { ScrollArea, ScrollBar };
