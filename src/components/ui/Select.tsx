'use client';

import * as SelectPrimitive from '@radix-ui/react-select';
import { Check, ChevronDown, ChevronUp } from 'lucide-react';
import * as React from 'react';

import { cn } from '~/lib/utils';

const Select = SelectPrimitive.Root;

const SelectGroup = SelectPrimitive.Group;

const SelectValue = SelectPrimitive.Value;

const SelectTrigger = React.forwardRef<
    React.ComponentRef<typeof SelectPrimitive.Trigger>,
    React.ComponentPropsWithoutRef<typeof SelectPrimitive.Trigger>
>(({ children, className, ...properties }, reference) => (
    <SelectPrimitive.Trigger
        className={cn(
            'flex h-9 w-full items-center justify-between gap-2 rounded-md border border-input bg-background px-3 py-2 text-sm shadow-xs transition-colors outline-none',
            'data-placeholder:text-muted-foreground',
            'focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50',
            'disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50',
            'dark:border-input dark:bg-input/30',
            '[&>span]:line-clamp-1',
            className,
        )}
        ref={reference}
        {...properties}
    >
        {children}
        <SelectPrimitive.Icon asChild>
            <ChevronDown className="size-4 text-muted-foreground" />
        </SelectPrimitive.Icon>
    </SelectPrimitive.Trigger>
));
SelectTrigger.displayName = SelectPrimitive.Trigger.displayName;

const SelectScrollUpButton = React.forwardRef<
    React.ComponentRef<typeof SelectPrimitive.ScrollUpButton>,
    React.ComponentPropsWithoutRef<typeof SelectPrimitive.ScrollUpButton>
>(({ className, ...properties }, reference) => (
    <SelectPrimitive.ScrollUpButton
        className={cn(
            'flex cursor-default items-center justify-center py-1',
            className,
        )}
        ref={reference}
        {...properties}
    >
        <ChevronUp className="size-4" />
    </SelectPrimitive.ScrollUpButton>
));
SelectScrollUpButton.displayName = SelectPrimitive.ScrollUpButton.displayName;

const SelectScrollDownButton = React.forwardRef<
    React.ComponentRef<typeof SelectPrimitive.ScrollDownButton>,
    React.ComponentPropsWithoutRef<typeof SelectPrimitive.ScrollDownButton>
>(({ className, ...properties }, reference) => (
    <SelectPrimitive.ScrollDownButton
        className={cn(
            'flex cursor-default items-center justify-center py-1',
            className,
        )}
        ref={reference}
        {...properties}
    >
        <ChevronDown className="size-4" />
    </SelectPrimitive.ScrollDownButton>
));
SelectScrollDownButton.displayName =
    SelectPrimitive.ScrollDownButton.displayName;

const SelectContent = React.forwardRef<
    React.ComponentRef<typeof SelectPrimitive.Content>,
    React.ComponentPropsWithoutRef<typeof SelectPrimitive.Content>
>(({ children, className, position = 'popper', ...properties }, reference) => (
    <SelectPrimitive.Portal>
        <SelectPrimitive.Content
            className={cn(
                'relative z-50 max-h-(--radix-select-content-available-height) min-w-32 origin-(--radix-select-content-transform-origin) overflow-x-hidden overflow-y-auto rounded-md border bg-popover text-popover-foreground shadow-md',
                'data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95 data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95',
                'data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2',
                position === 'popper' &&
                    'data-[side=bottom]:translate-y-1 data-[side=left]:-translate-x-1 data-[side=right]:translate-x-1 data-[side=top]:-translate-y-1',
                className,
            )}
            position={position}
            ref={reference}
            {...properties}
        >
            <SelectScrollUpButton />
            <SelectPrimitive.Viewport
                className={cn(
                    'p-1',
                    position === 'popper' &&
                        'h-(--radix-select-trigger-height) w-full min-w-(--radix-select-trigger-width) scroll-my-1',
                )}
            >
                {children}
            </SelectPrimitive.Viewport>
            <SelectScrollDownButton />
        </SelectPrimitive.Content>
    </SelectPrimitive.Portal>
));
SelectContent.displayName = SelectPrimitive.Content.displayName;

const SelectLabel = React.forwardRef<
    React.ComponentRef<typeof SelectPrimitive.Label>,
    React.ComponentPropsWithoutRef<typeof SelectPrimitive.Label>
>(({ className, ...properties }, reference) => (
    <SelectPrimitive.Label
        className={cn(
            'px-2 py-1.5 text-xs font-medium text-muted-foreground',
            className,
        )}
        ref={reference}
        {...properties}
    />
));
SelectLabel.displayName = SelectPrimitive.Label.displayName;

const SelectItem = React.forwardRef<
    React.ComponentRef<typeof SelectPrimitive.Item>,
    React.ComponentPropsWithoutRef<typeof SelectPrimitive.Item>
>(({ children, className, ...properties }, reference) => (
    <SelectPrimitive.Item
        className={cn(
            'relative flex w-full cursor-default items-center gap-2 rounded-sm py-1.5 pr-8 pl-2 text-sm outline-none select-none',
            'focus:bg-accent focus:text-accent-foreground',
            'data-disabled:pointer-events-none data-disabled:opacity-50',
            '*:[span]:last:flex *:[span]:last:items-center *:[span]:last:gap-2',
            className,
        )}
        ref={reference}
        {...properties}
    >
        <span className="absolute right-2 flex size-3.5 items-center justify-center">
            <SelectPrimitive.ItemIndicator>
                <Check className="size-4" />
            </SelectPrimitive.ItemIndicator>
        </span>
        <SelectPrimitive.ItemText>{children}</SelectPrimitive.ItemText>
    </SelectPrimitive.Item>
));
SelectItem.displayName = SelectPrimitive.Item.displayName;

const SelectSeparator = React.forwardRef<
    React.ComponentRef<typeof SelectPrimitive.Separator>,
    React.ComponentPropsWithoutRef<typeof SelectPrimitive.Separator>
>(({ className, ...properties }, reference) => (
    <SelectPrimitive.Separator
        className={cn('-mx-1 my-1 h-px bg-border', className)}
        ref={reference}
        {...properties}
    />
));
SelectSeparator.displayName = SelectPrimitive.Separator.displayName;

export {
    Select,
    SelectContent,
    SelectGroup,
    SelectItem,
    SelectLabel,
    SelectScrollDownButton,
    SelectScrollUpButton,
    SelectSeparator,
    SelectTrigger,
    SelectValue,
};
