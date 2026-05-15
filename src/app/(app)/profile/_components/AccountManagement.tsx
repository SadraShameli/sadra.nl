'use client';

import { type ColumnDef } from '@tanstack/react-table';
import { Trash2 } from 'lucide-react';
import { useMemo } from 'react';
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
import { Select } from '~/components/ui/Select';
import { Separator } from '~/components/ui/Separator';
import { type Role } from '~/lib/auth-roles';
import { cn } from '~/lib/utils';
import { api } from '~/trpc/react';

type UserRow = {
    createdAt: Date;
    email: null | string;
    id: string;
    image: null | string;
    name: null | string;
    role: Role;
};

export function AccountManagement({ callerRole }: { callerRole: Role }) {
    const utils = api.useUtils();
    const users = api.user.list.useQuery();
    const setRole = api.user.setRole.useMutation({
        onError: (err) => toast.error(err.message),
        onSuccess: async () => {
            toast.success('Role updated.');
            await utils.user.list.invalidate();
        },
    });
    const del = api.user.delete.useMutation({
        onError: (err) => toast.error(err.message),
        onSuccess: async () => {
            toast.success('User deleted.');
            await utils.user.list.invalidate();
        },
    });

    const isRoot = callerRole === 'root';
    const rows = users.data ?? [];
    const pending = setRole.isPending || del.isPending;

    const columns = useMemo<ColumnDef<UserRow>[]>(
        () => [
            {
                accessorKey: 'name',
                cell: ({ row }) => (
                    <span className="font-medium text-white">
                        {row.original.name ?? '—'}
                    </span>
                ),
                header: 'Name',
            },
            {
                accessorKey: 'email',
                cell: ({ row }) => (
                    <span className="text-xs text-muted-foreground">
                        {row.original.email ?? 'no email'}
                    </span>
                ),
                header: 'Email',
            },
            {
                accessorKey: 'role',
                cell: ({ row }) => <RoleBadge role={row.original.role} />,
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
                    const canChangeRole = isRoot && u.role !== 'root';
                    const canDelete =
                        u.role !== 'root' && (isRoot || u.role === 'user');
                    return (
                        <div className="flex items-center justify-end gap-2">
                            {canChangeRole && (
                                <Select
                                    className={cn('h-8 w-24 text-xs')}
                                    disabled={pending}
                                    onChange={(e) =>
                                        setRole.mutate({
                                            role: e.target.value as
                                                | 'admin'
                                                | 'user',
                                            userId: u.id,
                                        })
                                    }
                                    value={u.role === 'root' ? 'admin' : u.role}
                                >
                                    <option value="user">user</option>
                                    <option value="admin">admin</option>
                                </Select>
                            )}
                            {canDelete && (
                                <AlertDialog>
                                    <AlertDialogTrigger asChild>
                                        <Button
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
                                                Delete &ldquo;
                                                {u.name ?? u.email}&rdquo;?
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
                                                    del.mutate({ userId: u.id })
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
        [del, isRoot, pending, setRole],
    );

    return (
        <Card className={cn('app-profile__account-management')}>
            <CardHeader>
                <CardTitle>Manage users</CardTitle>
            </CardHeader>
            <Separator />
            <CardContent>
                <DataTable
                    columns={columns}
                    data={rows}
                    emptyMessage="No users."
                    isLoading={users.isLoading}
                    rowId={(r) => r.id}
                    showFilter
                />
            </CardContent>
        </Card>
    );
}

function RoleBadge({ role }: { role: Role }) {
    if (role === 'root') return <Badge variant="default">root</Badge>;
    if (role === 'admin') return <Badge variant="secondary">admin</Badge>;
    return <Badge variant="outline">user</Badge>;
}
