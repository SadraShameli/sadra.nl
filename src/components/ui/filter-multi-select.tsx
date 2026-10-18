'use client';

import { ChevronDown } from 'lucide-react';

import { Button } from '~/components/ui/button';
import {
    DropdownMenu,
    DropdownMenuCheckboxItem,
    DropdownMenuContent,
    DropdownMenuTrigger,
} from '~/components/ui/dropdown-menu';
import { FILTER_CONTROL_CLASS } from '~/components/ui/filter-control';
import { cn } from '~/lib/utilities';

export interface FilterMultiSelectOption<T extends string> {
    readonly label: string;
    readonly value: T;
}

export function FilterMultiSelect<T extends string>({
    label,
    onChange,
    options,
    placeholder,
    selected,
}: {
    readonly label: string;
    readonly onChange: (selected: T[]) => void;
    readonly options: readonly FilterMultiSelectOption<T>[];
    readonly placeholder: string;
    readonly selected: readonly string[];
}) {
    const toggle = (value: T, isChecked: boolean) =>
        onChange(
            options
                .filter((option) =>
                    option.value === value
                        ? isChecked
                        : selected.includes(option.value),
                )
                .map((option) => option.value),
        );

    return (
        <DropdownMenu>
            <DropdownMenuTrigger asChild>
                <Button
                    aria-label={label}
                    className={cn(
                        FILTER_CONTROL_CLASS,
                        'w-auto shrink-0 gap-1.5 px-4 font-normal',
                    )}
                    type="button"
                    variant="outline"
                >
                    {summaryOf(label, placeholder, options, selected)}
                    <ChevronDown aria-hidden className="size-3.5 opacity-50" />
                </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start">
                {options.map((option) => (
                    <DropdownMenuCheckboxItem
                        checked={selected.includes(option.value)}
                        key={option.value}
                        onCheckedChange={(isChecked) =>
                            toggle(option.value, isChecked)
                        }
                        onSelect={(event) => event.preventDefault()}
                    >
                        {option.label}
                    </DropdownMenuCheckboxItem>
                ))}
            </DropdownMenuContent>
        </DropdownMenu>
    );
}

function summaryOf<T extends string>(
    label: string,
    placeholder: string,
    options: readonly FilterMultiSelectOption<T>[],
    selected: readonly string[],
): string {
    const chosen = options.filter((option) => selected.includes(option.value));
    const [first, ...rest] = chosen;
    if (first === undefined) return placeholder;
    return rest.length === 0
        ? first.label
        : `${label} (${String(chosen.length)})`;
}
