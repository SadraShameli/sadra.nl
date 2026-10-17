'use client';

import { Trash2, TriangleAlert } from 'lucide-react';
import { type ReactNode } from 'react';

import { ToolSectionHeading } from '~/app/(app)/_components/ToolSectionHeading';
import { Alert, AlertDescription, AlertTitle } from '~/components/ui/Alert';
import { Button } from '~/components/ui/Button';
import { Card, CardContent, CardHeader } from '~/components/ui/Card';
import { ConfirmDialog } from '~/components/ui/ConfirmDialog';
import { Skeleton } from '~/components/ui/Skeleton';
import { cn } from '~/lib/utilities';

export interface ListQuery<Row> {
    readonly data: readonly Row[] | undefined;
    readonly error: null | { readonly message: string };
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
            <Card>
                <CardHeader>
                    <ToolSectionHeading id={headingId}>
                        {title}
                    </ToolSectionHeading>
                </CardHeader>
                <CardContent className="flex flex-col gap-4">
                    {children}
                </CardContent>
            </Card>
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
        return (
            <Alert
                variant={query.data === undefined ? 'destructive' : 'warning'}
            >
                <TriangleAlert />
                <AlertTitle>
                    {query.data === undefined
                        ? `The ${subject} could not be loaded`
                        : `The ${subject} could not be refreshed`}
                </AlertTitle>
                <AlertDescription>{query.error.message}</AlertDescription>
            </Alert>
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
    triggerShowsLabel = false,
}: {
    readonly confirmText: string;
    readonly description: string;
    readonly isPending: boolean;
    readonly onConfirm: () => void;
    readonly title: string;
    readonly triggerLabel: string;
    readonly triggerShowsLabel?: boolean;
}) {
    return (
        <ConfirmDialog
            confirmLabel={confirmText}
            description={description}
            onConfirm={onConfirm}
            title={title}
        >
            {triggerShowsLabel ? (
                <Button disabled={isPending} type="button" variant="outline">
                    <Trash2 />
                    {triggerLabel}
                </Button>
            ) : (
                <Button
                    aria-label={triggerLabel}
                    disabled={isPending}
                    size="icon"
                    type="button"
                    variant="ghost"
                >
                    <Trash2 />
                </Button>
            )}
        </ConfirmDialog>
    );
}
