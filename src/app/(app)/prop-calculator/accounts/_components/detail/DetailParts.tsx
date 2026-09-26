'use client';

import { Trash2, TriangleAlert } from 'lucide-react';
import { type ReactNode } from 'react';

import { Alert, AlertDescription, AlertTitle } from '~/components/ui/Alert';
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
import { Card, CardContent, CardHeader } from '~/components/ui/Card';
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
                    <h2
                        className="text-lg font-semibold tracking-tight text-white"
                        id={headingId}
                    >
                        {title}
                    </h2>
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
        <AlertDialog>
            <AlertDialogTrigger asChild>
                {triggerShowsLabel ? (
                    <Button
                        disabled={isPending}
                        type="button"
                        variant="outline"
                    >
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
                        {confirmText}
                    </AlertDialogAction>
                </AlertDialogFooter>
            </AlertDialogContent>
        </AlertDialog>
    );
}
