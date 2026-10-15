'use client';

import { useState } from 'react';

import { Field, FieldLabel } from '~/components/ui/Field';
import { Input } from '~/components/ui/Input';

interface BankrollNumberFieldProperties {
    describedBy?: string;
    id: string;
    initial: null | number;
    label: string;
    onChange: (raw: string) => void;
    placeholder?: string;
}

export function BankrollNumberField({
    describedBy,
    id,
    initial,
    label,
    onChange,
    placeholder = 'Not set',
}: BankrollNumberFieldProperties) {
    const [text, setText] = useState(() =>
        initial === null ? '' : String(initial),
    );
    return (
        <Field>
            <FieldLabel htmlFor={id}>{label}</FieldLabel>
            <Input
                aria-describedby={describedBy}
                id={id}
                inputMode="decimal"
                onChange={(event) => {
                    setText(event.target.value);
                    onChange(event.target.value);
                }}
                placeholder={placeholder}
                type="number"
                value={text}
            />
        </Field>
    );
}
