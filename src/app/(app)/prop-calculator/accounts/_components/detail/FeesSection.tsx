'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { Receipt } from 'lucide-react';
import { useId } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { z } from 'zod';

import {
    useFollowToday,
    useTodayIsoDate,
} from '~/app/(app)/prop-calculator/_components/useTodayIsoDate';
import { feeKindLabel } from '~/app/(app)/prop-calculator/accounts/_components/overview/overviewModel';
import { FormDialog } from '~/components/FormDialog';
import { LabelWithInfo } from '~/components/LabelWithInfo';
import { MissingValue } from '~/components/MissingValue';
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
    feeCheckRowOf,
    FeeKind,
    feePrefillCents,
    feePrefillDefaultKind,
    type FeePrefillPlan,
    FeePriceCheck,
    formatUsdCents,
    parseMoneyText,
    usdCentsToText,
} from '~/lib/prop-accounts';
import { feeCreateSchema } from '~/lib/schemas/propAccounts';
import { api, type RouterOutputs } from '~/trpc/react';

import {
    AddRecordButton,
    type ListQuery,
    ListQueryStatus,
} from './DetailParts';
import { nullIfBlank, parsedOrIssues } from './formParsing';
import { useRecordDialog } from './useRecordDialog';

enum FeesSectionColumn {
    Amount = 'amount',
    Difference = 'difference',
    Kind = 'kind',
    ListPrice = 'list-price',
    Note = 'note',
    PaidOn = 'paid-on',
}

type FeeRow = RouterOutputs['propAccounts']['fee']['list'][number];

const FEE_PRICE_CHECK_LABEL: Readonly<Record<FeePriceCheck, string>> = {
    [FeePriceCheck.AboveList]: 'Above list',
    [FeePriceCheck.AtList]: 'At list',
    [FeePriceCheck.Discounted]: 'Discounted',
    [FeePriceCheck.NoListPrice]: 'No list price',
};

const feeFormShape = z.object({
    amountCents: z.string(),
    kind: z.enum(FeeKind),
    note: z.string(),
    paidOn: z.string(),
});

type FeeFormValues = z.input<typeof feeFormShape>;

