'use client';

import * as ToggleGroupPrimitive from '@radix-ui/react-toggle-group';
import { type VariantProps } from 'class-variance-authority';
import * as React from 'react';

import { toggleVariants } from '~/components/ui/Toggle';
import { cn } from '~/lib/utilities';

const ToggleGroupContext = React.createContext<
    VariantProps<typeof toggleVariants>
>({
    size: 'default',
    variant: 'default',
});

const ToggleGroup = React.forwardRef<
    React.ComponentRef<typeof ToggleGroupPrimitive.Root>,
    React.ComponentPropsWithoutRef<typeof ToggleGroupPrimitive.Root> &
        VariantProps<typeof toggleVariants>
>(({ children, className, size, variant, ...properties }, reference) => (
    <ToggleGroupPrimitive.Root
        className={cn('flex items-center justify-center gap-1', className)}
        ref={reference}
        {...properties}
    >
        <ToggleGroupContext.Provider value={{ size, variant }}>
            {children}
        </ToggleGroupContext.Provider>
    </ToggleGroupPrimitive.Root>
));

ToggleGroup.displayName = ToggleGroupPrimitive.Root.displayName;

const ToggleGroupItem = React.forwardRef<
    React.ComponentRef<typeof ToggleGroupPrimitive.Item>,
    React.ComponentPropsWithoutRef<typeof ToggleGroupPrimitive.Item> &
        VariantProps<typeof toggleVariants>
>(({ children, className, size, variant, ...properties }, reference) => {
    const context = React.useContext(ToggleGroupContext);

    return (
        <ToggleGroupPrimitive.Item
            className={cn(
                toggleVariants({
                    size: context.size ?? size,
                    variant: context.variant ?? variant,
                }),
                className,
            )}
            ref={reference}
            {...properties}
        >
            {children}
        </ToggleGroupPrimitive.Item>
    );
});

ToggleGroupItem.displayName = ToggleGroupPrimitive.Item.displayName;

export { ToggleGroup, ToggleGroupItem };
