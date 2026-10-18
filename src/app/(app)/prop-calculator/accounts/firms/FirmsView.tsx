'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { Building2, Pencil } from 'lucide-react';
import { useId, useMemo, useState } from 'react';
import { Controller, useForm, useWatch } from 'react-hook-form';
import { toast } from 'sonner';
import { z } from 'zod';

import type { propFirmEngagementOutputSchema } from '~/lib/schemas/propRecordOutputs';

import { ACCOUNT_LIST_INPUT } from '~/app/(app)/prop-calculator/accounts/_components/accountListFilters';
import { FirmsSkeleton } from '~/app/(app)/prop-calculator/accounts/_components/AccountsSkeleton';
import {
    nullIfBlank,
    parsedOrIssues,
} from '~/app/(app)/prop-calculator/accounts/_components/detail/formParsing';
import {
    EVENT_LIST_INPUT,
    LEDGER_LIST_INPUT,
} from '~/app/(app)/prop-calculator/accounts/_components/overview/overviewModel';
import {
    EngagementsErrorNotice,
    JournalErrorNotice,
    QueryErrorNotice,
    RulebookErrorNotice,
    UnlistedFirmsErrorNotice,
} from '~/app/(app)/prop-calculator/accounts/_components/QueryErrorNotice';
import { sentenceOf } from '~/app/(app)/prop-calculator/accounts/_components/sentenceText';
import { FormDialog } from '~/components/FormDialog';
import { MissingValue } from '~/components/MissingValue';
import { RowActionKind, rowActionsColumn } from '~/components/RowActionsMenu';
import { ToolPanel } from '~/components/ToolPanel';
import { Badge } from '~/components/ui/badge';
import { DataTable, DataTableAlign } from '~/components/ui/data-table';
import { Dialog } from '~/components/ui/dialog';
import { EmptyState, EmptyStateSize } from '~/components/ui/empty-state';
import { Field, FieldError, FieldLabel } from '~/components/ui/field';
import { IsoDatePicker } from '~/components/ui/iso-date-picker';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '~/components/ui/select';
import { Skeleton } from '~/components/ui/skeleton';
import { useSession } from '~/lib/auth/client';
import { formatDisplayDate, formatPercent } from '~/lib/format';
import {
    type ExternalFirmName,
    type FirmColumns,
    FirmEngagementReason,
    firmEngagementReasonLabel,
    FirmEngagementStatus,
    firmEngagementStatusLabel,
    type FirmKey,
    firmKeyId,
    FirmKeyKind,
    firmKeyLabel,
    PortfolioLedger,
    todayIsoDate,
} from '~/lib/prop-accounts';
import {
    SCALE_GATE_STATUS_TEXT,
    type ScaleGate,
    ScaleGateStatus,
    ScaleGateUnmetCondition,
} from '~/lib/prop-accounts/bankroll';
import { ALL_JOURNAL_DAYS } from '~/lib/prop-accounts/edge';
import {
    firmEngagementFor,
    type FirmLiveTransferRate,
    type FirmRosterEntry,
    type LiveTransferRateUnavailable,
    liveTransferUnavailableText,
} from '~/lib/prop-accounts/firms';
import { type SampledEstimate } from '~/lib/prop-accounts/metrics';
import { DEFAULT_RULEBOOK } from '~/lib/prop-calculator/advisor';
import { firmEngagementSetSchema } from '~/lib/schemas/propAccounts';
import { api } from '~/trpc/react';

import { firmsModelOf } from './firmsModel';

enum FirmRosterColumn {
    Active = 'active',
    Firm = 'firm',
    FirstPurchase = 'first-purchase',
    LastActivity = 'last-activity',
    Lifetime = 'lifetime',
    MovedLive = 'moved-live',
    Status = 'status',
    TransferRate = 'transfer-rate',
}

type FirmEngagementRow = z.infer<typeof propFirmEngagementOutputSchema>;

