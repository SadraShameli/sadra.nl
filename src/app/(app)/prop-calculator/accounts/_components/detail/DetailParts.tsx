'use client';

import { Plus, Trash2, TriangleAlert } from 'lucide-react';
import { type ReactNode } from 'react';

import { StatusRow, StatusTone } from '~/components/StatusRow';
import { ToolPanel } from '~/components/ToolPanel';
import { Alert, AlertDescription, AlertTitle } from '~/components/ui/alert';
import { Button } from '~/components/ui/button';
import { ConfirmDialog } from '~/components/ui/confirm-dialog';
import { Skeleton } from '~/components/ui/skeleton';
import { cn } from '~/lib/utilities';

export interface ListQuery<Row> {
    readonly data: readonly Row[] | undefined;
    readonly error: null | { readonly message: string };
}

export function AddRecordButton({
    label,
    onAdd,
}: {
    readonly label: string;
    readonly onAdd: () => void;
}) {
    return (
        <div>
            <Button onClick={onAdd} type="button" variant="outline">
                <Plus />
                {label}
            </Button>
        </div>
    );
}

export function DetailSection({
    children,
    id,
    title,
}: {
    readonly children: ReactNode;
    readonly id: string;
    readonly title: string;
}) {
    const headingId = `prop-account-${id}-heading`;
    return (
        <section
            aria-labelledby={headingId}
            className={cn('app-prop-accounts__detail-section')}
        >
            <ToolPanel
                contentClassName="gap-4"
                title={title}
                titleId={headingId}
            >
                {children}
            </ToolPanel>
        </section>
    );
}

export function ListQueryStatus<Row>({
    query,
    subject,
}: {
    readonly query: ListQuery<Row>;
    readonly subject: string;
}) {
    if (query.error !== null) {
        return query.data === undefined ? (
            <Alert variant="destructive">
                <TriangleAlert />
                <AlertTitle>{`The ${subject} could not be loaded`}</AlertTitle>
                <AlertDescription>{query.error.message}</AlertDescription>
            </Alert>
        ) : (
            <StatusRow
                detail={query.error.message}
                title={`The ${subject} could not be refreshed`}
                tone={StatusTone.Warn}
            />
        );
    }
    return query.data === undefined ? (
        <div aria-busy="true" aria-label={`Loading the ${subject}`}>
            <Skeleton className="h-24 w-full" />
        </div>
    ) : null;
}

export function RemoveRecordDialog({
    confirmText,
    description,
    isPending,
    onConfirm,
    title,
    triggerLabel,
}: {
    readonly confirmText: string;
    readonly description: string;
    readonly isPending: boolean;
    readonly onConfirm: () => void;
    readonly title: string;
    readonly triggerLabel: string;
}) {
    return (
        <ConfirmDialog
            confirmLabel={confirmText}
            description={description}
            onConfirm={onConfirm}
            title={title}
        >
            <Button disabled={isPending} type="button" variant="outline">
                <Trash2 />
                {triggerLabel}
            </Button>
        </ConfirmDialog>
    );
}
