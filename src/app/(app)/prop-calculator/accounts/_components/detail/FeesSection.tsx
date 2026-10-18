'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { Pencil } from 'lucide-react';
import { useEffect, useId } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { z } from 'zod';

import {
    useFollowToday,
    useTodayIsoDate,
} from '~/app/(app)/prop-calculator/_components/useTodayIsoDate';
import { feeKindLabel } from '~/app/(app)/prop-calculator/accounts/_components/overview/overviewModel';
import { Button } from '~/components/ui/button';
import { DataTable, DataTableAlign } from '~/components/ui/data-table';
import {
    Field,
    FieldDescription,
    FieldError,
    FieldLabel,
} from '~/components/ui/field';
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
import { NOT_APPLICABLE } from '~/lib/format';
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
    type ListQuery,
    ListQueryStatus,
    RemoveRecordDialog,
} from './DetailParts';
import { nullIfBlank, parsedOrIssues } from './formParsing';
import { useRowEditing } from './useRowEditing';

enum FeesSectionColumn {
    Actions = 'actions',
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
    const { editing, startEditing, stopEditing } = useRowEditing<FeeRow>();
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
                <p className="text-sm text-muted-foreground">
                    No fees recorded yet.
                </p>
            )}
            {rows !== undefined && rows.length > 0 && (
                <DataTable
                    columns={[
                        {
                            cell: ({ row: { original: row } }) => (
                                <div className="tabular-nums">{row.paidOn}</div>
                            ),
                            header: 'Paid on',
                            id: FeesSectionColumn.PaidOn,
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
                                        {priceCheck.listCents === null
                                            ? NOT_APPLICABLE
                                            : formatUsdCents(
                                                  priceCheck.listCents,
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
                                        {priceCheck.differenceCents === null
                                            ? NOT_APPLICABLE
                                            : formatUsdCents(
                                                  priceCheck.differenceCents,
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
                        {
                            cell: ({ row: { original: row } }) => (
                                <>
                                    <div className="flex justify-end gap-1">
                                        {canRecord && (
                                            <Button
                                                aria-label={`Edit the ${feeKindLabel(row.kind)} paid on ${row.paidOn}`}
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
                                            description="This permanently removes the fee from this account and from your totals."
                                            isPending={remove.isPending}
                                            onConfirm={() => {
                                                remove.mutate({
                                                    id: row.id,
                                                });
                                            }}
                                            title="Delete this fee?"
                                            triggerLabel={`Delete the ${feeKindLabel(row.kind)} paid on ${row.paidOn}`}
                                        />
                                    </div>
                                </>
                            ),
                            header: () => (
                                <>
                                    <span className="sr-only">Actions</span>
                                </>
                            ),
                            id: FeesSectionColumn.Actions,
                        },
                    ]}
                    data={[...rows]}
                    isSortable={false}
                    pageSize={null}
                    rowId={(row) => row.id}
                />
            )}
            {canRecord && (
                <FeeForm
                    accountId={accountId}
                    editing={editing}
                    key={editing?.id ?? 'new'}
                    onDone={stopEditing}
                    onFailure={onFailure}
                    plan={plan}
                />
            )}
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
    const { setFocus } = form;
    const isEditing = editing !== null;
    useFollowToday({
        isEnabled: !isEditing,
        read: () => form.getValues('paidOn'),
        today,
        write: (day) => {
            form.resetField('paidOn', { defaultValue: day });
        },
    });

    useEffect(() => {
        if (isEditing) setFocus('kind');
    }, [isEditing, setFocus]);

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
            form.reset(emptyFeeValues(plan, today));
            onDone();
        } catch (error) {
            onFailure(error);
        } finally {
            await utilities.propAccounts.invalidate();
        }
    };

    return (
        <form
            aria-label={editing === null ? 'Add a fee' : 'Edit fee'}
            className="grid gap-4 md:grid-cols-2 lg:grid-cols-3"
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
                                <SelectValue />
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
                        <FieldLabel htmlFor={`${formId}-amountCents`}>
                            Amount
                        </FieldLabel>
                        <Input
                            aria-invalid={fieldState.invalid}
                            id={`${formId}-amountCents`}
                            inputMode="decimal"
                            placeholder="0.00"
                            {...field}
                        />
                        <FieldDescription>
                            {plan === null
                                ? 'Enter what you paid. Record each subscription month as its own subscription fee.'
                                : "Prefilled with the plan's list price for this one charge before any coupon, left blank when the plan has no such charge; enter what you actually paid. Record each subscription month, the first one too, as its own subscription fee."}
                        </FieldDescription>
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
                    <Field
                        className="md:col-span-2 lg:col-span-3"
                        data-invalid={fieldState.invalid}
                    >
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
            <div className="flex flex-wrap items-center gap-2 md:col-span-2 lg:col-span-3">
                <Button
                    disabled={create.isPending || update.isPending}
                    type="submit"
                >
                    {editing === null ? 'Add fee' : 'Save fee'}
                </Button>
                {editing !== null && (
                    <Button onClick={onDone} type="button" variant="ghost">
                        Cancel edit
                    </Button>
                )}
            </div>
        </form>
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
