'use client';

import { type RowData } from '@tanstack/react-table';
import { type LucideIcon, MoreHorizontal, Pencil, Trash2 } from 'lucide-react';
import { type Route } from 'next';
import Link from 'next/link';
import { type ReactNode, useRef, useState } from 'react';

import { Button } from '~/components/ui/button';
import { ConfirmDialog } from '~/components/ui/confirm-dialog';
import {
    DataTableAlign,
    type DataTableColumn,
    type DataTableCore,
} from '~/components/ui/data-table';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuGroup,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from '~/components/ui/dropdown-menu';
import { cn } from '~/lib/utilities';

export enum RowActionKind {
    Download = 'download',
    Link = 'link',
    Select = 'select',
}

export type RowAction = RowDownloadAction | RowLinkAction | RowSelectAction;

export interface RowSelectAction extends RowActionBase {
    readonly confirm?: RowActionConfirm;
    readonly isDestructive?: boolean;
    readonly kind: RowActionKind.Select;
    readonly onSelect: () => void;
}

interface RowActionBase {
    readonly icon?: LucideIcon;
    readonly isDisabled?: boolean;
    readonly label: string;
}

interface RowActionConfirm {
    readonly confirmLabel: string;
    readonly description: ReactNode;
    readonly title: ReactNode;
}

interface RowDownloadAction extends RowActionBase {
    readonly fileName: string;
    readonly href: string;
    readonly kind: RowActionKind.Download;
}

interface RowLinkAction extends RowActionBase {
    readonly kind: RowActionKind.Link;
    readonly link: (content: ReactNode) => ReactNode;
}

const ROW_ACTIONS_COLUMN_ID = 'actions';

const EDIT_LABEL = 'Edit';

const DELETE_LABEL = 'Delete';

export function deleteRowAction({
    description,
    isDisabled,
    onDelete,
    title,
}: {
    readonly description: ReactNode;
    readonly isDisabled?: boolean;
    readonly onDelete: () => void;
    readonly title: ReactNode;
}): RowSelectAction {
    return {
        confirm: { confirmLabel: DELETE_LABEL, description, title },
        icon: Trash2,
        isDestructive: true,
        isDisabled,
        kind: RowActionKind.Select,
        label: DELETE_LABEL,
        onSelect: onDelete,
    };
}

export function downloadRowAction(
    action: RowActionBase & {
        readonly fileName: string;
        readonly href: string;
    },
): RowAction {
    return { ...action, kind: RowActionKind.Download };
}

export function editRowAction(
    onEdit: () => void,
    isDisabled?: boolean,
): RowSelectAction {
    return {
        icon: Pencil,
        isDisabled,
        kind: RowActionKind.Select,
        label: EDIT_LABEL,
        onSelect: onEdit,
    };
}

export function linkRowAction<T extends string>({
    href,
    ...action
}: RowActionBase & { readonly href: Route<T> }): RowAction {
    return {
        ...action,
        kind: RowActionKind.Link,
        link: (content) => <Link href={href}>{content}</Link>,
    };
}

export function rowActionsColumn<TData extends RowData>({
    actionsOf,
    isPendingOf,
    labelOf,
}: {
    readonly actionsOf: (
        row: TData,
        table: DataTableCore<TData>,
    ) => readonly RowAction[];
    readonly isPendingOf?: (row: TData) => boolean;
    readonly labelOf: (row: TData) => string;
}): DataTableColumn<TData> {
    return {
        cell: ({ row, table }) => (
            <RowActionsMenu
                actions={actionsOf(row.original, table)}
                isPending={isPendingOf?.(row.original)}
                label={labelOf(row.original)}
            />
        ),
        enableSorting: false,
        header: () => <span className="sr-only">Actions</span>,
        id: ROW_ACTIONS_COLUMN_ID,
        meta: { align: DataTableAlign.End, isRowActions: true },
    };
}

export function RowActionsMenu({
    actions,
    isPending = false,
    label,
}: {
    readonly actions: readonly RowAction[];
    readonly isPending?: boolean;
    readonly label: string;
}) {
    const triggerReference = useRef<HTMLButtonElement>(null);
    const [confirming, setConfirming] = useState<null | RowSelectAction>(null);
    if (actions.length === 0) return null;
    const select = (action: RowSelectAction) => {
        triggerReference.current?.focus();
        if (action.confirm === undefined) {
            action.onSelect();
            return;
        }
        setConfirming(action);
    };
    return (
        <>
            <DropdownMenu modal={false}>
                <DropdownMenuTrigger asChild>
                    <Button
                        aria-label={`Actions for ${label}`}
                        className="app-row-actions"
                        disabled={isPending}
                        ref={triggerReference}
                        size="icon-sm"
                        type="button"
                        variant="ghost"
                    >
                        <MoreHorizontal />
                    </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="min-w-36">
                    <DropdownMenuGroup>
                        {actions.map((action) => (
                            <RowActionItem
                                action={action}
                                key={action.label}
                                onSelect={select}
                            />
                        ))}
                    </DropdownMenuGroup>
                </DropdownMenuContent>
            </DropdownMenu>
            {confirming?.confirm !== undefined && (
                <ConfirmDialog
                    confirmLabel={confirming.confirm.confirmLabel}
                    description={confirming.confirm.description}
                    isPending={isPending}
                    onConfirm={() => {
                        confirming.onSelect();
                        setConfirming(null);
                    }}
                    onOpenChange={(isOpen) => {
                        if (!isOpen) setConfirming(null);
                    }}
                    open
                    title={confirming.confirm.title}
                />
            )}
        </>
    );
}

function RowActionItem({
    action,
    onSelect,
}: {
    readonly action: RowAction;
    readonly onSelect: (action: RowSelectAction) => void;
}) {
    const content = (
        <>
            {action.icon === undefined ? null : <action.icon aria-hidden />}
            {action.label}
        </>
    );
    switch (action.kind) {
        case RowActionKind.Download: {
            return (
                <DropdownMenuItem asChild disabled={action.isDisabled}>
                    <a download={action.fileName} href={action.href}>
                        {content}
                    </a>
                </DropdownMenuItem>
            );
        }
        case RowActionKind.Link: {
            return (
                <DropdownMenuItem asChild disabled={action.isDisabled}>
                    {action.link(content)}
                </DropdownMenuItem>
            );
        }
        case RowActionKind.Select: {
            return (
                <DropdownMenuItem
                    className={cn(
                        action.isDestructive === true &&
                            'text-destructive focus:text-destructive',
                    )}
                    disabled={action.isDisabled}
                    onSelect={() => onSelect(action)}
                >
                    {content}
                </DropdownMenuItem>
            );
        }
    }
}
