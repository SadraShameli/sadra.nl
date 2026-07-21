'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { type ColumnDef } from '@tanstack/react-table';
import { Plus, Trash2, Users } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';

import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
    AlertDialogTrigger,
} from '~/components/ui/AlertDialog';
import { Badge } from '~/components/ui/Badge';
import { Button } from '~/components/ui/Button';
import { Card, CardContent, CardHeader, CardTitle } from '~/components/ui/Card';
import { DataTable } from '~/components/ui/DataTable';
import {
    Dialog,
    DialogContent,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '~/components/ui/Dialog';
import { EmptyState } from '~/components/ui/EmptyState';
import {
    Form,
    FormControl,
    FormField,
    FormItem,
    FormLabel,
    FormMessage,
} from '~/components/ui/Form';
import { Input } from '~/components/ui/Input';
import { Label } from '~/components/ui/Label';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '~/components/ui/Select';
import { Separator } from '~/components/ui/Separator';
import { authClient } from '~/lib/auth/client';
import { type Role, ROLE_VALUES } from '~/lib/auth/roles';
import {
    type AdminUserCreateInput,
    adminUserCreateInputSchema,
} from '~/lib/schemas/auth';
import { cn } from '~/lib/utilities';

const ALL = '__all__';

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
    const [roleFilter, setRoleFilter] = useState<string>(ALL);
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

    const filtered = useMemo(
        () =>
            roleFilter === ALL
                ? rows
                : rows.filter((r) => (r.role ?? 'user') === roleFilter),
        [rows, roleFilter],
    );

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

    const columns = useMemo<ColumnDef<UserRow>[]>(
        () => [
            {
                accessorKey: 'name',
                cell: ({ row }) => (
                    <span className="font-medium text-white">
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
                accessorKey: 'role',
                cell: ({ row }) => (
                    <RoleBadge role={row.original.role ?? 'user'} />
                ),
                header: 'Role',
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
                                <AlertDialog>
                                    <AlertDialogTrigger asChild>
                                        <Button
                                            aria-label="Delete user"
                                            disabled={pending}
                                            size="sm"
                                            variant="outline"
                                        >
                                            <Trash2 className="size-3.5" />
                                        </Button>
                                    </AlertDialogTrigger>
                                    <AlertDialogContent>
                                        <AlertDialogHeader>
                                            <AlertDialogTitle>
                                                Delete &ldquo;{u.name}&rdquo;?
                                            </AlertDialogTitle>
                                            <AlertDialogDescription>
                                                Removes the user and all their
                                                data permanently.
                                            </AlertDialogDescription>
                                        </AlertDialogHeader>
                                        <AlertDialogFooter>
                                            <AlertDialogCancel>
                                                Cancel
                                            </AlertDialogCancel>
                                            <AlertDialogAction
                                                onClick={() =>
                                                    void onDelete(u.id)
                                                }
                                            >
                                                Delete
                                            </AlertDialogAction>
                                        </AlertDialogFooter>
                                    </AlertDialogContent>
                                </AlertDialog>
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
                <FilterField
                    label="Role"
                    onChange={setRoleFilter}
                    options={ROLE_VALUES.map((r) => ({ id: r, name: r }))}
                    value={roleFilter}
                />

                <DataTable
                    columns={columns}
                    data={filtered}
                    emptyState={<EmptyState icon={Users} title="No users" />}
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
                <Form {...form}>
                    <form className="flex flex-col gap-4" onSubmit={submit}>
                        <FormField
                            control={form.control}
                            name="name"
                            render={({ field }) => (
                                <FormItem>
                                    <FormLabel>Name</FormLabel>
                                    <FormControl>
                                        <Input autoComplete="off" {...field} />
                                    </FormControl>
                                    <FormMessage />
                                </FormItem>
                            )}
                        />
                        <FormField
                            control={form.control}
                            name="email"
                            render={({ field }) => (
                                <FormItem>
                                    <FormLabel>Email</FormLabel>
                                    <FormControl>
                                        <Input
                                            autoComplete="off"
                                            type="email"
                                            {...field}
                                        />
                                    </FormControl>
                                    <FormMessage />
                                </FormItem>
                            )}
                        />
                        <FormField
                            control={form.control}
                            name="password"
                            render={({ field }) => (
                                <FormItem>
                                    <FormLabel>Password</FormLabel>
                                    <FormControl>
                                        <Input
                                            autoComplete="new-password"
                                            type="password"
                                            {...field}
                                        />
                                    </FormControl>
                                    <FormMessage />
                                </FormItem>
                            )}
                        />
                        <FormField
                            control={form.control}
                            name="role"
                            render={({ field }) => (
                                <FormItem>
                                    <FormLabel>Role</FormLabel>
                                    <Select
                                        onValueChange={field.onChange}
                                        value={field.value}
                                    >
                                        <FormControl>
                                            <SelectTrigger>
                                                <SelectValue />
                                            </SelectTrigger>
                                        </FormControl>
                                        <SelectContent>
                                            <SelectItem value="user">
                                                user
                                            </SelectItem>
                                            <SelectItem value="admin">
                                                admin
                                            </SelectItem>
                                        </SelectContent>
                                    </Select>
                                    <FormMessage />
                                </FormItem>
                            )}
                        />
                        <DialogFooter>
                            <Button
                                onClick={onClose}
                                type="button"
                                variant="ghost"
                            >
                                Cancel
                            </Button>
                            <Button disabled={pending} type="submit">
                                {pending ? 'Creating…' : 'Create'}
                            </Button>
                        </DialogFooter>
                    </form>
                </Form>
            </DialogContent>
        </Dialog>
    );
}

function FilterField({
    label,
    onChange,
    options,
    value,
}: {
    label: string;
    onChange: (v: string) => void;
    options: { id: string; name: string }[];
    value: string;
}) {
    return (
        <div className="flex flex-col gap-1.5">
            <Label className="text-xs">{label}</Label>
            <Select onValueChange={onChange} value={value}>
                <SelectTrigger>
                    <SelectValue />
                </SelectTrigger>
                <SelectContent>
                    <SelectItem value={ALL}>All</SelectItem>
                    {options.map((o) => (
                        <SelectItem key={o.id} value={o.id}>
                            {o.name}
                        </SelectItem>
                    ))}
                </SelectContent>
            </Select>
        </div>
    );
}

function RoleBadge({ role }: { role: string }) {
    if (role === 'root') return <Badge variant="default">root</Badge>;
    if (role === 'admin') return <Badge variant="secondary">admin</Badge>;
    return <Badge variant="outline">user</Badge>;
}
