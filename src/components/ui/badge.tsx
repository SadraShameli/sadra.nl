import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';
import * as React from 'react';

import { cn } from '~/lib/utilities';

const badgeVariants = cva(
    'inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2',
    {
        defaultVariants: {
            variant: 'outline',
        },
        variants: {
            variant: {
                default:
                    'border-transparent bg-primary text-primary-foreground hover:bg-primary/80',
                destructive:
                    'border-destructive/40 bg-destructive/10 text-destructive',
                outline: 'border-line-strong text-ink',
                secondary:
                    'border-transparent bg-secondary text-secondary-foreground hover:bg-secondary/80',
                success: 'border-success/40 bg-success/10 text-success',
                warning: 'border-warning/40 bg-warning/10 text-warning',
            },
        },
    },
);

export interface BadgeProperties
    extends
        React.HTMLAttributes<HTMLSpanElement>,
        VariantProps<typeof badgeVariants> {
    asChild?: boolean;
}

function Badge({
    asChild = false,
    className,
    variant,
    ...properties
}: BadgeProperties) {
    const Comp = asChild ? Slot : 'span';
    return (
        <Comp
            className={cn(badgeVariants({ variant }), className)}
            {...properties}
        />
    );
}

export { Badge, badgeVariants };
