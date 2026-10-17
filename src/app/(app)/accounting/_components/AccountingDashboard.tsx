'use client';

import { format as formatDate } from 'date-fns';
import {
    AlertCircle,
    CalendarDays,
    FileCheck,
    PlayCircle,
    Send,
    StopCircle,
    Upload,
} from 'lucide-react';
import {
    useCallback,
    useEffect,
    useId,
    useMemo,
    useRef,
    useState,
} from 'react';
import { toast } from 'sonner';

import type { RunId } from '~/lib/accounting/core/ids';
import type {
    Booking,
    ConversionResult,
    LedgerReference,
} from '~/lib/accounting/core/types';
import type { CredentialDescriptor } from '~/lib/accounting/credentials/index';
import type { ImportEvent, Stage } from '~/lib/accounting/runner-types';

import { ToolPanel } from '~/app/(app)/_components/ToolPanel';
import { PanelErrorBoundary } from '~/components/PanelErrorBoundary';
import { Alert, AlertDescription } from '~/components/ui/Alert';
import { Badge } from '~/components/ui/Badge';
import { Button } from '~/components/ui/Button';
import { Calendar } from '~/components/ui/Calendar';
import { Checkbox } from '~/components/ui/Checkbox';
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from '~/components/ui/Dialog';
import { EmptyState } from '~/components/ui/EmptyState';
import { FILTER_CONTROL_CLASS } from '~/components/ui/filterControl';
import {
    Popover,
    PopoverContent,
    PopoverTrigger,
} from '~/components/ui/Popover';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '~/components/ui/Tabs';
import {
    CredentialRegistry,
    CredentialRole,
} from '~/lib/accounting/credentials/index';
import { STAGES } from '~/lib/accounting/runner-types';
import { DurationFormat } from '~/lib/lifting/format';
import { apiRoutes } from '~/lib/site/routes';
import { cn } from '~/lib/utilities';
import { api } from '~/trpc/react';

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

const toastError = (error: { message: string }) => toast.error(error.message);

const isFileSourceKind = (kind: string): boolean =>
    CredentialRegistry.instance.get(kind)?.transactionSourceKind === 'file';

interface LoadedFile {
    content: string;
    name: string;
}

