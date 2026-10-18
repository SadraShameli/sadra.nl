'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { TriangleAlert } from 'lucide-react';
import { useId, useMemo, useState } from 'react';
import { Controller, useForm, useWatch } from 'react-hook-form';
import { toast } from 'sonner';
import { z } from 'zod';

import {
    useFollowToday,
    useTodayIsoDate,
} from '~/app/(app)/prop-calculator/_components/useTodayIsoDate';
import {
    ACCOUNT_LIST_INPUT,
    type AccountListAccount,
} from '~/app/(app)/prop-calculator/accounts/_components/accountListFilters';
import { accountEventKindLabel } from '~/app/(app)/prop-calculator/accounts/_components/overview/overviewModel';
import { InfoNote } from '~/components/InfoNote';
import { StatusRow, StatusTone } from '~/components/StatusRow';
import { CheckboxCard } from '~/components/ToggleCard';
import { Alert, AlertDescription, AlertTitle } from '~/components/ui/alert';
import { Button } from '~/components/ui/button';
import {
    Field,
    FieldDescription,
    FieldError,
    FieldLabel,
} from '~/components/ui/field';
import { IsoDatePicker } from '~/components/ui/iso-date-picker';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '~/components/ui/select';
import { Textarea } from '~/components/ui/textarea';
import { formatDisplayDate } from '~/lib/format';
import {
    AccountEventKind,
    type AccountLifecycleState,
    AccountTracking,
    BustCause,
    bustCauseLabel,
    type ExternalFirmName,
    FirmEngagementReason,
    FirmEngagementStatus,
    firmKeyLabel,
    firmKeyOf,
    type PlanLifecycleFacts,
} from '~/lib/prop-accounts';
import { type FirmId, parseFirmId } from '~/lib/prop-calculator';
import { eventRecordSchema } from '~/lib/schemas/propAccounts';
import { api, type RouterOutputs } from '~/trpc/react';

import { type ListQuery, ListQueryStatus } from './DetailParts';
import {
    type EventOption,
    eventOptions,
    type EventPreview,
    type EventPreviewer,
    NO_EVENT_PREVIEW,
} from './eventOptions';
import { nullIfBlank, parsedOrIssues, UNSET_SELECT_VALUE } from './formParsing';
import { liveExclusivityPreviewOf } from './liveExclusivityPreview';

type AccountFirmColumns = Pick<
    RouterOutputs['propAccounts']['account']['get'],
    'externalFirmId' | 'firmId'
>;

type EngagementFirmColumns =
    | { readonly externalFirmId: null; readonly firmId: FirmId }
    | { readonly externalFirmId: string; readonly firmId: null };

type EventRow =
    RouterOutputs['propAccounts']['event']['listForAccount'][number];

const eventFormShape = z.object({
    bustCause: z.enum(BustCause),
    kind: z.union([z.enum(AccountEventKind), z.literal(UNSET_SELECT_VALUE)]),
    note: z.string(),
    occurredOn: z.string(),
});

type EventFormValues = z.input<typeof eventFormShape>;

const EVENT_KIND_REQUIRED_MESSAGE = 'Choose the event to record.';

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
    const rows = query.data;
    const accountQuery = api.propAccounts.account.get.useQuery({
        id: accountId,
    });
    const externalFirmsQuery = api.propAccounts.externalFirm.list.useQuery();
    const accountsQuery =
        api.propAccounts.account.list.useQuery(ACCOUNT_LIST_INPUT);
    const firmColumns = firmColumnsOf(accountQuery.data);
    const externalFirms = externalFirmsQuery.data ?? [];
    const [movedLiveOn, setMovedLiveOn] = useState<null | string>(null);
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
                                    {formatDisplayDate(row.occurredOn)}
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
            {plan !== null && options.length === 0 && (
                <p className="text-sm text-muted-foreground">
                    No lifecycle event applies to this account now.
                </p>
            )}
            {options.length > 0 && (
                <EventForm
                    accountId={accountId}
                    accounts={accountsQuery.data}
                    accountsFailed={accountsQuery.isError}
                    key={options.map((option) => option.kind).join(',')}
                    onFailure={onFailure}
                    onRecorded={(kind, occurredOn) => {
                        setMovedLiveOn(
                            kind === AccountEventKind.MovedLive
                                ? occurredOn
                                : null,
                        );
                    }}
                    options={options}
                    preview={preview}
                />
            )}
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
        </>
    );
}

