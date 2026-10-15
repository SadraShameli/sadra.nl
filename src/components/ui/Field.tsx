'use client';

import { cva, type VariantProps } from 'class-variance-authority';
import * as React from 'react';

import { Label } from '~/components/ui/Label';
import { cn } from '~/lib/utilities';

const fieldVariants = cva(
    'group/field flex w-full gap-3 data-[invalid=true]:text-destructive',
    {
        defaultVariants: {
            orientation: 'vertical',
        },
        variants: {
            orientation: {
                horizontal: [
                    'flex-row items-center',
                    '*:data-[slot=field-label]:flex-auto',
                    'has-[>[data-slot=field-content]]:items-start has-[>[data-slot=field-content]]:[&>[role=checkbox],[role=radio]]:mt-px',
                ],
                responsive: [
                    'flex-col @md/field-group:flex-row @md/field-group:items-center *:w-full @md/field-group:*:w-auto [&>.sr-only]:w-auto',
                    '@md/field-group:*:data-[slot=field-label]:flex-auto',
                    '@md/field-group:has-[>[data-slot=field-content]]:items-start @md/field-group:has-[>[data-slot=field-content]]:[&>[role=checkbox],[role=radio]]:mt-px',
                ],
                vertical: ['flex-col *:w-full [&>.sr-only]:w-auto'],
            },
        },
    },
);

function Field({
    className,
    orientation = 'vertical',
    ...properties
}: React.ComponentProps<'div'> & VariantProps<typeof fieldVariants>) {
    return (
        <div
            className={cn(fieldVariants({ orientation }), className)}
            data-orientation={orientation}
            data-slot="field"
            role="group"
            {...properties}
        />
    );
}

function FieldContent({
    className,
    ...properties
}: React.ComponentProps<'div'>) {
    return (
        <div
            className={cn(
                'group/field-content flex flex-1 flex-col gap-1.5 leading-snug',
                className,
            )}
            data-slot="field-content"
            {...properties}
        />
    );
}

function FieldDescription({
    className,
    ...properties
}: React.ComponentProps<'p'>) {
    return (
        <p
            className={cn(
                'text-sm/normal font-normal text-muted-foreground group-has-data-[orientation=horizontal]/field:text-balance',
                'last:mt-0 nth-last-2:-mt-1 [[data-variant=legend]+&]:-mt-1.5',
                '[&>a]:underline [&>a]:underline-offset-4 [&>a:hover]:text-primary',
                className,
            )}
            data-slot="field-description"
            {...properties}
        />
    );
}

function FieldError({ className, ...properties }: React.ComponentProps<'div'>) {
    return (
        <div
            className={cn('text-sm font-normal text-destructive', className)}
            data-slot="field-error"
            role="alert"
            {...properties}
        />
    );
}

function FieldGroup({ className, ...properties }: React.ComponentProps<'div'>) {
    return (
        <div
            className={cn(
                'group/field-group @container/field-group flex w-full flex-col gap-7 data-[slot=checkbox-group]:gap-3 *:data-[slot=field-group]:gap-4',
                className,
            )}
            data-slot="field-group"
            {...properties}
        />
    );
}

function FieldLabel({
    className,
    ...properties
}: React.ComponentProps<typeof Label>) {
    return (
        <Label
            className={cn(
                'group/field-label peer/field-label flex w-fit gap-2 leading-snug group-data-[disabled=true]/field:opacity-50',
                'has-[>[data-slot=field]]:w-full has-[>[data-slot=field]]:flex-col has-[>[data-slot=field]]:rounded-md has-[>[data-slot=field]]:border *:data-[slot=field]:p-4',
                'has-data-[state=checked]:border-primary has-data-[state=checked]:bg-primary/5 dark:has-data-[state=checked]:bg-primary/10',
                className,
            )}
            data-slot="field-label"
            {...properties}
        />
    );
}

function FieldLegend({
    className,
    variant = 'legend',
    ...properties
}: React.ComponentProps<'legend'> & { variant?: 'label' | 'legend' }) {
    return (
        <legend
            className={cn(
                'mb-3 font-medium',
                'data-[variant=legend]:text-base',
                'data-[variant=label]:text-sm',
                className,
            )}
            data-slot="field-legend"
            data-variant={variant}
            {...properties}
        />
    );
}

function FieldSet({
    className,
    ...properties
}: React.ComponentProps<'fieldset'>) {
    return (
        <fieldset
            className={cn(
                'flex flex-col gap-6',
                'has-[>[data-slot=checkbox-group]]:gap-3 has-[>[data-slot=radio-group]]:gap-3',
                className,
            )}
            data-slot="field-set"
            {...properties}
        />
    );
}

export {
    Field,
    FieldContent,
    FieldDescription,
    FieldError,
    FieldGroup,
    FieldLabel,
    FieldLegend,
    FieldSet,
};
