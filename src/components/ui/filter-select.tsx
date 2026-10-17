'use client';

import { ToolbarSelect } from '~/components/ui/toolbar-select';

const ALL_VALUE = '__all__';

export type FilterSelectOption = {
    count?: number;
    label: React.ReactNode;
    value: string;
};

export type FilterSelectProperties = {
    disabled?: boolean;
    id?: string;
    label?: string;
    onValueChange: (value: string | undefined) => void;
    options: readonly FilterSelectOption[];
    placeholder: string;
    value: string | undefined;
};

export function FilterSelect({
    disabled,
    id,
    label,
    onValueChange,
    options,
    placeholder,
    value,
}: FilterSelectProperties) {
    return (
        <ToolbarSelect
            disabled={disabled}
            id={id}
            label={label ?? placeholder}
            onValueChange={(next) =>
                onValueChange(next === ALL_VALUE ? undefined : next)
            }
            options={[
                { label: placeholder, value: ALL_VALUE },
                ...options.map((option) => ({
                    label:
                        option.count === undefined ? (
                            option.label
                        ) : (
                            <>
                                {option.label} ({String(option.count)})
                            </>
                        ),
                    value: option.value,
                })),
            ]}
            value={value ?? ALL_VALUE}
        />
    );
}
