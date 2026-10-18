'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { AlertCircle, CheckCircle2, KeyRound, Star } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { toast } from 'sonner';

import type { CredentialDescriptor } from '~/lib/accounting/credentials/index';
import type { CredentialKind } from '~/lib/accounting/credentials/registry';

import { FormDialog } from '~/components/FormDialog';
import {
    deleteRowAction,
    editRowAction,
    type RowAction,
    RowActionKind,
    RowActionsMenu,
} from '~/components/RowActionsMenu';
import { ToolPanel } from '~/components/ToolPanel';
import { Alert, AlertDescription } from '~/components/ui/alert';
import { Badge } from '~/components/ui/badge';
import { Button } from '~/components/ui/button';
import {
    Dialog,
    DialogContent,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '~/components/ui/dialog';
import { EmptyStatePanel } from '~/components/ui/empty-state';
import { Skeleton } from '~/components/ui/skeleton';
import { Spinner } from '~/components/ui/spinner';
import {
    CredentialRegistry,
    CredentialRole,
    MetaFieldType,
} from '~/lib/accounting/credentials/index';
import { formatDisplayDate, formatDisplayDateTime } from '~/lib/format';
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

    const activate = (cred: StoredCredential) => {
        activationMutation.mutate(
            { id: cred.id },
            { onSuccess: () => toast.success(`${cred.label} is now active`) },
        );
    };

    const runTest = async (cred: StoredCredential) => {
        const result = await testMut.mutateAsync({ id: cred.id });
        if (result.ok) {
            toast.success(
                `${cred.label}: OK · ${result.detail} · ${result.latencyMs}ms`,
            );
            await utilities.accounting.credentials.list.invalidate();
        } else {
            toast.error(`${cred.label}: ${result.detail}`);
        }
    };

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
        const actions: RowAction[] = [
            ...(canSetActive && !isActive
                ? [
                      {
                          icon: Star,
                          isDisabled: isActivating,
                          kind: RowActionKind.Select,
                          label: 'Set active',
                          onSelect: () => activate(cred),
                      } satisfies RowAction,
                  ]
                : []),
            ...(descriptor?.requiresSecret === false
                ? []
                : [
                      {
                          icon: CheckCircle2,
                          isDisabled: isTesting,
                          kind: RowActionKind.Select,
                          label: 'Test',
                          onSelect: () => void runTest(cred),
                      } satisfies RowAction,
                  ]),
            editRowAction(() => setEditing(cred), !descriptor),
            deleteRowAction({
                description:
                    'Its booking rules and bank account mappings are deleted with it. Past runs keep their history.',
                onDelete: () =>
                    deletionMutation.mutate(
                        { id: cred.id },
                        {
                            onSuccess: () =>
                                toast.success('Credential deleted'),
                        },
                    ),
                title: `Delete "${cred.label}"?`,
            }),
        ];
        return (
            <li
                className="flex items-start justify-between gap-4 border-b border-line-faint py-4 first:pt-0 last:border-b-0 last:pb-0"
                key={cred.id}
            >
                <div className="flex min-w-0 flex-col gap-1">
                    <div className="flex flex-wrap items-center gap-2">
                        <span className="type-small font-medium text-ink">
                            {cred.label}
                        </span>
                        <CredentialBadge kind={cred.kind} />
                        {isActive && <Badge>Active</Badge>}
                        <MetaSummaryBadges
                            descriptor={descriptor}
                            meta={cred.meta}
                        />
                        {(isTesting || isActivating || isDeleting) && (
                            <Spinner className="size-3" />
                        )}
                    </div>
                    <div className="text-xs text-ink-muted">
                        Added {formatDisplayDate(cred.createdAt)}
                        {cred.lastUsedAt &&
                            ` · last used ${formatDisplayDateTime(cred.lastUsedAt)}`}
                    </div>
                </div>
                <RowActionsMenu
                    actions={actions}
                    isPending={isDeleting}
                    label={cred.label}
                />
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
                <EmptyStatePanel
                    description="Add a credential to start importing"
                    icon={KeyRound}
                    title="No credentials yet"
                />
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
            {credential && (
                <EditCredentialForm
                    credential={credential}
                    onClose={onClose}
                    onSaved={onSaved}
                />
            )}
        </Dialog>
    );
}

function EditCredentialFields({
    credential,
    descriptor,
    onClose,
    onSaved,
}: {
    credential: StoredCredential;
    descriptor: CredentialDescriptor;
    onClose: () => void;
    onSaved: () => Promise<void>;
}) {
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
    const label = useWatch({ control: form.control, name: 'label' }) ?? '';
    const secret = useWatch({ control: form.control, name: 'secret' }) ?? '';
    const meta = useWatch({ control: form.control, name: 'meta' }) ?? {};

    const save = async (values: CredentialUpdateInput) => {
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
    };

    return (
        <FormDialog
            form={form}
            onCancel={onClose}
            onSubmit={save}
            pending={updateMut.isPending}
            submitLabel="Save changes"
            title="Edit credential"
        >
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
        </FormDialog>
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
    if (descriptor === undefined) {
        return (
            <DialogContent>
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
            </DialogContent>
        );
    }

    return (
        <EditCredentialFields
            credential={credential}
            descriptor={descriptor}
            onClose={onClose}
            onSaved={onSaved}
        />
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
                <Badge key={b.key}>{b.text}</Badge>
            ))}
        </>
    );
}
