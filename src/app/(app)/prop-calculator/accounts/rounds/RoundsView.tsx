'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { z } from 'zod';

import { Alert, AlertDescription, AlertTitle } from '~/components/ui/Alert';
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
import { DEFAULT_RULEBOOK } from '~/lib/prop-calculator/advisor';
import { roundCreateSchema } from '~/lib/schemas/propAccounts';
import { api } from '~/trpc/react';

import { ACCOUNT_LIST_INPUT } from '../_components/accountListFilters';
import { parsedOrIssues } from '../_components/detail/formParsing';
import { EVENT_LIST_INPUT, LEDGER_LIST_INPUT } from '../_components/overview/overviewModel';
import {
    firmColumnsFromSelectValue,
    firmSelectOptions,
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
    const [prefill, setPrefill] = useState<null | {
        firmValue: string;
        label: string;
        openedOn: string;
    }>(null);

    const externalFirms = externalFirmsQuery.data ?? EMPTY_EXTERNAL_FIRMS;
    const rulebook = rulebookQuery.data ?? DEFAULT_RULEBOOK;
    const model = useMemo(() => {
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
        const ledger = PortfolioLedger.fromRows(session.data.user.id, {
            accounts: accountsQuery.data,
            events: eventsQuery.data,
            fees: feesQuery.data,
            payouts: payoutsQuery.data,
            rounds: roundsQuery.data,
        });
        return roundsPageModel(
            ledger,
            rulebook.samples,
            rulebook.bankroll.roundGapDays,
            externalFirms,
        );
    }, [
        accountsQuery.data,
        eventsQuery.data,
        externalFirms,
        feesQuery.data,
        payoutsQuery.data,
        roundsQuery.data,
        rulebook,
        session.data?.user.id,
    ]);

    if (model === null) return <Skeleton className="h-64 w-full" />;

    return (
        <div className="flex flex-col gap-6">
            {model.suggestions.length > 0 && (
                <SuggestionsCard
                    onAccept={(row) => {
                        setPrefill({
                            firmValue: row.firmValue,
                            label: row.label,
                            openedOn: row.earliestPurchase,
                        });
                    }}
                    suggestions={model.suggestions}
                />
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
                        <Table>
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
                                        Realized multiple
                                    </TableHead>
                                    <TableHead className="text-right">
                                        To-date multiple
                                    </TableHead>
                                    <TableHead className="text-right">
                                        Open members
                                    </TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {model.rounds.map((row) => (
                                    <TableRow key={row.id}>
                                        <TableCell>{row.label}</TableCell>
                                        <TableCell>{row.firm}</TableCell>
                                        <TableCell>
                                            {row.statusLabel}
                                        </TableCell>
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
                                            {row.realizedMultiple}
                                        </TableCell>
                                        <TableCell className="text-right tabular-nums">
                                            {row.toDateMultiple}
                                        </TableCell>
                                        <TableCell className="text-right tabular-nums">
                                            {row.openMemberCount}
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

function RoundForm({
    externalFirms,
    prefill,
}: {
    readonly externalFirms: Parameters<typeof firmSelectOptions>[0];
    readonly prefill: null | {
        firmValue: string;
        label: string;
        openedOn: string;
    };
}) {
    const utilities = api.useUtils();
    const create = api.propAccounts.round.create.useMutation();
    const options = firmSelectOptions(externalFirms);
    const schema = roundFormSchema();
    const form = useForm<RoundFormValues>({
        defaultValues:
            prefill === null
                ? emptyRoundFormValues()
                : { ...emptyRoundFormValues(), ...prefill },
        resolver: zodResolver(schema, undefined, { raw: true }),
    });

    const save = async (values: RoundFormValues) => {
        const parsed = schema.safeParse(values);
        if (!parsed.success) return;
        try {
            await create.mutateAsync(parsed.data);
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
                                disabled={create.isPending}
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
