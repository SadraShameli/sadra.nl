'use client';

import { useMemo } from 'react';

import { LabelWithInfo } from '~/components/LabelWithInfo';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '~/components/ui/select';
import { api } from '~/trpc/react';

import { useActiveCredentials } from './useActiveCredentials';

const SENTINEL_NONE = '__none__';
const NONE_LABEL = 'Pick an existing counterpart';

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
    const choices = useMemo(
        () =>
            stringValue === '' || names.includes(stringValue)
                ? names
                : [stringValue, ...names],
        [names, stringValue],
    );
    const selectedValue = stringValue === '' ? SENTINEL_NONE : stringValue;

    return (
        <div className="flex flex-col gap-2">
            <LabelWithInfo
                info="Sourced from your booking rules' counterpart names, so a payout lands on the same counterpart as its purchase."
                label={label}
            />
            <Select
                onValueChange={(v) =>
                    onChange(v === SENTINEL_NONE ? undefined : v)
                }
                value={selectedValue}
            >
                <SelectTrigger>
                    <SelectValue placeholder={NONE_LABEL}>
                        {selectedValue === SENTINEL_NONE
                            ? NONE_LABEL
                            : choices.find((name) => name === selectedValue)}
                    </SelectValue>
                </SelectTrigger>
                <SelectContent>
                    <SelectItem value={SENTINEL_NONE}>{NONE_LABEL}</SelectItem>
                    {choices.map((name) => (
                        <SelectItem key={name} value={name}>
                            {name}
                        </SelectItem>
                    ))}
                </SelectContent>
            </Select>
        </div>
    );
}
