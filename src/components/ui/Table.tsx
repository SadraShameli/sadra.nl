import * as React from 'react';

import { cn } from '~/lib/utilities';

function Table({ className, ...properties }: React.ComponentProps<'table'>) {
    return (
        <div className="relative w-full overflow-auto">
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

function TableCell({ className, ...properties }: React.ComponentProps<'td'>) {
    return (
        <td
            className={cn(
                'px-3 py-2 align-middle has-[[role=checkbox]]:pr-0',
                className,
            )}
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
                'border-t border-border/60 bg-muted/40 font-medium [&>tr]:last:border-b-0',
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
                'h-9 px-3 text-left align-middle text-xs font-medium text-muted-foreground has-[[role=checkbox]]:pr-0',
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
            className={cn('[&_tr]:border-b [&_tr]:border-border/60', className)}
            data-slot="table-header"
            {...properties}
        />
    );
}

function TableRow({ className, ...properties }: React.ComponentProps<'tr'>) {
    return (
        <tr
            className={cn(
                'border-b border-border/60 transition-colors hover:bg-white/2 data-[state=selected]:bg-white/5',
                className,
            )}
            data-slot="table-row"
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
};
