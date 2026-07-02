'use client';

import type { CredentialDescriptor } from '~/lib/accounting/credentials/index';
import type { CredentialKind } from '~/lib/accounting/credentials/registry';

import { Input } from '~/components/ui/Input';
import { Label } from '~/components/ui/Label';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '~/components/ui/Select';

import { MetaFieldInput } from './MetaFieldInput';

interface Properties {
    credentialId?: string;
    descriptor: CredentialDescriptor;
    descriptors?: readonly CredentialDescriptor[];
    kindEditable?: boolean;
    label: string;
    meta: Record<string, unknown>;
    onKindChange?: (id: CredentialKind) => void;
    onLabelChange: (label: string) => void;
    onMetaChange: (meta: Record<string, unknown>) => void;
    onSecretChange: (secret: string) => void;
    secret: string;
    secretRequired?: boolean;
}

export function CredentialFormFields({
    credentialId,
    descriptor,
    descriptors,
    kindEditable,
    label,
    meta,
    onKindChange,
    onLabelChange,
    onMetaChange,
    onSecretChange,
    secret,
    secretRequired = true,
}: Properties) {
    return (
        <>
            <div className="flex flex-col gap-2">
                <Label htmlFor="cred-kind">Provider</Label>
                {kindEditable === true && descriptors && onKindChange ? (
                    <Select
                        onValueChange={(v) => onKindChange(v as CredentialKind)}
                        value={descriptor.id}
                    >
                        <SelectTrigger id="cred-kind">
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            {descriptors.map((d) => (
                                <SelectItem key={d.id} value={d.id}>
                                    {d.label} ({d.role})
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                ) : (
                    <Input
                        disabled
                        id="cred-kind"
                        value={`${descriptor.label} (${descriptor.role})`}
                    />
                )}
                {descriptor.description && (
                    <p className="text-xs text-muted-foreground">
                        {descriptor.description}
                    </p>
                )}
            </div>

            <div className="flex flex-col gap-2">
                <Label htmlFor="cred-label">Label</Label>
                <Input
                    id="cred-label"
                    onChange={(e) => onLabelChange(e.target.value)}
                    placeholder="e.g. Primary account"
                    required
                    value={label}
                />
            </div>

            {descriptor.secret && (
                <div className="flex flex-col gap-2">
                    <Label htmlFor="cred-secret">
                        {descriptor.secret.label}
                    </Label>
                    <Input
                        autoComplete="new-password"
                        id="cred-secret"
                        minLength={
                            secret.length === 0 && !secretRequired
                                ? 0
                                : descriptor.secret.minLength
                        }
                        onChange={(e) => onSecretChange(e.target.value)}
                        placeholder={descriptor.secret.placeholder}
                        required={secretRequired}
                        type="password"
                        value={secret}
                    />
                </div>
            )}

            {descriptor.metaFields.map((field) => (
                <MetaFieldInput
                    credentialId={credentialId}
                    credentialKind={descriptor.id}
                    field={field}
                    key={field.key}
                    meta={meta}
                    onChange={(value) => {
                        if (value === undefined) {
                            onMetaChange(
                                Object.fromEntries(
                                    Object.entries(meta).filter(
                                        ([k]) => k !== field.key,
                                    ),
                                ),
                            );
                            return;
                        }
                        onMetaChange({ ...meta, [field.key]: value });
                    }}
                    secret={secret}
                    value={meta[field.key]}
                />
            ))}
        </>
    );
}

export function defaultMetaFor(
    descriptor: CredentialDescriptor,
): Record<string, unknown> {
    const out: Record<string, unknown> = {};
    for (const field of descriptor.metaFields) {
        if (field.defaultValue !== undefined) {
            out[field.key] = field.defaultValue;
        }
    }
    return out;
}