const EMPTY_EXTERNAL_FIRMS: readonly ExternalFirmName[] = [];
const EMPTY_ENGAGEMENTS: readonly FirmEngagementRow[] = [];

const SCALE_GATE_UNMET_LABEL: Readonly<
    Record<ScaleGateUnmetCondition, string>
> = {
    [ScaleGateUnmetCondition.CohortMultipleNotAboveOne]:
        'Purchase-cohort multiple is not above 1',
    [ScaleGateUnmetCondition.CohortSampleBelowThreshold]:
        'Ended-account sample is below your threshold',
    [ScaleGateUnmetCondition.EvalAttemptsBelowThreshold]:
        'Eval attempts are below your threshold',
    [ScaleGateUnmetCondition.FundedAccountsBelowThreshold]:
        'Funded accounts are below your threshold',
    [ScaleGateUnmetCondition.PooledNetNotBeyondNoise]:
        'Pooled net per slot is not beyond noise',
    [ScaleGateUnmetCondition.TradesBelowThreshold]:
        'Journal trades are below your threshold',
};

const firmStatusFormShape = z.object({
    reason: z.enum(FirmEngagementReason),
    sentLiveOn: z.string(),
    sinceOn: z.string(),
    status: z.enum(FirmEngagementStatus),
});

type FirmStatusFormValues = z.infer<typeof firmStatusFormShape>;

