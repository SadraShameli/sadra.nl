'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { Plus, UserCog, Users } from 'lucide-react';
import { useCallback, useEffect, useId, useMemo, useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { toast } from 'sonner';

import { FormDialog } from '~/components/FormDialog';
import { FormTextField } from '~/components/FormFields';
import {
    deleteRowAction,
    type RowAction,
    RowActionKind,
    rowActionsColumn,
} from '~/components/RowActionsMenu';
import { ToolPanel } from '~/components/ToolPanel';
import { Badge } from '~/components/ui/badge';
import { Button } from '~/components/ui/button';
import {
    DataTable,
    type DataTableColumn,
    DataTableFilterFunction,
} from '~/components/ui/data-table';
import { DataTableFacetSelect } from '~/components/ui/data-table-facet-select';
import { Dialog } from '~/components/ui/dialog';
import { EmptyState } from '~/components/ui/empty-state';
import { Field, FieldError, FieldLabel } from '~/components/ui/field';
import { Input } from '~/components/ui/input';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '~/components/ui/select';
import { authClient } from '~/lib/auth/client';
import { resolveRole, ROLE, type Role } from '~/lib/auth/roles';
import { formatDisplayDate } from '~/lib/format';
import {
    type AdminUserCreateInput,
    adminUserCreateInputSchema,
} from '~/lib/schemas/auth';
import { cn } from '~/lib/utilities';

const ROLE_LABEL: Record<Role, string> = {
    admin: 'Admin',
    root: 'Root',
    user: 'User',
};

interface UserRow {
    createdAt: Date | string;
    email: string;
    id: string;
    image?: null | string;
    name: string;
    role?: null | string;
}

export function AccountManagement({ callerRole }: { callerRole: Role }) {
    const isRoot = callerRole === 'root';
    const [rows, setRows] = useState<UserRow[]>([]);
    const [loading, setLoading] = useState(true);
    const [pending, setPending] = useState(false);
    const [isCreateOpen, setIsCreateOpen] = useState(false);

    const refetch = useCallback(async () => {
        const result = await authClient.admin.listUsers({
            query: { limit: 200 },
        });
        if (result.data) setRows(result.data.users);
    }, []);

    useEffect(() => {
        void refetch().finally(() => setLoading(false));
    }, [refetch]);

    const onSetRole = useCallback(
        async (userId: string, role: 'admin' | 'user') => {
            setPending(true);
            try {
                const result = await authClient.admin.setRole({ role, userId });
                if (result.error) {
                    toast.error(
                        result.error.message ?? 'Could not update role.',
                    );
                    return;
                }
                toast.success('Role updated.');
                await refetch();
            } finally {
                setPending(false);
            }
        },
        [refetch],
    );

    const onDelete = useCallback(
        async (userId: string) => {
            setPending(true);
            try {
                const result = await authClient.admin.removeUser({ userId });
                if (result.error) {
                    toast.error(
                        result.error.message ?? 'Could not delete user.',
                    );
                    return;
                }
                toast.success('User deleted.');
                await refetch();
            } finally {
                setPending(false);
            }
        },
        [refetch],
    );

    const onCreate = async (values: AdminUserCreateInput) => {
        setPending(true);
        try {
            const result = await authClient.admin.createUser({
                email: values.email,
                name: values.name,
                password: values.password,
                role: values.role,
            });
            if (result.error) {
                toast.error(result.error.message ?? 'Could not create user.');
                return;
            }
            toast.success('User created.');
            setIsCreateOpen(false);
            await refetch();
        } finally {
            setPending(false);
        }
    };

    const columns = useMemo<DataTableColumn<UserRow>[]>(
        () => [
            {
                accessorKey: 'name',
                cell: ({ row }) => (
                    <span className="font-medium text-foreground">
                        {row.original.name}
                    </span>
                ),
                header: 'Name',
                meta: { isRowHeader: true },
            },
            {
                accessorKey: 'email',
                cell: ({ row }) => (
                    <span className="text-xs text-muted-foreground">
                        {row.original.email}
                    </span>
                ),
                header: 'Email',
            },
            {
                accessorFn: (r) => r.role ?? 'user',
                cell: ({ row }) => (
                    <RoleBadge role={row.original.role ?? 'user'} />
                ),
                filterFn: DataTableFilterFunction.Equals,
                header: 'Role',
                id: 'role',
            },
            {
                accessorKey: 'createdAt',
                cell: ({ row }) => (
                    <span className="text-xs text-muted-foreground">
                        {formatDisplayDate(row.original.createdAt)}
                    </span>
                ),
                header: 'Joined',
            },
            rowActionsColumn<UserRow>({
                actionsOf: (user) => {
                    const role = user.role ?? ROLE.USER;
                    const nextRole =
                        role === ROLE.ADMIN ? ROLE.USER : ROLE.ADMIN;
                    const canChangeRole = isRoot && role !== ROLE.ROOT;
                    const canDelete =
                        role !== ROLE.ROOT && (isRoot || role === ROLE.USER);
                    return [
                        ...(canChangeRole
                            ? [
                                  {
                                      icon: UserCog,
                                      kind: RowActionKind.Select,
                                      label: `Change role to ${ROLE_LABEL[nextRole]}`,
                                      onSelect: () =>
                                          void onSetRole(user.id, nextRole),
                                  } satisfies RowAction,
                              ]
                            : []),
                        ...(canDelete
                            ? [
                                  deleteRowAction({
                                      description:
                                          'Removes the user and all their data permanently.',
                                      onDelete: () => void onDelete(user.id),
                                      title: `Delete “${user.name}”?`,
                                  }),
                              ]
                            : []),
                    ];
                },
                isPendingOf: () => pending,
                labelOf: (user) => user.name,
            }),
        ],
        [isRoot, pending, onSetRole, onDelete],
    );

    return (
        <ToolPanel
            actions={
                isRoot ? (
                    <Button
                        className="gap-1"
                        onClick={() => setIsCreateOpen(true)}
                        size="sm"
                    >
                        <Plus className="size-4" /> New user
                    </Button>
                ) : undefined
            }
            className={cn('app-profile__account-management')}
            contentClassName="gap-3"
            title="Manage users"
        >
            <DataTable
                columns={columns}
                data={rows}
                emptyState={<EmptyState icon={Users} title="No users" />}
                headerActions={(table) => (
                    <DataTableFacetSelect
                        column={table.getColumn('role')}
                        format={roleLabel}
                        placeholder="All roles"
                    />
                )}
                isLoading={loading}
                rowId={(r) => r.id}
                showFilter
            />

            {isRoot && (
                <CreateUserDialog
                    onClose={() => setIsCreateOpen(false)}
                    onSubmit={onCreate}
                    open={isCreateOpen}
                    pending={pending}
                />
            )}
        </ToolPanel>
    );
}

function CreateUserDialog({
    onClose,
    onSubmit,
    open,
    pending,
}: {
    onClose: () => void;
    onSubmit: (values: AdminUserCreateInput) => Promise<unknown>;
    open: boolean;
    pending: boolean;
}) {
    const form = useForm<AdminUserCreateInput>({
        defaultValues: { email: '', name: '', password: '', role: 'user' },
        mode: 'onTouched',
        resolver: zodResolver(adminUserCreateInputSchema),
    });
    const formId = useId();

    useEffect(() => {
        if (!open) {
            form.reset({ email: '', name: '', password: '', role: 'user' });
        }
    }, [open, form]);

    return (
        <Dialog
            onOpenChange={(o) => {
                if (!o) onClose();
            }}
            open={open}
        >
            <FormDialog
                form={form}
                onCancel={onClose}
                onSubmit={onSubmit}
                pending={pending}
                pendingLabel="Creating…"
                submitLabel="Create"
                title="Create user"
            >
                <FormTextField
                    control={form.control}
                    label="Name"
                    name="name"
                />
                <Controller
                    control={form.control}
                    name="email"
                    render={({ field, fieldState }) => (
                        <Field data-invalid={fieldState.invalid}>
                            <FieldLabel htmlFor={`${formId}-email`}>
                                Email
                            </FieldLabel>
                            <Input
                                aria-invalid={fieldState.invalid}
                                autoComplete="off"
                                id={`${formId}-email`}
                                type="email"
                                {...field}
                            />
                            <FieldError errors={[fieldState.error]} />
                        </Field>
                    )}
                />
                <Controller
                    control={form.control}
                    name="password"
                    render={({ field, fieldState }) => (
                        <Field data-invalid={fieldState.invalid}>
                            <FieldLabel htmlFor={`${formId}-password`}>
                                Password
                            </FieldLabel>
                            <Input
                                aria-invalid={fieldState.invalid}
                                autoComplete="new-password"
                                id={`${formId}-password`}
                                type="password"
                                {...field}
                            />
                            <FieldError errors={[fieldState.error]} />
                        </Field>
                    )}
                />
                <Controller
                    control={form.control}
                    name="role"
                    render={({ field, fieldState }) => (
                        <Field data-invalid={fieldState.invalid}>
                            <FieldLabel htmlFor={`${formId}-role`}>
                                Role
                            </FieldLabel>
                            <Select
                                onValueChange={field.onChange}
                                value={field.value}
                            >
                                <SelectTrigger
                                    aria-invalid={fieldState.invalid}
                                    id={`${formId}-role`}
                                >
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="user">
                                        {ROLE_LABEL.user}
                                    </SelectItem>
                                    <SelectItem value="admin">
                                        {ROLE_LABEL.admin}
                                    </SelectItem>
                                </SelectContent>
                            </Select>
                            <FieldError errors={[fieldState.error]} />
                        </Field>
                    )}
                />
            </FormDialog>
        </Dialog>
    );
}

function RoleBadge({ role }: { role: string }) {
    return <Badge>{roleLabel(role)}</Badge>;
}

function roleLabel(role: string): string {
    return ROLE_LABEL[resolveRole(null, role)];
}
