'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { Plus, Trash2, Users } from 'lucide-react';
import { useCallback, useEffect, useId, useMemo, useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { toast } from 'sonner';

import { Badge } from '~/components/ui/badge';
import { Button } from '~/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '~/components/ui/card';
import { ConfirmDialog } from '~/components/ui/confirm-dialog';
import {
    DataTable,
    type DataTableColumn,
    DataTableFilterFunction,
} from '~/components/ui/data-table';
import { DataTableFacetSelect } from '~/components/ui/data-table-facet-select';
import {
    Dialog,
    DialogContent,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '~/components/ui/dialog';
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
import { Separator } from '~/components/ui/separator';
import { authClient } from '~/lib/auth/client';
import { type Role } from '~/lib/auth/roles';
import {
    type AdminUserCreateInput,
    adminUserCreateInputSchema,
} from '~/lib/schemas/auth';
import { cn } from '~/lib/utilities';

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
                        {new Date(row.original.createdAt).toLocaleDateString()}
                    </span>
                ),
                header: 'Joined',
            },
            {
                cell: ({ row }) => {
                    const u = row.original;
                    const role = u.role ?? 'user';
                    const canChangeRole = isRoot && role !== 'root';
                    const canDelete =
                        role !== 'root' && (isRoot || role === 'user');
                    return (
                        <div className="flex items-center justify-end gap-2">
                            {canChangeRole && (
                                <Select
                                    disabled={pending}
                                    onValueChange={(v) =>
                                        void onSetRole(
                                            u.id,
                                            v as 'admin' | 'user',
                                        )
                                    }
                                    value={role === 'root' ? 'admin' : role}
                                >
                                    <SelectTrigger className="h-8 w-24 text-xs">
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="user">
                                            user
                                        </SelectItem>
                                        <SelectItem value="admin">
                                            admin
                                        </SelectItem>
                                    </SelectContent>
                                </Select>
                            )}
                            {canDelete && (
                                <ConfirmDialog
                                    confirmLabel="Delete"
                                    description="Removes the user and all their data permanently."
                                    onConfirm={() => void onDelete(u.id)}
                                    title={<>Delete &ldquo;{u.name}&rdquo;?</>}
                                >
                                    <Button
                                        aria-label="Delete user"
                                        disabled={pending}
                                        size="icon-sm"
                                        variant="outline"
                                    >
                                        <Trash2 className="size-3.5" />
                                    </Button>
                                </ConfirmDialog>
                            )}
                        </div>
                    );
                },
                header: () => <span className="sr-only">Actions</span>,
                id: 'actions',
            },
        ],
        [isRoot, pending, onSetRole, onDelete],
    );

    return (
        <Card className={cn('app-profile__account-management')}>
            <CardHeader className="flex flex-row items-center justify-between gap-3">
                <CardTitle>Manage users</CardTitle>
                {isRoot && (
                    <Button
                        className="gap-1"
                        onClick={() => setIsCreateOpen(true)}
                        size="sm"
                    >
                        <Plus className="size-4" /> New user
                    </Button>
                )}
            </CardHeader>
            <Separator />
            <CardContent className="flex flex-col gap-3">
                <DataTable
                    columns={columns}
                    data={rows}
                    emptyState={<EmptyState icon={Users} title="No users" />}
                    headerActions={(table) => (
                        <DataTableFacetSelect
                            column={table.getColumn('role')}
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
            </CardContent>
        </Card>
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

    const submit = form.handleSubmit(async (values) => {
        await onSubmit(values);
    });

    return (
        <Dialog
            onOpenChange={(o) => {
                if (!o) onClose();
            }}
            open={open}
        >
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>Create user</DialogTitle>
                </DialogHeader>
                <form className="flex flex-col gap-4" onSubmit={submit}>
                    <Controller
                        control={form.control}
                        name="name"
                        render={({ field, fieldState }) => (
                            <Field data-invalid={fieldState.invalid}>
                                <FieldLabel htmlFor={`${formId}-name`}>
                                    Name
                                </FieldLabel>
                                <Input
                                    aria-invalid={fieldState.invalid}
                                    autoComplete="off"
                                    id={`${formId}-name`}
                                    {...field}
                                />
                                <FieldError errors={[fieldState.error]} />
                            </Field>
                        )}
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
                                            user
                                        </SelectItem>
                                        <SelectItem value="admin">
                                            admin
                                        </SelectItem>
                                    </SelectContent>
                                </Select>
                                <FieldError errors={[fieldState.error]} />
                            </Field>
                        )}
                    />
                    <DialogFooter>
                        <Button onClick={onClose} type="button" variant="ghost">
                            Cancel
                        </Button>
                        <Button disabled={pending} type="submit">
                            {pending ? 'Creating…' : 'Create'}
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    );
}

function RoleBadge({ role }: { role: string }) {
    if (role === 'root') return <Badge variant="default">root</Badge>;
    return role === 'admin' ? (
        <Badge variant="secondary">admin</Badge>
    ) : (
        <Badge variant="outline">user</Badge>
    );
}
