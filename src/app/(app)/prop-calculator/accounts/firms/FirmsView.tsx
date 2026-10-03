'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { TriangleAlert } from 'lucide-react';
import { useMemo } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { toast } from 'sonner';
import { z } from 'zod';

import { ACCOUNT_LIST_INPUT } from '~/app/(app)/prop-calculator/accounts/_components/accountListFilters';
import {
    nullIfBlank,
    parsedOrIssues,
} from '~/app/(app)/prop-calculator/accounts/_components/detail/formParsing';
import {
    EVENT_LIST_INPUT,
    LEDGER_LIST_INPUT,
} from '~/app/(app)/prop-calculator/accounts/_components/overview/overviewModel';
import { SCALE_GATE_STATUS_VARIANT } from '~/app/(app)/prop-calculator/accounts/_components/scaleGateBadge';
import { Alert, AlertDescription, AlertTitle } from '~/components/ui/Alert';
import { Badge } from '~/components/ui/Badge';
import { Button } from '~/components/ui/Button';
import { Card, CardContent, CardHeader, CardTitle } from '~/components/ui/Card';
import {
    Form,
    FormControl,
    FormField,
    FormItem,
    FormLabel,
    FormMessage,
} from '~/components/ui/Form';
import { Input } from '~/components/ui/Input';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '~/components/ui/Select';
import { Skeleton } from '~/components/ui/Skeleton';
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from '~/components/ui/Table';
import { useSession } from '~/lib/auth/client';
import { formatPercent, NOT_APPLICABLE } from '~/lib/format';
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
import { type propFirmEngagementOutputSchema } from '~/lib/schemas/propAccountOutputs';
import { firmEngagementSetSchema } from '~/lib/schemas/propAccounts';
import { api } from '~/trpc/react';

import { firmsModelOf } from './firmsModel';

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
                <Alert variant="destructive">
                    <TriangleAlert />
                    <AlertTitle>The firms page could not be loaded</AlertTitle>
                    <AlertDescription>{failed.error.message}</AlertDescription>
                </Alert>
            );
        }
        return <Skeleton className="h-64 w-full" />;
    }

    return (
        <div className="flex flex-col gap-6">
            {externalFirmsQuery.isError &&
                externalFirmsQuery.data === undefined && (
                    <p className="text-xs text-destructive">
                        Your firms could not be loaded, so external firms show
                        as an unlisted firm until they load:{' '}
                        {externalFirmsQuery.error.message}
                    </p>
                )}
            {engagementsQuery.isError &&
                engagementsQuery.data === undefined && (
                    <p className="text-xs text-destructive">
                        Your firm status could not be loaded, so every firm
                        shows as Active until it loads:{' '}
                        {engagementsQuery.error.message}
                    </p>
                )}
            {areEngagementsLoading && (
                <p className="text-xs text-muted-foreground">
                    Your firm statuses are still loading, so saving is disabled
                    until they load.
                </p>
            )}
            {rulebookQuery.isError && rulebookQuery.data === undefined && (
                <p className="text-xs text-destructive">
                    Your rulebook could not be loaded, so this page is using
                    default thresholds instead of yours:{' '}
                    {rulebookQuery.error.message}
                </p>
            )}
            {edgeQuery.isError && edgeQuery.data === undefined && (
                <p className="text-xs text-destructive">
                    Your journal could not be loaded, so the scale gate treats
                    your trade count as zero: {edgeQuery.error.message}
                </p>
            )}
            <ScaleGateCard
                isLoading={isScaleGateLoading}
                scaleGate={model.scaleGate}
            />
            <Card>
                <CardHeader>
                    <CardTitle>Firm roster</CardTitle>
                </CardHeader>
                <CardContent>
                    {model.roster.firms.length === 0 ? (
                        <p className="text-sm text-muted-foreground">
                            No firms yet. Add an account to see it here.
                        </p>
                    ) : (
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>Firm</TableHead>
                                    <TableHead>Status</TableHead>
                                    <TableHead className="text-right">
                                        Lifetime
                                    </TableHead>
                                    <TableHead className="text-right">
                                        Active
                                    </TableHead>
                                    <TableHead className="text-right">
                                        Moved live
                                    </TableHead>
                                    <TableHead>First purchase</TableHead>
                                    <TableHead>Last activity</TableHead>
                                    <TableHead>Live-transfer rate</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {model.roster.firms.map((entry) => (
                                    <FirmRow
                                        canEditEngagement={canEditEngagement}
                                        entry={entry}
                                        existingEngagement={firmEngagementFor(
                                            entry.firmKey,
                                            engagements,
                                        )}
                                        externalFirms={externalFirms}
                                        key={firmKeyId(entry.firmKey)}
                                        transferRate={transferRateFor(
                                            entry.firmKey,
                                            model.transferRate.perFirm,
                                        )}
                                    />
                                ))}
                            </TableBody>
                        </Table>
                    )}
                </CardContent>
            </Card>
        </div>
    );
}

