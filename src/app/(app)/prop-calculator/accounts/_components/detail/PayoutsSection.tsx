'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { Banknote } from 'lucide-react';
import { useId } from 'react';
import { type Control, Controller, useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { z } from 'zod';

import {
    useFollowToday,
    useTodayIsoDate,
} from '~/app/(app)/prop-calculator/_components/useTodayIsoDate';
import { GrossOnlyPayoutsNote } from '~/app/(app)/prop-calculator/accounts/_components/GrossOnlyPayoutsNote';
import { payoutStatusLabel } from '~/app/(app)/prop-calculator/accounts/_components/overview/overviewModel';
import { FormDialog } from '~/components/FormDialog';
import {
    deleteRowAction,
    editRowAction,
    rowActionsColumn,
} from '~/components/RowActionsMenu';
import { DataTable, DataTableAlign } from '~/components/ui/data-table';
import { Dialog } from '~/components/ui/dialog';
import { EmptyState, EmptyStateSize } from '~/components/ui/empty-state';
import { Field, FieldError, FieldLabel } from '~/components/ui/field';
import { Input } from '~/components/ui/input';
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
    AddRecordButton,
    type ListQuery,
    ListQueryStatus,
} from './DetailParts';
import { nullIfBlank, parsedOrIssues } from './formParsing';
import { useRecordDialog } from './useRecordDialog';

