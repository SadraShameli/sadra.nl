'use client';

import { Command as CommandPrimitive } from 'cmdk';
import { Search } from 'lucide-react';
import * as React from 'react';

import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogTitle,
} from '~/components/ui/Dialog';
import { cn } from '~/lib/utilities';

const Command = React.forwardRef<
    React.ComponentRef<typeof CommandPrimitive>,
    React.ComponentPropsWithoutRef<typeof CommandPrimitive>
>(({ className, ...properties }, reference) => (
    <CommandPrimitive
        className={cn(
            'flex h-full w-full flex-col overflow-hidden rounded-xl bg-card text-card-foreground',
            className,
        )}
        ref={reference}
        {...properties}
    />
));
Command.displayName = CommandPrimitive.displayName;

const CommandDialog = ({
    children,
    description = 'Search through commands and pick one.',
    title = 'Command Menu',
    ...properties
}: React.ComponentProps<typeof Dialog> & {
    description?: string;
    title?: string;
}) => {
    return (
        <Dialog {...properties}>
            <DialogContent className="overflow-hidden p-0">
                <DialogTitle className="sr-only">{title}</DialogTitle>
                <DialogDescription className="sr-only">
                    {description}
                </DialogDescription>
                <Command className="[&_[cmdk-group]:not([hidden])_~[cmdk-group]]:pt-0 [&_[cmdk-input-wrapper]_svg]:size-5 [&_[cmdk-item]_svg]:size-5 **:[[cmdk-group-heading]]:px-2 **:[[cmdk-group-heading]]:font-medium **:[[cmdk-group-heading]]:text-muted-foreground **:[[cmdk-group]]:px-2 **:[[cmdk-input]]:h-12 **:[[cmdk-item]]:px-2 **:[[cmdk-item]]:py-3">
                    {children}
                </Command>
            </DialogContent>
        </Dialog>
    );
};

const CommandInput = React.forwardRef<
    React.ComponentRef<typeof CommandPrimitive.Input>,
    React.ComponentPropsWithoutRef<typeof CommandPrimitive.Input>
>(({ className, ...properties }, reference) => (
    <div
        className="flex items-center border-b border-white/6 px-3"
        data-slot="command-input-wrapper"
    >
        <Search className="mr-2 size-4 shrink-0 text-muted-foreground" />
        <CommandPrimitive.Input
            className={cn(
                'flex h-11 w-full bg-transparent py-3 text-sm text-foreground outline-none placeholder:text-muted-foreground disabled:cursor-not-allowed disabled:opacity-50',
                className,
            )}
            ref={reference}
            {...properties}
        />
    </div>
));
CommandInput.displayName = CommandPrimitive.Input.displayName;

const CommandList = React.forwardRef<
    React.ComponentRef<typeof CommandPrimitive.List>,
    React.ComponentPropsWithoutRef<typeof CommandPrimitive.List>
>(({ className, ...properties }, reference) => (
    <CommandPrimitive.List
        className={cn('max-h-75 overflow-x-hidden overflow-y-auto', className)}
        ref={reference}
        {...properties}
    />
));
CommandList.displayName = CommandPrimitive.List.displayName;

const CommandEmpty = React.forwardRef<
    React.ComponentRef<typeof CommandPrimitive.Empty>,
    React.ComponentPropsWithoutRef<typeof CommandPrimitive.Empty>
>((properties, reference) => (
    <CommandPrimitive.Empty
        className="py-6 text-center text-sm"
        ref={reference}
        {...properties}
    />
));
CommandEmpty.displayName = CommandPrimitive.Empty.displayName;

const CommandGroup = React.forwardRef<
    React.ComponentRef<typeof CommandPrimitive.Group>,
    React.ComponentPropsWithoutRef<typeof CommandPrimitive.Group>
>(({ className, ...properties }, reference) => (
    <CommandPrimitive.Group
        className={cn(
            'overflow-hidden p-1 text-foreground **:[[cmdk-group-heading]]:px-2 **:[[cmdk-group-heading]]:py-1.5 **:[[cmdk-group-heading]]:text-xs **:[[cmdk-group-heading]]:font-medium **:[[cmdk-group-heading]]:text-muted-foreground',
            className,
        )}
        ref={reference}
        {...properties}
    />
));
CommandGroup.displayName = CommandPrimitive.Group.displayName;

const CommandSeparator = React.forwardRef<
    React.ComponentRef<typeof CommandPrimitive.Separator>,
    React.ComponentPropsWithoutRef<typeof CommandPrimitive.Separator>
>(({ className, ...properties }, reference) => (
    <CommandPrimitive.Separator
        className={cn('-mx-1 h-px bg-white/6', className)}
        ref={reference}
        {...properties}
    />
));
CommandSeparator.displayName = CommandPrimitive.Separator.displayName;

const CommandItem = React.forwardRef<
    React.ComponentRef<typeof CommandPrimitive.Item>,
    React.ComponentPropsWithoutRef<typeof CommandPrimitive.Item>
>(({ className, ...properties }, reference) => (
    <CommandPrimitive.Item
        className={cn(
            "relative flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm text-neutral-100 transition outline-none select-none data-[disabled=true]:pointer-events-none data-[disabled=true]:opacity-50 data-[selected='true']:bg-primary/15 data-[selected='true']:text-foreground",
            className,
        )}
        ref={reference}
        {...properties}
    />
));
CommandItem.displayName = CommandPrimitive.Item.displayName;

const CommandShortcut = ({
    className,
    ...properties
}: React.HTMLAttributes<HTMLSpanElement>) => {
    return (
        <span
            className={cn(
                'ml-auto text-xs tracking-widest text-muted-foreground',
                className,
            )}
            {...properties}
        />
    );
};
CommandShortcut.displayName = 'CommandShortcut';

export {
    Command,
    CommandDialog,
    CommandEmpty,
    CommandGroup,
    CommandInput,
    CommandItem,
    CommandList,
    CommandSeparator,
    CommandShortcut,
};