export function FirmsView() {
    const session = useSession();
    const accountsQuery =
        api.propAccounts.account.list.useQuery(ACCOUNT_LIST_INPUT);
    const eventsQuery = api.propAccounts.event.list.useQuery(EVENT_LIST_INPUT);
    const feesQuery = api.propAccounts.fee.list.useQuery(LEDGER_LIST_INPUT);
    const payoutsQuery =
        api.propAccounts.payout.list.useQuery(LEDGER_LIST_INPUT);
    const externalFirmsQuery = api.propAccounts.externalFirm.list.useQuery();
    const engagementsQuery = api.propAccounts.firmEngagement.list.useQuery();
    const rulebookQuery = api.propAccounts.rulebook.get.useQuery();
    const edgeQuery = api.propAccounts.edge.summary.useQuery(ALL_JOURNAL_DAYS);

    const externalFirms = externalFirmsQuery.data ?? EMPTY_EXTERNAL_FIRMS;
    const engagements = engagementsQuery.data ?? EMPTY_ENGAGEMENTS;
    const areEngagementsUnavailable =
        engagementsQuery.isError && engagementsQuery.data === undefined;
    const areEngagementsLoading = engagementsQuery.isPending;
    const canEditEngagement =
        !areEngagementsUnavailable && !areEngagementsLoading;
    const rulebook = rulebookQuery.data ?? DEFAULT_RULEBOOK;
    const trades = edgeQuery.data?.summary.sampleSize ?? 0;
    const isScaleGateLoading = rulebookQuery.isPending || edgeQuery.isPending;
    const [editing, setEditing] = useState<FirmRosterEntry | null>(null);

    const model = useMemo(() => {
        if (
            session.data?.user.id === undefined ||
            accountsQuery.data === undefined ||
            eventsQuery.data === undefined ||
            feesQuery.data === undefined ||
            payoutsQuery.data === undefined
        ) {
            return null;
        }
        const ledger = PortfolioLedger.fromRows(session.data.user.id, {
            accounts: accountsQuery.data,
            events: eventsQuery.data,
            fees: feesQuery.data,
            firmEngagements: engagements,
            payouts: payoutsQuery.data,
        });
        return firmsModelOf({
            asOf: todayIsoDate(new Date()),
            ledger,
            thresholds: rulebook.samples,
            trades,
        });
    }, [
        accountsQuery.data,
        engagements,
        eventsQuery.data,
        feesQuery.data,
        payoutsQuery.data,
        rulebook,
        session.data?.user.id,
        trades,
    ]);

    if (model === null) {
        const failed = [
            accountsQuery,
            eventsQuery,
            feesQuery,
            payoutsQuery,
        ].find((query) => query.isError);
        if (failed?.error) {
            return (
                <QueryErrorNotice
                    message={failed.error.message}
                    title="The firms page could not be loaded"
                />
            );
        }
        return <FirmsSkeleton />;
    }

    return (
        <div className="flex flex-col gap-6">
            {externalFirmsQuery.isError &&
                externalFirmsQuery.data === undefined && (
                    <UnlistedFirmsErrorNotice
                        message={externalFirmsQuery.error.message}
                    />
                )}
            {engagementsQuery.isError &&
                engagementsQuery.data === undefined && (
                    <EngagementsErrorNotice
                        message={engagementsQuery.error.message}
                    />
                )}
            {areEngagementsLoading && (
                <p className="text-xs text-muted-foreground">
                    Your firm statuses are still loading, so saving is disabled
                    until they load.
                </p>
            )}
            {rulebookQuery.isError && rulebookQuery.data === undefined && (
                <RulebookErrorNotice message={rulebookQuery.error.message} />
            )}
            {edgeQuery.isError && edgeQuery.data === undefined && (
                <JournalErrorNotice message={edgeQuery.error.message} />
            )}
            <ScaleGateCard
                isLoading={isScaleGateLoading}
                scaleGate={model.scaleGate}
            />
            <ToolPanel title="Firm roster">
                {model.roster.firms.length === 0 ? (
                    <EmptyState
                        description="A firm appears here once you add an account at it."
                        icon={Building2}
                        size={EmptyStateSize.Compact}
                        title="No firms yet"
                    />
                ) : (
                    <DataTable
                        columns={[
                            {
                                cell: ({ row: { original: entry } }) =>
                                    firmKeyLabel(entry.firmKey, externalFirms),
                                header: 'Firm',
                                id: FirmRosterColumn.Firm,
                                meta: { isRowHeader: true },
                            },
                            {
                                cell: ({ row: { original: entry } }) => (
                                    <FirmStatusCell
                                        entry={entry}
                                        existingEngagement={firmEngagementFor(
                                            entry.firmKey,
                                            engagements,
                                        )}
                                    />
                                ),
                                header: 'Status',
                                id: FirmRosterColumn.Status,
                            },
                            {
                                cell: ({ row: { original: entry } }) =>
                                    entry.lifetimeAccounts,
                                header: 'Lifetime',
                                id: FirmRosterColumn.Lifetime,
                                meta: { align: DataTableAlign.End },
                            },
                            {
                                cell: ({ row: { original: entry } }) =>
                                    entry.activeAccounts,
                                header: 'Active',
                                id: FirmRosterColumn.Active,
                                meta: { align: DataTableAlign.End },
                            },
                            {
                                cell: ({ row: { original: entry } }) =>
                                    entry.movedLiveCount,
                                header: 'Moved live',
                                id: FirmRosterColumn.MovedLive,
                                meta: { align: DataTableAlign.End },
                            },
                            {
                                cell: ({ row: { original: entry } }) =>
                                    entry.firstPurchaseOn === null ? (
                                        <MissingValue />
                                    ) : (
                                        formatDisplayDate(entry.firstPurchaseOn)
                                    ),
                                header: 'First purchase',
                                id: FirmRosterColumn.FirstPurchase,
                            },
                            {
                                cell: ({ row: { original: entry } }) =>
                                    entry.lastActivityOn === null ? (
                                        <MissingValue />
                                    ) : (
                                        formatDisplayDate(entry.lastActivityOn)
                                    ),
                                header: 'Last activity',
                                id: FirmRosterColumn.LastActivity,
                            },
                            {
                                cell: ({ row: { original: entry } }) => (
                                    <TransferRateCell
                                        transferRate={transferRateFor(
                                            entry.firmKey,
                                            model.transferRate.perFirm,
                                        )}
                                    />
                                ),
                                header: 'Live-transfer rate',
                                id: FirmRosterColumn.TransferRate,
                            },
                            rowActionsColumn<FirmRosterEntry>({
                                actionsOf: (entry) => [
                                    {
                                        icon: Pencil,
                                        kind: RowActionKind.Select,
                                        label: 'Change status',
                                        onSelect: () => {
                                            setEditing(entry);
                                        },
                                    },
                                ],
                                labelOf: (entry) =>
                                    firmKeyLabel(entry.firmKey, externalFirms),
                            }),
                        ]}
                        data={[...model.roster.firms]}
                        isSortable={false}
                        pageSize={null}
                        rowId={(entry) => firmKeyId(entry.firmKey)}
                    />
                )}
            </ToolPanel>
            <Dialog
                onOpenChange={(isOpen) => {
                    if (!isOpen) setEditing(null);
                }}
                open={editing !== null}
            >
                {editing !== null && (
                    <FirmStatusForm
                        canEditEngagement={canEditEngagement}
                        entry={editing}
                        existingEngagement={firmEngagementFor(
                            editing.firmKey,
                            engagements,
                        )}
                        firmLabel={firmKeyLabel(editing.firmKey, externalFirms)}
                        key={String(canEditEngagement)}
                        onClose={() => {
                            setEditing(null);
                        }}
                    />
                )}
            </Dialog>
        </div>
    );
}

