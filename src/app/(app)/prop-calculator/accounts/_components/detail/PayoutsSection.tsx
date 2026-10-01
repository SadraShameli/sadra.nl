'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { Pencil } from 'lucide-react';
import { useEffect } from 'react';
import { type Control, useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { z } from 'zod';

import {
    useFollowToday,
    useTodayIsoDate,
} from '~/app/(app)/prop-calculator/_components/useTodayIsoDate';
import { GrossOnlyPayoutsNote } from '~/app/(app)/prop-calculator/accounts/_components/GrossOnlyPayoutsNote';
import { payoutStatusLabel } from '~/app/(app)/prop-calculator/accounts/_components/overview/overviewModel';
import { Button } from '~/components/ui/Button';
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
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from '~/components/ui/Table';
import { Textarea } from '~/components/ui/Textarea';
import {
    EntryTextKind,
    formatUsdCents,
    parseMoneyText,
    PayoutStatus,
    summarizeCash,
    usdCentsToText,
} from '~/lib/prop-accounts';
import { payoutCreateSchema } from '~/lib/schemas/propAccounts';
import { api, type RouterOutputs } from '~/trpc/react';

import {
    type ListQuery,
    ListQueryStatus,
    RemoveRecordDialog,
} from './DetailParts';
import { nullIfBlank, parsedOrIssues } from './formParsing';
import { useRowEditing } from './useRowEditing';

type PayoutRow = RouterOutputs['propAccounts']['payout']['list'][number];

const payoutFormShape = z.object({
    approvedOn: z.string(),
    grossCents: z.string(),
    netCents: z.string(),
    note: z.string(),
    paidOn: z.string(),
    requestedOn: z.string(),
    status: z.enum(PayoutStatus),
});

type PayoutFormValues = z.input<typeof payoutFormShape>;

export function PayoutsSection({
    accountId,
    canRecord,
    onFailure,
    query,
}: {
    readonly accountId: string;
    readonly canRecord: boolean;
    readonly onFailure: (error: unknown) => void;
    readonly query: ListQuery<PayoutRow>;
}) {
    const { editing, startEditing, stopEditing } = useRowEditing<PayoutRow>();
    const utilities = api.useUtils();
    const remove = api.propAccounts.payout.remove.useMutation({
        onError: onFailure,
        onSuccess: () => {
            toast.success('Payout deleted');
            return utilities.propAccounts.invalidate();
        },
    });
    const rows = query.data;
    return (
        <>
            <ListQueryStatus query={query} subject="payouts" />
            {rows?.length === 0 && (
                <p className="text-sm text-muted-foreground">
                    No payouts recorded yet.
                </p>
            )}
            {rows !== undefined && rows.length > 0 && (
                <>
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>Requested</TableHead>
                                <TableHead>Status</TableHead>
                                <TableHead className="text-right">
                                    Gross
                                </TableHead>
                                <TableHead className="text-right">
                                    Received
                                </TableHead>
                                <TableHead>Approved on</TableHead>
                                <TableHead>Paid on</TableHead>
                                <TableHead>Note</TableHead>
                                <TableHead>
                                    <span className="sr-only">Actions</span>
                                </TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {rows.map((row) => (
                                <TableRow key={row.id}>
                                    <TableCell className="tabular-nums">
                                        {row.requestedOn}
                                    </TableCell>
                                    <TableCell>
                                        {payoutStatusLabel(row.status)}
                                    </TableCell>
                                    <TableCell className="text-right tabular-nums">
                                        {formatUsdCents(row.grossCents)}
                                    </TableCell>
                                    <TableCell className="text-right tabular-nums">
                                        {row.netCents === null
                                            ? 'net not entered'
                                            : formatUsdCents(row.netCents)}
                                    </TableCell>
                                    <TableCell className="tabular-nums">
                                        {row.approvedOn ?? ''}
                                    </TableCell>
                                    <TableCell className="tabular-nums">
                                        {row.paidOn ?? ''}
                                    </TableCell>
                                    <TableCell className="max-w-xs text-xs whitespace-pre-line text-muted-foreground">
                                        {row.note ?? ''}
                                    </TableCell>
                                    <TableCell>
                                        <div className="flex justify-end gap-1">
                                            {canRecord && (
                                                <Button
                                                    aria-label={`Edit the payout requested on ${row.requestedOn}`}
                                                    onClick={(event) => {
                                                        startEditing(
                                                            row,
                                                            event.currentTarget,
                                                        );
                                                    }}
                                                    size="icon"
                                                    type="button"
                                                    variant="ghost"
                                                >
                                                    <Pencil />
                                                </Button>
                                            )}
                                            <RemoveRecordDialog
                                                confirmText="Delete"
                                                description="This permanently removes the payout from this account and from your totals."
                                                isPending={remove.isPending}
                                                onConfirm={() => {
                                                    remove.mutate({
                                                        id: row.id,
                                                    });
                                                }}
                                                title="Delete this payout?"
                                                triggerLabel={`Delete the payout requested on ${row.requestedOn}`}
                                            />
                                        </div>
                                    </TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                    <GrossOnlyPayoutsNote
                        count={summarizeCash([], rows).grossOnlyPayouts}
                    />
                </>
            )}
            {canRecord && (
                <PayoutForm
                    accountId={accountId}
                    editing={editing}
                    key={editing?.id ?? 'new'}
                    onDone={stopEditing}
                    onFailure={onFailure}
                />
            )}
        </>
    );
}

function DateField({
    control,
    label,
    name,
}: {
    readonly control: Control<PayoutFormValues>;
    readonly label: string;
    readonly name: 'approvedOn' | 'paidOn' | 'requestedOn';
}) {
    return (
        <FormField
            control={control}
            name={name}
            render={({ field }) => (
                <FormItem>
                    <FormLabel>{label}</FormLabel>
                    <FormControl>
                        <Input type="date" {...field} />
                    </FormControl>
                    <FormMessage />
                </FormItem>
            )}
        />
    );
}

function emptyPayoutValues(today: string): PayoutFormValues {
    return {
        approvedOn: '',
        grossCents: '',
        netCents: '',
        note: '',
        paidOn: '',
        requestedOn: today,
        status: PayoutStatus.Requested,
    };
}

function MoneyField({
    control,
    label,
    name,
}: {
    readonly control: Control<PayoutFormValues>;
    readonly label: string;
    readonly name: 'grossCents' | 'netCents';
}) {
    return (
        <FormField
            control={control}
            name={name}
            render={({ field }) => (
                <FormItem>
                    <FormLabel>{label}</FormLabel>
                    <FormControl>
                        <Input
                            inputMode="decimal"
                            placeholder="0.00"
                            {...field}
                        />
                    </FormControl>
                    <FormMessage />
                </FormItem>
            )}
        />
    );
}

function PayoutForm({
    accountId,
    editing,
    onDone,
    onFailure,
}: {
    readonly accountId: string;
    readonly editing: null | PayoutRow;
    readonly onDone: () => void;
    readonly onFailure: (error: unknown) => void;
}) {
    const utilities = api.useUtils();
    const create = api.propAccounts.payout.create.useMutation();
    const update = api.propAccounts.payout.update.useMutation();
    const schema = payoutFormSchema(accountId);
    const today = useTodayIsoDate();
    const defaults =
        editing === null ? emptyPayoutValues(today) : storedPayoutValues(editing);
    const form = useForm<PayoutFormValues>({
        defaultValues: defaults,
        resolver: zodResolver(schema, undefined, { raw: true }),
    });
    const { setFocus } = form;
    const isEditing = editing !== null;
    useFollowToday({
        isEnabled: !isEditing,
        read: () => form.getValues('requestedOn'),
        today,
        write: (day) => {
            form.resetField('requestedOn', { defaultValue: day });
        },
    });

    useEffect(() => {
        if (isEditing) setFocus('requestedOn');
    }, [isEditing, setFocus]);

    const save = async (values: PayoutFormValues) => {
        const parsed = schema.safeParse(values);
        if (!parsed.success) return;
        const draft = parsed.data;
        try {
            if (editing === null) {
                await create.mutateAsync(draft);
                toast.success('Payout recorded');
            } else {
                await update.mutateAsync({
                    approvedOn: draft.approvedOn,
                    grossCents: draft.grossCents,
                    id: editing.id,
                    netCents: draft.netCents,
                    note: draft.note,
                    paidOn: draft.paidOn,
                    requestedOn: draft.requestedOn,
                    status: draft.status,
                });
                toast.success('Payout saved');
            }
            form.reset(emptyPayoutValues(today));
            onDone();
        } catch (error) {
            onFailure(error);
        } finally {
            await utilities.propAccounts.invalidate();
        }
    };

    return (
        <Form {...form}>
            <form
                aria-label={editing === null ? 'Add a payout' : 'Edit payout'}
                className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3"
                noValidate
                onSubmit={(event) => {
                    void form.handleSubmit(save)(event);
                }}
            >
                <DateField
                    control={form.control}
                    label="Requested on"
                    name="requestedOn"
                />
                <FormField
                    control={form.control}
                    name="status"
                    render={({ field }) => (
                        <FormItem>
                            <FormLabel>Status</FormLabel>
                            <Select
                                onValueChange={field.onChange}
                                value={field.value}
                            >
                                <FormControl>
                                    <SelectTrigger>
                                        <SelectValue />
                                    </SelectTrigger>
                                </FormControl>
                                <SelectContent>
                                    {Object.values(PayoutStatus).map(
                                        (status) => (
                                            <SelectItem
                                                key={status}
                                                value={status}
                                            >
                                                {payoutStatusLabel(status)}
                                            </SelectItem>
                                        ),
                                    )}
                                </SelectContent>
                            </Select>
                            <FormMessage />
                        </FormItem>
                    )}
                />
                <DateField
                    control={form.control}
                    label="Approved on"
                    name="approvedOn"
                />
                <DateField
                    control={form.control}
                    label="Paid on"
                    name="paidOn"
                />
                <MoneyField
                    control={form.control}
                    label="Gross amount"
                    name="grossCents"
                />
                <MoneyField
                    control={form.control}
                    label="Net received"
                    name="netCents"
                />
                <FormField
                    control={form.control}
                    name="note"
                    render={({ field }) => (
                        <FormItem className="sm:col-span-2 lg:col-span-3">
                            <FormLabel>Note</FormLabel>
                            <FormControl>
                                <Textarea rows={2} {...field} />
                            </FormControl>
                            <FormMessage />
                        </FormItem>
                    )}
                />
                <div className="flex flex-wrap items-center gap-2 sm:col-span-2 lg:col-span-3">
                    <Button
                        disabled={create.isPending || update.isPending}
                        type="submit"
                    >
                        {editing === null ? 'Add payout' : 'Save payout'}
                    </Button>
                    {editing !== null && (
                        <Button onClick={onDone} type="button" variant="ghost">
                            Cancel edit
                        </Button>
                    )}
                </div>
            </form>
        </Form>
    );
}

function payoutFormSchema(accountId: string) {
    return payoutFormShape.transform((values, context) => {
        const gross = parseMoneyText(values.grossCents);
        const net = parseMoneyText(values.netCents);
        if (gross.kind === EntryTextKind.Invalid) {
            context.addIssue({
                code: 'custom',
                message: gross.message,
                path: ['grossCents'],
            });
        }
        if (gross.kind === EntryTextKind.Empty) {
            context.addIssue({
                code: 'custom',
                message: 'Enter the gross amount',
                path: ['grossCents'],
            });
        }
        if (net.kind === EntryTextKind.Invalid) {
            context.addIssue({
                code: 'custom',
                message: net.message,
                path: ['netCents'],
            });
        }
        if (
            gross.kind !== EntryTextKind.Valid ||
            net.kind === EntryTextKind.Invalid
        ) {
            return z.NEVER;
        }
        const parsed = payoutCreateSchema.safeParse({
            accountId,
            approvedOn: nullIfBlank(values.approvedOn),
            grossCents: gross.cents,
            netCents: net.kind === EntryTextKind.Valid ? net.cents : null,
            note: nullIfBlank(values.note),
            paidOn: nullIfBlank(values.paidOn),
            requestedOn: values.requestedOn,
            status: values.status,
        });
        return parsedOrIssues(parsed, context);
    });
}

function storedPayoutValues(row: PayoutRow): PayoutFormValues {
    return {
        approvedOn: row.approvedOn ?? '',
        grossCents: usdCentsToText(row.grossCents),
        netCents: row.netCents === null ? '' : usdCentsToText(row.netCents),
        note: row.note ?? '',
        paidOn: row.paidOn ?? '',
        requestedOn: row.requestedOn,
        status: row.status,
    };
}