function firmColumnsFromKey(key: FirmKey): FirmColumns {
    return key.kind === FirmKeyKind.External
        ? { externalFirmId: key.externalFirmId, firmId: null }
        : { externalFirmId: null, firmId: key.firmId };
}

function FirmRow({
    canEditEngagement,
    entry,
    existingEngagement,
    externalFirms,
    transferRate,
}: {
    readonly canEditEngagement: boolean;
    readonly entry: FirmRosterEntry;
    readonly existingEngagement: FirmEngagementRow | null;
    readonly externalFirms: readonly ExternalFirmName[];
    readonly transferRate: FirmLiveTransferRate | null;
}) {
    return (
        <TableRow>
            <TableCell>{firmKeyLabel(entry.firmKey, externalFirms)}</TableCell>
            <TableCell>
                <FirmStatusForm
                    canEditEngagement={canEditEngagement}
                    entry={entry}
                    existingEngagement={existingEngagement}
                    key={`${firmKeyId(entry.firmKey)}:${String(canEditEngagement)}`}
                />
            </TableCell>
            <TableCell className="text-right tabular-nums">
                {entry.lifetimeAccounts}
            </TableCell>
            <TableCell className="text-right tabular-nums">
                {entry.activeAccounts}
            </TableCell>
            <TableCell className="text-right tabular-nums">
                {entry.movedLiveCount}
            </TableCell>
            <TableCell>{entry.firstPurchaseOn ?? NOT_APPLICABLE}</TableCell>
            <TableCell>{entry.lastActivityOn ?? NOT_APPLICABLE}</TableCell>
            <TableCell>
                <div>
                    {transferRateText(
                        transferRate,
                        transferRate?.perPaidPayout ?? null,
                        transferRate?.perPaidPayoutUnavailable ?? null,
                        'per paid payout',
                    )}
                </div>
                <div className="text-xs text-muted-foreground">
                    {transferRateText(
                        transferRate,
                        transferRate?.perFundedAccountMonth ?? null,
                        transferRate?.perFundedAccountMonthUnavailable ?? null,
                        'per funded account-month',
                    )}
                </div>
            </TableCell>
        </TableRow>
    );
}

