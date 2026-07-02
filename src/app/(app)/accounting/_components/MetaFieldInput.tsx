'use client';

import { useId } from 'react';

import type { CredentialMetaField } from '~/lib/accounting/credentials/index';

import { Card, CardContent } from '~/components/ui/Card';
import { Input } from '~/components/ui/Input';
import { Label } from '~/components/ui/Label';
import { Switch } from '~/components/ui/Switch';

import { CounterpartNameSelect } from './CounterpartNameSelect';
import { SelectFieldInput } from './SelectFieldInput';

interface Properties {
    credentialId?: string;
    credentialKind: string;
    field: CredentialMetaField;
    meta: Record<string, unknown>;
    onChange: (value?: boolean | number | string) => void;
    secret: string;
    value: unknown;
}

export function MetaFieldInput({
    credentialId,
    credentialKind,
    field,
    meta,
    onChange,
    secret,
    value,
}: Properties) {
    const fieldId = useId();

    if (credentialKind === 'plane' && field.key === 'counterpartName') {
        return (
            <CounterpartNameSelect
                label={field.label}
                onChange={onChange}
                value={value}
            />
        );
    }

    if (field.type === 'select') {
        return (
            <SelectFieldInput
                credentialId={credentialId}
                credentialKind={credentialKind}
                field={field}
                meta={meta}
                onChange={onChange}
                secret={secret}
                value={value}
            />
        );
    }

    if (field.type === 'boolean') {
        const isChecked = typeof value === 'boolean' ? value : false;
        return (
            <Card className="py-3">
                <CardContent className="flex items-start justify-between gap-3 px-3">
                    <div>
                        <Label className="text-sm" htmlFor={fieldId}>
                            {field.label}
                        </Label>
                        {field.description && (
                            <p className="mt-0.5 text-xs text-muted-foreground">
                                {field.description}
                            </p>
                        )}
                    </div>
                    <Switch
                        checked={isChecked}
                        id={fieldId}
                        onCheckedChange={onChange}
                    />
                </CardContent>
            </Card>
        );
    }

    const stringValue =
        typeof value === 'string' || typeof value === 'number'
            ? String(value)
            : '';

    return (
        <div className="flex flex-col gap-2">
            <Label htmlFor={fieldId}>{field.label}</Label>
            <Input
                id={fieldId}
                onChange={(e) => {
                    const raw = e.target.value;
                    if (raw === '') {
                        onChange();
                        return;
                    }
                    if (field.type === 'number') {
                        const parsed = Number(raw);
                        if (Number.isFinite(parsed)) onChange(parsed);
                        else onChange();
                        return;
                    }
                    onChange(raw);
                }}
                placeholder={field.placeholder}
                required={field.required}
                type={field.type === 'number' ? 'number' : 'text'}
                value={stringValue}
            />
            {field.description && (
                <p className="text-xs text-muted-foreground">
                    {field.description}
                </p>
            )}
        </div>
    );
}
