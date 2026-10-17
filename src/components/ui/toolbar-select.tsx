'use client';

import { FILTER_CONTROL_CLASS } from '~/components/ui/filter-control';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '~/components/ui/select';
import { cn } from '~/lib/utilities';

export type ToolbarSelectOption = {
    disabled?: boolean;
    label: React.ReactNode;
    value: string;
};

export type ToolbarSelectProperties = {
    disabled?: boolean;
    id?: string;
    label: string;
    onValueChange: (value: string) => void;
    options: readonly ToolbarSelectOption[];
    value: string;
};

export function ToolbarSelect({
    disabled,
    id,
    label,
    onValueChange,
    options,
    value,
}: ToolbarSelectProperties) {
    return (
        <Select disabled={disabled} onValueChange={onValueChange} value={value}>
            <SelectTrigger
                aria-label={label}
                className={cn(
                    FILTER_CONTROL_CLASS,
                    'w-full shrink-0 md:w-auto md:max-w-64 md:min-w-40',
                )}
                id={id}
            >
                <SelectValue />
            </SelectTrigger>
            <SelectContent>
                {options.map((option) => (
                    <SelectItem
                        disabled={option.disabled}
                        key={option.value}
                        value={option.value}
                    >
                        {option.label}
                    </SelectItem>
                ))}
            </SelectContent>
        </Select>
    );
}