export function FeesSection({
    accountId,
    canRecord,
    onFailure,
    plan,
    query,
}: {
    readonly accountId: string;
    readonly canRecord: boolean;
    readonly onFailure: (error: unknown) => void;
    readonly plan: FeePrefillPlan | null;
    readonly query: ListQuery<FeeRow>;
}) {
    const dialog = useRecordDialog<FeeRow>();
    const utilities = api.useUtils();
    const remove = api.propAccounts.fee.remove.useMutation({
        onError: onFailure,
        onSuccess: () => {
            toast.success('Fee deleted');
            return utilities.propAccounts.invalidate();
        },
    });
    const rows = query.data;
    return (
        <>
            <ListQueryStatus query={query} subject="fees" />
            {rows?.length === 0 && (
                <EmptyState
                    icon={Receipt}
                    size={EmptyStateSize.Compact}
                    title="No fees recorded yet"
                />
            )}
            {rows !== undefined && rows.length > 0 && (
                <DataTable
                    columns={[
                        {
                            cell: ({ row: { original: row } }) => (
                                <div className="tabular-nums">
                                    {formatDisplayDate(row.paidOn)}
                                </div>
                            ),
                            header: 'Paid on',
                            id: FeesSectionColumn.PaidOn,
                            meta: { isRowHeader: true },
                        },
                        {
                            cell: ({ row: { original: row } }) => (
                                <>{feeKindLabel(row.kind)}</>
                            ),
                            header: 'Kind',
                            id: FeesSectionColumn.Kind,
                        },
                        {
                            cell: ({ row: { original: row } }) => (
                                <>{formatUsdCents(row.amountCents)}</>
                            ),
                            header: 'Amount',
                            id: FeesSectionColumn.Amount,
                            meta: { align: DataTableAlign.End },
                        },
                        {
                            cell: ({ row: { original: row } }) => {
                                const priceCheck = feeCheckRowOf(plan, row);
                                return (
                                    <div className="text-muted-foreground">
                                        {priceCheck.listCents === null ? (
                                            <MissingValue />
                                        ) : (
                                            formatUsdCents(priceCheck.listCents)
                                        )}
                                    </div>
                                );
                            },
                            header: 'List price',
                            id: FeesSectionColumn.ListPrice,
                            meta: { align: DataTableAlign.End },
                        },
                        {
                            cell: ({ row: { original: row } }) => {
                                const priceCheck = feeCheckRowOf(plan, row);
                                return (
                                    <>
                                        {priceCheck.differenceCents === null ? (
                                            <MissingValue />
                                        ) : (
                                            formatUsdCents(
                                                priceCheck.differenceCents,
                                            )
                                        )}
                                        <div className="text-xs text-muted-foreground">
                                            {
                                                FEE_PRICE_CHECK_LABEL[
                                                    priceCheck.check
                                                ]
                                            }
                                        </div>
                                    </>
                                );
                            },
                            header: 'Difference',
                            id: FeesSectionColumn.Difference,
                            meta: { align: DataTableAlign.End },
                        },
                        {
                            cell: ({ row: { original: row } }) => (
                                <div className="max-w-xs text-xs whitespace-pre-line text-muted-foreground">
                                    {row.note ?? ''}
                                </div>
                            ),
                            header: 'Note',
                            id: FeesSectionColumn.Note,
                        },
                        rowActionsColumn<FeeRow>({
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
                                        'This permanently removes the fee from this account and from your totals.',
                                    onDelete: () => {
                                        remove.mutate({ id: row.id });
                                    },
                                    title: 'Delete this fee?',
                                }),
                            ],
                            isPendingOf: (row) =>
                                remove.isPending &&
                                remove.variables.id === row.id,
                            labelOf: (row) =>
                                `the ${feeKindLabel(row.kind)} paid on ${formatDisplayDate(row.paidOn)}`,
                        }),
                    ]}
                    data={[...rows]}
                    isSortable={false}
                    pageSize={null}
                    rowId={(row) => row.id}
                />
            )}
            {canRecord && (
                <AddRecordButton label="Add fee" onAdd={dialog.startAdding} />
            )}
            <Dialog onOpenChange={dialog.onOpenChange} open={dialog.isOpen}>
                {dialog.isOpen && (
                    <FeeForm
                        accountId={accountId}
                        editing={dialog.editing}
                        onDone={dialog.close}
                        onFailure={onFailure}
                        plan={plan}
                    />
                )}
            </Dialog>
        </>
    );
}

function emptyFeeValues(
    plan: FeePrefillPlan | null,
    today: string,
): FeeFormValues {
    const kind =
        plan === null ? FeeKind.EvalPurchase : feePrefillDefaultKind(plan);
    return {
        amountCents: prefillText(plan, kind),
        kind,
        note: '',
        paidOn: today,
    };
}

