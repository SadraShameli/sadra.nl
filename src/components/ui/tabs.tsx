'use client';

import * as TabsPrimitive from '@radix-ui/react-tabs';
import * as React from 'react';

import { cn } from '~/lib/utilities';

const Tabs = TabsPrimitive.Root;

const TABS_LIST_CLASS =
    'inline-table h-10 items-center justify-center rounded-full bg-muted p-1 text-muted-foreground';

const TABS_TRIGGER_CLASS =
    'inline-flex items-center justify-center rounded-full px-3 py-1.5 text-sm font-medium whitespace-nowrap ring-offset-background transition-all focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:outline-hidden disabled:pointer-events-none disabled:opacity-50 data-[state=active]:selected-option';

const TabsList = React.forwardRef<
    React.ComponentRef<typeof TabsPrimitive.List>,
    React.ComponentPropsWithoutRef<typeof TabsPrimitive.List>
>(({ className, ...properties }, reference) => (
    <TabsPrimitive.List
        className={cn(TABS_LIST_CLASS, className)}
        ref={reference}
        {...properties}
    />
));
TabsList.displayName = TabsPrimitive.List.displayName;

const TabsTrigger = React.forwardRef<
    React.ComponentRef<typeof TabsPrimitive.Trigger>,
    React.ComponentPropsWithoutRef<typeof TabsPrimitive.Trigger>
>(({ className, ...properties }, reference) => (
    <TabsPrimitive.Trigger
        className={cn(TABS_TRIGGER_CLASS, className)}
        ref={reference}
        {...properties}
    />
));
TabsTrigger.displayName = TabsPrimitive.Trigger.displayName;

const TabsContent = React.forwardRef<
    React.ComponentRef<typeof TabsPrimitive.Content>,
    React.ComponentPropsWithoutRef<typeof TabsPrimitive.Content>
>(({ className, ...properties }, reference) => (
    <TabsPrimitive.Content
        className={cn(
            'mt-2 ring-offset-background focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:outline-hidden data-[state=active]:animate-in data-[state=active]:duration-200 data-[state=active]:fade-in-0',
            className,
        )}
        ref={reference}
        {...properties}
    />
));
TabsContent.displayName = TabsPrimitive.Content.displayName;

export {
    Tabs,
    TABS_LIST_CLASS,
    TABS_TRIGGER_CLASS,
    TabsContent,
    TabsList,
    TabsTrigger,
};
