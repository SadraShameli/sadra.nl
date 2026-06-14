'use client';

import {
    AlertCircle,
    CheckCircle2,
    Loader2,
    Send,
    XCircle,
} from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';

import type { Booking, ConversionResult } from '~/lib/accounting/core/types';
import type { ImportEvent } from '~/lib/accounting/runner-types';

import { Badge } from '~/components/ui/Badge';
import { Button } from '~/components/ui/Button';
import { Card } from '~/components/ui/Card';
import { Progress } from '~/components/ui/Progress';
import { apiRoutes } from '~/lib/site/routes';

import { useImportStream } from './useImportStream';

type PostRowStatus = 'failed' | 'pending' | 'posted';

interface Props {
    accountingCredentialId: null | string;
    bookings: Booking[];
    onCompleted: (summary: { failed: number; posted: number }) => void;
    result: ConversionResult;
    targetLabel: string;
}

interface RowState {
    error?: string;
    externalId?: number;
    status: PostRowStatus;
    txnId: string;
}

export function PushPanel({
    accountingCredentialId,
    bookings,
    onCompleted,
    result,
    targetLabel,
}: Props) {
    const [progress, setProgress] = useState<null | {
        current: number;
        total: number;
    }>(null);
    const stream = useImportStream<ImportEvent>();

    const rowMap = useMemo(() => {
        const map = new Map<string, RowState>();
        for (const b of bookings)
            map.set(b.txnId, { status: 'pending', txnId: b.txnId });
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
    }, [bookings, stream.events]);
    const completedSeenRef = useRef(0);
    useEffect(() => {
        for (let i = completedSeenRef.current; i < stream.events.length; i++) {
            const event = stream.events[i];
            if (!event) continue;
            if (event.kind === 'progress' && event.stage === 'post') {
                setProgress({ current: event.current, total: event.total });
            }
            if (event.kind === 'done') {
                const posted = [...rowMap.values()].filter(
                    (r) => r.status === 'posted',
                ).length;
                const failed = [...rowMap.values()].filter(
                    (r) => r.status === 'failed',
                ).length;
                onCompleted({ failed, posted });
            }
        }
        completedSeenRef.current = stream.events.length;
    }, [onCompleted, rowMap, stream.events]);

    const handleSend = async () => {
        if (!accountingCredentialId) return;
        setProgress({ current: 0, total: bookings.length });
        await stream.start({
            body: JSON.stringify({
                accountingCredentialId,
                bookings,
            }),
            headers: { 'Content-Type': 'application/json' },
            method: 'POST',
            url: apiRoutes.accounting.post,
        });
    };

    const failedCount = [...rowMap.values()].filter(
        (r) => r.status === 'failed',
    ).length;
    const postedCount = [...rowMap.values()].filter(
        (r) => r.status === 'posted',
    ).length;
    const pending = stream.running;

    return (
        <div className="flex flex-col gap-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="text-sm">
                    Posting <strong>{bookings.length}</strong> booking
                    {bookings.length === 1 ? '' : 's'} to {targetLabel}.
                </div>
                <Button
                    disabled={pending || !accountingCredentialId}
                    onClick={handleSend}
                >
                    {pending ? (
                        <Loader2 className="size-3 animate-spin" />
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
                            <span className="text-emerald-300">
                                {postedCount} posted
                            </span>
                            {failedCount > 0 && (
                                <span className="ml-3 text-rose-300">
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
                <div className="flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/10 p-3 text-xs text-destructive-foreground">
                    <AlertCircle className="mt-0.5 size-3.5" />
                    <span>{stream.error}</span>
                </div>
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
                                        <RowIcon status={row.status} />
                                        <span className="font-mono text-sky-300">
                                            {b.txnId}
                                        </span>
                                        <span className="truncate text-muted-foreground">
                                            {b.counterpartName} · {b.date}
                                        </span>
                                    </div>
                                    {row.status === 'posted' &&
                                        row.externalId !== undefined && (
                                            <Badge variant="success">
                                                #{row.externalId}
                                            </Badge>
                                        )}
                                </div>
                                {row.status === 'failed' && (
                                    <div className="pl-5">
                                        <Badge variant="destructive">
                                            {row.error ?? 'failed'}
                                        </Badge>
                                    </div>
                                )}
                            </li>
                        );
                    })}
                </ul>
            </Card>

            <div className="text-[10px] text-muted-foreground">
                {result.bookings.length} total booking(s) in this run.
            </div>
        </div>
    );
}

function RowIcon({ status }: { status: PostRowStatus }) {
    if (status === 'posted')
        return <CheckCircle2 className="size-3.5 text-emerald-400" />;
    if (status === 'failed')
        return <XCircle className="size-3.5 text-rose-400" />;
    return <Loader2 className="size-3.5 animate-spin text-muted-foreground" />;
}
