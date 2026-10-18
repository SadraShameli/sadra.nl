'use client';

import { AlertCircle, CheckCircle2, Circle, Send, XCircle } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';

import type { ExternalId, RunId } from '~/lib/accounting/core/ids';
import type { Booking } from '~/lib/accounting/core/types';
import type { ImportEvent } from '~/lib/accounting/runner-types';

import { Alert, AlertDescription } from '~/components/ui/alert';
import { Badge } from '~/components/ui/badge';
import { Button } from '~/components/ui/button';
import { Card } from '~/components/ui/card';
import { Progress } from '~/components/ui/progress';
import { Spinner } from '~/components/ui/spinner';
import { formatDisplayDate } from '~/lib/format';
import { apiRoutes } from '~/lib/site/routes';
import { api } from '~/trpc/react';

import { useImportStream } from './useImportStream';

type PostRowStatus = 'failed' | 'pending' | 'posted';

interface Properties {
    accountingCredentialId: null | string;
    bookings: Booking[];
    onCompleted: (summary: { failed: number; posted: number }) => void;
    runId: null | RunId;
    targetLabel: string;
}

interface RowState {
    error?: string;
    externalId?: ExternalId;
    status: PostRowStatus;
    txnId: string;
}

export function PushPanel({
    accountingCredentialId,
    bookings,
    onCompleted,
    runId,
    targetLabel,
}: Properties) {
    const [progress, setProgress] = useState<null | {
        current: number;
        total: number;
    }>(null);
    const stream = useImportStream<ImportEvent>();
    const runQ = api.accounting.runs.get.useQuery(
        { id: runId ?? '' },
        { enabled: !!runId },
    );

    const rowMap = useMemo(() => {
        const map = new Map<string, RowState>();
        for (const b of bookings)
            map.set(b.txnId, { status: 'pending', txnId: b.txnId });
        const outcomeEntries = Object.entries(runQ.data?.outcomes ?? {});
        for (const [txnId, outcome] of outcomeEntries) {
            map.set(txnId, {
                error: outcome.error,
                externalId: outcome.externalId,
                status: outcome.status,
                txnId,
            });
        }
        for (const event of stream.events) {
            if (event.kind === 'posted') {
                map.set(event.txnId, {
                    externalId: event.externalId,
                    status: 'posted',
                    txnId: event.txnId,
                });
            } else if (event.kind === 'failed') {
                map.set(event.txnId, {
                    error: event.error,
                    status: 'failed',
                    txnId: event.txnId,
                });
            }
        }
        return map;
    }, [bookings, runQ.data, stream.events]);
    const completedSeenReference = useRef(0);
    useEffect(() => {
        for (
            let index = completedSeenReference.current;
            index < stream.events.length;
            index++
        ) {
            const event = stream.events[index];
            if (!event) continue;
            if (event.kind === 'progress' && event.stage === 'post') {
                setProgress({ current: event.current, total: event.total });
            }
            if (event.kind !== 'done') continue;
            const posted = rowMap
                .values()
                .filter((r) => r.status === 'posted')
                .toArray().length;
            const failed = rowMap
                .values()
                .filter((r) => r.status === 'failed')
                .toArray().length;
            onCompleted({ failed, posted });
        }
        completedSeenReference.current = stream.events.length;
    }, [onCompleted, rowMap, stream.events]);

    const handleSend = async () => {
        if (!accountingCredentialId || !runId) return;
        setProgress({ current: 0, total: bookings.length });
        await stream.start({
            body: JSON.stringify({
                accountingCredentialId,
                runId,
            }),
            headers: { 'Content-Type': 'application/json' },
            method: 'POST',
            url: apiRoutes.accounting.post,
        });
    };

    const failedCount = rowMap
        .values()
        .filter((r) => r.status === 'failed')
        .toArray().length;
    const postedCount = rowMap
        .values()
        .filter((r) => r.status === 'posted')
        .toArray().length;
    const isPending = stream.running;

    return (
        <div className="flex flex-col gap-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="text-sm">
                    Posting <strong>{bookings.length}</strong> booking
                    {bookings.length === 1 ? '' : 's'} to {targetLabel}.
                </div>
                <Button
                    disabled={isPending || !accountingCredentialId || !runId}
                    onClick={handleSend}
                >
                    {isPending ? (
                        <Spinner className="size-3" />
                    ) : (
                        <Send className="size-3" />
                    )}
                    Post to {targetLabel}
                </Button>
            </div>

            {progress && (
                <div className="flex flex-col gap-2">
                    <div className="flex items-center justify-between text-xs text-muted-foreground">
                        <span>
                            {progress.current} / {progress.total}
                        </span>
                        <span>
                            <span className="text-success">
                                {postedCount} posted
                            </span>
                            {failedCount > 0 && (
                                <span className="ml-3 text-destructive">
                                    {failedCount} failed
                                </span>
                            )}
                        </span>
                    </div>
                    <Progress
                        value={
                            (progress.current / Math.max(progress.total, 1)) *
                            100
                        }
                    />
                </div>
            )}

            {stream.error && (
                <Alert variant="destructive">
                    <AlertCircle className="size-4" />
                    <AlertDescription>{stream.error}</AlertDescription>
                </Alert>
            )}

            <Card className="max-h-80 overflow-y-auto py-0">
                <ul className="divide-y divide-border/40">
                    {bookings.map((b) => {
                        const row = rowMap.get(b.txnId) ?? {
                            status: 'pending' as const,
                            txnId: b.txnId,
                        };
                        return (
                            <li
                                className="flex flex-col gap-1 px-3 py-2 text-xs"
                                key={b.txnId}
                            >
                                <div className="flex items-center justify-between gap-2">
                                    <div className="flex min-w-0 items-center gap-2">
                                        <RowIcon
                                            isPosting={isPending}
                                            status={row.status}
                                        />
                                        <span className="font-mono text-info">
                                            {b.txnId}
                                        </span>
                                        <span className="truncate text-muted-foreground">
                                            {b.counterpartName} ·{' '}
                                            {formatDisplayDate(b.date)}
                                        </span>
                                    </div>
                                    {row.status === 'posted' &&
                                        row.externalId !== undefined && (
                                            <Badge>
                                                Posted #{row.externalId}
                                            </Badge>
                                        )}
                                </div>
                                {row.status === 'failed' && (
                                    <div className="pl-5">
                                        <Badge>
                                            {row.error === undefined
                                                ? 'Failed'
                                                : `Failed: ${row.error}`}
                                        </Badge>
                                    </div>
                                )}
                            </li>
                        );
                    })}
                </ul>
            </Card>

            <div className="text-xs text-muted-foreground">
                {bookings.length} total booking(s) in this run.
            </div>
        </div>
    );
}

function RowIcon({
    isPosting,
    status,
}: {
    isPosting: boolean;
    status: PostRowStatus;
}) {
    if (status === 'posted')
        return <CheckCircle2 className="size-3.5 text-success" />;
    if (status === 'failed')
        return <XCircle className="size-3.5 text-destructive" />;
    return isPosting ? (
        <Spinner className="size-3.5 text-muted-foreground" />
    ) : (
        <Circle aria-hidden className="size-3.5 text-muted-foreground" />
    );
}
