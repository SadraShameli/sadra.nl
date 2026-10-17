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
import {
    Field,
    FieldDescription,
    FieldError,
    FieldLabel,
} from '~/components/ui/field';
import { Input } from '~/components/ui/input';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '~/components/ui/select';
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from '~/components/ui/table';
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
                <Table>
                    <TableHeader>
                        <TableRow>
                            <TableHead>Paid on</TableHead>
                            <TableHead>Kind</TableHead>
                            <TableHead className="text-right">Amount</TableHead>
                            <TableHead className="text-right">
                                List price
                            </TableHead>
                            <TableHead className="text-right">
                                Difference
                            </TableHead>
                            <TableHead>Note</TableHead>
                            <TableHead>
                                <span className="sr-only">Actions</span>
                            </TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {rows.map((row) => {
                            const priceCheck = feeCheckRowOf(plan, row);
                            return (
                                <TableRow key={row.id}>
                                    <TableCell className="tabular-nums">
                                        {row.paidOn}
                                    </TableCell>
                                    <TableCell>
                                        {feeKindLabel(row.kind)}
                                    </TableCell>
                                    <TableCell className="text-right tabular-nums">
                                        {formatUsdCents(row.amountCents)}
                                    </TableCell>
                                    <TableCell className="text-right text-muted-foreground tabular-nums">
                                        {priceCheck.listCents === null
                                            ? NOT_APPLICABLE
                                            : formatUsdCents(
                                                  priceCheck.listCents,
                                              )}
                                    </TableCell>
                                    <TableCell className="text-right tabular-nums">
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
                                    </TableCell>
                                    <TableCell className="max-w-xs text-xs whitespace-pre-line text-muted-foreground">
                                        {row.note ?? ''}
                                    </TableCell>
                                    <TableCell>
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
                                    </TableCell>
                                </TableRow>
                            );
                        })}
                    </TableBody>
                </Table>
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
                        <Input
                            aria-invalid={fieldState.invalid}
                            id={`${formId}-paidOn`}
                            type="date"
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
