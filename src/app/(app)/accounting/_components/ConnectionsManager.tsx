'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { format } from 'date-fns';
import {
    AlertCircle,
    CheckCircle2,
    KeyRound,
    Loader2,
    Pencil,
    Plus,
    Star,
    Trash2,
} from 'lucide-react';
import { useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { type z } from 'zod';

import type { CredentialDescriptor } from '~/lib/accounting/credentials/index';
import type { CredentialKind } from '~/lib/accounting/credentials/registry';

import { Badge } from '~/components/ui/Badge';
import { Button } from '~/components/ui/Button';
import { Card, CardContent } from '~/components/ui/Card';
import {
    Dialog,
    DialogContent,
    DialogFooter,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
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
    type CredentialCreateInput,
    credentialCreateSchema,
    type CredentialUpdateInput,
    credentialUpdateSchema,
} from '~/lib/schemas/accounting';
import { api } from '~/trpc/react';

import { CredentialBadge } from './CredentialBadge';
import { CredentialFormFields, defaultMetaFor } from './CredentialFormFields';

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

export function ConnectionsManager() {
    const utilities = api.useUtils();
    const credentialsQ = api.accounting.credentials.list.useQuery();
    const testMut = api.accounting.credentials.test.useMutation();
    const setActiveMut = api.accounting.credentials.setActive.useMutation({
        onSuccess: () => utilities.accounting.credentials.list.invalidate(),
    });
    const deleteMut = api.accounting.credentials.delete.useMutation({
        onSuccess: async () => {
            await utilities.accounting.credentials.list.invalidate();
            await utilities.accounting.summary.invalidate();
        },
    });

    const descriptors = useMemo(() => CredentialRegistry.instance.list(), []);
    const [editing, setEditing] = useState<null | StoredCredential>(null);

    const grouped = useMemo(() => {
        const byRole: Record<CredentialRole, StoredCredential[]> = {
            accounting: [],
            transactions: [],
        };
        for (const c of credentialsQ.data ?? []) {
            const role = CredentialRegistry.instance.get(c.kind)?.role;
            if (role) byRole[role].push(c);
        }
        return byRole;
    }, [credentialsQ.data]);

    const refresh = async () => {
        await utilities.accounting.credentials.list.invalidate();
        await utilities.accounting.summary.invalidate();
    };

    const renderCard = (
        cred: StoredCredential,
        isActive: boolean,
        canSetActive: boolean,
    ) => {
        const descriptor = CredentialRegistry.instance.get(cred.kind);
        const isTesting = testMut.isPending && testMut.variables.id === cred.id;
        const isDeleting =
            deleteMut.isPending && deleteMut.variables.id === cred.id;
        const isActivating =
            setActiveMut.isPending && setActiveMut.variables.id === cred.id;
        return (
            <Card key={cred.id}>
                <CardContent className="flex flex-wrap items-center justify-between gap-4">
                    <div className="flex min-w-0 flex-col gap-1">
                        <div className="flex flex-wrap items-center gap-2">
                            <span className="font-semibold text-foreground">
                                {cred.label}
                            </span>
                            <CredentialBadge kind={cred.kind} />
                            {isActive && (
                                <Badge variant="success">Active</Badge>
                            )}
                            <MetaSummaryBadges
                                descriptor={descriptor}
                                meta={cred.meta}
                            />
                        </div>
                        <div className="text-xs text-muted-foreground">
                            Added{' '}
                            {format(new Date(cred.createdAt), 'd MMM yyyy')}
                            {cred.lastUsedAt &&
                                ` · last used ${format(new Date(cred.lastUsedAt), 'd MMM yyyy HH:mm')}`}
                        </div>
                    </div>
                    <div className="flex items-center gap-2">
                        {canSetActive && !isActive && (
                            <Button
                                disabled={isActivating}
                                onClick={async () => {
                                    await setActiveMut.mutateAsync({
                                        id: cred.id,
                                    });
                                    toast.success(
                                        `${cred.label} is now active`,
                                    );
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
                                    const res = await testMut.mutateAsync({
                                        id: cred.id,
                                    });
                                    if (res.ok) {
                                        toast.success(
                                            `${cred.label}: OK · ${res.detail} · ${res.latencyMs}ms`,
                                        );
                                        await utilities.accounting.credentials.list.invalidate();
                                    } else {
                                        toast.error(
                                            `${cred.label}: ${res.detail}`,
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
                        <Button
                            disabled={isDeleting}
                            onClick={async () => {
                                if (
                                    !globalThis.confirm(
                                        `Delete "${cred.label}"?`,
                                    )
                                ) {
                                    return;
                                }
                                await deleteMut.mutateAsync({ id: cred.id });
                                toast.success('Credential deleted');
                            }}
                            size="sm"
                            variant="ghost"
                        >
                            {isDeleting ? (
                                <Loader2 className="size-3 animate-spin" />
                            ) : (
                                <Trash2 className="size-3" />
                            )}
                        </Button>
                    </div>
                </CardContent>
            </Card>
        );
    };

    return (
        <div className="flex flex-col gap-6">
            <div className="flex flex-wrap items-center justify-end gap-3">
                <NewCredentialDialog
                    descriptors={descriptors}
                    onCreated={refresh}
                />
            </div>

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
                    <div className="flex flex-col gap-3" key={role}>
                        <h2 className="text-xs font-medium tracking-wider text-muted-foreground uppercase">
                            {ROLE_SECTION_LABEL[role]}
                        </h2>
                        {group.map((cred) =>
                            renderCard(
                                cred,
                                cred.id === activeId,
                                group.length > 1,
                            ),
                        )}
                    </div>
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
                    Unknown credential kind &quot;{credential.kind}&quot; — no
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
                        <div className="flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/10 p-3 text-xs text-destructive-foreground">
                            <AlertCircle className="mt-0.5 size-3.5" />
                            <span>{updateMut.error.message}</span>
                        </div>
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
                if (value === true) {
                    return { key: field.key, text: field.label.toLowerCase() };
                }
                return null;
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

    if (badges.length === 0) return null;
    return (
        <>
            {badges.map((b) => (
                <Badge key={b.key} variant="outline">
                    {b.text}
                </Badge>
            ))}
        </>
    );
}

function NewCredentialDialog({
    descriptors,
    onCreated,
}: {
    descriptors: CredentialDescriptor[];
    onCreated: () => Promise<void>;
}) {
    const [open, setOpen] = useState(false);
    const initialDescriptor = descriptors[0];
    const createMut = api.accounting.credentials.create.useMutation();
    const form = useForm<
        z.input<typeof credentialCreateSchema>,
        unknown,
        CredentialCreateInput
    >({
        defaultValues: initialDescriptor
            ? {
                  kind: initialDescriptor.id,
                  label: '',
                  meta: defaultMetaFor(initialDescriptor),
                  secret: '',
              }
            : undefined,
        resolver: zodResolver(credentialCreateSchema),
    });

    const kind = form.watch('kind');
    const label = form.watch('label');
    const secret = form.watch('secret');
    const meta = form.watch('meta') ?? {};
    const descriptor = descriptors.find((d) => d.id === kind);

    const reset = () => {
        const first = descriptors[0];
        if (!first) return;
        form.reset({
            kind: first.id,
            label: '',
            meta: defaultMetaFor(first),
            secret: '',
        });
    };

    if (!descriptor) {
        return (
            <Button disabled>
                <Plus className="size-4" /> Add credential
            </Button>
        );
    }

    const onSubmit = form.handleSubmit(async (values) => {
        try {
            await createMut.mutateAsync({
                kind: values.kind,
                label: values.label.trim(),
                meta: values.meta,
                secret: values.secret?.trim(),
            });
            toast.success('Credential added');
            setOpen(false);
            await onCreated();
            reset();
        } catch (error) {
            toast.error(
                error instanceof Error
                    ? error.message
                    : 'Could not save credential',
            );
        }
    });

    return (
        <Dialog
            onOpenChange={(o) => {
                setOpen(o);
                if (o) {
                    form.setValue('meta', defaultMetaFor(descriptor));
                } else {
                    reset();
                }
            }}
            open={open}
        >
            <DialogTrigger asChild>
                <Button>
                    <Plus className="size-4" /> Add credential
                </Button>
            </DialogTrigger>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>New credential</DialogTitle>
                </DialogHeader>

                <Form {...form}>
                    <form className="flex flex-col gap-4" onSubmit={onSubmit}>
                        <CredentialFormFields
                            descriptor={descriptor}
                            descriptors={descriptors}
                            kindEditable
                            label={label}
                            meta={meta}
                            onKindChange={(id) => {
                                const next = descriptors.find(
                                    (d) => d.id === id,
                                );
                                form.setValue('kind', id, {
                                    shouldDirty: true,
                                    shouldValidate: true,
                                });
                                form.setValue(
                                    'meta',
                                    next ? defaultMetaFor(next) : {},
                                    { shouldDirty: true, shouldValidate: true },
                                );
                            }}
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
                            secret={secret ?? ''}
                            secretRequired={descriptor.requiresSecret !== false}
                        />

                        {createMut.error && (
                            <div className="flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/10 p-3 text-xs text-destructive-foreground">
                                <AlertCircle className="mt-0.5 size-3.5" />
                                <span>{createMut.error.message}</span>
                            </div>
                        )}

                        <DialogFooter>
                            <Button
                                disabled={createMut.isPending}
                                onClick={() => setOpen(false)}
                                type="button"
                                variant="ghost"
                            >
                                Cancel
                            </Button>
                            <Button
                                disabled={createMut.isPending}
                                type="submit"
                            >
                                {createMut.isPending && (
                                    <Loader2 className="size-3 animate-spin" />
                                )}
                                Save
                            </Button>
                        </DialogFooter>
                    </form>
                </Form>
            </DialogContent>
        </Dialog>
    );
}
