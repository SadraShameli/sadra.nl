'use client';

import {
    type Control,
    type FieldPath,
    type FieldValues,
} from 'react-hook-form';

import {
    FormControl,
    FormField,
    FormItem,
    FormLabel,
    FormMessage,
} from '~/components/ui/Form';
import { Input } from '~/components/ui/Input';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '~/components/ui/Select';

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
    return (
        <FormField
            control={control}
            name={name}
            render={({ field }) => (
                <FormItem>
                    <FormLabel>{label}</FormLabel>
                    <Select
                        onValueChange={(value) => field.onChange(Number(value))}
                        value={field.value ? String(field.value) : ''}
                    >
                        <FormControl>
                            <SelectTrigger>
                                <SelectValue placeholder={placeholder} />
                            </SelectTrigger>
                        </FormControl>
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
                    <FormMessage />
                </FormItem>
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
    return (
        <FormField
            control={control}
            name={name}
            render={({ field }) => (
                <FormItem>
                    <FormLabel>{label}</FormLabel>
                    <FormControl>
                        <Input
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
                    </FormControl>
                    <FormMessage />
                </FormItem>
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
    return (
        <FormField
            control={control}
            name={name}
            render={({ field }) => (
                <FormItem>
                    <FormLabel>{label}</FormLabel>
                    <FormControl>
                        <Input
                            autoComplete="off"
                            name={field.name}
                            onBlur={field.onBlur}
                            onChange={field.onChange}
                            placeholder={placeholder}
                            ref={field.ref}
                            value={field.value ?? ''}
                        />
                    </FormControl>
                    <FormMessage />
                </FormItem>
            )}
        />
    );
}
