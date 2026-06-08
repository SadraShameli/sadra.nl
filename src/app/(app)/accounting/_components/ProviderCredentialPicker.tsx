'use client';

import { useEffect, useId } from 'react';

import type { CredentialRole } from '~/lib/accounting/credentials/index';

import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '~/components/ui/Select';
import { getCredentialDescriptor } from '~/lib/accounting/credentials/index';
import { api } from '~/trpc/react';

interface Props {
    allowEmpty?: boolean;
    credentialRole: CredentialRole;
    inline?: boolean;
    onChange: (id: string) => void;
    value: string;
}

const SENTINEL_NONE = '__none__';

const ROLE_LABEL: Record<CredentialRole, string> = {
    accounting: 'Accounting credential',
    transactions: 'Transactions credential',
};

export function ProviderCredentialPicker({
    allowEmpty,
    credentialRole,
    inline,
    onChange,
    value,
}: Props) {
    const id = useId();
    const credentialsQ = api.accounting.credentials.list.useQuery();
    const filtered = (credentialsQ.data ?? []).filter(
        (c) => getCredentialDescriptor(c.kind)?.role === credentialRole,
    );

    useEffect(() => {
        if (!value) {
            const first = filtered[0];
            if (first) onChange(first.id);
        }
    }, [filtered, onChange, value]);

    const showEmptyOption = allowEmpty === true || filtered.length === 0;
    const emptyLabel =
        filtered.length === 0 ? 'No credentials configured' : '—';

    const select = (
        <Select
            disabled={filtered.length === 0}
            onValueChange={(v) => onChange(v === SENTINEL_NONE ? '' : v)}
            value={value === '' ? SENTINEL_NONE : value}
        >
            <SelectTrigger
                className={inline ? 'h-8 w-56 text-xs' : 'w-72'}
                id={id}
            >
                <SelectValue />
            </SelectTrigger>
            <SelectContent>
                {showEmptyOption && (
                    <SelectItem value={SENTINEL_NONE}>{emptyLabel}</SelectItem>
                )}
                {filtered.map((c) => {
                    const d = getCredentialDescriptor(c.kind);
                    return (
                        <SelectItem key={c.id} value={c.id}>
                            {d ? `${d.label} · ${c.label}` : c.label}
                        </SelectItem>
                    );
                })}
            </SelectContent>
        </Select>
    );

    if (inline) return select;

    return (
        <div className="flex flex-col gap-1">
            <label
                className="text-xs tracking-wider text-muted-foreground uppercase"
                htmlFor={id}
            >
                {ROLE_LABEL[credentialRole]}
            </label>
            {select}
        </div>
    );
}
