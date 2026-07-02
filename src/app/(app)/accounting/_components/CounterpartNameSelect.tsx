'use client';

import { useMemo } from 'react';

import { Label } from '~/components/ui/Label';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '~/components/ui/Select';
import { api } from '~/trpc/react';

import { useActiveCredentials } from './useActiveCredentials';

const SENTINEL_NONE = '__none__';

export function CounterpartNameSelect({
    label,
    onChange,
    value,
}: {
    label: string;
    onChange: (value?: string) => void;
    value: unknown;
}) {
    const { accounting } = useActiveCredentials();
    const credentialId = accounting?.id ?? '';
    const rulesQ = api.accounting.rules.list.useQuery(
        { credentialId },
        { enabled: !!credentialId },
    );
    const names = useMemo(
        () =>
            [...new Set((rulesQ.data ?? []).map((r) => r.display))].toSorted(
                (a, b) => a.localeCompare(b),
            ),
        [rulesQ.data],
    );
    const stringValue = typeof value === 'string' ? value : '';

    return (
        <div className="flex flex-col gap-2">
            <Label>{label}</Label>
            <Select
                onValueChange={(v) =>
                    onChange(v === SENTINEL_NONE ? undefined : v)
                }
                value={stringValue === '' ? SENTINEL_NONE : stringValue}
            >
                <SelectTrigger>
                    <SelectValue placeholder="Pick an existing counterpart" />
                </SelectTrigger>
                <SelectContent>
                    <SelectItem value={SENTINEL_NONE}>
                        Pick an existing counterpart
                    </SelectItem>
                    {names.map((name) => (
                        <SelectItem key={name} value={name}>
                            {name}
                        </SelectItem>
                    ))}
                </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
                Sourced from your booking rules' counterpart names, so a payout
                lands on the same counterpart as its purchase.
            </p>
        </div>
    );
}
