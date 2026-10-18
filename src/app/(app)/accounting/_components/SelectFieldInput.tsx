'use client';

import { RefreshCw } from 'lucide-react';
import { useEffect, useId, useState } from 'react';

import type { CredentialMetaField } from '~/lib/accounting/credentials/index';

import { Button } from '~/components/ui/button';
import { FieldError } from '~/components/ui/field';
import { Label } from '~/components/ui/label';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '~/components/ui/select';
import { Spinner } from '~/components/ui/spinner';
import { api } from '~/trpc/react';

interface FieldOption {
    description?: string;
    label: string;
    value: string;
}

interface Properties {
    credentialId?: string;
    credentialKind: string;
    field: CredentialMetaField;
    meta: Record<string, unknown>;
    onChange: (value?: string) => void;
    secret: string;
    value: unknown;
}

const EMPTY = '';
const SENTINEL_NONE = '__none__';

export function SelectFieldInput({
    credentialId,
    credentialKind,
    field,
    meta,
    onChange,
    secret,
    value,
}: Properties) {
    const fieldId = useId();
    const [options, setOptions] = useState<FieldOption[]>([]);
    const loadMut = api.accounting.fieldOptions.load.useMutation();
    const loadForCredentialMut =
        api.accounting.fieldOptions.loadForCredential.useMutation();

    const stringValue =
        typeof value === 'string' || typeof value === 'number'
            ? String(value)
            : EMPTY;

    useEffect(() => {
        setOptions([]);
    }, [credentialId, credentialKind, secret]);

    const isUsingStoredSecret =
        secret.length === 0 && credentialId !== undefined;
    const isPending = loadMut.isPending || loadForCredentialMut.isPending;
    const lastError = loadMut.error ?? loadForCredentialMut.error;

    const load = async () => {
        try {
            const result = isUsingStoredSecret
                ? await loadForCredentialMut.mutateAsync({
                      credentialId: credentialId,
                      fieldKey: field.key,
                      metaOverride: meta,
                  })
                : await loadMut.mutateAsync({
                      fieldKey: field.key,
                      kind: credentialKind,
                      meta,
                      secret,
                  });
            setOptions(result.options);
        } catch {}
    };

    const canLoad = (secret.length > 0 || isUsingStoredSecret) && !isPending;
    const hasOptions = options.length > 0;
    const isShowSavedAsOption =
        !hasOptions && stringValue !== EMPTY && stringValue.length > 0;

    const placeholderLabel = hasOptions
        ? 'Pick one'
        : isShowSavedAsOption
          ? 'Clear selection'
          : 'Load options first';
    const choices: readonly FieldOption[] = [
        { label: placeholderLabel, value: SENTINEL_NONE },
        ...(isShowSavedAsOption
            ? [{ label: `current: ${stringValue}`, value: stringValue }]
            : []),
        ...options,
    ];
    const selectedValue = stringValue === EMPTY ? SENTINEL_NONE : stringValue;

    return (
        <div className="flex flex-col gap-2">
            <Label htmlFor={fieldId}>{field.label}</Label>
            <div className="flex items-center gap-2">
                <Select
                    disabled={!hasOptions && !isShowSavedAsOption}
                    onValueChange={(v) =>
                        onChange(v === SENTINEL_NONE ? undefined : v)
                    }
                    value={selectedValue}
                >
                    <SelectTrigger className="flex-1" id={fieldId}>
                        <SelectValue placeholder={placeholderLabel}>
                            {
                                choices.find((o) => o.value === selectedValue)
                                    ?.label
                            }
                        </SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                        {choices.map((o) => (
                            <SelectItem key={o.value} value={o.value}>
                                {o.label}
                            </SelectItem>
                        ))}
                    </SelectContent>
                </Select>
                <Button
                    disabled={!canLoad}
                    onClick={(event) => {
                        event.preventDefault();
                        void load();
                    }}
                    size="sm"
                    type="button"
                    variant="outline"
                >
                    {isPending ? (
                        <Spinner className="size-3" />
                    ) : (
                        <RefreshCw className="size-3" />
                    )}
                    {hasOptions ? 'Refresh' : 'Load'}
                </Button>
            </div>

            <FieldError errors={[lastError ?? undefined]} />
        </div>
    );
}
