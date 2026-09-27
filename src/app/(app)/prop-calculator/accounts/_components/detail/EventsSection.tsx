'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { Info } from 'lucide-react';
import { useId, useState } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { z } from 'zod';

import { Alert, AlertDescription, AlertTitle } from '~/components/ui/Alert';
import { Button } from '~/components/ui/Button';
import { Checkbox } from '~/components/ui/Checkbox';
import {
    Form,
    FormControl,
    FormDescription,
    FormField,
    FormItem,
    FormLabel,
    FormMessage,
} from '~/components/ui/Form';
import { Input } from '~/components/ui/Input';
import { Label } from '~/components/ui/Label';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '~/components/ui/Select';
import { Textarea } from '~/components/ui/Textarea';
import {
    AccountEventKind,
    type AccountLifecycleState,
    AccountTracking,
    type ExternalFirmName,
    FirmEngagementReason,
    FirmEngagementStatus,
    firmKeyLabel,
    firmKeyOf,
    type PlanLifecycleFacts,
    todayIsoDate,
} from '~/lib/prop-accounts';
import { type FirmId, parseFirmId } from '~/lib/prop-calculator';
import { eventRecordSchema } from '~/lib/schemas/propAccounts';
import { api, type RouterOutputs } from '~/trpc/react';

import { accountEventKindLabel } from '../overview/overviewModel';
import { type ListQuery, ListQueryStatus } from './DetailParts';
import {
    type EventOption,
    eventOptions,
    type EventPreview,
    type EventPreviewer,
    NO_EVENT_PREVIEW,
} from './eventOptions';
import { nullIfBlank, parsedOrIssues } from './formParsing';

type EngagementFirmColumns =
    | { readonly externalFirmId: null; readonly firmId: FirmId }
    | { readonly externalFirmId: string; readonly firmId: null };

type EventRow =
    RouterOutputs['propAccounts']['event']['listForAccount'][number];

const eventFormShape = z.object({
    kind: z.enum(AccountEventKind),
    note: z.string(),
    occurredOn: z.string(),
});

type EventFormValues = z.input<typeof eventFormShape>;

const LEDGER_ONLY_EVENTS_NOTE =
    'This account is ledger only, so no plan rules check its events: record a bust, a closure or its conclusion here to keep its status current. A funded reset needs a modeled plan; record the firm reinstating the account as a bust reversal with a note.';

export function EventsSection({
    accountId,
    onFailure,
    plan,
    preview = NO_EVENT_PREVIEW,
    query,
    state,
    tracking,
}: {
    readonly accountId: string;
    readonly onFailure: (error: unknown) => void;
    readonly plan: null | PlanLifecycleFacts;
    readonly preview?: EventPreviewer;
    readonly query: ListQuery<EventRow>;
    readonly state: AccountLifecycleState;
    readonly tracking: AccountTracking;
}) {
    const options = plan === null ? [] : eventOptions(plan, state);
    const [first] = options;
    const rows = query.data;
    const accountQuery = api.propAccounts.account.get.useQuery({
        id: accountId,
    });
    const externalFirmsQuery = api.propAccounts.externalFirm.list.useQuery();
    const firmColumns = firmColumnsOf(accountQuery.data);
    const externalFirms = externalFirmsQuery.data ?? [];
    return (
        <>
            <ListQueryStatus query={query} subject="account events" />
            {rows?.length === 0 && (
                <p className="text-sm text-muted-foreground">
                    No lifecycle events recorded yet.
                </p>
            )}
            {rows !== undefined && rows.length > 0 && (
                <ol className="flex flex-col gap-2 text-sm">
                    {rows.map((row) => (
                        <li className="flex flex-col" key={row.id}>
                            <span>
                                <span className="tabular-nums">
                                    {row.occurredOn}
                                </span>{' '}
                                <span className="font-medium">
                                    {accountEventKindLabel(row.kind)}
                                </span>
                            </span>
                            {row.detail.changes.map((change) => (
                                <span
                                    className="text-xs text-muted-foreground"
                                    key={change.field}
                                >
                                    {change.field}: {String(change.from)} to{' '}
                                    {String(change.to)}
                                </span>
                            ))}
                            {row.detail.note !== null && (
                                <span className="text-xs whitespace-pre-line text-muted-foreground">
                                    {row.detail.note}
                                </span>
                            )}
                        </li>
                    ))}
                </ol>
            )}
            {plan !== null && tracking === AccountTracking.LedgerOnly && (
                <p className="text-sm text-muted-foreground">
                    {LEDGER_ONLY_EVENTS_NOTE}
                </p>
            )}
            {plan === null && (
                <p className="text-sm text-muted-foreground">
                    Events can be recorded once the account&apos;s plan can be
                    read again.
                </p>
            )}
            {plan !== null && first === undefined && (
                <p className="text-sm text-muted-foreground">
                    No lifecycle event applies to this account now.
                </p>
            )}
            {first !== undefined && (
                <EventForm
                    accountId={accountId}
                    externalFirms={externalFirms}
                    firmColumns={firmColumns}
                    first={first}
                    key={options.map((option) => option.kind).join(',')}
                    onFailure={onFailure}
                    options={options}
                    preview={preview}
                />
            )}
        </>
    );
}