function EventForm({
    accountId,
    accounts,
    accountsFailed,
    onFailure,
    onRecorded,
    options,
    preview,
}: {
    readonly accountId: string;
    readonly accounts: readonly AccountListAccount[] | undefined;
    readonly accountsFailed: boolean;
    readonly onFailure: (error: unknown) => void;
    readonly onRecorded: (kind: AccountEventKind, occurredOn: string) => void;
    readonly options: readonly EventOption[];
    readonly preview: EventPreviewer;
}) {
    const utilities = api.useUtils();
    const record = api.propAccounts.event.record.useMutation();
    const schema = eventFormSchema(accountId);
    const today = useTodayIsoDate();
    const form = useForm<EventFormValues>({
        defaultValues: {
            bustCause: BustCause.Unknown,
            kind: UNSET_SELECT_VALUE,
            note: '',
            occurredOn: today,
        },
        resolver: zodResolver(schema, undefined, { raw: true }),
    });
    const formId = useId();
    useFollowToday({
        isEnabled: true,
        read: () => form.getValues('occurredOn'),
        today,
        write: (day) => {
            form.resetField('occurredOn', { defaultValue: day });
        },
    });
    const kind = useWatch({ control: form.control, name: 'kind' });
    const isBusted = kind === AccountEventKind.Busted;
    const selected = options.find((option) => option.kind === kind);
    const draft = schema.safeParse(useWatch({ control: form.control }));
    const shown = draft.success ? preview(draft.data) : null;
    const shownKey = shown === null ? null : previewKey(shown);
    const [confirmedKey, setConfirmedKey] = useState<null | string>(null);
    const confirmId = useId();
    const isConfirmed = shownKey !== null && confirmedKey === shownKey;
    const isAwaitingConfirmation =
        shown?.requiresConfirmation === true && !isConfirmed;
    const isMovedLive = kind === AccountEventKind.MovedLive;
    const isAwaitingAccounts =
        isMovedLive && accounts === undefined && !accountsFailed;
    const exclusivity = useMemo(
        () =>
            isMovedLive && accounts !== undefined
                ? liveExclusivityPreviewOf(accounts, accountId)
                : null,
        [accountId, accounts, isMovedLive],
    );
    const exclusivityKey =
        exclusivity === null ? null : exclusivity.confirmedAccountIds.join(',');
    const [suspendedKey, setSuspendedKey] = useState<null | string>(null);
    const suspendId = useId();
    const suspendedIds =
        exclusivity !== null &&
        exclusivityKey !== '' &&
        suspendedKey === exclusivityKey
            ? exclusivity.confirmedAccountIds
            : [];
    const isAwaitingSuspensions =
        exclusivity !== null &&
        exclusivity.confirmedAccountIds.length > 0 &&
        suspendedIds.length === 0;

    const save = async (values: EventFormValues) => {
        const parsed = schema.safeParse(values);
        if (
            isAwaitingConfirmation ||
            isAwaitingAccounts ||
            isAwaitingSuspensions ||
            !parsed.success
        ) {
            return;
        }
        try {
            await record.mutateAsync(
                suspendedIds.length > 0
                    ? {
                          ...parsed.data,
                          confirmedExclusivityAccountIds: [...suspendedIds],
                      }
                    : parsed.data,
            );
            toast.success(
                `${accountEventKindLabel(parsed.data.kind)} recorded`,
            );
            setConfirmedKey(null);
            setSuspendedKey(null);
            onRecorded(parsed.data.kind, parsed.data.occurredOn);
            form.reset({
                bustCause: BustCause.Unknown,
                kind: UNSET_SELECT_VALUE,
                note: '',
                occurredOn: today,
            });
        } catch (error) {
            onFailure(error);
        } finally {
            await utilities.propAccounts.invalidate();
        }
    };

    return (
        <form
            aria-label="Record an event"
            className="grid gap-4 md:grid-cols-2"
            noValidate
            onSubmit={(event) => {
                void form.handleSubmit(save)(event);
            }}
        >
            <Controller
                control={form.control}
                name="kind"
                render={({ field, fieldState }) => (
                    <Field data-invalid={fieldState.invalid}>
                        <FieldLabel htmlFor={`${formId}-kind`}>
                            Event
                        </FieldLabel>
                        <Select
                            onValueChange={(next) => {
                                const nextKind = z
                                    .enum(AccountEventKind)
                                    .safeParse(next).data;
                                const option = options.find(
                                    (candidate) => candidate.kind === nextKind,
                                );
                                if (option !== undefined) {
                                    field.onChange(option.kind);
                                }
                            }}
                            value={field.value}
                        >
                            <SelectTrigger
                                aria-invalid={fieldState.invalid}
                                id={`${formId}-kind`}
                                ref={field.ref}
                            >
                                <SelectValue placeholder="Choose an event" />
                            </SelectTrigger>
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
                        <FieldDescription>
                            Only events the account&apos;s current stage and
                            status allow are offered.
                        </FieldDescription>
                        <FieldError errors={[fieldState.error]} />
                    </Field>
                )}
            />
            {isBusted && (
                <Controller
                    control={form.control}
                    name="bustCause"
                    render={({ field, fieldState }) => (
                        <Field data-invalid={fieldState.invalid}>
                            <FieldLabel htmlFor={`${formId}-bustCause`}>
                                Bust cause
                            </FieldLabel>
                            <Select
                                onValueChange={(next) => {
                                    const parsed = z
                                        .enum(BustCause)
                                        .safeParse(next).data;
                                    if (parsed !== undefined) {
                                        field.onChange(parsed);
                                    }
                                }}
                                value={field.value}
                            >
                                <SelectTrigger
                                    aria-invalid={fieldState.invalid}
                                    id={`${formId}-bustCause`}
                                    ref={field.ref}
                                >
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    {Object.values(BustCause).map((cause) => (
                                        <SelectItem key={cause} value={cause}>
                                            {bustCauseLabel(cause)}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                            <FieldError errors={[fieldState.error]} />
                        </Field>
                    )}
                />
            )}
            <Controller
                control={form.control}
                name="occurredOn"
                render={({ field, fieldState }) => (
                    <Field data-invalid={fieldState.invalid}>
                        <FieldLabel htmlFor={`${formId}-occurredOn`}>
                            Date
                        </FieldLabel>
                        <IsoDatePicker
                            aria-invalid={fieldState.invalid}
                            id={`${formId}-occurredOn`}
                            {...field}
                        />
                        <FieldError errors={[fieldState.error]} />
                    </Field>
                )}
            />
            <Controller
                control={form.control}
                name="note"
                render={({ field, fieldState }) => (
                    <Field
                        className="md:col-span-2"
                        data-invalid={fieldState.invalid}
                    >
                        <FieldLabel htmlFor={`${formId}-note`}>Note</FieldLabel>
                        <Textarea
                            aria-invalid={fieldState.invalid}
                            id={`${formId}-note`}
                            rows={2}
                            {...field}
                        />
                        {selected?.requiresNote === true && (
                            <FieldDescription>
                                Say why the firm reversed the bust.
                            </FieldDescription>
                        )}
                        <FieldError errors={[fieldState.error]} />
                    </Field>
                )}
            />
            {shown !== null && (
                <StatusRow
                    className="md:col-span-2"
                    detail={<LineSpans lines={shown.lines} />}
                    title={shown.title}
                    tone={
                        shown.requiresConfirmation
                            ? StatusTone.Warn
                            : StatusTone.Neutral
                    }
                />
            )}
            {isAwaitingAccounts && (
                <InfoNote className="md:col-span-2">
                    Loading your other accounts. What the firm&apos;s rules do
                    to your other accounts when this one goes live is shown once
                    they are loaded; recording waits until then.
                </InfoNote>
            )}
            {isMovedLive && accountsFailed && (
                <Alert className="md:col-span-2" variant="destructive">
                    <TriangleAlert />
                    <AlertTitle>Other accounts not loaded</AlertTitle>
                    <AlertDescription>
                        Your other accounts could not be loaded, so what the
                        firm&apos;s rules do to them is not shown. Recording
                        this event is refused if the firm&apos;s policy suspends
                        another of your accounts; reload to see which.
                    </AlertDescription>
                </Alert>
            )}
            {exclusivity !== null && (
                <StatusRow
                    className="md:col-span-2"
                    detail={<LineSpans lines={exclusivity.lines} />}
                    title={exclusivity.title}
                    tone={
                        exclusivity.effects.length === 0
                            ? StatusTone.Neutral
                            : StatusTone.Warn
                    }
                />
            )}
            {exclusivity !== null &&
                exclusivity.confirmedAccountIds.length > 0 && (
                    <CheckboxCard
                        checked={suspendedIds.length > 0}
                        className="md:col-span-2"
                        id={suspendId}
                        label="Suspend these accounts when recording"
                        onCheckedChange={(isChecked) => {
                            setSuspendedKey(isChecked ? exclusivityKey : null);
                        }}
                    />
                )}
            {isAwaitingSuspensions && (
                <p className="text-sm text-muted-foreground md:col-span-2">
                    Confirm the accounts the firm suspends before recording this
                    move live; recording without them is refused.
                </p>
            )}
            {shown?.requiresConfirmation === true && (
                <CheckboxCard
                    checked={isConfirmed}
                    className="md:col-span-2"
                    id={confirmId}
                    label="I have read what recording this event changes"
                    onCheckedChange={(isChecked) => {
                        setConfirmedKey(isChecked ? shownKey : null);
                    }}
                />
            )}
            <div className="md:col-span-2">
                <Button
                    disabled={
                        record.isPending ||
                        isAwaitingConfirmation ||
                        isAwaitingAccounts ||
                        isAwaitingSuspensions
                    }
                    type="submit"
                >
                    Record event
                </Button>
            </div>
        </form>
    );
}

function eventFormSchema(accountId: string) {
    return eventFormShape.transform((values, context) => {
        if (values.kind === UNSET_SELECT_VALUE) {
            context.addIssue({
                code: 'custom',
                message: EVENT_KIND_REQUIRED_MESSAGE,
                path: ['kind'],
            });
            return z.NEVER;
        }
        const parsed = eventRecordSchema.safeParse({
            accountId,
            bustCause:
                values.kind === AccountEventKind.Busted
                    ? values.bustCause
                    : undefined,
            kind: values.kind,
            note: nullIfBlank(values.note),
            occurredOn: values.occurredOn,
        });
        return parsedOrIssues(parsed, context);
    });
}

function firmColumnsOf(
    data: AccountFirmColumns | undefined,
): EngagementFirmColumns | null {
    if (data === undefined) return null;
    const { externalFirmId, firmId } = data;
    if (firmId !== null && externalFirmId === null) {
        const parsed = parseFirmId(firmId);
        return parsed === undefined
            ? null
            : { externalFirmId: null, firmId: parsed };
    }
    return externalFirmId !== null && firmId === null
        ? { externalFirmId, firmId: null }
        : null;
}

function LineSpans({ lines }: { readonly lines: readonly string[] }) {
    return lines.map((line) => (
        <span className="block" key={line}>
            {line}
        </span>
    ));
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
    const engagementMutation = api.propAccounts.firmEngagement.set.useMutation({
        onError: (error) => {
            toast.error(error.message);
        },
        onSuccess: () => {
            toast.success(`${firmLabel} marked sent live`);
            onDismiss();
            return utilities.propAccounts.invalidate();
        },
    });

    return (
        <StatusRow
            actions={
                <>
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
                </>
            }
            className="mt-4"
            detail={`This account just moved live at ${firmLabel}. Recording the firm as "Retired: sent live" flags any other account you still simulate there.`}
            title={`Mark ${firmLabel} as sent live?`}
            tone={StatusTone.Neutral}
        />
    );
}

function previewKey(preview: EventPreview): string {
    return [preview.title, ...preview.lines].join('\n');
}
