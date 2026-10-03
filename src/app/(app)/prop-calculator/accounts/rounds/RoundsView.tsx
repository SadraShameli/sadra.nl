'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useCallback, useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { z } from 'zod';

import { useToolsRequest } from '~/app/(app)/prop-calculator/_components/bankroll/useToolsRequest';
import { ToolsWorkerPhase } from '~/app/(app)/prop-calculator/_components/useToolsWorker';
import { ToolsResponseKind } from '~/app/(app)/prop-calculator/_workers/toolsWorkerMessages';
import { ACCOUNT_LIST_INPUT } from '~/app/(app)/prop-calculator/accounts/_components/accountListFilters';
import { parsedOrIssues } from '~/app/(app)/prop-calculator/accounts/_components/detail/formParsing';
import {
    EVENT_LIST_INPUT,
    LEDGER_LIST_INPUT,
} from '~/app/(app)/prop-calculator/accounts/_components/overview/overviewModel';
import { SampleBadge } from '~/app/(app)/prop-calculator/accounts/_components/overview/SampleBadge';
import { QueryErrorNotice } from '~/app/(app)/prop-calculator/accounts/_components/QueryErrorNotice';
import { Alert, AlertDescription, AlertTitle } from '~/components/ui/Alert';
import { Badge } from '~/components/ui/Badge';
import { Button } from '~/components/ui/Button';
import { Card, CardContent, CardHeader, CardTitle } from '~/components/ui/Card';
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
import { Progress } from '~/components/ui/Progress';
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
        return <Skeleton className="h-64 w-full" />;
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
                    <p className="text-xs text-destructive">
                        Your firms could not be loaded, so external firms show
                        as an unlisted firm until they load:{' '}
                        {externalFirmsQuery.error.message}
                    </p>
                )}
            {rulebookQuery.isError && rulebookQuery.data === undefined && (
                <p className="text-xs text-destructive">
                    Your rulebook could not be loaded, so this page is using
                    default thresholds instead of yours:{' '}
                    {rulebookQuery.error.message}
                </p>
            )}
            {bankrollSummaryQuery.isError &&
                bankrollSummaryQuery.data === undefined && (
                    <p className="text-xs text-destructive">
                        Your available bankroll could not be loaded, so option B
                        on the &quot;Next round&quot; card is capped at option
                        A&apos;s budget until it does:{' '}
                        {bankrollSummaryQuery.error.message}
                    </p>
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
                <Card>
                    <CardHeader>
                        <CardTitle>Rounds by firm</CardTitle>
                    </CardHeader>
                    <CardContent className="flex flex-col gap-3">
                        {model.perFirm.length > 0 && (
                            <Table aria-label="Rounds by firm">
                                <TableHeader>
                                    <TableRow>
                                        <TableHead>Firm</TableHead>
                                        <TableHead className="text-right">
                                            Rounds
                                        </TableHead>
                                        <TableHead className="text-right">
                                            Closed
                                        </TableHead>
                                        <TableHead className="text-right">
                                            Min multiple
                                        </TableHead>
                                        <TableHead className="text-right">
                                            Mean multiple
                                        </TableHead>
                                        <TableHead className="text-right">
                                            Max multiple
                                        </TableHead>
                                        <TableHead className="text-right">
                                            Share positive
                                        </TableHead>
                                        <TableHead>Sample</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {model.perFirm.map((row) => (
                                        <TableRow key={row.key}>
                                            <TableCell>{row.firm}</TableCell>
                                            <TableCell className="text-right tabular-nums">
                                                {row.rounds}
                                            </TableCell>
                                            <TableCell className="text-right tabular-nums">
                                                {row.closedRounds}
                                            </TableCell>
                                            <TableCell className="text-right tabular-nums">
                                                {row.min}
                                            </TableCell>
                                            <TableCell className="text-right tabular-nums">
                                                {row.mean}
                                            </TableCell>
                                            <TableCell className="text-right tabular-nums">
                                                {row.max}
                                            </TableCell>
                                            <TableCell className="text-right tabular-nums">
                                                {row.sharePositive}
                                            </TableCell>
                                            <TableCell>
                                                <SampleBadge
                                                    level={row.sampleLevel}
                                                />
                                            </TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                        )}
                        {model.perFirm.length > 0 && (
                            <p className="text-xs text-muted-foreground">
                                Multiples and share positive use closed rounds
                                only; open rounds count in Rounds but not in
                                the spread or its n.
                            </p>
                        )}
                        {model.unassignedRoundCount > 0 && (
                            <p className="text-xs text-muted-foreground">
                                Rounds without a firm:{' '}
                                {model.unassignedRoundCount} (left out of this
                                table)
                            </p>
                        )}
                    </CardContent>
                </Card>
            )}
            <Card>
                <CardHeader>
                    <CardTitle>Rounds</CardTitle>
                </CardHeader>
                <CardContent>
                    {model.rounds.length === 0 ? (
                        <p className="text-sm text-muted-foreground">
                            No rounds yet. Create one below, or accept a
                            suggestion above.
                        </p>
                    ) : (
                        <Table aria-label="Rounds">
                            <TableHeader>
                                <TableRow>
                                    <TableHead>Label</TableHead>
                                    <TableHead>Firm</TableHead>
                                    <TableHead>Status</TableHead>
                                    <TableHead>Budget</TableHead>
                                    <TableHead className="text-right">
                                        Net
                                    </TableHead>
                                    <TableHead className="text-right">
                                        Payouts
                                    </TableHead>
                                    <TableHead className="text-right">
                                        Realized multiple
                                    </TableHead>
                                    <TableHead className="text-right">
                                        To-date multiple
                                    </TableHead>
                                    <TableHead className="text-right">
                                        In progress
                                    </TableHead>
                                    <TableHead className="text-right">
                                        Cycle
                                    </TableHead>
                                    <TableHead className="text-right">
                                        P(round like this net negative)
                                    </TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {model.rounds.map((row) => (
                                    <TableRow key={row.id}>
                                        <TableCell>{row.label}</TableCell>
                                        <TableCell>{row.firm}</TableCell>
                                        <TableCell>{row.statusLabel}</TableCell>
                                        <TableCell>
                                            <div className="flex flex-col gap-1">
                                                <span className="text-xs text-muted-foreground">
                                                    {row.budgetText}
                                                </span>
                                                {row.budgetPercentUsed !==
                                                    null && (
                                                    <Progress
                                                        value={
                                                            row.budgetPercentUsed
                                                        }
                                                    />
                                                )}
                                            </div>
                                        </TableCell>
                                        <TableCell className="text-right tabular-nums">
                                            {row.netCents}
                                        </TableCell>
                                        <TableCell className="text-right tabular-nums">
                                            {row.payoutsCents}
                                        </TableCell>
                                        <TableCell className="text-right tabular-nums">
                                            {row.realizedMultiple}
                                        </TableCell>
                                        <TableCell className="text-right tabular-nums">
                                            {row.toDateMultiple}
                                        </TableCell>
                                        <TableCell className="text-right tabular-nums">
                                            {row.inProgressText}
                                        </TableCell>
                                        <TableCell className="text-right tabular-nums">
                                            {row.cycleDays}
                                        </TableCell>
                                        <TableCell className="text-right tabular-nums">
                                            <div>
                                                {
                                                    row.likeThisEndsNetNegativeModeled
                                                }
                                            </div>
                                            <div className="text-xs text-muted-foreground">
                                                Closed-form check:{' '}
                                                {
                                                    row.likeThisEndsNetNegativeClosedForm
                                                }
                                            </div>
                                        </TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    )}
                </CardContent>
            </Card>
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
        <Card>
            <CardHeader>
                <CardTitle>Next round</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
                <p className="text-sm text-muted-foreground">
                    After {model.roundLabel} closed ({model.planLabel}), modeled
                    at {(model.modeledWinrate * 100).toFixed(0)}% win rate and{' '}
                    {model.modeledRr}:1
                    {model.realizedPassRate !== null && (
                        <>
                            {' '}
                            (your realized pass rate is{' '}
                            {(model.realizedPassRate.value * 100).toFixed(0)}%
                            over {model.realizedPassRate.n})
                        </>
                    )}
                    .
                </p>
                {model.leftOutLabels.length > 0 && (
                    <p className="text-xs text-amber-600">
                        This round also has{' '}
                        {model.leftOutLabels.length === 1
                            ? 'a member'
                            : 'members'}{' '}
                        whose plan agreement was not checked, so its spend and
                        payouts are left out: {model.leftOutLabels.join(', ')}.
                    </p>
                )}
                {failureReason !== null && (
                    <p className="text-xs text-destructive">{failureReason}</p>
                )}
                {result === null ? (
                    <Skeleton className="h-24 w-full" />
                ) : (
                    <div className="grid gap-4 sm:grid-cols-2">
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
            </CardContent>
        </Card>
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
        <div className="flex flex-col gap-2 rounded-md border p-3">
            <div className="flex items-center justify-between gap-2">
                <span className="text-sm font-medium">{label}</span>
                {recommended && <Badge variant="outline">Recommended</Badge>}
            </div>
            <dl className="grid grid-cols-2 gap-x-2 gap-y-1 text-sm">
                <dt className="text-muted-foreground">Budget</dt>
                <dd className="text-right tabular-nums">
                    {summary.startingBankroll}
                </dd>
                <dt className="text-muted-foreground">
                    Median monthly net (P50)
                </dt>
                <dd className="text-right tabular-nums">
                    {summary.medianMonthlyNet}
                </dd>
                <dt className="text-muted-foreground">P(round net negative)</dt>
                <dd className="text-right tabular-nums">
                    {summary.pRoundNetNegative}
                </dd>
                <dt className="text-muted-foreground">Path ruin</dt>
                <dd className="text-right tabular-nums">{summary.pathRuin}</dd>
            </dl>
            {summary.scaleGateNote !== null && (
                <p className="text-xs text-amber-600">
                    {summary.scaleGateNote}
                </p>
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
        <Card>
            <CardHeader>
                <CardTitle>New round</CardTitle>
            </CardHeader>
            <CardContent>
                <Form {...form}>
                    <form
                        aria-label="Add a round"
                        className="grid gap-4 sm:grid-cols-2"
                        noValidate
                        onSubmit={(event) => {
                            void form.handleSubmit(save)(event);
                        }}
                    >
                        <FormField
                            control={form.control}
                            name="firmValue"
                            render={({ field }) => (
                                <FormItem>
                                    <FormLabel>Firm</FormLabel>
                                    <Select
                                        onValueChange={field.onChange}
                                        value={field.value}
                                    >
                                        <FormControl>
                                            <SelectTrigger ref={field.ref}>
                                                <SelectValue />
                                            </SelectTrigger>
                                        </FormControl>
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
                                    <FormMessage />
                                </FormItem>
                            )}
                        />
                        <FormField
                            control={form.control}
                            name="label"
                            render={({ field }) => (
                                <FormItem>
                                    <FormLabel>Label</FormLabel>
                                    <FormControl>
                                        <Input {...field} />
                                    </FormControl>
                                    <FormMessage />
                                </FormItem>
                            )}
                        />
                        <FormField
                            control={form.control}
                            name="openedOn"
                            render={({ field }) => (
                                <FormItem>
                                    <FormLabel>Opened on</FormLabel>
                                    <FormControl>
                                        <Input type="date" {...field} />
                                    </FormControl>
                                    <FormMessage />
                                </FormItem>
                            )}
                        />
                        <FormField
                            control={form.control}
                            name="budgetCents"
                            render={({ field }) => (
                                <FormItem>
                                    <FormLabel>Budget (optional)</FormLabel>
                                    <FormControl>
                                        <Input
                                            inputMode="decimal"
                                            placeholder="0.00"
                                            {...field}
                                        />
                                    </FormControl>
                                    <FormDescription>
                                        Leave blank for no budget.
                                    </FormDescription>
                                    <FormMessage />
                                </FormItem>
                            )}
                        />
                        <div className="sm:col-span-2">
                            <Button
                                disabled={
                                    create.isPending ||
                                    form.formState.isSubmitting
                                }
                                type="submit"
                            >
                                Add round
                            </Button>
                        </div>
                    </form>
                </Form>
            </CardContent>
        </Card>
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
        <Alert>
            <AlertTitle>Round suggestions</AlertTitle>
            <AlertDescription>
                <ul className="flex flex-col gap-2">
                    {suggestions.map((row) => (
                        <li
                            className="flex flex-wrap items-center justify-between gap-2"
                            key={row.key}
                        >
                            <span>
                                {row.memberCount} accounts at {row.firm}{' '}
                                purchased {row.earliestPurchase} to{' '}
                                {row.latestPurchase}
                            </span>
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
                        </li>
                    ))}
                </ul>
            </AlertDescription>
        </Alert>
    );
}