enum PayoutsSectionColumn {
    ApprovedOn = 'approved-on',
    Gross = 'gross',
    Note = 'note',
    PaidOn = 'paid-on',
    Received = 'received',
    Requested = 'requested',
    Status = 'status',
}

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
    const dialog = useRecordDialog<PayoutRow>();
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
                <EmptyState
                    icon={Banknote}
                    size={EmptyStateSize.Compact}
                    title="No payouts recorded yet"
                />
            )}
            {rows !== undefined && rows.length > 0 && (
                <>
                    <DataTable
                        columns={[
                            {
                                cell: ({ row: { original: row } }) => (
                                    <div className="tabular-nums">
                                        {formatDisplayDate(row.requestedOn)}
                                    </div>
                                ),
                                header: 'Requested',
                                id: PayoutsSectionColumn.Requested,
                                meta: { isRowHeader: true },
                            },
                            {
                                cell: ({ row: { original: row } }) => (
                                    <>{payoutStatusLabel(row.status)}</>
                                ),
                                header: 'Status',
                                id: PayoutsSectionColumn.Status,
                            },
                            {
                                cell: ({ row: { original: row } }) => (
                                    <>{formatUsdCents(row.grossCents)}</>
                                ),
                                header: 'Gross',
                                id: PayoutsSectionColumn.Gross,
                                meta: { align: DataTableAlign.End },
                            },
                            {
                                cell: ({ row: { original: row } }) => (
                                    <>
                                        {row.netCents === null
                                            ? 'net not entered'
                                            : formatUsdCents(row.netCents)}
                                    </>
                                ),
                                header: 'Received',
                                id: PayoutsSectionColumn.Received,
                                meta: { align: DataTableAlign.End },
                            },
                            {
                                cell: ({ row: { original: row } }) => (
                                    <div className="tabular-nums">
                                        {row.approvedOn === null
                                            ? ''
                                            : formatDisplayDate(row.approvedOn)}
                                    </div>
                                ),
                                header: 'Approved on',
                                id: PayoutsSectionColumn.ApprovedOn,
                            },
                            {
                                cell: ({ row: { original: row } }) => (
                                    <div className="tabular-nums">
                                        {row.paidOn === null
                                            ? ''
                                            : formatDisplayDate(row.paidOn)}
                                    </div>
                                ),
                                header: 'Paid on',
                                id: PayoutsSectionColumn.PaidOn,
                            },
                            {
                                cell: ({ row: { original: row } }) => (
                                    <div className="max-w-xs text-xs whitespace-pre-line text-muted-foreground">
                                        {row.note ?? ''}
                                    </div>
                                ),
                                header: 'Note',
                                id: PayoutsSectionColumn.Note,
                            },
                            rowActionsColumn<PayoutRow>({
                                actionsOf: (row) => [
                                    ...(canRecord
                                        ? [
                                              editRowAction(() => {
                                                  dialog.startEditing(row);
                                              }),
                                          ]
                                        : []),
                                    deleteRowAction({
                                        description:
                                            'This permanently removes the payout from this account and from your totals.',
                                        onDelete: () => {
                                            remove.mutate({ id: row.id });
                                        },
                                        title: 'Delete this payout?',
                                    }),
                                ],
                                isPendingOf: (row) =>
                                    remove.isPending &&
                                    remove.variables.id === row.id,
                                labelOf: (row) =>
                                    `the payout requested on ${formatDisplayDate(row.requestedOn)}`,
                            }),
                        ]}
                        data={[...rows]}
                        isSortable={false}
                        pageSize={null}
                        rowId={(row) => row.id}
                    />
                    <GrossOnlyPayoutsNote
                        count={summarizeCash([], rows).grossOnlyPayouts}
                    />
                </>
            )}
            {canRecord && (
                <AddRecordButton
                    label="Add payout"
                    onAdd={dialog.startAdding}
                />
            )}
            <Dialog onOpenChange={dialog.onOpenChange} open={dialog.isOpen}>
                {dialog.isOpen && (
                    <PayoutForm
                        accountId={accountId}
                        editing={dialog.editing}
                        onDone={dialog.close}
                        onFailure={onFailure}
                    />
                )}
            </Dialog>
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
    const formId = useId();
    return (
        <Controller
            control={control}
            name={name}
            render={({ field, fieldState }) => (
                <Field data-invalid={fieldState.invalid}>
                    <FieldLabel htmlFor={`${formId}-${field.name}`}>
                        {label}
                    </FieldLabel>
                    <IsoDatePicker
                        aria-invalid={fieldState.invalid}
                        id={`${formId}-${field.name}`}
                        {...field}
                    />
                    <FieldError errors={[fieldState.error]} />
                </Field>
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
    const formId = useId();
    return (
        <Controller
            control={control}
            name={name}
            render={({ field, fieldState }) => (
                <Field data-invalid={fieldState.invalid}>
                    <FieldLabel htmlFor={`${formId}-${field.name}`}>
                        {label}
                    </FieldLabel>
                    <Input
                        aria-invalid={fieldState.invalid}
                        id={`${formId}-${field.name}`}
                        inputMode="decimal"
                        placeholder="0.00"
                        {...field}
                    />
                    <FieldError errors={[fieldState.error]} />
                </Field>
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
        editing === null
            ? emptyPayoutValues(today)
            : storedPayoutValues(editing);
    const form = useForm<PayoutFormValues>({
        defaultValues: defaults,
        resolver: zodResolver(schema, undefined, { raw: true }),
    });
    const formId = useId();
    useFollowToday({
        isEnabled: editing === null,
        read: () => form.getValues('requestedOn'),
        today,
        write: (day) => {
            form.resetField('requestedOn', { defaultValue: day });
        },
    });

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
            onDone();
        } catch (error) {
            onFailure(error);
        } finally {
            await utilities.propAccounts.invalidate();
        }
    };

    return (
        <FormDialog
            form={form}
            onCancel={onDone}
            onSubmit={save}
            pending={create.isPending || update.isPending}
            submitLabel={editing === null ? 'Add payout' : 'Save payout'}
            title={editing === null ? 'Add a payout' : 'Edit payout'}
        >
            <DateField
                control={form.control}
                label="Requested on"
                name="requestedOn"
            />
            <Controller
                control={form.control}
                name="status"
                render={({ field, fieldState }) => (
                    <Field data-invalid={fieldState.invalid}>
                        <FieldLabel htmlFor={`${formId}-status`}>
                            Status
                        </FieldLabel>
                        <Select
                            onValueChange={field.onChange}
                            value={field.value}
                        >
                            <SelectTrigger
                                aria-invalid={fieldState.invalid}
                                id={`${formId}-status`}
                            >
                                <SelectValue>
                                    {payoutStatusLabel(field.value)}
                                </SelectValue>
                            </SelectTrigger>
                            <SelectContent>
                                {Object.values(PayoutStatus).map((status) => (
                                    <SelectItem key={status} value={status}>
                                        {payoutStatusLabel(status)}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                        <FieldError errors={[fieldState.error]} />
                    </Field>
                )}
            />
            <DateField
                control={form.control}
                label="Approved on"
                name="approvedOn"
            />
            <DateField control={form.control} label="Paid on" name="paidOn" />
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
            <Controller
                control={form.control}
                name="note"
                render={({ field, fieldState }) => (
                    <Field data-invalid={fieldState.invalid}>
                        <FieldLabel htmlFor={`${formId}-note`}>Note</FieldLabel>
                        <Textarea
                            aria-invalid={fieldState.invalid}
                            id={`${formId}-note`}
                            rows={2}
                            {...field}
                        />
                        <FieldError errors={[fieldState.error]} />
                    </Field>
                )}
            />
        </FormDialog>
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