function firmColumnsFromKey(key: FirmKey): FirmColumns {
    return key.kind === FirmKeyKind.External
        ? { externalFirmId: key.externalFirmId, firmId: null }
        : { externalFirmId: null, firmId: key.firmId };
}

function FirmStatusCell({
    entry,
    existingEngagement,
}: {
    readonly entry: FirmRosterEntry;
    readonly existingEngagement: FirmEngagementRow | null;
}) {
    const status = existingEngagement?.status ?? FirmEngagementStatus.Active;
    const sinceOn = existingEngagement?.sinceOn ?? entry.firstPurchaseOn;
    return (
        <div className="flex flex-wrap items-center gap-2">
            <Badge>{firmEngagementStatusLabel(status)}</Badge>
            {sinceOn !== null && (
                <span className="font-mono text-xs whitespace-nowrap text-muted-foreground tabular-nums">
                    since {formatDisplayDate(sinceOn)}
                </span>
            )}
        </div>
    );
}

function FirmStatusForm({
    canEditEngagement,
    entry,
    existingEngagement,
    firmLabel,
    onClose,
}: {
    readonly canEditEngagement: boolean;
    readonly entry: FirmRosterEntry;
    readonly existingEngagement: FirmEngagementRow | null;
    readonly firmLabel: string;
    readonly onClose: () => void;
}) {
    const utilities = api.useUtils();
    const set = api.propAccounts.firmEngagement.set.useMutation();
    const schema = firmStatusSchema(
        entry.firmKey,
        existingEngagement?.note ?? null,
    );
    const form = useForm<FirmStatusFormValues>({
        defaultValues: {
            reason: existingEngagement?.reason ?? FirmEngagementReason.Other,
            sentLiveOn: existingEngagement?.sentLiveOn ?? '',
            sinceOn:
                existingEngagement?.sinceOn ??
                entry.firstPurchaseOn ??
                todayIsoDate(new Date()),
            status: existingEngagement?.status ?? FirmEngagementStatus.Active,
        },
        resolver: zodResolver(schema, undefined, { raw: true }),
    });
    const formId = useId();
    const status = useWatch({ control: form.control, name: 'status' });
    const reason = useWatch({ control: form.control, name: 'reason' });

    const save = async (values: FirmStatusFormValues) => {
        if (!canEditEngagement) return;
        const parsed = schema.safeParse(values);
        if (!parsed.success) return;
        try {
            await set.mutateAsync(parsed.data);
            toast.success(
                `${firmEngagementStatusLabel(parsed.data.status)} saved`,
            );
            onClose();
        } catch (error) {
            toast.error(
                error instanceof Error ? error.message : 'Could not save',
            );
        } finally {
            await utilities.propAccounts.invalidate();
        }
    };

    return (
        <FormDialog
            description="Whether you are still buying accounts at this firm, and since when."
            form={form}
            onCancel={onClose}
            onSubmit={save}
            pending={set.isPending || form.formState.isSubmitting}
            submitDisabled={!canEditEngagement}
            submitLabel="Save"
            title={firmLabel}
        >
            <Controller
                control={form.control}
                name="status"
                render={({ field, fieldState }) => (
                    <Field data-invalid={fieldState.invalid}>
                        <FieldLabel htmlFor={`${formId}-status`}>
                            Status
                        </FieldLabel>
                        <Select
                            disabled={!canEditEngagement}
                            onValueChange={field.onChange}
                            value={field.value}
                        >
                            <SelectTrigger
                                aria-invalid={fieldState.invalid}
                                id={`${formId}-status`}
                                ref={field.ref}
                            >
                                <SelectValue>
                                    {firmEngagementStatusLabel(field.value)}
                                </SelectValue>
                            </SelectTrigger>
                            <SelectContent>
                                {Object.values(FirmEngagementStatus).map(
                                    (value) => (
                                        <SelectItem key={value} value={value}>
                                            {firmEngagementStatusLabel(value)}
                                        </SelectItem>
                                    ),
                                )}
                            </SelectContent>
                        </Select>
                        <FieldError errors={[fieldState.error]} />
                    </Field>
                )}
            />
            {status !== FirmEngagementStatus.Active && (
                <Controller
                    control={form.control}
                    name="reason"
                    render={({ field, fieldState }) => (
                        <Field data-invalid={fieldState.invalid}>
                            <FieldLabel htmlFor={`${formId}-reason`}>
                                Reason
                            </FieldLabel>
                            <Select
                                disabled={!canEditEngagement}
                                onValueChange={field.onChange}
                                value={field.value}
                            >
                                <SelectTrigger
                                    aria-invalid={fieldState.invalid}
                                    id={`${formId}-reason`}
                                    ref={field.ref}
                                >
                                    <SelectValue>
                                        {firmEngagementReasonLabel(field.value)}
                                    </SelectValue>
                                </SelectTrigger>
                                <SelectContent>
                                    {Object.values(FirmEngagementReason).map(
                                        (value) => (
                                            <SelectItem
                                                key={value}
                                                value={value}
                                            >
                                                {firmEngagementReasonLabel(
                                                    value,
                                                )}
                                            </SelectItem>
                                        ),
                                    )}
                                </SelectContent>
                            </Select>
                            <FieldError errors={[fieldState.error]} />
                        </Field>
                    )}
                />
            )}
            {status !== FirmEngagementStatus.Active &&
                reason === FirmEngagementReason.SentLive && (
                    <Controller
                        control={form.control}
                        name="sentLiveOn"
                        render={({ field, fieldState }) => (
                            <Field data-invalid={fieldState.invalid}>
                                <FieldLabel htmlFor={`${formId}-sentLiveOn`}>
                                    Sent live on
                                </FieldLabel>
                                <IsoDatePicker
                                    aria-invalid={fieldState.invalid}
                                    disabled={!canEditEngagement}
                                    id={`${formId}-sentLiveOn`}
                                    {...field}
                                />
                                <FieldError errors={[fieldState.error]} />
                            </Field>
                        )}
                    />
                )}
            <Controller
                control={form.control}
                name="sinceOn"
                render={({ field, fieldState }) => (
                    <Field data-invalid={fieldState.invalid}>
                        <FieldLabel htmlFor={`${formId}-sinceOn`}>
                            Since
                        </FieldLabel>
                        <IsoDatePicker
                            aria-invalid={fieldState.invalid}
                            disabled={!canEditEngagement}
                            id={`${formId}-sinceOn`}
                            {...field}
                        />
                        <FieldError errors={[fieldState.error]} />
                    </Field>
                )}
            />
        </FormDialog>
    );
}