async function loadFileContent(
    file: File,
    credentialId: string,
    setFileContents: (
        updater: (previous: Map<string, LoadedFile>) => Map<string, LoadedFile>,
    ) => void,
): Promise<void> {
    const content = await file.text();
    setFileContents((previous) =>
        new Map(previous).set(credentialId, { content, name: file.name }),
    );
}

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
    const { accounting, source, sources } = useActiveCredentials();
    const accountingCredentialId = accounting?.id ?? '';
    const startDateLabelId = useId();

    const latestDateQ = api.accounting.mutations.latestDate.useQuery(
        { credentialId: accountingCredentialId },
        { enabled: !!accountingCredentialId },
    );
    const [startDate, setStartDate] = useState<string>(defaultStart());
    const startDateTouched = useRef(false);
    const handleStartDateChange = (v: string) => {
        startDateTouched.current = true;
        setStartDate(v);
    };
    const [result, setResult] = useState<ConversionResult | null>(null);
    const [runId, setRunId] = useState<null | RunId>(null);
    const [pushOpen, setPushOpen] = useState(false);

    const stream = useImportStream<ImportEvent>();

    const [apiCredentialIds, setApiCredentialIds] = useState<string[]>([]);
    const [fileContents, setFileContents] = useState<Map<string, LoadedFile>>(
        new Map(),
    );
    const fileInputReferences = useRef<Map<string, HTMLInputElement>>(
        new Map(),
    );
    const sourceSelectionTouched = useRef(false);
    const toggleSource = (id: string, isChecked: boolean) => {
        sourceSelectionTouched.current = true;
        setApiCredentialIds((previous) =>
            isChecked ? [...previous, id] : previous.filter((x) => x !== id),
        );
        if (!isChecked) {
            setFileContents((previous) => {
                if (!previous.has(id)) return previous;
                const next = new Map(previous);
                next.delete(id);
                return next;
            });
        }
    };
    useEffect(() => {
        if (!source || sourceSelectionTouched.current) return;
        setApiCredentialIds([source.id]);
    }, [source]);

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
                            : `✓ ${event.stage}${event.message ? `: ${event.message}` : ''}${
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
            } else if (event.kind === 'run') {
                setRunId(event.runId);
            }
        }
    }, [stream.events]);

    useEffect(() => {
        if (startDateTouched.current) return;
        const latest = latestDateQ.data;
        if (!latest) return;
        const date = parseIsoDate(latest);
        if (!date) return;
        date.setDate(date.getDate() + 1);
        setStartDate(formatIsoDate(date));
    }, [latestDateQ.data]);

    const fileSourceIds = useMemo(
        () =>
            new Set(
                sources
                    .filter((s) => isFileSourceKind(s.kind))
                    .map((s) => s.id),
            ),
        [sources],
    );
    const isMissingFileContent = apiCredentialIds.some(
        (id) => fileSourceIds.has(id) && !fileContents.has(id),
    );
    const isRunDisabled =
        stream.running || apiCredentialIds.length === 0 || isMissingFileContent;

    const handleRun = async () => {
        setResult(null);
        setRunId(null);
        const selectedApiIds = apiCredentialIds.filter(
            (id) => !fileSourceIds.has(id),
        );
        const files = apiCredentialIds
            .filter((id) => fileSourceIds.has(id))
            .map((id) => ({
                content: fileContents.get(id)?.content ?? '',
                credentialId: id,
            }));
        await stream.start({
            body: JSON.stringify({
                accountingCredentialId: accountingCredentialId || undefined,
                apiCredentialIds: selectedApiIds,
                files,
                startDate,
            }),
            headers: { 'Content-Type': 'application/json' },
            method: 'POST',
            url: apiRoutes.accounting.run,
        });
    };

    return (
        <div className="flex flex-col gap-6">
            <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
                <ToolPanel
                    description="The start date follows the latest booking already in the accounting backend."
                    title="New run"
                >
                    <div
                        aria-labelledby={startDateLabelId}
                        className="flex flex-col gap-2"
                        role="group"
                    >
                        <span
                            className="text-sm font-medium text-ink"
                            id={startDateLabelId}
                        >
                            Start date
                        </span>
                        <StartDatePicker
                            onChange={handleStartDateChange}
                            value={startDate}
                        />
                    </div>

                    <fieldset className="m-0 flex min-w-0 flex-col gap-2 border-0 p-0">
                        <legend className="mb-2 text-sm font-medium text-ink">
                            Sources
                        </legend>
                        {sources.length === 0 ? (
                            <p className="m-0 text-sm text-ink-muted">
                                No transaction sources yet. Add one under
                                Connections.
                            </p>
                        ) : (
                            <ul className="m-0 flex list-none flex-col gap-2 p-0">
                                {sources.map((s) => {
                                    const isChecked = apiCredentialIds.includes(
                                        s.id,
                                    );
                                    const isFile = fileSourceIds.has(s.id);
                                    const loadedFile = fileContents.get(s.id);
                                    return (
                                        <li
                                            className={cn(
                                                'flex flex-wrap items-center justify-between gap-x-3 rounded-lg border transition-colors hover:border-line-hover',
                                                isChecked
                                                    ? 'border-line-hover bg-surface-raised'
                                                    : 'border-line bg-background',
                                            )}
                                            key={s.id}
                                        >
                                            <label className="flex min-w-0 flex-1 cursor-pointer items-center gap-3 px-4 py-3 text-sm text-ink">
                                                <Checkbox
                                                    checked={isChecked}
                                                    onCheckedChange={(c) =>
                                                        toggleSource(
                                                            s.id,
                                                            c === true,
                                                        )
                                                    }
                                                />
                                                {s.label}
                                            </label>
                                            {isChecked && isFile && (
                                                <div className="flex items-center gap-3 px-4 py-2 sm:pl-0">
                                                    <input
                                                        accept=".csv"
                                                        className="hidden"
                                                        onChange={(event) => {
                                                            const file =
                                                                event.target
                                                                    .files?.[0];
                                                            if (!file) return;
                                                            void loadFileContent(
                                                                file,
                                                                s.id,
                                                                setFileContents,
                                                            );
                                                        }}
                                                        ref={(element) => {
                                                            if (element) {
                                                                fileInputReferences.current.set(
                                                                    s.id,
                                                                    element,
                                                                );
                                                            } else {
                                                                fileInputReferences.current.delete(
                                                                    s.id,
                                                                );
                                                            }
                                                        }}
                                                        type="file"
                                                    />
                                                    {loadedFile && (
                                                        <span className="flex items-center gap-1.5 text-xs text-success">
                                                            <FileCheck className="size-3.5" />
                                                            {loadedFile.name}
                                                        </span>
                                                    )}
                                                    <Button
                                                        className="h-8"
                                                        onClick={() =>
                                                            fileInputReferences.current
                                                                .get(s.id)
                                                                ?.click()
                                                        }
                                                        size="sm"
                                                        variant="outline"
                                                    >
                                                        <Upload className="size-3.5" />
                                                        {loadedFile
                                                            ? 'Change CSV'
                                                            : 'Choose CSV'}
                                                    </Button>
                                                </div>
                                            )}
                                        </li>
                                    );
                                })}
                            </ul>
                        )}
                    </fieldset>

                    <div className="flex flex-wrap items-center justify-end gap-2 border-t border-line-faint pt-5">
                        {stream.running ? (
                            <Button onClick={stream.abort} variant="outline">
                                <StopCircle className="size-4" /> Abort
                            </Button>
                        ) : null}
                        <Button disabled={isRunDisabled} onClick={handleRun}>
                            <PlayCircle className="size-4" /> Run plan
                        </Button>
                    </div>
                </ToolPanel>

                <PanelErrorBoundary section="Progress">
                    <ToolPanel
                        description="Each stage shows its time once it finishes."
                        title="Progress"
                    >
                        <StageStepper
                            stages={STAGE_DEFINITIONS}
                            state={stageState}
                        />
                        <EventLog lines={logLines} />
                    </ToolPanel>
                </PanelErrorBoundary>
            </div>

            {stream.error && (
                <Alert variant="destructive">
                    <AlertCircle className="size-4" />
                    <AlertDescription>{stream.error}</AlertDescription>
                </Alert>
            )}

            {result && (
                <ResultsView
                    accountingCredentialId={accountingCredentialId}
                    accountingDescriptor={
                        accounting
                            ? CredentialRegistry.instance.get(accounting.kind)
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
                    runId={runId}
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
    runId,
    setPushOpen,
}: {
    accountingCredentialId: string;
    accountingDescriptor: CredentialDescriptor | undefined;
    onPushedComplete: (s: { failed: number; posted: number }) => Promise<void>;
    pushOpen: boolean;
    result: ConversionResult;
    runId: null | RunId;
    setPushOpen: (isOpen: boolean) => void;
}) {
    const isPostable =
        accountingCredentialId.length > 0 &&
        accountingDescriptor?.role === CredentialRole.Accounting;
    const targetLabel = accountingDescriptor?.label ?? 'accounting backend';

    const [bookings, setBookings] = useState<Booking[]>(result.bookings);
    useEffect(() => {
        setBookings(result.bookings);
    }, [result]);

    const { mutate: updateBooking } =
        api.accounting.runs.updateBooking.useMutation({
            onError: toastError,
        });
    const editBooking = useCallback(
        (txnId: string, patch: Partial<Booking>) => {
            setBookings((previous) =>
                previous.map((b) =>
                    b.txnId === txnId ? { ...b, ...patch } : b,
                ),
            );
            if (!runId) return;
            updateBooking({
                patch: {
                    counterpartLedger: patch.counterpartLedger,
                    counterpartName: patch.counterpartName,
                    direction: patch.direction,
                    isRefund: patch.isRefund,
                    taxCode: patch.taxCode,
                },
                runId,
                txnId,
            });
        },
        [runId, updateBooking],
    );

    const ledgersQ = api.accounting.ledgers.list.useQuery(
        { credentialId: accountingCredentialId },
        { enabled: isPostable },
    );
    const rulesQ = api.accounting.rules.list.useQuery(
        { credentialId: accountingCredentialId },
        { enabled: isPostable },
    );
    const ledgerOptions = useMemo<LedgerReference[]>(
        () =>
            (ledgersQ.data ?? []).map((l) => ({
                id: l.externalId,
                label: `${l.code} ${l.description}`,
            })),
        [ledgersQ.data],
    );

    return (
        <div className="flex flex-col gap-4">
            <PanelErrorBoundary section="Totals">
                <TotalPanel result={result} />
            </PanelErrorBoundary>
            <PanelErrorBoundary section="Charts">
                <ResultsCharts result={result} />
            </PanelErrorBoundary>

            <PanelErrorBoundary section="Preview">
                <ToolPanel
                    actions={
                        <>
                            {!isPostable && (
                                <Badge variant="outline">
                                    Pick an accounting connection to post
                                </Badge>
                            )}
                            <Dialog onOpenChange={setPushOpen} open={pushOpen}>
                                <DialogTrigger asChild>
                                    <Button
                                        disabled={
                                            !isPostable ||
                                            bookings.length === 0 ||
                                            !runId
                                        }
                                    >
                                        <Send className="size-4" /> Post to{' '}
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
                                        runId={runId}
                                        targetLabel={targetLabel}
                                    />
                                </DialogContent>
                            </Dialog>
                        </>
                    }
                    description="Check the bookings before posting. Edits are saved to the run."
                    title="Preview"
                >
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
                                    credentialId={accountingCredentialId}
                                    ledgerOptions={ledgerOptions}
                                    onEdit={editBooking}
                                    rules={rulesQ.data ?? []}
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
                                <UnknownsTable
                                    credentialId={
                                        isPostable
                                            ? accountingCredentialId
                                            : undefined
                                    }
                                    ledgerOptions={
                                        isPostable ? ledgerOptions : undefined
                                    }
                                    result={result}
                                />
                            </TabsContent>
                        </Tabs>
                    )}
                </ToolPanel>
            </PanelErrorBoundary>
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
                    className={cn(
                        FILTER_CONTROL_CLASS,
                        'w-fit justify-start gap-2 px-4 font-normal',
                    )}
                    type="button"
                    variant="outline"
                >
                    <CalendarDays className="size-3.5" />
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
