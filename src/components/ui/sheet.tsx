'use client';

import * as SheetPrimitive from '@radix-ui/react-dialog';
import { XIcon } from 'lucide-react';
import * as React from 'react';

import { cn } from '~/lib/utilities';

enum SheetSide {
    Bottom = 'bottom',
    Left = 'left',
    Right = 'right',
    Top = 'top',
}

const SHEET_SIDE_CLASS: Record<SheetSide, string> = {
    [SheetSide.Bottom]:
        'inset-x-0 bottom-0 h-auto border-t data-[state=closed]:slide-out-to-bottom data-[state=open]:slide-in-from-bottom',
    [SheetSide.Left]:
        'inset-y-0 left-0 h-full w-3/4 border-r data-[state=closed]:slide-out-to-left data-[state=open]:slide-in-from-left sm:max-w-sm',
    [SheetSide.Right]:
        'inset-y-0 right-0 h-full w-3/4 border-l data-[state=closed]:slide-out-to-right data-[state=open]:slide-in-from-right sm:max-w-sm',
    [SheetSide.Top]:
        'inset-x-0 top-0 h-auto border-b data-[state=closed]:slide-out-to-top data-[state=open]:slide-in-from-top',
};

function Sheet({
    ...properties
}: React.ComponentProps<typeof SheetPrimitive.Root>) {
    return <SheetPrimitive.Root data-slot="sheet" {...properties} />;
}

function SheetClose({
    ...properties
}: React.ComponentProps<typeof SheetPrimitive.Close>) {
    return <SheetPrimitive.Close data-slot="sheet-close" {...properties} />;
}

function SheetContent({
    children,
    className,
    showCloseButton = true,
    side = SheetSide.Right,
    ...properties
}: React.ComponentProps<typeof SheetPrimitive.Content> & {
    showCloseButton?: boolean;
    side?: SheetSide;
}) {
    return (
        <SheetPortal>
            <SheetOverlay />
            <SheetPrimitive.Content
                className={cn(
                    'fixed z-50 flex flex-col gap-4 bg-background shadow-lg transition ease-in-out data-[state=closed]:animate-out data-[state=closed]:duration-300 data-[state=open]:animate-in data-[state=open]:duration-500',
                    SHEET_SIDE_CLASS[side],
                    className,
                )}
                data-slot="sheet-content"
                {...properties}
            >
                {children}
                {showCloseButton && (
                    <SheetPrimitive.Close className="absolute top-4 right-4 rounded-xs opacity-70 ring-offset-background transition-opacity hover:opacity-100 focus:ring-2 focus:ring-ring focus:ring-offset-2 focus:outline-hidden disabled:pointer-events-none data-[state=open]:bg-secondary">
                        <XIcon className="size-4" />
                        <span className="sr-only">Close</span>
                    </SheetPrimitive.Close>
                )}
            </SheetPrimitive.Content>
        </SheetPortal>
    );
}

function SheetDescription({
    className,
    ...properties
}: React.ComponentProps<typeof SheetPrimitive.Description>) {
    return (
        <SheetPrimitive.Description
            className={cn('text-sm text-muted-foreground', className)}
            data-slot="sheet-description"
            {...properties}
        />
    );
}

function SheetFooter({
    className,
    ...properties
}: React.ComponentProps<'div'>) {
    return (
        <div
            className={cn('mt-auto flex flex-col gap-2 p-4', className)}
            data-slot="sheet-footer"
            {...properties}
        />
    );
}

function SheetHeader({
    className,
    ...properties
}: React.ComponentProps<'div'>) {
    return (
        <div
            className={cn('flex flex-col gap-1.5 p-4', className)}
            data-slot="sheet-header"
            {...properties}
        />
    );
}

function SheetOverlay({
    className,
    ...properties
}: React.ComponentProps<typeof SheetPrimitive.Overlay>) {
    return (
        <SheetPrimitive.Overlay
            className={cn(
                'fixed inset-0 z-50 bg-background/70 backdrop-blur-sm data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:animate-in data-[state=open]:fade-in-0',
                className,
            )}
            data-slot="sheet-overlay"
            {...properties}
        />
    );
}

function SheetPortal({
    ...properties
}: React.ComponentProps<typeof SheetPrimitive.Portal>) {
    return <SheetPrimitive.Portal data-slot="sheet-portal" {...properties} />;
}

function SheetTitle({
    className,
    ...properties
}: React.ComponentProps<typeof SheetPrimitive.Title>) {
    return (
        <SheetPrimitive.Title
            className={cn('font-semibold text-foreground', className)}
            data-slot="sheet-title"
            {...properties}
        />
    );
}

function SheetTrigger({
    ...properties
}: React.ComponentProps<typeof SheetPrimitive.Trigger>) {
    return <SheetPrimitive.Trigger data-slot="sheet-trigger" {...properties} />;
}

export {
    Sheet,
    SheetClose,
    SheetContent,
    SheetDescription,
    SheetFooter,
    SheetHeader,
    SheetSide,
    SheetTitle,
    SheetTrigger,
};