function EventForm({
    accountId,
    externalFirms,
    firmColumns,
    first,
    onFailure,
    options,
    preview,
}: {
    readonly accountId: string;
    readonly externalFirms: readonly ExternalFirmName[];
    readonly firmColumns: EngagementFirmColumns | null;
    readonly first: EventOption;
    readonly onFailure: (error: unknown) => void;
    readonly options: readonly EventOption[];
    readonly preview: EventPreviewer;
}) {
    const utilities = api.useUtils();
    const record = api.propAccounts.event.record.useMutation();
    const schema = eventFormSchema(accountId);
    const form = useForm<EventFormValues>({
        defaultValues: {
            kind: first.kind,
            note: '',
            occurredOn: todayIsoDate(new Date()),
        },
        resolver: zodResolver(schema, undefined, { raw: true }),
    });
    const kind = form.watch('kind');
    const selected = options.find((option) => option.kind === kind);
    const draft = schema.safeParse(form.watch());
    const shown = draft.success ? preview(draft.data) : null;
    const shownKey = shown === null ? null : previewKey(shown);
    const [confirmedKey, setConfirmedKey] = useState<null | string>(null);
    const [movedLiveOn, setMovedLiveOn] = useState<null | string>(null);
    const confirmId = useId();
    const isConfirmed = shownKey !== null && confirmedKey === shownKey;
    const isAwaitingConfirmation =
        shown?.requiresConfirmation === true && !isConfirmed;

    const save = async (values: EventFormValues) => {
        const parsed = schema.safeParse(values);
        if (isAwaitingConfirmation || !parsed.success) return;
        try {
            await record.mutateAsync(parsed.data);
            toast.success(
                `${accountEventKindLabel(parsed.data.kind)} recorded`,
            );
            setConfirmedKey(null);
            setMovedLiveOn(
                parsed.data.kind === AccountEventKind.MovedLive
                    ? parsed.data.occurredOn
                    : null,
            );
            form.reset({
                kind: first.kind,
                note: '',
                occurredOn: todayIsoDate(new Date()),
            });
        } catch (error) {
            onFailure(error);
        } finally {
            await utilities.propAccounts.invalidate();
        }
    };

    return (
        <Form {...form}>
            <form
                aria-label="Record an event"
                className="grid gap-4 sm:grid-cols-2"
                noValidate
                onSubmit={(event) => {
                    void form.handleSubmit(save)(event);
                }}
            >
                <FormField
                    control={form.control}
                    name="kind"
                    render={({ field }) => (
                        <FormItem>
                            <FormLabel>Event</FormLabel>
                            <Select
                                onValueChange={(next) => {
                                    const nextKind = z
                                        .enum(AccountEventKind)
                                        .safeParse(next).data;
                                    const option = options.find(
                                        (candidate) =>
                                            candidate.kind === nextKind,
                                    );
                                    if (option !== undefined) {
                                        field.onChange(option.kind);
                                    }
                                }}
                                value={field.value}
                            >
                                <FormControl>
                                    <SelectTrigger>
                                        <SelectValue />
                                    </SelectTrigger>
                                </FormControl>
                                <SelectContent>
                                    {options.map((option) => (
                                        <SelectItem
                                            key={option.kind}
                                            value={option.kind}
                                        >
                                            {option.label}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                            <FormDescription>
                                Only events the account&apos;s current stage and
                                status allow are offered.
                            </FormDescription>
                            <FormMessage />
                        </FormItem>
                    )}
                />
                <FormField
                    control={form.control}
                    name="occurredOn"
                    render={({ field }) => (
                        <FormItem>
                            <FormLabel>Date</FormLabel>
                            <FormControl>
                                <Input type="date" {...field} />
                            </FormControl>
                            <FormMessage />
                        </FormItem>
                    )}
                />
                <FormField
                    control={form.control}
                    name="note"
                    render={({ field }) => (
                        <FormItem className="sm:col-span-2">
                            <FormLabel>Note</FormLabel>
                            <FormControl>
                                <Textarea rows={2} {...field} />
                            </FormControl>
                            {selected?.requiresNote === true && (
                                <FormDescription>
                                    Say why the firm reversed the bust.
                                </FormDescription>
                            )}
                            <FormMessage />
                        </FormItem>
                    )}
                />
                {shown !== null && (
                    <Alert className="sm:col-span-2">
                        <Info />
                        <AlertTitle>{shown.title}</AlertTitle>
                        <AlertDescription>
                            {shown.lines.map((line) => (
                                <p key={line}>{line}</p>
                            ))}
                        </AlertDescription>
                    </Alert>
                )}
                {shown?.requiresConfirmation === true && (
                    <div className="flex items-center gap-2 sm:col-span-2">
                        <Checkbox
                            checked={isConfirmed}
                            id={confirmId}
                            onCheckedChange={(checked) => {
                                setConfirmedKey(
                                    checked === true ? shownKey : null,
                                );
                            }}
                        />
                        <Label htmlFor={confirmId}>
                            I have read what recording this event changes
                        </Label>
                    </div>
                )}
                <div className="sm:col-span-2">
                    <Button
                        disabled={record.isPending || isAwaitingConfirmation}
                        type="submit"
                    >
                        Record event
                    </Button>
                </div>
            </form>
            {movedLiveOn !== null && firmColumns !== null && (
                <MovedLiveSuggestion
                    externalFirms={externalFirms}
                    firmColumns={firmColumns}
                    onDismiss={() => {
                        setMovedLiveOn(null);
                    }}
                    sentLiveOn={movedLiveOn}
                />
            )}
        </Form>
    );
}

function eventFormSchema(accountId: string) {
    return eventFormShape.transform((values, context) => {
        const parsed = eventRecordSchema.safeParse({
            accountId,
            kind: values.kind,
            note: nullIfBlank(values.note),
            occurredOn: values.occurredOn,
        });
        return parsedOrIssues(parsed, context);
    });
}

function firmColumnsOf(data: unknown): EngagementFirmColumns | null {
    if (
        typeof data !== 'object' ||
        data === null ||
        !('firmId' in data) ||
        !('externalFirmId' in data)
    ) {
        return null;
    }
    const { externalFirmId, firmId } = data;
    if (typeof firmId === 'string' && externalFirmId === null) {
        const parsed = parseFirmId(firmId);
        return parsed === undefined
            ? null
            : { externalFirmId: null, firmId: parsed };
    }
    return typeof externalFirmId === 'string' && firmId === null
        ? { externalFirmId, firmId: null }
        : null;
}

function MovedLiveSuggestion({
    externalFirms,
    firmColumns,
    onDismiss,
    sentLiveOn,
}: {
    readonly externalFirms: readonly ExternalFirmName[];
    readonly firmColumns: EngagementFirmColumns;
    readonly onDismiss: () => void;
    readonly sentLiveOn: string;
}) {
    const utilities = api.useUtils();
    const firmLabel = firmKeyLabel(firmKeyOf(firmColumns), externalFirms);
    const engagementMutation = api.propAccounts.firmEngagement.set.useMutation(
        {
            onError: (error) => {
                toast.error(error.message);
            },
            onSuccess: () => {
                toast.success(`${firmLabel} marked sent live`);
                onDismiss();
                return utilities.propAccounts.invalidate();
            },
        },
    );

    return (
        <Alert className="mt-4">
            <Info />
            <AlertTitle>Mark {firmLabel} as sent live?</AlertTitle>
            <AlertDescription>
                <p>
                    This account just moved live at {firmLabel}. Recording the
                    firm as &quot;Retired: sent live&quot; flags any other
                    account you still simulate there.
                </p>
                <div className="mt-2 flex flex-wrap gap-2">
                    <Button
                        disabled={engagementMutation.isPending}
                        onClick={() => {
                            engagementMutation.mutate({
                                ...firmColumns,
                                note: null,
                                reason: FirmEngagementReason.SentLive,
                                sentLiveOn,
                                sinceOn: sentLiveOn,
                                status: FirmEngagementStatus.Retired,
                            });
                        }}
                        size="sm"
                        type="button"
                    >
                        Mark {firmLabel} sent live
                    </Button>
                    <Button
                        onClick={onDismiss}
                        size="sm"
                        type="button"
                        variant="ghost"
                    >
                        Not now
                    </Button>
                </div>
            </AlertDescription>
        </Alert>
    );
}

function previewKey(preview: EventPreview): string {
    return [preview.title, ...preview.lines].join('\n');
}
