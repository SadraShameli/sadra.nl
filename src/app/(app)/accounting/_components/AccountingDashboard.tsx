'use client';

import { format as formatDate } from 'date-fns';
import {
    AlertCircle,
    CalendarClock,
    CalendarDays,
    PlayCircle,
    Send,
    StopCircle,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';

import type {
    Booking,
    ConversionResult,
    LedgerRef,
    RawTransaction,
} from '~/lib/accounting/core/types';
import type { CredentialDescriptor } from '~/lib/accounting/credentials/index';
import type { ImportEvent, Stage } from '~/lib/accounting/runner-types';

import { Badge } from '~/components/ui/Badge';
import { Button } from '~/components/ui/Button';
import { Calendar } from '~/components/ui/Calendar';
import { Card, CardContent, CardHeader, CardTitle } from '~/components/ui/Card';
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from '~/components/ui/Dialog';
import { EmptyState } from '~/components/ui/EmptyState';
import { Label } from '~/components/ui/Label';
import {
    Popover,
    PopoverContent,
    PopoverTrigger,
} from '~/components/ui/Popover';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '~/components/ui/Tabs';
import { getCredentialDescriptor } from '~/lib/accounting/credentials/index';
import { STAGES } from '~/lib/accounting/runner-types';
import { DurationFormat } from '~/lib/lifting/format';
import { apiRoutes } from '~/lib/site/routes';
import { cn } from '~/lib/utils';
import { api } from '~/trpc/react';

import { CsvDropzone, type ParsedCsvFile } from './CsvDropzone';
import { EventLog, type LogLine } from './EventLog';
import { PushPanel } from './PushPanel';
import { ResultsCharts } from './ResultsCharts';
import {
    BookingsTable,
    MatchAuditTable,
    PerCounterpartTable,
    TotalPanel,
    UnknownsTable,
} from './ResultTables';
import { type StageState, StageStepper } from './StageStepper';
import { useActiveCredentials } from './useActiveCredentials';
import { useImportStream } from './useImportStream';

const STAGE_LABELS: Record<Stage, string> = {
    build: 'Build bookings',
    'fetch-fx': 'FX rates',
    post: 'Post',
    sources: 'Sources',
};
const STAGE_DEFINITIONS: { id: Stage; label: string }[] = STAGES.map((id) => ({
    id,
    label: STAGE_LABELS[id],
}));

const IDLE_STAGE_STATE = { status: 'idle' as const };

const defaultStart = () => `${new Date().getFullYear()}-01-01`;

const parseIsoDate = (iso: string): Date | undefined => {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
    if (!match) return undefined;
    const [, y, m, d] = match;
    return new Date(Number(y), Number(m) - 1, Number(d));
};

const formatIsoDate = (date: Date): string => {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
};

export function AccountingDashboard() {
    const { accounting, source } = useActiveCredentials();
    const accountingCredentialId = accounting?.id ?? '';

    const [startDate, setStartDate] = useState<string>(defaultStart());
    const [fetchingLastMutation, setFetchingLastMutation] = useState(false);
    const utils = api.useUtils();
    const [files, setFiles] = useState<ParsedCsvFile[]>([]);
    const [result, setResult] = useState<ConversionResult | null>(null);
    const [pushOpen, setPushOpen] = useState(false);

    const stream = useImportStream<ImportEvent>();

    const uploadedTransactions = useMemo<RawTransaction[]>(() => {
        return files.filter((f) => !f.error).flatMap((f) => f.transactions);
    }, [files]);

    const apiCredentialIds = useMemo(
        () => (source ? [source.id] : []),
        [source],
    );

    const stageState = useMemo<Record<Stage, StageState>>(() => {
        const init = Object.fromEntries(
            STAGES.map((id) => [id, IDLE_STAGE_STATE]),
        ) as Record<Stage, StageState>;
        for (const event of stream.events) {
            if (event.kind === 'stage') {
                init[event.stage] = {
                    durationMs: event.durationMs,
                    status: event.status,
                };
            }
        }
        return init;
    }, [stream.events]);

    const logLines = useMemo<LogLine[]>(() => {
        const out: LogLine[] = [];
        let ts = Date.now();
        for (const event of stream.events) {
            ts += 1;
            if (event.kind === 'log') {
                out.push({
                    level: event.level,
                    message: event.message,
                    ts,
                });
            } else if (event.kind === 'stage') {
                out.push({
                    level: 'info',
                    message:
                        event.status === 'started'
                            ? `▶ ${event.stage} ${event.message ?? ''}`
                            : `✓ ${event.stage}${event.message ? ` — ${event.message}` : ''}${
                                  event.durationMs
                                      ? ` (${DurationFormat.ms(event.durationMs)})`
                                      : ''
                              }`,
                    ts,
                });
            }
        }
        return out;
    }, [stream.events]);

    useEffect(() => {
        for (const event of stream.events) {
            if (event.kind === 'preview') {
                setResult(event.result);
            }
        }
    }, [stream.events]);

    const handleAfterLastMutation = async () => {
        if (!accountingCredentialId) return;
        setFetchingLastMutation(true);
        try {
            const latestDate =
                await utils.accounting.mutations.latestDate.fetch({
                    credentialId: accountingCredentialId,
                });
            if (!latestDate) return;
            const date = parseIsoDate(latestDate);
            if (!date) return;
            date.setDate(date.getDate() + 1);
            setStartDate(formatIsoDate(date));
        } finally {
            setFetchingLastMutation(false);
        }
    };

    const runDisabled =
        stream.running ||
        (uploadedTransactions.length === 0 && apiCredentialIds.length === 0);

    const handleRun = async () => {
        setResult(null);
        await stream.start({
            body: JSON.stringify({
                accountingCredentialId: accountingCredentialId || undefined,
                apiCredentialIds,
                startDate,
                uploadedTransactions,
            }),
            headers: { 'Content-Type': 'application/json' },
            method: 'POST',
            url: apiRoutes.accounting.run,
        });
    };

    return (
        <div className="flex flex-col gap-6">
            <Card>
                <CardHeader>
                    <CardTitle className="text-base">Run controls</CardTitle>
                </CardHeader>
                <CardContent className="flex flex-col gap-5">
                    <div className="flex flex-col gap-2">
                        <Label className="flex items-center gap-1.5 text-xs tracking-wider uppercase">
                            <CalendarDays className="size-3" />
                            Start date
                        </Label>
                        <div className="flex items-center gap-2">
                            <StartDatePicker
                                onChange={setStartDate}
                                value={startDate}
                            />
                            <Button
                                disabled={
                                    !accountingCredentialId ||
                                    fetchingLastMutation
                                }
                                onClick={() => void handleAfterLastMutation()}
                                size="sm"
                                title="Set to the day after the last posted mutation"
                                type="button"
                                variant="outline"
                            >
                                <CalendarClock className="size-3.5" />
                                After last mutation
                            </Button>
                        </div>
                    </div>

                    <div className="flex flex-col gap-2">
                        <Label className="text-xs tracking-wider uppercase">
                            CSV exports
                        </Label>
                        <CsvDropzone onChange={setFiles} value={files} />
                    </div>

                    <div className="flex flex-wrap items-center justify-end gap-3">
                        <div className="flex items-center gap-2">
                            {stream.running ? (
                                <Button
                                    onClick={stream.abort}
                                    size="sm"
                                    variant="outline"
                                >
                                    <StopCircle className="size-3" /> Abort
                                </Button>
                            ) : null}
                            <Button disabled={runDisabled} onClick={handleRun}>
                                <PlayCircle className="size-4" /> Run plan
                            </Button>
                        </div>
                    </div>
                </CardContent>
            </Card>

            <Card>
                <CardHeader>
                    <CardTitle className="text-base">Progress</CardTitle>
                </CardHeader>
                <CardContent className="flex flex-col gap-4">
                    <StageStepper
                        stages={STAGE_DEFINITIONS}
                        state={stageState}
                    />
                    <EventLog lines={logLines} />
                </CardContent>
            </Card>

            {stream.error && (
                <Card>
                    <CardContent>
                        <div className="flex items-start gap-2 text-sm text-destructive-foreground">
                            <AlertCircle className="mt-0.5 size-4" />
                            <span>{stream.error}</span>
                        </div>
                    </CardContent>
                </Card>
            )}

            {result && (
                <ResultsView
                    accountingCredentialId={accountingCredentialId}
                    accountingDescriptor={
                        accounting
                            ? getCredentialDescriptor(accounting.kind)
                            : undefined
                    }
                    onPushedComplete={async (s) => {
                        if (s.failed > 0) {
                            toast.warning(
                                `Posted ${s.posted}, ${s.failed} failed. See list below.`,
                            );
                        } else if (s.posted > 0) {
                            toast.success(`Posted ${s.posted} mutation(s).`);
                        }
                    }}
                    pushOpen={pushOpen}
                    result={result}
                    setPushOpen={setPushOpen}
                />
            )}
        </div>
    );
}

function ResultsView({
    accountingCredentialId,
    accountingDescriptor,
    onPushedComplete,
    pushOpen,
    result,
    setPushOpen,
}: {
    accountingCredentialId: string;
    accountingDescriptor: CredentialDescriptor | undefined;
    onPushedComplete: (s: { failed: number; posted: number }) => Promise<void>;
    pushOpen: boolean;
    result: ConversionResult;
    setPushOpen: (open: boolean) => void;
}) {
    const postable =
        accountingCredentialId.length > 0 &&
        accountingDescriptor?.role === 'accounting';
    const targetLabel = accountingDescriptor?.label ?? 'accounting backend';

    const [bookings, setBookings] = useState<Booking[]>(result.bookings);
    useEffect(() => {
        setBookings(result.bookings);
    }, [result]);

    const editBooking = useCallback(
        (txnId: string, patch: Partial<Booking>) => {
            setBookings((prev) =>
                prev.map((b) => (b.txnId === txnId ? { ...b, ...patch } : b)),
            );
        },
        [],
    );

    const ledgersQ = api.accounting.ledgers.list.useQuery(
        { credentialId: accountingCredentialId },
        { enabled: postable },
    );
    const ledgerOptions = useMemo<LedgerRef[]>(
        () =>
            (ledgersQ.data ?? []).map((l) => ({
                id: l.externalId,
                label: `${l.code} ${l.description}`,
            })),
        [ledgersQ.data],
    );

    return (
        <div className="flex flex-col gap-4">
            <TotalPanel result={result} />
            <ResultsCharts result={result} />

            <Card>
                <CardHeader>
                    <CardTitle className="flex flex-wrap items-center justify-between gap-3 text-base">
                        <span>Preview</span>
                        <div className="flex items-center gap-2">
                            {!postable && (
                                <Badge variant="outline">
                                    pick an accounting credential to post
                                </Badge>
                            )}
                            <Dialog onOpenChange={setPushOpen} open={pushOpen}>
                                <DialogTrigger asChild>
                                    <Button
                                        disabled={
                                            !postable || bookings.length === 0
                                        }
                                        size="sm"
                                    >
                                        <Send className="size-3" /> Post to{' '}
                                        {targetLabel}
                                    </Button>
                                </DialogTrigger>
                                <DialogContent
                                    className={cn('max-w-3xl sm:max-w-3xl')}
                                >
                                    <DialogHeader>
                                        <DialogTitle>
                                            Push to {targetLabel}
                                        </DialogTitle>
                                    </DialogHeader>
                                    <PushPanel
                                        accountingCredentialId={
                                            accountingCredentialId || null
                                        }
                                        bookings={bookings}
                                        onCompleted={(s) =>
                                            void onPushedComplete(s)
                                        }
                                        result={result}
                                        targetLabel={targetLabel}
                                    />
                                </DialogContent>
                            </Dialog>
                        </div>
                    </CardTitle>
                </CardHeader>
                <CardContent>
                    {bookings.length === 0 ? (
                        <EmptyState
                            description="Run completed but no bookings were produced."
                            title="Nothing to post"
                        />
                    ) : (
                        <Tabs defaultValue="bookings">
                            <TabsList>
                                <TabsTrigger value="bookings">
                                    Bookings ({bookings.length})
                                </TabsTrigger>
                                <TabsTrigger value="per-counterpart">
                                    Per counterpart
                                </TabsTrigger>
                                <TabsTrigger value="audit">
                                    Match audit ({result.matches.length})
                                </TabsTrigger>
                                <TabsTrigger value="unknowns">
                                    Unknowns ({result.unknowns.length})
                                </TabsTrigger>
                            </TabsList>
                            <TabsContent className="mt-4" value="bookings">
                                <BookingsTable
                                    bookings={bookings}
                                    ledgerOptions={ledgerOptions}
                                    onEdit={editBooking}
                                />
                            </TabsContent>
                            <TabsContent
                                className="mt-4"
                                value="per-counterpart"
                            >
                                <PerCounterpartTable result={result} />
                            </TabsContent>
                            <TabsContent className="mt-4" value="audit">
                                <MatchAuditTable result={result} />
                            </TabsContent>
                            <TabsContent className="mt-4" value="unknowns">
                                <UnknownsTable result={result} />
                            </TabsContent>
                        </Tabs>
                    )}
                </CardContent>
            </Card>
        </div>
    );
}

function StartDatePicker({
    onChange,
    value,
}: {
    onChange: (iso: string) => void;
    value: string;
}) {
    const [open, setOpen] = useState(false);
    const date = parseIsoDate(value);
    const today = new Date();
    return (
        <Popover onOpenChange={setOpen} open={open}>
            <PopoverTrigger asChild>
                <Button
                    className="justify-start font-normal"
                    type="button"
                    variant="outline"
                >
                    <CalendarDays className="mr-1 size-3.5" />
                    {date ? formatDate(date, 'PPP') : 'Pick a date'}
                </Button>
            </PopoverTrigger>
            <PopoverContent align="start" className="w-auto p-0">
                <Calendar
                    captionLayout="dropdown"
                    disabled={{ after: today }}
                    mode="single"
                    onSelect={(picked) => {
                        if (!picked) return;
                        onChange(formatIsoDate(picked));
                        setOpen(false);
                    }}
                    selected={date}
                />
            </PopoverContent>
        </Popover>
    );
}
