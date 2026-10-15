'use client';

import { useState } from 'react';

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
        <div className="flex flex-col gap-1">
            <label
                className="text-xs font-medium text-muted-foreground"
                htmlFor={id}
            >
                {label}
            </label>
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
        </div>
    );
}
