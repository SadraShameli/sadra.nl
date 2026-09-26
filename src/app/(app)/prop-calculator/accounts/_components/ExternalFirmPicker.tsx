'use client';

import { useState } from 'react';

import { Button } from '~/components/ui/Button';
import { Input } from '~/components/ui/Input';
import { Label } from '~/components/ui/Label';
import {
    Select,
    SelectContent,
    SelectGroup,
    SelectItem,
    SelectLabel,
    SelectTrigger,
    SelectValue,
} from '~/components/ui/Select';
import { errorMessage } from '~/lib/errorMessage';
import {
    type ExternalFirmName,
    type FirmKey,
    firmKeyId,
    FirmKeyKind,
} from '~/lib/prop-accounts';

import {
    externalFirmNameError,
    firmKeyOfOption,
    LedgerOnlyFirmGroup,
    ledgerOnlyFirmOptions,
} from './externalFirmOptions';

const FIRM_ERROR_ID = 'account-ledger-firm-error';
const NEW_FIRM_ERROR_ID = 'account-new-firm-error';

const GROUP_LABEL: Readonly<Record<LedgerOnlyFirmGroup, string>> = {
    [LedgerOnlyFirmGroup.Listed]: 'Listed firms',
    [LedgerOnlyFirmGroup.Own]: 'Your firms',
};

export type CreateExternalFirm = (name: string) => Promise<ExternalFirmName>;

interface ExternalFirmPickerProperties {
    readonly disabled?: boolean;
    readonly error: null | string;
    readonly externalFirms: readonly ExternalFirmName[];
    readonly onChange: (next: FirmKey) => void;
    readonly onCreate: CreateExternalFirm | null;
    readonly value: FirmKey | null;
}

export function ExternalFirmPicker({
    disabled = false,
    error,
    externalFirms,
    onChange,
    onCreate,
    value,
}: ExternalFirmPickerProperties) {
    const [created, setCreated] = useState<readonly ExternalFirmName[]>([]);
    const known = [
        ...externalFirms,
        ...created.filter((firm) =>
            externalFirms.every((listed) => listed.id !== firm.id),
        ),
    ];
    const options = ledgerOnlyFirmOptions(known);
    const errorProperties =
        error === null
            ? {}
            : { 'aria-describedby': FIRM_ERROR_ID, 'aria-invalid': true };
    return (
        <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-2">
                <Label htmlFor="account-ledger-firm">Firm</Label>
                <Select
                    disabled={disabled}
                    onValueChange={(next) => {
                        const firmKey = firmKeyOfOption(options, next);
                        if (firmKey !== null) onChange(firmKey);
                    }}
                    value={value === null ? '' : firmKeyId(value)}
                >
                    <SelectTrigger
                        id="account-ledger-firm"
                        {...errorProperties}
                    >
                        <SelectValue placeholder="Pick the firm" />
                    </SelectTrigger>
                    <SelectContent>
                        {Object.values(LedgerOnlyFirmGroup).map((group) => {
                            const inGroup = options.filter(
                                (option) => option.group === group,
                            );
                            return inGroup.length === 0 ? null : (
                                <SelectGroup key={group}>
                                    <SelectLabel>
                                        {GROUP_LABEL[group]}
                                    </SelectLabel>
                                    {inGroup.map((option) => (
                                        <SelectItem
                                            key={option.value}
                                            value={option.value}
                                        >
                                            {option.label}
                                        </SelectItem>
                                    ))}
                                </SelectGroup>
                            );
                        })}
                    </SelectContent>
                </Select>
                {error !== null && (
                    <p className="text-sm text-destructive" id={FIRM_ERROR_ID}>
                        {error}
                    </p>
                )}
            </div>
            {onCreate !== null && !disabled && (
                <NewFirmField
                    externalFirms={known}
                    onCreate={onCreate}
                    onCreated={(firm) => {
                        setCreated((current) => [...current, firm]);
                        onChange({
                            externalFirmId: firm.id,
                            kind: FirmKeyKind.External,
                        });
                    }}
                />
            )}
        </div>
    );
}

function NewFirmField({
    externalFirms,
    onCreate,
    onCreated,
}: {
    readonly externalFirms: readonly ExternalFirmName[];
    readonly onCreate: CreateExternalFirm;
    readonly onCreated: (firm: ExternalFirmName) => void;
}) {
    const [name, setName] = useState('');
    const [problem, setProblem] = useState<null | string>(null);
    const [isCreating, setIsCreating] = useState(false);
    const add = async () => {
        const nameError = externalFirmNameError(name, externalFirms);
        if (nameError !== null) {
            setProblem(nameError);
            return;
        }
        setIsCreating(true);
        try {
            onCreated(await onCreate(name.trim()));
            setName('');
            setProblem(null);
        } catch (error) {
            setProblem(errorMessage(error));
        } finally {
            setIsCreating(false);
        }
    };
    return (
        <div className="flex flex-col gap-2">
            <Label htmlFor="account-new-firm">Firm not in the list</Label>
            <div className="flex gap-2">
                <Input
                    aria-describedby={
                        problem === null ? undefined : NEW_FIRM_ERROR_ID
                    }
                    aria-invalid={problem !== null}
                    autoComplete="off"
                    id="account-new-firm"
                    onChange={(event) => {
                        setName(event.target.value);
                    }}
                    onKeyDown={(event) => {
                        if (event.key !== 'Enter') return;
                        event.preventDefault();
                        void add();
                    }}
                    placeholder="Name of the firm"
                    value={name}
                />
                <Button
                    disabled={isCreating}
                    id="account-new-firm-add"
                    onClick={() => {
                        void add();
                    }}
                    type="button"
                    variant="outline"
                >
                    Add firm
                </Button>
            </div>
            {problem !== null && (
                <p className="text-sm text-destructive" id={NEW_FIRM_ERROR_ID}>
                    {problem}
                </p>
            )}
        </div>
    );
}