function FeeForm({
    accountId,
    editing,
    onDone,
    onFailure,
    plan,
}: {
    readonly accountId: string;
    readonly editing: FeeRow | null;
    readonly onDone: () => void;
    readonly onFailure: (error: unknown) => void;
    readonly plan: FeePrefillPlan | null;
}) {
    const utilities = api.useUtils();
    const create = api.propAccounts.fee.create.useMutation();
    const update = api.propAccounts.fee.update.useMutation();
    const schema = feeFormSchema(accountId);
    const today = useTodayIsoDate();
    const form = useForm<FeeFormValues>({
        defaultValues:
            editing === null
                ? emptyFeeValues(plan, today)
                : {
                      amountCents: usdCentsToText(editing.amountCents),
                      kind: editing.kind,
                      note: editing.note ?? '',
                      paidOn: editing.paidOn,
                  },
        resolver: zodResolver(schema, undefined, { raw: true }),
    });
    const formId = useId();
    useFollowToday({
        isEnabled: editing === null,
        read: () => form.getValues('paidOn'),
        today,
        write: (day) => {
            form.resetField('paidOn', { defaultValue: day });
        },
    });

    const changeKind = (next: FeeKind) => {
        const current = form.getValues('amountCents');
        const previous = prefillText(plan, form.getValues('kind'));
        form.setValue('kind', next, { shouldDirty: true });
        if (current === previous || current.trim() === '') {
            form.setValue('amountCents', prefillText(plan, next));
        }
    };

    const save = async (values: FeeFormValues) => {
        const parsed = schema.safeParse(values);
        if (!parsed.success) return;
        const draft = parsed.data;
        try {
            if (editing === null) {
                await create.mutateAsync(draft);
                toast.success('Fee recorded');
            } else {
                await update.mutateAsync({
                    amountCents: draft.amountCents,
                    id: editing.id,
                    kind: draft.kind,
                    note: draft.note,
                    paidOn: draft.paidOn,
                });
                toast.success('Fee saved');
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
            submitLabel={editing === null ? 'Add fee' : 'Save fee'}
            title={editing === null ? 'Add a fee' : 'Edit fee'}
        >
            <Controller
                control={form.control}
                name="kind"
                render={({ field, fieldState }) => (
                    <Field data-invalid={fieldState.invalid}>
                        <FieldLabel htmlFor={`${formId}-kind`}>
                            Fee kind
                        </FieldLabel>
                        <Select
                            onValueChange={(next) => {
                                const kind = z
                                    .enum(FeeKind)
                                    .safeParse(next).data;
                                if (kind !== undefined) changeKind(kind);
                            }}
                            value={field.value}
                        >
                            <SelectTrigger
                                aria-invalid={fieldState.invalid}
                                id={`${formId}-kind`}
                                ref={field.ref}
                            >
                                <SelectValue>
                                    {feeKindLabel(field.value)}
                                </SelectValue>
                            </SelectTrigger>
                            <SelectContent>
                                {Object.values(FeeKind).map((kind) => (
                                    <SelectItem key={kind} value={kind}>
                                        {feeKindLabel(kind)}
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
                name="amountCents"
                render={({ field, fieldState }) => (
                    <Field data-invalid={fieldState.invalid}>
                        <LabelWithInfo
                            htmlFor={`${formId}-amountCents`}
                            info={
                                plan === null
                                    ? 'Enter what you paid. Record each subscription month as its own subscription fee.'
                                    : "Prefilled with the plan's list price for this one charge before any coupon, left blank when the plan has no such charge; enter what you actually paid. Record each subscription month, the first one too, as its own subscription fee."
                            }
                            label="Amount"
                        />
                        <Input
                            aria-invalid={fieldState.invalid}
                            id={`${formId}-amountCents`}
                            inputMode="decimal"
                            placeholder="0.00"
                            {...field}
                        />
                        <FieldError errors={[fieldState.error]} />
                    </Field>
                )}
            />
            <Controller
                control={form.control}
                name="paidOn"
                render={({ field, fieldState }) => (
                    <Field data-invalid={fieldState.invalid}>
                        <FieldLabel htmlFor={`${formId}-paidOn`}>
                            Paid on
                        </FieldLabel>
                        <IsoDatePicker
                            aria-invalid={fieldState.invalid}
                            id={`${formId}-paidOn`}
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

function feeFormSchema(accountId: string) {
    return feeFormShape.transform((values, context) => {
        const amount = parseMoneyText(values.amountCents);
        if (amount.kind !== EntryTextKind.Valid) {
            context.addIssue({
                code: 'custom',
                message:
                    amount.kind === EntryTextKind.Invalid
                        ? amount.message
                        : 'Enter the amount you paid',
                path: ['amountCents'],
            });
            return z.NEVER;
        }
        const parsed = feeCreateSchema.safeParse({
            accountId,
            amountCents: amount.cents,
            kind: values.kind,
            note: nullIfBlank(values.note),
            paidOn: values.paidOn,
        });
        return parsedOrIssues(parsed, context);
    });
}

function prefillText(plan: FeePrefillPlan | null, kind: FeeKind): string {
    const cents = plan === null ? null : feePrefillCents(plan, kind);
    return cents === null ? '' : usdCentsToText(cents);
}