function firmStatusSchema(firmKey: FirmKey, existingNote: null | string) {
    return firmStatusFormShape.transform((values, context) => {
        const status = values.status;
        const reason =
            status === FirmEngagementStatus.Active ? null : values.reason;
        const sentLiveOn =
            reason === FirmEngagementReason.SentLive
                ? nullIfBlank(values.sentLiveOn)
                : null;
        const parsed = firmEngagementSetSchema.safeParse({
            ...firmColumnsFromKey(firmKey),
            note: existingNote,
            reason,
            sentLiveOn,
            sinceOn: values.sinceOn,
            status,
        });
        return parsedOrIssues(parsed, context);
    });
}

function formatRate(estimate: SampledEstimate): string {
    const interval =
        estimate.interval === null
            ? ''
            : ` (95% CI ${formatPercent(estimate.interval.lower)} to ${formatPercent(estimate.interval.upper)})`;
    return `${formatPercent(estimate.value)}${interval}, n = ${String(estimate.n)}`;
}

function ScaleGateCard({
    isLoading,
    scaleGate,
}: {
    readonly isLoading: boolean;
    readonly scaleGate: ScaleGate;
}) {
    return (
        <ToolPanel
            actions={
                isLoading ? undefined : (
                    <Badge>{SCALE_GATE_STATUS_TEXT[scaleGate.status]}</Badge>
                )
            }
            isComputing={isLoading}
            title="Scale gate"
        >
            {isLoading ? (
                <Skeleton className="h-5 w-full max-w-md" />
            ) : scaleGate.status === ScaleGateStatus.ThresholdsNotSet ? (
                <p className="text-sm text-muted-foreground">
                    Set your sample thresholds on the rulebook to see whether
                    you are ready to scale.
                </p>
            ) : scaleGate.unmetConditions.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                    Every scale-gate condition is met.
                </p>
            ) : (
                <ul className="list-disc pl-5 text-sm text-muted-foreground">
                    {scaleGate.unmetConditions.map((condition) => (
                        <li key={condition}>
                            {SCALE_GATE_UNMET_LABEL[condition]}
                        </li>
                    ))}
                </ul>
            )}
        </ToolPanel>
    );
}

