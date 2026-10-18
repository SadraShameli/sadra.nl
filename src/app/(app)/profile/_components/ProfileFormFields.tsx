'use client';

import { useId } from 'react';
import {
    type Control,
    Controller,
    type FieldPath,
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

export const ProfileNumberStep = {
    Any: 'any',
    Integer: '1',
} as const;

export type ProfileNumberStep =
    (typeof ProfileNumberStep)[keyof typeof ProfileNumberStep];

const INPUT_MODE: Record<ProfileNumberStep, 'decimal' | 'numeric'> = {
    [ProfileNumberStep.Any]: 'decimal',
    [ProfileNumberStep.Integer]: 'numeric',
};

export type ProfileSelectOption = { id: number; label: string };

export function ProfileIdSelectField<TFieldValues extends FieldValues>({
    control,
    label,
    name,
    options,
    placeholder,
}: {
    control: Control<TFieldValues>;
    label: string;
    name: FieldPath<TFieldValues>;
    options: readonly ProfileSelectOption[];
    placeholder: string;
}) {
    const formId = useId();
    return (
        <Controller
            control={control}
            name={name}
            render={({ field, fieldState }) => (
                <Field data-invalid={fieldState.invalid}>
                    <FieldLabel htmlFor={`${formId}-${field.name}`}>
                        {label}
                    </FieldLabel>
                    <Select
                        onValueChange={(value) => field.onChange(Number(value))}
                        value={field.value ? String(field.value) : ''}
                    >
                        <SelectTrigger
                            aria-invalid={fieldState.invalid}
                            id={`${formId}-${field.name}`}
                        >
                            <SelectValue placeholder={placeholder} />
                        </SelectTrigger>
                        <SelectContent>
                            {options.map((option) => (
                                <SelectItem
                                    key={option.id}
                                    value={String(option.id)}
                                >
                                    {option.label}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                    <FieldError errors={[fieldState.error]} />
                </Field>
            )}
        />
    );
}

export function ProfileNumberField<TFieldValues extends FieldValues>({
    control,
    label,
    name,
    step = ProfileNumberStep.Integer,
}: {
    control: Control<TFieldValues>;
    label: string;
    name: FieldPath<TFieldValues>;
    step?: ProfileNumberStep;
}) {
    const formId = useId();
    return (
        <Controller
            control={control}
            name={name}
            render={({ field, fieldState }) => (
                <Field data-invalid={fieldState.invalid}>
                    <FieldLabel htmlFor={`${formId}-${field.name}`}>
                        {label}
                    </FieldLabel>
                    <Input
                        aria-invalid={fieldState.invalid}
                        id={`${formId}-${field.name}`}
                        inputMode={INPUT_MODE[step]}
                        onChange={(event) => {
                            const parsed = Number(event.target.value);
                            field.onChange(
                                Number.isFinite(parsed) ? parsed : 0,
                            );
                        }}
                        ref={field.ref}
                        step={step}
                        type="number"
                        value={Number(field.value)}
                    />
                    <FieldError errors={[fieldState.error]} />
                </Field>
            )}
        />
    );
}

export function ProfileTextField<TFieldValues extends FieldValues>({
    control,
    label,
    name,
    placeholder,
}: {
    control: Control<TFieldValues>;
    label: string;
    name: FieldPath<TFieldValues>;
    placeholder?: string;
}) {
    const formId = useId();
    return (
        <Controller
            control={control}
            name={name}
            render={({ field, fieldState }) => (
                <Field data-invalid={fieldState.invalid}>
                    <FieldLabel htmlFor={`${formId}-${field.name}`}>
                        {label}
                    </FieldLabel>
                    <Input
                        aria-invalid={fieldState.invalid}
                        autoComplete="off"
                        id={`${formId}-${field.name}`}
                        name={field.name}
                        onBlur={field.onBlur}
                        onChange={field.onChange}
                        placeholder={placeholder}
                        ref={field.ref}
                        value={field.value ?? ''}
                    />
                    <FieldError errors={[fieldState.error]} />
                </Field>
            )}
        />
    );
}
