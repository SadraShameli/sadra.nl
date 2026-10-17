'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { format } from 'date-fns';
import {
    AlertCircle,
    CheckCircle2,
    KeyRound,
    Loader2,
    Pencil,
    Star,
    Trash2,
} from 'lucide-react';
import { useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';

import type { CredentialDescriptor } from '~/lib/accounting/credentials/index';
import type { CredentialKind } from '~/lib/accounting/credentials/registry';

import { ToolPanel } from '~/app/(app)/_components/ToolPanel';
import { Alert, AlertDescription } from '~/components/ui/Alert';
import { Badge } from '~/components/ui/Badge';
import { Button } from '~/components/ui/Button';
import { Card, CardContent } from '~/components/ui/Card';
import { ConfirmDialog } from '~/components/ui/ConfirmDialog';
import {
    Dialog,
    DialogContent,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '~/components/ui/Dialog';
import { EmptyState } from '~/components/ui/EmptyState';
import { Form } from '~/components/ui/Form';
import { Skeleton } from '~/components/ui/Skeleton';
import {
    CredentialRegistry,
    CredentialRole,
    MetaFieldType,
} from '~/lib/accounting/credentials/index';
import {
    type CredentialUpdateInput,
    credentialUpdateSchema,
} from '~/lib/schemas/accounting';
import { api } from '~/trpc/react';

import { CredentialBadge } from './CredentialBadge';
import { CredentialFormFields } from './CredentialFormFields';
import { useRefreshCredentials } from './useRefreshCredentials';

type StoredCredential = {
    createdAt: Date | string;
    id: string;
    isActive: boolean;
    kind: CredentialKind;
    label: string;
    lastUsedAt: Date | null | string;
    meta: Record<string, unknown>;
};

const ROLE_ORDER: readonly CredentialRole[] = [
    CredentialRole.Accounting,
    CredentialRole.Transactions,
];
const ROLE_SECTION_LABEL: Record<CredentialRole, string> = {
    [CredentialRole.Accounting]: 'Accounting',
    [CredentialRole.Transactions]: 'Transaction sources',
};

const ROLE_SECTION_DESCRIPTION: Record<CredentialRole, string> = {
    [CredentialRole.Accounting]:
        'Where bookings are posted. The active one is used for every run.',
    [CredentialRole.Transactions]:
        'Where transactions come from: bank APIs and CSV exports.',
};

export function ConnectionsManager() {
    const utilities = api.useUtils();
    const refresh = useRefreshCredentials();
    const credentialsQ = api.accounting.credentials.list.useQuery();
    const testMut = api.accounting.credentials.test.useMutation();
    const activationMutation = api.accounting.credentials.setActive.useMutation(
        {
            onSuccess: () => utilities.accounting.credentials.list.invalidate(),
        },
    );
    const deletionMutation = api.accounting.credentials.delete.useMutation({
        onSuccess: refresh,
    });

    const [editing, setEditing] = useState<null | StoredCredential>(null);

    const grouped = useMemo(() => {
        const byRole: Record<CredentialRole, StoredCredential[]> = {
            accounting: [],
            transactions: [],
        };
        const credentials = credentialsQ.data ?? [];
        for (const c of credentials) {
            const role = CredentialRegistry.instance.get(c.kind)?.role;
            if (role) byRole[role].push(c);
        }
        return byRole;
    }, [credentialsQ.data]);

    const renderCard = (
        cred: StoredCredential,
        isActive: boolean,
        canSetActive: boolean,
    ) => {
        const descriptor = CredentialRegistry.instance.get(cred.kind);
        const isTesting = testMut.isPending && testMut.variables.id === cred.id;
        const isDeleting =
            deletionMutation.isPending &&
            deletionMutation.variables.id === cred.id;
        const isActivating =
            activationMutation.isPending &&
            activationMutation.variables.id === cred.id;
        return (
            <li
                className="flex flex-wrap items-center justify-between gap-4 border-b border-line-faint py-4 first:pt-0 last:border-b-0 last:pb-0"
                key={cred.id}
            >
                <div className="flex min-w-0 flex-col gap-1">
                    <div className="flex flex-wrap items-center gap-2">
                        <span className="text-[15px] font-medium text-ink">
                            {cred.label}
                        </span>
                        <CredentialBadge kind={cred.kind} />
                        {isActive && <Badge variant="success">Active</Badge>}
                        <MetaSummaryBadges
                            descriptor={descriptor}
                            meta={cred.meta}
                        />
                    </div>
                    <div className="text-xs text-ink-muted">
                        Added {format(new Date(cred.createdAt), 'd MMM yyyy')}
                        {cred.lastUsedAt &&
                            ` · last used ${format(new Date(cred.lastUsedAt), 'd MMM yyyy HH:mm')}`}
                    </div>
                </div>
                <div className="flex items-center gap-2">
                    {canSetActive && !isActive && (
                        <Button
                            disabled={isActivating}
                            onClick={async () => {
                                await activationMutation.mutateAsync({
                                    id: cred.id,
                                });
                                toast.success(`${cred.label} is now active`);
                            }}
                            size="sm"
                            variant="outline"
                        >
                            {isActivating ? (
                                <Loader2 className="size-3 animate-spin" />
                            ) : (
                                <Star className="size-3" />
                            )}
                            Set active
                        </Button>
                    )}
                    {descriptor?.requiresSecret !== false && (
                        <Button
                            disabled={isTesting}
                            onClick={async () => {
                                const result = await testMut.mutateAsync({
                                    id: cred.id,
                                });
                                if (result.ok) {
                                    toast.success(
                                        `${cred.label}: OK · ${result.detail} · ${result.latencyMs}ms`,
                                    );
                                    await utilities.accounting.credentials.list.invalidate();
                                } else {
                                    toast.error(
                                        `${cred.label}: ${result.detail}`,
                                    );
                                }
                            }}
                            size="sm"
                            variant="outline"
                        >
                            {isTesting ? (
                                <Loader2 className="size-3 animate-spin" />
                            ) : (
                                <CheckCircle2 className="size-3" />
                            )}
                            Test
                        </Button>
                    )}
                    <Button
                        disabled={!descriptor}
                        onClick={() => setEditing(cred)}
                        size="sm"
                        variant="outline"
                    >
                        <Pencil className="size-3" />
                        Edit
                    </Button>
                    <ConfirmDialog
                        confirmLabel="Delete"
                        description="Its booking rules and bank account mappings are deleted with it. Past runs keep their history."
                        onConfirm={() =>
                            deletionMutation.mutate(
                                { id: cred.id },
                                {
                                    onSuccess: () =>
                                        toast.success('Credential deleted'),
                                },
                            )
                        }
                        title={`Delete "${cred.label}"?`}
                    >
                        <Button
                            aria-label={`Delete ${cred.label}`}
                            disabled={isDeleting}
                            size="sm"
                            variant="ghost"
                        >
                            {isDeleting ? (
                                <Loader2 className="size-3 animate-spin" />
                            ) : (
                                <Trash2 className="size-3" />
                            )}
                        </Button>
                    </ConfirmDialog>
                </div>
            </li>
        );
    };

    return (
        <div className="flex flex-col gap-6">
            {credentialsQ.isPending && (
                <div className="flex flex-col gap-3">
                    <Skeleton className="h-20 w-full" />
                    <Skeleton className="h-20 w-full" />
                </div>
            )}

            {credentialsQ.data?.length === 0 && (
                <Card>
                    <CardContent>
                        <EmptyState
                            description="Add a credential to start importing"
                            icon={KeyRound}
                            title="No credentials yet"
                        />
                    </CardContent>
                </Card>
            )}

            {ROLE_ORDER.map((role) => {
                const group = grouped[role];
                if (group.length === 0) return null;
                const activeId =
                    group.find((c) => c.isActive)?.id ?? group[0]?.id;
                return (
                    <ToolPanel
                        description={ROLE_SECTION_DESCRIPTION[role]}
                        key={role}
                        title={ROLE_SECTION_LABEL[role]}
                    >
                        <ul className="m-0 flex list-none flex-col p-0">
                            {group.map((cred) =>
                                renderCard(
                                    cred,
                                    cred.id === activeId,
                                    group.length > 1,
                                ),
                            )}
                        </ul>
                    </ToolPanel>
                );
            })}

            <EditCredentialDialog
                credential={editing}
                onClose={() => setEditing(null)}
                onSaved={refresh}
            />
        </div>
    );
}

function EditCredentialDialog({
    credential,
    onClose,
    onSaved,
}: {
    credential: null | StoredCredential;
    onClose: () => void;
    onSaved: () => Promise<void>;
}) {
    return (
        <Dialog
            onOpenChange={(o) => {
                if (!o) onClose();
            }}
            open={credential !== null}
        >
            <DialogContent>
                {credential && (
                    <EditCredentialForm
                        credential={credential}
                        onClose={onClose}
                        onSaved={onSaved}
                    />
                )}
            </DialogContent>
        </Dialog>
    );
}

function EditCredentialForm({
    credential,
    onClose,
    onSaved,
}: {
    credential: StoredCredential;
    onClose: () => void;
    onSaved: () => Promise<void>;
}) {
    const descriptor = CredentialRegistry.instance.get(credential.kind);
    const updateMut = api.accounting.credentials.update.useMutation();
    const form = useForm<CredentialUpdateInput>({
        defaultValues: {
            id: credential.id,
            label: credential.label,
            meta: credential.meta,
            secret: undefined,
        },
        resolver: zodResolver(credentialUpdateSchema),
    });

    if (!descriptor) {
        return (
            <>
                <DialogHeader>
                    <DialogTitle>Edit credential</DialogTitle>
                </DialogHeader>
                <p className="text-sm text-destructive">
                    Unknown credential kind &quot;{credential.kind}&quot;: no
                    descriptor registered.
                </p>
                <DialogFooter>
                    <Button onClick={onClose} variant="ghost">
                        Close
                    </Button>
                </DialogFooter>
            </>
        );
    }

    const onSubmit = form.handleSubmit(async (values) => {
        const trimmedSecret = values.secret?.trim();
        try {
            await updateMut.mutateAsync({
                id: credential.id,
                label: values.label?.trim(),
                meta: values.meta,
                secret:
                    trimmedSecret && trimmedSecret.length > 0
                        ? trimmedSecret
                        : undefined,
            });
            toast.success('Credential updated');
            await onSaved();
            onClose();
        } catch (error) {
            toast.error(
                error instanceof Error
                    ? error.message
                    : 'Could not save credential',
            );
        }
    });

    const label = form.watch('label') ?? '';
    const secret = form.watch('secret') ?? '';
    const meta = form.watch('meta') ?? {};

    return (
        <>
            <DialogHeader>
                <DialogTitle>Edit credential</DialogTitle>
            </DialogHeader>
            <Form {...form}>
                <form className="flex flex-col gap-4" onSubmit={onSubmit}>
                    <CredentialFormFields
                        credentialId={credential.id}
                        descriptor={descriptor}
                        label={label}
                        meta={meta}
                        onLabelChange={(v) =>
                            form.setValue('label', v, {
                                shouldDirty: true,
                                shouldValidate: true,
                            })
                        }
                        onMetaChange={(v) =>
                            form.setValue('meta', v, {
                                shouldDirty: true,
                                shouldValidate: true,
                            })
                        }
                        onSecretChange={(v) =>
                            form.setValue('secret', v, {
                                shouldDirty: true,
                                shouldValidate: true,
                            })
                        }
                        secret={secret}
                        secretRequired={false}
                    />

                    {updateMut.error && (
                        <Alert variant="destructive">
                            <AlertCircle className="size-4" />
                            <AlertDescription>
                                {updateMut.error.message}
                            </AlertDescription>
                        </Alert>
                    )}

                    <DialogFooter>
                        <Button
                            disabled={updateMut.isPending}
                            onClick={onClose}
                            type="button"
                            variant="ghost"
                        >
                            Cancel
                        </Button>
                        <Button disabled={updateMut.isPending} type="submit">
                            {updateMut.isPending && (
                                <Loader2 className="size-3 animate-spin" />
                            )}
                            Save changes
                        </Button>
                    </DialogFooter>
                </form>
            </Form>
        </>
    );
}

function MetaSummaryBadges({
    descriptor,
    meta,
}: {
    descriptor?: CredentialDescriptor;
    meta: Record<string, unknown>;
}) {
    if (!descriptor) return null;
    const badges = descriptor.metaFields
        .map((field) => {
            const value = meta[field.key];
            if (field.type === MetaFieldType.Boolean) {
                return value === true
                    ? { key: field.key, text: field.label.toLowerCase() }
                    : null;
            }
            if (
                (
                    [undefined, null, '', field.defaultValue] as unknown[]
                ).includes(value)
            ) {
                return null;
            }
            const display =
                typeof value === 'string' || typeof value === 'number'
                    ? String(value)
                    : '(set)';
            return {
                key: field.key,
                text: `${field.label}: ${display}`,
            };
        })
        .filter((b): b is { key: string; text: string } => b !== null);

    return badges.length === 0 ? null : (
        <>
            {badges.map((b) => (
                <Badge key={b.key} variant="outline">
                    {b.text}
                </Badge>
            ))}
        </>
    );
}
