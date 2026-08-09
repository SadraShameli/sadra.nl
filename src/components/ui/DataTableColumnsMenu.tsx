'use client';

import { type RowData } from '@tanstack/react-table';
import { SlidersHorizontal } from 'lucide-react';

import { Button } from '~/components/ui/Button';
import { type DataTableInstance } from '~/components/ui/DataTable.features';
import {
    DropdownMenu,
    DropdownMenuCheckboxItem,
    DropdownMenuContent,
    DropdownMenuLabel,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from '~/components/ui/DropDown';

export type DataTableColumnsMenuProperties<TData extends RowData> = {
    table: DataTableInstance<TData>;
};

export function DataTableColumnsMenu<TData extends RowData>({
    table,
}: DataTableColumnsMenuProperties<TData>) {
    const columns = table
        .getAllLeafColumns()
        .filter((column) => column.getCanHide());

    return (
        <DropdownMenu>
            <DropdownMenuTrigger asChild>
                <Button
                    className="h-8 shrink-0 gap-1.5 text-xs"
                    size="sm"
                    variant="outline"
                >
                    <SlidersHorizontal className="size-3.5" />
                    Columns
                </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
                <DropdownMenuLabel>Toggle columns</DropdownMenuLabel>
                <DropdownMenuSeparator />
                {columns.map((column) => (
                    <DropdownMenuCheckboxItem
                        checked={column.getIsVisible()}
                        key={column.id}
                        onCheckedChange={(checked) =>
                            column.toggleVisibility(checked)
                        }
                        onSelect={(event) => event.preventDefault()}
                    >
                        {typeof column.columnDef.meta?.label === 'string'
                            ? column.columnDef.meta.label
                            : column.id}
                    </DropdownMenuCheckboxItem>
                ))}
            </DropdownMenuContent>
        </DropdownMenu>
    );
}
