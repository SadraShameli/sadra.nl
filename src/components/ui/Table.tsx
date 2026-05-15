import * as React from 'react';

import { cn } from '~/lib/utils';

function Table({ className, ...props }: React.ComponentProps<'table'>) {
    return (
        <div className="relative w-full overflow-auto">
            <table
                className={cn('w-full caption-bottom text-sm', className)}
                data-slot="table"
                {...props}
            />
        </div>
    );
}

function TableBody({ className, ...props }: React.ComponentProps<'tbody'>) {
    return (
        <tbody
            className={cn('[&_tr:last-child]:border-0', className)}
            data-slot="table-body"
            {...props}
        />
    );
}

function TableCaption({
    className,
    ...props
}: React.ComponentProps<'caption'>) {
    return (
        <caption
            className={cn('mt-4 text-sm text-muted-foreground', className)}
            data-slot="table-caption"
            {...props}
        />
    );
}

function TableCell({ className, ...props }: React.ComponentProps<'td'>) {
    return (
        <td
            className={cn(
                'px-3 py-2 align-middle has-[[role=checkbox]]:pr-0',
                className,
            )}
            data-slot="table-cell"
            {...props}
        />
    );
}

function TableFooter({ className, ...props }: React.ComponentProps<'tfoot'>) {
    return (
        <tfoot
            className={cn(
                'border-t border-border/60 bg-muted/40 font-medium [&>tr]:last:border-b-0',
                className,
            )}
            data-slot="table-footer"
            {...props}
        />
    );
}

function TableHead({ className, ...props }: React.ComponentProps<'th'>) {
    return (
        <th
            className={cn(
                'h-9 px-3 text-left align-middle text-xs font-medium text-muted-foreground has-[[role=checkbox]]:pr-0',
                className,
            )}
            data-slot="table-head"
            {...props}
        />
    );
}

function TableHeader({ className, ...props }: React.ComponentProps<'thead'>) {
    return (
        <thead
            className={cn('[&_tr]:border-b [&_tr]:border-border/60', className)}
            data-slot="table-header"
            {...props}
        />
    );
}

function TableRow({ className, ...props }: React.ComponentProps<'tr'>) {
    return (
        <tr
            className={cn(
                'border-b border-border/60 transition-colors hover:bg-white/2 data-[state=selected]:bg-white/5',
                className,
            )}
            data-slot="table-row"
            {...props}
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
