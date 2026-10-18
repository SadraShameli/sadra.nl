import * as React from 'react';

import { cn } from '~/lib/utilities';

type TableContainerProperties = Pick<
    React.ComponentProps<'div'>,
    'aria-label' | 'aria-labelledby' | 'role' | 'tabIndex'
>;

function Table({
    className,
    containerProps,
    ...properties
}: React.ComponentProps<'table'> & {
    readonly containerProps?: TableContainerProperties;
}) {
    return (
        <div className="relative w-full overflow-auto" {...containerProps}>
            <table
                className={cn('w-full caption-bottom text-sm', className)}
                data-slot="table"
                {...properties}
            />
        </div>
    );
}

function TableBody({
    className,
    ...properties
}: React.ComponentProps<'tbody'>) {
    return (
        <tbody
            className={cn('[&_tr:last-child]:border-0', className)}
            data-slot="table-body"
            {...properties}
        />
    );
}

function TableCaption({
    className,
    ...properties
}: React.ComponentProps<'caption'>) {
    return (
        <caption
            className={cn('mt-4 text-sm text-muted-foreground', className)}
            data-slot="table-caption"
            {...properties}
        />
    );
}

const TABLE_CELL_CLASS = 'px-3 py-2.5 align-middle has-[[role=checkbox]]:pr-0';

function TableCell({ className, ...properties }: React.ComponentProps<'td'>) {
    return (
        <td
            className={cn(TABLE_CELL_CLASS, className)}
            data-slot="table-cell"
            {...properties}
        />
    );
}

function TableFooter({
    className,
    ...properties
}: React.ComponentProps<'tfoot'>) {
    return (
        <tfoot
            className={cn(
                'border-t border-line bg-surface-sunken font-medium [&>tr]:last:border-b-0',
                className,
            )}
            data-slot="table-footer"
            {...properties}
        />
    );
}

function TableHead({ className, ...properties }: React.ComponentProps<'th'>) {
    return (
        <th
            className={cn(
                'h-10 px-3 text-left align-middle type-micro text-ink-muted has-[[role=checkbox]]:pr-0',
                className,
            )}
            data-slot="table-head"
            {...properties}
        />
    );
}

function TableHeader({
    className,
    ...properties
}: React.ComponentProps<'thead'>) {
    return (
        <thead
            className={cn(
                '[&_tr]:border-b [&_tr]:border-line [&_tr]:hover:bg-transparent',
                className,
            )}
            data-slot="table-header"
            {...properties}
        />
    );
}

function TableRow({ className, ...properties }: React.ComponentProps<'tr'>) {
    return (
        <tr
            className={cn(
                'border-b border-line-faint transition-colors hover:bg-surface data-[state=selected]:bg-surface-high',
                className,
            )}
            data-slot="table-row"
            {...properties}
        />
    );
}

function TableRowHeader({
    className,
    ...properties
}: Omit<React.ComponentProps<'th'>, 'scope'>) {
    return (
        <th
            className={cn(TABLE_CELL_CLASS, 'text-left font-normal', className)}
            data-slot="table-row-header"
            scope="row"
            {...properties}
        />
    );
}

export {
    Table,
    TableBody,
    TableCaption,
    TableCell,
    TableFooter,
    TableHead,
    TableHeader,
    TableRow,
    TableRowHeader,
};
