'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { Layers } from 'lucide-react';
import { useCallback, useId, useMemo, useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { z } from 'zod';

import { useToolsRequest } from '~/app/(app)/prop-calculator/_components/bankroll/useToolsRequest';
import { ToolsWorkerPhase } from '~/app/(app)/prop-calculator/_components/useToolsWorker';
import { ToolsResponseKind } from '~/app/(app)/prop-calculator/_workers/toolsWorkerMessages';
import { ACCOUNT_LIST_INPUT } from '~/app/(app)/prop-calculator/accounts/_components/accountListFilters';
import { RoundsSkeleton } from '~/app/(app)/prop-calculator/accounts/_components/AccountsSkeleton';
import { parsedOrIssues } from '~/app/(app)/prop-calculator/accounts/_components/detail/formParsing';
import { FigureText } from '~/app/(app)/prop-calculator/accounts/_components/FigureText';
import {
    EVENT_LIST_INPUT,
    LEDGER_LIST_INPUT,
} from '~/app/(app)/prop-calculator/accounts/_components/overview/overviewModel';
import { SampleBadge } from '~/app/(app)/prop-calculator/accounts/_components/overview/SampleBadge';
import {
    QueryErrorNotice,
    RulebookErrorNotice,
    UnlistedFirmsErrorNotice,
} from '~/app/(app)/prop-calculator/accounts/_components/QueryErrorNotice';
import { StatStrip } from '~/components/StatStrip';
import { ToolPanel } from '~/components/ToolPanel';
import { Badge } from '~/components/ui/badge';
import { Button } from '~/components/ui/button';
import { DataTable, DataTableAlign } from '~/components/ui/data-table';
import { EmptyState, EmptyStateSize } from '~/components/ui/empty-state';
import {
    Field,
    FieldDescription,
    FieldError,
    FieldLabel,
} from '~/components/ui/field';
import { Input } from '~/components/ui/input';
import { IsoDatePicker } from '~/components/ui/iso-date-picker';
import {
    Item,
    ItemActions,
    ItemContent,
    ItemDescription,
    ItemGroup,
    ItemTitle,
} from '~/components/ui/item';
import { Progress } from '~/components/ui/progress';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '~/components/ui/select';
import { Skeleton } from '~/components/ui/skeleton';
import { WarningNote } from '~/components/WarningNote';
import { useSession } from '~/lib/auth/client';
import { formatDisplayDate, formatDisplayDateRange } from '~/lib/format';
import {
    EntryTextKind,
    parseMoneyText,
    PortfolioLedger,
    todayIsoDate,
} from '~/lib/prop-accounts';
import { ALL_JOURNAL_DAYS } from '~/lib/prop-accounts/edge';
import { DEFAULT_RULEBOOK } from '~/lib/prop-calculator/advisor';
import { roundCreateSchema } from '~/lib/schemas/propAccounts';
import { stableJson } from '~/lib/stableJson';
import { api } from '~/trpc/react';

import {
    firmColumnsFromSelectValue,
    firmSelectOptions,
    type NextRoundCardModel,
    nextRoundCardModelOf,
    type NextRoundOptionSummary,
    NextRoundRecommendation,
    type NextRoundResultSummary,
    nextRoundResultSummaryOf,
    roundsPageModel,
    type RoundSuggestionRow,
} from './roundsModel';

enum RoundColumn {
    Budget = 'budget',
    Cycle = 'cycle',
    Firm = 'firm',
    InProgress = 'in-progress',
    Label = 'label',
    Net = 'net',
    Payouts = 'payouts',
    PRoundLikeThisNetNegative = 'p-round-like-this-net-negative',
    RealizedMultiple = 'realized-multiple',
    Status = 'status',
    ToDateMultiple = 'to-date-multiple',
}

enum RoundsByFirmColumn {
    Closed = 'closed',
    Firm = 'firm',
    MaxMultiple = 'max-multiple',
    MeanMultiple = 'mean-multiple',
    MinMultiple = 'min-multiple',
    Rounds = 'rounds',
    Sample = 'sample',
    SharePositive = 'share-positive',
}

const EMPTY_EXTERNAL_FIRMS: Parameters<typeof firmSelectOptions>[0] = [];

const roundFormShape = z.object({
    budgetCents: z.string(),
    firmValue: z.string(),
    label: z.string(),
    openedOn: z.string(),
});

type RoundFormValues = z.input<typeof roundFormShape>;

interface RoundPrefill {
    readonly firmValue: string;
    readonly label: string;
    readonly memberAccountIds: readonly string[];
    readonly openedOn: string;
}

export function RoundsView() {
    const session = useSession();
    const accountsQuery =
        api.propAccounts.account.list.useQuery(ACCOUNT_LIST_INPUT);
    const eventsQuery = api.propAccounts.event.list.useQuery(EVENT_LIST_INPUT);
    const feesQuery = api.propAccounts.fee.list.useQuery(LEDGER_LIST_INPUT);
    const payoutsQuery =
        api.propAccounts.payout.list.useQuery(LEDGER_LIST_INPUT);
    const roundsQuery = api.propAccounts.round.list.useQuery();
    const externalFirmsQuery = api.propAccounts.externalFirm.list.useQuery();
    const rulebookQuery = api.propAccounts.rulebook.get.useQuery();
    const bankrollSummaryQuery = api.propAccounts.bankroll.summary.useQuery();
    const edgeQuery = api.propAccounts.edge.summary.useQuery(ALL_JOURNAL_DAYS);
    const [prefill, setPrefill] = useState<null | RoundPrefill>(null);

    const externalFirms = externalFirmsQuery.data ?? EMPTY_EXTERNAL_FIRMS;
    const rulebook = rulebookQuery.data ?? DEFAULT_RULEBOOK;
    const availableCents = bankrollSummaryQuery.data?.availableCents ?? null;
    const trades = edgeQuery.data?.summary.sampleSize ?? 0;

    const ledger = useMemo(() => {
        if (
            session.data?.user.id === undefined ||
            accountsQuery.data === undefined ||
            eventsQuery.data === undefined ||
            feesQuery.data === undefined ||
            payoutsQuery.data === undefined ||
            roundsQuery.data === undefined
        ) {
            return null;
        }
        return PortfolioLedger.fromRows(session.data.user.id, {
            accounts: accountsQuery.data,
            events: eventsQuery.data,
            fees: feesQuery.data,
            payouts: payoutsQuery.data,
            rounds: roundsQuery.data,
        });
    }, [
        accountsQuery.data,
        eventsQuery.data,
        feesQuery.data,
        payoutsQuery.data,
        roundsQuery.data,
        session.data?.user.id,
    ]);

    const model = useMemo(
        () =>
            ledger === null
                ? null
                : roundsPageModel(
                      ledger,
                      rulebook.samples,
                      rulebook.bankroll.roundGapDays,
                      externalFirms,
                      todayIsoDate(new Date()),
                  ),
        [externalFirms, ledger, rulebook],
    );

    const nextRound = useMemo(
        () =>
            ledger === null
                ? null
                : nextRoundCardModelOf({
                      availableCents,
                      ledger,
                      rulebook,
                      runId: 0,
                      today: todayIsoDate(new Date()),
                      trades,
                  }),
        [availableCents, ledger, rulebook, trades],
    );
    const nextRoundRequestKey =
        nextRound === null ? null : stableJson(nextRound.request);
    const buildNextRoundRequest = useCallback(
        (runId: number) =>
            nextRound === null ? null : { ...nextRound.request, runId },
        [nextRound],
    );
    const worker = useToolsRequest(nextRoundRequestKey, buildNextRoundRequest);

    if (model === null) {
        const failed = [
            accountsQuery,
            eventsQuery,
            feesQuery,
            payoutsQuery,
            roundsQuery,
        ].find((query) => query.isError);
        if (failed?.error) {
            return (
                <QueryErrorNotice
                    message={failed.error.message}
                    title="The rounds page could not be loaded"
                />
            );
        }
        return <RoundsSkeleton />;
    }

    const nextRoundResult =
        nextRound !== null &&
        worker.state.phase === ToolsWorkerPhase.Succeeded &&
        worker.state.result.kind === ToolsResponseKind.NextRound
            ? nextRoundResultSummaryOf({
                  dayBudget: nextRound.request.dayBudget,
                  optionABudget: nextRound.request.optionA.startingBankroll,
                  optionAResult: worker.state.result.optionA,
                  optionBBudget: nextRound.request.optionB.startingBankroll,
                  optionBResult: worker.state.result.optionB,
                  scaleGate: nextRound.scaleGate,
              })
            : null;
    const nextRoundFailureReason =
        worker.state.phase === ToolsWorkerPhase.Failed
            ? worker.state.reason
            : null;

    return (
        <div className="flex flex-col gap-6">
            {externalFirmsQuery.isError &&
                externalFirmsQuery.data === undefined && (
                    <UnlistedFirmsErrorNotice
                        message={externalFirmsQuery.error.message}
                    />
                )}
            {rulebookQuery.isError && rulebookQuery.data === undefined && (
                <RulebookErrorNotice message={rulebookQuery.error.message} />
            )}
            {bankrollSummaryQuery.isError &&
                bankrollSummaryQuery.data === undefined && (
                    <QueryErrorNotice
                        consequence={`Option B on the "Next round" card is capped at option A's budget until it loads.`}
                        message={bankrollSummaryQuery.error.message}
                        title="Your available bankroll could not be loaded"
                    />
                )}
            {model.suggestions.length > 0 && (
                <SuggestionsCard
                    onAccept={(row) => {
                        setPrefill({
                            firmValue: row.firmValue,
                            label: row.label,
                            memberAccountIds: row.memberAccountIds,
                            openedOn: row.earliestPurchase,
                        });
                    }}
                    suggestions={model.suggestions}
                />
            )}
            {nextRound !== null && (
                <NextRoundCard
                    failureReason={nextRoundFailureReason}
                    model={nextRound}
                    result={nextRoundResult}
                />
            )}
            {(model.perFirm.length > 0 || model.unassignedRoundCount > 0) && (
                <ToolPanel
                    contentClassName="gap-3"
                    info={
                        model.perFirm.length > 0
                            ? 'Multiples and share positive use closed rounds only; open rounds count in Rounds but not in the spread or its n.'
                            : undefined
                    }
                    title="Rounds by firm"
                >
                    {model.perFirm.length > 0 && (
                        <DataTable
                            aria-label="Rounds by firm"
                            columns={[
                                {
                                    cell: ({ row }) => (
                                        <FigureText text={row.original.firm} />
                                    ),
                                    header: 'Firm',
                                    id: RoundsByFirmColumn.Firm,
                                    meta: { isRowHeader: true },
                                },
                                {
                                    cell: ({ row }) => (
                                        <FigureText
                                            text={row.original.rounds}
                                        />
                                    ),
                                    header: 'Rounds',
                                    id: RoundsByFirmColumn.Rounds,
                                    meta: { align: DataTableAlign.End },
                                },
                                {
                                    cell: ({ row }) => (
                                        <FigureText
                                            text={row.original.closedRounds}
                                        />
                                    ),
                                    header: 'Closed',
                                    id: RoundsByFirmColumn.Closed,
                                    meta: { align: DataTableAlign.End },
                                },
                                {
                                    cell: ({ row }) => (
                                        <FigureText text={row.original.min} />
                                    ),
                                    header: 'Min multiple',
                                    id: RoundsByFirmColumn.MinMultiple,
                                    meta: { align: DataTableAlign.End },
                                },
                                {
                                    cell: ({ row }) => (
                                        <FigureText text={row.original.mean} />
                                    ),
                                    header: 'Mean multiple',
                                    id: RoundsByFirmColumn.MeanMultiple,
                                    meta: { align: DataTableAlign.End },
                                },
                                {
                                    cell: ({ row }) => (
                                        <FigureText text={row.original.max} />
                                    ),
                                    header: 'Max multiple',
                                    id: RoundsByFirmColumn.MaxMultiple,
                                    meta: { align: DataTableAlign.End },
                                },
                                {
                                    cell: ({ row }) => (
                                        <FigureText
                                            text={row.original.sharePositive}
                                        />
                                    ),
                                    header: 'Share positive',
                                    id: RoundsByFirmColumn.SharePositive,
                                    meta: { align: DataTableAlign.End },
                                },
                                {
                                    cell: ({ row }) => (
                                        <>
                                            <SampleBadge
                                                level={row.original.sampleLevel}
                                            />
                                        </>
                                    ),
                                    header: 'Sample',
                                    id: RoundsByFirmColumn.Sample,
                                },
                            ]}
                            data={[...model.perFirm]}
                            isSortable={false}
                            pageSize={null}
                            rowId={(row) => row.key}
                        />
                    )}
                    {model.unassignedRoundCount > 0 && (
                        <p className="text-xs text-muted-foreground">
                            Rounds without a firm: {model.unassignedRoundCount}{' '}
                            (left out of this table)
                        </p>
                    )}
                </ToolPanel>
            )}
            <ToolPanel title="Your rounds">
                {model.rounds.length === 0 ? (
                    <EmptyState
                        description="Create one below, or accept a suggestion."
                        icon={Layers}
                        size={EmptyStateSize.Compact}
                        title="No rounds yet"
                    />
                ) : (
                    <DataTable
                        aria-label="Rounds"
                        columns={[
                            {
                                cell: ({ row }) => (
                                    <FigureText text={row.original.label} />
                                ),
                                header: 'Label',
                                id: RoundColumn.Label,
                                meta: { isRowHeader: true },
                            },
                            {
                                cell: ({ row }) => (
                                    <FigureText text={row.original.firm} />
                                ),
                                header: 'Firm',
                                id: RoundColumn.Firm,
                            },
                            {
                                cell: ({ row }) => (
                                    <FigureText
                                        text={row.original.statusLabel}
                                    />
                                ),
                                header: 'Status',
                                id: RoundColumn.Status,
                            },
                            {
                                cell: ({ row }) => (
                                    <>
                                        <div className="flex flex-col gap-1">
                                            <span className="text-xs text-muted-foreground">
                                                {row.original.budgetText}
                                            </span>
                                            {row.original.budgetPercentUsed !==
                                                null && (
                                                <Progress
                                                    value={
                                                        row.original
                                                            .budgetPercentUsed
                                                    }
                                                />
                                            )}
                                        </div>
                                    </>
                                ),
                                header: 'Budget',
                                id: RoundColumn.Budget,
                            },
                            {
                                cell: ({ row }) => (
                                    <FigureText text={row.original.netCents} />
                                ),
                                header: 'Net',
                                id: RoundColumn.Net,
                                meta: { align: DataTableAlign.End },
                            },
                            {
                                cell: ({ row }) => (
                                    <FigureText
                                        text={row.original.payoutsCents}
                                    />
                                ),
                                header: 'Payouts',
                                id: RoundColumn.Payouts,
                                meta: { align: DataTableAlign.End },
                            },
                            {
                                cell: ({ row }) => (
                                    <FigureText
                                        text={row.original.realizedMultiple}
                                    />
                                ),
                                header: 'Realized multiple',
                                id: RoundColumn.RealizedMultiple,
                                meta: { align: DataTableAlign.End },
                            },
                            {
                                cell: ({ row }) => (
                                    <FigureText
                                        text={row.original.toDateMultiple}
                                    />
                                ),
                                header: 'To-date multiple',
                                id: RoundColumn.ToDateMultiple,
                                meta: { align: DataTableAlign.End },
                            },
                            {
                                cell: ({ row }) => (
                                    <FigureText
                                        text={row.original.inProgressText}
                                    />
                                ),
                                header: 'In progress',
                                id: RoundColumn.InProgress,
                                meta: { align: DataTableAlign.End },
                            },
                            {
                                cell: ({ row }) => (
                                    <FigureText text={row.original.cycleDays} />
                                ),
                                header: 'Cycle',
                                id: RoundColumn.Cycle,
                                meta: { align: DataTableAlign.End },
                            },
                            {
                                cell: ({ row }) => (
                                    <>
                                        <div>
                                            {
                                                row.original
                                                    .likeThisEndsNetNegativeModeled
                                            }
                                        </div>
                                        <div className="text-xs text-muted-foreground">
                                            Closed-form check:{' '}
                                            {
                                                row.original
                                                    .likeThisEndsNetNegativeClosedForm
                                            }
                                        </div>
                                    </>
                                ),
                                header: 'P(round like this net negative)',
                                id: RoundColumn.PRoundLikeThisNetNegative,
                                meta: { align: DataTableAlign.End },
                            },
                        ]}
                        data={[...model.rounds]}
                        isSortable={false}
                        pageSize={null}
                        rowId={(row) => row.id}
                    />
                )}
            </ToolPanel>
            <RoundForm
                externalFirms={externalFirms}
                key={prefill === null ? 'empty' : JSON.stringify(prefill)}
                prefill={prefill}
            />
        </div>
    );
}

function emptyRoundFormValues(): RoundFormValues {
    return {
        budgetCents: '',
        firmValue: '',
        label: '',
        openedOn: todayIsoDate(new Date()),
    };
}

function NextRoundCard({
    failureReason,
    model,
    result,
}: {
    readonly failureReason: null | string;
    readonly model: NextRoundCardModel;
    readonly result: NextRoundResultSummary | null;
}) {
    return (
        <ToolPanel contentClassName="gap-4" title="Next round">
            <p className="text-sm text-muted-foreground">
                After {model.roundLabel} closed ({model.planLabel}), modeled at{' '}
                {(model.modeledWinrate * 100).toFixed(0)}% win rate and{' '}
                {model.modeledRr}:1
                {model.realizedPassRate !== null && (
                    <>
                        {' '}
                        (your realized pass rate is{' '}
                        {(model.realizedPassRate.value * 100).toFixed(0)}% over{' '}
                        {model.realizedPassRate.n})
                    </>
                )}
                .
            </p>
            {model.leftOutLabels.length > 0 && (
                <WarningNote className="text-xs">
                    This round also has{' '}
                    {model.leftOutLabels.length === 1 ? 'a member' : 'members'}{' '}
                    whose plan agreement was not checked, so its spend and
                    payouts are left out: {model.leftOutLabels.join(', ')}.
                </WarningNote>
            )}
            <p className="text-xs text-muted-foreground">
                {model.rebuyLagNote}
            </p>
            {failureReason !== null && (
                <QueryErrorNotice
                    message={failureReason}
                    title="The next round could not be computed"
                />
            )}
            {result === null ? (
                <Skeleton className="h-24 w-full" />
            ) : (
                <div className="grid gap-4 md:grid-cols-2">
                    <NextRoundOption
                        label="Option A: repeat with the same budget"
                        recommended={
                            result.recommended ===
                            NextRoundRecommendation.OptionA
                        }
                        summary={result.optionA}
                    />
                    <NextRoundOption
                        label="Option B: budget plus attributed payouts"
                        recommended={
                            result.recommended ===
                            NextRoundRecommendation.OptionB
                        }
                        summary={result.optionB}
                    />
                </div>
            )}
        </ToolPanel>
    );
}

function NextRoundOption({
    label,
    recommended,
    summary,
}: {
    readonly label: string;
    readonly recommended: boolean;
    readonly summary: NextRoundOptionSummary;
}) {
    return (
        <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between gap-2">
                <span className="text-sm font-medium">{label}</span>
                {recommended && <Badge>Recommended</Badge>}
            </div>
            <StatStrip
                items={[
                    {
                        id: 'budget',
                        label: 'Budget',
                        value: summary.startingBankroll,
                    },
                    {
                        id: 'median-monthly-net',
                        label: 'Median monthly net (P50)',
                        value: summary.medianMonthlyNet,
                    },
                    {
                        id: 'round-net-negative',
                        label: 'P(round net negative)',
                        value: summary.pRoundNetNegative,
                    },
                    {
                        id: 'path-ruin',
                        label: 'Path ruin',
                        value: summary.pathRuin,
                    },
                ]}
            />
            {summary.scaleGateNote !== null && (
                <WarningNote className="text-xs">
                    {summary.scaleGateNote}
                </WarningNote>
            )}
        </div>
    );
}

function RoundForm({
    externalFirms,
    prefill,
}: {
    readonly externalFirms: Parameters<typeof firmSelectOptions>[0];
    readonly prefill: null | RoundPrefill;
}) {
    const utilities = api.useUtils();
    const create = api.propAccounts.round.create.useMutation();
    const assign = api.propAccounts.round.assign.useMutation();
    const options = firmSelectOptions(externalFirms);
    const schema = roundFormSchema();
    const form = useForm<RoundFormValues>({
        defaultValues:
            prefill === null
                ? emptyRoundFormValues()
                : {
                      ...emptyRoundFormValues(),
                      firmValue: prefill.firmValue,
                      label: prefill.label,
                      openedOn: prefill.openedOn,
                  },
        resolver: zodResolver(schema, undefined, { raw: true }),
    });
    const formId = useId();

    const assignSuggestedAccounts = async (roundId: string) => {
        if (prefill === null || prefill.memberAccountIds.length === 0) return;
        for (const accountId of prefill.memberAccountIds) {
            try {
                await assign.mutateAsync({ accountId, roundId });
            } catch (error) {
                toast.error(
                    `The round was created, but one account could not be assigned to it: ${
                        error instanceof Error
                            ? error.message
                            : 'Could not save'
                    }`,
                );
            }
        }
    };

    const save = async (values: RoundFormValues) => {
        const parsed = schema.safeParse(values);
        if (!parsed.success) return;
        try {
            const created = await create.mutateAsync(parsed.data);
            await assignSuggestedAccounts(created.id);
            toast.success(`${parsed.data.label} created`);
            form.reset(emptyRoundFormValues());
        } catch (error) {
            toast.error(
                error instanceof Error ? error.message : 'Could not save',
            );
        } finally {
            await utilities.propAccounts.invalidate();
        }
    };

    return (
        <ToolPanel title="New round">
            <form
                aria-label="Add a round"
                className="grid gap-4 md:grid-cols-2"
                noValidate
                onSubmit={(event) => {
                    void form.handleSubmit(save)(event);
                }}
            >
                <Controller
                    control={form.control}
                    name="firmValue"
                    render={({ field, fieldState }) => (
                        <Field data-invalid={fieldState.invalid}>
                            <FieldLabel htmlFor={`${formId}-firmValue`}>
                                Firm
                            </FieldLabel>
                            <Select
                                onValueChange={field.onChange}
                                value={field.value}
                            >
                                <SelectTrigger
                                    aria-invalid={fieldState.invalid}
                                    id={`${formId}-firmValue`}
                                    ref={field.ref}
                                >
                                    <SelectValue placeholder="Choose a firm">
                                        {
                                            options.find(
                                                (option) =>
                                                    option.value ===
                                                    field.value,
                                            )?.label
                                        }
                                    </SelectValue>
                                </SelectTrigger>
                                <SelectContent>
                                    {options.map((option) => (
                                        <SelectItem
                                            key={option.value}
                                            value={option.value}
                                        >
                                            {option.label}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                            <FieldError errors={[fieldState.error]} />
                        </Field>
                    )}
                />
                <Controller
                    control={form.control}
                    name="label"
                    render={({ field, fieldState }) => (
                        <Field data-invalid={fieldState.invalid}>
                            <FieldLabel htmlFor={`${formId}-label`}>
                                Label
                            </FieldLabel>
                            <Input
                                aria-invalid={fieldState.invalid}
                                id={`${formId}-label`}
                                {...field}
                            />
                            <FieldError errors={[fieldState.error]} />
                        </Field>
                    )}
                />
                <Controller
                    control={form.control}
                    name="openedOn"
                    render={({ field, fieldState }) => (
                        <Field data-invalid={fieldState.invalid}>
                            <FieldLabel htmlFor={`${formId}-openedOn`}>
                                Opened on
                            </FieldLabel>
                            <IsoDatePicker
                                aria-invalid={fieldState.invalid}
                                id={`${formId}-openedOn`}
                                {...field}
                            />
                            <FieldError errors={[fieldState.error]} />
                        </Field>
                    )}
                />
                <Controller
                    control={form.control}
                    name="budgetCents"
                    render={({ field, fieldState }) => (
                        <Field data-invalid={fieldState.invalid}>
                            <FieldLabel htmlFor={`${formId}-budgetCents`}>
                                Budget (optional)
                            </FieldLabel>
                            <Input
                                aria-invalid={fieldState.invalid}
                                id={`${formId}-budgetCents`}
                                inputMode="decimal"
                                placeholder="0.00"
                                {...field}
                            />
                            <FieldDescription>
                                Leave blank for no budget.
                            </FieldDescription>
                            <FieldError errors={[fieldState.error]} />
                        </Field>
                    )}
                />
                <div className="md:col-span-2">
                    <Button
                        disabled={
                            create.isPending || form.formState.isSubmitting
                        }
                        type="submit"
                    >
                        Add round
                    </Button>
                </div>
            </form>
        </ToolPanel>
    );
}

function roundFormSchema() {
    return roundFormShape.transform((values, context) => {
        const firmColumns = firmColumnsFromSelectValue(values.firmValue);
        if (firmColumns === null) {
            context.addIssue({
                code: 'custom',
                message: 'Pick a firm',
                path: ['firmValue'],
            });
            return z.NEVER;
        }
        const budget = parseMoneyText(values.budgetCents);
        if (budget.kind === EntryTextKind.Invalid) {
            context.addIssue({
                code: 'custom',
                message: budget.message,
                path: ['budgetCents'],
            });
            return z.NEVER;
        }
        const parsed = roundCreateSchema.safeParse({
            ...firmColumns,
            budgetCents:
                budget.kind === EntryTextKind.Valid ? budget.cents : null,
            label: values.label,
            openedOn: values.openedOn,
        });
        return parsedOrIssues(parsed, context);
    });
}

function SuggestionsCard({
    onAccept,
    suggestions,
}: {
    readonly onAccept: (row: RoundSuggestionRow) => void;
    readonly suggestions: readonly RoundSuggestionRow[];
}) {
    return (
        <ToolPanel
            className="app-prop-accounts__round-suggestions"
            description="Accounts bought together that are not in a round yet."
            title="Round suggestions"
        >
            <ItemGroup className="gap-2">
                {suggestions.map((row) => (
                    <Item
                        className="flex-wrap rounded-2xl border-line"
                        key={row.key}
                        size="sm"
                        variant="outline"
                    >
                        <ItemContent className="min-w-0 basis-56">
                            <ItemTitle>{row.firm}</ItemTitle>
                            <ItemDescription className="line-clamp-none">
                                {row.memberCount} accounts purchased{' '}
                                {row.earliestPurchase === row.latestPurchase
                                    ? `on ${formatDisplayDate(row.earliestPurchase)}`
                                    : formatDisplayDateRange(
                                          row.earliestPurchase,
                                          row.latestPurchase,
                                      )}
                            </ItemDescription>
                        </ItemContent>
                        <ItemActions>
                            <Button
                                onClick={() => {
                                    onAccept(row);
                                }}
                                size="sm"
                                type="button"
                                variant="outline"
                            >
                                Prefill a round
                            </Button>
                        </ItemActions>
                    </Item>
                ))}
            </ItemGroup>
        </ToolPanel>
    );
}
