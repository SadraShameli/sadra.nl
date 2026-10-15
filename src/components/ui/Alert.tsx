'use client';

import { cva, type VariantProps } from 'class-variance-authority';
import * as React from 'react';

import { type TitleTag } from '~/components/ui/titleTag';
import { cn } from '~/lib/utilities';

const alertVariants = cva(
    'relative w-full rounded-lg border p-4 [&>svg~*]:pl-7 [&>svg+[data-slot=alert-description]]:translate-y-[-3px] [&>svg]:absolute [&>svg]:left-4 [&>svg]:top-4 [&>svg]:text-foreground',
    {
        defaultVariants: {
            variant: 'default',
        },
        variants: {
            variant: {
                default: 'bg-background text-foreground',
                destructive:
                    'border-destructive/40 bg-destructive/10 text-destructive [&>svg]:text-destructive',
                success:
                    'border-emerald-500/40 bg-emerald-500/10 text-emerald-400 [&>svg]:text-emerald-400',
                warning:
                    'border-amber-500/40 bg-amber-500/10 text-amber-400 [&>svg]:text-amber-400',
            },
        },
    },
);

type AlertProperties = React.HTMLAttributes<HTMLDivElement> &
    VariantProps<typeof alertVariants>;

type AlertTitleProperties = React.HTMLAttributes<HTMLHeadingElement> & {
    as?: TitleTag;
};

type AlertVariant = NonNullable<AlertProperties['variant']>;

const VARIANT_ROLE: Readonly<Record<AlertVariant, React.AriaRole>> = {
    default: 'status',
    destructive: 'alert',
    success: 'status',
    warning: 'alert',
};

const Alert = React.forwardRef<HTMLDivElement, AlertProperties>(
    ({ className, role, variant, ...properties }, reference) => (
        <div
            className={cn(alertVariants({ variant }), className)}
            data-slot="alert"
            ref={reference}
            role={role ?? VARIANT_ROLE[variant ?? 'default']}
            {...properties}
        />
    ),
);
Alert.displayName = 'Alert';

const AlertTitle = React.forwardRef<HTMLHeadingElement, AlertTitleProperties>(
    ({ as: Tag = 'div', children, className, ...properties }, reference) => (
        <Tag
            className={cn(
                'mb-1 leading-none font-medium tracking-tight',
                className,
            )}
            data-slot="alert-title"
            ref={reference}
            {...properties}
        >
            {children}
        </Tag>
    ),
);
AlertTitle.displayName = 'AlertTitle';

const AlertDescription = React.forwardRef<
    HTMLParagraphElement,
    React.HTMLAttributes<HTMLParagraphElement>
>(({ className, ...properties }, reference) => (
    <div
        className={cn('text-sm [&_p]:leading-relaxed', className)}
        data-slot="alert-description"
        ref={reference}
        {...properties}
    />
));
AlertDescription.displayName = 'AlertDescription';

export { Alert, AlertDescription, type AlertProperties, AlertTitle };
