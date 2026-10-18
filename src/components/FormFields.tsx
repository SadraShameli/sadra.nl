'use client';

import { type ReactNode, useId } from 'react';
import {
    type Control,
    Controller,
    type ControllerRenderProps,
    type FieldPath,
    type FieldPathByValue,
    type FieldPathValue,
    type FieldValues,
} from 'react-hook-form';

import { Field, FieldError, FieldLabel } from '~/components/ui/field';
import { Input } from '~/components/ui/input';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '~/components/ui/select';

export interface FormSelectOption<TValue> {
    readonly label: string;
    readonly value: TValue;
}

interface FormFieldControl<
    TFieldValues extends FieldValues,
    TName extends FieldPath<TFieldValues>,
> {
    readonly field: ControllerRenderProps<TFieldValues, TName>;
    readonly id: string;
    readonly isInvalid: boolean;
}

const DISPLAY_SIGNIFICANT_DIGITS = 12;

export function FormControlField<
    TFieldValues extends FieldValues,
    TName extends FieldPath<TFieldValues>,
    TTransformedValues,
>({
    children,
    control,
    isDisabled = false,
    label,
    name,
}: {
    children: (control: FormFieldControl<TFieldValues, TName>) => ReactNode;
    control: Control<TFieldValues, unknown, TTransformedValues>;
    isDisabled?: boolean;
    label: string;
    name: TName;
}) {
    const id = useId();
    return (
        <Controller
            control={control}
            name={name}
            render={({ field, fieldState }) => (
                <Field
                    data-disabled={isDisabled}
                    data-invalid={fieldState.invalid}
                >
                    <FieldLabel htmlFor={id}>{label}</FieldLabel>
                    {children({ field, id, isInvalid: fieldState.invalid })}
                    <FieldError errors={[fieldState.error]} />
                </Field>
            )}
        />
    );
}

export function FormNumberField<
    TFieldValues extends FieldValues,
    TTransformedValues,
>({
    control,
    isDisabled = false,
    isInteger = false,
    label,
    max,
    min,
    name,
    onValueChange,
    scale = 1,
}: {
    control: Control<TFieldValues, unknown, TTransformedValues>;
    isDisabled?: boolean;
    isInteger?: boolean;
    label: string;
    max?: number;
    min?: number;
    name: FieldPathByValue<TFieldValues, null | number | undefined>;
    onValueChange?: (value: number) => void;
    scale?: number;
}) {
    return (
        <FormControlField
            control={control}
            isDisabled={isDisabled}
            label={label}
            name={name}
        >
            {({ field, id, isInvalid }) => (
                <Input
                    aria-invalid={isInvalid}
                    disabled={isDisabled}
                    id={id}
                    inputMode={isInteger ? 'numeric' : 'decimal'}
                    max={max}
                    min={min}
                    name={field.name}
                    onBlur={field.onBlur}
                    onChange={(event) => {
                        const value =
                            event.target.value === ''
                                ? NaN
                                : Number(event.target.value) / scale;
                        field.onChange(value);
                        onValueChange?.(value);
                    }}
                    ref={field.ref}
                    step={isInteger ? 1 : 'any'}
                    type="number"
                    value={displayedNumber(field.value, scale)}
                />
            )}
        </FormControlField>
    );
}

export function FormSelectField<
    TFieldValues extends FieldValues,
    TName extends FieldPath<TFieldValues>,
    TTransformedValues,
>({
    control,
    isDisabled = false,
    keyOf,
    label,
    name,
    onValueChange,
    options,
    placeholder,
}: {
    control: Control<TFieldValues, unknown, TTransformedValues>;
    isDisabled?: boolean;
    keyOf: (value: FieldPathValue<TFieldValues, TName>) => string;
    label: string;
    name: TName;
    onValueChange?: (value: FieldPathValue<TFieldValues, TName>) => void;
    options: readonly FormSelectOption<FieldPathValue<TFieldValues, TName>>[];
    placeholder?: string;
}) {
    return (
        <FormControlField
            control={control}
            isDisabled={isDisabled}
            label={label}
            name={name}
        >
            {({ field, id, isInvalid }) => (
                <Select
                    disabled={isDisabled}
                    onValueChange={(key) => {
                        const option = options.find(
                            (candidate) => keyOf(candidate.value) === key,
                        );
                        if (option === undefined) return;
                        field.onChange(option.value);
                        onValueChange?.(option.value);
                    }}
                    value={keyOf(field.value)}
                >
                    <SelectTrigger
                        aria-invalid={isInvalid}
                        id={id}
                        onBlur={field.onBlur}
                        ref={field.ref}
                    >
                        <SelectValue placeholder={placeholder} />
                    </SelectTrigger>
                    <SelectContent>
                        {options.map((option) => (
                            <SelectItem
                                key={keyOf(option.value)}
                                value={keyOf(option.value)}
                            >
                                {option.label}
                            </SelectItem>
                        ))}
                    </SelectContent>
                </Select>
            )}
        </FormControlField>
    );
}

export function FormTextField<
    TFieldValues extends FieldValues,
    TTransformedValues,
>({
    control,
    label,
    name,
    placeholder,
}: {
    control: Control<TFieldValues, unknown, TTransformedValues>;
    label: string;
    name: FieldPathByValue<TFieldValues, string>;
    placeholder?: string;
}) {
    return (
        <FormControlField control={control} label={label} name={name}>
            {({ field, id, isInvalid }) => (
                <Input
                    aria-invalid={isInvalid}
                    autoComplete="off"
                    id={id}
                    name={field.name}
                    onBlur={field.onBlur}
                    onChange={field.onChange}
                    placeholder={placeholder}
                    ref={field.ref}
                    type="text"
                    value={String(field.value)}
                />
            )}
        </FormControlField>
    );
}

function displayedNumber(value: unknown, scale: number): number | string {
    return typeof value === 'number' && Number.isFinite(value)
        ? Number((value * scale).toPrecision(DISPLAY_SIGNIFICANT_DIGITS))
        : '';
}
