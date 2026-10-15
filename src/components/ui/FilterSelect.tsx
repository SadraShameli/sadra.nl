'use client';

import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '~/components/ui/Select';

const ALL_VALUE = '__all__';

export type FilterSelectOption = {
    count?: number;
    label: React.ReactNode;
    value: string;
};

export type FilterSelectProperties = {
    label?: string;
    onValueChange: (value: string | undefined) => void;
    options: readonly FilterSelectOption[];
    placeholder: string;
    value: string | undefined;
};

export function FilterSelect({
    label,
    onValueChange,
    options,
    placeholder,
    value,
}: FilterSelectProperties) {
    return (
        <Select
            onValueChange={(next) =>
                onValueChange(next === ALL_VALUE ? undefined : next)
            }
            value={value ?? ALL_VALUE}
        >
            <SelectTrigger
                aria-label={label ?? placeholder}
                className="h-8 w-full shrink-0 text-xs md:w-auto md:max-w-64 md:min-w-40"
            >
                <SelectValue />
            </SelectTrigger>
            <SelectContent>
                <SelectItem value={ALL_VALUE}>{placeholder}</SelectItem>
                {options.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                        {option.label}
                        {option.count === undefined
                            ? null
                            : ` (${String(option.count)})`}
                    </SelectItem>
                ))}
            </SelectContent>
        </Select>
    );
}
