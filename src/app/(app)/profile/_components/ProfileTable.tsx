'use client';

import { type RowData } from '@tanstack/react-table';
import { format } from 'date-fns';
import { type LucideIcon, Trash2 } from 'lucide-react';
import Link from 'next/link';
import { type ReactNode } from 'react';

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
import { Button } from '~/components/ui/Button';
import {
    DataTableAlign,
    type DataTableColumn,
} from '~/components/ui/DataTable';
import { EmptyState } from '~/components/ui/EmptyState';
import { cn } from '~/lib/utilities';

export const ProfileDatePrecision = {
    Day: 'day',
    Minute: 'minute',
} as const;

export type ProfileDatePrecision =
    (typeof ProfileDatePrecision)[keyof typeof ProfileDatePrecision];

const DATE_PATTERN: Record<ProfileDatePrecision, string> = {
    [ProfileDatePrecision.Day]: 'MMM d, y',
    [ProfileDatePrecision.Minute]: 'MMM d, y, HH:mm',
};

const NO_VALUE = '-';

type RowActionIdentity = {
    icon: LucideIcon;
    label: string;
};

export function formatProfileDate(
    value: Date,
    precision: ProfileDatePrecision,
): string {
    return format(value, DATE_PATTERN[precision]);
}

export function MutedCell({
    children,
    className,
}: {
    children: ReactNode;
    className?: string;
}) {
    return (
        <span
            className={cn(
                'text-xs text-muted-foreground tabular-nums',
                className,
            )}
        >
            {children}
        </span>
    );
}

export function PrimaryCell({ children }: { children: ReactNode }) {
    return (
        <span className="font-medium text-foreground tabular-nums">
            {children}
        </span>
    );
}

export function profileActionsColumn<TData extends RowData>(
    render: (row: TData) => ReactNode,
): DataTableColumn<TData> {
    return {
        cell: ({ row }) => (
            <div className="flex items-center justify-end gap-1">
                {render(row.original)}
            </div>
        ),
        enableSorting: false,
        header: () => <span className="sr-only">Actions</span>,
        id: 'actions',
        meta: { align: DataTableAlign.End },
    };
}

export function ProfileDateCell({
    precision,
    value,
}: {
    precision: ProfileDatePrecision;
    value: Date | null;
}) {
    return (
        <MutedCell>
            {value === null ? NO_VALUE : formatProfileDate(value, precision)}
        </MutedCell>
    );
}

export function ProfileTableEmpty({
    action,
    description,
    filtered,
    icon,
    noun,
}: {
    action?: ReactNode;
    description: string;
    filtered: boolean;
    icon: LucideIcon;
    noun: string;
}) {
    return filtered ? (
        <EmptyState
            description="Try a different search or clear the filters."
            icon={icon}
            title={`No matching ${noun}`}
        />
    ) : (
        <EmptyState
            action={action}
            description={description}
            icon={icon}
            title={`No ${noun} yet`}
        />
    );
}

export function RowActionButton({
    disabled,
    icon: Icon,
    label,
    onClick,
}: RowActionIdentity & { disabled?: boolean; onClick: () => void }) {
    return (
        <Button
            aria-label={label}
            disabled={disabled}
            onClick={onClick}
            size="icon-sm"
            title={label}
            type="button"
            variant="ghost"
        >
            <Icon className="size-4" />
        </Button>
    );
}

export function RowActionLink({
    download,
    href,
    icon: Icon,
    label,
}: RowActionIdentity & { download?: string; href: string }) {
    return (
        <Button asChild size="icon-sm" variant="ghost">
            {download === undefined ? (
                <Link aria-label={label} href={href} title={label}>
                    <Icon className="size-4" />
                </Link>
            ) : (
                <a
                    aria-label={label}
                    download={download}
                    href={href}
                    title={label}
                >
                    <Icon className="size-4" />
                </a>
            )}
        </Button>
    );
}

export function RowConfirmAction({
    confirmLabel = 'Delete',
    description,
    icon: Icon = Trash2,
    label,
    onConfirm,
    title,
}: {
    confirmLabel?: string;
    description: ReactNode;
    icon?: LucideIcon;
    label: string;
    onConfirm: () => void;
    title: ReactNode;
}) {
    return (
        <AlertDialog>
            <AlertDialogTrigger asChild>
                <Button
                    aria-label={label}
                    size="icon-sm"
                    title={label}
                    type="button"
                    variant="ghost"
                >
                    <Icon className="size-4" />
                </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
                <AlertDialogHeader>
                    <AlertDialogTitle>{title}</AlertDialogTitle>
                    <AlertDialogDescription>
                        {description}
                    </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction onClick={onConfirm}>
                        {confirmLabel}
                    </AlertDialogAction>
                </AlertDialogFooter>
            </AlertDialogContent>
        </AlertDialog>
    );
}
