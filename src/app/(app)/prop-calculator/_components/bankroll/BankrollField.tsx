'use client';

import { type ComponentProps, type ReactNode, useState } from 'react';

import { LabelWithInfo } from '~/components/LabelWithInfo';
import { Field } from '~/components/ui/field';
import { Input } from '~/components/ui/input';

export enum BankrollFieldKind {
    Decimal = 'decimal',
    Integer = 'integer',
    List = 'list',
}

const KIND_INPUT_PROPS: Readonly<
    Record<BankrollFieldKind, ComponentProps<typeof Input>>
> = {
    [BankrollFieldKind.Decimal]: {
        inputMode: 'decimal',
        step: 'any',
        type: 'number',
    },
    [BankrollFieldKind.Integer]: {
        inputMode: 'numeric',
        step: 1,
        type: 'number',
    },
    [BankrollFieldKind.List]: { autoComplete: 'off', type: 'text' },
};

interface BankrollFieldProperties {
    readonly children?: ReactNode;
    readonly describedBy?: string;
    readonly id: string;
    readonly info: ReactNode;
    readonly initial?: null | number;
    readonly isInvalid?: boolean;
    readonly kind?: BankrollFieldKind;
    readonly label: string;
    readonly onChange: (raw: string) => void;
    readonly placeholder?: string;
}

export function BankrollField({
    children,
    describedBy,
    id,
    info,
    initial = null,
    isInvalid = false,
    kind = BankrollFieldKind.Decimal,
    label,
    onChange,
    placeholder = 'Not set',
}: BankrollFieldProperties) {
    const [text, setText] = useState(() =>
        initial === null ? '' : String(initial),
    );
    return (
        <Field data-invalid={isInvalid}>
            <LabelWithInfo htmlFor={id} info={info} label={label} />
            <Input
                {...KIND_INPUT_PROPS[kind]}
                aria-describedby={describedBy}
                aria-invalid={isInvalid || undefined}
                id={id}
                onChange={(event) => {
                    setText(event.target.value);
                    onChange(event.target.value);
                }}
                placeholder={placeholder}
                value={text}
            />
            {children}
        </Field>
    );
}
