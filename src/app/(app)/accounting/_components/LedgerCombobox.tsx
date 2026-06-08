'use client';

import { ChevronsUpDown } from 'lucide-react';
import { useState } from 'react';

import type { LedgerRef } from '~/lib/accounting/core/types';

import { Button } from '~/components/ui/Button';
import {
    Command,
    CommandEmpty,
    CommandGroup,
    CommandInput,
    CommandItem,
    CommandList,
} from '~/components/ui/Command';
import {
    Popover,
    PopoverContent,
    PopoverTrigger,
} from '~/components/ui/Popover';

export function LedgerCombobox({
    onChange,
    options,
    placeholder = 'Select ledger…',
    value,
}: {
    onChange: (ledger: LedgerRef) => void;
    options: LedgerRef[];
    placeholder?: string;
    value: LedgerRef | null;
}) {
    const [open, setOpen] = useState(false);
    return (
        <Popover onOpenChange={setOpen} open={open}>
            <PopoverTrigger asChild>
                <Button
                    className="h-8 w-48 justify-between text-xs font-normal"
                    disabled={options.length === 0}
                    type="button"
                    variant="outline"
                >
                    <span className="truncate">
                        {value ? value.label : placeholder}
                    </span>
                    <ChevronsUpDown className="size-3 opacity-50" />
                </Button>
            </PopoverTrigger>
            <PopoverContent align="start" className="w-72 p-0">
                <Command>
                    <CommandInput placeholder="Search ledgers…" />
                    <CommandList>
                        <CommandEmpty>No ledger found.</CommandEmpty>
                        <CommandGroup>
                            {options.map((opt) => (
                                <CommandItem
                                    key={opt.id}
                                    onSelect={() => {
                                        onChange(opt);
                                        setOpen(false);
                                    }}
                                    value={opt.label}
                                >
                                    {opt.label}
                                </CommandItem>
                            ))}
                        </CommandGroup>
                    </CommandList>
                </Command>
            </PopoverContent>
        </Popover>
    );
}