function FirmStatusForm({
    canEditEngagement,
    entry,
    existingEngagement,
}: {
    readonly canEditEngagement: boolean;
    readonly entry: FirmRosterEntry;
    readonly existingEngagement: FirmEngagementRow | null;
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
        } catch (error) {
            toast.error(
                error instanceof Error ? error.message : 'Could not save',
            );
        } finally {
            await utilities.propAccounts.invalidate();
        }
    };

    return (
        <Form {...form}>
            <form
                aria-label={`Edit status for ${firmKeyId(entry.firmKey)}`}
                className="flex flex-col gap-2"
                noValidate
                onSubmit={(event) => {
                    if (!canEditEngagement) {
                        event.preventDefault();
                        return;
                    }
                    void form.handleSubmit(save)(event);
                }}
            >
                <FormField
                    control={form.control}
                    name="status"
                    render={({ field }) => (
                        <FormItem>
                            <FormLabel>Status</FormLabel>
                            <Select
                                disabled={!canEditEngagement}
                                onValueChange={field.onChange}
                                value={field.value}
                            >
                                <FormControl>
                                    <SelectTrigger ref={field.ref}>
                                        <SelectValue />
                                    </SelectTrigger>
                                </FormControl>
                                <SelectContent>
                                    {Object.values(FirmEngagementStatus).map(
                                        (value) => (
                                            <SelectItem
                                                key={value}
                                                value={value}
                                            >
                                                {firmEngagementStatusLabel(
                                                    value,
                                                )}
                                            </SelectItem>
                                        ),
                                    )}
                                </SelectContent>
                            </Select>
                            <FormMessage />
                        </FormItem>
                    )}
                />
                {status !== FirmEngagementStatus.Active && (
                    <FormField
                        control={form.control}
                        name="reason"
                        render={({ field }) => (
                            <FormItem>
                                <FormLabel>Reason</FormLabel>
                                <Select
                                    disabled={!canEditEngagement}
                                    onValueChange={field.onChange}
                                    value={field.value}
                                >
                                    <FormControl>
                                        <SelectTrigger ref={field.ref}>
                                            <SelectValue />
                                        </SelectTrigger>
                                    </FormControl>
                                    <SelectContent>
                                        {Object.values(
                                            FirmEngagementReason,
                                        ).map((value) => (
                                            <SelectItem
                                                key={value}
                                                value={value}
                                            >
                                                {firmEngagementReasonLabel(
                                                    value,
                                                )}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                                <FormMessage />
                            </FormItem>
                        )}
                    />
                )}
                {status !== FirmEngagementStatus.Active &&
                    reason === FirmEngagementReason.SentLive && (
                        <FormField
                            control={form.control}
                            name="sentLiveOn"
                            render={({ field }) => (
                                <FormItem>
                                    <FormLabel>Sent live on</FormLabel>
                                    <FormControl>
                                        <Input
                                            disabled={!canEditEngagement}
                                            type="date"
                                            {...field}
                                        />
                                    </FormControl>
                                    <FormMessage />
                                </FormItem>
                            )}
                        />
                    )}
                <FormField
                    control={form.control}
                    name="sinceOn"
                    render={({ field }) => (
                        <FormItem>
                            <FormLabel>Since</FormLabel>
                            <FormControl>
                                <Input
                                    disabled={!canEditEngagement}
                                    type="date"
                                    {...field}
                                />
                            </FormControl>
                            <FormMessage />
                        </FormItem>
                    )}
                />
                <Button
                    disabled={
                        set.isPending ||
                        form.formState.isSubmitting ||
                        !canEditEngagement
                    }
                    size="sm"
                    type="submit"
                >
                    Save
                </Button>
            </form>
        </Form>
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
        <Card>
            <CardHeader>
                <CardTitle className="flex items-center gap-2">
                    Scale gate
                    {!isLoading && (
                        <Badge
                            variant={
                                SCALE_GATE_STATUS_VARIANT[scaleGate.status]
                            }
                        >
                            {SCALE_GATE_STATUS_TEXT[scaleGate.status]}
                        </Badge>
                    )}
                </CardTitle>
            </CardHeader>
            <CardContent>
                {isLoading ? (
                    <p className="text-sm text-muted-foreground" role="status">
                        Checking your thresholds and journal
                    </p>
                ) : scaleGate.status === ScaleGateStatus.ThresholdsNotSet ? (
                    <p className="text-sm text-muted-foreground">
                        Set your sample thresholds on the rulebook to see
                        whether you are ready to scale.
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
            </CardContent>
        </Card>
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

function transferRateText(
    rate: FirmLiveTransferRate | null,
    estimate: null | SampledEstimate,
    unavailable: LiveTransferRateUnavailable | null,
    basis: string,
): string {
    if (estimate !== null) return `${formatRate(estimate)} ${basis}`;
    return rate === null || unavailable === null
        ? NOT_APPLICABLE
        : `${NOT_APPLICABLE}: ${liveTransferUnavailableText(unavailable, rate)}`;
}