function TransferRateCell({
    transferRate,
}: {
    readonly transferRate: FirmLiveTransferRate | null;
}) {
    return (
        <>
            <div>
                <TransferRateLine
                    basis="per paid payout"
                    estimate={transferRate?.perPaidPayout ?? null}
                    rate={transferRate}
                    unavailable={transferRate?.perPaidPayoutUnavailable ?? null}
                />
            </div>
            <div className="text-xs text-muted-foreground">
                <TransferRateLine
                    basis="per funded account-month"
                    estimate={transferRate?.perFundedAccountMonth ?? null}
                    rate={transferRate}
                    unavailable={
                        transferRate?.perFundedAccountMonthUnavailable ?? null
                    }
                />
            </div>
        </>
    );
}

function transferRateFor(
    firmKey: FirmKey,
    perFirm: readonly FirmLiveTransferRate[],
): FirmLiveTransferRate | null {
    const targetKey = firmKeyId(firmKey);
    return (
        perFirm.find((rate) => firmKeyId(rate.firmKey) === targetKey) ?? null
    );
}

function TransferRateLine({
    basis,
    estimate,
    rate,
    unavailable,
}: {
    readonly basis: string;
    readonly estimate: null | SampledEstimate;
    readonly rate: FirmLiveTransferRate | null;
    readonly unavailable: LiveTransferRateUnavailable | null;
}) {
    if (estimate !== null) return <>{`${formatRate(estimate)} ${basis}`}</>;
    return (
        <MissingValue
            reason={
                rate === null || unavailable === null
                    ? undefined
                    : sentenceOf(liveTransferUnavailableText(unavailable, rate))
            }
        />
    );
}
